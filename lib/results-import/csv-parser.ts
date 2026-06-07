// Parser for race results CSVs exported from timing systems.
//
// Format assumptions (validated against 6 sample files):
//   Row 0  — race title, may include trailing year: "Salomon Glen Coe Skyline 2015"
//   Row 1  — headers; some column names repeat (Overall, Gender, Class, Group)
//             First occurrence = rank/position columns; second = value columns
//   Row 2+ — result rows; retired/DNS rows have an empty Overall (first) column
//   Files may have a UTF-8 BOM (EF BB BF / "﻿")

export interface ParsedImport {
  raceName: string;       // title with trailing year stripped
  raceYear: number;
  dedupSlug: string;      // slugified raceName — used for race dedup on import
  hasTitleRow: boolean;   // true if row 0 of the file is a race title (not headers)
  rows: ParsedRow[];
  parseErrors: string[];
}

export interface ParsedRow {
  position: number | null;
  full_name: string;
  bib_number: string | null;
  gender: "Male" | "Female" | null;
  age_group: string | null;
  result_status: "FINISHED" | "DNF" | "DNS" | "UNKNOWN";
  finish_seconds: number | null;
  result_year: number;
  additional_data: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseLines(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",").map((c) => c.trim()));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Strip trailing 4-digit year from a race title, e.g. "Glen Coe Skyline 2015" → "Glen Coe Skyline". */
function stripTrailingYear(title: string): { name: string; year: number | null } {
  const m = title.match(/^(.*?)\s+(\d{4})\s*$/);
  if (m) {
    const y = parseInt(m[2], 10);
    if (y >= 1980 && y <= 2100) return { name: m[1].trim(), year: y };
  }
  return { name: title.trim(), year: null };
}

/**
 * Derive a clean race name and year from a filename.
 * e.g. "2026_Shakespeare_Marathon_-_26th_April_2026.csv" → { name: "Shakespeare Marathon", year: 2026 }
 */
function nameFromFilename(filename: string): { name: string; year: number | null } {
  // Strip extension
  let base = filename.replace(/\.[^.]+$/, "");
  // Strip common trailing suffixes added by timing systems (e.g. "_results", "_entries")
  base = base.replace(/[_\-\s]+(results|entries|export|data)$/i, "");
  // Replace underscores with spaces, collapse runs of spaces/dashes used as separators
  const spaced = base.replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
  // Strip leading 4-digit year (e.g. "2026 - " or "2026 ")
  const noLeadingYear = spaced.replace(/^\d{4}\s*[-–]?\s*/, "");
  // Strip trailing year via existing helper
  const { name: withPossibleDateFrag, year } = stripTrailingYear(noLeadingYear);
  // Strip trailing date fragment left over after year removal, e.g. "- 26th April" or "26 April"
  const name = withPossibleDateFrag
    .replace(/\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?\s+\w+\s*$/, "")
    .replace(/\s*[-–]\s*$/, "")
    .trim();
  return { name: name || base, year };
}

/** Extract leading 4-digit year from filename, e.g. "2015_Race_Name.csv" → 2015. */
function yearFromFilename(filename: string): number | null {
  const m = filename.match(/^(\d{4})[_\-]/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 1980 && y <= 2100) return y;
  }
  return null;
}

// Timing systems use various placeholder strings when no club is entered.
const CLUB_PLACEHOLDERS = new Set([
  "(no club)", "no club", "none", "n/a", "na", "-", "--",
  "unattached", "unaffiliated", "independent",
]);

function normaliseClub(raw: string): string | null {
  const v = raw.trim();
  return v && !CLUB_PLACEHOLDERS.has(v.toLowerCase()) ? v : null;
}

// Valid UK-style age group values. Anything else (race category labels, distances, etc.)
// is stored in additional_data["Race Category"] instead and not treated as an age group.
const AGE_GROUP_RE = /^(Senior|Junior|Open|U\d{1,2}|[MF]?V?\d{2}(\+|[-]\d{2})?|[MF][SJ]|[MW]?[SJ])$/i;

function normalizeGender(raw: string): "Male" | "Female" | null {
  const v = raw.trim().toLowerCase();
  if (["male", "men", "m"].includes(v)) return "Male";
  if (["female", "women", "f", "w"].includes(v)) return "Female";
  return null;
}

/** Convert "HH:MM:SS" to total seconds. Returns null for missing or zero times. */
function parseTime(raw: string): number | null {
  const m = raw.trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const secs = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return secs > 0 ? secs : null;
}

// ── Header mapping ────────────────────────────────────────────────────────────
// Several columns appear twice. Strategy: when a name repeats, the SECOND
// occurrence is the value column (first is the rank/position column).

interface ColMap {
  position: number | null;           // Overall (1st occurrence)
  name: number | null;               // Name
  bib: number | null;                // Bib
  nation: number | null;             // Nation
  team: number | null;               // Team
  genderValue: number | null;        // Gender (2nd occurrence = 'Male'/'Female')
  ageGroup: number | null;           // Class (2nd occurrence = class name)
  lastLocation: number | null;       // Last Location
  time: number | null;               // Time (HH:MM:SS)
  timeSeconds: number | null;        // Pre-computed time in seconds (e.g. race_time_seconds)
  status: number | null;             // Explicit status column (FINISHER/DNF/DNS)
  // "Timed Out" can appear in the Class (2nd) column
}

// Known header keywords used to detect if row 0 is a headers row (no title row present).
const HEADER_KEYWORDS = new Set(["name", "full_name", "overall", "pos", "position", "bib", "gender", "sex", "class", "category", "time", "chip", "gun", "race_time", "overall_time", "status"]);

function looksLikeHeaderRow(row: string[]): boolean {
  return row.some((cell) => HEADER_KEYWORDS.has(cell.toLowerCase().trim()));
}

function buildColMap(headers: string[]): ColMap {
  const seen: Record<string, number> = {};
  const map: ColMap = {
    position: null,
    name: null,
    bib: null,
    nation: null,
    team: null,
    genderValue: null,
    ageGroup: null,
    lastLocation: null,
    time: null,
    timeSeconds: null,
    status: null,
  };

  headers.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    const occurrence = (seen[key] ?? 0) + 1;
    seen[key] = occurrence;

    // Position aliases: overall (1st), pos, position
    if ((key === "overall" || key === "pos" || key === "position") && occurrence === 1) map.position = i;
    else if (key === "name" || key === "full_name" || key === "full name") map.name = i;
    else if (key === "bib") map.bib = i;
    else if (key === "nation") map.nation = i;
    // Club/team aliases
    else if (key === "team" || key === "club") map.team = i;
    // Gender aliases: gender (repeat logic), sex
    else if (key === "gender" && occurrence === 2) map.genderValue = i;
    else if (key === "gender" && occurrence === 1) {
      if (map.genderValue === null) map.genderValue = i;
    }
    else if (key === "sex" && map.genderValue === null) map.genderValue = i;
    // 2nd Class = age group / category name
    else if ((key === "class" || key === "category" || key === "cat") && occurrence === 2) map.ageGroup = i;
    else if ((key === "class" || key === "category" || key === "cat") && occurrence === 1) {
      if (map.ageGroup === null) map.ageGroup = i;
    }
    else if (key === "last location" || key === "last_point") map.lastLocation = i;
    // Time aliases: HH:MM:SS formats — prefer first match
    else if ((key === "time" || key === "chip" || key === "chip time" || key === "net" || key === "net time" || key === "race_time" || key === "gun_time" || key === "finish_time" || key === "finish time" || key === "gun time" || key === "overall_time") && map.time === null) map.time = i;
    // Pre-computed seconds (e.g. race_time_seconds) — use as fallback if no HH:MM:SS time
    else if ((key === "race_time_seconds" || key === "finish_time_seconds" || key === "gun_time_seconds") && map.timeSeconds === null) map.timeSeconds = i;
    // Explicit status column (e.g. FINISHER / DNF / DNS)
    else if ((key === "status" || key === "result_status") && map.status === null) map.status = i;
  });

  return map;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseCsvFile(filename: string, rawText: string): ParsedImport {
  const parseErrors: string[] = [];
  const text = stripBom(rawText);
  const lines = parseLines(text).filter((l) => l.some((c) => c !== ""));

  if (lines.length < 1) {
    return { raceName: filename, raceYear: new Date().getFullYear(), dedupSlug: slugify(filename), hasTitleRow: false, rows: [], parseErrors: ["File is empty or has fewer than 2 rows"] };
  }

  // Auto-detect: if row 0 looks like a header row (no title row present), use filename as title.
  const hasTitleRow = !looksLikeHeaderRow(lines[0]);

  let raceName: string;
  let titleYear: number | null;
  if (hasTitleRow) {
    const rawTitle = lines[0][0] ?? filename;
    ({ name: raceName, year: titleYear } = stripTrailingYear(rawTitle));
  } else {
    ({ name: raceName, year: titleYear } = nameFromFilename(filename));
  }
  const filenameYear = yearFromFilename(filename);
  const raceYear = titleYear ?? filenameYear ?? new Date().getFullYear();
  const dedupSlug = `${slugify(raceName)}-${raceYear}`;

  // Row 1 (or 0 if no title): headers
  const headerRowIndex = hasTitleRow ? 1 : 0;
  if (lines.length < headerRowIndex + 2) {
    return { raceName, raceYear, dedupSlug, hasTitleRow, rows: [], parseErrors: ["File is empty or has fewer than 2 rows"] };
  }
  const headers = lines[headerRowIndex];
  const colMap = buildColMap(headers);

  if (colMap.name === null) {
    parseErrors.push("Could not find a 'Name' column in headers");
    return { raceName, raceYear, dedupSlug, hasTitleRow, rows: [], parseErrors };
  }

  const rows: ParsedRow[] = [];

  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const cells = lines[i];
    if (cells.every((c) => c === "")) continue;

    const get = (idx: number | null) => (idx !== null && idx < cells.length ? cells[idx] : "");

    const rawName = colMap.name !== null ? get(colMap.name) : "";
    if (!rawName) continue; // skip rows with no name

    const rawOverall = get(colMap.position);
    const rawTime = get(colMap.time);
    const rawLocation = get(colMap.lastLocation);
    const rawAgeGroup = get(colMap.ageGroup);

    // Status determination
    let result_status: ParsedRow["result_status"] = "UNKNOWN";
    const hasPosition = rawOverall !== "" && !isNaN(parseInt(rawOverall, 10));
    const timedOut = rawAgeGroup.toLowerCase() === "timed out";

    const rawStatusVal = get(colMap.status).toUpperCase().trim();
    if (rawStatusVal === "FINISHER" || rawStatusVal === "FINISHED") {
      result_status = "FINISHED";
    } else if (rawStatusVal === "DNF") {
      result_status = "DNF";
    } else if (rawStatusVal === "DNS") {
      result_status = "DNS";
    } else if (hasPosition) {
      result_status = "FINISHED";
    } else if (timedOut) {
      result_status = "DNF";
    } else if (!hasPosition && rawLocation.toLowerCase() === "start") {
      result_status = "DNS";
    } else if (!hasPosition) {
      result_status = "DNF";
    }

    // Finish time — prefer pre-computed seconds column, fall back to HH:MM:SS parse
    let finish_seconds: number | null = null;
    if (result_status === "FINISHED") {
      const rawSecs = get(colMap.timeSeconds);
      if (rawSecs !== "") {
        const parsed = parseInt(rawSecs, 10);
        finish_seconds = isNaN(parsed) || parsed <= 0 ? null : parsed;
      }
      if (finish_seconds === null) finish_seconds = parseTime(rawTime);
    }

    // Additional data: collect all "extra" columns not in the core set
    const coreIndices = new Set([
      colMap.position,
      colMap.name,
      colMap.bib,
      colMap.genderValue,
      colMap.ageGroup,
      colMap.time,
      colMap.timeSeconds,
      colMap.status,
    ].filter((x): x is number => x !== null));

    const additional_data: Record<string, string> = {};
    if (colMap.nation !== null) {
      const v = get(colMap.nation);
      if (v) additional_data["Nation"] = v;
    }
    if (colMap.team !== null) {
      const v = normaliseClub(get(colMap.team));
      if (v) additional_data["Team"] = v;
    }
    if (colMap.lastLocation !== null) {
      const v = get(colMap.lastLocation);
      if (v && v.toLowerCase() !== "finish") additional_data["Last Location"] = v;
    }
    // Collect any remaining header columns not already captured
    headers.forEach((h, idx) => {
      if (coreIndices.has(idx)) return;
      if (["nation", "team", "club", "last location", "last_point", "sex"].includes(h.toLowerCase().trim())) return;
      const v = cells[idx]?.trim();
      if (v) additional_data[h] = v;
    });

    // Validate age group — timing systems often put race-category labels (e.g. "Marathon",
    // "110 Male", "42km") in the Class/Category column. Store those in Race Category instead.
    const rawAgeGroupTrimmed = rawAgeGroup.trim();
    const isValidAgeGroup = rawAgeGroupTrimmed !== "" &&
      rawAgeGroupTrimmed.toLowerCase() !== "timed out" &&
      AGE_GROUP_RE.test(rawAgeGroupTrimmed);
    if (rawAgeGroupTrimmed && !isValidAgeGroup && rawAgeGroupTrimmed.toLowerCase() !== "timed out") {
      additional_data["Race Category"] = rawAgeGroupTrimmed;
    }

    rows.push({
      position: hasPosition ? parseInt(rawOverall, 10) : null,
      full_name: rawName,
      bib_number: get(colMap.bib) || null,
      gender: normalizeGender(get(colMap.genderValue)),
      age_group: isValidAgeGroup ? rawAgeGroupTrimmed : null,
      result_status,
      finish_seconds,
      result_year: raceYear,
      additional_data,
    });
  }

  return { raceName, raceYear, dedupSlug, hasTitleRow, rows, parseErrors };
}

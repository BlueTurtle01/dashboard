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
  return text.startsWith("﻿") ? text.slice(1) : text;
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

/** Extract leading 4-digit year from filename, e.g. "2015_Race_Name.csv" → 2015. */
function yearFromFilename(filename: string): number | null {
  const m = filename.match(/^(\d{4})[_\-]/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y >= 1980 && y <= 2100) return y;
  }
  return null;
}

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
  time: number | null;               // Time
  // "Timed Out" can appear in the Class (2nd) column
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
  };

  headers.forEach((h, i) => {
    const key = h.toLowerCase().trim();
    const occurrence = (seen[key] ?? 0) + 1;
    seen[key] = occurrence;

    if (key === "overall" && occurrence === 1) map.position = i;
    else if (key === "name") map.name = i;
    else if (key === "bib") map.bib = i;
    else if (key === "nation") map.nation = i;
    else if (key === "team") map.team = i;
    // 2nd Gender = actual gender value
    else if (key === "gender" && occurrence === 2) map.genderValue = i;
    // Only 1 Gender column → it IS the value
    else if (key === "gender" && occurrence === 1) {
      // May be overwritten if a 2nd Gender col appears later — handled by the 2nd case
      if (map.genderValue === null) map.genderValue = i;
    }
    // 2nd Class = age group / category name
    else if (key === "class" && occurrence === 2) map.ageGroup = i;
    else if (key === "class" && occurrence === 1) {
      if (map.ageGroup === null) map.ageGroup = i;
    }
    else if (key === "last location") map.lastLocation = i;
    else if (key === "time") map.time = i;
  });

  return map;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function parseCsvFile(filename: string, rawText: string): ParsedImport {
  const parseErrors: string[] = [];
  const text = stripBom(rawText);
  const lines = parseLines(text).filter((l) => l.some((c) => c !== ""));

  if (lines.length < 2) {
    return { raceName: filename, raceYear: new Date().getFullYear(), dedupSlug: slugify(filename), rows: [], parseErrors: ["File is empty or has fewer than 2 rows"] };
  }

  // Row 0: race title
  const rawTitle = lines[0][0] ?? filename;
  const { name: raceName, year: titleYear } = stripTrailingYear(rawTitle);
  const filenameYear = yearFromFilename(filename);
  const raceYear = titleYear ?? filenameYear ?? new Date().getFullYear();
  const dedupSlug = `${slugify(raceName)}-${raceYear}`;

  // Row 1: headers
  const headers = lines[1];
  const colMap = buildColMap(headers);

  if (colMap.name === null) {
    parseErrors.push("Could not find a 'Name' column in headers");
    return { raceName, raceYear, dedupSlug, rows: [], parseErrors };
  }

  const rows: ParsedRow[] = [];

  for (let i = 2; i < lines.length; i++) {
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

    if (hasPosition) {
      result_status = "FINISHED";
    } else if (timedOut) {
      result_status = "DNF";
    } else if (!hasPosition && rawLocation.toLowerCase() === "start") {
      result_status = "DNS";
    } else if (!hasPosition) {
      result_status = "DNF";
    }

    // Finish time — only meaningful for finishers
    const finish_seconds = result_status === "FINISHED" ? parseTime(rawTime) : null;

    // Additional data: collect all "extra" columns not in the core set
    const coreIndices = new Set([
      colMap.position,
      colMap.name,
      colMap.bib,
      colMap.genderValue,
      colMap.ageGroup,
      colMap.time,
    ].filter((x): x is number => x !== null));

    const additional_data: Record<string, string> = {};
    if (colMap.nation !== null) {
      const v = get(colMap.nation);
      if (v) additional_data["Nation"] = v;
    }
    if (colMap.team !== null) {
      const v = get(colMap.team);
      if (v) additional_data["Team"] = v;
    }
    if (colMap.lastLocation !== null) {
      const v = get(colMap.lastLocation);
      if (v && v.toLowerCase() !== "finish") additional_data["Last Location"] = v;
    }
    // Collect any remaining header columns not already captured
    headers.forEach((h, idx) => {
      if (coreIndices.has(idx)) return;
      if (["nation", "team", "last location"].includes(h.toLowerCase().trim())) return;
      const v = cells[idx]?.trim();
      if (v) additional_data[h] = v;
    });

    rows.push({
      position: hasPosition ? parseInt(rawOverall, 10) : null,
      full_name: rawName,
      bib_number: get(colMap.bib) || null,
      gender: normalizeGender(get(colMap.genderValue)),
      age_group: rawAgeGroup && rawAgeGroup.toLowerCase() !== "timed out" ? rawAgeGroup : null,
      result_status,
      finish_seconds,
      result_year: raceYear,
      additional_data,
    });
  }

  return { raceName, raceYear, dedupSlug, rows, parseErrors };
}

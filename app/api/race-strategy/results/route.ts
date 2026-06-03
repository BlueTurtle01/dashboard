/**
 * POST /api/race-strategy/results
 *
 * Analyses race_results data for a given race and target finish time,
 * returning percentile context, pacing guidance from split data, and
 * late-race fade analysis. All heavy computation runs server-side so
 * the client only receives pre-digested stats.
 *
 * Body: { race_id, target_minutes, gender?, age? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/* ── Types ── */
interface RawResult {
  finish_seconds: number;
  gender: string | null;
  age_group: string | null;
  position: number | null;
  additional_data: Record<string, string> | null;
}

/* ── Helpers ── */
function parseTimeHMS(s: string): number | null {
  const parts = s.split(":");
  if (parts.length !== 3) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const sec = parseInt(parts[2], 10);
  if (isNaN(h) || isNaN(m) || isNaN(sec)) return null;
  return h * 3600 + m * 60 + sec;
}

function formatMMSS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// Keys that are finish times or metadata — never intermediate splits
const NON_SPLIT_KEYS = new Set([
  "gap", "club", "Club", "gender_total", "age_group_total",
  "gender_position", "age_group_position",
  // Finish time fields — ratios ≈ 1.0, should be excluded anyway but listed explicitly
  "chip_time", "gun_time", "finish_time", "net_time", "clock_time",
  // Very early checkpoint — ratio too low to be halfway (~0.15-0.25)
  // pen_y and similar early splits are excluded by the fraction range check
]);

/**
 * Identifies which additional_data key contains an elapsed halfway-ish split.
 * Looks for a time-string key (HH:MM:SS) whose value is consistently 35–65%
 * of each runner's finish_seconds. chip_time, gun_time, and other non-split
 * keys are explicitly excluded.
 */
function identifyHalfwaySplit(results: RawResult[]): string | null {
  const sample = results.filter(r => r.additional_data).slice(0, 150);
  if (sample.length === 0) return null;

  const keys = Object.keys(sample[0].additional_data ?? {}).filter(
    k => !NON_SPLIT_KEYS.has(k)
  );

  let bestKey: string | null = null;
  let bestScore = 0;

  for (const key of keys) {
    const fractions: number[] = [];
    for (const r of sample) {
      const raw = r.additional_data?.[key];
      if (!raw) continue;
      const secs = parseTimeHMS(raw);
      if (secs === null || r.finish_seconds <= 0) continue;
      const frac = secs / r.finish_seconds;
      // Tighter range (0.35–0.65) to exclude early checkpoints like Pen y Pass (~0.15)
      // and late splits (>0.65)
      if (frac >= 0.35 && frac <= 0.65) fractions.push(frac);
    }
    const score = fractions.length;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }

  return bestScore > sample.length * 0.4 ? bestKey : null;
}

/**
 * Identifies the latest elapsed intermediate split (0.65–0.95 of finish time).
 * chip_time and gun_time are explicitly excluded.
 */
function identifyLateSplit(results: RawResult[], halfwayKey: string | null): string | null {
  const sample = results.filter(r => r.additional_data).slice(0, 150);
  if (sample.length === 0) return null;

  const keys = Object.keys(sample[0].additional_data ?? {}).filter(
    k => !NON_SPLIT_KEYS.has(k) && k !== halfwayKey
  );

  let bestKey: string | null = null;
  let bestScore = 0;

  for (const key of keys) {
    const fractions: number[] = [];
    for (const r of sample) {
      const raw = r.additional_data?.[key];
      if (!raw) continue;
      const secs = parseTimeHMS(raw);
      if (secs === null || r.finish_seconds <= 0) continue;
      const frac = secs / r.finish_seconds;
      if (frac >= 0.65 && frac <= 0.95) fractions.push(frac);
    }
    const score = fractions.length;
    if (score > bestScore) { bestScore = score; bestKey = key; }
  }

  return bestScore > sample.length * 0.3 ? bestKey : null;
}

/**
 * Maps a numeric age + gender to the age group label used in this race's data.
 *
 * Handles multiple naming conventions:
 *   - Gender-prefixed: MOpen, M40, M45 … / FOpen, F35, F40, F45 …
 *   - Generic suffixed: OPEN, 40+, 45+, 35+ …
 *   - Veteran prefix: V40, V45 …
 *
 * Female veteran categories start at 35 (not 40) in many UK races.
 * Male veteran categories start at 40.
 */
function mapAgeToGroup(age: number, gender: string | undefined, distinctGroups: string[]): string | null {
  const gPrefix  = gender === "Female" ? "F" : gender === "Male" ? "M" : "";
  const isFemale = gender === "Female";

  // Female categories typically start a veteran bracket at 35; males at 40
  const bracketStarts = isFemale
    ? [80, 75, 70, 65, 60, 55, 50, 45, 40, 35]
    : [80, 75, 70, 65, 60, 55, 50, 45, 40];

  const bracket = bracketStarts.find(b => age >= b) ?? 0;

  if (bracket === 0) {
    // Open category
    const openCandidates = [
      `${gPrefix}Open`, `${gPrefix}OPEN`,
      "OPEN", "Open", "Senior", "U40",
    ];
    return distinctGroups.find(g => openCandidates.includes(g)) ?? null;
  }

  // Veteran category — try gender-prefixed forms first, then generic
  const candidates = [
    `${gPrefix}${bracket}`,            // "M40", "F35"
    `${bracket}+`,                     // "40+", "35+"
    `V${bracket}`,                     // "V40"
    `${bracket}-${bracket + 4}`,       // "40-44"
    `${gPrefix}${bracket}-${bracket + 4}`, // "M40-44"
    String(bracket),                   // "40"
  ];

  for (const c of candidates) {
    if (distinctGroups.includes(c)) return c;
  }
  return null;
}

/** Human-readable label for a split key. */
function splitLabel(key: string): string {
  if (key === "13_miles") return "Halfway (13 miles)";
  if (key === "23_miles") return "23 miles";
  if (key.toLowerCase().includes("half")) return "Halfway";
  return key.replace(/_/g, " ");
}

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as {
      race_id?: string;
      target_minutes?: number;
      gender?: string;
      age?: number;
    };
    const { race_id, target_minutes, gender, age } = body;

    if (!race_id || !target_minutes || target_minutes <= 0) {
      return NextResponse.json({ error: "race_id and target_minutes required" }, { status: 400 });
    }

    const supabase = await createClient();
    const targetSecs = target_minutes * 60;

    // ── 1. Find latest year with meaningful result count ──────────────────────
    const { data: yearRows } = await supabase
      .from("race_results")
      .select("result_year")
      .eq("race_id", race_id)
      .gt("finish_seconds", 0)
      .order("result_year", { ascending: false })
      .limit(1);

    if (!yearRows?.length) {
      return NextResponse.json({ has_data: false });
    }
    const latestYear = (yearRows[0] as { result_year: number }).result_year;

    // ── 2. Fetch all finishers for that year ──────────────────────────────────
    const { data: rawRows } = await supabase
      .from("race_results")
      .select("finish_seconds, gender, age_group, position, additional_data")
      .eq("race_id", race_id)
      .eq("result_year", latestYear)
      .gt("finish_seconds", 0)
      .order("finish_seconds");

    const results = (rawRows ?? []) as RawResult[];
    if (results.length === 0) return NextResponse.json({ has_data: false });

    // ── 3. Overall percentile ─────────────────────────────────────────────────
    const totalFinishers = results.length;
    const fasterCount    = results.filter(r => r.finish_seconds < targetSecs).length;
    const overallPos     = fasterCount + 1;
    // "top X%" = top fraction = position / total
    const overallTopPct  = Math.round((overallPos / totalFinishers) * 100);

    // ── 4. Gender stats ───────────────────────────────────────────────────────
    let genderPosition: number | null = null;
    let genderTotal: number | null    = null;
    let genderTopPct: number | null   = null;

    if (gender) {
      const genderFinishers = results.filter(r => r.gender === gender);
      genderTotal    = genderFinishers.length;
      const gFaster  = genderFinishers.filter(r => r.finish_seconds < targetSecs).length;
      genderPosition = gFaster + 1;
      genderTopPct   = Math.round((genderPosition / genderTotal) * 100);
    }

    // ── 5. Age group stats ────────────────────────────────────────────────────
    let ageGroupLabel: string | null    = null;
    let ageGroupPosition: number | null = null;
    let ageGroupTotal: number | null    = null;
    let ageGroupTopPct: number | null   = null;

    if (age != null) {
      const distinctGroups = [...new Set(results.map(r => r.age_group).filter(Boolean))] as string[];
      ageGroupLabel = mapAgeToGroup(age, gender, distinctGroups);
      if (ageGroupLabel && gender) {
        // Filter by both gender AND age_group for accurate category position
        const catFinishers = results.filter(r => r.gender === gender && r.age_group === ageGroupLabel);
        ageGroupTotal    = catFinishers.length;
        const catFaster  = catFinishers.filter(r => r.finish_seconds < targetSecs).length;
        ageGroupPosition = catFaster + 1;
        ageGroupTopPct   = Math.round((ageGroupPosition / ageGroupTotal) * 100);
      } else if (ageGroupLabel) {
        const catFinishers = results.filter(r => r.age_group === ageGroupLabel);
        ageGroupTotal    = catFinishers.length;
        const catFaster  = catFinishers.filter(r => r.finish_seconds < targetSecs).length;
        ageGroupPosition = catFaster + 1;
        ageGroupTopPct   = Math.round((ageGroupPosition / ageGroupTotal) * 100);
      }
    }

    // ── 6. Identify split keys ────────────────────────────────────────────────
    const halfwayKey = identifyHalfwaySplit(results);
    const lateKey    = identifyLateSplit(results, halfwayKey);

    // ── 7. Halfway pacing analysis ────────────────────────────────────────────
    let halfwayAnalysis: {
      key: string; label: string;
      recommended_seconds: number; aggressive_seconds: number;
      typical_ratio: number; pct_positive_split: number; band_size: number;
    } | null = null;

    if (halfwayKey) {
      // Band: ±12% of target finish time
      const bandResults = results.filter(r => {
        const halfSecs = parseTimeHMS(r.additional_data?.[halfwayKey] ?? "");
        return halfSecs !== null &&
          Math.abs(r.finish_seconds - targetSecs) / targetSecs < 0.12;
      });

      if (bandResults.length >= 10) {
        const ratios: number[] = [];
        let positiveSplits = 0;

        for (const r of bandResults) {
          const halfSecs = parseTimeHMS(r.additional_data?.[halfwayKey] ?? "");
          if (halfSecs === null) continue;
          const ratio = halfSecs / r.finish_seconds;
          ratios.push(ratio);
          // Positive split = first half faster than 49% of total (went out too hard)
          if (ratio < 0.49) positiveSplits++;
        }

        const typicalRatio   = median(ratios);
        const aggressiveRatio = percentile(ratios, 15); // 15th pct = went out hard

        halfwayAnalysis = {
          key: halfwayKey,
          label: splitLabel(halfwayKey),
          recommended_seconds: Math.round(targetSecs * typicalRatio / 60) * 60,
          aggressive_seconds:  Math.round(targetSecs * aggressiveRatio / 60) * 60,
          typical_ratio:       Math.round(typicalRatio * 1000) / 1000,
          pct_positive_split:  Math.round((positiveSplits / ratios.length) * 100),
          band_size:           bandResults.length,
        };
      }
    }

    // ── 8. Late-race fade analysis ────────────────────────────────────────────
    let lateAnalysis: {
      key: string; label: string;
      avg_final_section_minutes: number;
      avg_fade_pct: number;
      controlled_pct: number;
      final_dist_note: string;
    } | null = null;

    if (lateKey && halfwayKey) {
      const bandResults = results.filter(r => {
        const lateSecs = parseTimeHMS(r.additional_data?.[lateKey] ?? "");
        return lateSecs !== null &&
          Math.abs(r.finish_seconds - targetSecs) / targetSecs < 0.12;
      });

      if (bandResults.length >= 10) {
        const finalSectionTimes: number[] = [];
        const fadePcts: number[] = [];

        for (const r of bandResults) {
          const halfSecs = parseTimeHMS(r.additional_data?.[halfwayKey] ?? "");
          const lateSecs = parseTimeHMS(r.additional_data?.[lateKey] ?? "");
          if (halfSecs === null || lateSecs === null) continue;

          const finalSecs = r.finish_seconds - lateSecs;
          if (finalSecs <= 0) continue;
          finalSectionTimes.push(finalSecs);

          // Fade = how much slower the final section is vs the pace per second across the race
          const avgPace = r.finish_seconds; // total seconds (proxy; we care about the ratio)
          const firstPace = halfSecs;       // first-half time
          const finalPace = finalSecs;
          // Expressed as: final section is X% slower than first-half pace adjusted for distance
          // Simpler: compare final section seconds to first-half seconds as ratio
          const lateToFirstRatio = finalPace / firstPace;
          fadePcts.push((lateToFirstRatio - 1) * 100);
          void avgPace;
        }

        const avgFinalMins = median(finalSectionTimes) / 60;
        const avgFadePct   = median(fadePcts);
        const controlled   = fadePcts.filter(f => f < 15).length;
        const controlledPct = Math.round((controlled / fadePcts.length) * 100);

        lateAnalysis = {
          key: lateKey,
          label: splitLabel(lateKey),
          avg_final_section_minutes: Math.round(avgFinalMins * 10) / 10,
          avg_fade_pct: Math.round(avgFadePct * 10) / 10,
          controlled_pct: controlledPct,
          final_dist_note: `from ${splitLabel(lateKey)} to finish`,
        };
      }
    }

    // ── 9. Finish time distribution (10 buckets) ──────────────────────────────
    const minSecs  = results[0].finish_seconds;
    const maxSecs  = results[results.length - 1].finish_seconds;
    const bucketW  = (maxSecs - minSecs) / 10;
    const distribution = Array.from({ length: 10 }, (_, i) => {
      const lo = minSecs + i * bucketW;
      const hi = minSecs + (i + 1) * bucketW;
      return {
        min_min: Math.round(lo / 60),
        max_min: Math.round(hi / 60),
        count: results.filter(r => r.finish_seconds >= lo && r.finish_seconds < hi).length,
      };
    });

    return NextResponse.json({
      has_data:              true,
      latest_year:           latestYear,
      total_finishers:       totalFinishers,
      overall_position:      overallPos,
      overall_top_pct:       overallTopPct,
      gender_position:       genderPosition,
      gender_total:          genderTotal,
      gender_top_pct:        genderTopPct,
      age_group_label:       ageGroupLabel,
      age_group_position:    ageGroupPosition,
      age_group_total:       ageGroupTotal,
      age_group_top_pct:     ageGroupTopPct,
      halfway_analysis:      halfwayAnalysis,
      late_analysis:         lateAnalysis,
      distribution,
      format_time:           (s: number) => formatMMSS(s),
    });
  } catch (err) {
    console.error("[race-strategy/results]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

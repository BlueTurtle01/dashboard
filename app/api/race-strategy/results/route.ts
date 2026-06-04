/**
 * POST /api/race-strategy/results
 *
 * Analyses race_results data for a given race and target finish time.
 * Uses RACE_SPLIT_CONFIGS for known races so checkpoint names and time formats
 * are exactly right. Falls back to auto-detection for unlisted races.
 *
 * Body: { race_id, target_minutes, gender?, age? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { RACE_SPLIT_CONFIGS, type SplitInfo, type TimeFormat } from "@/lib/race-analysis/split-config";

export const maxDuration = 30;

/* ── Types ── */
interface RawResult {
  finish_seconds: number;
  gender: string | null;
  age_group: string | null;
  position: number | null;
  additional_data: Record<string, string> | null;
}

export interface SplitAnalysis {
  key: string;
  label: string;
  distance_km?: number;
  role: "early" | "halfway" | "late";
  recommended_seconds: number;       // median split time for target band
  aggressive_seconds?: number;       // P15 (only for halfway: going faster = high risk)
  typical_ratio: number;             // median split / finish
  pct_positive_split?: number;       // % who went out faster than 49% of finish (halfway only)
  band_size: number;                 // finishers within ±12% of target
}

/* ── Time parsing ── */
function parseElapsedTime(s: string, fmt: TimeFormat = "HH:MM:SS"): number | null {
  const parts = s.split(":");
  if (parts.length !== 3) return null;
  const a = parseInt(parts[0], 10);
  const b = parseInt(parts[1], 10);
  const c = parseInt(parts[2], 10);
  if (isNaN(a) || isNaN(b) || isNaN(c)) return null;

  if (fmt === "MM:SS") return a * 60 + b;

  // Auto-detect: if first part > 12 and last part is 0, treat as MM:SS:00
  if (a > 12 && c === 0) return a * 60 + b;

  return a * 3600 + b * 60 + c;
}

function formatHhMm(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m`;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pctile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/* ── Auto-detect splits for races without config ── */
const NON_SPLIT_KEYS = new Set([
  "gap", "club", "Club", "gender_total", "age_group_total",
  "gender_position", "age_group_position",
  "chip_time", "gun_time", "finish_time", "net_time",
]);

function autoDetectSplits(results: RawResult[]): SplitInfo[] {
  const sample = results.filter(r => r.additional_data).slice(0, 150);
  if (sample.length === 0) return [];

  const keys = Object.keys(sample[0].additional_data ?? {}).filter(k => !NON_SPLIT_KEYS.has(k));
  const detected: { key: string; medianRatio: number; score: number }[] = [];

  for (const key of keys) {
    const fractions: number[] = [];
    for (const r of sample) {
      const raw = r.additional_data?.[key];
      if (!raw || r.finish_seconds <= 0) continue;
      const secs = parseElapsedTime(raw);
      if (secs === null) continue;
      const frac = secs / r.finish_seconds;
      if (frac > 0.10 && frac < 0.95) fractions.push(frac);
    }
    if (fractions.length > sample.length * 0.3) {
      detected.push({ key, medianRatio: median(fractions), score: fractions.length });
    }
  }

  // Sort by median ratio → early to late
  detected.sort((a, b) => a.medianRatio - b.medianRatio);

  return detected.map(({ key, medianRatio }) => ({
    key,
    label: key.replace(/_/g, " "),
    role: medianRatio < 0.40 ? "early" : medianRatio < 0.62 ? "halfway" : "late",
  }));
}

/* ── Age group mapping ── */
function mapAgeToGroup(age: number, gender: string | undefined, distinctGroups: string[]): string | null {
  const gPrefix  = gender === "Female" ? "F" : gender === "Male" ? "M" : "";
  const isFemale = gender === "Female";
  const bracketStarts = isFemale
    ? [80, 75, 70, 65, 60, 55, 50, 45, 40, 35]
    : [80, 75, 70, 65, 60, 55, 50, 45, 40];
  const bracket = bracketStarts.find(b => age >= b) ?? 0;

  if (bracket === 0) {
    return distinctGroups.find(g =>
      [`${gPrefix}Open`, `${gPrefix}OPEN`, "OPEN", "Open", "Senior", "U40"].includes(g)
    ) ?? null;
  }

  const candidates = [
    `${gPrefix}${bracket}`, `${bracket}+`, `V${bracket}`,
    `${bracket}-${bracket + 4}`, String(bracket),
  ];
  return candidates.find(c => distinctGroups.includes(c)) ?? null;
}

/* ── Per-split analysis ── */
function analyseSplit(
  results: RawResult[],
  split: SplitInfo,
  targetSecs: number,
): SplitAnalysis | null {
  const fmt = split.timeFormat ?? "HH:MM:SS";
  const band = results.filter(r => {
    const raw = r.additional_data?.[split.key];
    if (!raw) return false;
    return parseElapsedTime(raw, fmt) !== null &&
      Math.abs(r.finish_seconds - targetSecs) / targetSecs < 0.12;
  });

  if (band.length < 8) return null;

  const splitTimes: number[] = [];
  const ratios: number[] = [];
  let positiveSplits = 0;

  for (const r of band) {
    const secs = parseElapsedTime(r.additional_data![split.key], fmt);
    if (secs === null || r.finish_seconds <= 0) continue;
    splitTimes.push(secs);
    const ratio = secs / r.finish_seconds;
    ratios.push(ratio);
    if (split.role === "halfway" && ratio < 0.49) positiveSplits++;
  }

  if (splitTimes.length === 0) return null;

  return {
    key:                  split.key,
    label:                split.label,
    distance_km:          split.distance_km,
    role:                 split.role,
    recommended_seconds:  Math.round(median(splitTimes) / 30) * 30,  // round to 30s
    aggressive_seconds:   split.role === "halfway" ? Math.round(pctile(splitTimes, 15) / 30) * 30 : undefined,
    typical_ratio:        Math.round(median(ratios) * 1000) / 1000,
    pct_positive_split:   split.role === "halfway" ? Math.round((positiveSplits / ratios.length) * 100) : undefined,
    band_size:            band.length,
  };
}

/* ── Main handler ── */
export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as {
      race_id?: string; target_minutes?: number; gender?: string; age?: number;
    };
    const { race_id, target_minutes, gender, age } = body;

    if (!race_id || !target_minutes || target_minutes <= 0) {
      return NextResponse.json({ error: "race_id and target_minutes required" }, { status: 400 });
    }

    const supabase = await createClient();
    const targetSecs = target_minutes * 60;

    // ── Latest year ──────────────────────────────────────────────────────────
    const { data: yearRows } = await supabase
      .from("race_results")
      .select("result_year")
      .eq("race_id", race_id)
      .gt("finish_seconds", 0)
      .order("result_year", { ascending: false })
      .limit(1);

    if (!yearRows?.length) return NextResponse.json({ has_data: false });
    const latestYear = (yearRows[0] as { result_year: number }).result_year;

    // ── All finishers ────────────────────────────────────────────────────────
    const { data: rawRows } = await supabase
      .from("race_results")
      .select("finish_seconds, gender, age_group, position, additional_data")
      .eq("race_id", race_id)
      .eq("result_year", latestYear)
      .gt("finish_seconds", 0)
      .order("finish_seconds");

    const results = (rawRows ?? []) as RawResult[];
    if (results.length === 0) return NextResponse.json({ has_data: false });

    const totalFinishers = results.length;

    // ── Overall percentile ───────────────────────────────────────────────────
    const fasterCount = results.filter(r => r.finish_seconds < targetSecs).length;
    const overallPos  = fasterCount + 1;
    const overallTopPct = Math.round((overallPos / totalFinishers) * 100);

    // ── Gender stats ─────────────────────────────────────────────────────────
    let genderPosition: number | null = null;
    let genderTotal:    number | null = null;
    let genderTopPct:   number | null = null;

    if (gender) {
      const gf = results.filter(r => r.gender === gender);
      genderTotal    = gf.length;
      genderPosition = gf.filter(r => r.finish_seconds < targetSecs).length + 1;
      genderTopPct   = Math.round((genderPosition / genderTotal) * 100);
    }

    // ── Age group stats ──────────────────────────────────────────────────────
    let ageGroupLabel:    string | null = null;
    let ageGroupPosition: number | null = null;
    let ageGroupTotal:    number | null = null;
    let ageGroupTopPct:   number | null = null;

    if (age != null) {
      const distinctGroups = [...new Set(results.map(r => r.age_group).filter(Boolean))] as string[];
      ageGroupLabel = mapAgeToGroup(age, gender, distinctGroups);
      if (ageGroupLabel) {
        const cf = gender
          ? results.filter(r => r.gender === gender && r.age_group === ageGroupLabel)
          : results.filter(r => r.age_group === ageGroupLabel);
        ageGroupTotal    = cf.length;
        ageGroupPosition = cf.filter(r => r.finish_seconds < targetSecs).length + 1;
        ageGroupTopPct   = Math.round((ageGroupPosition / ageGroupTotal) * 100);
      }
    }

    // ── Split analysis ───────────────────────────────────────────────────────
    const config = RACE_SPLIT_CONFIGS[race_id];
    const splitDefs: SplitInfo[] = config?.splits ?? autoDetectSplits(results);
    const splitAnalyses: SplitAnalysis[] = splitDefs
      .map(s => analyseSplit(results, s, targetSecs))
      .filter((s): s is SplitAnalysis => s !== null);

    // ── Late-race fade (between last two splits if available) ────────────────
    const halfwaySplit = splitAnalyses.find(s => s.role === "halfway");
    const lateSplit    = splitAnalyses.find(s => s.role === "late");
    let lateAnalysis: {
      from_label: string; to_label: string;
      avg_final_minutes: number; avg_fade_pct: number; controlled_pct: number;
    } | null = null;

    if (halfwaySplit && lateSplit) {
      const halfFmt = config?.splits.find(s => s.key === halfwaySplit.key)?.timeFormat ?? "HH:MM:SS";
      const lateFmt = config?.splits.find(s => s.key === lateSplit.key)?.timeFormat ?? "HH:MM:SS";

      const band = results.filter(r =>
        r.additional_data?.[halfwaySplit.key] && r.additional_data?.[lateSplit.key] &&
        Math.abs(r.finish_seconds - targetSecs) / targetSecs < 0.12
      );

      if (band.length >= 8) {
        const fadePcts: number[] = [];
        const finalMins: number[] = [];
        for (const r of band) {
          const lSecs = parseElapsedTime(r.additional_data![lateSplit.key], lateFmt);
          const hSecs = parseElapsedTime(r.additional_data![halfwaySplit.key], halfFmt);
          if (lSecs === null || hSecs === null) continue;
          const finalSecs = r.finish_seconds - lSecs;
          if (finalSecs <= 0) continue;
          finalMins.push(finalSecs / 60);
          fadePcts.push(((finalSecs / hSecs) - 1) * 100);
        }
        if (fadePcts.length >= 5) {
          const medFade = median(fadePcts);
          lateAnalysis = {
            from_label:        lateSplit.label,
            to_label:          "finish",
            avg_final_minutes: Math.round(median(finalMins) * 10) / 10,
            avg_fade_pct:      Math.round(medFade * 10) / 10,
            controlled_pct:    Math.round((fadePcts.filter(f => f < 15).length / fadePcts.length) * 100),
          };
        }
      }
    }

    // ── Finish distribution ──────────────────────────────────────────────────
    const minS = results[0].finish_seconds;
    const maxS = results[results.length - 1].finish_seconds;
    const bw   = (maxS - minS) / 10;
    const distribution = Array.from({ length: 10 }, (_, i) => ({
      min_min: Math.round((minS + i * bw) / 60),
      max_min: Math.round((minS + (i + 1) * bw) / 60),
      count:   results.filter(r => r.finish_seconds >= minS + i * bw && r.finish_seconds < minS + (i + 1) * bw).length,
    }));

    return NextResponse.json({
      has_data:           true,
      latest_year:        latestYear,
      total_finishers:    totalFinishers,
      overall_position:   overallPos,
      overall_top_pct:    overallTopPct,
      gender_position:    genderPosition,
      gender_total:       genderTotal,
      gender_top_pct:     genderTopPct,
      age_group_label:    ageGroupLabel,
      age_group_position: ageGroupPosition,
      age_group_total:    ageGroupTotal,
      age_group_top_pct:  ageGroupTopPct,
      splits:             splitAnalyses,
      late_analysis:      lateAnalysis,
      distribution,
      format_hhmm:        formatHhMm,
    });
  } catch (err) {
    console.error("[race-strategy/results]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  mannWhitneyU,
  fishersExactTest,
  wilsonCI,
  median,
  percentile,
} from "@/lib/race-analysis/stats";

export const dynamic = "force-dynamic";

export interface GroupStats {
  n: number;
  n_finished: number;
  n_dnf: number;
  dnf_rate: number;
  dnf_ci: [number, number];
  median_finish_seconds: number | null;
  p25_finish_seconds: number | null;
  p75_finish_seconds: number | null;
  median_field_percentile: number | null;
}

export interface MatchedAnalysis {
  n_pairs: number;
  median_diff_seconds: number;
  p_value: number;
  significant: boolean;
  match_tolerance: number;
}

export interface ExperienceStratum {
  label: string;
  treatment_n: number;
  control_n: number;
  median_diff_seconds: number;
  p_value: number;
  significant: boolean;
}

export interface RaceImpactResult {
  race_a_name: string;
  race_b_name: string;
  treatment: GroupStats;
  control: GroupStats;
  time_test: {
    z: number;
    p_value: number;
    median_diff_seconds: number;
    significant: boolean;
  };
  dnf_test: {
    p_value: number;
    odds_ratio: number;
    significant: boolean;
  };
  insufficient_data: boolean;
  first_time_only_mode: boolean;
  experience_differential: {
    treatment_avg_races: number;
    control_avg_races: number;
    gap: number;
  };
  matched_analysis: MatchedAnalysis | null;
  experience_strata: ExperienceStratum[];
}

interface RawRow {
  result_status: string;
  finish_seconds: number | null;
  result_year: number;
  // Supabase RPC booleans can come back as boolean | number | string depending
  // on the driver version, so we use `unknown` and coerce explicitly.
  did_race_a_before: unknown;
  is_first_race_b: unknown;
  athlete_race_count: number;
}

// Supabase can return PostgreSQL BOOLEAN as JS boolean, number (0/1),
// or string ("t"/"f"/"true"/"false") depending on the PostgREST version.
function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "t" || v === "true" || v === "1";
  return false;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function groupStats(rows: RawRow[], allFinishTimes: number[]): GroupStats {
  const n = rows.length;
  const finished = rows.filter(
    (r) => r.result_status === "FINISHED" && r.finish_seconds != null
  );
  const dnf = rows.filter((r) => r.result_status === "DNF");
  const n_finished = finished.length;
  const n_dnf = dnf.length;
  const dnf_rate = n > 0 ? n_dnf / n : 0;
  const times = finished.map((r) => r.finish_seconds!);

  const sortedAll = [...allFinishTimes].sort((a, b) => a - b);
  const total = sortedAll.length;

  const fieldPercentiles = times.map((t) => {
    if (total <= 1) return 0.5;
    let lo = 0, hi = total - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedAll[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo / (total - 1);
  });

  return {
    n,
    n_finished,
    n_dnf,
    dnf_rate,
    dnf_ci: wilsonCI(n_dnf, n),
    median_finish_seconds: times.length > 0 ? median(times) : null,
    p25_finish_seconds: times.length > 0 ? percentile(times, 25) : null,
    p75_finish_seconds: times.length > 0 ? percentile(times, 75) : null,
    median_field_percentile:
      fieldPercentiles.length > 0 ? median(fieldPercentiles) : null,
  };
}

// Greedy 1:1 nearest-neighbour matching on athlete_race_count.
// Each treatment athlete is paired with the closest unmatched control
// athlete whose race count is within maxGap.
function greedyMatch(
  treatment: RawRow[],
  control: RawRow[],
  maxGap = 2
): MatchedAnalysis | null {
  const used = new Set<number>();
  const treatTimes: number[] = [];
  const ctrlTimes: number[] = [];

  for (const t of treatment) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < control.length; i++) {
      if (used.has(i)) continue;
      const d = Math.abs(control[i].athlete_race_count - t.athlete_race_count);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDist <= maxGap) {
      const tTime = t.result_status === "FINISHED" ? t.finish_seconds : null;
      const cTime = control[bestIdx].result_status === "FINISHED" ? control[bestIdx].finish_seconds : null;
      if (tTime != null && cTime != null) {
        treatTimes.push(tTime);
        ctrlTimes.push(cTime);
      }
      used.add(bestIdx);
    }
  }

  const n_pairs = used.size;
  if (n_pairs < 5 || treatTimes.length < 5) return null;

  const mw = mannWhitneyU(treatTimes, ctrlTimes);

  return {
    n_pairs,
    median_diff_seconds: mw.medianDiff,
    p_value: mw.pValue,
    significant: !isNaN(mw.pValue) && mw.pValue < 0.05,
    match_tolerance: maxGap,
  };
}

// Stratify all rows into experience buckets and run per-stratum comparisons.
const STRATA: { label: string; min: number; max: number }[] = [
  { label: "1–2 races",  min: 1,  max: 2  },
  { label: "3–5 races",  min: 3,  max: 5  },
  { label: "6–10 races", min: 6,  max: 10 },
  { label: "11+ races",  min: 11, max: Infinity },
];

function stratifyByExperience(treatment: RawRow[], control: RawRow[]): ExperienceStratum[] {
  return STRATA.map(({ label, min, max }) => {
    const tRows = treatment.filter(r => r.athlete_race_count >= min && r.athlete_race_count <= max);
    const cRows = control.filter(r => r.athlete_race_count >= min && r.athlete_race_count <= max);

    const tTimes = tRows.filter(r => r.result_status === "FINISHED" && r.finish_seconds != null).map(r => r.finish_seconds!);
    const cTimes = cRows.filter(r => r.result_status === "FINISHED" && r.finish_seconds != null).map(r => r.finish_seconds!);

    if (tTimes.length < 3 || cTimes.length < 3) {
      return { label, treatment_n: tRows.length, control_n: cRows.length, median_diff_seconds: 0, p_value: 1, significant: false };
    }

    const mw = mannWhitneyU(tTimes, cTimes);
    return {
      label,
      treatment_n: tRows.length,
      control_n: cRows.length,
      median_diff_seconds: mw.medianDiff,
      p_value: isNaN(mw.pValue) ? 1 : mw.pValue,
      significant: !isNaN(mw.pValue) && mw.pValue < 0.05,
    };
  }).filter(s => s.treatment_n > 0 || s.control_n > 0);
}

export async function GET(req: NextRequest) {
  const race_a_id = req.nextUrl.searchParams.get("race_a_id");
  const race_b_id = req.nextUrl.searchParams.get("race_b_id");
  const firstTimeOnly = req.nextUrl.searchParams.get("first_time_only") !== "false";
  const maxYearGapRaw = req.nextUrl.searchParams.get("max_year_gap");
  const maxYearGap = maxYearGapRaw && maxYearGapRaw !== "null" ? parseInt(maxYearGapRaw, 10) : null;
  const maxRaceCountRaw = req.nextUrl.searchParams.get("max_race_count");
  const maxRaceCount = maxRaceCountRaw && maxRaceCountRaw !== "null" ? parseInt(maxRaceCountRaw, 10) : null;

  if (!race_a_id || !race_b_id) {
    return NextResponse.json(
      { error: "race_a_id and race_b_id are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (!roles?.some((r) => r.role === "admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rawData, error: dataError } = await supabase.rpc(
    "al_race_impact_data",
    { p_race_a_id: race_a_id, p_race_b_id: race_b_id, p_max_year_gap: maxYearGap }
  );

  if (dataError) {
    return NextResponse.json({ error: dataError.message }, { status: 500 });
  }

  const { data: raceNames } = await supabase
    .from("races")
    .select("id, name")
    .in("id", [race_a_id, race_b_id]);

  const nameMap = new Map(
    (raceNames ?? []).map((r: { id: string; name: string }) => [r.id, r.name])
  );

  // Coerce booleans explicitly — Supabase RPC can return them as various types
  const allRows: RawRow[] = (rawData ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    did_race_a_before: r.did_race_a_before,
    is_first_race_b: r.is_first_race_b,
    athlete_race_count: Number(r.athlete_race_count ?? 1),
  }));

  // Apply first-time-only filter if requested
  const ftRows = firstTimeOnly
    ? allRows.filter((r) => toBool(r.is_first_race_b))
    : allRows;

  // Apply experience cap — exclude athletes whose total race count exceeds threshold
  const rows = maxRaceCount === null
    ? ftRows
    : ftRows.filter((r) => r.athlete_race_count <= maxRaceCount);

  const treatment = rows.filter((r) => toBool(r.did_race_a_before));
  const control = rows.filter((r) => !toBool(r.did_race_a_before));

  const allFinishTimes = rows
    .filter((r) => r.result_status === "FINISHED" && r.finish_seconds != null)
    .map((r) => r.finish_seconds!);

  const treatmentStats = groupStats(treatment, allFinishTimes);
  const controlStats = groupStats(control, allFinishTimes);

  // Experience differential: avg distinct races per athlete in each group
  const treatmentAvg = avg(treatment.map((r) => r.athlete_race_count));
  const controlAvg = avg(control.map((r) => r.athlete_race_count));

  const treatmentTimes = treatment
    .filter((r) => r.result_status === "FINISHED" && r.finish_seconds != null)
    .map((r) => r.finish_seconds!);
  const controlTimes = control
    .filter((r) => r.result_status === "FINISHED" && r.finish_seconds != null)
    .map((r) => r.finish_seconds!);

  const mwResult = mannWhitneyU(treatmentTimes, controlTimes);
  const fisherResult = fishersExactTest(
    treatmentStats.n_dnf,
    treatmentStats.n_finished,
    controlStats.n_dnf,
    controlStats.n_finished
  );

  const result: RaceImpactResult = {
    race_a_name: nameMap.get(race_a_id) ?? "Race A",
    race_b_name: nameMap.get(race_b_id) ?? "Race B",
    treatment: treatmentStats,
    control: controlStats,
    time_test: {
      z: mwResult.z,
      p_value: mwResult.pValue,
      median_diff_seconds: mwResult.medianDiff,
      significant: !isNaN(mwResult.pValue) && mwResult.pValue < 0.05,
    },
    dnf_test: {
      p_value: fisherResult.pValue,
      odds_ratio: fisherResult.oddsRatio,
      significant: fisherResult.pValue < 0.05,
    },
    insufficient_data: treatmentStats.n_finished < 5,
    first_time_only_mode: firstTimeOnly,
    experience_differential: {
      treatment_avg_races: Math.round(treatmentAvg * 10) / 10,
      control_avg_races: Math.round(controlAvg * 10) / 10,
      gap: Math.round((treatmentAvg - controlAvg) * 10) / 10,
    },
    matched_analysis: greedyMatch(treatment, control),
    experience_strata: stratifyByExperience(treatment, control),
  };

  return NextResponse.json(result);
}

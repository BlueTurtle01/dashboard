import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  mannWhitneyU,
  fishersExactTest,
  median,
  wilsonCI,
} from "@/lib/race-analysis/stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface PairImpactSummary {
  race_a_name: string;
  race_b_name: string;
  treatment_n: number;
  control_n: number;
  treatment_n_finished: number;
  control_n_finished: number;
  treatment_dnf_rate: number;
  control_dnf_rate: number;
  treatment_dnf_ci: [number, number];
  control_dnf_ci: [number, number];
  treatment_median_pct: number | null;
  control_median_pct: number | null;
  time_z: number;
  time_p_value: number;
  time_significant: boolean;
  median_diff_seconds: number;
  dnf_p_value: number;
  dnf_odds_ratio: number;
  dnf_significant: boolean;
  treatment_avg_races: number;
  control_avg_races: number;
  experience_gap: number;
}

export interface CachedResponse {
  results: PairImpactSummary[];
  computed_at: string;
  row_count: number;
  is_stale: boolean;
  cache_key: string;
}

interface RawResultRow {
  full_name: string;
  race_id: string;
  result_year: number;
  result_status: string;
  finish_seconds: number | null;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function fieldPctFn(sortedTimes: number[]) {
  const n = sortedTimes.length;
  return (t: number): number => {
    if (n <= 1) return 0.5;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedTimes[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo / (n - 1);
  };
}

function cacheKey(firstTimeOnly: boolean, minN: number, maxYearGap: number | null, maxRaceCount: number | null): string {
  return `race_impact_all:ft${firstTimeOnly ? 1 : 0}:n${minN}:gap${maxYearGap ?? "any"}:rc${maxRaceCount ?? "any"}`;
}

async function adminCheck(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  if (!roles?.some((r) => r.role === "admin")) return null;
  return user;
}

// ── GET: return cached results (with staleness flag) ─────────────────────────

export async function GET(req: NextRequest) {
  const firstTimeOnly = req.nextUrl.searchParams.get("first_time_only") !== "false";
  const minN = Math.max(3, Number(req.nextUrl.searchParams.get("min_n") ?? "5"));
  const maxYearGapRaw = req.nextUrl.searchParams.get("max_year_gap");
  const maxYearGap = maxYearGapRaw && maxYearGapRaw !== "null" ? parseInt(maxYearGapRaw, 10) : null;
  const maxRaceCountRaw = req.nextUrl.searchParams.get("max_race_count");
  const maxRaceCount = maxRaceCountRaw && maxRaceCountRaw !== "null" ? parseInt(maxRaceCountRaw, 10) : null;
  const key = cacheKey(firstTimeOnly, minN, maxYearGap, maxRaceCount);

  const supabase = await createClient();
  if (!(await adminCheck(supabase))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Read cache
  const { data: cacheRow } = await supabase
    .from("al_impact_cache")
    .select("data, computed_at, row_count")
    .eq("cache_key", key)
    .maybeSingle();

  if (!cacheRow) {
    return NextResponse.json({ results: null, computed_at: null, row_count: 0, is_stale: true, cache_key: key });
  }

  // Check staleness: compare computed_at vs latest race_results updated_at
  const { data: staleness } = await supabase
    .from("race_results")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestData = staleness?.updated_at ? new Date(staleness.updated_at) : null;
  const computedAt = new Date(cacheRow.computed_at);
  const isStale = latestData != null && latestData > computedAt;

  return NextResponse.json({
    results: cacheRow.data as PairImpactSummary[],
    computed_at: cacheRow.computed_at,
    row_count: cacheRow.row_count,
    is_stale: isStale,
    cache_key: key,
  } satisfies CachedResponse);
}

// ── POST: recompute and write to cache ────────────────────────────────────────

export async function POST(req: NextRequest) {
  const firstTimeOnly = req.nextUrl.searchParams.get("first_time_only") !== "false";
  const minN = Math.max(3, Number(req.nextUrl.searchParams.get("min_n") ?? "5"));
  const limitN = Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? "100"));
  const maxYearGapRaw = req.nextUrl.searchParams.get("max_year_gap");
  const maxYearGap = maxYearGapRaw && maxYearGapRaw !== "null" ? parseInt(maxYearGapRaw, 10) : null;
  const maxRaceCountRaw = req.nextUrl.searchParams.get("max_race_count");
  const maxRaceCount = maxRaceCountRaw && maxRaceCountRaw !== "null" ? parseInt(maxRaceCountRaw, 10) : null;
  const key = cacheKey(firstTimeOnly, minN, maxYearGap, maxRaceCount);

  const supabase = await createClient();
  if (!(await adminCheck(supabase))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Get candidate pairs
  const { data: pairsRaw, error: pairsError } = await supabase.rpc("al_race_paths");
  if (pairsError) return NextResponse.json({ error: pairsError.message }, { status: 500 });

  const pairs = (pairsRaw ?? []) as {
    race_a_id: string; race_a_name: string;
    race_b_id: string; race_b_name: string;
    pair_count: number;
  }[];

  const candidatePairs = pairs.filter((p) => p.pair_count >= Math.max(3, minN - 2));
  if (candidatePairs.length === 0) {
    await saveTo(supabase, key, [], 0);
    return NextResponse.json({ results: [], computed_at: new Date().toISOString(), row_count: 0, is_stale: false, cache_key: key });
  }

  // Fetch all relevant race results in one query
  const raceIds = [...new Set([
    ...candidatePairs.map((p) => p.race_a_id),
    ...candidatePairs.map((p) => p.race_b_id),
  ])];

  const { data: allData, error: dataError } = await supabase
    .from("race_results")
    .select("full_name, race_id, result_year, result_status, finish_seconds")
    .in("race_id", raceIds)
    .not("full_name", "is", null)
    .neq("full_name", "")
    .neq("full_name", "Anonymous");

  if (dataError) return NextResponse.json({ error: dataError.message }, { status: 500 });

  const allRows = (allData ?? []) as RawResultRow[];

  // Build lookups
  const athleteFirstYear = new Map<string, Map<string, number>>();
  const byRace = new Map<string, RawResultRow[]>();
  const athleteRaceCount = new Map<string, Set<string>>();

  for (const row of allRows) {
    if (!athleteFirstYear.has(row.full_name)) athleteFirstYear.set(row.full_name, new Map());
    const afm = athleteFirstYear.get(row.full_name)!;
    const prev = afm.get(row.race_id);
    if (prev == null || row.result_year < prev) afm.set(row.race_id, row.result_year);

    if (!byRace.has(row.race_id)) byRace.set(row.race_id, []);
    byRace.get(row.race_id)!.push(row);

    if (!athleteRaceCount.has(row.full_name)) athleteRaceCount.set(row.full_name, new Set());
    athleteRaceCount.get(row.full_name)!.add(row.race_id);
  }

  // Process each pair
  const results: PairImpactSummary[] = [];

  for (const pair of candidatePairs) {
    const raceBRows = byRace.get(pair.race_b_id) ?? [];
    if (raceBRows.length === 0) continue;

    const firstRaceBYear = new Map<string, number>();
    for (const row of raceBRows) {
      const prev = firstRaceBYear.get(row.full_name);
      if (prev == null || row.result_year < prev) firstRaceBYear.set(row.full_name, row.result_year);
    }

    const treatment: RawResultRow[] = [];
    const control: RawResultRow[] = [];

    for (const row of raceBRows) {
      if (firstTimeOnly && row.result_year !== firstRaceBYear.get(row.full_name)) continue;
      // Experience cap: exclude athletes from both groups if they exceed the threshold
      if (maxRaceCount !== null && (athleteRaceCount.get(row.full_name)?.size ?? 1) > maxRaceCount) continue;
      const raceAYear = athleteFirstYear.get(row.full_name)?.get(pair.race_a_id);
      const didBefore = raceAYear != null
        && raceAYear <= row.result_year
        && (maxYearGap === null || row.result_year - raceAYear <= maxYearGap);
      if (didBefore) treatment.push(row); else control.push(row);
    }

    if (treatment.length < minN) continue;

    const treatmentFinished = treatment.filter((r) => r.result_status === "FINISHED" && r.finish_seconds != null);
    const controlFinished = control.filter((r) => r.result_status === "FINISHED" && r.finish_seconds != null);
    if (treatmentFinished.length < 5) continue;

    const treatmentDnf = treatment.filter((r) => r.result_status === "DNF").length;
    const controlDnf = control.filter((r) => r.result_status === "DNF").length;

    const treatmentTimes = treatmentFinished.map((r) => r.finish_seconds!);
    const controlTimes = controlFinished.map((r) => r.finish_seconds!);

    const allFinishTimes = [...treatmentTimes, ...controlTimes].sort((a, b) => a - b);
    const pct = fieldPctFn(allFinishTimes);

    const mw = mannWhitneyU(treatmentTimes, controlTimes);
    const fisher = fishersExactTest(treatmentDnf, treatmentFinished.length, controlDnf, controlFinished.length);

    const treatmentPcts = treatmentTimes.map(pct);
    const controlPcts = controlTimes.map(pct);

    const treatmentAvgRaces = avg(treatment.map((r) => athleteRaceCount.get(r.full_name)?.size ?? 1));
    const controlAvgRaces = avg(control.map((r) => athleteRaceCount.get(r.full_name)?.size ?? 1));

    results.push({
      race_a_name: pair.race_a_name,
      race_b_name: pair.race_b_name,
      treatment_n: treatment.length,
      control_n: control.length,
      treatment_n_finished: treatmentFinished.length,
      control_n_finished: controlFinished.length,
      treatment_dnf_rate: treatmentDnf / treatment.length,
      control_dnf_rate: controlDnf / control.length,
      treatment_dnf_ci: wilsonCI(treatmentDnf, treatment.length),
      control_dnf_ci: wilsonCI(controlDnf, control.length),
      treatment_median_pct: treatmentPcts.length > 0 ? median(treatmentPcts) : null,
      control_median_pct: controlPcts.length > 0 ? median(controlPcts) : null,
      time_z: mw.z,
      time_p_value: mw.pValue,
      time_significant: !isNaN(mw.pValue) && mw.pValue < 0.05,
      median_diff_seconds: mw.medianDiff,
      dnf_p_value: fisher.pValue,
      dnf_odds_ratio: fisher.oddsRatio,
      dnf_significant: fisher.pValue < 0.05,
      treatment_avg_races: Math.round(treatmentAvgRaces * 10) / 10,
      control_avg_races: Math.round(controlAvgRaces * 10) / 10,
      experience_gap: Math.round((treatmentAvgRaces - controlAvgRaces) * 10) / 10,
    });
  }

  results.sort((a, b) => {
    const aSig = a.time_significant || a.dnf_significant ? 1 : 0;
    const bSig = b.time_significant || b.dnf_significant ? 1 : 0;
    if (aSig !== bSig) return bSig - aSig;
    const aP = Math.min(isNaN(a.time_p_value) ? 1 : a.time_p_value, a.dnf_p_value);
    const bP = Math.min(isNaN(b.time_p_value) ? 1 : b.time_p_value, b.dnf_p_value);
    return aP - bP;
  });

  const final = results.slice(0, limitN);
  await saveTo(supabase, key, final, final.length);

  return NextResponse.json({
    results: final,
    computed_at: new Date().toISOString(),
    row_count: final.length,
    is_stale: false,
    cache_key: key,
  } satisfies CachedResponse);
}

async function saveTo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string,
  data: PairImpactSummary[],
  rowCount: number
) {
  await supabase.from("al_impact_cache").upsert({
    cache_key: key,
    data: data as unknown as Record<string, unknown>[],
    row_count: rowCount,
    computed_at: new Date().toISOString(),
  }, { onConflict: "cache_key" });
}

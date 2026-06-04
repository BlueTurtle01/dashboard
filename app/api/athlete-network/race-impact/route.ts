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
}

interface RawRow {
  result_status: string;
  finish_seconds: number | null;
  result_year: number;
  did_race_a_before: boolean;
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

  // Field percentile: where each finish_seconds sits in the combined finisher list
  // (0 = fastest, 1 = slowest). Sorted ascending.
  const sortedAll = [...allFinishTimes].sort((a, b) => a - b);
  const total = sortedAll.length;

  const fieldPercentiles = times.map((t) => {
    if (total <= 1) return 0.5;
    // Find position via binary search
    let lo = 0;
    let hi = total - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedAll[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo / (total - 1); // 0 = fastest, 1 = slowest
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

export async function GET(req: NextRequest) {
  const race_a_id = req.nextUrl.searchParams.get("race_a_id");
  const race_b_id = req.nextUrl.searchParams.get("race_b_id");

  if (!race_a_id || !race_b_id) {
    return NextResponse.json(
      { error: "race_a_id and race_b_id are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
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

  // Fetch raw data from SQL function
  const { data: rawData, error: dataError } = await supabase.rpc(
    "al_race_impact_data",
    { p_race_a_id: race_a_id, p_race_b_id: race_b_id }
  );

  if (dataError) {
    return NextResponse.json({ error: dataError.message }, { status: 500 });
  }

  // Fetch race names
  const { data: raceNames } = await supabase
    .from("races")
    .select("id, name")
    .in("id", [race_a_id, race_b_id]);

  const nameMap = new Map(
    (raceNames ?? []).map((r: { id: string; name: string }) => [r.id, r.name])
  );

  const rows = (rawData ?? []) as RawRow[];

  const treatment = rows.filter((r) => r.did_race_a_before);
  const control = rows.filter((r) => !r.did_race_a_before);

  // Combined finisher times for field-percentile calculation
  const allFinishTimes = rows
    .filter((r) => r.result_status === "FINISHED" && r.finish_seconds != null)
    .map((r) => r.finish_seconds!);

  const treatmentStats = groupStats(treatment, allFinishTimes);
  const controlStats = groupStats(control, allFinishTimes);

  // Statistical tests
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
  };

  return NextResponse.json(result);
}

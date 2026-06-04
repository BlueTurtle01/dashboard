import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  pearsonCorrelation,
  linearRegression,
  percentile,
} from "@/lib/race-analysis/stats";
import type { LinearRegressionModel, PearsonResult } from "@/lib/race-analysis/stats";

export const dynamic = "force-dynamic";

export interface ExperienceBand {
  label: string;
  min_years: number;
  max_years: number;
  n: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface RaceCorrelationResult {
  race_name: string;
  n: number;
  years_correlation: PearsonResult;
  count_correlation: PearsonResult;
  regression: LinearRegressionModel | null;
  experience_bands: ExperienceBand[];
  scatter: { x: number; y: number }[];
}

interface RawRow {
  full_name: string;
  finish_seconds: number;
  result_year: number;
  athlete_race_count: number;
  experience_years: number;
  first_race_year: number;
}

const BANDS: { label: string; min: number; max: number }[] = [
  { label: "Debut (0 yr)",  min: 0,  max: 0  },
  { label: "1–2 years",     min: 1,  max: 2  },
  { label: "3–5 years",     min: 3,  max: 5  },
  { label: "6–9 years",     min: 6,  max: 9  },
  { label: "10+ years",     min: 10, max: Infinity },
];

const SCATTER_CAP = 600;

export async function GET(req: NextRequest) {
  const race_id = req.nextUrl.searchParams.get("race_id");
  if (!race_id) {
    return NextResponse.json({ error: "race_id is required" }, { status: 400 });
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

  const [dataRes, raceRes] = await Promise.all([
    supabase.rpc("al_race_correlation_data", { p_race_id: race_id }),
    supabase.from("races").select("name").eq("id", race_id).single(),
  ]);

  if (dataRes.error) {
    return NextResponse.json({ error: dataRes.error.message }, { status: 500 });
  }

  const rows = (dataRes.data ?? []) as RawRow[];
  const race_name = (raceRes.data as { name: string } | null)?.name ?? "Unknown race";

  if (rows.length === 0) {
    return NextResponse.json({
      race_name,
      n: 0,
      years_correlation: { r: NaN, pValue: 1, n: 0 },
      count_correlation: { r: NaN, pValue: 1, n: 0 },
      regression: null,
      experience_bands: [],
      scatter: [],
    } satisfies RaceCorrelationResult);
  }

  const expYears = rows.map((r) => r.experience_years);
  const raceCounts = rows.map((r) => Number(r.athlete_race_count));
  const times = rows.map((r) => r.finish_seconds);

  const years_correlation = pearsonCorrelation(expYears, times);
  const count_correlation = pearsonCorrelation(raceCounts, times);
  const regression = linearRegression(expYears, times);

  // Experience-band quantiles
  const experience_bands: ExperienceBand[] = BANDS.map(({ label, min, max }) => {
    const bandTimes = rows
      .filter((r) => r.experience_years >= min && r.experience_years <= max)
      .map((r) => r.finish_seconds);
    if (bandTimes.length === 0) return null;
    return {
      label,
      min_years: min,
      max_years: max,
      n: bandTimes.length,
      p10: percentile(bandTimes, 10),
      p25: percentile(bandTimes, 25),
      p50: percentile(bandTimes, 50),
      p75: percentile(bandTimes, 75),
      p90: percentile(bandTimes, 90),
    };
  }).filter((b): b is ExperienceBand => b !== null && b.n >= 3);

  // Scatter sample
  let scatter = rows.map((r) => ({ x: r.experience_years, y: r.finish_seconds }));
  if (scatter.length > SCATTER_CAP) {
    // Deterministic shuffle using index stride
    const stride = Math.ceil(scatter.length / SCATTER_CAP);
    scatter = scatter.filter((_, i) => i % stride === 0).slice(0, SCATTER_CAP);
  }

  const result: RaceCorrelationResult = {
    race_name,
    n: rows.length,
    years_correlation,
    count_correlation,
    regression,
    experience_bands,
    scatter,
  };

  return NextResponse.json(result);
}

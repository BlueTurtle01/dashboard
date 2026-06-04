import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pearsonPValue } from "@/lib/race-analysis/stats";
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

interface StatsRow {
  n_finishers: number;
  pearson_years_r: number | null;
  pearson_count_r: number | null;
  reg_slope: number | null;
  reg_intercept: number | null;
  reg_r_squared: number | null;
  reg_residual_se: number | null;
  reg_x_mean: number | null;
  reg_x_sum_sq: number | null;
  reg_n: number;
  bands_json: ExperienceBand[] | null;
  scatter_json: { x: number; y: number }[] | null;
}

export async function GET(req: NextRequest) {
  const race_id = req.nextUrl.searchParams.get("race_id");
  if (!race_id) {
    return NextResponse.json({ error: "race_id is required" }, { status: 400 });
  }
  const genderParam = req.nextUrl.searchParams.get("gender");
  const ageGroupParam = req.nextUrl.searchParams.get("age_group");
  const p_gender = genderParam && genderParam !== "all" ? genderParam : null;
  const p_age_group = ageGroupParam && ageGroupParam !== "all" ? ageGroupParam : null;

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

  const [statsRes, raceRes] = await Promise.all([
    supabase.rpc("al_race_correlation_stats", { p_race_id: race_id, p_gender, p_age_group }),
    supabase.from("races").select("name").eq("id", race_id).single(),
  ]);

  if (statsRes.error) {
    return NextResponse.json({ error: statsRes.error.message }, { status: 500 });
  }

  const race_name = (raceRes.data as { name: string } | null)?.name ?? "Unknown race";
  const row = ((statsRes.data ?? []) as StatsRow[])[0];

  if (!row || !row.n_finishers) {
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

  const n = Number(row.n_finishers);
  const ry = row.pearson_years_r != null ? Number(row.pearson_years_r) : NaN;
  const rc = row.pearson_count_r != null ? Number(row.pearson_count_r) : NaN;

  const years_correlation: PearsonResult = {
    r: isFinite(ry) ? Math.round(ry * 10000) / 10000 : NaN,
    pValue: pearsonPValue(ry, n),
    n,
  };

  const count_correlation: PearsonResult = {
    r: isFinite(rc) ? Math.round(rc * 10000) / 10000 : NaN,
    pValue: pearsonPValue(rc, n),
    n,
  };

  const regression: LinearRegressionModel | null =
    row.reg_slope != null
      ? {
          slope: Number(row.reg_slope),
          intercept: Number(row.reg_intercept),
          rSquared: Number(row.reg_r_squared),
          residualSE: Number(row.reg_residual_se),
          xMean: Number(row.reg_x_mean),
          xSumSq: Number(row.reg_x_sum_sq),
          n: Number(row.reg_n),
        }
      : null;

  const result: RaceCorrelationResult = {
    race_name,
    n,
    years_correlation,
    count_correlation,
    regression,
    experience_bands: (row.bands_json ?? []).map((b) => ({
      ...b,
      n: Number(b.n),
      p10: Number(b.p10), p25: Number(b.p25), p50: Number(b.p50),
      p75: Number(b.p75), p90: Number(b.p90),
    })),
    scatter: (row.scatter_json ?? []).map((p) => ({ x: Number(p.x), y: Number(p.y) })),
  };

  return NextResponse.json(result);
}

/**
 * GET /api/race-intelligence/field-stats?race_id=...
 *
 * Returns historical field statistics for a race — aggregate, year-by-year,
 * gender split, and finish-time distribution across all years.
 * No athlete required — purely race-level data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

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

export interface FieldStatsResponse {
  has_data: boolean;
  aggregate?: {
    total_finishers: number;
    total_starters: number;
    dnf_rate: number;
    years_of_data: number;
    median_seconds: number | null;
    p10_seconds: number | null;
    p25_seconds: number | null;
    p75_seconds: number | null;
    p90_seconds: number | null;
    fastest_seconds: number | null;
    cluster_label: string | null;
  };
  distribution?: { min_min: number; max_min: number; count: number }[];
  by_year?: {
    year: number;
    finishers: number;
    starters: number;
    dnf_rate: number;
    median_seconds: number | null;
  }[];
  by_gender?: {
    gender: string;
    count: number;
    median_seconds: number | null;
  }[];
}

export async function GET(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const race_id = searchParams.get("race_id");
    if (!race_id) return NextResponse.json({ error: "race_id required" }, { status: 400 });

    const supabase = await createClient();

    // ── Aggregate stats from race_ml_features (pre-computed) ─────────────────
    const { data: mlRow } = await supabase
      .from("race_ml_features")
      .select("field_median_seconds, field_p25_seconds, field_p75_seconds, dnf_rate, years_of_data, total_finishers, total_starters, cluster_label")
      .eq("race_id", race_id)
      .maybeSingle();

    // ── Raw results for year-by-year, gender split, and distribution ──────────
    const { data: rawRows } = await supabase
      .from("race_results")
      .select("result_year, result_status, finish_seconds, gender")
      .eq("race_id", race_id);

    type RawRow = { result_year: number; result_status: string; finish_seconds: number | null; gender: string | null };
    const rows = (rawRows ?? []) as RawRow[];

    if (rows.length === 0 && !mlRow) {
      return NextResponse.json({ has_data: false } satisfies FieldStatsResponse);
    }

    // ── Year-by-year breakdown ────────────────────────────────────────────────
    const yearMap = new Map<number, { finishTimes: number[]; starters: number; dnfs: number }>();
    for (const r of rows) {
      if (!yearMap.has(r.result_year)) yearMap.set(r.result_year, { finishTimes: [], starters: 0, dnfs: 0 });
      const yr = yearMap.get(r.result_year)!;
      yr.starters++;
      if (r.result_status === "DNF") {
        yr.dnfs++;
      } else if (r.finish_seconds && r.finish_seconds > 0) {
        yr.finishTimes.push(r.finish_seconds);
      }
    }

    const by_year = [...yearMap.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, data]) => ({
        year,
        finishers: data.finishTimes.length,
        starters:  data.starters,
        dnf_rate:  data.starters > 0 ? data.dnfs / data.starters : 0,
        median_seconds: data.finishTimes.length > 0 ? median(data.finishTimes) : null,
      }));

    // ── Gender split ─────────────────────────────────────────────────────────
    const genderMap = new Map<string, { count: number; times: number[] }>();
    for (const r of rows) {
      const g = r.gender?.trim() || "Unknown";
      if (!genderMap.has(g)) genderMap.set(g, { count: 0, times: [] });
      const gd = genderMap.get(g)!;
      if (r.finish_seconds && r.finish_seconds > 0 && r.result_status !== "DNF") {
        gd.count++;
        gd.times.push(r.finish_seconds);
      }
    }
    const by_gender = [...genderMap.entries()]
      .filter(([, d]) => d.count > 0)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([gender, data]) => ({
        gender,
        count:          data.count,
        median_seconds: data.times.length > 0 ? median(data.times) : null,
      }));

    // ── Finish time distribution (all years combined, 20 buckets) ────────────
    const allFinishTimes = rows
      .filter(r => r.finish_seconds && r.finish_seconds > 0 && r.result_status !== "DNF")
      .map(r => r.finish_seconds!)
      .sort((a, b) => a - b);

    let distribution: { min_min: number; max_min: number; count: number }[] = [];
    let p10_seconds: number | null = null;
    let p90_seconds: number | null = null;

    if (allFinishTimes.length > 0) {
      const minS = allFinishTimes[0];
      const maxS = allFinishTimes[allFinishTimes.length - 1];
      const bucketCount = 20;
      const bw = Math.max((maxS - minS) / bucketCount, 1);
      distribution = Array.from({ length: bucketCount }, (_, i) => {
        const lo = minS + i * bw;
        const hi = minS + (i + 1) * bw;
        return {
          min_min: Math.round(lo / 60),
          max_min: Math.round(hi / 60),
          count:   allFinishTimes.filter(t => t >= lo && t < hi).length,
        };
      });
      p10_seconds = pctile(allFinishTimes, 10);
      p90_seconds = pctile(allFinishTimes, 90);
    }

    // ── Aggregate — prefer race_ml_features where available ──────────────────
    const aggregate = {
      total_finishers: mlRow?.total_finishers  ?? allFinishTimes.length,
      total_starters:  mlRow?.total_starters   ?? rows.length,
      dnf_rate:        mlRow?.dnf_rate         ?? (rows.length > 0 ? rows.filter(r => r.result_status === "DNF").length / rows.length : 0),
      years_of_data:   mlRow?.years_of_data    ?? by_year.length,
      median_seconds:  mlRow?.field_median_seconds ?? (allFinishTimes.length > 0 ? median(allFinishTimes) : null),
      p25_seconds:     mlRow?.field_p25_seconds    ?? (allFinishTimes.length > 0 ? pctile(allFinishTimes, 25) : null),
      p75_seconds:     mlRow?.field_p75_seconds    ?? (allFinishTimes.length > 0 ? pctile(allFinishTimes, 75) : null),
      p10_seconds,
      p90_seconds,
      fastest_seconds: allFinishTimes.length > 0 ? allFinishTimes[0] : null,
      cluster_label:   mlRow?.cluster_label ?? null,
    };

    return NextResponse.json({
      has_data:    true,
      aggregate,
      distribution,
      by_year,
      by_gender,
    } satisfies FieldStatsResponse);
  } catch (err) {
    console.error("[race-intelligence/field-stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

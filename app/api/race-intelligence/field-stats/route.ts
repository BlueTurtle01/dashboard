/**
 * GET /api/race-intelligence/field-stats?race_id=...
 *
 * Returns historical field statistics for a race — aggregate, year-by-year,
 * gender split, and finish-time distribution.  All heavy aggregations run
 * server-side in Postgres via get_race_field_stats() to avoid the PostgREST
 * 1,000-row default cap.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

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

interface RpcResult {
  by_year:      { year: number; finishers: number; starters: number; dnf_rate: number; median_seconds: number | null }[];
  by_gender:    { gender: string; count: number; median_seconds: number | null }[];
  percentiles:  { p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null; fastest: number | null } | null;
  distribution: { min_min: number; max_min: number; count: number }[];
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

    // ── All aggregations via server-side Postgres function ────────────────────
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc("get_race_field_stats", { p_race_id: race_id });

    if (rpcErr) {
      console.error("[race-intelligence/field-stats] RPC error:", rpcErr);
    }

    const rpc = rpcData as RpcResult | null;

    if (!mlRow && (!rpc || (rpc.by_year?.length ?? 0) === 0)) {
      return NextResponse.json({ has_data: false } satisfies FieldStatsResponse);
    }

    const perc = rpc?.percentiles;

    const aggregate = {
      total_finishers: mlRow?.total_finishers  ?? rpc?.by_year?.reduce((s, y) => s + y.finishers, 0) ?? 0,
      total_starters:  mlRow?.total_starters   ?? rpc?.by_year?.reduce((s, y) => s + y.starters,  0) ?? 0,
      dnf_rate:        mlRow?.dnf_rate         ?? 0,
      years_of_data:   mlRow?.years_of_data    ?? (rpc?.by_year?.length ?? 0),
      median_seconds:  mlRow?.field_median_seconds ?? perc?.p50  ?? null,
      p25_seconds:     mlRow?.field_p25_seconds    ?? perc?.p25  ?? null,
      p75_seconds:     mlRow?.field_p75_seconds    ?? perc?.p75  ?? null,
      p10_seconds:     perc?.p10     ?? null,
      p90_seconds:     perc?.p90     ?? null,
      fastest_seconds: perc?.fastest ?? null,
      cluster_label:   mlRow?.cluster_label ?? null,
    };

    return NextResponse.json({
      has_data:     true,
      aggregate,
      distribution: rpc?.distribution ?? [],
      by_year:      rpc?.by_year      ?? [],
      by_gender:    rpc?.by_gender    ?? [],
    } satisfies FieldStatsResponse);
  } catch (err) {
    console.error("[race-intelligence/field-stats]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

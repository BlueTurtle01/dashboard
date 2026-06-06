import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { AthleteSearchResult } from "@/lib/types/athlete-similarity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search")?.trim() ?? "";
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 100);

  const supabase = await createClient();

  let query = supabase
    .from("als_athlete_profiles")
    .select("id, athlete_key, race_count, finish_count, dnf_count, dnf_rate, avg_perf_index, recency_perf_index, avg_flat_equiv_km, max_flat_equiv_km, avg_ascent_m, max_ascent_m, avg_difficulty_ratio, first_result_year, last_result_year, career_span_years, computed_at")
    .order("race_count", { ascending: false })
    .limit(limit);

  if (search.length > 0) {
    query = query.ilike("athlete_key", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const athleteKeys = (data ?? []).map((r) => r.athlete_key);

  // Fetch cluster assignments separately (no FK relationship defined)
  const clusterMap: Record<string, number | null> = {};
  if (athleteKeys.length > 0) {
    const { data: clusterData } = await supabase
      .from("als_athlete_clusters")
      .select("athlete_key, cluster_id")
      .in("athlete_key", athleteKeys);
    for (const c of clusterData ?? []) clusterMap[c.athlete_key] = c.cluster_id;
  }

  const uniqueClusterIds = [
    ...new Set(Object.values(clusterMap).filter((id): id is number => id !== null)),
  ];
  const summaryMap: Record<number, string | null> = {};
  if (uniqueClusterIds.length > 0) {
    const { data: summaries } = await supabase
      .from("als_cluster_summaries")
      .select("cluster_id, auto_label, custom_label")
      .in("cluster_id", uniqueClusterIds);
    for (const s of summaries ?? []) {
      summaryMap[s.cluster_id] = s.custom_label ?? s.auto_label ?? null;
    }
  }

  const results: AthleteSearchResult[] = (data ?? []).map((r) => {
    const cluster_id = clusterMap[r.athlete_key] ?? null;
    return {
      ...r,
      feature_vector: [],
      cluster_id,
      cluster_label: cluster_id !== null ? (summaryMap[cluster_id] ?? null) : null,
    } as AthleteSearchResult;
  });

  // Fall back to race_results for athletes not in als_athlete_profiles (e.g. single-race athletes)
  if (search.length > 0 && results.length < limit) {
    const existingKeys = new Set(results.map((r) => r.athlete_key));
    const { data: rawRows } = await supabase
      .from("race_results")
      .select("full_name, result_year, result_status, finish_seconds")
      .ilike("full_name", `%${search}%`)
      .not("full_name", "is", null)
      .neq("full_name", "")
      .neq("full_name", "Anonymous")
      .limit(500);

    const nameGroups: Record<string, { count: number; years: number[]; finishes: number }> = {};
    for (const r of rawRows ?? []) {
      const name = r.full_name as string;
      if (!name || existingKeys.has(name)) continue;
      if (!nameGroups[name]) nameGroups[name] = { count: 0, years: [], finishes: 0 };
      nameGroups[name].count++;
      if (r.result_year) nameGroups[name].years.push(r.result_year as number);
      if (["FINISHED", "UNKNOWN"].includes(r.result_status as string) && r.finish_seconds) {
        nameGroups[name].finishes++;
      }
    }

    const remaining = limit - results.length;
    for (const [name, stats] of Object.entries(nameGroups).slice(0, remaining)) {
      const firstYear = stats.years.length > 0 ? Math.min(...stats.years) : null;
      const lastYear  = stats.years.length > 0 ? Math.max(...stats.years) : null;
      results.push({
        id: "",
        athlete_key:          name,
        race_count:           stats.count,
        finish_count:         stats.finishes,
        dnf_count:            stats.count - stats.finishes,
        dnf_rate:             null,
        avg_perf_index:       null,
        recency_perf_index:   null,
        avg_flat_equiv_km:    null,
        max_flat_equiv_km:    null,
        avg_ascent_m:         null,
        max_ascent_m:         null,
        avg_difficulty_ratio: null,
        first_result_year:    firstYear,
        last_result_year:     lastYear,
        career_span_years:    firstYear !== null && lastYear !== null ? lastYear - firstYear + 1 : null,
        computed_at:          "",
        feature_vector:       [],
        cluster_id:           null,
        cluster_label:        null,
      } as AthleteSearchResult);
    }
  }

  return NextResponse.json({ athletes: results, total: results.length });
}

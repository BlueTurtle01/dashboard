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
    .select(`
      id, athlete_key, race_count, finish_count, dnf_count, dnf_rate,
      avg_perf_index, recency_perf_index,
      avg_flat_equiv_km, max_flat_equiv_km,
      avg_ascent_m, max_ascent_m, avg_difficulty_ratio,
      first_result_year, last_result_year, career_span_years, computed_at,
      als_athlete_clusters ( cluster_id, cluster_method )
    `)
    .order("race_count", { ascending: false })
    .limit(limit);

  if (search.length > 0) {
    query = query.ilike("athlete_key", `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten cluster join and look up cluster label
  const athleteKeys = (data ?? []).map((r) => r.athlete_key);
  const clusterIds = (data ?? [])
    .map((r) => {
      const c = Array.isArray(r.als_athlete_clusters) ? r.als_athlete_clusters[0] : r.als_athlete_clusters;
      return c?.cluster_id;
    })
    .filter((id): id is number => id !== undefined && id !== null);

  let summaryMap: Record<number, string | null> = {};
  if (clusterIds.length > 0) {
    const { data: summaries } = await supabase
      .from("als_cluster_summaries")
      .select("cluster_id, auto_label, custom_label")
      .in("cluster_id", [...new Set(clusterIds)]);
    for (const s of summaries ?? []) {
      summaryMap[s.cluster_id] = s.custom_label ?? s.auto_label ?? null;
    }
  }

  const results: AthleteSearchResult[] = (data ?? []).map((r) => {
    const clusterRow = Array.isArray(r.als_athlete_clusters)
      ? r.als_athlete_clusters[0]
      : r.als_athlete_clusters;
    const cluster_id = clusterRow?.cluster_id ?? null;
    return {
      ...r,
      feature_vector: [],  // omit large vector from search results
      cluster_id,
      cluster_label: cluster_id !== null ? (summaryMap[cluster_id] ?? null) : null,
    } as AthleteSearchResult;
  });

  return NextResponse.json({ athletes: results, total: results.length });
}

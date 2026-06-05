import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { AlAthleteProjection } from "@/lib/types/athlete-similarity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "5000", 10), 20000);
  const clusterId  = searchParams.get("cluster_id");

  const supabase = await createClient();

  // Fetch projection + cluster assignment in one joined query via athlete_key
  let query = supabase
    .from("als_athlete_projection")
    .select(`
      athlete_key, proj_x, proj_y, proj_method, computed_at,
      als_athlete_clusters ( cluster_id ),
      als_athlete_profiles ( race_count )
    `)
    .limit(limit);

  // Apply cluster filter if requested
  if (clusterId !== null) {
    const clusterIdNum = parseInt(clusterId, 10);
    if (!isNaN(clusterIdNum)) {
      // We can't filter projection by cluster_id directly since it's a join,
      // so fetch all and filter in memory (acceptable for <= 20k athletes)
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clusterId_num = clusterId !== null ? parseInt(clusterId, 10) : null;

  const points: AlAthleteProjection[] = (data ?? [])
    .map((r) => {
      const clusterRow = Array.isArray(r.als_athlete_clusters)
        ? r.als_athlete_clusters[0]
        : r.als_athlete_clusters;
      const profileRow = Array.isArray(r.als_athlete_profiles)
        ? r.als_athlete_profiles[0]
        : r.als_athlete_profiles;
      return {
        athlete_key: r.athlete_key,
        proj_x: r.proj_x,
        proj_y: r.proj_y,
        proj_method: r.proj_method,
        computed_at: r.computed_at,
        cluster_id: clusterRow?.cluster_id ?? undefined,
        race_count: profileRow?.race_count ?? undefined,
      };
    })
    .filter((p) => clusterId_num === null || p.cluster_id === clusterId_num);

  // Enrich with cluster labels
  const uniqueClusterIds = [...new Set(points.map((p) => p.cluster_id).filter((id): id is number => id !== undefined))];
  const labelMap: Record<number, string> = {};
  if (uniqueClusterIds.length > 0) {
    const { data: summaries } = await supabase
      .from("als_cluster_summaries")
      .select("cluster_id, auto_label, custom_label")
      .in("cluster_id", uniqueClusterIds);
    for (const s of summaries ?? []) {
      labelMap[s.cluster_id] = s.custom_label ?? s.auto_label ?? `Cluster ${s.cluster_id}`;
    }
  }

  const enrichedPoints = points.map((p) => ({
    ...p,
    cluster_label: p.cluster_id !== undefined ? (labelMap[p.cluster_id] ?? null) : null,
  }));

  return NextResponse.json({ points: enrichedPoints, method: data?.[0]?.proj_method ?? null });
}

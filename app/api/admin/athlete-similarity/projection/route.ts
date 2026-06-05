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
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "5000", 10), 20000);
  const clusterId = searchParams.get("cluster_id");

  const supabase = await createClient();

  // Fetch projection points
  const { data: projData, error: projErr } = await supabase
    .from("als_athlete_projection")
    .select("athlete_key, proj_x, proj_y, proj_method, computed_at")
    .limit(limit);

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projData || projData.length === 0) {
    return NextResponse.json({ points: [], method: null });
  }

  const athleteKeys = projData.map((r) => r.athlete_key);

  // Fetch cluster assignments and race counts in parallel
  const [{ data: clusterData }, { data: profileData }] = await Promise.all([
    supabase
      .from("als_athlete_clusters")
      .select("athlete_key, cluster_id")
      .in("athlete_key", athleteKeys),
    supabase
      .from("als_athlete_profiles")
      .select("athlete_key, race_count")
      .in("athlete_key", athleteKeys),
  ]);

  const clusterMap: Record<string, number> = {};
  for (const c of clusterData ?? []) clusterMap[c.athlete_key] = c.cluster_id;

  const raceCountMap: Record<string, number> = {};
  for (const p of profileData ?? []) raceCountMap[p.athlete_key] = p.race_count;

  // Apply cluster filter
  const clusterIdNum = clusterId !== null ? parseInt(clusterId, 10) : null;

  let points: AlAthleteProjection[] = projData.map((r) => ({
    athlete_key: r.athlete_key,
    proj_x:      r.proj_x,
    proj_y:      r.proj_y,
    proj_method: r.proj_method,
    computed_at: r.computed_at,
    cluster_id:  clusterMap[r.athlete_key] ?? undefined,
    race_count:  raceCountMap[r.athlete_key] ?? undefined,
  }));

  if (clusterIdNum !== null) {
    points = points.filter((p) => p.cluster_id === clusterIdNum);
  }

  // Enrich with cluster labels
  const uniqueClusterIds = [
    ...new Set(points.map((p) => p.cluster_id).filter((id): id is number => id !== undefined)),
  ];
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

  return NextResponse.json({ points: enrichedPoints, method: projData[0]?.proj_method ?? null });
}

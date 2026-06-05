import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clusterId: string }> },
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { clusterId } = await params;
  const clusterIdNum = parseInt(clusterId, 10);
  if (isNaN(clusterIdNum)) {
    return NextResponse.json({ error: "Invalid cluster ID" }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const supabase = await createClient();

  // Fetch cluster members
  const { data: members, error } = await supabase
    .from("als_athlete_clusters")
    .select("athlete_key, cluster_method, membership_prob")
    .eq("cluster_id", clusterIdNum)
    .order("athlete_key")
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("als_athlete_clusters")
    .select("*", { count: "exact", head: true })
    .eq("cluster_id", clusterIdNum);

  // Enrich with profile data (separate query — no FK relationship defined)
  const athleteKeys = (members ?? []).map((m) => m.athlete_key);
  const profileMap: Record<string, {
    race_count: number; finish_count: number; dnf_rate: number | null;
    avg_flat_equiv_km: number | null; avg_ascent_m: number | null;
    avg_perf_index: number | null; first_result_year: number | null; last_result_year: number | null;
  }> = {};

  if (athleteKeys.length > 0) {
    const { data: profiles } = await supabase
      .from("als_athlete_profiles")
      .select("athlete_key, race_count, finish_count, dnf_rate, avg_flat_equiv_km, avg_ascent_m, avg_perf_index, first_result_year, last_result_year")
      .in("athlete_key", athleteKeys);
    for (const p of profiles ?? []) profileMap[p.athlete_key] = p;
  }

  const enriched = (members ?? []).map((m) => ({
    ...m,
    profile: profileMap[m.athlete_key] ?? null,
  }));

  return NextResponse.json({
    cluster_id: clusterIdNum,
    total: count ?? 0,
    members: enriched,
  });
}

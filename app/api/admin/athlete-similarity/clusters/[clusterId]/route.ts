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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const supabase = await createClient();

  const { data: members, error } = await supabase
    .from("als_athlete_clusters")
    .select(`
      athlete_key, cluster_method, membership_prob,
      als_athlete_profiles (
        race_count, finish_count, dnf_rate,
        avg_flat_equiv_km, avg_ascent_m, avg_perf_index,
        first_result_year, last_result_year
      )
    `)
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

  return NextResponse.json({
    cluster_id: clusterIdNum,
    total: count ?? 0,
    members: members ?? [],
  });
}

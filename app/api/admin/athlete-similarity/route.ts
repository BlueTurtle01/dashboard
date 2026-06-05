import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { PipelineStatus } from "@/lib/types/athlete-similarity";

export const dynamic = "force-dynamic";

export async function GET() {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const [
    { count: profileCount },
    { count: similarityCount },
    { count: clusterCount },
    { count: projectionCount },
    { count: clusterSummaryCount },
    { data: recentRuns },
  ] = await Promise.all([
    supabase.from("als_athlete_profiles").select("*", { count: "exact", head: true }),
    supabase.from("als_athlete_similarity").select("*", { count: "exact", head: true }),
    supabase.from("als_athlete_clusters").select("*", { count: "exact", head: true }),
    supabase.from("als_athlete_projection").select("*", { count: "exact", head: true }),
    supabase.from("als_cluster_summaries").select("*", { count: "exact", head: true }),
    supabase
      .from("als_pipeline_runs")
      .select("id, step, status, params, log_lines, error_msg, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const status: PipelineStatus = {
    counts: {
      profiles: profileCount ?? 0,
      similarities: similarityCount ?? 0,
      clusters: clusterCount ?? 0,
      projectionPoints: projectionCount ?? 0,
      clusterSummaries: clusterSummaryCount ?? 0,
    },
    recentRuns: recentRuns ?? [],
  };

  return NextResponse.json(status);
}

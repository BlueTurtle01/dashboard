import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fitGMM } from "@/lib/race-analysis/clustering";
import type { AthleteCareerFeature, GMMCluster } from "@/lib/race-analysis/clustering";
import type { RaceSequenceRow } from "@/app/api/athlete-network/race-sequences/route";

export const dynamic = "force-dynamic";

export interface ClusterProfile {
  cluster_id: number;
  label: string;
  athlete_count: number;
  pct_of_sequence: number;
  enrichment: number;
}

export interface ClusteredSequenceRow extends RaceSequenceRow {
  cluster_profile: ClusterProfile[];
  experience_bias_score: number;
  clusters: GMMCluster[];
}

interface FullSequenceRow extends RaceSequenceRow {
  athlete_names: string[];
}

export async function GET(req: NextRequest) {
  const min = Math.max(2, Math.min(20, Number(req.nextUrl.searchParams.get("min") ?? "2")));
  const max = Math.max(min, Math.min(20, Number(req.nextUrl.searchParams.get("max") ?? "8")));

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

  // Fetch both in parallel
  const [featuresRes, seqRes] = await Promise.all([
    supabase.rpc("al_athlete_career_features"),
    supabase.rpc("al_race_sequences_full", { p_min_length: min, p_max_length: max }),
  ]);

  if (featuresRes.error) {
    return NextResponse.json({ error: featuresRes.error.message }, { status: 500 });
  }
  if (seqRes.error) {
    return NextResponse.json({ error: seqRes.error.message }, { status: 500 });
  }

  const athletes = (featuresRes.data ?? []) as AthleteCareerFeature[];
  const sequences = (seqRes.data ?? []) as FullSequenceRow[];

  if (athletes.length === 0 || sequences.length === 0) {
    return NextResponse.json([]);
  }

  const { assignments, clusters, cluster_fractions } = fitGMM(athletes);
  const K = clusters.length;

  const result: ClusteredSequenceRow[] = sequences.map((seq) => {
    const names = seq.athlete_names ?? [];
    const totalInSeq = names.length;

    // Count athletes per cluster in this sequence
    const clusterCounts = new Array(K).fill(0);
    for (const name of names) {
      const k = assignments.get(name);
      if (k !== undefined) clusterCounts[k]++;
    }

    const cluster_profile: ClusterProfile[] = clusters.map((c, k) => {
      const pct = totalInSeq > 0 ? clusterCounts[k] / totalInSeq : 0;
      const baseline = cluster_fractions[k];
      const enrichment = baseline > 0 ? Math.round((pct / baseline) * 100) / 100 : 0;
      return {
        cluster_id: k,
        label: c.label,
        athlete_count: clusterCounts[k],
        pct_of_sequence: Math.round(pct * 1000) / 1000,
        enrichment,
      };
    });

    // Bias score: max enrichment in the top two experience clusters
    const topTwo = cluster_profile.slice(-2);
    const experience_bias_score = Math.max(...topTwo.map((p) => p.enrichment));

    const { athlete_names: _names, ...rest } = seq;
    return {
      ...rest,
      cluster_profile,
      experience_bias_score: Math.round(experience_bias_score * 100) / 100,
      clusters,
    };
  });

  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { AthleteDetail } from "@/lib/types/athlete-similarity";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const athleteKey = decodeURIComponent(id);
  const supabase = await createClient();

  // Fetch profile
  const { data: profile, error: profileErr } = await supabase
    .from("als_athlete_profiles")
    .select("*")
    .eq("athlete_key", athleteKey)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "Athlete profile not found" }, { status: 404 });
  }

  // Fetch cluster assignment
  const { data: clusterRow } = await supabase
    .from("als_athlete_clusters")
    .select("cluster_id, cluster_method")
    .eq("athlete_key", athleteKey)
    .maybeSingle();

  // Fetch cluster label
  let clusterLabel: string | null = null;
  if (clusterRow?.cluster_id !== undefined && clusterRow.cluster_id !== null) {
    const { data: summary } = await supabase
      .from("als_cluster_summaries")
      .select("auto_label, custom_label")
      .eq("cluster_id", clusterRow.cluster_id)
      .maybeSingle();
    clusterLabel = summary?.custom_label ?? summary?.auto_label ?? null;
  }

  // Fetch top-50 similar athletes
  const { data: simRows } = await supabase
    .from("als_athlete_similarity")
    .select("athlete_key_b, cosine_score, rank")
    .eq("athlete_key_a", athleteKey)
    .order("cosine_score", { ascending: false })
    .limit(50);

  const similarKeys = (simRows ?? []).map((r) => r.athlete_key_b);
  let profileMap: Record<string, {
    race_count: number; finish_count: number; dnf_rate: number | null;
    avg_flat_equiv_km: number | null; avg_ascent_m: number | null; avg_perf_index: number | null;
  }> = {};
  let similarClusterMap: Record<string, number | null> = {};

  if (similarKeys.length > 0) {
    const { data: simProfiles } = await supabase
      .from("als_athlete_profiles")
      .select("athlete_key, race_count, finish_count, dnf_rate, avg_flat_equiv_km, avg_ascent_m, avg_perf_index")
      .in("athlete_key", similarKeys);
    for (const p of simProfiles ?? []) {
      profileMap[p.athlete_key] = p;
    }

    const { data: simClusters } = await supabase
      .from("als_athlete_clusters")
      .select("athlete_key, cluster_id")
      .in("athlete_key", similarKeys);
    for (const c of simClusters ?? []) {
      similarClusterMap[c.athlete_key] = c.cluster_id;
    }

    const allClusterIds = Object.values(similarClusterMap).filter((id): id is number => id !== null);
    const { data: simSummaries } = await supabase
      .from("als_cluster_summaries")
      .select("cluster_id, auto_label, custom_label")
      .in("cluster_id", [...new Set(allClusterIds)]);
    const simSummaryMap: Record<number, string | null> = {};
    for (const s of simSummaries ?? []) {
      simSummaryMap[s.cluster_id] = s.custom_label ?? s.auto_label ?? null;
    }
    // Augment cluster map with labels
    for (const key of similarKeys) {
      const cid = similarClusterMap[key];
      (similarClusterMap as Record<string, string | null | number>)[`${key}__label`] =
        cid !== null ? (simSummaryMap[cid] ?? null) : null;
    }
  }

  const similar_athletes = (simRows ?? []).map((row) => {
    const p = profileMap[row.athlete_key_b] ?? {};
    const cluster_id = similarClusterMap[row.athlete_key_b] ?? null;
    const cluster_label = cluster_id !== null
      ? ((similarClusterMap as Record<string, string | null | number>)[`${row.athlete_key_b}__label`] as string | null)
      : null;
    return {
      athlete_key: row.athlete_key_b,
      cosine_score: row.cosine_score,
      rank: row.rank,
      race_count: p.race_count ?? 0,
      finish_count: p.finish_count ?? 0,
      dnf_rate: p.dnf_rate ?? null,
      avg_flat_equiv_km: p.avg_flat_equiv_km ?? null,
      avg_ascent_m: p.avg_ascent_m ?? null,
      avg_perf_index: p.avg_perf_index ?? null,
      cluster_id,
      cluster_label,
    };
  });

  // Fetch race history
  const { data: races } = await supabase
    .from("race_results")
    .select(`
      race_id, result_year, result_status, finish_seconds, position,
      races ( name ),
      race_profiles ( flat_equivalent_km, total_ascent_m )
    `)
    .eq("full_name", athleteKey)
    .order("result_year", { ascending: false })
    .limit(100);

  const raceEntries = (races ?? []).map((r) => {
    const raceName = Array.isArray(r.races) ? r.races[0]?.name : (r.races as { name: string } | null)?.name;
    const rp = Array.isArray(r.race_profiles) ? r.race_profiles[0] : r.race_profiles;
    return {
      race_id: r.race_id,
      race_name: raceName ?? "Unknown",
      result_year: r.result_year,
      result_status: r.result_status,
      finish_seconds: r.finish_seconds,
      position: r.position,
      flat_equivalent_km: rp?.flat_equivalent_km ?? null,
      total_ascent_m: rp?.total_ascent_m ?? null,
    };
  });

  const detail: AthleteDetail = {
    ...profile,
    cluster_id: clusterRow?.cluster_id ?? null,
    cluster_label: clusterLabel,
    similar_athletes,
    races: raceEntries,
  };

  return NextResponse.json({ athlete: detail });
}

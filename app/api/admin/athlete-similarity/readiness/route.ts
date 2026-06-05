import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FitRating = "covered" | "stretch" | "significant_gap";
type ReadinessRating = "well_prepared" | "ready_with_caveats" | "a_step_up" | "major_challenge";

function fitRating(athleteMax: number | null, raceRequires: number | null): FitRating {
  if (athleteMax === null || raceRequires === null || raceRequires === 0) return "covered";
  const ratio = athleteMax / raceRequires;
  if (ratio >= 1.0) return "covered";
  if (ratio >= 0.7) return "stretch";
  return "significant_gap";
}

function overallRating(
  distRating: FitRating,
  elevRating: FitRating,
): { rating: ReadinessRating; reason: string } {
  if (distRating === "significant_gap" && elevRating === "significant_gap") {
    return { rating: "major_challenge", reason: "Both race distance and elevation significantly exceed your experience" };
  }
  if (distRating === "significant_gap") {
    return { rating: "a_step_up", reason: "Race distance significantly exceeds your prior experience" };
  }
  if (elevRating === "significant_gap") {
    return { rating: "a_step_up", reason: "Race elevation significantly exceeds your prior experience" };
  }
  if (distRating === "stretch" || elevRating === "stretch") {
    const metric = distRating === "stretch" ? "distance" : "elevation";
    return { rating: "ready_with_caveats", reason: `Race ${metric} is a stretch beyond your typical experience` };
  }
  return { rating: "well_prepared", reason: "Race distance and elevation are within your prior experience" };
}

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const athleteKey = searchParams.get("athlete_key")?.trim() ?? "";
  const raceId     = searchParams.get("race_id")?.trim() ?? "";

  if (!athleteKey || !raceId) {
    return NextResponse.json({ error: "athlete_key and race_id are required" }, { status: 400 });
  }

  const supabase = await createClient();

  // ── 1. Parallel: athlete profile + race profile + race name ───────────────
  const [
    { data: athleteProfile, error: profileErr },
    { data: raceProfile },
    { data: raceRow, error: raceErr },
  ] = await Promise.all([
    supabase
      .from("als_athlete_profiles")
      .select("max_flat_equiv_km, max_ascent_m, avg_difficulty_ratio")
      .eq("athlete_key", athleteKey)
      .maybeSingle(),
    supabase
      .from("race_profiles")
      .select("flat_equivalent_km, total_ascent_m, difficulty_ratio")
      .eq("race_id", raceId)
      .maybeSingle(),
    supabase
      .from("races")
      .select("name")
      .eq("id", raceId)
      .maybeSingle(),
  ]);

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
  if (!athleteProfile) return NextResponse.json({ error: "Athlete not found — run the pipeline first" }, { status: 404 });
  if (raceErr || !raceRow) return NextResponse.json({ error: "Race not found" }, { status: 404 });

  // ── 2. Gap analysis ───────────────────────────────────────────────────────
  const distRating = fitRating(athleteProfile.max_flat_equiv_km ?? null, raceProfile?.flat_equivalent_km ?? null);
  const elevRating = fitRating(athleteProfile.max_ascent_m ?? null, raceProfile?.total_ascent_m ?? null);
  const diffRating = fitRating(athleteProfile.avg_difficulty_ratio ?? null, raceProfile?.difficulty_ratio ?? null);

  const gap_analysis = {
    distance:   { athlete_max_km: athleteProfile.max_flat_equiv_km ?? null,  race_requires_km: raceProfile?.flat_equivalent_km ?? null, rating: distRating },
    elevation:  { athlete_max_m:  athleteProfile.max_ascent_m ?? null,       race_requires_m:  raceProfile?.total_ascent_m ?? null,      rating: elevRating },
    difficulty: { athlete_avg:    athleteProfile.avg_difficulty_ratio ?? null, race_ratio:      raceProfile?.difficulty_ratio ?? null,    rating: diffRating },
  };

  // ── 3. Peer outcome ───────────────────────────────────────────────────────
  const { data: simRows } = await supabase
    .from("als_athlete_similarity")
    .select("athlete_key_b")
    .eq("athlete_key_a", athleteKey)
    .order("cosine_score", { ascending: false })
    .limit(50);

  const similarKeys = (simRows ?? []).map((r) => r.athlete_key_b);

  let peer_outcome = { similar_entrants: 0, finish_rate: null as number | null,
    avg_finish_seconds: null as number | null, best_finish_seconds: null as number | null, limited_data: true };

  if (similarKeys.length > 0) {
    const { data: peerResults } = await supabase
      .from("race_results")
      .select("result_status, finish_seconds")
      .eq("race_id", raceId)
      .in("full_name", similarKeys);

    if (peerResults && peerResults.length > 0) {
      const finishers = peerResults.filter((r) => r.result_status === "FINISHED" || r.result_status === "UNKNOWN");
      const times = finishers.map((r) => r.finish_seconds).filter((s): s is number => s !== null && s > 0);
      peer_outcome = {
        similar_entrants: peerResults.length,
        finish_rate: peerResults.length > 0 ? finishers.length / peerResults.length : null,
        avg_finish_seconds: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
        best_finish_seconds: times.length > 0 ? Math.min(...times) : null,
        limited_data: peerResults.length < 3,
      };
    }
  }

  // ── 4. Cluster outcome ────────────────────────────────────────────────────
  const { data: clusterRow } = await supabase
    .from("als_athlete_clusters")
    .select("cluster_id")
    .eq("athlete_key", athleteKey)
    .maybeSingle();

  let cluster_outcome = { cluster_id: null as number | null, cluster_label: null as string | null,
    cluster_entrants: 0, cluster_finish_rate: null as number | null };

  if (clusterRow?.cluster_id !== undefined && clusterRow.cluster_id !== null) {
    const clusterId = clusterRow.cluster_id;
    const [{ data: summaryRow }, { data: memberRows }] = await Promise.all([
      supabase.from("als_cluster_summaries").select("auto_label, custom_label").eq("cluster_id", clusterId).maybeSingle(),
      supabase.from("als_athlete_clusters").select("athlete_key").eq("cluster_id", clusterId),
    ]);
    const memberKeys = (memberRows ?? []).map((m) => m.athlete_key);
    let clusterEntrants = 0;
    let clusterFinishRate: number | null = null;
    if (memberKeys.length > 0) {
      const { data: clusterResults } = await supabase
        .from("race_results")
        .select("result_status")
        .eq("race_id", raceId)
        .in("full_name", memberKeys);
      if (clusterResults && clusterResults.length > 0) {
        const finishers = clusterResults.filter((r) => r.result_status === "FINISHED" || r.result_status === "UNKNOWN").length;
        clusterEntrants  = clusterResults.length;
        clusterFinishRate = finishers / clusterEntrants;
      }
    }
    cluster_outcome = {
      cluster_id:          clusterId,
      cluster_label:       summaryRow?.custom_label ?? summaryRow?.auto_label ?? null,
      cluster_entrants:    clusterEntrants,
      cluster_finish_rate: clusterFinishRate,
    };
  }

  // ── 5. Own history ────────────────────────────────────────────────────────
  const { data: ownRows } = await supabase
    .from("race_results")
    .select("result_year, result_status, finish_seconds, position")
    .eq("race_id", raceId)
    .eq("full_name", athleteKey)
    .order("result_year", { ascending: false });

  const own_history = (ownRows ?? []).map((r) => ({
    year: r.result_year,
    result_status: r.result_status,
    finish_seconds: r.finish_seconds,
    position: r.position,
  }));

  // ── 6. Overall rating ─────────────────────────────────────────────────────
  const { rating: overall_rating, reason: rating_reason } = overallRating(distRating, elevRating);

  return NextResponse.json({
    athlete_key: athleteKey,
    race_id:     raceId,
    race_name:   raceRow.name,
    gap_analysis,
    peer_outcome,
    cluster_outcome,
    own_history,
    overall_rating,
    rating_reason,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { TestAthleteResult } from "@/lib/types/athlete-similarity";

export const dynamic = "force-dynamic";

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// Build human-readable similarity reasons by comparing feature values
function buildReasons(
  queryVec: number[],
  targetVec: number[],
  targetProfile: Record<string, number | null>,
): string[] {
  const FEAT_LABELS = [
    "performance vs field",
    "DNF rate",
    "typical race distance",
    "typical elevation gain",
    "course difficulty",
    "longest distance attempted",
    "years active",
    "race volume",
  ];
  const THRESHOLDS = [0.3, 0.3, 0.4, 0.4, 0.3, 0.4, 0.5, 0.4];

  const reasons: string[] = [];
  for (let i = 0; i < queryVec.length; i++) {
    const diff = Math.abs(queryVec[i] - targetVec[i]);
    if (diff <= THRESHOLDS[i]) {
      reasons.push(`Similar ${FEAT_LABELS[i]}`);
    }
  }
  return reasons.slice(0, 5);
}

export async function POST(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    mode: "existing" | "manual";
    athlete_key?: string;
    vector?: number[];
    top_n?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const topN = Math.min(body.top_n ?? 20, 50);
  const supabase = await createClient();

  let queryVec: number[] | null = null;
  let excludeKey: string | null = null;

  if (body.mode === "existing") {
    if (!body.athlete_key) {
      return NextResponse.json({ error: "athlete_key required for mode=existing" }, { status: 400 });
    }
    excludeKey = body.athlete_key;
    const { data: profile, error } = await supabase
      .from("als_athlete_profiles")
      .select("feature_vector")
      .eq("athlete_key", body.athlete_key)
      .single();
    if (error || !profile) {
      return NextResponse.json({ error: "Athlete not found in profiles" }, { status: 404 });
    }
    queryVec = typeof profile.feature_vector === "string"
      ? JSON.parse(profile.feature_vector)
      : profile.feature_vector;
  } else if (body.mode === "manual") {
    if (!body.vector || !Array.isArray(body.vector) || body.vector.length !== 8) {
      return NextResponse.json(
        { error: "vector must be an array of 8 numbers for mode=manual" },
        { status: 400 },
      );
    }
    queryVec = body.vector.map(Number);
  } else {
    return NextResponse.json({ error: "mode must be 'existing' or 'manual'" }, { status: 400 });
  }

  // Load all profiles — batch if large
  const { data: profiles, error: profilesErr } = await supabase
    .from("als_athlete_profiles")
    .select(`
      athlete_key, feature_vector, race_count, finish_count, dnf_rate,
      avg_flat_equiv_km, avg_ascent_m, avg_perf_index, max_flat_equiv_km,
      first_result_year, last_result_year
    `);

  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  }

  // Compute cosine similarity in TypeScript
  const scores: Array<{ profile: typeof profiles[0]; score: number }> = [];
  for (const p of profiles ?? []) {
    if (p.athlete_key === excludeKey) continue;
    const vec = typeof p.feature_vector === "string"
      ? JSON.parse(p.feature_vector as string)
      : (p.feature_vector as number[]);
    const score = cosine(queryVec!, vec);
    scores.push({ profile: p, score });
  }

  scores.sort((a, b) => b.score - a.score);
  const topResults = scores.slice(0, topN);

  // Fetch cluster assignments for top results
  const topKeys = topResults.map((r) => r.profile.athlete_key);
  const clusterMap: Record<string, number | null> = {};
  const labelMap: Record<number, string | null> = {};

  if (topKeys.length > 0) {
    const { data: clusters } = await supabase
      .from("als_athlete_clusters")
      .select("athlete_key, cluster_id")
      .in("athlete_key", topKeys);
    for (const c of clusters ?? []) clusterMap[c.athlete_key] = c.cluster_id;

    const clusterIds = [...new Set(Object.values(clusterMap).filter((id): id is number => id !== null))];
    if (clusterIds.length > 0) {
      const { data: summaries } = await supabase
        .from("als_cluster_summaries")
        .select("cluster_id, auto_label, custom_label")
        .in("cluster_id", clusterIds);
      for (const s of summaries ?? []) {
        labelMap[s.cluster_id] = s.custom_label ?? s.auto_label ?? null;
      }
    }
  }

  const results: TestAthleteResult[] = topResults.map((r, idx) => {
    const p = r.profile;
    const targetVec = typeof p.feature_vector === "string"
      ? JSON.parse(p.feature_vector as string)
      : (p.feature_vector as number[]);
    const cluster_id = clusterMap[p.athlete_key] ?? null;
    return {
      athlete_key: p.athlete_key,
      cosine_score: Math.round(r.score * 10000) / 10000,
      rank: idx + 1,
      race_count: p.race_count ?? 0,
      finish_count: p.finish_count ?? 0,
      dnf_rate: p.dnf_rate ?? null,
      avg_flat_equiv_km: p.avg_flat_equiv_km ?? null,
      avg_ascent_m: p.avg_ascent_m ?? null,
      avg_perf_index: p.avg_perf_index ?? null,
      max_flat_equiv_km: p.max_flat_equiv_km ?? null,
      first_result_year: p.first_result_year ?? null,
      last_result_year: p.last_result_year ?? null,
      cluster_id,
      cluster_label: cluster_id !== null ? (labelMap[cluster_id] ?? null) : null,
      similarity_reasons: buildReasons(queryVec!, targetVec, {
        avg_flat_equiv_km: p.avg_flat_equiv_km,
        avg_ascent_m: p.avg_ascent_m,
      }),
    };
  });

  return NextResponse.json({ results });
}

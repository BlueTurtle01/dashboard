/**
 * GET /api/race-readiness/athlete?key=<athlete_key>
 *
 * Returns enriched athlete profile + full race history for the Race Readiness
 * athlete overview page. Joins race_results with races and race_profiles to
 * provide per-race distance/ascent/difficulty alongside the athlete's stats.
 *
 * athlete_key is the full_name value (case-sensitive match used in race_results).
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface AthleteProfileSummary {
  athlete_key: string;
  gender: string | null;
  age_group: string | null;
  club: string | null;
  race_count: number;
  finish_count: number;
  dnf_count: number;
  dnf_rate: number | null;
  avg_perf_index: number | null;
  recency_perf_index: number | null;
  avg_flat_equiv_km: number | null;
  max_flat_equiv_km: number | null;
  avg_ascent_m: number | null;
  max_ascent_m: number | null;
  avg_difficulty_ratio: number | null;
  first_result_year: number | null;
  last_result_year: number | null;
  career_span_years: number | null;
  cluster_label: string | null;
}

export interface TerrainPairing {
  section_type: string;
  terrain: string;
  total_km: number;
  race_count: number;
  avg_gradient: number;
}

export interface AthleteRaceDetail {
  race_id: string;
  race_name: string;
  result_year: number;
  result_status: string;
  finish_seconds: number | null;
  position: number | null;
  age_group: string | null;
  gender: string | null;
  club: string | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  flat_equivalent_km: number | null;
  total_finishers: number | null;
  cat_position: number | null;
  cat_finishers: number | null;
}

const CLUB_KEYS = ["Club", "club", "Team", "team", "club_team", "club_company"];
const CLUB_PLACEHOLDERS = new Set([
  "(no club)", "no club", "none", "n/a", "na", "-", "--",
  "unattached", "unaffiliated", "independent",
]);

function extractClub(ad: Record<string, string> | null): string | null {
  if (!ad) return null;
  for (const k of CLUB_KEYS) {
    const v = ad[k]?.trim();
    if (v && !CLUB_PLACEHOLDERS.has(v.toLowerCase())) return v;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const athleteKey = req.nextUrl.searchParams.get("key")?.trim() ?? "";
  if (!athleteKey) {
    return NextResponse.json({ error: "key parameter required" }, { status: 400 });
  }

  const supabase = await createClient();

  // ── 1. Athlete profile from als_athlete_profiles ───────────────────────────
  const [
    { data: profile },
    { data: clusterRow },
    { data: resultRows, error: resultsErr },
  ] = await Promise.all([
    supabase
      .from("als_athlete_profiles")
      .select("athlete_key, race_count, finish_count, dnf_count, dnf_rate, avg_perf_index, recency_perf_index, avg_flat_equiv_km, max_flat_equiv_km, avg_ascent_m, max_ascent_m, avg_difficulty_ratio, first_result_year, last_result_year, career_span_years")
      .eq("athlete_key", athleteKey)
      .maybeSingle(),

    supabase
      .from("als_athlete_clusters")
      .select("cluster_id")
      .eq("athlete_key", athleteKey)
      .maybeSingle(),

    // ── 2. Race history (no join to race_profiles — no FK defined) ───────────
    supabase
      .from("race_results")
      .select(`
        race_id, result_year, result_status, finish_seconds, position,
        age_group, gender, additional_data,
        races ( name )
      `)
      .eq("full_name", athleteKey)
      .order("result_year", { ascending: false })
      .order("position", { ascending: true, nullsFirst: false })
      .limit(150),
  ]);

  if (resultsErr) {
    return NextResponse.json({ error: resultsErr.message }, { status: 500 });
  }

  // ── 2b. Fetch race_profiles separately (race_id is the PK, no FK on race_results) ──
  const uniqueRaceIds = [...new Set((resultRows ?? []).map(r => r.race_id as string))];
  type SectionEntry = { section_type: string; terrain: string; distance_km: number; avg_gradient_percent: number };
  type ProfileEntry = { total_distance_km: number; total_ascent_m: number; flat_equivalent_km: number; sections: SectionEntry[] };
  const profileMap: Record<string, ProfileEntry> = {};
  if (uniqueRaceIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("race_profiles")
      .select("race_id, total_distance_km, total_ascent_m, flat_equivalent_km, sections_json")
      .in("race_id", uniqueRaceIds);
    for (const rp of profileRows ?? []) {
      const rawSecs = Array.isArray(rp.sections_json) ? rp.sections_json : [];
      const sections: SectionEntry[] = rawSecs.flatMap((s: unknown) => {
        if (!s || typeof s !== "object") return [];
        const sec = s as Record<string, unknown>;
        if (typeof sec.section_type !== "string" || typeof sec.terrain !== "string" || typeof sec.distance_km !== "number") return [];
        return [{ section_type: sec.section_type, terrain: sec.terrain, distance_km: sec.distance_km, avg_gradient_percent: typeof sec.avg_gradient_percent === "number" ? sec.avg_gradient_percent : 0 }];
      });
      profileMap[rp.race_id as string] = {
        total_distance_km:  rp.total_distance_km  as number,
        total_ascent_m:     rp.total_ascent_m     as number,
        flat_equivalent_km: rp.flat_equivalent_km as number,
        sections,
      };
    }
  }

  // ── 3. Cluster label ──────────────────────────────────────────────────────
  let clusterLabel: string | null = null;
  if (clusterRow?.cluster_id !== undefined && clusterRow.cluster_id !== null) {
    const { data: summary } = await supabase
      .from("als_cluster_summaries")
      .select("auto_label, custom_label")
      .eq("cluster_id", clusterRow.cluster_id)
      .maybeSingle();
    clusterLabel = summary?.custom_label ?? summary?.auto_label ?? null;
  }

  // ── 4. Total finishers per (race_id, result_year) ─────────────────────────
  const raceYearPairs = [
    ...new Map(
      (resultRows ?? []).map(r => [`${r.race_id}|${r.result_year}`, { race_id: r.race_id as string, year: r.result_year as number }])
    ).values(),
  ];

  const finisherCounts: Record<string, number> = {};
  if (raceYearPairs.length > 0) {
    // Batch: fetch all finisher counts for relevant race+year combinations
    const { data: countRows } = await supabase
      .from("race_results")
      .select("race_id, result_year")
      .in("race_id", [...new Set(raceYearPairs.map(p => p.race_id))])
      .in("result_status", ["FINISHED", "UNKNOWN", "finisher"]);

    for (const row of countRows ?? []) {
      const k = `${row.race_id as string}|${row.result_year as number}`;
      finisherCounts[k] = (finisherCounts[k] ?? 0) + 1;
    }
  }

  // ── 4b. Category positions per (race_id, result_year, age_group) ──────────
  // For finished races where we know the athlete's age_group and finish time,
  // fetch all category finishers and compute the athlete's rank within their group.
  const catMap: Record<string, { cat_position: number; cat_finishers: number }> = {};
  const finishedWithCat = (resultRows ?? []).filter(r =>
    r.result_status === "FINISHED" && r.finish_seconds && r.age_group
  );
  if (finishedWithCat.length > 0) {
    const catRaceIds   = [...new Set(finishedWithCat.map(r => r.race_id as string))];
    const catAgeGroups = [...new Set(finishedWithCat.map(r => r.age_group as string))];
    const { data: catRows } = await supabase
      .from("race_results")
      .select("race_id, result_year, age_group, finish_seconds")
      .in("race_id", catRaceIds)
      .in("age_group", catAgeGroups)
      .in("result_status", ["FINISHED", "UNKNOWN"])
      .not("finish_seconds", "is", null);
    // Group all finish times by (race_id, result_year, age_group)
    const catGroups: Record<string, number[]> = {};
    for (const row of catRows ?? []) {
      const k = `${row.race_id as string}|${row.result_year as number}|${row.age_group as string}`;
      if (!catGroups[k]) catGroups[k] = [];
      catGroups[k].push(row.finish_seconds as number);
    }
    for (const r of finishedWithCat) {
      const k = `${r.race_id as string}|${r.result_year as number}|${r.age_group as string}`;
      const times = catGroups[k];
      if (times && times.length > 0) {
        const athleteTime = r.finish_seconds as number;
        const faster = times.filter(t => t < athleteTime).length;
        catMap[k] = { cat_position: faster + 1, cat_finishers: times.length };
      }
    }
  }

  // ── 5. Build race list ────────────────────────────────────────────────────
  const races: AthleteRaceDetail[] = (resultRows ?? []).map(r => {
    const raceName = Array.isArray(r.races)
      ? (r.races[0] as { name: string } | undefined)?.name
      : (r.races as { name: string } | null)?.name;

    const rp = profileMap[r.race_id as string] ?? null;
    const ad = r.additional_data as Record<string, string> | null;
    const catKey = `${r.race_id as string}|${r.result_year as number}|${r.age_group as string}`;
    const cat = catMap[catKey] ?? null;

    return {
      race_id:            r.race_id as string,
      race_name:          raceName ?? "Unknown race",
      result_year:        r.result_year as number,
      result_status:      r.result_status as string,
      finish_seconds:     r.finish_seconds as number | null,
      position:           r.position as number | null,
      age_group:          r.age_group as string | null,
      gender:             r.gender as string | null,
      club:               extractClub(ad),
      total_distance_km:  rp?.total_distance_km ?? null,
      total_ascent_m:     rp?.total_ascent_m ?? null,
      flat_equivalent_km: rp?.flat_equivalent_km ?? null,
      total_finishers:    finisherCounts[`${r.race_id as string}|${r.result_year as number}`] ?? null,
      cat_position:       cat?.cat_position ?? null,
      cat_finishers:      cat?.cat_finishers ?? null,
    };
  });

  // ── 6. Derive profile fields from race_results if als_athlete_profiles missing ─
  const derivedGender = races.find(r => r.gender)?.gender ?? null;
  const derivedAgeGroup = races.find(r => r.age_group)?.age_group ?? null;
  const derivedClub = races.find(r => r.club)?.club ?? null;

  const athleteProfile: AthleteProfileSummary = {
    athlete_key:         athleteKey,
    gender:              derivedGender,
    age_group:           derivedAgeGroup,
    club:                derivedClub,
    race_count:          profile?.race_count          ?? races.length,
    finish_count:        profile?.finish_count        ?? races.filter(r => r.result_status === "FINISHED").length,
    dnf_count:           profile?.dnf_count           ?? races.filter(r => r.result_status === "DNF").length,
    dnf_rate:            profile?.dnf_rate            ?? null,
    avg_perf_index:      profile?.avg_perf_index      ?? null,
    recency_perf_index:  profile?.recency_perf_index  ?? null,
    avg_flat_equiv_km:   profile?.avg_flat_equiv_km   ?? null,
    max_flat_equiv_km:   profile?.max_flat_equiv_km   ?? null,
    avg_ascent_m:        profile?.avg_ascent_m        ?? null,
    max_ascent_m:        profile?.max_ascent_m        ?? null,
    avg_difficulty_ratio: profile?.avg_difficulty_ratio ?? null,
    first_result_year:   profile?.first_result_year   ?? (races.length > 0 ? Math.min(...races.map(r => r.result_year)) : null),
    last_result_year:    profile?.last_result_year    ?? (races.length > 0 ? Math.max(...races.map(r => r.result_year)) : null),
    career_span_years:   profile?.career_span_years   ?? null,
    cluster_label:       clusterLabel,
  };

  // ── 7. Terrain pairings from finished race sections ─────────────────────────
  const pairingMap: Record<string, { section_type: string; terrain: string; total_km: number; race_count: number; weighted_grad: number }> = {};
  for (const row of resultRows ?? []) {
    if (row.result_status !== "FINISHED") continue;
    const secs = profileMap[row.race_id as string]?.sections ?? [];
    const countedThisRow = new Set<string>();
    for (const sec of secs) {
      const key = `${sec.section_type}|${sec.terrain}`;
      if (!pairingMap[key]) pairingMap[key] = { section_type: sec.section_type, terrain: sec.terrain, total_km: 0, race_count: 0, weighted_grad: 0 };
      pairingMap[key].total_km    += sec.distance_km;
      pairingMap[key].weighted_grad += sec.avg_gradient_percent * sec.distance_km;
      if (!countedThisRow.has(key)) { pairingMap[key].race_count++; countedThisRow.add(key); }
    }
  }
  const terrainPairings: TerrainPairing[] = Object.values(pairingMap)
    .sort((a, b) => b.total_km - a.total_km)
    .slice(0, 10)
    .map(p => ({
      section_type: p.section_type,
      terrain:      p.terrain,
      total_km:     Math.round(p.total_km * 10) / 10,
      race_count:   p.race_count,
      avg_gradient: p.total_km > 0 ? Math.round((p.weighted_grad / p.total_km) * 10) / 10 : 0,
    }));

  return NextResponse.json({ profile: athleteProfile, races, terrain_pairings: terrainPairings });
}

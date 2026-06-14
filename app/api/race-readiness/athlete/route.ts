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
import {
  calculatePacingComplexityIndex,
  type PacingComplexityComponents,
} from "@/lib/race-analysis/pacing-complexity";

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
  pacing_complexity_index: number | null;
  pacing_complexity_components: PacingComplexityComponents | null;
}

function normaliseSectionType(t: string): string {
  const map: Record<string, string> = {
    very_steep_climb:   "steep_climb",
    major_climb:        "sustained_climb",
    steady_climb:       "mild_climb",
    gentle_climb:       "mild_climb",
    flat_rolling:       "flat",
    gentle_descent:     "mild_descent",
    runnable_descent:   "mild_descent",
    steep_descent:      "sustained_descent",
    very_steep_descent: "steep_descent",
  };
  return map[t] ?? t;
}

function normaliseTerrain(t: string): string {
  const map: Record<string, string> = {
    pavement:        "road",
    track:           "road",
    technical_trail: "rocky_trail",
    fell:            "grass",
  };
  return map[t] ?? t;
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

  // Optional: filter to a specific subset of races (comma-separated "race_id|result_year" pairs)
  const includeParam = req.nextUrl.searchParams.get("include")?.trim() ?? "";
  const includeSet: Set<string> | null = includeParam.length > 0
    ? new Set(includeParam.split(",").filter(Boolean))
    : null;

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

  // ── 3b. Apply include filter (if provided) ────────────────────────────────
  // effectiveResultRows is the subset used for all per-athlete computations.
  // resultRows (full) is kept only for computing total field sizes.
  const effectiveResultRows = includeSet
    ? (resultRows ?? []).filter(r => includeSet.has(`${r.race_id as string}|${r.result_year as number}`))
    : (resultRows ?? []);

  // ── 4. Total finishers per (race_id, result_year) ─────────────────────────
  // Use the full resultRows so total field sizes are accurate regardless of filter.
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
  const finishedWithCat = effectiveResultRows.filter(r =>
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
  const races: AthleteRaceDetail[] = effectiveResultRows.map(r => {
    const raceName = Array.isArray(r.races)
      ? (r.races[0] as { name: string } | undefined)?.name
      : (r.races as { name: string } | null)?.name;

    const rp = profileMap[r.race_id as string] ?? null;
    const ad = r.additional_data as Record<string, string> | null;
    const catKey = `${r.race_id as string}|${r.result_year as number}|${r.age_group as string}`;
    const cat = catMap[catKey] ?? null;

    let pacing_complexity_index: number | null = null;
    let pacing_complexity_components: PacingComplexityComponents | null = null;
    if (rp && rp.sections.length >= 3) {
      const pci = calculatePacingComplexityIndex(rp.sections, rp.total_distance_km, rp.flat_equivalent_km);
      if (pci.has_sufficient_data) {
        pacing_complexity_index = pci.score;
        pacing_complexity_components = pci.components;
      }
    }

    return {
      race_id:                     r.race_id as string,
      race_name:                   raceName ?? "Unknown race",
      result_year:                 r.result_year as number,
      result_status:               r.result_status as string,
      finish_seconds:              r.finish_seconds as number | null,
      position:                    r.position as number | null,
      age_group:                   r.age_group as string | null,
      gender:                      r.gender as string | null,
      club:                        extractClub(ad),
      total_distance_km:           rp?.total_distance_km ?? null,
      total_ascent_m:              rp?.total_ascent_m ?? null,
      flat_equivalent_km:          rp?.flat_equivalent_km ?? null,
      total_finishers:             finisherCounts[`${r.race_id as string}|${r.result_year as number}`] ?? null,
      cat_position:                cat?.cat_position ?? null,
      cat_finishers:               cat?.cat_finishers ?? null,
      pacing_complexity_index,
      pacing_complexity_components,
    };
  });

  // ── 6. Derive profile fields ──────────────────────────────────────────────
  const derivedGender   = races.find(r => r.gender)?.gender     ?? null;
  const derivedAgeGroup = races.find(r => r.age_group)?.age_group ?? null;
  const derivedClub     = races.find(r => r.club)?.club          ?? null;

  const finishedRaces = races.filter(r => r.result_status === "FINISHED");
  const dnfRaces      = races.filter(r => r.result_status === "DNF");

  // When a race filter is active, re-derive all aggregate stats from the filtered set
  // so values reflect only the selected races rather than the pre-computed all-time totals.
  const useFiltered = includeSet !== null;

  const derivedMaxAscent    = finishedRaces.reduce((m, r) => Math.max(m, r.total_ascent_m     ?? 0), 0) || null;
  const derivedAvgAscent    = finishedRaces.length > 0 ? finishedRaces.reduce((s, r) => s + (r.total_ascent_m     ?? 0), 0) / finishedRaces.length : null;
  const derivedMaxFlatEq    = finishedRaces.reduce((m, r) => Math.max(m, r.flat_equivalent_km ?? 0), 0) || null;
  const derivedAvgFlatEq    = finishedRaces.length > 0 ? finishedRaces.reduce((s, r) => s + (r.flat_equivalent_km ?? 0), 0) / finishedRaces.length : null;
  const derivedFirstYear    = races.length > 0 ? Math.min(...races.map(r => r.result_year)) : null;
  const derivedLastYear     = races.length > 0 ? Math.max(...races.map(r => r.result_year)) : null;
  const derivedCareerSpan   = derivedFirstYear && derivedLastYear ? derivedLastYear - derivedFirstYear + 1 : null;
  const derivedDnfRate      = races.length > 0 ? dnfRaces.length / races.length : null;

  const athleteProfile: AthleteProfileSummary = {
    athlete_key:          athleteKey,
    gender:               derivedGender,
    age_group:            derivedAgeGroup,
    club:                 derivedClub,
    race_count:           useFiltered ? races.length                          : (profile?.race_count          ?? races.length),
    finish_count:         useFiltered ? finishedRaces.length                  : (profile?.finish_count        ?? finishedRaces.length),
    dnf_count:            useFiltered ? dnfRaces.length                       : (profile?.dnf_count           ?? dnfRaces.length),
    dnf_rate:             useFiltered ? derivedDnfRate                        : (profile?.dnf_rate            ?? null),
    avg_perf_index:       profile?.avg_perf_index      ?? null,
    recency_perf_index:   profile?.recency_perf_index  ?? null,
    avg_flat_equiv_km:    useFiltered ? derivedAvgFlatEq                      : (profile?.avg_flat_equiv_km   ?? null),
    max_flat_equiv_km:    useFiltered ? derivedMaxFlatEq                      : (profile?.max_flat_equiv_km   ?? null),
    avg_ascent_m:         useFiltered ? derivedAvgAscent                      : (profile?.avg_ascent_m        ?? null),
    max_ascent_m:         useFiltered ? derivedMaxAscent                      : (profile?.max_ascent_m        ?? null),
    avg_difficulty_ratio: profile?.avg_difficulty_ratio ?? null,
    first_result_year:    useFiltered ? derivedFirstYear                      : (profile?.first_result_year   ?? derivedFirstYear),
    last_result_year:     useFiltered ? derivedLastYear                       : (profile?.last_result_year    ?? derivedLastYear),
    career_span_years:    useFiltered ? derivedCareerSpan                     : (profile?.career_span_years   ?? null),
    cluster_label:        clusterLabel,
  };

  // ── 7. Terrain pairings from finished race sections ─────────────────────────
  const pairingMap: Record<string, { section_type: string; terrain: string; total_km: number; race_count: number; weighted_grad: number }> = {};
  for (const row of effectiveResultRows) {
    if (!["FINISHED", "UNKNOWN"].includes(row.result_status as string)) continue;
    const secs = profileMap[row.race_id as string]?.sections ?? [];
    const countedThisRow = new Set<string>();
    for (const sec of secs) {
      const st  = normaliseSectionType(sec.section_type);
      const ter = normaliseTerrain(sec.terrain);
      const key = `${st}|${ter}`;
      if (!pairingMap[key]) pairingMap[key] = { section_type: st, terrain: ter, total_km: 0, race_count: 0, weighted_grad: 0 };
      pairingMap[key].total_km      += sec.distance_km;
      pairingMap[key].weighted_grad += sec.avg_gradient_percent * sec.distance_km;
      if (!countedThisRow.has(key)) { pairingMap[key].race_count++; countedThisRow.add(key); }
    }
  }
  const terrainPairings: TerrainPairing[] = Object.values(pairingMap)
    .sort((a, b) => b.total_km - a.total_km)
    .map(p => ({
      section_type: p.section_type,
      terrain:      p.terrain,
      total_km:     Math.round(p.total_km * 10) / 10,
      race_count:   p.race_count,
      avg_gradient: p.total_km > 0 ? Math.round((p.weighted_grad / p.total_km) * 10) / 10 : 0,
    }));

  const racesWithProfile = effectiveResultRows.filter(
    r => ["FINISHED", "UNKNOWN"].includes(r.result_status as string)
      && !!profileMap[r.race_id as string]
  ).length;

  return NextResponse.json({ profile: athleteProfile, races, terrain_pairings: terrainPairings, races_with_profile: racesWithProfile });
}

/**
 * GET /api/race-readiness/prep-races
 * ?key=<athlete_key>&race_id=<target_race_id>&radius_miles=100
 *
 * Finds races within a configurable radius of the athlete's inferred
 * home location that best address the athlete's identified experience
 * gaps relative to their target race.
 *
 * Scoring: for each experience gap (section_type × terrain), compute
 * how many km the candidate race provides toward what's still needed.
 * gap_fill_score = Σ min(race_km, needed_km) / total_needed_km × 100
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface PrepRaceGapFill {
  section_type: string;
  terrain: string;
  race_km: number;
  needed_km: number;
}

export interface PrepRaceSuggestion {
  race_id: string;
  race_name: string;
  distance_miles: number;
  next_date: string | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  gap_fill_score: number;
  gaps_filled: PrepRaceGapFill[];
}

export interface PrepRacesResult {
  centroid: { lat: number; lon: number } | null;
  radius_miles: number;
  suggestions: PrepRaceSuggestion[];
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseSections(sectionsJson: unknown): Array<{ section_type: string; terrain: string; distance_km: number }> {
  if (!Array.isArray(sectionsJson)) return [];
  const out: Array<{ section_type: string; terrain: string; distance_km: number }> = [];
  for (const s of sectionsJson) {
    if (!s || typeof s !== "object") continue;
    const sec = s as Record<string, unknown>;
    if (
      typeof sec.section_type !== "string" ||
      typeof sec.terrain !== "string" ||
      typeof sec.distance_km !== "number"
    ) continue;
    out.push({ section_type: sec.section_type, terrain: sec.terrain, distance_km: sec.distance_km });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const athleteKey   = p.get("key")?.trim() ?? "";
  const targetRaceId = p.get("race_id")?.trim() ?? "";
  const radiusMiles  = Math.max(1, Math.min(500, parseFloat(p.get("radius_miles") ?? "100") || 100));

  if (!athleteKey || !targetRaceId) {
    return NextResponse.json({ error: "key and race_id required" }, { status: 400 });
  }

  const supabase  = await createClient();
  const radiusKm  = radiusMiles * 1.60934;

  // ── 1. Athlete's race IDs (any result) ────────────────────────────────────
  const { data: athleteResults } = await supabase
    .from("race_results")
    .select("race_id, result_status")
    .eq("full_name", athleteKey);
  const athleteRaceIds = new Set((athleteResults ?? []).map(r => r.race_id as string));

  // ── 2. Centroid from athlete's race coordinates ──────────────────────────
  // Primary: race_latitude / race_longitude on the races table.
  // Fallback: first GPS point of the race's GPX file (for races not yet
  //           geocoded in the database).
  let centroid: { lat: number; lon: number } | null = null;
  if (athleteRaceIds.size > 0) {
    const { data: raceRows } = await supabase
      .from("races")
      .select("id, race_latitude, race_longitude")
      .in("id", [...athleteRaceIds]);

    const coordPoints: { lat: number; lon: number }[] = [];
    const missingCoordIds: string[] = [];

    for (const r of raceRows ?? []) {
      if (typeof r.race_latitude === "number" && typeof r.race_longitude === "number") {
        coordPoints.push({ lat: r.race_latitude, lon: r.race_longitude });
      } else {
        missingCoordIds.push(r.id as string);
      }
    }

    // GPX fallback — fetch start point for races without stored coordinates
    if (missingCoordIds.length > 0) {
      const { data: gpxFiles } = await supabase
        .from("race_files")
        .select("race_id, public_url")
        .in("race_id", missingCoordIds)
        .eq("file_type", "gpx");

      // Fetch GPX files in parallel (cap at 10, short timeout each)
      const gpxFetches = (gpxFiles ?? []).slice(0, 10).map(async f => {
        try {
          const res = await fetch(f.public_url as string, {
            signal: AbortSignal.timeout(8_000),
          });
          if (!res.ok) return null;
          const pts = parseGpxPoints(await res.text());
          if (pts.length === 0) return null;
          return { lat: pts[0].lat, lon: pts[0].lon };
        } catch {
          return null;
        }
      });

      const gpxResults = await Promise.all(gpxFetches);
      for (const pt of gpxResults) {
        if (pt) coordPoints.push(pt);
      }
    }

    if (coordPoints.length > 0) {
      centroid = {
        lat: coordPoints.reduce((s, p) => s + p.lat, 0) / coordPoints.length,
        lon: coordPoints.reduce((s, p) => s + p.lon, 0) / coordPoints.length,
      };
    }
  }

  // ── 3. Athlete pairings from ALL finished race profiles ────────────────────
  const athletePairings: Record<string, number> = {};
  const finishedIds = new Set(
    (athleteResults ?? [])
      .filter(r => ["FINISHED", "UNKNOWN"].includes(r.result_status as string))
      .map(r => r.race_id as string)
  );
  if (finishedIds.size > 0) {
    const { data: athProfiles } = await supabase
      .from("race_profiles")
      .select("sections_json")
      .in("race_id", [...finishedIds]);
    for (const rp of athProfiles ?? []) {
      for (const s of parseSections(rp.sections_json)) {
        const key = `${s.section_type}|${s.terrain}`;
        athletePairings[key] = (athletePairings[key] ?? 0) + s.distance_km;
      }
    }
  }

  // ── 4. Target race pairings ────────────────────────────────────────────────
  const { data: targetProfile } = await supabase
    .from("race_profiles")
    .select("sections_json")
    .eq("race_id", targetRaceId)
    .maybeSingle();

  const targetPairings: Record<string, { section_type: string; terrain: string; km: number }> = {};
  for (const s of parseSections(targetProfile?.sections_json)) {
    const key = `${s.section_type}|${s.terrain}`;
    if (!targetPairings[key]) targetPairings[key] = { section_type: s.section_type, terrain: s.terrain, km: 0 };
    targetPairings[key].km += s.distance_km;
  }

  // ── 5. Experience gaps ─────────────────────────────────────────────────────
  const gaps = Object.values(targetPairings)
    .map(tp => ({
      section_type: tp.section_type,
      terrain:      tp.terrain,
      target_km:    tp.km,
      needed_km:    Math.max(0, tp.km - (athletePairings[`${tp.section_type}|${tp.terrain}`] ?? 0)),
    }))
    .filter(g => g.needed_km > 0.1)
    .sort((a, b) => b.needed_km - a.needed_km);

  const totalNeededKm = gaps.reduce((s, g) => s + g.needed_km, 0);

  const empty: PrepRacesResult = { centroid, radius_miles: radiusMiles, suggestions: [] };
  if (!centroid || totalNeededKm < 0.1) {
    return NextResponse.json(empty);
  }

  // ── 6. Bounding box pre-filter ─────────────────────────────────────────────
  const MILES_PER_DEG_LAT = 69.0;
  const latDelta = radiusMiles / MILES_PER_DEG_LAT;
  const lonDelta = radiusMiles / (MILES_PER_DEG_LAT * Math.cos((centroid.lat * Math.PI) / 180));

  const { data: boxRaces } = await supabase
    .from("races")
    .select("id, name, race_latitude, race_longitude")
    .gte("race_latitude", centroid.lat - latDelta)
    .lte("race_latitude", centroid.lat + latDelta)
    .gte("race_longitude", centroid.lon - lonDelta)
    .lte("race_longitude", centroid.lon + lonDelta)
    .not("race_latitude", "is", null)
    .not("race_longitude", "is", null);

  // ── 7. Precise haversine filter — exclude athlete's races & target ─────────
  const candidates = (boxRaces ?? [])
    .filter(r => {
      if (athleteRaceIds.has(r.id as string)) return false;
      if ((r.id as string) === targetRaceId) return false;
      if (typeof r.race_latitude !== "number" || typeof r.race_longitude !== "number") return false;
      return haversineKm(centroid!.lat, centroid!.lon, r.race_latitude, r.race_longitude) <= radiusKm;
    })
    .map(r => ({
      race_id:       r.id as string,
      race_name:     r.name as string,
      distance_miles: Math.round(
        (haversineKm(centroid!.lat, centroid!.lon, r.race_latitude as number, r.race_longitude as number) / 1.60934) * 10
      ) / 10,
    }));

  if (candidates.length === 0) return NextResponse.json(empty);

  // ── 8. Batch fetch profiles + next upcoming dates ──────────────────────────
  const candidateIds = candidates.map(c => c.race_id);
  const [{ data: profiles }, { data: dates }] = await Promise.all([
    supabase
      .from("race_profiles")
      .select("race_id, total_distance_km, total_ascent_m, sections_json")
      .in("race_id", candidateIds),
    supabase
      .from("race_dates")
      .select("race_id, start_date")
      .in("race_id", candidateIds)
      .gte("start_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: true }),
  ]);

  const profileIdx: Record<string, { total_distance_km: number; total_ascent_m: number; sections_json: unknown }> = {};
  for (const rp of profiles ?? []) profileIdx[rp.race_id as string] = rp;

  const nextDateIdx: Record<string, string> = {};
  for (const d of dates ?? []) {
    if (!nextDateIdx[d.race_id as string]) nextDateIdx[d.race_id as string] = d.start_date as string;
  }

  // ── 9. Score each candidate ────────────────────────────────────────────────
  const suggestions: PrepRaceSuggestion[] = [];
  for (const cand of candidates) {
    const profile = profileIdx[cand.race_id];
    if (!profile) continue;

    const candPairings: Record<string, number> = {};
    for (const s of parseSections(profile.sections_json)) {
      const key = `${s.section_type}|${s.terrain}`;
      candPairings[key] = (candPairings[key] ?? 0) + s.distance_km;
    }

    let scoreNum = 0;
    const gapsFilled: PrepRaceGapFill[] = [];
    for (const gap of gaps) {
      const key = `${gap.section_type}|${gap.terrain}`;
      const raceKm = candPairings[key] ?? 0;
      if (raceKm > 0.05) {
        scoreNum += Math.min(raceKm, gap.needed_km);
        gapsFilled.push({
          section_type: gap.section_type,
          terrain:      gap.terrain,
          race_km:      Math.round(raceKm * 10) / 10,
          needed_km:    Math.round(gap.needed_km * 10) / 10,
        });
      }
    }

    const score = Math.round((scoreNum / totalNeededKm) * 100);
    if (score === 0) continue;

    suggestions.push({
      race_id:           cand.race_id,
      race_name:         cand.race_name,
      distance_miles:    cand.distance_miles,
      next_date:         nextDateIdx[cand.race_id] ?? null,
      total_distance_km: profile.total_distance_km as number ?? null,
      total_ascent_m:    profile.total_ascent_m as number ?? null,
      gap_fill_score:    score,
      gaps_filled:       gapsFilled,
    });
  }

  suggestions.sort((a, b) => b.gap_fill_score - a.gap_fill_score);

  return NextResponse.json({
    centroid,
    radius_miles: radiusMiles,
    suggestions: suggestions.slice(0, 6),
  } satisfies PrepRacesResult);
}

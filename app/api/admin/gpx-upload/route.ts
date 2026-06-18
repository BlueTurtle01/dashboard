/**
 * POST /api/admin/gpx-upload
 *
 * Uploads a GPX file for a specific race, links it in race_files, computes
 * the race_profile, and writes elevation_profile + sustained_segments +
 * terrain_segments to races_meta — all in one step.
 *
 * Terrain is derived from OSM via the Overpass API (per-section, variable).
 * Falls back to terrain_type if Overpass is unavailable.
 *
 * FormData fields:
 *   race_id  string   UUID of the race
 *   file     File     The .gpx file
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles, getCurrentUser } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";
import { computeRaceProfile, type CourseSection } from "@/lib/race-analysis/course-profile";
import { haversineKm } from "@/lib/race-analysis/sections";
import {
  analyzeTerrainFromGpx,
  buildTerrainLookup,
  type TerrainSegment,
} from "@/lib/race-analysis/terrain-from-osm";
import { inferAndSaveCharacteristics } from "@/lib/race-analysis/infer-characteristics";
import type { GpxPoint } from "@/lib/race-analysis/types";

export const maxDuration = 60;

const BUCKET = "race-files";

function buildElevationProfile(points: GpxPoint[], totalDistanceKm: number) {
  const target = Math.min(500, points.length);
  const step   = Math.max(1, Math.floor(points.length / target));
  const sampled = points.filter((_, i) => i % step === 0);

  let cumKm = 0;
  const result: { distanceKm: number; elevationM: number }[] = [];
  for (let i = 0; i < sampled.length; i++) {
    if (i > 0) cumKm += haversineKm(sampled[i-1].lat, sampled[i-1].lon, sampled[i].lat, sampled[i].lon);
    result.push({ distanceKm: Math.round(cumKm * 100) / 100, elevationM: Math.round(sampled[i].ele * 10) / 10 });
  }
  return { points: result, totalDistanceKm };
}

function buildSustainedSegments(sections: CourseSection[]) {
  if (!sections.length) return [];
  const classify = (s: CourseSection) =>
    s.section_type.includes("climb") ? "climb" : s.section_type.includes("descent") ? "descent" : "flat";

  const merged: { startKm: number; endKm: number; totalElevationM: number; type: "climb" | "descent" | "flat" }[] = [];
  let cur: (typeof merged)[0] | null = null;

  for (const s of sections) {
    const type = classify(s) as "climb" | "descent" | "flat";
    const elev = s.ascent_m - s.descent_m;
    if (cur && cur.type === type) {
      cur.endKm = s.end_distance_km;
      cur.totalElevationM += elev;
    } else {
      if (cur) merged.push(cur);
      cur = { startKm: s.start_distance_km, endKm: s.end_distance_km, totalElevationM: elev, type };
    }
  }
  if (cur) merged.push(cur);

  return merged.filter(s => s.type !== "flat" && Math.abs(s.totalElevationM) >= 50);
}

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const user = await getCurrentUser();

    let formData: FormData;
    try { formData = await req.formData(); }
    catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }); }

    const race_id = formData.get("race_id") as string | null;
    const file    = formData.get("file")    as File   | null;

    if (!race_id) return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    if (!file)    return NextResponse.json({ error: "No file provided" },    { status: 400 });

    const supabase    = await createClient();
    const adminClient = createAdminClient();

    // ── Verify race exists ────────────────────────────────────────────────────
    const { data: race } = await supabase
      .from("races")
      .select("id, name, terrain_type, race_latitude, race_longitude, country")
      .eq("id", race_id)
      .maybeSingle();
    if (!race) return NextResponse.json({ error: "Race not found" }, { status: 404 });

    // ── Upload GPX to storage ─────────────────────────────────────────────────
    const uuid        = crypto.randomUUID();
    const storagePath = `gpx/${race_id}/${uuid}.gpx`;
    const bytes       = await file.arrayBuffer();

    const { error: uploadErr } = await adminClient.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: "application/gpx+xml", upsert: false });

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    const { data: { publicUrl } } = adminClient.storage.from(BUCKET).getPublicUrl(storagePath);

    // ── Remove old GPX entry for this race (no unique constraint, clean manually) ─
    const { data: oldFiles } = await supabase
      .from("race_files")
      .select("id, storage_path")
      .eq("race_id", race_id)
      .eq("file_type", "gpx");

    for (const old of oldFiles ?? []) {
      await adminClient.storage.from(BUCKET).remove([old.storage_path]);
      await adminClient.from("race_files").delete().eq("id", old.id);
    }

    // ── Insert into race_files ────────────────────────────────────────────────
    const { data: fileRow, error: fileErr } = await supabase
      .from("race_files")
      .insert({
        race_id,
        file_type:       "gpx",
        file_name:       file.name,
        storage_path:    storagePath,
        public_url:      publicUrl,
        file_size_bytes: file.size,
        mime_type:       "application/gpx+xml",
        uploaded_by:     user?.id ?? null,
      })
      .select("id")
      .single();

    if (fileErr || !fileRow) return NextResponse.json({ error: fileErr?.message ?? "Failed to save file record" }, { status: 500 });

    // ── Parse GPX ─────────────────────────────────────────────────────────────
    const gpxText = await file.text();
    let gpxPoints: GpxPoint[];
    try { gpxPoints = parseGpxPoints(gpxText); }
    catch (e) { return NextResponse.json({ error: `GPX parse error: ${e instanceof Error ? e.message : e}` }, { status: 422 }); }

    // ── Backfill race coordinates from GPX start point (if not already set) ──
    if (gpxPoints.length > 0 && race.race_latitude == null) {
      await adminClient
        .from("races")
        .update({ race_latitude: gpxPoints[0].lat, race_longitude: gpxPoints[0].lon })
        .eq("id", race_id);
    }

    // ── Terrain analysis ──────────────────────────────────────────────────────
    // GPX upload always triggers a fresh OSM analysis (old segments may be stale)
    let terrainSegments: TerrainSegment[] | null = await analyzeTerrainFromGpx(gpxPoints);

    if (terrainSegments) {
      await adminClient.from("races_meta").upsert(
        { race_id, meta_key: "terrain_segments", meta_value: JSON.stringify(terrainSegments) },
        { onConflict: "race_id,meta_key" }
      );
      console.log(`[gpx-upload] Stored ${terrainSegments.length} terrain segments for ${race.name}`);
    } else {
      console.warn(`[gpx-upload] Overpass unavailable for ${race.name} — falling back to terrain_type`);
    }

    const fallback = race.terrain_type ?? "trail";
    const terrainLookup = terrainSegments
      ? buildTerrainLookup(terrainSegments, fallback)
      : () => fallback;

    // ── Compute race profile ──────────────────────────────────────────────────
    const profile = computeRaceProfile(gpxPoints, terrainLookup, undefined);

    // ── Upsert race_profiles ──────────────────────────────────────────────────
    const { error: profErr } = await adminClient.from("race_profiles").upsert(
      {
        race_id,
        computed_at:                        new Date().toISOString(),
        gpx_file_id:                        fileRow.id,
        wind_file_id:                       null,
        profile_source:                     profile.profile_source,
        total_distance_km:                  profile.total_distance_km,
        total_ascent_m:                     profile.total_ascent_m,
        total_descent_m:                    profile.total_descent_m,
        flat_equivalent_km:                 profile.flat_equivalent_km,
        difficulty_ratio:                   profile.difficulty_ratio,
        wind_adjusted_flat_equivalent_km:   null,
        wind_adjusted_difficulty_ratio:     null,
        sections_json:                      profile.sections,
        metadata: {
          race_name:              race.name,
          terrain_source:         terrainSegments ? "osm" : "terrain_type_fallback",
          terrain_segments_count: terrainSegments?.length ?? 0,
          gpx_points:             gpxPoints.length,
          sections_count:         profile.sections.length,
        },
      },
      { onConflict: "race_id" }
    );
    if (profErr) return NextResponse.json({ error: `Failed to save profile: ${profErr.message}` }, { status: 500 });

    // ── Write elevation_profile + sustained_segments to races_meta ────────────
    const elevationProfile  = buildElevationProfile(gpxPoints, profile.total_distance_km);
    const sustainedSegments = buildSustainedSegments(profile.sections);

    await adminClient.from("races_meta").upsert(
      [
        { race_id, meta_key: "elevation_profile",  meta_value: JSON.stringify(elevationProfile) },
        { race_id, meta_key: "sustained_segments", meta_value: JSON.stringify(sustainedSegments) },
      ],
      { onConflict: "race_id,meta_key" }
    );

    // ── Infer and save race characteristics ───────────────────────────────────
    const startCoords = gpxPoints.length > 0
      ? { lat: gpxPoints[0].lat, lon: gpxPoints[0].lon }
      : (race.race_latitude != null ? { lat: race.race_latitude, lon: race.race_longitude! } : null);

    // Fetch race date from races_meta (canonical per-year date)
    const { data: raceDateMeta } = await supabase
      .from("races_meta")
      .select("meta_value")
      .eq("race_id", race_id)
      .eq("meta_key", "race_date")
      .maybeSingle();
    const raceDate = raceDateMeta?.meta_value ? new Date(raceDateMeta.meta_value) : null;

    // Fetch latest entrant count for crowd_size inference
    const { data: entrantRows } = await adminClient.rpc("get_latest_year_entrant_counts");
    type EntrantRow = { race_id: string; entrant_count: number; latest_year: number };
    const entrantCount = (entrantRows as EntrantRow[] | null)
      ?.find((r) => r.race_id === race_id)?.entrant_count ?? null;

    await inferAndSaveCharacteristics(
      adminClient,
      race_id,
      startCoords,
      { totalDistanceKm: profile.total_distance_km, totalAscentM: profile.total_ascent_m },
      raceDate,
      terrainSegments,
      entrantCount,
      race.country ?? null,
    );

    return NextResponse.json({
      success:                true,
      race_name:              race.name,
      terrain_source:         terrainSegments ? "osm" : "terrain_type_fallback",
      terrain_segments_count: terrainSegments?.length ?? 0,
      total_distance_km:      profile.total_distance_km,
      total_ascent_m:         profile.total_ascent_m,
      total_descent_m:        profile.total_descent_m,
      sections_count:         profile.sections.length,
    });
  } catch (err) {
    console.error("[gpx-upload]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}

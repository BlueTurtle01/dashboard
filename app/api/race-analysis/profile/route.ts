/**
 * POST /api/race-analysis/profile
 *
 * Computes and stores a race difficulty profile from the race's uploaded GPX
 * (and optionally its wind_analysis CSV).
 *
 * Terrain is derived from OSM via the Overpass API (per-section, variable terrain).
 * Results are stored in races_meta.terrain_segments so both Dashboard and frontend
 * share the same canonical terrain data.  Falls back to terrain_type if Overpass
 * is unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";
import { computeRaceProfile } from "@/lib/race-analysis/course-profile";
import {
  analyzeTerrainFromGpx,
  buildTerrainLookup,
  type TerrainSegment,
} from "@/lib/race-analysis/terrain-from-osm";
import { inferAndSaveCharacteristics } from "@/lib/race-analysis/infer-characteristics";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { race_id } = (await req.json()) as { race_id?: string };
    if (!race_id) {
      return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    }

    const supabase = await createClient();

    // ── Get race info ─────────────────────────────────────────────────────────
    const { data: race, error: raceErr } = await supabase
      .from("races")
      .select("id, name, terrain_type, race_latitude, race_longitude")
      .eq("id", race_id)
      .maybeSingle();

    if (raceErr || !race) {
      return NextResponse.json(
        { error: raceErr?.message ?? "Race not found" },
        { status: 404 }
      );
    }

    // ── Fetch race files ──────────────────────────────────────────────────────
    const { data: files } = await supabase
      .from("race_files")
      .select("id, file_type, public_url")
      .eq("race_id", race_id)
      .in("file_type", ["gpx", "wind_analysis"]);

    const gpxFile = files?.find((f) => f.file_type === "gpx");
    const windFile = files?.find((f) => f.file_type === "wind_analysis");

    if (!gpxFile) {
      return NextResponse.json(
        { error: "No GPX file found for this race. Upload a GPX first." },
        { status: 404 }
      );
    }

    // ── Download files ────────────────────────────────────────────────────────
    const gpxRes = await fetch(gpxFile.public_url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!gpxRes.ok) {
      return NextResponse.json(
        { error: `Failed to download GPX (HTTP ${gpxRes.status})` },
        { status: 500 }
      );
    }
    const gpxText = await gpxRes.text();

    // Fetch race date from races_meta (canonical per-year date, not a fixed column)
    const { data: raceDateMeta } = await supabase
      .from("races_meta")
      .select("meta_value")
      .eq("race_id", race_id)
      .eq("meta_key", "race_date")
      .maybeSingle();
    const raceDate = raceDateMeta?.meta_value ? new Date(raceDateMeta.meta_value) : null;

    let windCsvText: string | null = null;
    if (windFile) {
      const windRes = await fetch(windFile.public_url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (windRes.ok) windCsvText = await windRes.text();
    }

    // ── Parse GPX ─────────────────────────────────────────────────────────────
    let gpxPoints;
    try {
      gpxPoints = parseGpxPoints(gpxText);
    } catch (err) {
      return NextResponse.json(
        { error: `GPX parse error: ${err instanceof Error ? err.message : err}` },
        { status: 422 }
      );
    }

    // ── Terrain analysis ──────────────────────────────────────────────────────
    const adminClient = createAdminClient();

    // 1. Check if terrain_segments already exists in races_meta
    let terrainSegments: TerrainSegment[] | null = null;
    const { data: existingMeta } = await supabase
      .from("races_meta")
      .select("meta_value")
      .eq("race_id", race_id)
      .eq("meta_key", "terrain_segments")
      .maybeSingle();

    if (existingMeta?.meta_value) {
      try {
        const parsed = JSON.parse(existingMeta.meta_value) as TerrainSegment[];
        if (Array.isArray(parsed) && parsed.length > 0) terrainSegments = parsed;
      } catch {
        // malformed — will re-run analysis
      }
    }

    // 2. If not found (or corrupt), run Overpass analysis and store it
    if (!terrainSegments) {
      terrainSegments = await analyzeTerrainFromGpx(gpxPoints);
      if (terrainSegments) {
        await adminClient.from("races_meta").upsert(
          { race_id, meta_key: "terrain_segments", meta_value: JSON.stringify(terrainSegments) },
          { onConflict: "race_id,meta_key" }
        );
        console.log(`[race-profile] Stored ${terrainSegments.length} terrain segments for ${race.name}`);
      } else {
        console.warn(`[race-profile] Overpass unavailable for ${race.name} — falling back to terrain_type`);
      }
    }

    // 3. Build per-section lookup (falls back to terrain_type, then "trail")
    const fallback = race.terrain_type ?? "trail";
    const terrainLookup = terrainSegments
      ? buildTerrainLookup(terrainSegments, fallback)
      : () => fallback;

    // ── Compute profile ───────────────────────────────────────────────────────
    const profile = computeRaceProfile(gpxPoints, terrainLookup, windCsvText ?? undefined);

    // ── Upsert into race_profiles ─────────────────────────────────────────────
    const { error: upsertErr } = await adminClient
      .from("race_profiles")
      .upsert(
        {
          race_id,
          computed_at: new Date().toISOString(),
          gpx_file_id: gpxFile.id,
          wind_file_id: windFile?.id ?? null,
          profile_source: profile.profile_source,
          total_distance_km: profile.total_distance_km,
          total_ascent_m: profile.total_ascent_m,
          total_descent_m: profile.total_descent_m,
          flat_equivalent_km: profile.flat_equivalent_km,
          difficulty_ratio: profile.difficulty_ratio,
          wind_adjusted_flat_equivalent_km:
            profile.wind_adjusted_flat_equivalent_km ?? null,
          wind_adjusted_difficulty_ratio:
            profile.wind_adjusted_difficulty_ratio ?? null,
          sections_json: profile.sections,
          metadata: {
            race_name: race.name,
            terrain_source: terrainSegments ? "osm" : "terrain_type_fallback",
            terrain_segments_count: terrainSegments?.length ?? 0,
            gpx_points: gpxPoints.length,
            sections_count: profile.sections.length,
          },
        },
        { onConflict: "race_id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: `Failed to save profile: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    // ── Infer and save race characteristics ───────────────────────────────────
    const startCoords = gpxPoints.length > 0
      ? { lat: gpxPoints[0].lat, lon: gpxPoints[0].lon }
      : (race.race_latitude != null ? { lat: race.race_latitude as number, lon: race.race_longitude as number } : null);

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
    );

    // ── Respond ───────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      race_name: race.name,
      profile_source: profile.profile_source,
      terrain_source: terrainSegments ? "osm" : "terrain_type_fallback",
      terrain_segments_count: terrainSegments?.length ?? 0,
      total_distance_km: profile.total_distance_km,
      total_ascent_m: profile.total_ascent_m,
      total_descent_m: profile.total_descent_m,
      flat_equivalent_km: profile.flat_equivalent_km,
      difficulty_ratio: profile.difficulty_ratio,
      wind_adjusted_flat_equivalent_km:
        profile.wind_adjusted_flat_equivalent_km ?? null,
      sections_count: profile.sections.length,
    });
  } catch (err) {
    console.error("[race-profile]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

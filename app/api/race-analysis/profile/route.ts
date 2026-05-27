/**
 * POST /api/race-analysis/profile
 *
 * Computes and stores a race difficulty profile from the race's uploaded GPX
 * (and optionally its wind_analysis CSV).
 *
 * The profile's flat_equivalent_km is the foundation for cross-race finish
 * time estimation via Riegel's formula.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";
import { computeRaceProfile } from "@/lib/race-analysis/course-profile";

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

    // ── Get race info (for terrain_type) ─────────────────────────────────────
    const { data: race, error: raceErr } = await supabase
      .from("races")
      .select("id, name, terrain_type")
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

    let windCsvText: string | null = null;
    if (windFile) {
      const windRes = await fetch(windFile.public_url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (windRes.ok) {
        windCsvText = await windRes.text();
      }
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

    // ── Compute profile ───────────────────────────────────────────────────────
    const profile = computeRaceProfile(
      gpxPoints,
      race.terrain_type,
      windCsvText ?? undefined
    );

    // ── Upsert into race_profiles ─────────────────────────────────────────────
    const adminClient = createAdminClient();

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
            terrain_type: race.terrain_type,
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

    // ── Respond ───────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      race_name: race.name,
      profile_source: profile.profile_source,
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

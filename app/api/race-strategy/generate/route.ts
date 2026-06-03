/**
 * POST /api/race-strategy/generate
 *
 * Generates a race strategy for any race in the database that has a stored
 * race_profile (sections_json). Accepts a target finish time and returns
 * pacing sections, route geometry, wind sections, and elevation data ready
 * for the standalone Race Strategy page to render.
 *
 * Body: { race_id: string; target_minutes: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";
import { buildPacingGuide } from "@/lib/race-analysis/pacing-model";
import type { StoredSection } from "@/lib/race-analysis/pacing-model";

export const maxDuration = 30;

// Wind section shape returned to the client (matches WindSection in the UI)
interface WindSectionOut {
  section_id: number;
  start_km: number;
  end_km: number;
  mid_lat: number;
  mid_lon: number;
  bearing_deg: number;
  median_wind_speed_ms: number;
  median_headwind_ms: number;
  median_crosswind_ms: number;
  wind_risk_label: string;
}

function parseWindCsvToSections(csv: string): WindSectionOut[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const get = (row: string[], key: string) => row[headers.indexOf(key)]?.trim() ?? "";

  return lines.slice(1).flatMap((line): WindSectionOut[] => {
    const cols = line.split(",");
    const sectionId = parseInt(get(cols, "section_id"), 10);
    const startKm   = parseFloat(get(cols, "start_distance_km"));
    const endKm     = parseFloat(get(cols, "end_distance_km"));
    if (isNaN(startKm) || isNaN(endKm)) return [];
    return [{
      section_id:            isNaN(sectionId) ? 0 : sectionId,
      start_km:              startKm,
      end_km:                endKm,
      mid_lat:               parseFloat(get(cols, "mid_lat"))               || 0,
      mid_lon:               parseFloat(get(cols, "mid_lon"))               || 0,
      bearing_deg:           parseFloat(get(cols, "bearing_deg"))           || 0,
      median_wind_speed_ms:  parseFloat(get(cols, "median_wind_speed_ms"))  || 0,
      median_headwind_ms:    parseFloat(get(cols, "median_headwind_ms"))    || 0,
      median_crosswind_ms:   parseFloat(get(cols, "median_crosswind_ms"))   || 0,
      wind_risk_label:       get(cols, "wind_risk_label") || "low_wind_risk",
    }];
  });
}

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as { race_id?: string; target_minutes?: number };
    const { race_id, target_minutes } = body;

    if (!race_id)        return NextResponse.json({ error: "race_id required" }, { status: 400 });
    if (!target_minutes || target_minutes <= 0)
      return NextResponse.json({ error: "target_minutes must be > 0" }, { status: 400 });

    const supabase = await createClient();

    // ── 1. Race profile (sections_json + stats) ──────────────────────────────
    const { data: profile, error: profErr } = await supabase
      .from("race_profiles")
      .select("race_id, total_distance_km, total_ascent_m, total_descent_m, sections_json, metadata")
      .eq("race_id", race_id)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json(
        { error: "No race profile found. Please compute a course profile first in Race Files." },
        { status: 404 }
      );
    }

    // ── 2. Race name + stored coordinates ────────────────────────────────────
    const { data: race } = await supabase
      .from("races")
      .select("id, name, race_latitude, race_longitude")
      .eq("id", race_id)
      .maybeSingle();

    const raceName  = race?.name ?? (profile.metadata as { race_name?: string })?.race_name ?? "Race";
    const raceLat   = (race as { race_latitude?: number | null } | null)?.race_latitude  ?? null;
    const raceLon   = (race as { race_longitude?: number | null } | null)?.race_longitude ?? null;

    // ── 2b. Most recent race date from race_dates ─────────────────────────────
    // Prefer the most recent past date; fall back to any future date.
    const { data: pastDates } = await supabase
      .from("race_dates")
      .select("start_date")
      .eq("race_id", race_id)
      .lte("start_date", new Date().toISOString().slice(0, 10))
      .order("start_date", { ascending: false })
      .limit(1);

    let raceDate: string | null = (pastDates?.[0] as { start_date: string } | undefined)?.start_date ?? null;

    if (!raceDate) {
      const { data: futureDates } = await supabase
        .from("race_dates")
        .select("start_date")
        .eq("race_id", race_id)
        .order("start_date", { ascending: true })
        .limit(1);
      raceDate = (futureDates?.[0] as { start_date: string } | undefined)?.start_date ?? null;
    }

    // ── 3. Race files (GPX + optional wind CSV) ───────────────────────────────
    const { data: files } = await supabase
      .from("race_files")
      .select("file_type, public_url")
      .eq("race_id", race_id)
      .in("file_type", ["gpx", "wind_analysis"]);

    const gpxFile  = files?.find(f => f.file_type === "gpx");
    const windFile = files?.find(f => f.file_type === "wind_analysis");

    // ── 4. Download GPX for route points ─────────────────────────────────────
    let routePoints: { lat: number; lon: number }[] = [];
    // Prefer stored race coordinates; fall back to first GPX point
    let weatherLat: number | null = raceLat ? Number(raceLat) : null;
    let weatherLon: number | null = raceLon ? Number(raceLon) : null;

    if (gpxFile?.public_url) {
      try {
        const gpxRes = await fetch(gpxFile.public_url, { signal: AbortSignal.timeout(15_000) });
        if (gpxRes.ok) {
          const gpxText = await gpxRes.text();
          const gpxPoints = parseGpxPoints(gpxText);
          routePoints = gpxPoints.map(p => ({ lat: p.lat, lon: p.lon }));
          if (gpxPoints.length > 0 && weatherLat === null) {
            weatherLat = gpxPoints[0].lat;
            weatherLon = gpxPoints[0].lon;
          }
        }
      } catch {
        // Route map will be hidden if GPX can't be fetched
      }
    }

    // ── 5. Download and parse wind CSV ────────────────────────────────────────
    let windSections: WindSectionOut[] | null = null;

    if (windFile?.public_url) {
      try {
        const windRes = await fetch(windFile.public_url, { signal: AbortSignal.timeout(15_000) });
        if (windRes.ok) {
          const csv = await windRes.text();
          windSections = parseWindCsvToSections(csv);
        }
      } catch {
        // Wind arrows will be hidden
      }
    }

    // ── 6. Elevation profile + sustained segments from races_meta ─────────────
    const { data: metaRows } = await supabase
      .from("races_meta")
      .select("meta_key, meta_value")
      .eq("race_id", race_id)
      .in("meta_key", ["elevation_profile", "sustained_segments"]);

    const meta: Record<string, string> = {};
    for (const row of (metaRows ?? []) as { meta_key: string; meta_value: string }[]) {
      meta[row.meta_key] = row.meta_value;
    }

    // ── 7. Build pacing guide from stored sections ────────────────────────────
    const rawSections = (profile.sections_json ?? []) as StoredSection[];
    const guide = buildPacingGuide(race_id, raceName, rawSections, target_minutes);

    const pacingSections = guide.sections.map(s => ({
      start_km:     s.start_distance_km,
      end_km:       s.end_distance_km,
      section_type: s.section_type,
      target_pace:  s.target_pace,
      pace_band:    s.acceptable_pace_band,
    }));

    // ── 8. Respond ────────────────────────────────────────────────────────────
    return NextResponse.json({
      race: {
        id:                race_id,
        name:              raceName,
        total_distance_km: profile.total_distance_km,
        total_ascent_m:    profile.total_ascent_m,
        total_descent_m:   profile.total_descent_m,
        race_date:         raceDate,
        weather_lat:       weatherLat,
        weather_lon:       weatherLon,
      },
      pacing:             pacingSections,
      route:              routePoints,
      wind_sections:      windSections,
      elevation_profile:  meta.elevation_profile  ?? null,
      sustained_segments: meta.sustained_segments ?? null,
    });
  } catch (err) {
    console.error("[race-strategy/generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

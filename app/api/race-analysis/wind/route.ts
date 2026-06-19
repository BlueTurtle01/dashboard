/**
 * POST /api/race-analysis/wind
 *
 * Generates a wind analysis CSV for a race from its uploaded GPX file.
 *
 * 1. Validates the caller is an admin.
 * 2. Fetches the GPX file URL from race_files.
 * 3. Downloads and parses the GPX.
 * 4. Splits the route into sections.
 * 5. Calls the Open-Meteo Archive API for each section (parallel).
 * 6. Generates a CSV compatible with race_pacing_model_fitness_goals.py.
 * 7. Uploads the CSV to the race-files storage bucket.
 * 8. Upserts a race_files row for file_type = 'wind_analysis'.
 * 9. Returns a summary JSON response.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";
import { buildSections } from "@/lib/race-analysis/sections";
import { analyseWindSections } from "@/lib/race-analysis/wind";
import { formatWindCsv } from "@/lib/race-analysis/csv";
import { DEFAULT_WIND_SETTINGS } from "@/lib/race-analysis/types";
import type { WindAnalysisSettings } from "@/lib/race-analysis/types";


// Allow up to 60 s for this route (multiple parallel Open-Meteo calls)
export const maxDuration = 60;

const BUCKET = "race-files";

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = (await req.json()) as {
      race_id?: string;
      settings?: Partial<WindAnalysisSettings>;
    };

    const { race_id, settings: partialSettings } = body;

    if (!race_id) {
      return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    }

    // ── Fetch race + GPX file record ──────────────────────────────────────────
    const supabase = await createClient();

    const [{ data: raceDateRow }, { data: gpxFile, error: gpxErr }] = await Promise.all([
      supabase.from("race_dates").select("start_date").eq("race_id", race_id).order("start_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("race_files").select("id, public_url, file_name").eq("race_id", race_id).eq("file_type", "gpx").maybeSingle(),
    ]);

    if (gpxErr) {
      return NextResponse.json(
        { error: `Database error: ${gpxErr.message}` },
        { status: 500 }
      );
    }

    if (!gpxFile) {
      return NextResponse.json(
        { error: "No GPX file found for this race. Upload a GPX first." },
        { status: 404 }
      );
    }

    // ── Download GPX ──────────────────────────────────────────────────────────
    const gpxRes = await fetch(gpxFile.public_url, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!gpxRes.ok) {
      return NextResponse.json(
        { error: `Failed to download GPX file (HTTP ${gpxRes.status})` },
        { status: 500 }
      );
    }

    const gpxText = await gpxRes.text();

    // ── Resolve race date from race_dates ─────────────────────────────────────
    const raceEndDate = raceDateRow?.start_date ? new Date(raceDateRow.start_date) : null;

    // Merge settings: explicit caller settings override, then stored race date, then defaults
    const settings: WindAnalysisSettings = {
      ...DEFAULT_WIND_SETTINGS,
      start_hour: 6,
      end_hour: 22,
      ...(raceEndDate && !partialSettings?.race_month
        ? { race_month: raceEndDate.getMonth() + 1, race_day: raceEndDate.getDate() }
        : {}),
      ...partialSettings,
    };

    // If no date available (no race_dates row + no explicit settings), skip gracefully
    if (!raceEndDate && !partialSettings?.race_month) {
      return NextResponse.json({ skipped: true, reason: "no_date" });
    }

    // ── Parse + section ───────────────────────────────────────────────────────
    let points;
    try {
      points = parseGpxPoints(gpxText);
    } catch (err) {
      return NextResponse.json(
        { error: `GPX parse error: ${err instanceof Error ? err.message : err}` },
        { status: 422 }
      );
    }

    const sections = buildSections(points, settings.section_km);

    if (sections.length === 0) {
      return NextResponse.json(
        { error: "Could not create any route sections from the GPX file." },
        { status: 422 }
      );
    }

    // ── Wind analysis (parallel Open-Meteo calls) ─────────────────────────────
    const results = await analyseWindSections(sections, settings);

    const insufficientCount = results.filter(
      (r) => r.wind_risk_label === "insufficient_data"
    ).length;

    // ── Generate CSV ──────────────────────────────────────────────────────────
    const csv = formatWindCsv(results);

    // ── Upload to storage ─────────────────────────────────────────────────────
    const adminClient = createAdminClient();
    const uuid = crypto.randomUUID();
    const storagePath = `${race_id}/wind_analysis/${uuid}.csv`;

    const csvBytes = new TextEncoder().encode(csv);
    const { error: uploadErr } = await adminClient.storage
      .from(BUCKET)
      .upload(storagePath, csvBytes, {
        contentType: "text/csv",
        upsert: false,
      });

    if (uploadErr) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = adminClient.storage.from(BUCKET).getPublicUrl(storagePath);

    // ── Current user for uploaded_by ─────────────────────────────────────────
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // ── Remove previous wind_analysis file for this race (if any) ────────────
    const { data: existing } = await adminClient
      .from("race_files")
      .select("id, storage_path")
      .eq("race_id", race_id)
      .eq("file_type", "wind_analysis")
      .maybeSingle();

    if (existing) {
      await adminClient.storage.from(BUCKET).remove([existing.storage_path]);
      await adminClient.from("race_files").delete().eq("id", existing.id);
    }

    // ── Insert new file record ────────────────────────────────────────────────
    const { error: insertErr } = await adminClient.from("race_files").insert({
      race_id,
      file_type: "wind_analysis",
      file_name: "section_wind_analysis.csv",
      storage_path: storagePath,
      public_url: publicUrl,
      file_size_bytes: csvBytes.byteLength,
      mime_type: "text/csv",
      uploaded_by: user?.id ?? null,
      metadata: {
        generated: true,
        generator: "open-meteo-era5",
        settings,
        sections_count: sections.length,
        gpx_file_id: gpxFile.id,
      },
    });

    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to save file record: ${insertErr.message}` },
        { status: 500 }
      );
    }

    // ── Respond ───────────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      sections_count: sections.length,
      gpx_points: points.length,
      insufficient_data_sections: insufficientCount,
      settings_used: settings,
      race_date_used: raceEndDate?.toISOString().slice(0, 10) ?? null,
    });
  } catch (err) {
    console.error("[wind-analysis]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/race-files-import
 *
 * Called from the race-files admin page after a results CSV is stored in
 * Storage.  Parses the CSV, filters to Male/Female only (drops relays and
 * sweeps), then bulk-inserts race_results with checkpoint_times populated.
 *
 * Unlike /api/admin/results-import this route:
 *  - Accepts an explicit race_id (the race is already selected in the UI)
 *  - Filters gender to Male | Female
 *  - Does not perform name-based race resolution
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles, getCurrentUser } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { parseCsvFile } from "@/lib/results-import/csv-parser";

export const maxDuration = 60;

const BATCH_SIZE = 500;

export async function POST(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  const supabase = await createClient();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const race_id = formData.get("race_id") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!race_id) return NextResponse.json({ error: "race_id required" }, { status: 400 });

  const filename = file.name;
  try {
    const text = await file.text();
    const parsed = parseCsvFile(filename, text);

    // Check for duplicate import (same filename already imported for this race)
    const { data: existing } = await supabase
      .from("race_result_imports")
      .select("id")
      .eq("original_filename", filename)
      .eq("race_id", race_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        warning: "Already imported — skipped",
        raceName: parsed.raceName,
        raceYear: parsed.raceYear,
        rowCount: 0,
      });
    }

    // Filter to Male/Female only — excludes relay teams, sweeps, ungendered entries
    const rows = parsed.rows.filter(
      (r) => r.gender === "Male" || r.gender === "Female"
    );

    if (!rows.length) {
      return NextResponse.json({
        warning: "No Male/Female rows found in CSV",
        raceName: parsed.raceName,
        raceYear: parsed.raceYear,
        rowCount: 0,
        parseErrors: parsed.parseErrors,
      });
    }

    // Create import record
    const { data: importRecord, error: importErr } = await supabase
      .from("race_result_imports")
      .insert({
        imported_by: user?.id ?? null,
        original_filename: filename,
        race_id,
        row_count: rows.length,
      })
      .select("id")
      .single();

    if (importErr || !importRecord) {
      return NextResponse.json(
        { error: importErr?.message ?? "Failed to create import record" },
        { status: 500 }
      );
    }

    // Bulk insert race_results with checkpoint_times
    let insertedCount = 0;
    let batchError: string | null = null;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
        race_id,
        import_id: importRecord.id,
        full_name: r.full_name,
        result_year: r.result_year,
        result_status: r.result_status,
        finish_seconds: r.finish_seconds,
        position: r.position,
        bib_number: r.bib_number,
        gender: r.gender,
        age_group: r.age_group,
        additional_data: r.additional_data,
        checkpoint_times: r.checkpoint_times,
      }));

      const { error: bErr } = await supabase.from("race_results").insert(batch);
      if (bErr) {
        batchError = bErr.message;
        break;
      }
      insertedCount += batch.length;
    }

    if (batchError) {
      return NextResponse.json(
        { error: `Inserted ${insertedCount} rows then failed: ${batchError}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      raceName: parsed.raceName,
      raceYear: parsed.raceYear,
      rowCount: insertedCount,
      importId: importRecord.id,
      parseErrors: parsed.parseErrors,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

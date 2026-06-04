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

  const files = formData.getAll("files") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results = [];

  for (const file of files) {
    const filename = file.name;
    try {
      const text = await file.text();
      const parsed = parseCsvFile(filename, text);

      if (!parsed.rows.length) {
        results.push({ filename, error: parsed.parseErrors[0] ?? "No rows parsed" });
        continue;
      }

      // Check for duplicate import (same filename already imported)
      const { data: existing } = await supabase
        .from("race_result_imports")
        .select("id, race_id")
        .eq("original_filename", filename)
        .maybeSingle();

      if (existing) {
        results.push({ filename, warning: "Already imported — skipped", raceId: existing.race_id });
        continue;
      }

      // Get-or-create races row for this (dedupSlug, raceYear) combination
      let raceId: string;
      const { data: existingRace } = await supabase
        .from("races")
        .select("id")
        .eq("slug", parsed.dedupSlug)
        .eq("race_year", parsed.raceYear)
        .maybeSingle();

      if (existingRace) {
        raceId = existingRace.id;
      } else {
        const { data: newRace, error: raceErr } = await supabase
          .from("races")
          .insert({
            name: parsed.raceName,
            slug: parsed.dedupSlug,
            race_year: parsed.raceYear,
            is_published: false,
          })
          .select("id")
          .single();

        if (raceErr || !newRace) {
          results.push({ filename, error: raceErr?.message ?? "Failed to create race" });
          continue;
        }
        raceId = newRace.id;
      }

      // Create import record
      const { data: importRecord, error: importErr } = await supabase
        .from("race_result_imports")
        .insert({
          imported_by: user?.id ?? null,
          original_filename: filename,
          race_id: raceId,
          row_count: parsed.rows.length,
        })
        .select("id")
        .single();

      if (importErr || !importRecord) {
        results.push({ filename, error: importErr?.message ?? "Failed to create import record" });
        continue;
      }

      // Bulk insert race_results in batches
      let insertedCount = 0;
      let batchError: string | null = null;

      for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
        const batch = parsed.rows.slice(i, i + BATCH_SIZE).map((r) => ({
          race_id: raceId,
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
        }));

        const { error: bErr } = await supabase.from("race_results").insert(batch);
        if (bErr) {
          batchError = bErr.message;
          break;
        }
        insertedCount += batch.length;
      }

      if (batchError) {
        results.push({ filename, error: `Inserted ${insertedCount} rows then failed: ${batchError}` });
      } else {
        results.push({
          filename,
          raceName: parsed.raceName,
          raceYear: parsed.raceYear,
          rowCount: insertedCount,
          raceId,
          importId: importRecord.id,
          parseErrors: parsed.parseErrors,
        });
      }
    } catch (err) {
      results.push({ filename, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}

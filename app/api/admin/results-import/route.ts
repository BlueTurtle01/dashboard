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

      // Resolve race by name (3-step):
      //   1. Prefer an existing published race with the same name — links directly to the
      //      canonical course row, matching how manually-uploaded races are stored.
      //   2. Fall back to an existing unpublished race with the same name — two CSVs for
      //      the same course (different years) end up under one races row; result_year on
      //      race_results distinguishes them.
      //   3. Create a new unpublished row with no year in the slug — correct model where
      //      the course is the identity and the year lives on race_results.result_year.
      let raceId: string;

      const { data: publishedMatch } = await supabase
        .from("races")
        .select("id")
        .eq("name", parsed.raceName)
        .eq("is_published", true)
        .maybeSingle();

      if (publishedMatch) {
        raceId = publishedMatch.id;
      } else {
        const { data: unpublishedMatch } = await supabase
          .from("races")
          .select("id")
          .eq("name", parsed.raceName)
          .eq("is_published", false)
          .maybeSingle();

        if (unpublishedMatch) {
          raceId = unpublishedMatch.id;
        } else {
          // slugify(raceName) without a year suffix — the slug is the course identity
          const courseSlug = parsed.dedupSlug.replace(/-\d{4}$/, "");
          const { data: newRace, error: raceErr } = await supabase
            .from("races")
            .insert({
              name: parsed.raceName,
              slug: courseSlug,
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
      }

      // If no rows were parsed, create/find the race but skip results.
      // No import record is created so the file can be re-uploaded after fixing the CSV.
      if (!parsed.rows.length) {
        results.push({
          filename,
          warning: `Race created with no results — ${parsed.parseErrors[0] ?? "No rows parsed"}`,
          raceName: parsed.raceName,
          raceYear: parsed.raceYear,
          rowCount: 0,
          raceId,
        });
        continue;
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

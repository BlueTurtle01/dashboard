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

  // Parse all files and read their text in parallel, then bulk-fetch matching races
  // to avoid 3 sequential DB round-trips per file inside the loop.
  const parsedFiles = await Promise.all(
    files.map(async (file) => {
      const filename = file.name;
      try {
        const text = await file.text();
        return { filename, parsed: parseCsvFile(filename, text), error: null };
      } catch (err) {
        return { filename, parsed: null, error: String(err) };
      }
    })
  );

  // Duplicate-import checks in parallel
  const dupChecks = await Promise.all(
    parsedFiles.map(({ filename }) =>
      supabase
        .from("race_result_imports")
        .select("id, race_id")
        .eq("original_filename", filename)
        .maybeSingle()
    )
  );

  // Pre-fetch all races matching any of the CSV race names in a single query
  const uniqueRaceNames = [
    ...new Set(
      parsedFiles
        .filter((pf, i) => !pf.error && !dupChecks[i].data)
        .map((pf) => pf.parsed!.raceName)
    ),
  ];

  // racesByName[name] = { published?, unpublished? }
  const racesByName: Record<string, { published?: string; unpublished?: string }> = {};
  if (uniqueRaceNames.length > 0) {
    const { data: existingRaces } = await supabase
      .from("races")
      .select("id, name, is_published")
      .in("name", uniqueRaceNames);
    for (const race of existingRaces ?? []) {
      if (!racesByName[race.name]) racesByName[race.name] = {};
      if (race.is_published) racesByName[race.name].published = race.id;
      else racesByName[race.name].unpublished = race.id;
    }
  }

  for (let fileIdx = 0; fileIdx < parsedFiles.length; fileIdx++) {
    const { filename, parsed, error: parseError } = parsedFiles[fileIdx];
    if (parseError) {
      results.push({ filename, error: parseError });
      continue;
    }

    try {
      const existing = dupChecks[fileIdx].data;

      if (existing) {
        results.push({ filename, warning: "Already imported — skipped", raceId: existing.race_id });
        continue;
      }

      // Resolve race using pre-fetched data; only insert if truly new.
      // Race model: the course (name) is the identity; result_year distinguishes editions.
      let raceId: string;
      const knownRace = racesByName[parsed!.raceName];

      if (knownRace?.published) {
        raceId = knownRace.published;
      } else if (knownRace?.unpublished) {
        raceId = knownRace.unpublished;
      } else {
        const courseSlug = parsed!.dedupSlug.replace(/-\d{4}$/, "");
        const { data: newRace, error: raceErr } = await supabase
          .from("races")
          .insert({
            name: parsed!.raceName,
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
        // Cache so sibling files with the same name reuse it
        racesByName[parsed!.raceName] = { unpublished: raceId };
      }

      // If no rows were parsed, create/find the race but skip results.
      // No import record is created so the file can be re-uploaded after fixing the CSV.
      if (!parsed!.rows.length) {
        results.push({
          filename,
          warning: `Race created with no results — ${parsed!.parseErrors[0] ?? "No rows parsed"}`,
          raceName: parsed!.raceName,
          raceYear: parsed!.raceYear,
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
          row_count: parsed!.rows.length,
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

      for (let i = 0; i < parsed!.rows.length; i += BATCH_SIZE) {
        const batch = parsed!.rows.slice(i, i + BATCH_SIZE).map((r) => ({
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
          raceName: parsed!.raceName,
          raceYear: parsed!.raceYear,
          rowCount: insertedCount,
          raceId,
          importId: importRecord.id,
          parseErrors: parsed!.parseErrors,
        });
      }
    } catch (err) {
      results.push({ filename, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}

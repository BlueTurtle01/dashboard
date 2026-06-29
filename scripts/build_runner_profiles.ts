/**
 * Build Riegel exponent profiles for anonymous runners in race_results.
 *
 * For each runner with 2+ finishes, fits a personal Riegel exponent using
 * OLS on log(time) vs log(flat_equivalent_km), then upserts into
 * als_athlete_profiles.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/build_runner_profiles.ts
 *
 * Idempotent — safe to re-run; updates existing rows in-place.
 */

import { createClient } from "@supabase/supabase-js";
import { fitRiegelExponent } from "../lib/race-analysis/riegel";

const SUPABASE_URL = "https://lcwvxpdqscuumpgniaqh.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Get it from: Supabase dashboard > Project Settings > API > service_role"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const POPULATION_PRIOR_B = 1.06;
const BATCH_SIZE = 500;

function normalizeKey(name: string): string {
  return name.toLowerCase().trim();
}

type RawResult = {
  full_name: string;
  finish_seconds: number;
  race_profiles: { flat_equivalent_km: number; total_distance_km: number } | null;
};

async function fetchAllFinishResults(): Promise<RawResult[]> {
  const rows: RawResult[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("race_results")
      .select(
        "full_name, finish_seconds, race_profiles!inner(flat_equivalent_km, total_distance_km)"
      )
      .eq("result_status", "FINISHED")
      .not("finish_seconds", "is", null)
      .not("full_name", "is", null)
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(`Fetch error: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as unknown as RawResult[]));
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

async function main() {
  console.log("Fetching finish results…");
  const results = await fetchAllFinishResults();
  console.log(`  ${results.length} finish results loaded.`);

  // Group by normalised name
  const byRunner = new Map<
    string,
    { flat_equiv_km: number; time_minutes: number; dist_km: number }[]
  >();

  for (const r of results) {
    if (!r.race_profiles) continue;
    const key = normalizeKey(r.full_name);
    if (!byRunner.has(key)) byRunner.set(key, []);
    byRunner.get(key)!.push({
      flat_equiv_km: r.race_profiles.flat_equivalent_km,
      time_minutes: r.finish_seconds / 60,
      dist_km: r.race_profiles.total_distance_km ?? 0,
    });
  }

  console.log(`  ${byRunner.size} distinct runners found.`);

  const eligible = [...byRunner.entries()].filter(([, v]) => v.length >= 2);
  console.log(`  ${eligible.length} runners with 2+ finishes (eligible for profile update).`);

  const upsertRows: {
    athlete_key: string;
    riegel_b: number;
    riegel_b_confidence: number;
    longest_distance_km: number;
    computed_at: string;
  }[] = [];

  for (const [athleteKey, entries] of eligible) {
    const fit = fitRiegelExponent(
      entries.map((e) => ({ flat_equiv_km: e.flat_equiv_km, time_minutes: e.time_minutes }))
    );

    const riegelB = fit?.exponent ?? POPULATION_PRIOR_B;
    const riegelBConfidence = fit?.entry_count ?? 0;
    const longestDistanceKm = Math.max(...entries.map((e) => e.dist_km));

    upsertRows.push({
      athlete_key: athleteKey,
      riegel_b: riegelB,
      riegel_b_confidence: riegelBConfidence,
      longest_distance_km: longestDistanceKm,
      computed_at: new Date().toISOString(),
    });
  }

  // Upsert in batches
  let upserted = 0;
  for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
    const batch = upsertRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("als_athlete_profiles")
      .upsert(batch, { onConflict: "athlete_key", ignoreDuplicates: false });

    if (error) {
      console.error(`Upsert error at batch ${i}: ${error.message}`);
      process.exit(1);
    }
    upserted += batch.length;
    process.stdout.write(`\r  Upserted ${upserted}/${upsertRows.length}…`);
  }

  console.log(`\nDone. ${upserted} runner profiles updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

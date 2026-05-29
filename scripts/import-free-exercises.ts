/**
 * One-time import script for free-exercise-db exercises.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/import-free-exercises.ts
 *
 * Get your service role key from:
 *   Supabase dashboard > Project Settings > API > service_role key
 *
 * The script is idempotent — it skips exercises whose name already exists.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lcwvxpdqscuumpgniaqh.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY env var.\n" +
      "Get it from: Supabase dashboard > Project Settings > API > service_role"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ── Mappings ─────────────────────────────────────────────────────────────────

const MUSCLE_MAP: Record<string, string | null> = {
  abdominals: "core",
  abductors: "abductors",
  adductors: "adductors",
  biceps: "biceps",
  calves: "calves",
  chest: "chest",
  forearms: "forearms",
  glutes: "glutes",
  hamstrings: "hamstrings",
  lats: "lats",
  "lower back": "lower_back",
  "middle back": "upper_back",
  neck: null, // not in muscle_options
  quadriceps: "quadriceps",
  shoulders: "shoulders",
  traps: "upper_back",
  triceps: "triceps",
};

const EQUIPMENT_MAP: Record<string, string | null> = {
  "body only": "bodyweight",
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  machine: "machine",
  bands: "bands",
  kettlebells: "kettlebell",
  "exercise ball": null, // not in equipment_options
  "foam roll": null, // not in equipment_options
  "medicine ball": "medicine_ball",
  "e-z curl bar": "bar",
  other: null,
};

const TARGET_CATEGORIES = new Set([
  "strength",
  "powerlifting",
  "olympic weightlifting",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawExercise {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
}

interface ExerciseRow {
  id: string;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  steps: string[];
  level: string;
  mechanic: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapMuscles(names: string[]): string[] {
  const mapped: string[] = [];
  for (const name of names) {
    const slug = MUSCLE_MAP[name.toLowerCase()];
    if (slug) mapped.push(slug);
    else if (slug === undefined) unmappedMuscles.add(name);
  }
  return [...new Set(mapped)];
}

function mapEquipment(name: string | null): string[] {
  if (!name) return [];
  const slug = EQUIPMENT_MAP[name.toLowerCase()];
  if (slug) return [slug];
  if (slug === undefined) unmappedEquipment.add(name);
  return [];
}

const unmappedMuscles = new Set<string>();
const unmappedEquipment = new Set<string>();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching exercises from free-exercise-db...");
  const res = await fetch(
    "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching exercises.json`);
  const all: RawExercise[] = await res.json();

  const filtered = all.filter((e) =>
    TARGET_CATEGORIES.has(e.category.toLowerCase())
  );
  console.log(
    `Total: ${all.length} exercises | After category filter: ${filtered.length}`
  );

  // Load existing names for dedup (case-insensitive)
  const { data: existing, error: existingErr } = await supabase
    .from("exercises")
    .select("name");
  if (existingErr) throw existingErr;
  const existingNames = new Set(
    (existing ?? []).map((r: { name: string }) => r.name.toLowerCase().trim())
  );
  console.log(`Found ${existingNames.size} existing exercises to skip.`);

  const toInsert: ExerciseRow[] = [];
  const skipped: string[] = [];

  for (const ex of filtered) {
    if (existingNames.has(ex.name.toLowerCase().trim())) {
      skipped.push(ex.name);
      continue;
    }
    toInsert.push({
      id: ex.id,
      name: ex.name,
      primary_muscles: mapMuscles(ex.primaryMuscles),
      secondary_muscles: mapMuscles(ex.secondaryMuscles),
      equipment: mapEquipment(ex.equipment),
      steps: ex.instructions,
      level: ex.level,
      mechanic: ex.mechanic,
    });
  }

  console.log(
    `\nTo insert: ${toInsert.length} | Skipped (duplicate): ${skipped.length}`
  );
  if (skipped.length > 0) {
    console.log("Skipped:", skipped.slice(0, 10).join(", ") + (skipped.length > 10 ? "..." : ""));
  }

  // Batch insert in chunks of 50
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const { error } = await supabase.from("exercises").insert(chunk);
    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH) + 1} failed:`, error.message);
      // Log the first offending row for debugging
      console.error("First row:", JSON.stringify(chunk[0], null, 2));
      throw error;
    }
    inserted += chunk.length;
    process.stdout.write(`\rInserted ${inserted}/${toInsert.length}...`);
  }

  console.log(`\n\nDone! Inserted ${inserted} exercises.`);

  if (unmappedMuscles.size > 0) {
    console.warn("\nUnmapped muscles (check MUSCLE_MAP):", [...unmappedMuscles]);
  }
  if (unmappedEquipment.size > 0) {
    console.warn(
      "\nUnmapped equipment (check EQUIPMENT_MAP):",
      [...unmappedEquipment]
    );
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});

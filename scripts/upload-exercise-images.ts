/**
 * Uploads exercise demo images from free-exercise-db to Supabase storage.
 * Run AFTER import-free-exercises.ts.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/upload-exercise-images.ts
 *
 * Images are fetched from GitHub and stored in the exercise-media bucket
 * at exercise-photos/{exerciseId}.jpg, then the exercise row is updated.
 *
 * The script is resumable — exercises that already have a photo_url are skipped.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lcwvxpdqscuumpgniaqh.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GITHUB_BASE =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const BUCKET = "exercise-media";
const DELAY_MS = 120; // polite delay between GitHub fetches

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Fetch exercises that need images (photo_url is null)
  const { data: exercises, error } = await supabase
    .from("exercises")
    .select("id, name")
    .is("photo_url", null);

  if (error) throw error;
  if (!exercises || exercises.length === 0) {
    console.log("No exercises missing photo_url. Nothing to do.");
    return;
  }

  console.log(`Found ${exercises.length} exercises without images.`);

  let uploaded = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i] as { id: string; name: string };
    const imageUrl = `${GITHUB_BASE}/${ex.id}/0.jpg`;
    const storagePath = `exercise-photos/${ex.id}.jpg`;

    process.stdout.write(
      `\r[${i + 1}/${exercises.length}] ${ex.name.slice(0, 40).padEnd(40)}`
    );

    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        // Some exercises may not have images in the repo
        if (imgRes.status === 404) {
          failures.push(`${ex.id} (no image in repo)`);
          failed++;
          await sleep(DELAY_MS);
          continue;
        }
        throw new Error(`HTTP ${imgRes.status}`);
      }

      const buffer = await imgRes.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, bytes, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadErr && uploadErr.message !== "The resource already exists") {
        throw uploadErr;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      // Update the exercise row
      const { error: updateErr } = await supabase
        .from("exercises")
        .update({ photo_url: urlData.publicUrl })
        .eq("id", ex.id);

      if (updateErr) throw updateErr;
      uploaded++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${ex.id}: ${msg}`);
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n\nDone!`);
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Failed:   ${failed}`);

  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log("  -", f));
  }
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});

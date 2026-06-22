"use server";

import { promises as fs } from "fs";
import path from "path";
import { createAdminClient } from "@/lib/supabase/admin";

export async function savePlanVersion(
  name: string,
  notes: string
): Promise<{ version: number; fileCopied: boolean }> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("plan_versions")
    .select("version_number")
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = data && data.length > 0 ? data[0].version_number + 1 : 1;

  // Copy the file to v{N}/page.tsx — works in local dev; Vercel's filesystem is read-only
  let fileCopied = false;
  try {
    const root = process.cwd();
    const src     = path.join(root, "app", "admin", "race-readiness", "page.tsx");
    const destDir = path.join(root, "app", "admin", "race-readiness", `v${nextVersion}`);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(src, path.join(destDir, "page.tsx"));
    fileCopied = true;
  } catch {
    // Read-only filesystem (production) — commit the file manually after running locally
  }

  await supabase.from("plan_versions").update({ is_current: false }).gte("version_number", 0);

  const { error } = await supabase.from("plan_versions").insert({
    version_number: nextVersion,
    name: name.trim() || null,
    notes: notes.trim() || null,
    is_current: true,
  });

  if (error) throw new Error(error.message);

  return { version: nextVersion, fileCopied };
}

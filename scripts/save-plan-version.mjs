#!/usr/bin/env node
// Archive the current race readiness plan as a new numbered version.
// Usage: node scripts/save-plan-version.mjs "What changed in this version"
//
// What it does:
//   1. Finds the highest existing v{N} directory under app/admin/race-readiness/
//   2. Copies the current page.tsx to v{N+1}/page.tsx
//   3. Inserts a record into the plan_versions Supabase table (requires .env.local)
//
// After running:
//   git add app/admin/race-readiness/v{N}/
//   git commit -m "Archive race readiness plan v{N}"
//   Deploy → accessible at /admin/race-readiness/v{N}

import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  const content = await fs.readFile(envPath, 'utf8').catch(() => '');
  return Object.fromEntries(
    content
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=');
        const key = l.slice(0, idx).trim();
        const val = l.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        return [key, val];
      })
  );
}

const env = await loadEnvLocal();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Determine next version number ──────────────────────────────────────────
const versionsParent = path.join(root, 'app', 'admin', 'race-readiness');
const entries = await fs.readdir(versionsParent);
const versionDirs = entries.filter(e => /^v\d+$/.test(e));
const maxVersion = versionDirs.reduce((max, v) => {
  const n = parseInt(v.slice(1), 10);
  return n > max ? n : max;
}, 0);
const nextVersion = maxVersion + 1;

// ── Copy file ──────────────────────────────────────────────────────────────
const src = path.join(versionsParent, 'page.tsx');
const destDir = path.join(versionsParent, `v${nextVersion}`);
const dest = path.join(destDir, 'page.tsx');

await fs.mkdir(destDir, { recursive: true });
await fs.copyFile(src, dest);
console.log(`\n✓ Saved: app/admin/race-readiness/v${nextVersion}/page.tsx`);

// ── Record in Supabase ─────────────────────────────────────────────────────
const notes = process.argv[2] || null;

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await supabase.from('plan_versions').update({ is_current: false }).gte('version_number', 0);

  const { error } = await supabase.from('plan_versions').insert({
    version_number: nextVersion,
    notes,
    is_current: true,
  });

  if (error) {
    console.error(`✗ DB insert failed: ${error.message}`);
    console.log(`  Run manually in Supabase SQL editor:`);
    console.log(`  INSERT INTO plan_versions (version_number, notes, is_current)`);
    console.log(`  VALUES (${nextVersion}, '${(notes ?? '').replace(/'/g, "''")}', true);`);
  } else {
    console.log(`✓ Recorded in plan_versions as v${nextVersion}`);
  }
} else {
  console.warn(`⚠  No Supabase credentials found — skipping DB insert.`);
  console.log(`  Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local`);
  console.log(`  Or run in Supabase SQL editor:`);
  console.log(`  INSERT INTO plan_versions (version_number, notes, is_current)`);
  console.log(`  VALUES (${nextVersion}, '${(notes ?? '').replace(/'/g, "''")}', true);`);
}

console.log(`
Next steps:
  git add app/admin/race-readiness/v${nextVersion}/
  git commit -m "Archive race readiness plan v${nextVersion}"
  Push and deploy → /admin/race-readiness/v${nextVersion}
`);

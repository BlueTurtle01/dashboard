/**
 * POST /api/admin/backfill-race-coords
 *
 * One-shot backfill: finds every race that has a GPX file in race_files
 * but no race_latitude / race_longitude stored in the races table, then
 * downloads each GPX, extracts the first GPS point (start location), and
 * writes it back to the races table.
 *
 * Processes up to 100 races per call in parallel batches of 8.
 * Safe to re-run — skips any race that already has coordinates.
 */

import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseGpxPoints } from "@/lib/race-analysis/gpx";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE  = 8;
const MAX_RACES   = 100;
const GPX_TIMEOUT = 10_000; // ms per file

export async function POST() {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // ── Find races that have a GPX file but no stored coordinates ────────────
  const { data: gpxFiles, error } = await admin
    .from("race_files")
    .select("race_id, public_url")
    .eq("file_type", "gpx")
    .limit(MAX_RACES);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!gpxFiles || gpxFiles.length === 0) {
    return NextResponse.json({ updated: 0, skipped: 0, errors: 0 });
  }

  // Fetch the current coordinates for all these races in one query
  const raceIds = gpxFiles.map(f => f.race_id as string);
  const { data: races } = await admin
    .from("races")
    .select("id, race_latitude")
    .in("id", raceIds);

  const missingCoordSet = new Set(
    (races ?? [])
      .filter(r => r.race_latitude == null)
      .map(r => r.id as string)
  );

  const candidates = (gpxFiles as { race_id: string; public_url: string }[]).filter(
    f => missingCoordSet.has(f.race_id)
  );

  let updated = 0;
  let errors  = 0;
  const skipped = gpxFiles.length - candidates.length;

  // ── Process in parallel batches ────────────────────────────────────────────
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ race_id, public_url }) => {
        try {
          const res = await fetch(public_url, {
            signal: AbortSignal.timeout(GPX_TIMEOUT),
          });
          if (!res.ok) { errors++; return; }

          const pts = parseGpxPoints(await res.text());
          if (pts.length === 0) { errors++; return; }

          const { error: updateErr } = await admin
            .from("races")
            .update({ race_latitude: pts[0].lat, race_longitude: pts[0].lon })
            .eq("id", race_id);

          if (updateErr) { errors++; } else { updated++; }
        } catch {
          errors++;
        }
      })
    );
  }

  return NextResponse.json({ updated, skipped, errors, total: gpxFiles.length });
}

import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createAdminClient } from "@/lib/supabase/admin";

const UK_LAT_MIN = 49.9, UK_LAT_MAX = 61.0;
const UK_LON_MIN = -8.2, UK_LON_MAX = 2.0;

function inferCountry(raceCountry: string | null, lat: number | null, lon: number | null): string | null {
  if (raceCountry?.trim()) return raceCountry.trim();
  if (lat != null && lon != null) {
    if (lat >= UK_LAT_MIN && lat <= UK_LAT_MAX && lon >= UK_LON_MIN && lon <= UK_LON_MAX) {
      return "United Kingdom";
    }
  }
  return null;
}

export async function POST() {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // All race IDs that have a GPX file
  const { data: gpxFiles, error: gpxErr } = await adminClient
    .from("race_files")
    .select("race_id")
    .eq("file_type", "gpx");

  if (gpxErr) return NextResponse.json({ error: gpxErr.message }, { status: 500 });
  if (!gpxFiles?.length) return NextResponse.json({ updated: 0, skipped: 0, no_data: 0 });

  const raceIds = [...new Set(gpxFiles.map(r => r.race_id as string))];

  // Fetch race coords + country for all of them
  const { data: races, error: raceErr } = await adminClient
    .from("races")
    .select("id, country, race_latitude, race_longitude")
    .in("id", raceIds);

  if (raceErr) return NextResponse.json({ error: raceErr.message }, { status: 500 });

  // Fetch existing race_characteristics to avoid overwriting already-set country values
  const { data: existing } = await adminClient
    .from("race_characteristics")
    .select("race_id, country")
    .in("race_id", raceIds);

  const existingCountry = new Map(
    (existing ?? []).map(r => [r.race_id as string, r.country as string | null])
  );

  let updated = 0, skipped = 0, no_data = 0;

  for (const race of (races ?? [])) {
    const hasRow = existingCountry.has(race.id as string);
    if (!hasRow) {
      // No characteristics row yet — skip; country will be set when Process Race runs
      no_data++;
      continue;
    }

    const current = existingCountry.get(race.id as string);
    if (current) { skipped++; continue; } // country already set — don't overwrite

    const inferred = inferCountry(
      race.country as string | null,
      race.race_latitude as number | null,
      race.race_longitude as number | null,
    );

    if (!inferred) { no_data++; continue; }

    const { error: updateErr } = await adminClient
      .from("race_characteristics")
      .update({ country: inferred })
      .eq("race_id", race.id as string)
      .is("country", null);

    if (updateErr) {
      console.error(`[backfill-country] Failed for ${race.id}:`, updateErr.message);
    } else {
      updated++;
    }
  }

  return NextResponse.json({ updated, skipped, no_data });
}

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

  const upserts: { race_id: string; country: string }[] = [];
  let skipped = 0, no_data = 0;

  for (const race of (races ?? [])) {
    const current = existingCountry.get(race.id as string);
    if (current) { skipped++; continue; } // country already set — don't overwrite

    const inferred = inferCountry(
      race.country as string | null,
      race.race_latitude as number | null,
      race.race_longitude as number | null,
    );

    if (!inferred) { no_data++; continue; } // no races.country and coords not in known bbox

    upserts.push({ race_id: race.id as string, country: inferred });
  }

  if (upserts.length > 0) {
    const { error: upsertErr } = await adminClient
      .from("race_characteristics")
      .upsert(upserts, { onConflict: "race_id" });

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ updated: upserts.length, skipped, no_data });
}

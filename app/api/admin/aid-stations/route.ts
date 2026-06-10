/**
 * GET  /api/admin/aid-stations?race_id=X  — return stored AidStation[] for a race
 * POST /api/admin/aid-stations             — upsert AidStation[] for a race
 *
 * Data is stored in races_meta with meta_key = 'aid_stations', matching the
 * format used by the frontend RaceEditor. Both apps share the same row.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AidStation {
  km: number;
  name?: string;
  water: boolean;
  food: boolean;
  medic: boolean;
  toilets: boolean;
  dropBags: boolean;
}

function parseStations(raw: string | null | undefined): AidStation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is AidStation =>
        typeof s === "object" && s !== null && typeof s.km === "number"
    );
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const race_id = req.nextUrl.searchParams.get("race_id");
    if (!race_id) {
      return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data } = await supabase
      .from("races_meta")
      .select("meta_value")
      .eq("race_id", race_id)
      .eq("meta_key", "aid_stations")
      .maybeSingle();

    return NextResponse.json({
      stations: parseStations((data as { meta_value: string } | null)?.meta_value),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { race_id?: string; stations?: AidStation[] };
    const { race_id, stations } = body;

    if (!race_id) return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    if (!Array.isArray(stations)) return NextResponse.json({ error: "stations must be an array" }, { status: 400 });

    // Validate and sort by km
    const clean: AidStation[] = stations
      .filter(s => typeof s?.km === "number")
      .map(s => ({
        km:       Math.round(s.km * 100) / 100,
        name:     s.name?.trim() || undefined,
        water:    Boolean(s.water),
        food:     Boolean(s.food),
        medic:    Boolean(s.medic),
        toilets:  Boolean(s.toilets),
        dropBags: Boolean(s.dropBags),
      }))
      .sort((a, b) => a.km - b.km);

    const adminClient = createAdminClient();
    const { error } = await adminClient.from("races_meta").upsert(
      { race_id, meta_key: "aid_stations", meta_value: JSON.stringify(clean) },
      { onConflict: "race_id,meta_key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: clean.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

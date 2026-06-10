/**
 * POST /api/race-readiness/aid-stations
 *
 * Batch-fetches aid station data for a list of race IDs.
 * Used by the readiness report to look up an athlete's historical
 * experience with aid station gaps across their previous races.
 *
 * Body:   { race_ids: string[] }
 * Returns { [race_id]: AidStation[] }  — only races with data are included
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { AidStation } from "@/app/api/admin/aid-stations/route";

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as { race_ids?: string[] };
    const { race_ids } = body;

    if (!Array.isArray(race_ids) || race_ids.length === 0) {
      return NextResponse.json({});
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("races_meta")
      .select("race_id, meta_value")
      .eq("meta_key", "aid_stations")
      .in("race_id", race_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result: Record<string, AidStation[]> = {};
    for (const row of (data ?? []) as { race_id: string; meta_value: string }[]) {
      try {
        const parsed = JSON.parse(row.meta_value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          result[row.race_id] = parsed as AidStation[];
        }
      } catch {
        // skip malformed rows
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

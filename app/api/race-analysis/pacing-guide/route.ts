/**
 * POST /api/race-analysis/pacing-guide
 *
 * Generates a section-by-section pacing strategy for a race given a target
 * finish time. Loads the stored sections_json from race_profiles (no GPX
 * re-download needed) and applies the pacing distribution model.
 *
 * Body: { race_id, target_finish_minutes }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { buildPacingGuide } from "@/lib/race-analysis/pacing-model";
import type { StoredSection } from "@/lib/race-analysis/pacing-model";

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as {
      race_id?: string;
      target_finish_minutes?: number;
    };

    const { race_id, target_finish_minutes } = body;

    if (!race_id) {
      return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    }
    if (!target_finish_minutes || target_finish_minutes <= 0) {
      return NextResponse.json(
        { error: "target_finish_minutes must be a positive number" },
        { status: 400 }
      );
    }

    // ── Fetch profile + sections + race name ──────────────────────────────────
    const supabase = await createClient();

    const { data: profile, error: profErr } = await supabase
      .from("race_profiles")
      .select(
        `race_id, profile_source,
         total_distance_km, total_ascent_m, total_descent_m,
         flat_equivalent_km, wind_adjusted_flat_equivalent_km,
         sections_json,
         races ( name )`
      )
      .eq("race_id", race_id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json(
        { error: `Database error: ${profErr.message}` },
        { status: 500 }
      );
    }
    if (!profile) {
      return NextResponse.json(
        {
          error:
            "This race does not have a profile yet. Generate it from the Race Files admin page.",
        },
        { status: 404 }
      );
    }

    const sections = profile.sections_json as StoredSection[] | null;

    if (!sections || sections.length === 0) {
      return NextResponse.json(
        {
          error:
            "Race profile exists but contains no section data. Re-generate the profile from Race Files.",
        },
        { status: 422 }
      );
    }

    const raceName =
      (profile.races as unknown as { name: string } | null)?.name ?? race_id;

    // ── Build pacing guide ────────────────────────────────────────────────────
    const guide = buildPacingGuide(race_id, raceName, sections, target_finish_minutes);

    return NextResponse.json(guide);
  } catch (err) {
    console.error("[pacing-guide]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

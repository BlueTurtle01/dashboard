/**
 * POST /api/race-analysis/record-time
 *
 * Saves a race finish time entry for the current user.
 * Powers personal Riegel exponent fitting and community course calibration.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as {
      race_id?: string;
      finish_time_minutes?: number;
      race_date?: string;
      notes?: string;
      source?: string;
    };

    const { race_id, finish_time_minutes, race_date, notes, source } = body;

    if (!race_id) {
      return NextResponse.json({ error: "race_id is required" }, { status: 400 });
    }
    if (!finish_time_minutes || finish_time_minutes <= 0) {
      return NextResponse.json(
        { error: "finish_time_minutes must be a positive number" },
        { status: 400 }
      );
    }

    // ── Fetch race name + flat_equiv snapshot ─────────────────────────────────
    const { data: profile, error: profErr } = await supabase
      .from("race_profiles")
      .select(
        "flat_equivalent_km, wind_adjusted_flat_equivalent_km, profile_source, races ( name )"
      )
      .eq("race_id", race_id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json(
        { error: `Database error: ${profErr.message}` },
        { status: 500 }
      );
    }

    // flat_equiv snapshot: prefer wind-adjusted
    const flatEquivSnapshot = profile
      ? (profile.profile_source === "gpx_wind" &&
          profile.wind_adjusted_flat_equivalent_km
          ? profile.wind_adjusted_flat_equivalent_km
          : profile.flat_equivalent_km)
      : null;

    const raceName =
      profile
        ? (profile.races as unknown as { name: string })?.name ?? race_id
        : race_id;

    // ── Insert entry ──────────────────────────────────────────────────────────
    const { data: inserted, error: insertErr } = await supabase
      .from("athlete_race_times")
      .insert({
        athlete_id: user.id,
        race_id,
        finish_time_minutes,
        race_date: race_date ?? null,
        source: source ?? "manual",
        flat_equiv_at_entry: flatEquivSnapshot,
        notes: notes ?? null,
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: `Failed to save entry: ${insertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: inserted.id,
      race_name: raceName,
    });
  } catch (err) {
    console.error("[record-time]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

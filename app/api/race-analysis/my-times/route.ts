/**
 * GET /api/race-analysis/my-times
 *
 * Returns the current user's saved race times plus a fitted personal
 * Riegel exponent if enough data exists.
 */

import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { fitRiegelExponent, fitQualityMessage } from "@/lib/race-analysis/riegel";
import type { RaceEntry } from "@/lib/race-analysis/riegel";

export async function GET() {
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

    // ── Fetch entries ─────────────────────────────────────────────────────────
    const { data: rows, error } = await supabase
      .from("athlete_race_times")
      .select(
        `id, race_id, finish_time_minutes, race_date, source,
         flat_equiv_at_entry, notes, created_at,
         races ( name, slug ),
         race_profiles!race_profiles_race_id_fkey (
           flat_equivalent_km,
           wind_adjusted_flat_equivalent_km,
           profile_source
         )`
      )
      .eq("athlete_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    const entries = (rows ?? []).map((row) => {
      const race = (row.races as unknown) as { name: string; slug: string } | null;
      const profile = (row.race_profiles as unknown) as {
        flat_equivalent_km: number;
        wind_adjusted_flat_equivalent_km: number | null;
        profile_source: string;
      } | null;

      // Use the best available flat_equiv for fitting
      const currentFlatEquiv = profile
        ? (profile.profile_source === "gpx_wind" &&
            profile.wind_adjusted_flat_equivalent_km
            ? profile.wind_adjusted_flat_equivalent_km
            : profile.flat_equivalent_km)
        : (row.flat_equiv_at_entry ?? null);

      return {
        id: row.id as string,
        race_id: row.race_id as string,
        race_name: race?.name ?? row.race_id,
        race_slug: race?.slug ?? null,
        finish_time_minutes: Number(row.finish_time_minutes),
        race_date: row.race_date as string | null,
        source: row.source as string,
        flat_equiv_at_entry: row.flat_equiv_at_entry
          ? Number(row.flat_equiv_at_entry)
          : null,
        current_flat_equiv_km: currentFlatEquiv
          ? Number(currentFlatEquiv)
          : null,
        notes: row.notes as string | null,
        created_at: row.created_at as string,
      };
    });

    // ── Fit personal exponent ─────────────────────────────────────────────────
    const fitInputs: RaceEntry[] = entries
      .filter((e) => e.current_flat_equiv_km !== null && e.finish_time_minutes > 0)
      .map((e) => ({
        flat_equiv_km: e.current_flat_equiv_km!,
        time_minutes: e.finish_time_minutes,
      }));

    const fit = fitRiegelExponent(fitInputs);
    const qualityMessage = fitQualityMessage(fit, entries.length);

    return NextResponse.json({
      entries,
      fit,
      quality_message: qualityMessage,
      entry_count: entries.length,
    });
  } catch (err) {
    console.error("[my-times]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

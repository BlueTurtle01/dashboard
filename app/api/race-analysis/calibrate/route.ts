/**
 * POST /api/race-analysis/calibrate
 *
 * Admin-only. Recomputes the community_calibration_factor for every race
 * that has athlete_race_times entries.
 *
 * Algorithm:
 *   For each race R with entries:
 *     For each athlete who has an entry for R AND ≥1 other race:
 *       For each other race O that athlete ran:
 *         bias = actual_R / (actual_O × (flat_R / flat_O) ^ 1.06)
 *     If ≥5 bias values collected: calibration_factor = median(biases)
 *     Else: calibration_factor = 1.0  (not enough data)
 *
 * The calibration_factor is then applied in the compare API:
 *   effective_flat = flat_equiv × calibration_factor
 * so that systematic model bias is corrected before the Riegel ratio is formed.
 */

import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_EXPONENT = 1.06;
const MIN_BIAS_POINTS = 5;

function median(values: number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function POST() {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const supabase = await createClient();

    // ── Fetch all entries with race flat_equiv ────────────────────────────────
    const { data: allEntries, error: entryErr } = await supabase
      .from("athlete_race_times")
      .select(
        `id, athlete_id, race_id, finish_time_minutes,
         race_profiles!race_profiles_race_id_fkey (
           flat_equivalent_km,
           wind_adjusted_flat_equivalent_km,
           profile_source
         )`
      );

    if (entryErr) {
      return NextResponse.json(
        { error: `Database error: ${entryErr.message}` },
        { status: 500 }
      );
    }

    if (!allEntries || allEntries.length === 0) {
      return NextResponse.json({
        message: "No entries found — nothing to calibrate",
        updated: [],
      });
    }

    // ── Normalise entries into a flat structure ───────────────────────────────
    interface NormEntry {
      athlete_id: string;
      race_id: string;
      time_minutes: number;
      flat_equiv: number;
    }

    const norm: NormEntry[] = [];
    for (const row of allEntries) {
      const profile = (row.race_profiles as unknown) as {
        flat_equivalent_km: number;
        wind_adjusted_flat_equivalent_km: number | null;
        profile_source: string;
      } | null;
      if (!profile) continue;

      const flatEquiv =
        profile.profile_source === "gpx_wind" &&
        profile.wind_adjusted_flat_equivalent_km
          ? profile.wind_adjusted_flat_equivalent_km
          : profile.flat_equivalent_km;

      if (!flatEquiv || flatEquiv <= 0) continue;

      norm.push({
        athlete_id: row.athlete_id as string,
        race_id: row.race_id as string,
        time_minutes: Number(row.finish_time_minutes),
        flat_equiv: Number(flatEquiv),
      });
    }

    // ── Group by race and by athlete ──────────────────────────────────────────
    // raceMap: race_id → array of NormEntry
    const raceMap = new Map<string, NormEntry[]>();
    // athleteMap: athlete_id → array of NormEntry (all their races)
    const athleteMap = new Map<string, NormEntry[]>();

    for (const e of norm) {
      if (!raceMap.has(e.race_id)) raceMap.set(e.race_id, []);
      raceMap.get(e.race_id)!.push(e);

      if (!athleteMap.has(e.athlete_id)) athleteMap.set(e.athlete_id, []);
      athleteMap.get(e.athlete_id)!.push(e);
    }

    // ── Compute calibration factor per race ───────────────────────────────────
    const results: {
      race_id: string;
      entry_count: number;
      calibration_factor: number;
      bias_points_used: number;
    }[] = [];

    for (const [raceId, raceEntries] of raceMap.entries()) {
      const biases: number[] = [];

      for (const entryR of raceEntries) {
        const athleteEntries = athleteMap.get(entryR.athlete_id) ?? [];
        // Other races this athlete ran (excluding current race R)
        const otherEntries = athleteEntries.filter((e) => e.race_id !== raceId);

        for (const entryO of otherEntries) {
          if (entryO.flat_equiv <= 0) continue;
          const predicted =
            entryO.time_minutes *
            Math.pow(entryR.flat_equiv / entryO.flat_equiv, DEFAULT_EXPONENT);
          if (predicted <= 0) continue;
          biases.push(entryR.time_minutes / predicted);
        }
      }

      const calFactor =
        biases.length >= MIN_BIAS_POINTS ? median(biases) : 1.0;

      results.push({
        race_id: raceId,
        entry_count: raceEntries.length,
        calibration_factor: Math.round(calFactor * 10000) / 10000,
        bias_points_used: biases.length,
      });
    }

    // ── Persist calibration factors ───────────────────────────────────────────
    const adminClient = createAdminClient();
    const updateSummary: {
      race_id: string;
      entry_count: number;
      calibration_factor: number;
      bias_points_used: number;
      changed: boolean;
    }[] = [];

    for (const r of results) {
      const { error: upErr } = await adminClient
        .from("race_profiles")
        .update({
          community_calibration_factor: r.calibration_factor,
          community_entry_count: r.entry_count,
          calibration_updated_at: new Date().toISOString(),
        })
        .eq("race_id", r.race_id);

      updateSummary.push({
        ...r,
        changed: !upErr && r.bias_points_used >= MIN_BIAS_POINTS,
      });
    }

    // Also fetch race names for the response
    const raceIds = results.map((r) => r.race_id);
    const { data: raceNames } = await supabase
      .from("races")
      .select("id, name")
      .in("id", raceIds);

    const nameMap = new Map(
      (raceNames ?? []).map((r) => [r.id as string, r.name as string])
    );

    return NextResponse.json({
      message: `Calibrated ${results.length} race(s)`,
      updated: updateSummary.map((r) => ({
        race_id: r.race_id,
        race_name: nameMap.get(r.race_id) ?? r.race_id,
        entry_count: r.entry_count,
        calibration_factor: r.calibration_factor,
        bias_points_used: r.bias_points_used,
        has_calibration: r.bias_points_used >= MIN_BIAS_POINTS,
      })),
    });
  } catch (err) {
    console.error("[calibrate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

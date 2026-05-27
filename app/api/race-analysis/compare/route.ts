/**
 * POST /api/race-analysis/compare
 *
 * Estimates an athlete's finish time for Race B given their finish time for
 * Race A, using Riegel's formula applied to each race's flat_equivalent_km.
 *
 * Formula:
 *   estimated_time_B = time_A × (effective_flat_B / effective_flat_A) ^ k
 *
 * Where:
 *   effective_flat = flat_equiv_km × community_calibration_factor
 *   k = personal Riegel exponent (fitted from saved race times) or default 1.06
 *
 * Wind-adjusted flat_equiv is used when both races have gpx_wind profiles;
 * otherwise the plain gpx flat_equiv is used with a lower confidence rating.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import { fitRiegelExponent, fitQualityMessage } from "@/lib/race-analysis/riegel";
import type { RaceEntry } from "@/lib/race-analysis/riegel";

const DEFAULT_RIEGEL_EXPONENT = 1.06;

function formatDuration(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
    } = await supabase.auth.getUser();

    const body = (await req.json()) as {
      race_a_id?: string;
      race_b_id?: string;
      time_a_minutes?: number;
      riegel_exponent?: number;
      save_time_a?: boolean;
      race_date_a?: string;
    };

    const {
      race_a_id,
      race_b_id,
      time_a_minutes,
      riegel_exponent,
      save_time_a,
      race_date_a,
    } = body;

    if (!race_a_id || !race_b_id) {
      return NextResponse.json(
        { error: "race_a_id and race_b_id are required" },
        { status: 400 }
      );
    }
    if (!time_a_minutes || time_a_minutes <= 0) {
      return NextResponse.json(
        { error: "time_a_minutes must be a positive number" },
        { status: 400 }
      );
    }
    if (race_a_id === race_b_id) {
      return NextResponse.json(
        { error: "race_a_id and race_b_id must be different races" },
        { status: 400 }
      );
    }

    // ── Fetch profiles + race names ───────────────────────────────────────────
    const { data: profiles, error: profErr } = await supabase
      .from("race_profiles")
      .select(
        `id, race_id, profile_source, flat_equivalent_km,
         difficulty_ratio, wind_adjusted_flat_equivalent_km,
         wind_adjusted_difficulty_ratio, total_distance_km,
         total_ascent_m, total_descent_m,
         community_calibration_factor, community_entry_count,
         races ( name, slug )`
      )
      .in("race_id", [race_a_id, race_b_id]);

    if (profErr) {
      return NextResponse.json(
        { error: `Database error: ${profErr.message}` },
        { status: 500 }
      );
    }

    const profileA = profiles?.find((p) => p.race_id === race_a_id);
    const profileB = profiles?.find((p) => p.race_id === race_b_id);

    if (!profileA) {
      return NextResponse.json(
        {
          error:
            "Race A does not have a profile yet. Generate it from the Race Files admin page.",
        },
        { status: 404 }
      );
    }
    if (!profileB) {
      return NextResponse.json(
        {
          error:
            "Race B does not have a profile yet. Generate it from the Race Files admin page.",
        },
        { status: 404 }
      );
    }

    // ── Choose flat_equiv to use ──────────────────────────────────────────────
    const bothHaveWind =
      profileA.profile_source === "gpx_wind" &&
      profileB.profile_source === "gpx_wind";

    const flatEquivA = bothHaveWind
      ? (profileA.wind_adjusted_flat_equivalent_km ?? profileA.flat_equivalent_km)
      : profileA.flat_equivalent_km;

    const flatEquivB = bothHaveWind
      ? (profileB.wind_adjusted_flat_equivalent_km ?? profileB.flat_equivalent_km)
      : profileB.flat_equivalent_km;

    const diffRatioA = bothHaveWind
      ? (profileA.wind_adjusted_difficulty_ratio ?? profileA.difficulty_ratio)
      : profileA.difficulty_ratio;

    const diffRatioB = bothHaveWind
      ? (profileB.wind_adjusted_difficulty_ratio ?? profileB.difficulty_ratio)
      : profileB.difficulty_ratio;

    // ── Community calibration factors ─────────────────────────────────────────
    const calA = Number(profileA.community_calibration_factor ?? 1.0);
    const calB = Number(profileB.community_calibration_factor ?? 1.0);
    const effectiveFlatA = flatEquivA * calA;
    const effectiveFlatB = flatEquivB * calB;

    // ── Personal exponent ─────────────────────────────────────────────────────
    let personalFit = null;
    let exponent = riegel_exponent ?? DEFAULT_RIEGEL_EXPONENT;
    let totalEntryCount = 0;

    if (user) {
      const { data: timeRows } = await supabase
        .from("athlete_race_times")
        .select(
          `finish_time_minutes, flat_equiv_at_entry,
           race_profiles!race_profiles_race_id_fkey (
             flat_equivalent_km,
             wind_adjusted_flat_equivalent_km,
             profile_source
           )`
        )
        .eq("athlete_id", user.id);

      totalEntryCount = timeRows?.length ?? 0;

      if (timeRows && timeRows.length >= 2) {
        const fitInputs: RaceEntry[] = timeRows
          .map((row) => {
            const profile = (row.race_profiles as unknown) as {
              flat_equivalent_km: number;
              wind_adjusted_flat_equivalent_km: number | null;
              profile_source: string;
            } | null;

            const fe = profile
              ? (profile.profile_source === "gpx_wind" &&
                  profile.wind_adjusted_flat_equivalent_km
                  ? profile.wind_adjusted_flat_equivalent_km
                  : profile.flat_equivalent_km)
              : (row.flat_equiv_at_entry ?? null);

            return {
              flat_equiv_km: fe ? Number(fe) : 0,
              time_minutes: Number(row.finish_time_minutes),
            };
          })
          .filter((e) => e.flat_equiv_km > 0 && e.time_minutes > 0);

        personalFit = fitRiegelExponent(fitInputs);
        if (personalFit) {
          exponent = personalFit.exponent;
        }
      }
    }

    // ── Riegel formula (with calibration-adjusted effective distances) ─────────
    const ratio = effectiveFlatB / effectiveFlatA;
    const estimatedMinutes = time_a_minutes * Math.pow(ratio, exponent);

    // ── Confidence ────────────────────────────────────────────────────────────
    let confidence: "high" | "medium" | "low";
    let confidenceNote: string;

    if (bothHaveWind) {
      confidence = "high";
      confidenceNote = "Both races have GPX + wind profiles.";
    } else if (
      profileA.profile_source === "gpx_wind" ||
      profileB.profile_source === "gpx_wind"
    ) {
      confidence = "low";
      const missingWind =
        profileA.profile_source !== "gpx_wind"
          ? (profileA.races as unknown as { name: string })?.name
          : (profileB.races as unknown as { name: string })?.name;
      confidenceNote = `${missingWind} has no wind profile — generate wind analysis for that race to improve confidence.`;
    } else {
      confidence = "medium";
      confidenceNote =
        "Both races have GPX profiles but no wind analysis. Generate wind for both to reach high confidence.";
    }

    // ── Auto-save Race A time ─────────────────────────────────────────────────
    let savedEntryId: string | null = null;
    if (save_time_a && user) {
      const { data: saved } = await supabase
        .from("athlete_race_times")
        .insert({
          athlete_id: user.id,
          race_id: race_a_id,
          finish_time_minutes: time_a_minutes,
          race_date: race_date_a ?? null,
          source: "comparison",
          flat_equiv_at_entry: flatEquivA,
        })
        .select("id")
        .single();

      savedEntryId = saved?.id ?? null;
    }

    // ── Response ──────────────────────────────────────────────────────────────
    const qualityMessage = fitQualityMessage(personalFit, totalEntryCount);

    return NextResponse.json({
      estimated_time_b_minutes: Math.round(estimatedMinutes * 100) / 100,
      estimated_time_b: formatDuration(estimatedMinutes),
      flat_equiv_ratio: Math.round(ratio * 10000) / 10000,
      riegel_exponent_used: exponent,
      exponent_source: personalFit ? "personal" : "default",
      personal_exponent_fit: personalFit,
      personal_exponent_quality: qualityMessage,
      confidence,
      confidence_note: confidenceNote,
      using_wind_adjusted: bothHaveWind,
      community_calibration_applied: {
        race_a_factor: calA,
        race_b_factor: calB,
        race_a_entries: Number(profileA.community_entry_count ?? 0),
        race_b_entries: Number(profileB.community_entry_count ?? 0),
      },
      saved_entry_id: savedEntryId,
      race_a: {
        id: race_a_id,
        name: (profileA.races as unknown as { name: string })?.name ?? race_a_id,
        flat_equivalent_km: flatEquivA,
        effective_flat_equivalent_km: Math.round(effectiveFlatA * 100) / 100,
        difficulty_ratio: diffRatioA,
        total_distance_km: profileA.total_distance_km,
        total_ascent_m: profileA.total_ascent_m,
        profile_source: profileA.profile_source,
        community_calibration_factor: calA,
      },
      race_b: {
        id: race_b_id,
        name: (profileB.races as unknown as { name: string })?.name ?? race_b_id,
        flat_equivalent_km: flatEquivB,
        effective_flat_equivalent_km: Math.round(effectiveFlatB * 100) / 100,
        difficulty_ratio: diffRatioB,
        total_distance_km: profileB.total_distance_km,
        total_ascent_m: profileB.total_ascent_m,
        profile_source: profileB.profile_source,
        community_calibration_factor: calB,
      },
    });
  } catch (err) {
    console.error("[race-compare]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

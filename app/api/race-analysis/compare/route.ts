/**
 * POST /api/race-analysis/compare
 *
 * Estimates an athlete's finish time for Race B given their finish time for
 * Race A, using Riegel's formula applied to each race's flat_equivalent_km.
 *
 * Formula:
 *   estimated_time_B = time_A × (flat_equiv_B / flat_equiv_A) ^ riegel_exponent
 *
 * Wind-adjusted flat_equiv is used when both races have gpx_wind profiles;
 * otherwise the plain gpx flat_equiv is used with a lower confidence rating.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

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

    const body = (await req.json()) as {
      race_a_id?: string;
      race_b_id?: string;
      time_a_minutes?: number;
      riegel_exponent?: number;
    };

    const { race_a_id, race_b_id, time_a_minutes, riegel_exponent } = body;

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

    const exponent = riegel_exponent ?? DEFAULT_RIEGEL_EXPONENT;

    // ── Fetch profiles + race names ───────────────────────────────────────────
    const supabase = await createClient();

    const { data: profiles, error: profErr } = await supabase
      .from("race_profiles")
      .select(
        `id, race_id, profile_source, flat_equivalent_km,
         difficulty_ratio, wind_adjusted_flat_equivalent_km,
         wind_adjusted_difficulty_ratio, total_distance_km,
         total_ascent_m, total_descent_m,
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
    // Use wind-adjusted if both races have it; otherwise fall back to plain GPX.
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

    // ── Riegel formula ────────────────────────────────────────────────────────
    const ratio = flatEquivB / flatEquivA;
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

    // ── Response ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      estimated_time_b_minutes: Math.round(estimatedMinutes * 100) / 100,
      estimated_time_b: formatDuration(estimatedMinutes),
      flat_equiv_ratio: Math.round(ratio * 10000) / 10000,
      riegel_exponent_used: exponent,
      confidence,
      confidence_note: confidenceNote,
      using_wind_adjusted: bothHaveWind,
      race_a: {
        id: race_a_id,
        name: (profileA.races as unknown as { name: string })?.name ?? race_a_id,
        flat_equivalent_km: flatEquivA,
        difficulty_ratio: diffRatioA,
        total_distance_km: profileA.total_distance_km,
        total_ascent_m: profileA.total_ascent_m,
        profile_source: profileA.profile_source,
      },
      race_b: {
        id: race_b_id,
        name: (profileB.races as unknown as { name: string })?.name ?? race_b_id,
        flat_equivalent_km: flatEquivB,
        difficulty_ratio: diffRatioB,
        total_distance_km: profileB.total_distance_km,
        total_ascent_m: profileB.total_ascent_m,
        profile_source: profileB.profile_source,
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

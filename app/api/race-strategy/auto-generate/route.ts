/**
 * POST /api/race-strategy/auto-generate
 *
 * Generates a race_pace_strategy from the stored race_profiles.sections_json
 * and saves it to races_meta (upsert). Produces the same JSON shape as the
 * AdminRacePaceStrategyEditor in the frontend so Plan Insights can read it.
 *
 * Body: { race_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";
import type { StoredSection } from "@/lib/race-analysis/pacing-model";

type SectionType =
  | "flat" | "rolling" | "mild_climb" | "sustained_climb" | "steep_climb"
  | "mild_descent" | "sustained_descent" | "steep_descent";

type TerrainType =
  | "road" | "smooth_trail" | "rocky_trail" | "grass" | "gravel" | "unknown";

type RaceStage = "early" | "middle" | "late";

// ── Label normalisers ─────────────────────────────────────────────────────────

function normaliseSectionType(t: string): SectionType {
  const map: Record<string, SectionType> = {
    very_steep_climb:   "steep_climb",
    major_climb:        "sustained_climb",
    steady_climb:       "mild_climb",
    gentle_climb:       "mild_climb",
    flat_rolling:       "flat",
    gentle_descent:     "mild_descent",
    runnable_descent:   "mild_descent",
    steep_descent:      "sustained_descent",
    very_steep_descent: "steep_descent",
    flat:               "flat",
    rolling:            "rolling",
    mild_climb:         "mild_climb",
    sustained_climb:    "sustained_climb",
    steep_climb:        "steep_climb",
    mild_descent:       "mild_descent",
    sustained_descent:  "sustained_descent",
  };
  return map[t] ?? "flat";
}

function normaliseTerrainType(t: string): TerrainType {
  const map: Record<string, TerrainType> = {
    road:           "road",
    pavement:       "road",
    track:          "road",
    trail:          "smooth_trail",
    smooth_trail:   "smooth_trail",
    technical_trail:"rocky_trail",
    rocky_trail:    "rocky_trail",
    fell:           "grass",
    grass:          "grass",
    gravel:         "gravel",
  };
  return map[t] ?? "unknown";
}

// ── Qualitative guidance by section type ─────────────────────────────────────

interface Guidance {
  target_effort_min: number;
  target_effort_max: number;
  expected_pace_adjustment_label: string;
  strategy_summary: string;
  pace_guidance: string;
  key_warning: string;
  training_implication: string;
}

function buildGuidance(sectionType: SectionType, terrain: TerrainType, stage: RaceStage): Guidance {
  const techNote = terrain === "rocky_trail" ? " Technical terrain demands care with foot placement." :
                   terrain === "grass"        ? " Fell/grass surface requires efficient footwork." : "";

  switch (sectionType) {
    case "steep_climb": return {
      target_effort_min: 7, target_effort_max: 8,
      expected_pace_adjustment_label: "Significantly slower — hike efficiently",
      strategy_summary: `Steep climb requiring controlled effort.${techNote} Power hiking is faster and more economic than forced running at this gradient.`,
      pace_guidance: stage === "early" ? "Resist the urge to run — efficient hiking now saves legs for later."
                   : stage === "late"  ? "Dig in and maintain hiking pace."
                   : "Stay controlled, use poles if available.",
      key_warning: "Running steep climbs early burns energy you will need later. Walk with purpose.",
      training_implication: "Train uphill hiking efficiency and vertical-specific conditioning.",
    };
    case "sustained_climb": return {
      target_effort_min: 7, target_effort_max: 8,
      expected_pace_adjustment_label: "Slower — controlled aerobic effort",
      strategy_summary: `Sustained climb — manageable gradient but extended elevation gain.${techNote} Run-hike strategy may be optimal.`,
      pace_guidance: stage === "early" ? "Run where you can, hike where you must. Stay aerobic."
                   : stage === "late"  ? "Steady effort — the summit is close."
                   : "Maintain steady effort, don't redline.",
      key_warning: "Extended climbs create cumulative fatigue. Only run what you can sustain.",
      training_implication: "Sustained aerobic climbing and lactate threshold sessions on hills.",
    };
    case "mild_climb": return {
      target_effort_min: 6, target_effort_max: 7,
      expected_pace_adjustment_label: "Slightly slower — runnable gradient",
      strategy_summary: `Runnable climb — manageable gradient most athletes can sustain.${techNote}`,
      pace_guidance: "Run by feel. Heart rate will rise; keep it aerobic.",
      key_warning: "Even gentle climbs add to cumulative fatigue over a long race.",
      training_implication: "Long tempo sessions on undulating terrain.",
    };
    case "steep_descent": return {
      target_effort_min: 4, target_effort_max: 6,
      expected_pace_adjustment_label: terrain === "rocky_trail" ? "Cautious — technical descent" : "Fast descent — protect quads",
      strategy_summary: `Steep descent requiring technical focus and quad control.${techNote}`,
      pace_guidance: stage === "early" ? "Do not hammer early descents. Quads will pay for it later."
                   : stage === "late"  ? "Leave it all here — push what the terrain allows."
                   : "Find rhythm, use arms for balance, stay relaxed.",
      key_warning: "Excessive speed on steep descents causes quad damage and late-race fade.",
      training_implication: "Downhill-specific running and eccentric quad strength training.",
    };
    case "sustained_descent": return {
      target_effort_min: 4, target_effort_max: 5,
      expected_pace_adjustment_label: "Pick up pace — controlled descent",
      strategy_summary: `Runnable descent — an opportunity to bank time without excessive effort.${techNote}`,
      pace_guidance: "Let gravity assist. Stay relaxed, high cadence, short stride.",
      key_warning: "Don't brake so hard you tense up — relax the upper body and trust your legs.",
      training_implication: "Downhill running repeats for eccentric loading adaptation.",
    };
    case "mild_descent": return {
      target_effort_min: 4, target_effort_max: 5,
      expected_pace_adjustment_label: "Faster — gradual descent",
      strategy_summary: `Gentle descent — recover while moving fast.${techNote}`,
      pace_guidance: "Use this section to recover and maintain momentum.",
      key_warning: "Stay relaxed — this is a recovery section in disguise.",
      training_implication: "Steady-state running on gradual downhills for confidence.",
    };
    case "rolling": return {
      target_effort_min: 6, target_effort_max: 7,
      expected_pace_adjustment_label: "Variable — find your rhythm",
      strategy_summary: `Rolling terrain — mixed ascents and descents. Float the downhills, stay controlled on short climbs.${techNote}`,
      pace_guidance: "Find rhythm in the undulation. Avoid big effort spikes.",
      key_warning: "Rolling sections can cause pacing inconsistency — stay even in effort.",
      training_implication: "Fartlek-style sessions on hilly terrain.",
    };
    default: return { // flat
      target_effort_min: 6, target_effort_max: 7,
      expected_pace_adjustment_label: "Steady — maintain target pace",
      strategy_summary: `Flat section — opportunity for consistent rhythm.${techNote}`,
      pace_guidance: stage === "late" ? "Push here if you have anything left." : "Maintain target effort. Don't drift fast.",
      key_warning: "Flat sections can mask fatigue. Stay focused on form.",
      training_implication: "Steady-state running and tempo work for flat running economy.",
    };
  }
}

function buildOverallSummary(sectionTypes: SectionType[]): string {
  const hasClimbs   = sectionTypes.some(t => t.includes("climb"));
  const hasDescents = sectionTypes.some(t => t.includes("descent"));
  const lateHard    = sectionTypes.slice(Math.floor(sectionTypes.length * 0.67)).some(t => t.includes("climb") || t.includes("descent"));
  if (hasClimbs && hasDescents)
    return `This is not an even-pace race. The correct strategy is to stay controlled on the climbs, descend without damaging the legs, and use the runnable sections for rhythm rather than panic-chasing splits.${lateHard ? " The late-race technical terrain makes patience especially important." : ""}`;
  if (hasClimbs)
    return "This race should be paced by effort rather than even splits. Keep the climbs controlled, accept slower uphill kilometres, and save enough running strength for the flatter ground.";
  if (hasDescents)
    return "This race rewards controlled descending and steady rhythm. Let pace come where footing and gradient allow, but avoid early quad damage.";
  return "This race can be approached with a steadier pacing rhythm. Controlled effort early, sustainable work through the middle, and a gradual build only if the legs are stable late.";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as { race_id?: string };
    const { race_id } = body;
    if (!race_id) return NextResponse.json({ error: "race_id required" }, { status: 400 });

    const supabase = await createClient();

    // ── 1. Race profile ──────────────────────────────────────────────────────
    const { data: profile, error: profErr } = await supabase
      .from("race_profiles")
      .select("race_id, total_distance_km, sections_json")
      .eq("race_id", race_id)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json(
        { error: "No race profile found. Upload a GPX file and compute the course profile first." },
        { status: 404 }
      );
    }

    // ── 2. Race name ─────────────────────────────────────────────────────────
    const { data: race } = await supabase
      .from("races")
      .select("name")
      .eq("id", race_id)
      .maybeSingle();
    const raceName = (race as { name?: string } | null)?.name ?? "Race";

    // ── 3. Map sections_json → strategy sections ─────────────────────────────
    const rawSections = (profile.sections_json ?? []) as StoredSection[];
    if (rawSections.length === 0) {
      return NextResponse.json({ error: "Race profile has no sections — recompute the course profile." }, { status: 400 });
    }

    const totalKm = profile.total_distance_km as number ?? rawSections[rawSections.length - 1]?.end_distance_km ?? 0;

    const sectionTypes = rawSections.map(s => normaliseSectionType(s.section_type));

    const sections = rawSections.map((s, i) => {
      const sectionType = sectionTypes[i];
      const terrain     = normaliseTerrainType(s.terrain ?? "unknown");
      const midKm       = (s.start_distance_km + s.end_distance_km) / 2;
      const stage: RaceStage =
        midKm < totalKm * 0.33 ? "early" :
        midKm < totalKm * 0.67 ? "middle" : "late";

      const guidance = buildGuidance(sectionType, terrain, stage);

      return {
        id:                       `s-${race_id}-${i}`,
        race_id,
        section_index:            i,
        start_distance_km:        s.start_distance_km,
        end_distance_km:          s.end_distance_km,
        distance_km:              s.distance_km,
        elevation_gain_m:         s.ascent_m ?? 0,
        elevation_loss_m:         s.descent_m ?? 0,
        net_elevation_change_m:   (s.ascent_m ?? 0) - (s.descent_m ?? 0),
        average_gradient_percent: s.avg_gradient_percent ?? 0,
        max_gradient_percent:     null,
        section_type:             sectionType,
        terrain_type:             terrain,
        terrain_confidence:       "summary_only" as const,
        race_stage:               stage,
        ...guidance,
        source_type:              "gpx_generated" as const,
        source_segment_id:        null,
        source_confidence:        "medium" as const,
        existing_course_note:     null,
        coach_context_note:       null,
        athlete_context_note:     null,
        needs_admin_review:       false,
        review_reason:            null,
        is_manual_override:       false,
        is_manually_verified:     false,
        training_focus_tags:      [],
      };
    });

    const now = new Date().toISOString();
    const strategy = {
      id:                  `strategy-${race_id}-${Date.now()}`,
      race_id,
      race_name:           raceName,
      overall_summary:     buildOverallSummary(sectionTypes),
      terrain_data_quality: "summary_only" as const,
      generated_from:      "sections_json_auto",
      sections,
      created_at:          now,
      updated_at:          now,
    };

    // ── 4. Upsert into races_meta ─────────────────────────────────────────────
    const { error: upsertErr } = await supabase
      .from("races_meta")
      .upsert(
        { race_id, meta_key: "race_pace_strategy", meta_value: JSON.stringify(strategy) },
        { onConflict: "race_id,meta_key" }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sections: sections.length,
      race_name: raceName,
    });
  } catch (err) {
    console.error("[race-strategy/auto-generate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

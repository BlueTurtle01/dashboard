/**
 * Race pacing model — TypeScript port of race_pacing_model_fitness_goals.py
 *
 * Takes pre-computed CourseSection[] (stored in race_profiles.sections_json) and
 * a target finish time, then:
 *   1. Merges 1-km sections into readable race-plan sections (two-pass)
 *   2. Distributes target time proportionally to each section's flat-equivalent cost
 *   3. Produces per-section target pace + acceptable pace band + strategy note
 *   4. Optionally adds wind-adjusted equivalents when wind data is present
 *   5. Optionally adds stretch / realistic / comfortable fitness goals from a
 *      recent half-marathon time via Riegel's formula
 *
 * NOTE: sections_json stores fields as start_distance_km / end_distance_km —
 * the old StoredSection interface used start_km / end_km which caused those
 * fields to read as undefined.  This file uses the correct field names.
 */

import { classifyGradient } from "./cost-model";

// ─── Constants ─────────────────────────────────────────────────────────────────

export const HALF_MARATHON_KM = 21.0975;

// Fitness goal multipliers — match Python defaults
const STRETCH_MUL    = 0.96;
const REALISTIC_MUL  = 1.00;
const COMFORTABLE_MUL = 1.08;

// ─── Section shapes ────────────────────────────────────────────────────────────

/**
 * Shape of one entry in race_profiles.sections_json.
 * Field names match the CourseSection produced by course-profile.ts.
 */
export interface StoredSection {
  start_distance_km: number;
  end_distance_km: number;
  distance_km: number;
  elevation_change_m: number;
  ascent_m: number;
  descent_m: number;
  avg_gradient_percent: number;
  section_type: string;
  terrain: string;
  flat_equivalent_km: number;
  // Wind fields — present when profile_source = 'gpx_wind'
  wind_multiplier?: number;
  wind_adjusted_flat_equivalent_km?: number;
}

export interface PacingSection extends StoredSection {
  // Derived wind label (computed from wind_multiplier in buildPacingGuide)
  wind_label?: string;
  // ── No-wind pacing ───────────────────────────────────────────────────────
  energy_share_percent: number;
  remaining_cost_percent: number;
  target_section_time: string;
  target_pace_min_per_km: number;
  target_pace: string;
  fast_pace_min_per_km: number;
  slow_pace_min_per_km: number;
  acceptable_pace_band: string;
  strategy_note: string;
  // ── Wind-adjusted pacing (only when wind data present) ───────────────────
  wind_energy_share_percent?: number;
  wind_remaining_cost_percent?: number;
  wind_target_section_time?: string;
  wind_target_pace_min_per_km?: number;
  wind_target_pace?: string;
  wind_fast_pace_min_per_km?: number;
  wind_slow_pace_min_per_km?: number;
  wind_acceptable_pace_band?: string;
  // ── Fitness goal pacing (only when halfMarathonMinutes provided) ─────────
  stretch_target_pace?: string;
  stretch_target_pace_min_per_km?: number;
  realistic_target_pace?: string;
  realistic_target_pace_min_per_km?: number;
  comfortable_target_pace?: string;
  comfortable_target_pace_min_per_km?: number;
  // Wind-adjusted fitness goals
  wind_stretch_target_pace?: string;
  wind_realistic_target_pace?: string;
  wind_comfortable_target_pace?: string;
}

export interface GoalFinishTimes {
  stretch: string;
  stretch_minutes: number;
  realistic: string;
  realistic_minutes: number;
  comfortable: string;
  comfortable_minutes: number;
}

export interface PacingGuide {
  race_id: string;
  race_name: string;
  target_finish_time: string;
  target_finish_minutes: number;
  total_distance_km: number;
  total_ascent_m: number;
  total_descent_m: number;
  total_flat_equivalent_km: number;
  difficulty_ratio: number;
  wind_adjusted: boolean;
  wind_adjusted_flat_equivalent_km: number | null;
  sections_raw: number;          // section count before any merging
  sections: PacingSection[];
  highest_cost_sections: PacingSection[];
  fitness_goals?: {
    half_marathon_time: string;
    riegel_exponent: number;
    no_wind: GoalFinishTimes;
    wind_adjusted?: GoalFinishTimes;
  };
}

export interface PacingOptions {
  /** First-pass merge: combine adjacent sections with similar gradient */
  mergeSections?: boolean;               // default true
  minSectionKm?: number;                 // default 1.5
  maxSectionKm?: number;                 // default 5.0
  gradientSimilarityThreshold?: number;  // default 2.0

  /** Second-pass merge: combine adjacent sections with identical guidance */
  mergeIdenticalGuidance?: boolean;      // default true
  maxGuidanceSectionKm?: number;         // default 20.0

  /** Riegel fitness goals from recent half-marathon time */
  halfMarathonMinutes?: number;
  riegelExponent?: number;               // default 1.06
}

// ─── Format helpers ────────────────────────────────────────────────────────────

export function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return "–";
  const totalSeconds = Math.round(minPerKm * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function formatDuration(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return "–";
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Acceptable pace band ──────────────────────────────────────────────────────
// Direct port of acceptable_band_from_target() in the Python script.

export function acceptablePaceBand(
  targetPace: number,
  gradient: number,
  terrain: string,
  raceFraction: number,
  remainingCostPct: number
): { fast: number; slow: number } {
  let fastTol = 0.04;
  let slowTol = 0.06;

  if (gradient >= 10) { fastTol += 0.08; slowTol += 0.18; }
  else if (gradient >= 6) { fastTol += 0.06; slowTol += 0.14; }
  else if (gradient >= 3) { fastTol += 0.04; slowTol += 0.10; }

  if (gradient <= -10) { fastTol = Math.min(fastTol, 0.04); slowTol += 0.14; }
  else if (gradient <= -6) { fastTol = Math.min(fastTol + 0.02, 0.07); slowTol += 0.10; }
  else if (gradient <= -3) { fastTol += 0.03; slowTol += 0.08; }

  const t = terrain.toLowerCase();
  if (["technical_trail", "fell", "mud", "snow", "sand"].includes(t)) {
    fastTol = Math.max(0.02, fastTol - 0.02);
    slowTol += 0.10;
  } else if (["trail", "gravel"].includes(t)) {
    slowTol += 0.04;
  }

  if (remainingCostPct >= 65) {
    fastTol = Math.max(0.015, fastTol - 0.035);
    slowTol += 0.04;
  } else if (remainingCostPct >= 40) {
    fastTol = Math.max(0.02, fastTol - 0.02);
    slowTol += 0.02;
  }

  if (remainingCostPct <= 15 && raceFraction >= 0.80) {
    fastTol += 0.025;
  }

  let fast = targetPace * (1 - fastTol);
  const slow = targetPace * (1 + slowTol);

  if (gradient <= -6) fast = Math.max(fast, targetPace * 0.90);

  return { fast, slow };
}

// ─── Strategy note ─────────────────────────────────────────────────────────────
// Direct port of strategy_note() in the Python script.

export function strategyNote(
  gradient: number,
  distanceKm: number,
  remainingCostPct: number
): string {
  let remaining = "";
  if (remainingCostPct >= 65)
    remaining = " A lot of course cost remains, so keep this deliberately controlled.";
  else if (remainingCostPct >= 40)
    remaining = " There is still substantial course cost to come; avoid unnecessary surges.";
  else if (remainingCostPct <= 15)
    remaining = " Little course cost remains after this, so effort can rise if you feel good.";

  if (gradient >= 12)
    return "Very steep climb. Use controlled effort; hike/run is likely more efficient than forcing a run." + remaining;
  if (gradient >= 8)
    return "Major climb. Preserve breathing rhythm; do not chase flat pace." + remaining;
  if (gradient >= 4)
    return "Sustained climb. Shorten stride and keep effort steady." + remaining;
  if (gradient >= 2)
    return "Gentle climb. Let pace slow slightly while holding effort." + remaining;
  if (gradient <= -12)
    return "Very steep descent. Cap speed; quad damage and control matter more than metabolic cost." + remaining;
  if (gradient <= -8)
    return "Steep descent. Controlled running; avoid braking aggressively." + remaining;
  if (gradient <= -4)
    return "Runnable descent. Opportunity to move well, but stay smooth." + remaining;
  if (distanceKm >= 5)
    return "Long steady section. Avoid small surges and stay relaxed." + remaining;

  return "Settle into rhythm and keep effort controlled." + remaining;
}

// ─── Gradient row colour (for UI) ──────────────────────────────────────────────

export function gradientRowColor(gradient: number): string {
  if (gradient >= 12) return "#fef2f2";
  if (gradient >= 8)  return "#fff7ed";
  if (gradient >= 4)  return "#fefce8";
  if (gradient >= 2)  return "#f9fafb";
  if (gradient <= -8) return "#eff6ff";
  if (gradient <= -4) return "#f0f9ff";
  return "#ffffff";
}

// ─── Wind label (derived from multiplier) ──────────────────────────────────────

function deriveWindLabel(wm: number): string {
  if (wm >= 1.07) return "strong headwind";
  if (wm >= 1.04) return "moderate headwind";
  if (wm >= 1.01) return "light headwind";
  if (wm <= 0.97) return "tailwind";
  if (wm <= 0.99) return "light tailwind";
  return "none";
}

// ─── Section merging helpers ───────────────────────────────────────────────────

function r3(n: number): number { return Math.round(n * 1000) / 1000; }
function r1(n: number): number { return Math.round(n * 10) / 10; }

/** Merge two stored sections into one by summing costs and recalculating gradient. */
function mergeTwoStored(a: StoredSection, b: StoredSection): StoredSection {
  const totalDist = a.distance_km + b.distance_km;
  const elevChange = a.elevation_change_m + b.elevation_change_m;
  const avgGradient = totalDist > 0 ? (elevChange / (totalDist * 1000)) * 100 : 0;

  const hasWind = a.wind_multiplier != null || b.wind_multiplier != null;
  const wA = a.wind_multiplier ?? 1.0;
  const wB = b.wind_multiplier ?? 1.0;
  const windMul = hasWind ? (wA * a.distance_km + wB * b.distance_km) / totalDist : undefined;
  const windAdjFlat = hasWind
    ? r3((a.wind_adjusted_flat_equivalent_km ?? a.flat_equivalent_km) +
         (b.wind_adjusted_flat_equivalent_km ?? b.flat_equivalent_km))
    : undefined;

  return {
    start_distance_km: a.start_distance_km,
    end_distance_km: b.end_distance_km,
    distance_km: r3(totalDist),
    elevation_change_m: r1(elevChange),
    ascent_m: r1(a.ascent_m + b.ascent_m),
    descent_m: r1(a.descent_m + b.descent_m),
    avg_gradient_percent: r3(avgGradient),
    section_type: classifyGradient(avgGradient),
    terrain: a.terrain,
    flat_equivalent_km: r3(a.flat_equivalent_km + b.flat_equivalent_km),
    ...(windMul != null && {
      wind_multiplier: r3(windMul),
      wind_adjusted_flat_equivalent_km: windAdjFlat,
    }),
  };
}

/**
 * First-pass merge: combine adjacent sections that share the same gradient type
 * or have gradients within `threshold` %, respecting size limits.
 * Port of merge_similar_sections() from the Python script.
 */
function mergeSimilarSections(
  sections: StoredSection[],
  minKm = 1.5,
  maxKm = 5.0,
  threshold = 2.0
): StoredSection[] {
  if (sections.length === 0) return [];

  const out: StoredSection[] = [];
  let cur = { ...sections[0] };

  for (const nxt of sections.slice(1)) {
    const sameType = cur.section_type === nxt.section_type;
    const close    = Math.abs(cur.avg_gradient_percent - nxt.avg_gradient_percent) <= threshold;
    const short    = cur.distance_km < minKm;
    const fits     = cur.distance_km + nxt.distance_km <= maxKm;

    if (fits && (sameType || close || short)) {
      cur = mergeTwoStored(cur, nxt);
    } else {
      out.push(cur);
      cur = { ...nxt };
    }
  }
  out.push(cur);
  return out;
}

/** Merge two pacing sections (post first-pass pacing) preserving guidance strings. */
function mergeTwoPacing(a: PacingSection, b: PacingSection): PacingSection {
  const totalDist = a.distance_km + b.distance_km;
  const elevChange = a.elevation_change_m + b.elevation_change_m;
  const avgGradient = totalDist > 0 ? (elevChange / (totalDist * 1000)) * 100 : 0;

  const hasWind = a.wind_multiplier != null || b.wind_multiplier != null;
  const wA = a.wind_multiplier ?? 1.0;
  const wB = b.wind_multiplier ?? 1.0;
  const windMul = hasWind ? (wA * a.distance_km + wB * b.distance_km) / totalDist : undefined;
  const windAdjFlat = hasWind
    ? r3((a.wind_adjusted_flat_equivalent_km ?? a.flat_equivalent_km) +
         (b.wind_adjusted_flat_equivalent_km ?? b.flat_equivalent_km))
    : undefined;

  // Weighted-average fast/slow paces
  const wFast = (a.fast_pace_min_per_km * a.distance_km + b.fast_pace_min_per_km * b.distance_km) / totalDist;
  const wSlow = (a.slow_pace_min_per_km * a.distance_km + b.slow_pace_min_per_km * b.distance_km) / totalDist;

  return {
    ...a,
    start_distance_km: a.start_distance_km,
    end_distance_km: b.end_distance_km,
    distance_km: r3(totalDist),
    elevation_change_m: r1(elevChange),
    ascent_m: r1(a.ascent_m + b.ascent_m),
    descent_m: r1(a.descent_m + b.descent_m),
    avg_gradient_percent: r3(avgGradient),
    section_type: classifyGradient(avgGradient),
    flat_equivalent_km: r3(a.flat_equivalent_km + b.flat_equivalent_km),
    ...(windMul != null && {
      wind_multiplier: r3(windMul),
      wind_adjusted_flat_equivalent_km: windAdjFlat,
    }),
    wind_label: a.wind_label || b.wind_label,
    // Keep identical guidance
    acceptable_pace_band: a.acceptable_pace_band,
    strategy_note: a.strategy_note,
    fast_pace_min_per_km: r3(wFast),
    slow_pace_min_per_km: r3(wSlow),
    // Pacing fields will be recalculated after this merge
    energy_share_percent: 0,
    remaining_cost_percent: 0,
    target_section_time: "",
    target_pace_min_per_km: 0,
    target_pace: "",
  };
}

/**
 * Second-pass merge: combine adjacent sections where BOTH acceptable_pace_band
 * AND strategy_note are identical.  Pacing is recalculated after.
 * Port of merge_identical_guidance_sections() from the Python script.
 */
function mergeGuidanceSections(
  sections: PacingSection[],
  maxKm = 20.0
): PacingSection[] {
  if (sections.length === 0) return [];

  const out: PacingSection[] = [];
  let cur = { ...sections[0] };

  for (const nxt of sections.slice(1)) {
    const sameGuidance =
      cur.acceptable_pace_band === nxt.acceptable_pace_band &&
      cur.strategy_note === nxt.strategy_note;
    const fits = cur.distance_km + nxt.distance_km <= maxKm;

    if (sameGuidance && fits) {
      cur = mergeTwoPacing(cur, nxt);
    } else {
      out.push(cur);
      cur = { ...nxt };
    }
  }
  out.push(cur);
  return out;
}

// ─── Fitness goal helpers ──────────────────────────────────────────────────────

/**
 * Riegel-style finish estimate.
 * time_2 = time_1 × (flat_equiv_km / half_marathon_km) ^ exponent
 * Port of estimate_time_from_half_marathon() in the Python script.
 */
export function estimateFinishFromHalfMarathon(
  halfMarathonMinutes: number,
  targetEquivKm: number,
  exponent = 1.06
): number {
  if (halfMarathonMinutes <= 0 || targetEquivKm <= 0) return 0;
  return halfMarathonMinutes * (targetEquivKm / HALF_MARATHON_KM) ** exponent;
}

function buildGoalTimes(baseMinutes: number): GoalFinishTimes {
  const stretch     = baseMinutes * STRETCH_MUL;
  const realistic   = baseMinutes * REALISTIC_MUL;
  const comfortable = baseMinutes * COMFORTABLE_MUL;
  return {
    stretch:           formatDuration(stretch),
    stretch_minutes:   Math.round(stretch * 100) / 100,
    realistic:         formatDuration(realistic),
    realistic_minutes: Math.round(realistic * 100) / 100,
    comfortable:       formatDuration(comfortable),
    comfortable_minutes: Math.round(comfortable * 100) / 100,
  };
}

// ─── Main pacing model ─────────────────────────────────────────────────────────

export function buildPacingGuide(
  raceId: string,
  raceName: string,
  rawSections: StoredSection[],
  targetFinishMinutes: number,
  options: PacingOptions = {}
): PacingGuide {
  if (!rawSections.length || targetFinishMinutes <= 0) {
    throw new Error("Cannot build pacing guide: no sections or invalid target time");
  }

  const {
    mergeSections            = true,
    minSectionKm             = 1.5,
    maxSectionKm             = 5.0,
    gradientSimilarityThreshold = 2.0,
    mergeIdenticalGuidance   = true,
    maxGuidanceSectionKm     = 20.0,
    halfMarathonMinutes,
    riegelExponent           = 1.06,
  } = options;

  const sectionsRaw = rawSections.length;

  // ── Step 1: first-pass merge (similar gradients) ─────────────────────────
  const sections: StoredSection[] = mergeSections
    ? mergeSimilarSections(rawSections, minSectionKm, maxSectionKm, gradientSimilarityThreshold)
    : rawSections.map(s => ({ ...s }));

  // ── Step 2: compute totals ───────────────────────────────────────────────
  const totalDistanceKm   = sections.reduce((s, x) => s + x.distance_km, 0);
  const totalFlatEquivKm  = sections.reduce((s, x) => s + x.flat_equivalent_km, 0);
  const totalAscentM      = sections.reduce((s, x) => s + (x.ascent_m ?? 0), 0);
  const totalDescentM     = sections.reduce((s, x) => s + (x.descent_m ?? 0), 0);

  const hasWind = sections.some(
    s => s.wind_adjusted_flat_equivalent_km != null && s.wind_adjusted_flat_equivalent_km > 0
  );
  const totalWindEquivKm = hasWind
    ? sections.reduce((s, x) => s + (x.wind_adjusted_flat_equivalent_km ?? x.flat_equivalent_km), 0)
    : null;

  // ── Step 3: compute per-section pacing ───────────────────────────────────
  let cumulativeCost     = 0;
  let cumulativeWindCost = 0;

  let pacingSections: PacingSection[] = sections.map(s => {
    const midpointKm   = (s.start_distance_km + s.end_distance_km) / 2;
    const raceFraction = totalDistanceKm > 0 ? midpointKm / totalDistanceKm : 0;

    const energyShare    = totalFlatEquivKm > 0 ? s.flat_equivalent_km / totalFlatEquivKm : 0;
    const sectionTimeMin = targetFinishMinutes * energyShare;
    const targetPace     = s.distance_km > 0 ? sectionTimeMin / s.distance_km : 0;

    cumulativeCost += s.flat_equivalent_km;
    const remainingCost    = Math.max(totalFlatEquivKm - cumulativeCost, 0);
    const remainingCostPct = totalFlatEquivKm > 0 ? (remainingCost / totalFlatEquivKm) * 100 : 0;

    const { fast, slow } = acceptablePaceBand(
      targetPace, s.avg_gradient_percent, s.terrain, raceFraction, remainingCostPct
    );
    const note = strategyNote(s.avg_gradient_percent, s.distance_km, remainingCostPct);

    const section: PacingSection = {
      ...s,
      wind_label: s.wind_multiplier != null ? deriveWindLabel(s.wind_multiplier) : undefined,
      energy_share_percent:   Math.round(energyShare * 1000) / 10,
      remaining_cost_percent: Math.round(remainingCostPct * 10) / 10,
      target_section_time:    formatDuration(sectionTimeMin),
      target_pace_min_per_km: r3(targetPace),
      target_pace:            formatPace(targetPace),
      fast_pace_min_per_km:   r3(fast),
      slow_pace_min_per_km:   r3(slow),
      acceptable_pace_band:   `${formatPace(fast)} – ${formatPace(slow)}`,
      strategy_note:          note,
    };

    // Wind-adjusted pacing
    if (hasWind && totalWindEquivKm) {
      const windEquiv       = s.wind_adjusted_flat_equivalent_km ?? s.flat_equivalent_km;
      const windShare       = totalWindEquivKm > 0 ? windEquiv / totalWindEquivKm : 0;
      const windTimeMin     = targetFinishMinutes * windShare;
      const windTargetPace  = s.distance_km > 0 ? windTimeMin / s.distance_km : 0;

      cumulativeWindCost += windEquiv;
      const windRemaining    = Math.max(totalWindEquivKm - cumulativeWindCost, 0);
      const windRemainingPct = totalWindEquivKm > 0 ? (windRemaining / totalWindEquivKm) * 100 : 0;

      const { fast: wFast, slow: wSlow } = acceptablePaceBand(
        windTargetPace, s.avg_gradient_percent, s.terrain, raceFraction, windRemainingPct
      );

      section.wind_energy_share_percent   = Math.round(windShare * 1000) / 10;
      section.wind_remaining_cost_percent = Math.round(windRemainingPct * 10) / 10;
      section.wind_target_section_time    = formatDuration(windTimeMin);
      section.wind_target_pace_min_per_km = r3(windTargetPace);
      section.wind_target_pace            = formatPace(windTargetPace);
      section.wind_fast_pace_min_per_km   = r3(wFast);
      section.wind_slow_pace_min_per_km   = r3(wSlow);
      section.wind_acceptable_pace_band   = `${formatPace(wFast)} – ${formatPace(wSlow)}`;
    }

    return section;
  });

  // ── Step 4: second-pass merge (identical guidance) ───────────────────────
  if (mergeIdenticalGuidance && pacingSections.length > 1) {
    const merged = mergeGuidanceSections(pacingSections, maxGuidanceSectionKm);

    if (merged.length < pacingSections.length) {
      // Recalculate pacing for the newly merged sections
      const newTotalFlat = merged.reduce((s, x) => s + x.flat_equivalent_km, 0);
      const newTotalWind = hasWind && totalWindEquivKm
        ? merged.reduce((s, x) => s + (x.wind_adjusted_flat_equivalent_km ?? x.flat_equivalent_km), 0)
        : null;

      let cumFlat = 0;
      let cumWind = 0;

      pacingSections = merged.map(s => {
        const midpt      = (s.start_distance_km + s.end_distance_km) / 2;
        const raceFrac   = totalDistanceKm > 0 ? midpt / totalDistanceKm : 0;
        const share      = newTotalFlat > 0 ? s.flat_equivalent_km / newTotalFlat : 0;
        const timeMin    = targetFinishMinutes * share;
        const pace       = s.distance_km > 0 ? timeMin / s.distance_km : 0;

        cumFlat += s.flat_equivalent_km;
        const remPct = newTotalFlat > 0 ? Math.max(0, (newTotalFlat - cumFlat) / newTotalFlat) * 100 : 0;

        const updated: PacingSection = {
          ...s,
          energy_share_percent:   Math.round(share * 1000) / 10,
          remaining_cost_percent: Math.round(remPct * 10) / 10,
          target_section_time:    formatDuration(timeMin),
          target_pace_min_per_km: r3(pace),
          target_pace:            formatPace(pace),
        };

        if (hasWind && newTotalWind) {
          const wEquiv   = s.wind_adjusted_flat_equivalent_km ?? s.flat_equivalent_km;
          const wShare   = newTotalWind > 0 ? wEquiv / newTotalWind : 0;
          const wTimeMin = targetFinishMinutes * wShare;
          const wPace    = s.distance_km > 0 ? wTimeMin / s.distance_km : 0;

          cumWind += wEquiv;
          const wRemPct = newTotalWind > 0 ? Math.max(0, (newTotalWind - cumWind) / newTotalWind) * 100 : 0;

          const { fast: wf, slow: ws } = acceptablePaceBand(
            wPace, s.avg_gradient_percent, s.terrain, raceFrac, wRemPct
          );
          updated.wind_energy_share_percent   = Math.round(wShare * 1000) / 10;
          updated.wind_remaining_cost_percent = Math.round(wRemPct * 10) / 10;
          updated.wind_target_section_time    = formatDuration(wTimeMin);
          updated.wind_target_pace_min_per_km = r3(wPace);
          updated.wind_target_pace            = formatPace(wPace);
          updated.wind_fast_pace_min_per_km   = r3(wf);
          updated.wind_slow_pace_min_per_km   = r3(ws);
          updated.wind_acceptable_pace_band   = `${formatPace(wf)} – ${formatPace(ws)}`;
        }

        return updated;
      });
    }
  }

  // ── Step 5: fitness goals ─────────────────────────────────────────────────
  let fitnessGoals: PacingGuide["fitness_goals"] = undefined;

  if (halfMarathonMinutes && halfMarathonMinutes > 0) {
    const baseNoWind = estimateFinishFromHalfMarathon(
      halfMarathonMinutes, totalFlatEquivKm, riegelExponent
    );
    const noWindGoals = buildGoalTimes(baseNoWind);

    // Add per-section goal paces (no-wind)
    const usedFlatEquiv = pacingSections.reduce((s, x) => s + x.flat_equivalent_km, 0);
    for (const s of pacingSections) {
      const costShare = usedFlatEquiv > 0 ? s.flat_equivalent_km / usedFlatEquiv : 0;
      const sPace = (m: number) =>
        s.distance_km > 0 ? m * costShare / s.distance_km : 0;

      s.stretch_target_pace_min_per_km   = r3(sPace(noWindGoals.stretch_minutes));
      s.stretch_target_pace              = formatPace(sPace(noWindGoals.stretch_minutes));
      s.realistic_target_pace_min_per_km = r3(sPace(noWindGoals.realistic_minutes));
      s.realistic_target_pace            = formatPace(sPace(noWindGoals.realistic_minutes));
      s.comfortable_target_pace_min_per_km = r3(sPace(noWindGoals.comfortable_minutes));
      s.comfortable_target_pace          = formatPace(sPace(noWindGoals.comfortable_minutes));
    }

    fitnessGoals = {
      half_marathon_time: formatDuration(halfMarathonMinutes),
      riegel_exponent:    riegelExponent,
      no_wind:            noWindGoals,
    };

    // Wind-adjusted fitness goals
    if (hasWind && totalWindEquivKm) {
      const baseWind = estimateFinishFromHalfMarathon(
        halfMarathonMinutes, totalWindEquivKm, riegelExponent
      );
      const windGoals = buildGoalTimes(baseWind);

      const usedWindEquiv = pacingSections.reduce(
        (s, x) => s + (x.wind_adjusted_flat_equivalent_km ?? x.flat_equivalent_km), 0
      );
      for (const s of pacingSections) {
        const wEquiv = s.wind_adjusted_flat_equivalent_km ?? s.flat_equivalent_km;
        const wShare = usedWindEquiv > 0 ? wEquiv / usedWindEquiv : 0;
        const wPace  = (m: number) => s.distance_km > 0 ? m * wShare / s.distance_km : 0;

        s.wind_stretch_target_pace    = formatPace(wPace(windGoals.stretch_minutes));
        s.wind_realistic_target_pace  = formatPace(wPace(windGoals.realistic_minutes));
        s.wind_comfortable_target_pace = formatPace(wPace(windGoals.comfortable_minutes));
      }

      fitnessGoals.wind_adjusted = windGoals;
    }
  }

  // ── Top 5 highest-cost sections ───────────────────────────────────────────
  const highestCost = [...pacingSections]
    .sort((a, b) => b.energy_share_percent - a.energy_share_percent)
    .slice(0, 5);

  return {
    race_id:                      raceId,
    race_name:                    raceName,
    target_finish_time:           formatDuration(targetFinishMinutes),
    target_finish_minutes:        Math.round(targetFinishMinutes * 100) / 100,
    total_distance_km:            Math.round(totalDistanceKm * 100) / 100,
    total_ascent_m:               Math.round(totalAscentM),
    total_descent_m:              Math.round(totalDescentM),
    total_flat_equivalent_km:     Math.round(totalFlatEquivKm * 100) / 100,
    difficulty_ratio:             totalDistanceKm > 0
      ? Math.round((totalFlatEquivKm / totalDistanceKm) * 1000) / 1000
      : 1,
    wind_adjusted:                hasWind,
    wind_adjusted_flat_equivalent_km: totalWindEquivKm
      ? Math.round(totalWindEquivKm * 100) / 100
      : null,
    sections_raw:                 sectionsRaw,
    sections:                     pacingSections,
    highest_cost_sections:        highestCost,
    fitness_goals:                fitnessGoals,
  };
}

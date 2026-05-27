/**
 * Race pacing model — TypeScript port of race_pacing_model_fitness_goals.py
 *
 * Takes pre-computed CourseSection[] (already stored in race_profiles.sections_json)
 * and a target finish time, then distributes that time across sections proportionally
 * to each section's flat_equivalent_km cost share.
 *
 * Produces per-section:
 *   - target pace (min/km)
 *   - acceptable pace band (fast–slow guardrail)
 *   - runner-facing strategy note
 *   - wind-adjusted equivalents when wind data is present
 */

// ── Section shape from sections_json ──────────────────────────────────────────

export interface StoredSection {
  start_km: number;
  end_km: number;
  distance_km: number;
  elevation_change_m: number;
  ascent_m: number;
  descent_m: number;
  avg_gradient_percent: number;
  section_type: string;
  terrain: string;
  flat_equivalent_km: number;
  // wind fields (present when profile_source = 'gpx_wind')
  wind_multiplier?: number;
  wind_adjusted_flat_equivalent_km?: number;
  wind_label?: string;
  wind_headwind_ms?: number;
  wind_crosswind_ms?: number;
}

// ── Output section shape ───────────────────────────────────────────────────────

export interface PacingSection extends StoredSection {
  // No-wind pacing
  energy_share_percent: number;
  remaining_cost_percent: number;
  target_section_time: string;
  target_pace_min_per_km: number;
  target_pace: string;
  fast_pace_min_per_km: number;
  slow_pace_min_per_km: number;
  acceptable_pace_band: string;
  strategy_note: string;
  // Wind-adjusted pacing (only when wind data present)
  wind_energy_share_percent?: number;
  wind_remaining_cost_percent?: number;
  wind_target_section_time?: string;
  wind_target_pace_min_per_km?: number;
  wind_target_pace?: string;
  wind_fast_pace_min_per_km?: number;
  wind_slow_pace_min_per_km?: number;
  wind_acceptable_pace_band?: string;
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
  sections: PacingSection[];
  highest_cost_sections: PacingSection[];
}

// ── Format helpers ─────────────────────────────────────────────────────────────

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

// ── Acceptable pace band ───────────────────────────────────────────────────────
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

  // Climbs widen the slow side (athlete may need to slow more than expected)
  if (gradient >= 10) { fastTol += 0.08; slowTol += 0.18; }
  else if (gradient >= 6) { fastTol += 0.06; slowTol += 0.14; }
  else if (gradient >= 3) { fastTol += 0.04; slowTol += 0.10; }

  // Descents cap the fast side (mechanical cost not captured by metabolic saving)
  if (gradient <= -10) { fastTol = Math.min(fastTol, 0.04); slowTol += 0.14; }
  else if (gradient <= -6) { fastTol = Math.min(fastTol + 0.02, 0.07); slowTol += 0.10; }
  else if (gradient <= -3) { fastTol += 0.03; slowTol += 0.08; }

  // Technical terrain: narrow fast side, widen slow side
  const t = terrain.toLowerCase();
  if (["technical_trail", "fell", "mud", "snow", "sand"].includes(t)) {
    fastTol = Math.max(0.02, fastTol - 0.02);
    slowTol += 0.10;
  } else if (["trail", "gravel"].includes(t)) {
    slowTol += 0.04;
  }

  // If a lot of course remains, be more conservative on the fast side
  if (remainingCostPct >= 65) {
    fastTol = Math.max(0.015, fastTol - 0.035);
    slowTol += 0.04;
  } else if (remainingCostPct >= 40) {
    fastTol = Math.max(0.02, fastTol - 0.02);
    slowTol += 0.02;
  }

  // Late race: allow slightly more aggression if little remains
  if (remainingCostPct <= 15 && raceFraction >= 0.80) {
    fastTol += 0.025;
  }

  let fast = targetPace * (1 - fastTol);
  const slow = targetPace * (1 + slowTol);

  // Don't recommend implausibly fast downhill pace
  if (gradient <= -6) fast = Math.max(fast, targetPace * 0.90);

  return { fast, slow };
}

// ── Strategy note ──────────────────────────────────────────────────────────────
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

// ── Gradient row colour hint (for UI) ─────────────────────────────────────────

export function gradientRowColor(gradient: number): string {
  if (gradient >= 12) return "#fef2f2";   // very steep climb — light red
  if (gradient >= 8)  return "#fff7ed";   // major climb — light orange
  if (gradient >= 4)  return "#fefce8";   // climb — light yellow
  if (gradient >= 2)  return "#f9fafb";   // gentle climb — near-white
  if (gradient <= -8) return "#eff6ff";   // steep descent — light blue
  if (gradient <= -4) return "#f0f9ff";   // runnable descent — lighter blue
  return "#ffffff";                        // flat / very gentle
}

// ── Main pacing model ──────────────────────────────────────────────────────────

export function buildPacingGuide(
  raceId: string,
  raceName: string,
  sections: StoredSection[],
  targetFinishMinutes: number
): PacingGuide {
  if (!sections.length || targetFinishMinutes <= 0) {
    throw new Error("Cannot build pacing guide: no sections or invalid target time");
  }

  const totalDistanceKm = sections.reduce((sum, s) => sum + s.distance_km, 0);
  const totalFlatEquivKm = sections.reduce((sum, s) => sum + s.flat_equivalent_km, 0);
  const totalAscentM = sections.reduce((sum, s) => sum + (s.ascent_m ?? 0), 0);
  const totalDescentM = sections.reduce((sum, s) => sum + (s.descent_m ?? 0), 0);

  const hasWind = sections.some(
    (s) => s.wind_adjusted_flat_equivalent_km != null && s.wind_adjusted_flat_equivalent_km > 0
  );
  const totalWindEquivKm = hasWind
    ? sections.reduce((sum, s) => sum + (s.wind_adjusted_flat_equivalent_km ?? s.flat_equivalent_km), 0)
    : null;

  // ── First pass: compute per-section pacing ──────────────────────────────────

  let cumulativeCost = 0;
  let cumulativeWindCost = 0;

  const pacingSections: PacingSection[] = sections.map((s) => {
    const midpointKm = (s.start_km + s.end_km) / 2;
    const raceFraction = totalDistanceKm > 0 ? midpointKm / totalDistanceKm : 0;

    // No-wind pacing
    const energyShare = totalFlatEquivKm > 0 ? s.flat_equivalent_km / totalFlatEquivKm : 0;
    const sectionTimeMin = targetFinishMinutes * energyShare;
    const targetPaceMinPerKm = s.distance_km > 0 ? sectionTimeMin / s.distance_km : 0;

    cumulativeCost += s.flat_equivalent_km;
    const remainingCost = Math.max(totalFlatEquivKm - cumulativeCost, 0);
    const remainingCostPct = totalFlatEquivKm > 0 ? (remainingCost / totalFlatEquivKm) * 100 : 0;

    const { fast, slow } = acceptablePaceBand(
      targetPaceMinPerKm,
      s.avg_gradient_percent,
      s.terrain,
      raceFraction,
      remainingCostPct
    );

    const note = strategyNote(s.avg_gradient_percent, s.distance_km, remainingCostPct);

    const section: PacingSection = {
      ...s,
      energy_share_percent: Math.round(energyShare * 1000) / 10,
      remaining_cost_percent: Math.round(remainingCostPct * 10) / 10,
      target_section_time: formatDuration(sectionTimeMin),
      target_pace_min_per_km: Math.round(targetPaceMinPerKm * 1000) / 1000,
      target_pace: formatPace(targetPaceMinPerKm),
      fast_pace_min_per_km: Math.round(fast * 1000) / 1000,
      slow_pace_min_per_km: Math.round(slow * 1000) / 1000,
      acceptable_pace_band: `${formatPace(fast)} – ${formatPace(slow)}`,
      strategy_note: note,
    };

    // Wind-adjusted pacing
    if (hasWind && totalWindEquivKm) {
      const windEquiv = s.wind_adjusted_flat_equivalent_km ?? s.flat_equivalent_km;
      const windEnergyShare = totalWindEquivKm > 0 ? windEquiv / totalWindEquivKm : 0;
      const windSectionTimeMin = targetFinishMinutes * windEnergyShare;
      const windTargetPace = s.distance_km > 0 ? windSectionTimeMin / s.distance_km : 0;

      cumulativeWindCost += windEquiv;
      const windRemaining = Math.max(totalWindEquivKm - cumulativeWindCost, 0);
      const windRemainingPct = totalWindEquivKm > 0 ? (windRemaining / totalWindEquivKm) * 100 : 0;

      const { fast: wFast, slow: wSlow } = acceptablePaceBand(
        windTargetPace,
        s.avg_gradient_percent,
        s.terrain,
        raceFraction,
        windRemainingPct
      );

      section.wind_energy_share_percent = Math.round(windEnergyShare * 1000) / 10;
      section.wind_remaining_cost_percent = Math.round(windRemainingPct * 10) / 10;
      section.wind_target_section_time = formatDuration(windSectionTimeMin);
      section.wind_target_pace_min_per_km = Math.round(windTargetPace * 1000) / 1000;
      section.wind_target_pace = formatPace(windTargetPace);
      section.wind_fast_pace_min_per_km = Math.round(wFast * 1000) / 1000;
      section.wind_slow_pace_min_per_km = Math.round(wSlow * 1000) / 1000;
      section.wind_acceptable_pace_band = `${formatPace(wFast)} – ${formatPace(wSlow)}`;
    }

    return section;
  });

  // ── Top 5 highest-cost sections ─────────────────────────────────────────────

  const highestCost = [...pacingSections]
    .sort((a, b) => b.energy_share_percent - a.energy_share_percent)
    .slice(0, 5);

  return {
    race_id: raceId,
    race_name: raceName,
    target_finish_time: formatDuration(targetFinishMinutes),
    target_finish_minutes: Math.round(targetFinishMinutes * 100) / 100,
    total_distance_km: Math.round(totalDistanceKm * 100) / 100,
    total_ascent_m: Math.round(totalAscentM),
    total_descent_m: Math.round(totalDescentM),
    total_flat_equivalent_km: Math.round(totalFlatEquivKm * 100) / 100,
    difficulty_ratio: totalDistanceKm > 0
      ? Math.round((totalFlatEquivKm / totalDistanceKm) * 1000) / 1000
      : 1,
    wind_adjusted: hasWind,
    wind_adjusted_flat_equivalent_km: totalWindEquivKm
      ? Math.round(totalWindEquivKm * 100) / 100
      : null,
    sections: pacingSections,
    highest_cost_sections: highestCost,
  };
}

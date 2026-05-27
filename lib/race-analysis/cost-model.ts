/**
 * Race course cost model — direct TypeScript port of the Python functions in
 * race_pacing_model_fitness_goals.py.
 *
 * All threshold tables are copied verbatim from the Python source so that
 * this model produces numerically identical results to the Python script.
 * Do NOT alter thresholds here without mirroring the change in the Python file.
 */

/**
 * Approximate metabolic cost multiplier by gradient.
 *
 * Positive = uphill, negative = downhill.
 * Returns a multiplier relative to flat running (1.00).
 */
export function gradientCostMultiplier(gradient: number): number {
  if (gradient >= 20) return 3.20;
  if (gradient >= 15) return 2.65;
  if (gradient >= 12) return 2.30;
  if (gradient >= 10) return 2.00;
  if (gradient >= 8)  return 1.75;
  if (gradient >= 6)  return 1.55;
  if (gradient >= 4)  return 1.35;
  if (gradient >= 2)  return 1.15;
  if (gradient >= -2) return 1.00;
  if (gradient >= -5) return 0.88;
  if (gradient >= -8) return 0.82;
  if (gradient >= -12) return 0.92;
  if (gradient >= -18) return 1.10;
  return 1.35;
}

/**
 * Surface/terrain efficiency multiplier.
 * Unmapped terrain types default to road (1.00).
 */
export function terrainMultiplier(terrain: string | null | undefined): number {
  const t = (terrain ?? "road").toLowerCase().trim();
  const map: Record<string, number> = {
    road: 1.00,
    pavement: 1.00,
    track: 1.03,
    gravel: 1.06,
    trail: 1.10,
    technical_trail: 1.22,
    fell: 1.28,
    mud: 1.30,
    sand: 1.35,
    snow: 1.45,
  };
  return map[t] ?? 1.00;
}

/**
 * Late-race fatigue overlay.
 * Increases cost slightly for sections in the second half of a race.
 */
export function fatigueMultiplier(
  sectionMidpointKm: number,
  totalDistanceKm: number
): number {
  const raceFraction =
    totalDistanceKm > 0 ? sectionMidpointKm / totalDistanceKm : 0;
  if (raceFraction >= 0.85) return 1.12;
  if (raceFraction >= 0.70) return 1.08;
  if (raceFraction >= 0.50) return 1.04;
  return 1.00;
}

/**
 * Extra penalty for descents that may be metabolically cheap but
 * mechanically damaging to quads.
 */
export function downhillDamagePenalty(
  gradient: number,
  distanceKm: number,
  terrain: string | null | undefined
): number {
  const t = (terrain ?? "road").toLowerCase().trim();
  let penalty = 0.0;

  if (gradient <= -6)  penalty += 0.05;
  if (gradient <= -10) penalty += 0.12;
  if (gradient <= -15) penalty += 0.25;
  if (["technical_trail", "fell", "mud", "snow"].includes(t)) penalty += 0.08;

  return penalty * distanceKm;
}

/**
 * Classify a gradient percent into a human-readable section type.
 * Used for display purposes in section breakdowns.
 */
export function classifyGradient(gradientPercent: number): string {
  const g = gradientPercent;
  if (g >= 12)  return "very_steep_climb";
  if (g >= 8)   return "major_climb";
  if (g >= 4)   return "steady_climb";
  if (g >= 2)   return "gentle_climb";
  if (g > -2)   return "flat_rolling";
  if (g > -5)   return "gentle_descent";
  if (g > -9)   return "runnable_descent";
  if (g > -13)  return "steep_descent";
  return "very_steep_descent";
}

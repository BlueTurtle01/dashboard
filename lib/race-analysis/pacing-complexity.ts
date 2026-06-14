import { gradientCostMultiplier, terrainMultiplier } from "./cost-model";

export interface SectionForComplexity {
  distance_km: number;
  avg_gradient_percent: number;
  terrain: string;
  start_km?: number;
  flat_equivalent_km?: number;
}

export interface PacingComplexityComponents {
  effort_variability: number;
  steep_transitions: number;
  recovery_scarcity: number;
  final_third_complexity: number;
  terrain_overlap: number;
  sustained_effort: number;
}

export interface PacingComplexityResult {
  score: number;
  rating: "Low" | "Moderate" | "High" | "Very High";
  components: PacingComplexityComponents;
  has_sufficient_data: boolean;
}

type GradientBand =
  | "very_steep_climb"
  | "steep_climb"
  | "runnable_climb"
  | "flat_rolling"
  | "runnable_descent"
  | "steep_descent"
  | "very_steep_descent";

function classifyGradientBand(g: number): GradientBand {
  if (g >= 15)  return "very_steep_climb";
  if (g >= 8)   return "steep_climb";
  if (g >= 3)   return "runnable_climb";
  if (g > -3)   return "flat_rolling";
  if (g > -8)   return "runnable_descent";
  if (g > -15)  return "steep_descent";
  return "very_steep_descent";
}

function normalise(value: number, low: number, high: number): number {
  if (high === low) return 0;
  return Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
}

function normaliseInverse(value: number, low: number, high: number): number {
  // Lower value → higher complexity score
  if (high === low) return 0;
  return Math.min(100, Math.max(0, ((high - value) / (high - low)) * 100));
}

function effortRatioFor(s: SectionForComplexity): number {
  if (s.flat_equivalent_km !== undefined && s.distance_km > 0) {
    return s.flat_equivalent_km / s.distance_km;
  }
  return gradientCostMultiplier(s.avg_gradient_percent) * terrainMultiplier(s.terrain);
}

function isHardSection(s: SectionForComplexity): boolean {
  return (
    s.avg_gradient_percent >= 8 ||
    s.avg_gradient_percent <= -8 ||
    effortRatioFor(s) >= 1.30
  );
}

// Terrain modifier used only for the "technical overlap" sub-score.
// Separate from the cost-model terrainMultiplier so the report terminology
// ("non-road hard sections") doesn't imply everything is "Technical Trail".
const TERRAIN_COMPLEXITY_MODIFIER: Record<string, number> = {
  road: 1.00,
  pavement: 1.00,
  track: 1.00,
  gravel: 1.10,
  trail: 1.15,
  fell: 1.25,
  mountain: 1.25,
  technical_trail: 1.30,
  rocky_trail: 1.30,
};

export function calculatePacingComplexityIndex(
  sections: SectionForComplexity[],
  totalDistanceKm?: number,
  flatEquivalentKm?: number,
): PacingComplexityResult {
  const validSecs = sections.filter(s => s.distance_km > 0);

  if (validSecs.length < 3) {
    return {
      score: 0,
      rating: "Low",
      components: {
        effort_variability: 0,
        steep_transitions: 0,
        recovery_scarcity: 0,
        final_third_complexity: 0,
        terrain_overlap: 0,
        sustained_effort: 0,
      },
      has_sufficient_data: false,
    };
  }

  const totalKm =
    totalDistanceKm ?? validSecs.reduce((s, x) => s + x.distance_km, 0);

  // ── 1. Effort variability (30%) ────────────────────────────────────────────
  const effortRatios = validSecs.map(s => effortRatioFor(s));
  const mean = effortRatios.reduce((a, b) => a + b, 0) / effortRatios.length;
  const variance =
    effortRatios.reduce((s, r) => s + (r - mean) ** 2, 0) /
    effortRatios.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;
  const effortVariabilityScore = normalise(cv, 0.10, 0.60);

  // ── 2. Steep-transition frequency (20%) ────────────────────────────────────
  const bands: GradientBand[] = validSecs.map(s =>
    classifyGradientBand(s.avg_gradient_percent),
  );
  let transitions = 0;
  for (let i = 1; i < bands.length; i++) {
    if (bands[i] !== bands[i - 1]) transitions++;
  }
  const transitionsPer10km = totalKm > 0 ? (transitions / totalKm) * 10 : 0;
  const steepTransitionsScore = normalise(transitionsPer10km, 1, 8);

  // ── 3. Recovery scarcity (20%) ─────────────────────────────────────────────
  const hardKm = validSecs
    .filter(s => isHardSection(s))
    .reduce((s, x) => s + x.distance_km, 0);
  const recoveryKm = validSecs
    .filter(
      s => s.avg_gradient_percent >= -3 && s.avg_gradient_percent <= 3,
    )
    .reduce((s, x) => s + x.distance_km, 0);
  const recoveryRatio = hardKm > 0 ? recoveryKm / hardKm : 2.0;

  let longestHardBlock = 0;
  let currentBlock = 0;
  for (const s of validSecs) {
    if (isHardSection(s)) {
      currentBlock += s.distance_km;
    } else {
      currentBlock = 0;
    }
    longestHardBlock = Math.max(longestHardBlock, currentBlock);
  }

  const recoveryRatioScore = normaliseInverse(recoveryRatio, 0.25, 1.5);
  const longestHardBlockScore = normalise(longestHardBlock, 2, 12);
  const recoveryScarcityScore = (recoveryRatioScore + longestHardBlockScore) / 2;

  // ── 4. Final-third complexity (10%) ────────────────────────────────────────
  // start_km may not be available for previous-race sections; fall back to 0.
  const finalThirdStart = totalKm * (2 / 3);
  const finalThirdSecs = validSecs.filter(
    s => (s.start_km ?? 0) >= finalThirdStart,
  );

  let finalThirdScore = 0;
  if (finalThirdSecs.length >= 2) {
    const ftRatios = finalThirdSecs.map(s => effortRatioFor(s));
    const ftMean = ftRatios.reduce((a, b) => a + b, 0) / ftRatios.length;
    const ftVariance =
      ftRatios.reduce((s, r) => s + (r - ftMean) ** 2, 0) / ftRatios.length;
    const ftStd = Math.sqrt(ftVariance);
    const ftCv = ftMean > 0 ? ftStd / ftMean : 0;

    const ftLen = finalThirdSecs.reduce((s, x) => s + x.distance_km, 0);
    const ftBands = finalThirdSecs.map(s =>
      classifyGradientBand(s.avg_gradient_percent),
    );
    let ftTransitions = 0;
    for (let i = 1; i < ftBands.length; i++) {
      if (ftBands[i] !== ftBands[i - 1]) ftTransitions++;
    }
    const ftTransPer10 = ftLen > 0 ? (ftTransitions / ftLen) * 10 : 0;

    finalThirdScore =
      (normalise(ftCv, 0.10, 0.60) + normalise(ftTransPer10, 1, 8)) / 2;
  }

  // ── 5. Technical terrain overlap (5%) ──────────────────────────────────────
  const hardSecs = validSecs.filter(s => isHardSection(s));
  const hardKmTotal = hardSecs.reduce((s, x) => s + x.distance_km, 0);
  const techHardKm = hardSecs
    .filter(
      s => (TERRAIN_COMPLEXITY_MODIFIER[s.terrain.toLowerCase()] ?? 1.00) > 1.00,
    )
    .reduce((s, x) => s + x.distance_km, 0);
  const techOverlapRatio = hardKmTotal > 0 ? techHardKm / hardKmTotal : 0;
  const terrainOverlapScore = normalise(techOverlapRatio, 0.0, 1.0);

  // ── 6. Sustained effort burden (15%) ───────────────────────────────────────
  // flat_equivalent_km captures both distance and route difficulty in one number.
  // Anchors: 10 km flat-equiv (short easy race) → 120 km (full mountain 100km).
  const sectionFlatEquiv = validSecs.reduce((s, x) => s + (x.flat_equivalent_km ?? 0), 0);
  const totalFlatEquiv = flatEquivalentKm ?? (sectionFlatEquiv > 0 ? sectionFlatEquiv : totalKm);
  const sustainedScore = normalise(totalFlatEquiv, 10, 120);

  // ── Composite score ────────────────────────────────────────────────────────
  const rawScore =
    effortVariabilityScore * 0.30 +
    steepTransitionsScore  * 0.20 +
    recoveryScarcityScore  * 0.20 +
    finalThirdScore        * 0.10 +
    terrainOverlapScore    * 0.05 +
    sustainedScore         * 0.15;

  const score = Math.min(100, Math.max(0, Math.round(rawScore)));
  const rating = ratePacingComplexity(score);

  return {
    score,
    rating,
    components: {
      effort_variability:      Math.round(effortVariabilityScore),
      steep_transitions:       Math.round(steepTransitionsScore),
      recovery_scarcity:       Math.round(recoveryScarcityScore),
      final_third_complexity:  Math.round(finalThirdScore),
      terrain_overlap:         Math.round(terrainOverlapScore),
      sustained_effort:        Math.round(sustainedScore),
    },
    has_sufficient_data: true,
  };
}

export function ratePacingComplexity(
  score: number,
): "Low" | "Moderate" | "High" | "Very High" {
  if (score >= 76) return "Very High";
  if (score >= 51) return "High";
  if (score >= 26) return "Moderate";
  return "Low";
}

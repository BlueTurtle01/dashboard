/**
 * Cut-off viability assessment.
 *
 * Given a runner's race history and a race's cutoff schedule, predicts whether
 * the runner will make each cutoff and surfaces an overall finish probability.
 *
 * All pace values are effort-equivalent flat pace (terrain + gradient adjusted).
 * No database calls — the caller is responsible for fetching and passing data.
 */

import { fitRiegelExponent, predictTime } from "./race-analysis/riegel";
import type { StoredSection } from "./race-analysis/pacing-model";

// ─── Constants ─────────────────────────────────────────────────────────────────

const POPULATION_PRIOR_B = 1.06;

/**
 * Surface friction multipliers for the viability context.
 * These differ slightly from cost-model.ts terrainMultiplier(), which covers
 * a different scope — do not merge these.
 */
const CUTOFF_TERRAIN_MULTIPLIERS: Record<string, number> = {
  road: 1.0,
  pavement: 1.0,
  gravel: 1.04,
  trail: 1.1,
  technical_trail: 1.22,
  "technical trail": 1.22,
  fell: 1.35,
  mud: 1.35,
  sand: 1.4,
};

// ─── Public interfaces ──────────────────────────────────────────────────────────

export interface CutOffPoint {
  km: number;
  name?: string;
  timeHours: number;
}

export interface RaceEntry {
  flat_equiv_km: number;
  time_minutes: number;
}

export interface ViabilityInput {
  raceEntries: RaceEntry[];
  cachedRiegelB?: number;
  cachedRiegelConfidence?: number;
  longestDistanceKm: number;
  goalRaceDistanceKm: number;
  cutoffs: CutOffPoint[];
  sections?: StoredSection[];
  fallbackTotalAscentM?: number;
}

export interface CheckpointResult {
  checkpointName: string;
  cumulativeDistanceKm: number;
  cumulativeFlatEquivKm: number;
  requiredPacePerKm: number;
  predictedPacePerKm: number;
  bufferMinutes: number;
  survivalProbability: number;
  cumulativeSurvivalProbability: number;
}

export type DcRiskBand = "low" | "moderate" | "high" | "very_high";

export interface ViabilityResult {
  overallFinishProbability: number;
  distanceCoverageRatio: number;
  dcRiskBand: DcRiskBand;
  riegelB: number;
  riegelBConfidence: number;
  pinchPointIndex: number;
  checkpointResults: CheckpointResult[];
}

// ─── Minetti cost model ─────────────────────────────────────────────────────────

/**
 * Metabolic cost multiplier relative to flat running.
 * Minetti et al. (2002), equation for walking/running on slopes.
 * g = gradient as rise/run (decimal), e.g. 0.10 for 10% grade.
 * C(0) = 3.6 J/(kg·m) is the flat baseline.
 */
export function minettiCostMultiplier(g: number): number {
  const cost =
    155.4 * g ** 5 -
    30.4 * g ** 4 -
    43.3 * g ** 3 +
    46.3 * g ** 2 +
    19.5 * g +
    3.6;
  const flatCost = 3.6;
  return Math.max(cost / flatCost, 0.5);
}

function cutoffTerrainMultiplier(terrain: string): number {
  return CUTOFF_TERRAIN_MULTIPLIERS[terrain.toLowerCase().trim()] ?? 1.0;
}

/**
 * Flat-equivalent distance for a segment using Minetti grade cost + terrain friction.
 * ascentM and descentM are positive values.
 */
export function segmentFlatEquiv(
  distKm: number,
  ascentM: number,
  descentM: number,
  terrain: string
): number {
  if (distKm <= 0) return 0;
  const gradientRiseRun = (ascentM - descentM) / (distKm * 1000);
  return distKm * minettiCostMultiplier(gradientRiseRun) * cutoffTerrainMultiplier(terrain);
}

// ─── Checkpoint interpolation ───────────────────────────────────────────────────

interface SegmentData {
  distKm: number;
  ascentM: number;
  descentM: number;
  terrain: string;
}

/**
 * For each interval between consecutive cutoffs, derive distance, elevation,
 * and dominant terrain by clipping sections_json entries to the interval.
 * Falls back to proportional elevation distribution when sections are absent.
 */
export function interpolateCheckpointSegments(
  cutoffs: CutOffPoint[],
  sections?: StoredSection[],
  fallbackTotalAscentM = 0
): SegmentData[] {
  const sorted = [...cutoffs].sort((a, b) => a.km - b.km);
  const totalDistKm = sorted[sorted.length - 1]?.km ?? 0;

  return sorted.slice(1).map((curr, i) => {
    const prev = sorted[i];
    const segDistKm = curr.km - prev.km;

    if (!sections || sections.length === 0) {
      const fraction = totalDistKm > 0 ? segDistKm / totalDistKm : 0;
      const ascentM = fallbackTotalAscentM * fraction;
      return { distKm: segDistKm, ascentM, descentM: ascentM, terrain: "trail" };
    }

    let totalAscentM = 0;
    let totalDescentM = 0;
    let totalSectionDist = 0;
    const terrainKm = new Map<string, number>();

    for (const sec of sections) {
      const overlapStart = Math.max(sec.start_distance_km, prev.km);
      const overlapEnd = Math.min(sec.end_distance_km, curr.km);
      if (overlapEnd <= overlapStart) continue;

      const clip = (overlapEnd - overlapStart) / (sec.end_distance_km - sec.start_distance_km);
      const clippedDist = (sec.end_distance_km - sec.start_distance_km) * clip;
      totalAscentM += (sec.ascent_m ?? 0) * clip;
      totalDescentM += (sec.descent_m ?? 0) * clip;
      totalSectionDist += clippedDist;

      const t = sec.terrain ?? "trail";
      terrainKm.set(t, (terrainKm.get(t) ?? 0) + clippedDist);
    }

    let dominantTerrain = "trail";
    let maxKm = 0;
    for (const [t, km] of terrainKm) {
      if (km > maxKm) { maxKm = km; dominantTerrain = t; }
    }

    return {
      distKm: segDistKm > 0 ? segDistKm : totalSectionDist,
      ascentM: totalAscentM,
      descentM: totalDescentM,
      terrain: dominantTerrain,
    };
  });
}

// ─── Riegel helpers ─────────────────────────────────────────────────────────────

function deriveFitnessCoeff(entries: RaceEntry[], b: number): number {
  if (entries.length === 0) return 10;
  // Use best (fastest) time-per-flat-km entry
  let bestA = Infinity;
  for (const e of entries) {
    if (e.flat_equiv_km > 0 && e.time_minutes > 0) {
      const A = e.time_minutes / e.flat_equiv_km ** b;
      if (A < bestA) bestA = A;
    }
  }
  return isFinite(bestA) ? bestA : 10;
}

// ─── DCR banding ────────────────────────────────────────────────────────────────

function dcRiskBand(dcr: number): DcRiskBand {
  if (dcr < 1.2) return "low";
  if (dcr < 1.5) return "moderate";
  if (dcr < 2.0) return "high";
  return "very_high";
}

// ─── Survival probability ───────────────────────────────────────────────────────

/**
 * Logistic function calibrated so that:
 *   paceGapSec = 0    → P = 0.50
 *   paceGapSec = +60  → P ≈ 0.27
 *   paceGapSec = −60  → P ≈ 0.73
 */
function survivalProbability(paceGapSecPerKm: number): number {
  return 1 / (1 + Math.exp(paceGapSecPerKm / 60));
}

// ─── Main calculation ───────────────────────────────────────────────────────────

export function computeViability(input: ViabilityInput): ViabilityResult {
  const {
    raceEntries,
    cachedRiegelB,
    cachedRiegelConfidence = 0,
    longestDistanceKm,
    goalRaceDistanceKm,
    cutoffs,
    sections,
    fallbackTotalAscentM = 0,
  } = input;

  // ── Riegel fit ──────────────────────────────────────────────────────────────
  let b: number;
  let fitnessCoeff: number;
  let confidence: number;

  if (cachedRiegelB !== undefined && cachedRiegelConfidence >= 2) {
    b = cachedRiegelB;
    fitnessCoeff = deriveFitnessCoeff(raceEntries, b);
    confidence = cachedRiegelConfidence;
  } else {
    const fit = fitRiegelExponent(raceEntries);
    if (fit) {
      b = fit.exponent;
      fitnessCoeff = fit.fitness_coeff;
      confidence = fit.entry_count;
    } else {
      b = POPULATION_PRIOR_B;
      fitnessCoeff = deriveFitnessCoeff(raceEntries, b);
      confidence = 0;
    }
  }

  // ── Sort cutoffs and build start sentinel ───────────────────────────────────
  const sorted = [...cutoffs].sort((a, b) => a.km - b.km);
  // Ensure start point exists at km=0, time=0
  if (sorted[0]?.km !== 0) {
    sorted.unshift({ km: 0, name: "Start", timeHours: 0 });
  }

  // ── Per-segment interpolation ───────────────────────────────────────────────
  const segments = interpolateCheckpointSegments(sorted, sections, fallbackTotalAscentM);

  // ── Walk checkpoints ────────────────────────────────────────────────────────
  let cumulativeFlatEquivKm = 0;
  let cumulativeSurvivalP = 1.0;
  const checkpointResults: CheckpointResult[] = [];
  let pinchPointIndex = 0;
  let worstPaceGap = -Infinity;

  for (let i = 0; i < segments.length; i++) {
    const checkpoint = sorted[i + 1];
    const seg = segments[i];

    cumulativeFlatEquivKm += segmentFlatEquiv(
      seg.distKm,
      seg.ascentM,
      seg.descentM,
      seg.terrain
    );

    if (cumulativeFlatEquivKm <= 0) continue;

    // Required pace: achieve cutoff time over cumulative flat-equiv distance
    const cutoffSeconds = checkpoint.timeHours * 3600;
    const requiredPaceSecPerKm = cutoffSeconds / cumulativeFlatEquivKm;

    // Predicted time via Riegel: T = A × D^b
    const predictedTimeMin = predictTime(cumulativeFlatEquivKm, {
      exponent: b,
      fitness_coeff: fitnessCoeff,
      r_squared: 0,
      entry_count: confidence,
      flat_equiv_spread_pct: 0,
      reliable: confidence >= 3,
      spread_label: confidence >= 3 ? "good" : confidence >= 2 ? "low" : "none",
    });
    const predictedPaceSecPerKm = (predictedTimeMin * 60) / cumulativeFlatEquivKm;

    const bufferMinutes = checkpoint.timeHours * 60 - predictedTimeMin;
    const paceGapSec = predictedPaceSecPerKm - requiredPaceSecPerKm;
    const survivalP = survivalProbability(paceGapSec);
    cumulativeSurvivalP *= survivalP;

    if (paceGapSec > worstPaceGap) {
      worstPaceGap = paceGapSec;
      pinchPointIndex = i;
    }

    checkpointResults.push({
      checkpointName: checkpoint.name ?? `CP${i + 1}`,
      cumulativeDistanceKm: checkpoint.km,
      cumulativeFlatEquivKm: Math.round(cumulativeFlatEquivKm * 100) / 100,
      requiredPacePerKm: Math.round(requiredPaceSecPerKm),
      predictedPacePerKm: Math.round(predictedPaceSecPerKm),
      bufferMinutes: Math.round(bufferMinutes * 10) / 10,
      survivalProbability: Math.round(survivalP * 100) / 100,
      cumulativeSurvivalProbability: Math.round(cumulativeSurvivalP * 100) / 100,
    });
  }

  const dcr =
    longestDistanceKm > 0 ? Math.round((goalRaceDistanceKm / longestDistanceKm) * 100) / 100 : 99;

  return {
    overallFinishProbability: Math.round(cumulativeSurvivalP * 100) / 100,
    distanceCoverageRatio: dcr,
    dcRiskBand: dcRiskBand(dcr),
    riegelB: Math.round(b * 10000) / 10000,
    riegelBConfidence: confidence,
    pinchPointIndex,
    checkpointResults,
  };
}

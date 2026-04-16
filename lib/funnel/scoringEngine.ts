// =========================================================
// Scoring Engine
// Scores each FunnelRace against a DerivedProfile.
// All weights are named constants — easy to adjust.
// Each dimension scorer returns 0–100.
// =========================================================

import type { DerivedProfile, FunnelRace, RaceExplanation, RaceScore } from './types';

// ---------------------------------------------------------
// SCORE WEIGHTS
// Must sum to 1.0. Adjust here to change overall priorities.
// ---------------------------------------------------------
export const SCORE_WEIGHTS = {
  endurance_fit: 0.20,
  life_fit: 0.15,
  budget_fit: 0.15,
  mds_progression_fit: 0.15,
  terrain_fit: 0.10,
  heat_fit: 0.10,
  stage_fit: 0.05,
  pack_fit: 0.05,
  travel_fit: 0.05,
  risk_fit: 0.00, // Encoded into selection logic, not weighted total
} as const;

// ---------------------------------------------------------
// Hard filter: returns reasons why a race is excluded entirely
// ---------------------------------------------------------
function getHardFilterReasons(race: FunnelRace, profile: DerivedProfile): string[] {
  const reasons: string[] = [];

  // Don't recommend MDS itself as a feeder race
  if (race.slug === 'marathon-des-sables') {
    reasons.push('This is the target event, not a feeder race.');
    return reasons;
  }

  // Budget: race total cost more than 150% of budget
  if (
    race.estimated_total_cost_gbp &&
    profile.budget_gbp_estimate > 0 &&
    race.estimated_total_cost_gbp > profile.budget_gbp_estimate * 1.5
  ) {
    reasons.push(
      `Estimated total cost (~£${race.estimated_total_cost_gbp.toLocaleString()}) is significantly above your budget.`
    );
  }

  // Travel: race continent doesn't match travel willingness
  const longHaulContinents = ['South America', 'Asia', 'North America', 'Oceania'];
  const isLongHaul = longHaulContinents.includes(race.continent);
  if (profile.travel_willingness_level === 1 && race.country !== 'United Kingdom') {
    reasons.push('You indicated you prefer to race domestically.');
  } else if (profile.travel_willingness_level === 2 && isLongHaul) {
    reasons.push(
      `${race.country} requires long-haul travel, which you indicated you prefer to avoid.`
    );
  }

  // Background: race is 2+ tiers beyond user level, and they're not seeking a stretch
  const backgroundGap = race.min_background_level - profile.endurance_level;
  if (profile.risk_appetite_level < 3 && backgroundGap >= 2) {
    reasons.push(
      'This race requires significantly more endurance background than you currently have.'
    );
  }

  return reasons;
}

// ---------------------------------------------------------
// ENDURANCE FIT (0–100)
// How well does the race match the athlete's endurance background?
// ---------------------------------------------------------
function scoreEnduranceFit(race: FunnelRace, profile: DerivedProfile): number {
  const gap = race.min_background_level - profile.endurance_level;

  if (gap <= -2) return 70; // Overqualified — race may feel too easy
  if (gap === -1) return 85; // Slightly overqualified — still worthwhile
  if (gap === 0) return 100; // Perfect match
  if (gap === 1) return 50;  // Slightly challenging — borderline
  if (gap === 2) return 20;  // Significant stretch — risky
  return 5;                   // Way beyond current level
}

// ---------------------------------------------------------
// TERRAIN FIT (0–100)
// Does the race terrain match the athlete's training terrain?
// ---------------------------------------------------------
function scoreTerrainFit(race: FunnelRace, profile: DerivedProfile): number {
  let score = 50;

  const isHilly = race.hilliness_level >= 3;
  const isTechnical = race.technicality_level >= 4;

  // Desert race fit
  if (race.is_desert_race) {
    if (profile.desert_terrain_access) score += 20;
    if (profile.terrain_readiness_level >= 2) score += 10;
    if (profile.wants_desert_specificity) score += 20;
  }

  // Hilly / mountain race fit
  if (isHilly && profile.terrain_readiness_level >= 3) score += 15;
  if (isTechnical && profile.terrain_readiness_level >= 4) score += 15;
  if (isTechnical && profile.terrain_readiness_level <= 2) score -= 20;

  // Road-based athlete penalty for very technical terrain
  if (profile.terrain_readiness_level === 1 && isTechnical) score -= 25;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------
// STAGE FIT (0–100)
// Preference and readiness for stage racing
// ---------------------------------------------------------
function scoreStageFit(race: FunnelRace, profile: DerivedProfile): number {
  if (race.is_single_stage && !race.is_stage_race) {
    if (profile.prefers_stage_race) return 40;             // Wants stage but race is single-day
    if (profile.stage_race_readiness_level <= 2) return 80; // Good stepping stone
    return 60;
  }

  // Stage race
  if (profile.prefers_stage_race) return 95;
  if (profile.stage_race_readiness_level >= 3) return 80;
  if (profile.stage_race_readiness_level === 2) return 60;
  return 40; // Stage race but user has no multi-stage readiness
}

// ---------------------------------------------------------
// PACK FIT (0–100)
// Self-sufficiency and pack-carry alignment
// ---------------------------------------------------------
function scorePackFit(race: FunnelRace, profile: DerivedProfile): number {
  const racePackLevel = race.pack_requirement_level;

  if (racePackLevel <= 1) return 80; // No significant pack requirement

  if (racePackLevel >= 4) {
    if (profile.has_pack_experience) return 90;
    if (profile.pack_readiness_level >= 3) return 75;
    if (profile.pack_readiness_level === 2) return 45;
    return 20;
  }

  // Moderate pack requirement
  if (profile.has_pack_experience) return 85;
  if (profile.pack_readiness_level >= 2) return 65;
  return 45;
}

// ---------------------------------------------------------
// HEAT FIT (0–100)
// Heat exposure match to athlete preference and readiness
// ---------------------------------------------------------
function scoreHeatFit(race: FunnelRace, profile: DerivedProfile): number {
  const raceHeat = race.heat_level;

  // Athlete wants to avoid heat
  if (profile.heat_preference === 'avoid_heat') {
    if (raceHeat <= 2) return 90;
    if (raceHeat === 3) return 60;
    return 20;
  }

  // Athlete wants desert heat simulation
  if (profile.wants_desert_specificity || profile.heat_preference === 'desert_heat') {
    if (raceHeat >= 4) return 100;
    if (raceHeat === 3) return 65;
    return 30;
  }

  // Neutral / moderate heat preference
  if (raceHeat >= 4 && profile.heat_readiness_level <= 2) {
    return profile.willing_heat_training ? 55 : 35;
  }

  if (raceHeat >= 4 && profile.heat_readiness_level >= 3) return 90;
  if (raceHeat <= 2) return 70;
  return 75;
}

// ---------------------------------------------------------
// BUDGET FIT (0–100)
// How well does the race cost align with budget?
// ---------------------------------------------------------
function scoreBudgetFit(race: FunnelRace, profile: DerivedProfile): number {
  const cost = race.estimated_total_cost_gbp;
  if (!cost) return 75;

  const budget = profile.budget_gbp_estimate;
  if (budget === 0) return 50;
  const ratio = cost / budget;

  if (ratio <= 0.7) return 100;
  if (ratio <= 0.9) return 90;
  if (ratio <= 1.0) return 75;
  if (ratio <= 1.2) return 50;
  if (ratio <= 1.5) return 25;
  return 5;
}

// ---------------------------------------------------------
// TRAVEL FIT (0–100)
// Logistics burden relative to willingness and constraints
// ---------------------------------------------------------
function scoreTravelFit(race: FunnelRace, profile: DerivedProfile): number {
  const raceTravelDifficulty = race.travel_difficulty_level;
  const logisticsComplexity = race.logistics_complexity_level;
  const userWillingness = profile.travel_willingness_level;

  let score = 80;

  // Travel difficulty vs willingness
  if (raceTravelDifficulty >= 4 && userWillingness <= 2) score -= 30;
  if (raceTravelDifficulty >= 4 && userWillingness <= 1) score -= 20;

  // Logistics complexity
  if (profile.prefers_simple_logistics && logisticsComplexity >= 4) score -= 25;
  if (profile.needs_minimal_time_away && race.is_stage_race) score -= 15;

  // Bonus: nearby race for constrained traveller
  if (raceTravelDifficulty <= 2 && userWillingness <= 2) score += 20;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------
// LIFE FIT (0–100)
// Does the race suit the athlete's real-world constraints?
// ---------------------------------------------------------
function scoreLifeFit(race: FunnelRace, profile: DerivedProfile): number {
  let score = 75;

  if (profile.life_constraint_level <= 2) {
    if (race.is_stage_race) score -= 15;
    if (race.logistics_complexity_level >= 4) score -= 15;
    if (race.travel_difficulty_level >= 4) score -= 10;
  }

  if (profile.life_constraint_level >= 4) {
    if (race.is_stage_race) score += 10;
  }

  if (race.is_single_stage && profile.life_constraint_level <= 2) score += 15;

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------
// MDS PROGRESSION FIT (0–100)
// How well does this race develop the skills needed for MDS?
// ---------------------------------------------------------
function scoreMdsProgressionFit(race: FunnelRace, profile: DerivedProfile): number {
  let score = 0;

  const need = profile.primary_need;

  if (race.is_desert_race) score += 30;
  if (race.heat_level >= 4) score += 20;
  if (race.self_sufficiency_level >= 4) score += 20;
  if (race.pack_requirement_level >= 4) score += 15;
  if (race.is_stage_race) score += 15;

  // Align with stated primary need
  if (need === 'heat_management' && race.heat_level >= 4) score += 10;
  if (need === 'stage_racing' && race.is_stage_race) score += 10;
  if (need === 'pack_carrying' && race.pack_requirement_level >= 4) score += 10;
  if (need === 'endurance' && (race.total_distance_km ?? 0) >= 100) score += 10;
  if (need === 'confidence' && race.suitable_after_marathon_level >= 4) score += 10;
  if (need === 'understand_desert' && race.is_desert_race) score += 10;

  // MDS suitability bonus
  score += (race.suitable_as_final_step_before_mds_level - 1) * 5;

  return Math.min(100, score);
}

// ---------------------------------------------------------
// Main scorer: scoreRace
// ---------------------------------------------------------
export function scoreRace(race: FunnelRace, profile: DerivedProfile): RaceScore {
  const hardFilterReasons = getHardFilterReasons(race, profile);
  const isHardFiltered = hardFilterReasons.length > 0;

  const endurance_fit_score = scoreEnduranceFit(race, profile);
  const terrain_fit_score = scoreTerrainFit(race, profile);
  const stage_fit_score = scoreStageFit(race, profile);
  const pack_fit_score = scorePackFit(race, profile);
  const heat_fit_score = scoreHeatFit(race, profile);
  const budget_fit_score = scoreBudgetFit(race, profile);
  const travel_fit_score = scoreTravelFit(race, profile);
  const life_fit_score = scoreLifeFit(race, profile);
  const risk_fit_score = 50; // Encoded in selection logic only
  const mds_progression_fit_score = scoreMdsProgressionFit(race, profile);

  const total_score = isHardFiltered
    ? 0
    : Math.round(
        endurance_fit_score * SCORE_WEIGHTS.endurance_fit +
          terrain_fit_score * SCORE_WEIGHTS.terrain_fit +
          stage_fit_score * SCORE_WEIGHTS.stage_fit +
          pack_fit_score * SCORE_WEIGHTS.pack_fit +
          heat_fit_score * SCORE_WEIGHTS.heat_fit +
          budget_fit_score * SCORE_WEIGHTS.budget_fit +
          travel_fit_score * SCORE_WEIGHTS.travel_fit +
          life_fit_score * SCORE_WEIGHTS.life_fit +
          mds_progression_fit_score * SCORE_WEIGHTS.mds_progression_fit
      );

  const explanation: RaceExplanation = {
    why_fits: [],
    why_realistic: [],
    what_it_develops: [],
    gaps_to_address: [],
    not_yet_reasons: isHardFiltered ? hardFilterReasons : undefined,
  };

  return {
    race,
    is_hard_filtered: isHardFiltered,
    hard_filter_reasons: hardFilterReasons,
    endurance_fit_score,
    terrain_fit_score,
    stage_fit_score,
    pack_fit_score,
    heat_fit_score,
    budget_fit_score,
    travel_fit_score,
    life_fit_score,
    risk_fit_score,
    mds_progression_fit_score,
    total_score,
    explanation,
  };
}

// ---------------------------------------------------------
// Score all races, sorted best-first
// ---------------------------------------------------------
export function scoreAllRaces(races: FunnelRace[], profile: DerivedProfile): RaceScore[] {
  return races
    .map((race) => scoreRace(race, profile))
    .sort((a, b) => b.total_score - a.total_score);
}

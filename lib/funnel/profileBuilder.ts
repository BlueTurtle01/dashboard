// =========================================================
// Profile Builder
// Maps raw assessment answers -> normalised DerivedProfile.
// All business rules are explicit and documented here.
// =========================================================

import type { AssessmentAnswers, BudgetBand, DerivedProfile, MdsTimeline } from './types';

// ---------------------------------------------------------
// Endurance level (1–5)
// Based on longest completed race + recent training volume
// ---------------------------------------------------------
function deriveEnduranceLevel(a: AssessmentAnswers): number {
  const raceScore: Record<string, number> = {
    none: 1,
    half_marathon: 2,
    marathon: 3,
    '50k': 3,
    '50_mile': 4,
    '100k': 4,
    '100_mile': 5,
    multi_stage: 5,
    other: 2,
  };

  const base = raceScore[a.longest_completed_race ?? 'none'] ?? 1;

  // Boost by 0.5 for high recent effort (5+ hours in last 8 weeks)
  const recentBoost =
    (a.longest_recent_effort_hours ?? 0) >= 5 ? 0.5 : 0;

  // Boost by 0.5 for training 5+ days per week
  const volumeBoost = (a.training_days_per_week ?? 0) >= 5 ? 0.5 : 0;

  return Math.min(5, Math.round(base + recentBoost + volumeBoost));
}

// ---------------------------------------------------------
// Terrain readiness level (1–5)
// ---------------------------------------------------------
function deriveTerrainReadiness(a: AssessmentAnswers): number {
  const terrainBase: Record<string, number> = {
    road: 1,
    flat_trail: 2,
    hilly_trail: 3,
    technical_trail: 4,
    mixed: 3,
  };

  let level = terrainBase[a.main_terrain_type ?? 'road'] ?? 1;

  // Hill frequency bonus
  if (a.hill_frequency === 'often') level += 0.5;
  if (a.hill_frequency === 'always') level += 1;

  // Desert terrain access
  if (a.desert_terrain_access) level += 0.5;

  // Comfort on uneven ground
  if (a.uneven_ground_comfort === 'comfortable') level += 0.5;
  if (a.uneven_ground_comfort === 'very_comfortable') level += 1;

  return Math.min(5, Math.round(level));
}

// ---------------------------------------------------------
// Stage race readiness (1–5)
// ---------------------------------------------------------
function deriveStageRaceReadiness(a: AssessmentAnswers): number {
  let level = 1;

  if (a.has_multi_stage_experience) level += 2;
  if (a.back_to_back_long_efforts ?? a.multi_day_fatigue_comfort === 'high') level += 1;
  if (a.multi_day_fatigue_comfort === 'medium') level += 0.5;
  if (a.multi_day_fatigue_comfort === 'high') level += 0.5;

  // Back-to-back training at any frequency is a positive signal
  const bbFreq = a.back_to_back_frequency;
  if (bbFreq === 'monthly') level += 0.5;
  if (bbFreq === 'weekly') level += 1;

  return Math.min(5, Math.round(level));
}

// ---------------------------------------------------------
// Pack readiness (1–5)
// ---------------------------------------------------------
function derivePackReadiness(a: AssessmentAnswers): number {
  let level = 1;

  if (a.has_pack_experience) level += 2;

  // Prior experience flags
  const exp = a.prior_experience ?? [];
  if (exp.includes('pack_carry')) level += 1;
  if (exp.includes('multi_stage')) level += 0.5;

  return Math.min(5, Math.round(level));
}

// ---------------------------------------------------------
// Heat readiness (1–5)
// ---------------------------------------------------------
function deriveHeatReadiness(a: AssessmentAnswers): number {
  let level = 1;

  if (a.lives_in_hot_climate) level += 2;
  if (a.has_raced_in_heat) level += 1;
  if (a.willing_heat_training) level += 1;

  // Struggling badly in heat is a negative signal
  if (a.struggled_badly_in_heat) level -= 1;

  return Math.max(1, Math.min(5, Math.round(level)));
}

// ---------------------------------------------------------
// Budget band
// ---------------------------------------------------------
function deriveBudgetBand(a: AssessmentAnswers): BudgetBand {
  const gbp = a.total_budget_gbp ?? 0;
  if (gbp < 500) return 'under_500';
  if (gbp < 1000) return '500_1000';
  if (gbp < 2000) return '1000_2000';
  if (gbp < 3500) return '2000_3500';
  return '3500_plus';
}

function budgetBandToGbp(band: BudgetBand): number {
  const map: Record<BudgetBand, number> = {
    under_500: 400,
    '500_1000': 750,
    '1000_2000': 1500,
    '2000_3500': 2750,
    '3500_plus': 5000,
  };
  return map[band];
}

// ---------------------------------------------------------
// Travel willingness (1=domestic only, 4=anywhere)
// ---------------------------------------------------------
function deriveTravelWillingness(a: AssessmentAnswers): number {
  const map: Record<string, number> = {
    domestic: 1,
    short_haul: 2,
    long_haul: 3,
    anywhere: 4,
  };
  return map[a.travel_distance_willingness ?? 'anywhere'] ?? 4;
}

// ---------------------------------------------------------
// Life constraint level (1=very constrained, 5=very flexible)
// ---------------------------------------------------------
function deriveLifeConstraintLevel(a: AssessmentAnswers): number {
  let flexibility = 3; // start neutral

  const days = a.realistic_training_days ?? 4;
  if (days >= 5) flexibility += 1;
  if (days <= 2) flexibility -= 1;

  if (a.can_do_long_weekends) flexibility += 1;
  if (a.needs_minimal_time_away) flexibility -= 1;
  if (a.prefers_simple_logistics) flexibility -= 0.5;

  const constraint = a.biggest_constraint;
  if (constraint === 'time' || constraint === 'family') flexibility -= 1;
  if (constraint === 'budget') flexibility -= 0.5;

  return Math.max(1, Math.min(5, Math.round(flexibility)));
}

// ---------------------------------------------------------
// Risk appetite (1=low/safest, 2=balanced, 3=high/stretch)
// ---------------------------------------------------------
function deriveRiskAppetite(a: AssessmentAnswers): number {
  const map: Record<string, number> = {
    safest: 1,
    balanced: 2,
    stretch: 3,
  };
  return map[a.next_race_ambition ?? 'balanced'] ?? 2;
}

// ---------------------------------------------------------
// MDS timeline
// ---------------------------------------------------------
function deriveMdsTimeline(a: AssessmentAnswers): MdsTimeline {
  const map: Record<string, MdsTimeline> = {
    within_12m: 'within_12m',
    '12_24m': '12_24m',
    '2_plus_years': '2_plus_years',
    exploring: 'exploring',
  };
  return map[a.mds_timeline ?? 'exploring'] ?? 'exploring';
}

// ---------------------------------------------------------
// Main export: buildDerivedProfile
// ---------------------------------------------------------
export function buildDerivedProfile(a: AssessmentAnswers): DerivedProfile {
  const budgetBand = deriveBudgetBand(a);
  const exp = a.prior_experience ?? [];

  return {
    endurance_level: deriveEnduranceLevel(a),
    terrain_readiness_level: deriveTerrainReadiness(a),
    stage_race_readiness_level: deriveStageRaceReadiness(a),
    pack_readiness_level: derivePackReadiness(a),
    heat_readiness_level: deriveHeatReadiness(a),

    budget_band: budgetBand,
    budget_gbp_estimate: budgetBandToGbp(budgetBand),

    travel_willingness_level: deriveTravelWillingness(a),
    life_constraint_level: deriveLifeConstraintLevel(a),

    risk_appetite_level: deriveRiskAppetite(a),
    mds_goal_timeline: deriveMdsTimeline(a),
    primary_need: a.most_needed_from_next_race ?? 'confidence',

    // Boolean flags
    has_marathon: exp.includes('marathon') || (a.longest_completed_race ?? '') === 'marathon',
    has_trail_marathon: exp.includes('trail_marathon'),
    has_ultra:
      exp.includes('ultra') ||
      ['50k', '50_mile', '100k', '100_mile'].includes(a.longest_completed_race ?? ''),
    has_multi_stage:
      exp.includes('multi_stage') ||
      (a.longest_completed_race ?? '') === 'multi_stage' ||
      (a.has_multi_stage_experience ?? false),
    has_pack_experience:
      exp.includes('pack_carry') || (a.has_pack_experience ?? false),

    can_train_4_plus_days: (a.realistic_training_days ?? a.training_days_per_week ?? 3) >= 4,
    can_do_back_to_back:
      (a.back_to_back_long_efforts ?? false) ||
      a.multi_day_fatigue_comfort === 'high',
    willing_heat_training: a.willing_heat_training ?? false,
    prefers_lower_risk: a.next_race_ambition === 'safest',
    prefers_stage_race: a.stage_preference === 'stage_race',

    // Extra context fields (passed through from answers for use in scoring)
    desert_terrain_access: a.desert_terrain_access ?? false,
    heat_preference: a.heat_preference ?? null,
    prefers_simple_logistics: a.prefers_simple_logistics ?? false,
    needs_minimal_time_away: a.needs_minimal_time_away ?? false,

    wants_desert_specificity:
      a.heat_preference === 'desert_heat' ||
      a.most_appealing_quality === 'desert' ||
      a.most_needed_from_next_race === 'heat_management',
    is_targeting_mds: a.targeting_mds ?? false,
  };
}

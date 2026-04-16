// =========================================================
// Funnel Types
// Shared types for the Race Readiness Lead Funnel system
// =========================================================

// ---------------------------------------------------------
// Raw assessment answers (keyed by question_key)
// ---------------------------------------------------------
export interface AssessmentAnswers {
  // Section A: Contact details
  first_name?: string;
  email?: string;
  country_of_residence?: string;
  consent_marketing?: boolean;
  consent_privacy?: boolean;

  // Section B: Endurance base
  longest_completed_race?: string; // enum: none | half_marathon | marathon | 50k | 50_mile | 100k | 100_mile | multi_stage | other
  longest_recent_effort_hours?: number; // hours in last 8 weeks
  training_days_per_week?: number;
  training_hours_per_week?: number;
  back_to_back_frequency?: string; // never | rarely | monthly | weekly
  prior_experience?: string[]; // ['marathon','trail_marathon','ultra','multi_stage','pack_carry']

  // Section C: Terrain
  main_terrain_type?: string; // road | flat_trail | hilly_trail | technical_trail | sand | mixed
  trail_frequency?: string; // never | rarely | sometimes | often | always
  hill_frequency?: string; // never | rarely | sometimes | often | always
  desert_terrain_access?: boolean;
  uneven_ground_comfort?: string; // uncomfortable | ok | comfortable | very_comfortable

  // Section D: Multi-stage & pack
  has_multi_stage_experience?: boolean;
  has_pack_experience?: boolean;
  multi_day_fatigue_comfort?: string; // low | medium | high
  back_to_back_long_efforts?: boolean;
  stage_preference?: string; // single_stage | stage_race | either

  // Section E: Heat & climate
  lives_in_hot_climate?: boolean;
  has_raced_in_heat?: boolean;
  struggled_badly_in_heat?: boolean;
  willing_heat_training?: boolean;
  heat_preference?: string; // avoid_heat | some_heat | desert_heat

  // Section F: Budget & logistics
  total_budget_gbp?: number;
  willing_international_travel?: boolean;
  travel_distance_willingness?: string; // domestic | short_haul | long_haul | anywhere
  needs_minimal_time_away?: boolean;
  prefers_simple_logistics?: boolean;

  // Section G: Life constraints
  realistic_training_days?: number;
  can_do_long_weekends?: boolean;
  biggest_constraint?: string; // time | budget | terrain | heat | recovery | family
  needs_work_life_fit?: boolean;

  // Section H: Risk & ambitions
  next_race_ambition?: string; // safest | balanced | stretch
  finish_vs_accelerate?: string; // finish_probability | accelerate_progression
  most_appealing_quality?: string; // confidence | stage_experience | desert | endurance | self_sufficiency

  // Section I: MDS goal
  targeting_mds?: boolean;
  mds_timeline?: string; // within_12m | 12_24m | 2_plus_years | exploring
  most_needed_from_next_race?: string; // confidence | stage_racing | heat_management | endurance | pack_carrying | understand_desert
}

// ---------------------------------------------------------
// Derived normalised profile (built from raw answers)
// ---------------------------------------------------------
export interface DerivedProfile {
  // Readiness tiers 1–5 (1=very low, 5=very high)
  endurance_level: number;
  terrain_readiness_level: number;
  stage_race_readiness_level: number;
  pack_readiness_level: number;
  heat_readiness_level: number;

  // Budget
  budget_band: BudgetBand;
  budget_gbp_estimate: number;

  // Logistics
  travel_willingness_level: number; // 1=domestic only, 4=anywhere
  life_constraint_level: number;    // 1=very constrained, 5=very flexible

  // Risk & goals
  risk_appetite_level: number; // 1=low, 2=medium, 3=high
  mds_goal_timeline: MdsTimeline;
  primary_need: string; // what they most need from next race

  // Boolean flags used in scoring + filtering
  has_marathon: boolean;
  has_trail_marathon: boolean;
  has_ultra: boolean;
  has_multi_stage: boolean;
  has_pack_experience: boolean;
  can_train_4_plus_days: boolean;
  can_do_back_to_back: boolean;
  willing_heat_training: boolean;
  prefers_lower_risk: boolean;
  prefers_stage_race: boolean;
  wants_desert_specificity: boolean;
  is_targeting_mds: boolean;

  // Extra context fields passed from answers — used in scoring
  desert_terrain_access: boolean;
  heat_preference: string | null; // 'avoid_heat' | 'some_heat' | 'desert_heat' | null
  prefers_simple_logistics: boolean;
  needs_minimal_time_away: boolean;
}

export type BudgetBand = 'under_500' | '500_1000' | '1000_2000' | '2000_3500' | '3500_plus';
export type MdsTimeline = 'within_12m' | '12_24m' | '2_plus_years' | 'exploring';

// ---------------------------------------------------------
// Funnel race (from funnel_races table)
// ---------------------------------------------------------
export interface FunnelRace {
  id: string;
  name: string;
  slug: string;
  organiser: string | null;
  website_url: string | null;
  country: string;
  region: string | null;
  continent: string;
  typical_month: number | null;
  is_stage_race: boolean;
  is_single_stage: boolean;
  is_desert_race: boolean;
  stage_count: number | null;
  total_distance_km: number | null;
  longest_stage_km: number | null;
  terrain_tags: string[];
  surface_tags: string[];
  technicality_level: number;
  hilliness_level: number;
  heat_level: number;
  humidity_level: number;
  self_sufficiency_level: number;
  pack_requirement_level: number;
  logistics_complexity_level: number;
  travel_difficulty_level: number;
  suitable_after_marathon_level: number;
  suitable_as_final_step_before_mds_level: number;
  min_background_level: number;
  estimated_entry_cost_gbp: number | null;
  estimated_total_cost_gbp: number | null;
  notes: string | null;
}

// ---------------------------------------------------------
// Scoring
// ---------------------------------------------------------
export interface RaceScore {
  race: FunnelRace;
  is_hard_filtered: boolean;
  hard_filter_reasons: string[];
  // Component scores 0–100
  endurance_fit_score: number;
  terrain_fit_score: number;
  stage_fit_score: number;
  pack_fit_score: number;
  heat_fit_score: number;
  budget_fit_score: number;
  travel_fit_score: number;
  life_fit_score: number;
  risk_fit_score: number;
  mds_progression_fit_score: number;
  // Weighted total 0–100
  total_score: number;
  explanation: RaceExplanation;
}

export interface RaceExplanation {
  why_fits: string[];
  why_realistic: string[];
  what_it_develops: string[];
  gaps_to_address: string[];
  not_yet_reasons?: string[]; // why this race is not yet suitable (for excluded races)
}

// ---------------------------------------------------------
// Final recommendation output
// ---------------------------------------------------------
export interface AssessmentResult {
  primary_race: RaceScore;
  alternatives: RaceScore[]; // up to 2
  lower_risk_race: RaceScore | null;
  stretch_race: RaceScore | null;
  all_scores: RaceScore[];
  main_gaps: string[];
  summary: ResultSummary;
}

export interface ResultSummary {
  endurance_summary: string;
  timeline_summary: string;
  biggest_strength: string;
  biggest_gap: string;
  personalised_intro: string;
}

// ---------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------
export interface FunnelSubmitPayload {
  answers: AssessmentAnswers;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface FunnelSubmitResponse {
  assessment_id: string;
  result: AssessmentResult;
}

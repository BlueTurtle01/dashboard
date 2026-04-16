-- =========================================================
-- FUNNEL SCHEMA MIGRATION
-- Race Readiness Lead Funnel – Feeder Race Matcher
-- Run this in Supabase SQL editor (safe to re-run: IF NOT EXISTS)
-- =========================================================

-- =====================
-- 1. FUNNEL_RACES
--    Stores the feeder race database used for scoring
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  organiser text,
  website_url text,
  country text NOT NULL,
  region text,
  continent text NOT NULL DEFAULT 'Unknown',

  -- Optional link to existing preparation_races table
  preparation_race_id uuid REFERENCES public.preparation_races(id),

  -- Typical event month (1=Jan … 12=Dec)
  typical_month integer CHECK (typical_month BETWEEN 1 AND 12),

  -- Race structure
  is_stage_race boolean NOT NULL DEFAULT false,
  is_single_stage boolean NOT NULL DEFAULT true,
  is_desert_race boolean NOT NULL DEFAULT false,
  stage_count integer,
  total_distance_km numeric,
  longest_stage_km numeric,

  terrain_tags text[] NOT NULL DEFAULT '{}',
  surface_tags text[] NOT NULL DEFAULT '{}',

  -- Difficulty dimensions (1=very easy … 5=very hard/demanding)
  technicality_level smallint NOT NULL DEFAULT 2 CHECK (technicality_level BETWEEN 1 AND 5),
  hilliness_level smallint NOT NULL DEFAULT 2 CHECK (hilliness_level BETWEEN 1 AND 5),
  heat_level smallint NOT NULL DEFAULT 2 CHECK (heat_level BETWEEN 1 AND 5),
  humidity_level smallint NOT NULL DEFAULT 2 CHECK (humidity_level BETWEEN 1 AND 5),
  self_sufficiency_level smallint NOT NULL DEFAULT 1 CHECK (self_sufficiency_level BETWEEN 1 AND 5),
  pack_requirement_level smallint NOT NULL DEFAULT 1 CHECK (pack_requirement_level BETWEEN 1 AND 5),
  logistics_complexity_level smallint NOT NULL DEFAULT 2 CHECK (logistics_complexity_level BETWEEN 1 AND 5),
  travel_difficulty_level smallint NOT NULL DEFAULT 2 CHECK (travel_difficulty_level BETWEEN 1 AND 5),

  -- Suitability ratings (1=not suitable … 5=ideal)
  suitable_after_marathon_level smallint NOT NULL DEFAULT 3 CHECK (suitable_after_marathon_level BETWEEN 1 AND 5),
  suitable_as_final_step_before_mds_level smallint NOT NULL DEFAULT 3 CHECK (suitable_as_final_step_before_mds_level BETWEEN 1 AND 5),
  -- Minimum athlete background to realistically finish (1=very accessible … 5=very experienced only)
  min_background_level smallint NOT NULL DEFAULT 2 CHECK (min_background_level BETWEEN 1 AND 5),

  -- Cost (GBP estimates, entry only vs all-in)
  estimated_entry_cost_gbp integer,
  estimated_total_cost_gbp integer,

  is_active boolean NOT NULL DEFAULT true,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- 2. FUNNEL_LEADS
--    Stores lead identity and attribution data
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  email text NOT NULL,
  country_of_residence text,
  region_or_airport text,

  -- UTM / attribution
  source_funnel text,
  source_campaign text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,

  -- GDPR consent
  consent_marketing boolean NOT NULL DEFAULT false,
  consent_privacy boolean NOT NULL DEFAULT true,

  -- Set when lead converts to a real athlete account
  converted_athlete_user_id uuid REFERENCES auth.users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- 3. FUNNEL_ASSESSMENTS
--    One row per assessment attempt (a lead can have multiple)
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.funnel_leads(id),
  funnel_type text NOT NULL DEFAULT 'feeder_race_matcher',
  funnel_version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- 4. FUNNEL_ASSESSMENT_ANSWERS
--    Raw answers keyed by question_key
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_assessment_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL
    REFERENCES public.funnel_assessments(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  -- Flexible storage: use whichever column fits the answer type
  answer_json jsonb,      -- arrays, objects, multi-select
  answer_text text,       -- single-select text, free text
  answer_number numeric,  -- numeric values
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, question_key)
);

-- =====================
-- 5. FUNNEL_ASSESSMENT_PROFILES
--    Normalised derived profile from raw answers – used for scoring
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_assessment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL UNIQUE
    REFERENCES public.funnel_assessments(id) ON DELETE CASCADE,

  -- Full profile snapshot for audit / re-scoring
  profile_json jsonb NOT NULL DEFAULT '{}',

  -- Readiness tiers (1–5)
  endurance_level smallint CHECK (endurance_level BETWEEN 1 AND 5),
  terrain_readiness_level smallint CHECK (terrain_readiness_level BETWEEN 1 AND 5),
  stage_race_readiness_level smallint CHECK (stage_race_readiness_level BETWEEN 1 AND 5),
  pack_readiness_level smallint CHECK (pack_readiness_level BETWEEN 1 AND 5),
  heat_readiness_level smallint CHECK (heat_readiness_level BETWEEN 1 AND 5),

  budget_band text CHECK (budget_band IN ('under_500','500_1000','1000_2000','2000_3500','3500_plus')),
  travel_willingness_level smallint CHECK (travel_willingness_level BETWEEN 1 AND 4),
  life_constraint_level smallint CHECK (life_constraint_level BETWEEN 1 AND 5),
  risk_appetite_level smallint CHECK (risk_appetite_level BETWEEN 1 AND 3),
  mds_goal_timeline text CHECK (mds_goal_timeline IN ('within_12m','12_24m','2_plus_years','exploring')),

  -- Boolean flags for quick filtering / scoring
  has_marathon boolean,
  has_trail_marathon boolean,
  has_ultra boolean,
  has_multi_stage boolean,
  has_pack_experience boolean,
  can_train_4_plus_days boolean,
  can_do_back_to_back boolean,
  willing_heat_training boolean,
  prefers_lower_risk boolean,
  prefers_stage_race boolean,
  wants_desert_specificity boolean,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- 6. FUNNEL_ASSESSMENT_RACE_SCORES
--    Per-race scoring results for a completed assessment
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_assessment_race_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL
    REFERENCES public.funnel_assessments(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES public.funnel_races(id),

  is_hard_filtered boolean NOT NULL DEFAULT false,
  hard_filter_reasons_json jsonb,

  -- Component scores (0–100)
  endurance_fit_score numeric,
  terrain_fit_score numeric,
  stage_fit_score numeric,
  pack_fit_score numeric,
  heat_fit_score numeric,
  budget_fit_score numeric,
  travel_fit_score numeric,
  life_fit_score numeric,
  risk_fit_score numeric,
  mds_progression_fit_score numeric,

  -- Weighted total (0–100)
  total_score numeric,

  explanation_json jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(assessment_id, race_id)
);

-- =====================
-- 7. FUNNEL_ASSESSMENT_RESULTS
--    Final selected recommendations for a completed assessment
-- =====================
CREATE TABLE IF NOT EXISTS public.funnel_assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL UNIQUE
    REFERENCES public.funnel_assessments(id) ON DELETE CASCADE,
  primary_race_id uuid REFERENCES public.funnel_races(id),
  alternative_race_ids_json jsonb NOT NULL DEFAULT '[]',
  lower_risk_race_id uuid REFERENCES public.funnel_races(id),
  stretch_race_id uuid REFERENCES public.funnel_races(id),
  summary_json jsonb NOT NULL DEFAULT '{}',
  main_gaps_json jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_funnel_leads_email
  ON public.funnel_leads(email);
CREATE INDEX IF NOT EXISTS idx_funnel_assessments_lead_id
  ON public.funnel_assessments(lead_id);
CREATE INDEX IF NOT EXISTS idx_funnel_answers_assessment_id
  ON public.funnel_assessment_answers(assessment_id);
CREATE INDEX IF NOT EXISTS idx_funnel_race_scores_assessment_id
  ON public.funnel_assessment_race_scores(assessment_id);
CREATE INDEX IF NOT EXISTS idx_funnel_races_active
  ON public.funnel_races(is_active) WHERE is_active = true;

-- =====================
-- ROW LEVEL SECURITY
-- =====================
ALTER TABLE public.funnel_races ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_assessment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_assessment_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_assessment_race_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_assessment_results ENABLE ROW LEVEL SECURITY;

-- funnel_races: anyone can read active races
CREATE POLICY "funnel_races_public_read" ON public.funnel_races
  FOR SELECT USING (is_active = true);

-- funnel_leads: public (anon) can insert, no public read (PII)
CREATE POLICY "funnel_leads_anon_insert" ON public.funnel_leads
  FOR INSERT WITH CHECK (true);

-- funnel_assessments: public insert + read (UUID is unguessable)
CREATE POLICY "funnel_assessments_anon_insert" ON public.funnel_assessments
  FOR INSERT WITH CHECK (true);
CREATE POLICY "funnel_assessments_anon_update" ON public.funnel_assessments
  FOR UPDATE USING (true);
CREATE POLICY "funnel_assessments_public_read" ON public.funnel_assessments
  FOR SELECT USING (true);

-- funnel_assessment_answers: public insert + update (upsert pattern)
CREATE POLICY "funnel_answers_anon_insert" ON public.funnel_assessment_answers
  FOR INSERT WITH CHECK (true);
CREATE POLICY "funnel_answers_anon_update" ON public.funnel_assessment_answers
  FOR UPDATE USING (true);

-- funnel_assessment_profiles: public insert + update
CREATE POLICY "funnel_profiles_anon_insert" ON public.funnel_assessment_profiles
  FOR INSERT WITH CHECK (true);
CREATE POLICY "funnel_profiles_anon_update" ON public.funnel_assessment_profiles
  FOR UPDATE USING (true);

-- funnel_assessment_race_scores: public insert + read
CREATE POLICY "funnel_scores_anon_insert" ON public.funnel_assessment_race_scores
  FOR INSERT WITH CHECK (true);
CREATE POLICY "funnel_scores_public_read" ON public.funnel_assessment_race_scores
  FOR SELECT USING (true);

-- funnel_assessment_results: public insert + read
CREATE POLICY "funnel_results_anon_insert" ON public.funnel_assessment_results
  FOR INSERT WITH CHECK (true);
CREATE POLICY "funnel_results_public_read" ON public.funnel_assessment_results
  FOR SELECT USING (true);

-- Migration 030: Athlete Network analysis tables
--
-- al_entrant_profiles: a deduplicated "person" entity that groups multiple
--   race_results rows which likely belong to the same real individual.
--   Created by a human admin after reviewing probabilistic links.
--
-- al_entrant_links: stores pairwise probabilistic matches between race_results
--   rows, with signal flags (name, club, gender, age group) and an optional
--   manual confirmation. The pair is always stored with result_id_a < result_id_b
--   to prevent duplicate entries in either order.
--
-- Both tables are admin-only (no athlete/coach access).

-- ── al_entrant_profiles ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.al_entrant_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name      TEXT        NOT NULL,
  canonical_club    TEXT,
  gender            TEXT,
  entry_count       INTEGER     NOT NULL DEFAULT 0,
  race_count        INTEGER     NOT NULL DEFAULT 0,
  confidence_score  NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 1),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_al_profiles_name ON public.al_entrant_profiles(display_name);

ALTER TABLE public.al_entrant_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "al_profiles_admin_all" ON public.al_entrant_profiles
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_al_entrant_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS al_entrant_profiles_updated_at ON public.al_entrant_profiles;
CREATE TRIGGER al_entrant_profiles_updated_at
  BEFORE UPDATE ON public.al_entrant_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_al_entrant_profiles_updated_at();

-- ── al_entrant_links ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.al_entrant_links (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id_a           BIGINT      NOT NULL REFERENCES public.race_results(id) ON DELETE CASCADE,
  result_id_b           BIGINT      NOT NULL REFERENCES public.race_results(id) ON DELETE CASCADE,
  profile_id            UUID        REFERENCES public.al_entrant_profiles(id) ON DELETE SET NULL,
  -- Signal flags
  name_match            BOOLEAN     NOT NULL DEFAULT false,
  club_match            BOOLEAN     NOT NULL DEFAULT false,
  gender_match          BOOLEAN     NOT NULL DEFAULT false,
  age_group_consistent  BOOLEAN     NOT NULL DEFAULT false,
  -- Bayesian probability score (0–1)
  probability_score     NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (probability_score BETWEEN 0 AND 1),
  -- Manual review
  reviewed_at           TIMESTAMPTZ,
  confirmed_same        BOOLEAN,    -- null=unreviewed, true=confirmed, false=rejected
  reviewer_user_id      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Always store lower id first to prevent duplicate reverse-order pairs
  CONSTRAINT al_entrant_links_ordered CHECK (result_id_a < result_id_b),
  CONSTRAINT al_entrant_links_unique_pair UNIQUE (result_id_a, result_id_b)
);

CREATE INDEX IF NOT EXISTS idx_al_links_result_a    ON public.al_entrant_links(result_id_a);
CREATE INDEX IF NOT EXISTS idx_al_links_result_b    ON public.al_entrant_links(result_id_b);
CREATE INDEX IF NOT EXISTS idx_al_links_profile     ON public.al_entrant_links(profile_id);
CREATE INDEX IF NOT EXISTS idx_al_links_probability ON public.al_entrant_links(probability_score DESC);
CREATE INDEX IF NOT EXISTS idx_al_links_unreviewed  ON public.al_entrant_links(reviewed_at) WHERE reviewed_at IS NULL;

ALTER TABLE public.al_entrant_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "al_links_admin_all" ON public.al_entrant_links
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.set_al_entrant_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS al_entrant_links_updated_at ON public.al_entrant_links;
CREATE TRIGGER al_entrant_links_updated_at
  BEFORE UPDATE ON public.al_entrant_links
  FOR EACH ROW EXECUTE FUNCTION public.set_al_entrant_links_updated_at();

-- ── al_name_matches() — analysis function ────────────────────────────────────
--
-- Returns one row per distinct full_name that appears in more than one distinct
-- (race_id, result_year) combination, with signal flags and a probability score.
--
-- Probability formula (iteration 1 — will be refined as more signals are added):
--   0.60  base — exact name match is the grouping criterion
--  +0.25  single consistent non-empty club across all entries
--  +0.05  gender consistent across all entries
--  -0.20  gender inconsistent (strong signal of different people)
--  +0.05  age group consistent (≤2 distinct values — expected shift over years)
--  clamped to [0.05, 0.99]
--
-- SECURITY DEFINER so it can be called by the API route via service-role client
-- without requiring direct table access grants.

CREATE OR REPLACE FUNCTION public.al_name_matches()
RETURNS TABLE (
  full_name           TEXT,
  total_entries       BIGINT,
  distinct_races      BIGINT,
  distinct_years      BIGINT,
  years               INT[],
  distinct_clubs      BIGINT,
  sample_club         TEXT,
  gender              TEXT,
  distinct_genders    BIGINT,
  distinct_age_groups BIGINT,
  probability_score   NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH name_groups AS (
    SELECT
      rr.full_name,
      COUNT(*)                                                                   AS total_entries,
      COUNT(DISTINCT rr.race_id)                                                 AS distinct_races,
      COUNT(DISTINCT rr.result_year)                                             AS distinct_years,
      array_agg(DISTINCT rr.result_year ORDER BY rr.result_year)                 AS years,
      COUNT(DISTINCT NULLIF(COALESCE(
        rr.additional_data->>'Club',
        rr.additional_data->>'club'), ''))                                        AS distinct_clubs,
      MAX(NULLIF(COALESCE(
        rr.additional_data->>'Club',
        rr.additional_data->>'club'), ''))                                        AS sample_club,
      COUNT(DISTINCT CASE
        WHEN rr.gender IN ('Male', 'Men')               THEN 'Male'
        WHEN rr.gender IN ('Female', 'Women')           THEN 'Female'
        WHEN rr.gender IN ('Unknown', 'Not Specified')  THEN NULL
        ELSE rr.gender
      END)                                                                       AS distinct_genders,
      MAX(CASE
        WHEN rr.gender IN ('Male', 'Men')               THEN 'Male'
        WHEN rr.gender IN ('Female', 'Women')           THEN 'Female'
        WHEN rr.gender IN ('Unknown', 'Not Specified')  THEN NULL
        ELSE rr.gender
      END)                                                                       AS gender,
      COUNT(DISTINCT rr.age_group)                                               AS distinct_age_groups
    FROM race_results rr
    WHERE rr.full_name IS NOT NULL
      AND rr.full_name <> ''
      AND rr.full_name <> 'Anonymous'
    GROUP BY rr.full_name
    HAVING COUNT(DISTINCT rr.race_id) > 1
        OR COUNT(DISTINCT rr.result_year) > 1
  )
  SELECT
    ng.full_name,
    ng.total_entries,
    ng.distinct_races,
    ng.distinct_years,
    ng.years,
    ng.distinct_clubs,
    ng.sample_club,
    ng.gender,
    ng.distinct_genders,
    ng.distinct_age_groups,
    GREATEST(0.05, LEAST(0.99,
      0.60
      + CASE WHEN ng.distinct_clubs = 1 AND ng.sample_club IS NOT NULL THEN 0.25 ELSE 0 END
      + CASE WHEN ng.distinct_genders = 1 THEN 0.05 ELSE -0.20 END
      + CASE WHEN ng.distinct_age_groups <= 2 THEN 0.05 ELSE 0 END
    ))::NUMERIC(4,3)                                                              AS probability_score
  FROM name_groups ng
  ORDER BY ng.distinct_races DESC, ng.total_entries DESC;
$$;

-- Grant execute to authenticated users; the route still enforces admin-role check
GRANT EXECUTE ON FUNCTION public.al_name_matches() TO authenticated;

-- ── al_network_stats() — lightweight overview counts ─────────────────────────

CREATE OR REPLACE FUNCTION public.al_network_stats()
RETURNS TABLE (
  total_results       BIGINT,
  names_multi_entry   BIGINT,
  names_multi_race    BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM race_results)                                   AS total_results,
    (
      SELECT COUNT(*) FROM (
        SELECT full_name
        FROM race_results
        WHERE full_name IS NOT NULL AND full_name <> '' AND full_name <> 'Anonymous'
        GROUP BY full_name
        HAVING COUNT(*) > 1
      ) sub
    )                                                                      AS names_multi_entry,
    (
      SELECT COUNT(*) FROM (
        SELECT full_name
        FROM race_results
        WHERE full_name IS NOT NULL AND full_name <> '' AND full_name <> 'Anonymous'
        GROUP BY full_name
        HAVING COUNT(DISTINCT race_id) > 1
      ) sub
    )                                                                      AS names_multi_race;
$$;

GRANT EXECUTE ON FUNCTION public.al_network_stats() TO authenticated;

-- Migration 033: Club/Team field normalisation + probability fix
--
-- al_extract_club(ad JSONB) — canonical club extractor.
-- Checks all known field names used across imported race results:
--   Club  (Marathon Eryri, Windermere, Beachy Head, etc.)
--   club  (Marathon Eryri lowercase variant)
--   Team  (Lakeland 50, Dragon's Back, UTS, Arc of Attrition)
--   team  (lowercase variant)
--   club_team    (Lake District Ultra Challenge)
--   club_company (Jurassic Coast)
-- Returns NULL if no non-empty value is found.

CREATE OR REPLACE FUNCTION public.al_extract_club(ad JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(TRIM(COALESCE(
    NULLIF(TRIM(ad->>'Club'),         ''),
    NULLIF(TRIM(ad->>'club'),         ''),
    NULLIF(TRIM(ad->>'Team'),         ''),
    NULLIF(TRIM(ad->>'team'),         ''),
    NULLIF(TRIM(ad->>'club_team'),    ''),
    NULLIF(TRIM(ad->>'club_company'), '')
  )), '');
$$;

GRANT EXECUTE ON FUNCTION public.al_extract_club(JSONB) TO authenticated;

-- Rebuild al_name_matches() with:
--   1. al_extract_club() for all club lookups
--   2. entries_with_club count — club bonus only when 2+ entries share the same club
--      (a single mention is not confirmatory and was previously inflating scores)
DROP FUNCTION IF EXISTS public.al_name_matches();

CREATE FUNCTION public.al_name_matches()
RETURNS TABLE (
  full_name           TEXT,
  total_entries       BIGINT,
  distinct_races      BIGINT,
  distinct_years      BIGINT,
  years               INT[],
  distinct_clubs      BIGINT,
  entries_with_club   BIGINT,
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
      COUNT(*)                                                             AS total_entries,
      COUNT(DISTINCT rr.race_id)                                           AS distinct_races,
      COUNT(DISTINCT rr.result_year)                                       AS distinct_years,
      array_agg(DISTINCT rr.result_year ORDER BY rr.result_year)           AS years,
      COUNT(DISTINCT al_extract_club(rr.additional_data))                  AS distinct_clubs,
      COUNT(al_extract_club(rr.additional_data))                           AS entries_with_club,
      MAX(al_extract_club(rr.additional_data))                             AS sample_club,
      COUNT(DISTINCT CASE
        WHEN rr.gender IN ('Male','Men')               THEN 'Male'
        WHEN rr.gender IN ('Female','Women')           THEN 'Female'
        WHEN rr.gender IN ('Unknown','Not Specified')  THEN NULL
        ELSE rr.gender
      END)                                                                 AS distinct_genders,
      MAX(CASE
        WHEN rr.gender IN ('Male','Men')               THEN 'Male'
        WHEN rr.gender IN ('Female','Women')           THEN 'Female'
        WHEN rr.gender IN ('Unknown','Not Specified')  THEN NULL
        ELSE rr.gender
      END)                                                                 AS gender,
      COUNT(DISTINCT rr.age_group)                                         AS distinct_age_groups
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
    ng.entries_with_club,
    ng.sample_club,
    ng.gender,
    ng.distinct_genders,
    ng.distinct_age_groups,
    GREATEST(0.05, LEAST(0.99,
      0.60
      + CASE WHEN ng.distinct_clubs = 1 AND ng.entries_with_club >= 2 THEN 0.25 ELSE 0 END
      + CASE WHEN ng.distinct_genders = 1 THEN 0.05 ELSE -0.20 END
      + CASE WHEN ng.distinct_age_groups <= 2 THEN 0.05 ELSE 0 END
    ))::NUMERIC(4,3)                                                       AS probability_score
  FROM name_groups ng
  ORDER BY ng.distinct_races DESC, ng.total_entries DESC;
$$;

GRANT EXECUTE ON FUNCTION public.al_name_matches() TO authenticated;

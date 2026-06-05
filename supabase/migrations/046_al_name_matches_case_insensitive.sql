-- Migration 046: Case-insensitive name grouping in al_name_matches()
--
-- Previously grouped by exact full_name, so "Philip Padfield" and "Philip PADFIELD"
-- (same person, different race capitalising the surname) appeared as separate rows.
-- Now groups by LOWER(full_name) and returns an INITCAP-normalised display name.
-- The entrant-entries API is updated separately to use ILIKE for the lookup.

DROP FUNCTION IF EXISTS public.al_name_matches();

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
      INITCAP(LOWER(MIN(rr.full_name)))                                            AS full_name,
      COUNT(*)                                                                      AS total_entries,
      COUNT(DISTINCT rr.race_id)                                                   AS distinct_races,
      COUNT(DISTINCT rr.result_year)                                               AS distinct_years,
      array_agg(DISTINCT rr.result_year ORDER BY rr.result_year)                  AS years,
      COUNT(DISTINCT NULLIF(COALESCE(
        rr.additional_data->>'Club',
        rr.additional_data->>'club'), ''))                                         AS distinct_clubs,
      MAX(NULLIF(COALESCE(
        rr.additional_data->>'Club',
        rr.additional_data->>'club'), ''))                                         AS sample_club,
      COUNT(DISTINCT CASE
        WHEN rr.gender IN ('Male', 'Men')              THEN 'Male'
        WHEN rr.gender IN ('Female', 'Women')          THEN 'Female'
        WHEN rr.gender IN ('Unknown', 'Not Specified') THEN NULL
        ELSE rr.gender
      END)                                                                         AS distinct_genders,
      MAX(CASE
        WHEN rr.gender IN ('Male', 'Men')              THEN 'Male'
        WHEN rr.gender IN ('Female', 'Women')          THEN 'Female'
        WHEN rr.gender IN ('Unknown', 'Not Specified') THEN NULL
        ELSE rr.gender
      END)                                                                         AS gender,
      COUNT(DISTINCT rr.age_group)                                                 AS distinct_age_groups
    FROM race_results rr
    WHERE rr.full_name IS NOT NULL
      AND rr.full_name <> ''
      AND LOWER(rr.full_name) <> 'anonymous'
    GROUP BY LOWER(rr.full_name)
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
    ))::NUMERIC(4,3)                                                               AS probability_score
  FROM name_groups ng
  ORDER BY ng.distinct_races DESC, ng.total_entries DESC;
$$;

GRANT EXECUTE ON FUNCTION public.al_name_matches() TO authenticated;

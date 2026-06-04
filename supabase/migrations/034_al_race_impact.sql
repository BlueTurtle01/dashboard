-- Migration 034: Race impact analysis data function
--
-- al_race_impact_data(race_a_id, race_b_id) returns all Race B results with
-- a boolean flag indicating whether the athlete (by exact name match) also
-- completed Race A in an equal-or-earlier year.
-- All statistical computation (Mann-Whitney U, Fisher's exact) is done
-- in the API layer (TypeScript) for flexibility.

CREATE OR REPLACE FUNCTION public.al_race_impact_data(
  p_race_a_id UUID,
  p_race_b_id UUID
)
RETURNS TABLE (
  result_status     TEXT,
  finish_seconds    INT,
  result_year       INT,
  did_race_a_before BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH race_a_names AS (
    SELECT full_name, MIN(result_year) AS first_year_a
    FROM race_results
    WHERE race_id = p_race_a_id
      AND full_name IS NOT NULL AND full_name <> '' AND full_name <> 'Anonymous'
    GROUP BY full_name
  )
  SELECT
    rr.result_status,
    rr.finish_seconds,
    rr.result_year,
    (ra.full_name IS NOT NULL AND ra.first_year_a <= rr.result_year) AS did_race_a_before
  FROM race_results rr
  LEFT JOIN race_a_names ra ON ra.full_name = rr.full_name
  WHERE rr.race_id = p_race_b_id
    AND rr.full_name IS NOT NULL
    AND rr.full_name <> ''
    AND rr.full_name <> 'Anonymous';
$$;

GRANT EXECUTE ON FUNCTION public.al_race_impact_data(UUID, UUID) TO authenticated;

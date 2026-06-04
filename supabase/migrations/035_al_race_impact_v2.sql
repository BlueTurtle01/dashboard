-- Migration 035: Race impact data function v2
-- Adds is_first_race_b and athlete_race_count to support:
--   1. First-time-only filter (reduces "casual repeat runner" confound)
--   2. Experience differential display (quantifies confounding directly)

DROP FUNCTION IF EXISTS public.al_race_impact_data(UUID, UUID);

CREATE FUNCTION public.al_race_impact_data(p_race_a_id UUID, p_race_b_id UUID)
RETURNS TABLE (
  result_status      TEXT,
  finish_seconds     INT,
  result_year        INT,
  did_race_a_before  BOOLEAN,
  is_first_race_b    BOOLEAN,
  athlete_race_count BIGINT
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
  ),
  race_b_first_year AS (
    SELECT full_name, MIN(result_year) AS first_year_b
    FROM race_results
    WHERE race_id = p_race_b_id
      AND full_name IS NOT NULL AND full_name <> ''
    GROUP BY full_name
  ),
  athlete_race_counts AS (
    SELECT full_name, COUNT(DISTINCT race_id) AS race_count
    FROM race_results
    WHERE full_name IS NOT NULL AND full_name <> '' AND full_name <> 'Anonymous'
    GROUP BY full_name
  )
  SELECT
    rr.result_status,
    rr.finish_seconds,
    rr.result_year,
    (ra.full_name IS NOT NULL AND ra.first_year_a <= rr.result_year) AS did_race_a_before,
    (rr.result_year = rbf.first_year_b)                              AS is_first_race_b,
    COALESCE(arc.race_count, 1)                                      AS athlete_race_count
  FROM race_results rr
  LEFT JOIN race_a_names ra        ON ra.full_name  = rr.full_name
  LEFT JOIN race_b_first_year rbf  ON rbf.full_name = rr.full_name
  LEFT JOIN athlete_race_counts arc ON arc.full_name = rr.full_name
  WHERE rr.race_id = p_race_b_id
    AND rr.full_name IS NOT NULL
    AND rr.full_name <> ''
    AND rr.full_name <> 'Anonymous';
$$;

GRANT EXECUTE ON FUNCTION public.al_race_impact_data(UUID, UUID) TO authenticated;

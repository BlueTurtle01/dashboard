-- Migration 040: Per-finisher data for experience-vs-finish-time correlation analysis.
--
-- al_race_correlation_data(p_race_id) returns one row per finisher with:
--   finish_seconds, result_year, athlete_race_count (all races in DB),
--   experience_years (result_year - first ever race year in DB),
--   first_race_year.
--
-- Statistical computation (Pearson r, regression, prediction intervals) is done
-- in the API layer (TypeScript) for flexibility.

CREATE OR REPLACE FUNCTION public.al_race_correlation_data(p_race_id UUID)
RETURNS TABLE (
  full_name          TEXT,
  finish_seconds     INT,
  result_year        INT,
  athlete_race_count BIGINT,
  experience_years   INT,
  first_race_year    INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH all_first_years AS (
  SELECT full_name, MIN(result_year) AS first_year
  FROM race_results
  WHERE full_name IS NOT NULL
    AND full_name <> ''
    AND full_name <> 'Anonymous'
  GROUP BY full_name
),
race_counts AS (
  SELECT full_name, COUNT(DISTINCT race_id) AS race_count
  FROM race_results
  WHERE full_name IS NOT NULL
    AND full_name <> ''
    AND full_name <> 'Anonymous'
    AND result_status IN ('FINISHED', 'UNKNOWN')
  GROUP BY full_name
)
SELECT
  rr.full_name,
  rr.finish_seconds,
  rr.result_year,
  COALESCE(rc.race_count, 1)                        AS athlete_race_count,
  GREATEST(0, rr.result_year - fy.first_year)::INT  AS experience_years,
  fy.first_year::INT                                AS first_race_year
FROM race_results rr
JOIN all_first_years fy ON fy.full_name = rr.full_name
LEFT JOIN race_counts rc ON rc.full_name = rr.full_name
WHERE rr.race_id = p_race_id
  AND rr.result_status = 'FINISHED'
  AND rr.finish_seconds IS NOT NULL
  AND rr.full_name IS NOT NULL
  AND rr.full_name <> ''
  AND rr.full_name <> 'Anonymous'
ORDER BY rr.finish_seconds;
$$;

GRANT EXECUTE ON FUNCTION public.al_race_correlation_data(UUID) TO authenticated;

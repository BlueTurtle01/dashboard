-- get_race_result_years()
-- Returns one row per (race, year) pair: the year and how many results are stored.
-- Used by the admin race-files page to show stored result summaries per race.
CREATE OR REPLACE FUNCTION get_race_result_years()
RETURNS TABLE (race_id uuid, result_year int, row_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rr.race_id,
    rr.result_year,
    COUNT(*) AS row_count
  FROM race_results rr
  GROUP BY rr.race_id, rr.result_year
  ORDER BY rr.race_id, rr.result_year DESC;
$$;

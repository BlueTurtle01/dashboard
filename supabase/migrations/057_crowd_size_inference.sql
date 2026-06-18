-- get_latest_year_entrant_counts()
-- Returns one row per race: the most recent year that has results and the
-- total number of entries (starters + DNF + DNS) for that year.
-- Used to infer the crowd_size characteristic via percentile binning in JS.
CREATE OR REPLACE FUNCTION get_latest_year_entrant_counts()
RETURNS TABLE (race_id uuid, latest_year int, entrant_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH yearly AS (
    SELECT
      rr.race_id,
      rr.result_year,
      COUNT(*) AS cnt
    FROM race_results rr
    GROUP BY rr.race_id, rr.result_year
  ),
  latest AS (
    SELECT y.race_id, MAX(y.result_year) AS max_year
    FROM yearly y
    GROUP BY y.race_id
  )
  SELECT y.race_id, y.result_year AS latest_year, y.cnt AS entrant_count
  FROM yearly y
  JOIN latest l ON y.race_id = l.race_id AND y.result_year = l.max_year;
$$;

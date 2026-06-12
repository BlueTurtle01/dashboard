-- get_race_field_stats(p_race_id uuid) → json
-- Returns year-by-year, gender split, percentiles, and finish-time distribution
-- for a single race.  All aggregations run in Postgres to avoid the PostgREST
-- 1,000-row default cap that would truncate races with large result sets.
CREATE OR REPLACE FUNCTION get_race_field_stats(p_race_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_year     json;
  v_by_gender   json;
  v_percentiles json;
  v_dist        json;
  v_min_s       float;
  v_max_s       float;
BEGIN
  -- Year-by-year breakdown
  SELECT COALESCE(json_agg(r ORDER BY r.year DESC), '[]'::json) INTO v_by_year
  FROM (
    SELECT
      result_year AS year,
      COUNT(*) FILTER (WHERE finish_seconds > 0 AND result_status != 'DNF')::int AS finishers,
      COUNT(*)::int AS starters,
      ROUND(
        COUNT(*) FILTER (WHERE result_status = 'DNF')::numeric /
        NULLIF(COUNT(*), 0), 4
      )::float AS dnf_rate,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY finish_seconds)
        FILTER (WHERE finish_seconds > 0 AND result_status != 'DNF') AS median_seconds
    FROM race_results
    WHERE race_id = p_race_id
    GROUP BY result_year
  ) r;

  -- Gender split
  SELECT COALESCE(json_agg(g ORDER BY g.count DESC), '[]'::json) INTO v_by_gender
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(gender), ''), 'Unknown') AS gender,
      COUNT(*)::int AS count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY finish_seconds) AS median_seconds
    FROM race_results
    WHERE race_id = p_race_id
      AND finish_seconds > 0
      AND result_status != 'DNF'
    GROUP BY COALESCE(NULLIF(TRIM(gender), ''), 'Unknown')
    HAVING COUNT(*) > 0
  ) g;

  -- Percentiles across all years
  SELECT row_to_json(p) INTO v_percentiles
  FROM (
    SELECT
      PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY finish_seconds) AS p10,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY finish_seconds) AS p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY finish_seconds) AS p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY finish_seconds) AS p75,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY finish_seconds) AS p90,
      MIN(finish_seconds) AS fastest
    FROM race_results
    WHERE race_id = p_race_id
      AND result_status != 'DNF'
      AND finish_seconds > 0
  ) p;

  -- Bounds for distribution buckets
  SELECT
    MIN(finish_seconds)::float,
    GREATEST(MAX(finish_seconds)::float, MIN(finish_seconds)::float + 1)
  INTO v_min_s, v_max_s
  FROM race_results
  WHERE race_id = p_race_id
    AND result_status != 'DNF'
    AND finish_seconds > 0;

  -- Finish-time distribution: 20 equal-width buckets
  IF v_min_s IS NOT NULL THEN
    SELECT json_agg(
      json_build_object(
        'min_min', ROUND((v_min_s + (n - 1) * (v_max_s - v_min_s) / 20.0) / 60.0),
        'max_min', ROUND((v_min_s + n         * (v_max_s - v_min_s) / 20.0) / 60.0),
        'count',   COALESCE(c.cnt, 0)
      )
      ORDER BY n
    ) INTO v_dist
    FROM generate_series(1, 20) AS n
    LEFT JOIN (
      SELECT
        LEAST(width_bucket(finish_seconds::float, v_min_s, v_max_s + 0.001, 20), 20) AS bkt,
        COUNT(*)::int AS cnt
      FROM race_results
      WHERE race_id = p_race_id
        AND result_status != 'DNF'
        AND finish_seconds > 0
      GROUP BY bkt
    ) c ON c.bkt = n;
  ELSE
    v_dist := '[]'::json;
  END IF;

  RETURN json_build_object(
    'by_year',      v_by_year,
    'by_gender',    v_by_gender,
    'percentiles',  v_percentiles,
    'distribution', v_dist
  );
END;
$$;

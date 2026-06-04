-- Migration 031: Race path analysis function
--
-- al_race_paths() returns every ordered pair of races (A → B) where at least
-- 2 athletes completed both, with A done in an earlier year than B.
-- Same-year pairs are canonicalised by race UUID to avoid double-counting.
-- Only FINISHED / UNKNOWN results are counted.

CREATE OR REPLACE FUNCTION public.al_race_paths()
RETURNS TABLE (
  race_a_id       UUID,
  race_a_name     TEXT,
  race_b_id       UUID,
  race_b_name     TEXT,
  pair_count      BIGINT,
  race_a_total    BIGINT,
  probability     NUMERIC,
  avg_year_gap    NUMERIC,
  same_year_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH athlete_first_year AS (
    SELECT
      rr.full_name,
      rr.race_id,
      r.name  AS race_name,
      MIN(rr.result_year) AS first_year
    FROM race_results rr
    JOIN races r ON r.id = rr.race_id
    WHERE rr.full_name IS NOT NULL
      AND rr.full_name <> ''
      AND rr.full_name <> 'Anonymous'
      AND rr.result_status IN ('FINISHED', 'UNKNOWN')
    GROUP BY rr.full_name, rr.race_id, r.name
  ),
  race_a_counts AS (
    SELECT race_id, COUNT(DISTINCT full_name) AS total_athletes
    FROM athlete_first_year
    GROUP BY race_id
  ),
  ordered_pairs AS (
    SELECT
      a.race_id    AS race_a_id,
      a.race_name  AS race_a_name,
      a.first_year AS year_a,
      b.race_id    AS race_b_id,
      b.race_name  AS race_b_name,
      b.first_year AS year_b,
      a.full_name
    FROM athlete_first_year a
    JOIN athlete_first_year b
      ON  a.full_name = b.full_name
      AND a.race_id  <> b.race_id
      AND (
        a.first_year < b.first_year
        OR (a.first_year = b.first_year AND a.race_id < b.race_id)
      )
  )
  SELECT
    op.race_a_id,
    op.race_a_name,
    op.race_b_id,
    op.race_b_name,
    COUNT(DISTINCT op.full_name)                                             AS pair_count,
    rac.total_athletes                                                       AS race_a_total,
    (COUNT(DISTINCT op.full_name)::NUMERIC / rac.total_athletes)::NUMERIC(5,4)
                                                                             AS probability,
    ROUND(AVG(op.year_b - op.year_a), 1)                                    AS avg_year_gap,
    COUNT(DISTINCT op.full_name) FILTER (WHERE op.year_a = op.year_b)       AS same_year_count
  FROM ordered_pairs op
  JOIN race_a_counts rac ON rac.race_id = op.race_a_id
  GROUP BY op.race_a_id, op.race_a_name, op.race_b_id, op.race_b_name, rac.total_athletes
  HAVING COUNT(DISTINCT op.full_name) >= 2
  ORDER BY COUNT(DISTINCT op.full_name) DESC, op.race_a_name, op.race_b_name;
$$;

GRANT EXECUTE ON FUNCTION public.al_race_paths() TO authenticated;

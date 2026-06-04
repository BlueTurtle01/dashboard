-- Migration 039: GMM clustering support for experience-adjusted sequence analysis
--
-- al_athlete_career_features() — per-athlete career span + race count, used as
-- GMM clustering inputs in the TypeScript layer.
--
-- al_race_sequences_full(p_min_length, p_max_length) — same as al_race_sequences
-- but adds athlete_names TEXT[] so the API can look up cluster assignments.

-- ── al_athlete_career_features ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.al_athlete_career_features()
RETURNS TABLE (
  full_name          TEXT,
  career_span_years  INT,
  distinct_race_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    arm.full_name,
    (MAX(arm.first_year) - MIN(arm.first_year))::INT AS career_span_years,
    COUNT(DISTINCT arm.race_id)                       AS distinct_race_count
  FROM (
    SELECT full_name, race_id, MIN(result_year) AS first_year
    FROM race_results
    WHERE full_name IS NOT NULL
      AND full_name <> ''
      AND full_name <> 'Anonymous'
      AND result_status IN ('FINISHED', 'UNKNOWN')
    GROUP BY full_name, race_id
  ) arm
  GROUP BY arm.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.al_athlete_career_features() TO authenticated;


-- ── al_race_sequences_full ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.al_race_sequences_full(
  p_min_length INT DEFAULT 2,
  p_max_length INT DEFAULT 6
)
RETURNS TABLE (
  path_names          TEXT[],
  path_length         INT,
  athlete_count       BIGINT,
  race_a_total        BIGINT,
  probability         NUMERIC,
  avg_span_years      NUMERIC,
  athlete_names       TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH RECURSIVE
arm AS (
  SELECT rr.full_name, rr.race_id, r.name AS race_name, MIN(rr.result_year) AS first_year
  FROM race_results rr JOIN races r ON r.id = rr.race_id
  WHERE rr.full_name IS NOT NULL AND rr.full_name <> '' AND rr.full_name <> 'Anonymous'
    AND rr.result_status IN ('FINISHED', 'UNKNOWN')
  GROUP BY rr.full_name, rr.race_id, r.name
),
multi AS (
  SELECT full_name FROM arm GROUP BY full_name
  HAVING COUNT(DISTINCT race_id) >= GREATEST($1, 2)
),
fa AS (SELECT arm.* FROM arm JOIN multi USING (full_name)),
race_totals AS (SELECT race_id, COUNT(DISTINCT full_name) AS total FROM arm GROUP BY race_id),
seq(full_name, p_ids, p_names, start_race_id, start_yr, last_yr, last_id, depth) AS (
  SELECT full_name, ARRAY[race_id]::UUID[], ARRAY[race_name]::TEXT[],
         race_id, first_year, first_year, race_id, 1
  FROM fa
  UNION ALL
  SELECT s.full_name, s.p_ids || a.race_id, s.p_names || a.race_name,
         s.start_race_id, s.start_yr, a.first_year, a.race_id, s.depth + 1
  FROM seq s JOIN fa a
    ON  s.full_name = a.full_name
    AND NOT (a.race_id = ANY(s.p_ids))
    AND (a.first_year > s.last_yr OR (a.first_year = s.last_yr AND a.race_id > s.last_id))
  WHERE s.depth < $2
),
agg AS (
  SELECT s.p_names, s.p_ids[1] AS race_a_id, s.depth AS plen,
         COUNT(DISTINCT s.full_name)        AS n,
         AVG(s.last_yr - s.start_yr)        AS span,
         ARRAY_AGG(DISTINCT s.full_name)    AS names
  FROM seq s
  WHERE s.depth >= $1
  GROUP BY s.p_names, s.p_ids[1], s.depth
  HAVING COUNT(DISTINCT s.full_name) >= 2
)
SELECT agg.p_names, agg.plen, agg.n, rt.total,
       (agg.n::NUMERIC / rt.total)::NUMERIC(6,5),
       ROUND(agg.span::NUMERIC, 1),
       agg.names
FROM agg JOIN race_totals rt ON rt.race_id = agg.race_a_id
ORDER BY agg.n DESC, agg.plen DESC, agg.p_names;
$$;

GRANT EXECUTE ON FUNCTION public.al_race_sequences_full(INT, INT) TO authenticated;

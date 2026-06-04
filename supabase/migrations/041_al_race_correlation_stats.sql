-- Migration 041: Aggregated correlation stats computed fully in SQL.
--
-- al_race_correlation_stats(p_race_id) returns a single row with Pearson r,
-- OLS regression params, per-band quantiles, and a scatter sample — all
-- computed in PostgreSQL so no raw finisher rows are transferred to the API.
-- Replaces the TypeScript computation that was hitting the 1,000-row RPC cap.

CREATE OR REPLACE FUNCTION public.al_race_correlation_stats(p_race_id UUID)
RETURNS TABLE (
  n_finishers      BIGINT,
  pearson_years_r  NUMERIC,
  pearson_count_r  NUMERIC,
  reg_slope        NUMERIC,
  reg_intercept    NUMERIC,
  reg_r_squared    NUMERIC,
  reg_residual_se  NUMERIC,
  reg_x_mean       NUMERIC,
  reg_x_sum_sq     NUMERIC,
  reg_n            BIGINT,
  bands_json       JSONB,
  scatter_json     JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH all_first_years AS (
  SELECT full_name, MIN(result_year) AS first_year
  FROM race_results
  WHERE full_name IS NOT NULL AND full_name <> '' AND full_name <> 'Anonymous'
  GROUP BY full_name
),
race_counts AS (
  SELECT full_name, COUNT(DISTINCT race_id) AS race_count
  FROM race_results
  WHERE full_name IS NOT NULL AND full_name <> '' AND full_name <> 'Anonymous'
    AND result_status IN ('FINISHED', 'UNKNOWN')
  GROUP BY full_name
),
base AS (
  SELECT
    GREATEST(0, rr.result_year - fy.first_year)::INT AS experience_years,
    rr.finish_seconds,
    COALESCE(rc.race_count, 1)                        AS athlete_race_count
  FROM race_results rr
  JOIN all_first_years fy ON fy.full_name = rr.full_name
  LEFT JOIN race_counts rc ON rc.full_name = rr.full_name
  WHERE rr.race_id = p_race_id
    AND rr.result_status = 'FINISHED'
    AND rr.finish_seconds IS NOT NULL
    AND rr.full_name IS NOT NULL AND rr.full_name <> '' AND rr.full_name <> 'Anonymous'
),
stats AS (
  SELECT
    COUNT(*)                                                                                 AS n_fin,
    corr(finish_seconds::float, experience_years::float)                                    AS r_years,
    corr(finish_seconds::float, athlete_race_count::float)                                  AS r_count,
    regr_slope(finish_seconds::float, experience_years::float)                              AS slope,
    regr_intercept(finish_seconds::float, experience_years::float)                          AS intercept,
    regr_r2(finish_seconds::float, experience_years::float)                                 AS r2,
    regr_avgx(finish_seconds::float, experience_years::float)                               AS x_mean,
    regr_sxx(finish_seconds::float, experience_years::float)                                AS x_sum_sq,
    regr_count(finish_seconds::float, experience_years::float)                              AS reg_n,
    SQRT(
      NULLIF(regr_syy(finish_seconds::float, experience_years::float), 0) *
      GREATEST(0.0, 1.0 - COALESCE(regr_r2(finish_seconds::float, experience_years::float), 0.0)) /
      NULLIF(regr_count(finish_seconds::float, experience_years::float) - 2, 0)
    )                                                                                        AS residual_se
  FROM base
),
band_data AS (
  SELECT
    CASE
      WHEN experience_years = 0 THEN 0
      WHEN experience_years <= 2 THEN 1
      WHEN experience_years <= 5 THEN 2
      WHEN experience_years <= 9 THEN 3
      ELSE 4
    END AS band_id,
    finish_seconds
  FROM base
),
band_stats AS (
  SELECT
    band_id,
    CASE band_id
      WHEN 0 THEN 'Debut (0 yr)' WHEN 1 THEN '1–2 years'
      WHEN 2 THEN '3–5 years'    WHEN 3 THEN '6–9 years'
      ELSE '10+ years'
    END                                                                                      AS label,
    CASE band_id WHEN 0 THEN 0 WHEN 1 THEN 1 WHEN 2 THEN 3 WHEN 3 THEN 6 ELSE 10 END      AS min_yrs,
    CASE band_id WHEN 0 THEN 0 WHEN 1 THEN 2 WHEN 2 THEN 5 WHEN 3 THEN 9 ELSE 9999 END    AS max_yrs,
    COUNT(*)                                                                                 AS n,
    ROUND(percentile_cont(0.10) WITHIN GROUP (ORDER BY finish_seconds))::INT                AS p10,
    ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY finish_seconds))::INT                AS p25,
    ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY finish_seconds))::INT                AS p50,
    ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY finish_seconds))::INT                AS p75,
    ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY finish_seconds))::INT                AS p90
  FROM band_data
  GROUP BY band_id
  HAVING COUNT(*) >= 3
),
scatter_numbered AS (
  SELECT
    experience_years,
    finish_seconds,
    ROW_NUMBER() OVER (ORDER BY finish_seconds)  AS rn,
    COUNT(*) OVER ()                              AS total
  FROM base
),
scatter_sample AS (
  SELECT experience_years AS x, finish_seconds AS y
  FROM scatter_numbered
  WHERE rn % GREATEST(1, CEIL(total::float / 600)::INT) = 0
  LIMIT 600
)
SELECT
  s.n_fin,
  ROUND(s.r_years::NUMERIC, 4),
  ROUND(s.r_count::NUMERIC, 4),
  ROUND(s.slope::NUMERIC, 2),
  ROUND(s.intercept::NUMERIC, 2),
  ROUND(s.r2::NUMERIC, 4),
  ROUND(s.residual_se::NUMERIC, 2),
  ROUND(s.x_mean::NUMERIC, 2),
  ROUND(s.x_sum_sq::NUMERIC, 2),
  s.reg_n::BIGINT,
  (SELECT jsonb_agg(
     jsonb_build_object(
       'label', label, 'min_years', min_yrs, 'max_years', max_yrs,
       'n', n, 'p10', p10, 'p25', p25, 'p50', p50, 'p75', p75, 'p90', p90
     ) ORDER BY min_yrs
   ) FROM band_stats),
  (SELECT jsonb_agg(jsonb_build_object('x', x, 'y', y)) FROM scatter_sample)
FROM stats s;
$$;

GRANT EXECUTE ON FUNCTION public.al_race_correlation_stats(UUID) TO authenticated;

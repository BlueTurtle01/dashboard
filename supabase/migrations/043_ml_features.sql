-- Migration 043: Tables for ML finish-time prediction pipeline.
--
-- race_ml_features — per-race aggregate statistics refreshed after each import.
--   Populated by python/race_features.py (or the refresh function below).
--
-- ml_predictions — pre-computed quantile predictions per (athlete, race).
--   Written by python/predict.py; read by the Next.js API.

-- ── race_ml_features ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.race_ml_features (
  race_id               UUID        PRIMARY KEY REFERENCES races(id) ON DELETE CASCADE,
  field_median_seconds  INT,
  field_p25_seconds     INT,
  field_p75_seconds     INT,
  dnf_rate              NUMERIC(6,4),
  years_of_data         INT,
  total_finishers       INT,
  total_starters        INT,
  -- HDBSCAN cluster assignment (written by Python)
  cluster_id            INT,
  cluster_label         TEXT,
  -- UMAP 2-D coordinates for visualisation (written by Python)
  umap_x                NUMERIC(8,4),
  umap_y                NUMERIC(8,4),
  computed_at           TIMESTAMPTZ DEFAULT now()
);

-- ── ml_predictions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ml_predictions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_key               TEXT        NOT NULL,   -- full_name (probabilistic match key)
  race_id                   UUID        NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  -- Quantile predictions in seconds
  p10_seconds               INT,
  p50_seconds               INT,
  p90_seconds               INT,
  -- Physics baseline for comparison
  riegel_predicted_seconds  INT,
  -- Feature snapshot for auditability
  features_json             JSONB       DEFAULT '{}',
  model_version             TEXT        NOT NULL,
  computed_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ml_predictions_athlete_key_idx ON public.ml_predictions (athlete_key);
CREATE INDEX IF NOT EXISTS ml_predictions_race_id_idx     ON public.ml_predictions (race_id);
CREATE INDEX IF NOT EXISTS ml_predictions_model_ver_idx   ON public.ml_predictions (model_version);

-- ── Aggregate refresh function ────────────────────────────────────────────────
--
-- Call after each results import to keep race_ml_features up to date.
-- Safe to run multiple times; upserts the aggregate stats, leaves
-- cluster_id / umap_x / umap_y untouched (those are written by Python).

CREATE OR REPLACE FUNCTION public.refresh_race_ml_features()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
INSERT INTO race_ml_features (
  race_id, field_median_seconds, field_p25_seconds, field_p75_seconds,
  dnf_rate, years_of_data, total_finishers, total_starters
)
SELECT
  rr.race_id,
  ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY rr.finish_seconds))::INT,
  ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY rr.finish_seconds))::INT,
  ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY rr.finish_seconds))::INT,
  ROUND(
    SUM(CASE WHEN rr.result_status = 'DNF' THEN 1 ELSE 0 END)::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE rr.result_status IN ('FINISHED','UNKNOWN','DNF')), 0),
    4
  ),
  COUNT(DISTINCT rr.result_year),
  COUNT(*) FILTER (WHERE rr.result_status IN ('FINISHED','UNKNOWN') AND rr.finish_seconds IS NOT NULL),
  COUNT(*) FILTER (WHERE rr.result_status IN ('FINISHED','UNKNOWN','DNF'))
FROM race_results rr
WHERE rr.full_name IS NOT NULL AND rr.full_name <> '' AND rr.full_name <> 'Anonymous'
GROUP BY rr.race_id
ON CONFLICT (race_id) DO UPDATE SET
  field_median_seconds = EXCLUDED.field_median_seconds,
  field_p25_seconds    = EXCLUDED.field_p25_seconds,
  field_p75_seconds    = EXCLUDED.field_p75_seconds,
  dnf_rate             = EXCLUDED.dnf_rate,
  years_of_data        = EXCLUDED.years_of_data,
  total_finishers      = EXCLUDED.total_finishers,
  total_starters       = EXCLUDED.total_starters,
  computed_at          = now();
$$;

GRANT EXECUTE ON FUNCTION public.refresh_race_ml_features() TO authenticated;
GRANT SELECT ON public.race_ml_features TO authenticated;
GRANT SELECT ON public.ml_predictions   TO authenticated;

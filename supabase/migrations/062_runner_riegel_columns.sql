-- 062_runner_riegel_columns.sql
-- Extend als_athlete_profiles with personal Riegel exponent data for
-- cut-off viability assessment. The build_runner_profiles script populates
-- these columns by fitting Riegel's formula to each runner's race history.
--
-- riegel_b              personal fatigue exponent (population prior = 1.06)
-- riegel_b_confidence   number of finish results used in the fit (0 = prior only)
-- longest_distance_km   longest actual race distance completed (km)

ALTER TABLE public.als_athlete_profiles
  ADD COLUMN IF NOT EXISTS riegel_b              FLOAT,
  ADD COLUMN IF NOT EXISTS riegel_b_confidence   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_distance_km   NUMERIC;

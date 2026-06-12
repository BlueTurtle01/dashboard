-- 056_checkpoint_times.sql
-- Store per-checkpoint cumulative times on race results and allow 'results'
-- as a file type on race_files.

-- 1. Add checkpoint_times to race_results
--    Keys are "cp1", "cp2", … (lowercase, no space).
--    Values are cumulative seconds elapsed at that checkpoint.
--    Only CPs actually reached are included; absent keys mean not reached.
ALTER TABLE public.race_results
  ADD COLUMN IF NOT EXISTS checkpoint_times jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_race_results_checkpoint_times
  ON public.race_results USING gin (checkpoint_times)
  WHERE checkpoint_times != '{}'::jsonb;

-- 2. Extend the race_files.file_type check constraint to include 'results'
ALTER TABLE public.race_files
  DROP CONSTRAINT IF EXISTS race_files_file_type_check;

ALTER TABLE public.race_files
  ADD CONSTRAINT race_files_file_type_check
  CHECK (file_type IN ('gpx', 'wind_analysis', 'course_map', 'elevation_profile', 'results', 'other'));

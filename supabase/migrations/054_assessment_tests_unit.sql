-- Migration 054: add unit to assessment_tests
-- Records the measurement unit for the recorded result, e.g. "reps", "seconds", "cm"

ALTER TABLE public.assessment_tests ADD COLUMN IF NOT EXISTS unit TEXT;

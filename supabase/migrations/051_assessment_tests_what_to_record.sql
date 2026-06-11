-- Migration 051: add what_to_record to assessment_tests

ALTER TABLE public.assessment_tests ADD COLUMN IF NOT EXISTS what_to_record TEXT;

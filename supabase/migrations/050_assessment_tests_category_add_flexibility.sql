-- Migration 050: add 'flexibility' to assessment_tests category constraint

ALTER TABLE public.assessment_tests
  DROP CONSTRAINT assessment_tests_category_check,
  ADD CONSTRAINT assessment_tests_category_check
    CHECK (category IN ('strength', 'imbalance', 'flexibility'));

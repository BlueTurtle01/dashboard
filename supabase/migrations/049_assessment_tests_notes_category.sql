-- Migration 049: assessment_tests notes and category
--
-- notes: free-text field for coaches to record what to watch out for
-- category: classifies the test as a 'strength' or 'imbalance' assessment

ALTER TABLE public.assessment_tests
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('strength', 'imbalance'));

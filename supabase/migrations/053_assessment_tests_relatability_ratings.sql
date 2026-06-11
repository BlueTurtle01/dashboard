-- Migration 053: relatability ratings on assessment_tests
--
-- Each column is a 0-5 score indicating how relevant the assessment is to
-- that terrain/context. NULL means unrated; 0 means not relevant; 5 = highly relevant.

ALTER TABLE public.assessment_tests
  ADD COLUMN IF NOT EXISTS rating_uphill            SMALLINT CHECK (rating_uphill            BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS rating_downhill          SMALLINT CHECK (rating_downhill          BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS rating_technical         SMALLINT CHECK (rating_technical         BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS rating_gravel_stability  SMALLINT CHECK (rating_gravel_stability  BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS rating_general_asymmetry SMALLINT CHECK (rating_general_asymmetry BETWEEN 0 AND 5);

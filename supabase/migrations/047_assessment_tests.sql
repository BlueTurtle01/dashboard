-- Migration 047: assessment_tests
--
-- A library of physical assessment tests used to identify muscle imbalances
-- and weaknesses. Managed by admins; readable by all authenticated users.

CREATE TABLE IF NOT EXISTS public.assessment_tests (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  aim            TEXT,
  instructions   TEXT[] NOT NULL DEFAULT '{}',
  video_urls     TEXT[] NOT NULL DEFAULT '{}',
  target_muscles TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assessment_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessment_tests_select" ON public.assessment_tests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "assessment_tests_admin_write" ON public.assessment_tests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.set_assessment_tests_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assessment_tests_updated_at ON public.assessment_tests;
CREATE TRIGGER assessment_tests_updated_at
  BEFORE UPDATE ON public.assessment_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_assessment_tests_updated_at();

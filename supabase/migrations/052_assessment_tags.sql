-- Migration 052: assessment_tags lookup table + tags column on assessment_tests
--
-- assessment_tags: admin-managed list of tags (e.g. downhill, uphill, flat)
-- assessment_tests.tags: array of slugs from assessment_tags

CREATE TABLE IF NOT EXISTS public.assessment_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.assessment_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessment_tags_select" ON public.assessment_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "assessment_tags_admin_write" ON public.assessment_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

ALTER TABLE public.assessment_tests
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

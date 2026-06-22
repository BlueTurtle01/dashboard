-- Tracks archived versions of the Race Readiness Report plan template.
-- Each row corresponds to a copy of app/admin/race-readiness/v{version_number}/page.tsx
-- accessible at /admin/race-readiness/v{version_number}.

CREATE TABLE IF NOT EXISTS public.plan_versions (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number integer      UNIQUE NOT NULL,
  name           text,
  notes          text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  is_current     boolean      NOT NULL DEFAULT false
);

COMMENT ON TABLE public.plan_versions IS
  'Archived versions of the Race Readiness Report template. '
  'Each row corresponds to app/admin/race-readiness/v{version_number}/page.tsx.';

ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;

-- Admin auth is enforced at the middleware level; all authenticated users can read/write.
CREATE POLICY "plan_versions_select" ON public.plan_versions
  FOR SELECT USING (true);

CREATE POLICY "plan_versions_write_authenticated" ON public.plan_versions
  FOR ALL USING (auth.role() = 'authenticated');

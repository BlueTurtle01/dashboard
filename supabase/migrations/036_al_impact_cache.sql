-- Migration 036: Cache table for race impact bulk results
--
-- al_impact_cache stores pre-computed PairImpactSummary arrays as JSONB.
-- Each row is identified by a cache_key encoding the analysis parameters.
-- The page reads from here on load; staleness is detected by comparing
-- computed_at against MAX(race_results.updated_at).

CREATE TABLE IF NOT EXISTS public.al_impact_cache (
  cache_key    TEXT         PRIMARY KEY,
  data         JSONB        NOT NULL,
  row_count    INTEGER      NOT NULL DEFAULT 0,
  computed_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.al_impact_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "al_impact_cache_admin_all" ON public.al_impact_cache
    FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

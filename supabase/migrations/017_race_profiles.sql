-- 017_race_profiles.sql
-- Stores computed race difficulty profiles (flat_equivalent_km and section breakdown).
-- These are the basis for cross-race finish time estimation via Riegel's formula.

CREATE TABLE IF NOT EXISTS public.race_profiles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id          UUID        NOT NULL UNIQUE REFERENCES public.races(id) ON DELETE CASCADE,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  gpx_file_id      UUID        REFERENCES public.race_files(id) ON DELETE SET NULL,
  wind_file_id     UUID        REFERENCES public.race_files(id) ON DELETE SET NULL,
  profile_source   TEXT        NOT NULL CHECK (profile_source IN ('gpx', 'gpx_wind')),
  total_distance_km             NUMERIC,
  total_ascent_m                NUMERIC,
  total_descent_m               NUMERIC,
  flat_equivalent_km            NUMERIC NOT NULL,
  difficulty_ratio              NUMERIC,
  wind_adjusted_flat_equivalent_km NUMERIC,
  wind_adjusted_difficulty_ratio   NUMERIC,
  sections_json                 JSONB,          -- full CourseSection[] breakdown
  metadata                      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_race_profiles_race_id
  ON public.race_profiles(race_id);

ALTER TABLE public.race_profiles ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read profiles (athletes, coaches, admin)
DO $$ BEGIN
  CREATE POLICY "race_profiles_select_authenticated"
    ON public.race_profiles
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only admins can write
DO $$ BEGIN
  CREATE POLICY "race_profiles_admin_manage"
    ON public.race_profiles
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_roles.user_id = auth.uid()
          AND user_roles.role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_race_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS race_profiles_updated_at ON public.race_profiles;
CREATE TRIGGER race_profiles_updated_at
  BEFORE UPDATE ON public.race_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_race_profiles_updated_at();

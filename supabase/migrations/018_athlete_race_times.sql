-- Migration 018: athlete_race_times table + calibration columns on race_profiles
--
-- athlete_race_times stores every (athlete, race, finish_time) entry.
-- These power two features:
--   1. Personal Riegel exponent fitting — more entries → personalised k
--   2. Community course calibration — aggregate bias detection per race
--
-- race_profiles gains three calibration columns used by the compare API.

-- ── athlete_race_times ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.athlete_race_times (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id            UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  race_id               UUID        NOT NULL REFERENCES public.races(id)  ON DELETE CASCADE,
  finish_time_minutes   NUMERIC     NOT NULL CHECK (finish_time_minutes > 0),
  race_date             DATE,
  source                TEXT        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual', 'comparison', 'imported')),
  flat_equiv_at_entry   NUMERIC,    -- snapshot of flat_equivalent_km when entry was saved
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No unique(athlete_id, race_id): same athlete may race the same course in different years
);

CREATE INDEX IF NOT EXISTS idx_art_athlete_id ON public.athlete_race_times(athlete_id);
CREATE INDEX IF NOT EXISTS idx_art_race_id    ON public.athlete_race_times(race_id);

ALTER TABLE public.athlete_race_times ENABLE ROW LEVEL SECURITY;

-- Athletes can manage their own entries; admins can read all entries
DO $$ BEGIN
  CREATE POLICY "art_athlete_own" ON public.athlete_race_times
    FOR ALL TO authenticated
    USING   (athlete_id = auth.uid())
    WITH CHECK (athlete_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "art_admin_read_all" ON public.athlete_race_times
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_athlete_race_times_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS athlete_race_times_updated_at ON public.athlete_race_times;
CREATE TRIGGER athlete_race_times_updated_at
  BEFORE UPDATE ON public.athlete_race_times
  FOR EACH ROW EXECUTE FUNCTION public.set_athlete_race_times_updated_at();

-- ── race_profiles calibration columns ────────────────────────────────────────

ALTER TABLE public.race_profiles
  ADD COLUMN IF NOT EXISTS community_calibration_factor  NUMERIC     NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS community_entry_count         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calibration_updated_at        TIMESTAMPTZ;

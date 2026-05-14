-- =========================================================
-- Migration 015: race-specific kit list support
-- =========================================================
-- Existing kit_list rows remain global when race_id is NULL. Race-specific
-- rows are shown for athletes whose active plan/enrollment points at that race.

ALTER TABLE public.kit_list
  ADD COLUMN IF NOT EXISTS race_id UUID REFERENCES public.races(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_kit_list_race_id
  ON public.kit_list(race_id);


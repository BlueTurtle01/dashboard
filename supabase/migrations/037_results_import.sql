-- Migration 037: Bulk race results & GPX import infrastructure
--
-- Approach: add is_published flag to races so imported results live alongside
-- published races in the same tables. All athlete network analysis functions
-- (al_name_matches, al_race_paths, al_race_sequences, al_race_impact, etc.)
-- work unchanged on unpublished data. The frontend simply filters to
-- is_published = true when rendering athlete-facing race lists.

-- ── 1. is_published on races ─────────────────────────────────────────────────
-- Existing rows are already live, so DEFAULT true leaves them unchanged.
-- Import-created rows will explicitly set is_published = false.

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_races_is_published
  ON public.races(is_published);

-- ── 2. race_year on races ─────────────────────────────────────────────────────
-- Imported races use (slug_base, race_year) as their dedup key.
-- Published races may leave this null if no specific year applies.

ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS race_year INTEGER;

CREATE INDEX IF NOT EXISTS idx_races_year
  ON public.races(race_year);

-- ── 3. race_result_imports — batch tracker ────────────────────────────────────
-- One row per CSV upload. Enables deduplication (warn on re-upload of same
-- filename), audit trail, and result management (delete batch).

CREATE TABLE IF NOT EXISTS public.race_result_imports (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  original_filename TEXT        NOT NULL,
  race_id           UUID        REFERENCES public.races(id) ON DELETE SET NULL,
  row_count         INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rri_race_id
  ON public.race_result_imports(race_id);

CREATE INDEX IF NOT EXISTS idx_rri_filename
  ON public.race_result_imports(original_filename);

ALTER TABLE public.race_result_imports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rri_admin_all" ON public.race_result_imports
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. import_id on race_results ──────────────────────────────────────────────
-- Links each result row back to its import batch for management and
-- deduplication checks. Nullable so manually-entered rows are unaffected.

ALTER TABLE public.race_results
  ADD COLUMN IF NOT EXISTS import_id UUID
    REFERENCES public.race_result_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rr_import_id
  ON public.race_results(import_id);

-- ── 5. raw_gpx_files — orphan GPX store ──────────────────────────────────────
-- GPX files uploaded in bulk before a race is published. Stored in the
-- 'raw-files' bucket. Once a race is published, these are promoted to
-- race_files entries by setting race_id and copying to the race-files bucket.

CREATE TABLE IF NOT EXISTS public.raw_gpx_files (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename TEXT        NOT NULL,
  storage_path      TEXT        NOT NULL,    -- path within 'raw-files' bucket
  file_size_bytes   BIGINT,
  race_id           UUID        REFERENCES public.races(id) ON DELETE SET NULL,
  uploaded_by       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_gpx_race
  ON public.raw_gpx_files(race_id);

ALTER TABLE public.raw_gpx_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "raw_gpx_admin_all" ON public.raw_gpx_files
    FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

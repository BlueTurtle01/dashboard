-- 016_race_files.sql
-- Race file storage: GPX, wind analysis CSVs, course maps, and other per-race assets.
-- Files are stored in Supabase Storage bucket 'race-files'.
-- This table tracks metadata and public URLs for those files.

CREATE TABLE IF NOT EXISTS public.race_files (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id          UUID        NOT NULL REFERENCES public.races(id) ON DELETE CASCADE,
  file_type        TEXT        NOT NULL CHECK (file_type IN ('gpx', 'wind_analysis', 'course_map', 'elevation_profile', 'other')),
  file_name        TEXT        NOT NULL,          -- original filename, e.g. "Snowdonia Marathon.gpx"
  storage_path     TEXT        NOT NULL,          -- path within the 'race-files' bucket
  public_url       TEXT        NOT NULL,          -- public download/access URL
  file_size_bytes  BIGINT,
  mime_type        TEXT,
  uploaded_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_race_files_race_id
  ON public.race_files(race_id);

CREATE INDEX IF NOT EXISTS idx_race_files_file_type
  ON public.race_files(file_type);

-- Row Level Security
ALTER TABLE public.race_files ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read race files (needed by future server-side processing pipelines)
DO $$ BEGIN
  CREATE POLICY "race_files_select_authenticated"
    ON public.race_files
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only admins can create, update, or delete
DO $$ BEGIN
  CREATE POLICY "race_files_admin_manage"
    ON public.race_files
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
CREATE OR REPLACE FUNCTION public.set_race_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS race_files_updated_at ON public.race_files;
CREATE TRIGGER race_files_updated_at
  BEFORE UPDATE ON public.race_files
  FOR EACH ROW EXECUTE FUNCTION public.set_race_files_updated_at();

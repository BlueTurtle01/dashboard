ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS completed_tabs text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_submitted_at timestamptz;

ALTER TABLE athlete_profiles
  ADD COLUMN IF NOT EXISTS next_goal_race_id UUID REFERENCES races(id),
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

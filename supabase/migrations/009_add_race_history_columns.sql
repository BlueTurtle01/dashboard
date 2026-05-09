-- Add missing columns to athlete_race_history table
ALTER TABLE athlete_race_history
ADD COLUMN IF NOT EXISTS breathing_feedback text,
ADD COLUMN IF NOT EXISTS did_finish boolean,
ADD COLUMN IF NOT EXISTS muscles_hurt text[];

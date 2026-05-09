-- Create junction table: coach_completed_races
-- Links coaches to races they've completed (from the races table used for athlete goals)
CREATE TABLE coach_completed_races (
  coach_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  race_id       UUID NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  PRIMARY KEY (coach_user_id, race_id)
);

ALTER TABLE coach_completed_races ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can manage their own race history"
  ON coach_completed_races
  FOR ALL
  USING (auth.uid() = coach_user_id)
  WITH CHECK (auth.uid() = coach_user_id);

CREATE POLICY "Authenticated users can read coach race history"
  ON coach_completed_races
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Add race_id column to kb_questions for race-specific questions
ALTER TABLE kb_questions ADD COLUMN IF NOT EXISTS race_id UUID REFERENCES races(id) ON DELETE SET NULL;

-- Update type check constraint to allow 'race' type
ALTER TABLE kb_questions DROP CONSTRAINT IF EXISTS kb_questions_type_check;
ALTER TABLE kb_questions ADD CONSTRAINT kb_questions_type_check
  CHECK (type IN ('community', 'faq', 'race'));

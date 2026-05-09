-- Clear invalid event IDs that don't exist in races table
UPDATE athlete_profiles
SET selected_event_id = NULL
WHERE selected_event_id NOT IN (SELECT id FROM races);

-- Update foreign key to reference races table instead of events table
ALTER TABLE athlete_profiles
DROP CONSTRAINT IF EXISTS athlete_profiles_selected_event_id_fkey,
ADD CONSTRAINT athlete_profiles_selected_event_id_fkey
FOREIGN KEY (selected_event_id) REFERENCES races(id) ON DELETE SET NULL;

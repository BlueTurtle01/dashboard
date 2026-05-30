ALTER TABLE program_template_sessions ADD COLUMN IF NOT EXISTS mobility_session_id text REFERENCES mobility_sessions(id) ON DELETE SET NULL;

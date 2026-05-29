ALTER TABLE program_template_weeks ADD COLUMN IF NOT EXISTS is_finished boolean NOT NULL DEFAULT false;

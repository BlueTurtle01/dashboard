ALTER TABLE stretches ADD COLUMN IF NOT EXISTS stretch_type text CHECK (stretch_type IN ('static', 'dynamic')) DEFAULT NULL;

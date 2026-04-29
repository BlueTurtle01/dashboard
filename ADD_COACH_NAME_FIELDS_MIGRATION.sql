-- Add first_name and last_name fields to coach_profiles
-- This allows us to display "Coach [first_name]" in the knowledge base

ALTER TABLE public.coach_profiles
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT;

-- Backfill existing data by splitting full_name
UPDATE public.coach_profiles
SET
  first_name = CASE
    WHEN full_name IS NULL THEN NULL
    WHEN full_name ~ '^\w+@' THEN split_part(full_name, '@', 1)  -- Email-like format
    ELSE split_part(full_name, ' ', 1)  -- Space-separated format
  END,
  last_name = CASE
    WHEN full_name IS NULL THEN NULL
    WHEN full_name ~ '^\w+@' THEN NULL  -- No last name for email-only
    WHEN full_name ~ ' ' THEN substring(full_name FROM position(' ' IN full_name) + 1)  -- Everything after first space
    ELSE NULL
  END;

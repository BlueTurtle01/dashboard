-- Add slug field to travel_vaccination_cheatsheets table
-- This allows URL-friendly access by country name instead of UUID

ALTER TABLE public.travel_vaccination_cheatsheets
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Generate slugs from country_name (lowercase, replace spaces with hyphens, remove special chars)
UPDATE public.travel_vaccination_cheatsheets
SET slug = LOWER(REGEXP_REPLACE(country_name, '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Make slug NOT NULL after data is populated
ALTER TABLE public.travel_vaccination_cheatsheets
ALTER COLUMN slug SET NOT NULL;

-- Create index for faster slug lookups
CREATE INDEX IF NOT EXISTS idx_travel_vaccination_cheatsheets_slug
ON public.travel_vaccination_cheatsheets(slug);

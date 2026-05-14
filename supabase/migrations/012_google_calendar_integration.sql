ALTER TABLE public.athlete_integrations
  DROP CONSTRAINT IF EXISTS provider_must_be_strava;

ALTER TABLE public.athlete_integrations
  DROP CONSTRAINT IF EXISTS athlete_integrations_provider_provider_athlete_id_key;

ALTER TABLE public.athlete_integrations
  ALTER COLUMN provider_athlete_id DROP NOT NULL;

ALTER TABLE public.athlete_integrations
  ADD COLUMN IF NOT EXISTS provider_account_id text;

UPDATE public.athlete_integrations
SET provider_account_id = provider_athlete_id::text
WHERE provider_account_id IS NULL
  AND provider_athlete_id IS NOT NULL;

ALTER TABLE public.athlete_integrations
  ADD CONSTRAINT provider_supported_integrations
  CHECK (provider IN ('strava', 'google_calendar'));

CREATE UNIQUE INDEX IF NOT EXISTS athlete_integrations_provider_account_id_key
  ON public.athlete_integrations(provider, provider_account_id)
  WHERE provider_account_id IS NOT NULL;

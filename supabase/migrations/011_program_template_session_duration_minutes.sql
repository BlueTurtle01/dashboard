ALTER TABLE public.program_template_sessions
ADD COLUMN IF NOT EXISTS duration_minutes integer;

UPDATE public.program_template_sessions
SET duration_minutes = NULLIF(substring(duration FROM '\d+'), '')::integer
WHERE duration_minutes IS NULL
  AND duration IS NOT NULL
  AND duration ~ '\d+';

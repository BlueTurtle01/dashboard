-- Add audience support for Knowledge Base items

ALTER TABLE public.kb_questions
ADD COLUMN IF NOT EXISTS audience TEXT DEFAULT 'athlete';

ALTER TABLE public.kb_questions
DROP CONSTRAINT IF EXISTS kb_questions_audience_check;

ALTER TABLE public.kb_questions
ADD CONSTRAINT kb_questions_audience_check
CHECK (audience IN ('athlete', 'coach'));

CREATE INDEX IF NOT EXISTS idx_kb_questions_audience_created
ON public.kb_questions(audience, created_at DESC);

UPDATE public.kb_questions
SET audience = 'athlete'
WHERE audience IS NULL;

ALTER TABLE public.kb_questions
ALTER COLUMN audience SET DEFAULT 'athlete';

ALTER TABLE public.kb_questions
ALTER COLUMN audience SET NOT NULL;

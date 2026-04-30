-- Add question type support for Knowledge Base FAQs

ALTER TABLE public.kb_questions
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'community';

ALTER TABLE public.kb_questions
DROP CONSTRAINT IF EXISTS kb_questions_type_check;

ALTER TABLE public.kb_questions
ADD CONSTRAINT kb_questions_type_check
CHECK (type IN ('community', 'faq'));

CREATE INDEX IF NOT EXISTS idx_kb_questions_type_created
ON public.kb_questions(type, created_at DESC);

UPDATE public.kb_questions
SET type = 'community'
WHERE type IS NULL;

ALTER TABLE public.kb_questions
ALTER COLUMN type SET DEFAULT 'community';

ALTER TABLE public.kb_questions
ALTER COLUMN type SET NOT NULL;

-- Add flagged questions table for knowledge base moderation

CREATE TABLE public.kb_flagged_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.kb_questions(id) ON DELETE CASCADE,
  flagged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_reason TEXT NOT NULL,
  reviewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(question_id)  -- One flag per question at a time
);

CREATE INDEX idx_kb_flagged_questions_reviewed ON public.kb_flagged_questions(reviewed, created_at DESC);

-- Disable RLS (auth handled by server actions)
ALTER TABLE public.kb_flagged_questions DISABLE ROW LEVEL SECURITY;

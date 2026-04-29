-- Knowledge Base System Migration
-- Run this SQL in your Supabase Project → SQL Editor

-- Create kb_questions table
CREATE TABLE public.kb_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create kb_answers table
CREATE TABLE public.kb_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.kb_questions(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, submitted_by)
);

-- Create kb_answer_notifications table
CREATE TABLE public.kb_answer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.kb_questions(id) ON DELETE CASCADE,
  athlete_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, athlete_user_id)
);

-- Create indexes
CREATE INDEX idx_kb_answers_question ON public.kb_answers(question_id);
CREATE INDEX idx_kb_notifications_athlete ON public.kb_answer_notifications(athlete_user_id, read);

-- Disable RLS on all tables (auth handled by server actions)
ALTER TABLE public.kb_questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_answer_notifications DISABLE ROW LEVEL SECURITY;

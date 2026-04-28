-- Chat System Database Migration
-- Run this SQL in your Supabase Project → SQL Editor

-- Create chat_conversations table
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  UNIQUE(coach_user_id, athlete_user_id)
);

-- Create chat_messages table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'flagged', 'blocked')),
  flagged_phrase TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster conversation queries
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at DESC);

-- Create chat_banned_phrases table for moderation
CREATE TABLE public.chat_banned_phrases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'flag' CHECK (severity IN ('flag', 'block')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Realtime on chat_messages for instant message delivery
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Add some default banned phrases (optional - you can add more)
INSERT INTO public.chat_banned_phrases (phrase, severity, is_active)
VALUES
  ('test phrase', 'flag', true);

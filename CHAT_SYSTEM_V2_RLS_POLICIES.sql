-- Chat System v2 RLS Policies
-- Run this SQL in your Supabase Project → SQL Editor
-- This sets up Row-Level Security for chat tables

-- Enable RLS on all chat tables
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_banned_phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ chat_conversations ============
-- Users can only see conversations they're part of
CREATE POLICY "Users can see their conversations"
  ON public.chat_conversations
  FOR SELECT
  USING (
    auth.uid() = coach_user_id OR auth.uid() = athlete_user_id
  );

-- Conversations are auto-created by the API, no direct insert needed
CREATE POLICY "System can create conversations"
  ON public.chat_conversations
  FOR INSERT
  WITH CHECK (true);

-- ============ chat_threads ============
-- Users can see threads in conversations they're part of
CREATE POLICY "Users can see threads in their conversations"
  ON public.chat_threads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = conversation_id
      AND (auth.uid() = coach_user_id OR auth.uid() = athlete_user_id)
    )
  );

-- Users can create threads in their conversations
CREATE POLICY "Users can create threads in their conversations"
  ON public.chat_threads
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = conversation_id
      AND (auth.uid() = coach_user_id OR auth.uid() = athlete_user_id)
    )
  );

-- ============ chat_messages ============
-- Users can see messages in threads they can access
CREATE POLICY "Users can see messages in their threads"
  ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_threads
      JOIN public.chat_conversations ON chat_threads.conversation_id = chat_conversations.id
      WHERE chat_threads.id = thread_id
      AND (auth.uid() = chat_conversations.coach_user_id OR auth.uid() = chat_conversations.athlete_user_id)
    )
  );

-- Users can insert messages into threads they can access
CREATE POLICY "Users can send messages in their threads"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_threads
      JOIN public.chat_conversations ON chat_threads.conversation_id = chat_conversations.id
      WHERE chat_threads.id = thread_id
      AND (auth.uid() = chat_conversations.coach_user_id OR auth.uid() = chat_conversations.athlete_user_id)
    )
  );

-- ============ user_roles ============
-- Authenticated users can check their own role
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- ============ chat_banned_phrases ============
-- Only admins can manage banned phrases
CREATE POLICY "Admins can view banned phrases"
  ON public.chat_banned_phrases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can create banned phrases"
  ON public.chat_banned_phrases
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update banned phrases"
  ON public.chat_banned_phrases
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete banned phrases"
  ON public.chat_banned_phrases
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role = 'admin'
    )
  );

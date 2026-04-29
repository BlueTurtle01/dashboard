-- Chat Unread Tracking Migration
-- Run this in Supabase Dashboard → SQL Editor to add read timestamp tracking

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS coach_last_read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS athlete_last_read_at TIMESTAMPTZ;

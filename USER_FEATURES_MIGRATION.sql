-- User Features Table
-- Entitlements system for features separate from roles
-- Run this SQL in your Supabase Project → SQL Editor

-- Create the user_features table
CREATE TABLE IF NOT EXISTS public.user_features (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, feature)
);

-- Enable RLS
ALTER TABLE public.user_features ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own features
CREATE POLICY "Users can view own features"
  ON public.user_features
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Only service role can insert/update/delete
CREATE POLICY "Service role can manage features"
  ON public.user_features
  USING (auth.role() = 'service_role');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_features_user_id ON public.user_features(user_id);
CREATE INDEX IF NOT EXISTS idx_user_features_feature ON public.user_features(feature);

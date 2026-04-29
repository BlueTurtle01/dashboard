-- Create user_onboarding table
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_step_ids  TEXT[]      NOT NULL DEFAULT '{}',
  has_seen_tour       BOOLEAN     NOT NULL DEFAULT FALSE,
  tour_version        INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

-- Users can only read their own row
CREATE POLICY "user_onboarding_self_select"
  ON public.user_onboarding FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own row
CREATE POLICY "user_onboarding_self_insert"
  ON public.user_onboarding FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own row
CREATE POLICY "user_onboarding_self_update"
  ON public.user_onboarding FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at_onboarding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_onboarding_updated_at ON public.user_onboarding;

CREATE TRIGGER user_onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_onboarding();

-- Create warnings_read table for tracking read/unread warnings
CREATE TABLE IF NOT EXISTS public.warnings_read (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warning_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coach_user_id, warning_hash)
);

-- Enable Row Level Security
ALTER TABLE public.warnings_read ENABLE ROW LEVEL SECURITY;

-- Coach can only access their own warning read records
CREATE POLICY "coach_own_warnings_read" ON public.warnings_read
  FOR ALL USING (auth.uid() = coach_user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_warnings_read_coach_id ON public.warnings_read(coach_user_id);

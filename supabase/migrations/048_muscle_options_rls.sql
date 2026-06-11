-- Migration 048: muscle_options RLS
--
-- Enables row-level security on the muscle_options table so that:
--   - all authenticated users can read muscle options
--   - only admins can insert, update, or delete them

ALTER TABLE public.muscle_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "muscle_options_select" ON public.muscle_options
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "muscle_options_admin_write" ON public.muscle_options
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

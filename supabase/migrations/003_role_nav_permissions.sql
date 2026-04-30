-- =========================================================
-- Migration 003: role-based navigation permissions
-- =========================================================

CREATE TABLE IF NOT EXISTS public.role_nav_permissions (
  role      TEXT NOT NULL,
  nav_item  TEXT NOT NULL,
  enabled   BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DELETE FROM public.role_nav_permissions a
USING public.role_nav_permissions b
WHERE a.ctid < b.ctid
  AND a.role = b.role
  AND a.nav_item = b.nav_item;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.role_nav_permissions'::regclass
      AND conname = 'role_nav_permissions_pkey'
  ) THEN
    ALTER TABLE public.role_nav_permissions
      ADD CONSTRAINT role_nav_permissions_pkey PRIMARY KEY (role, nav_item);
  END IF;
END $$;

ALTER TABLE public.role_nav_permissions
  DROP CONSTRAINT IF EXISTS role_nav_permissions_role_check;

ALTER TABLE public.role_nav_permissions
  ADD CONSTRAINT role_nav_permissions_role_check
  CHECK (role IN ('admin', 'coach', 'athlete', 'solo_plan_holder', 'creator'));

ALTER TABLE public.role_nav_permissions
  DROP CONSTRAINT IF EXISTS role_nav_permissions_nav_item_check;

ALTER TABLE public.role_nav_permissions
  ADD CONSTRAINT role_nav_permissions_nav_item_check
  CHECK (
    nav_item IN (
      'athlete_plan',
      'athlete_chat',
      'athlete_library',
      'athlete_knowledge_base',
      'athlete_information',
      'athlete_profile',
      'athlete_integrations',
      'athlete_upgrades',
      'coach_dashboard',
      'coach_chat',
      'coach_knowledge_base',
      'coach_programs',
      'coach_mobility',
      'coach_gym_sessions',
      'coach_profile',
      'admin_panel',
      'admin_knowledge_base',
      'admin_library',
      'admin_templates',
      'admin_destinations',
      'admin_config'
    )
  );

CREATE OR REPLACE FUNCTION public.set_role_nav_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS role_nav_permissions_updated_at ON public.role_nav_permissions;
CREATE TRIGGER role_nav_permissions_updated_at
  BEFORE UPDATE ON public.role_nav_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_role_nav_permissions_updated_at();

ALTER TABLE public.role_nav_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_nav_permissions_select" ON public.role_nav_permissions;
DROP POLICY IF EXISTS "role_nav_permissions_admin_insert" ON public.role_nav_permissions;
DROP POLICY IF EXISTS "role_nav_permissions_admin_update" ON public.role_nav_permissions;
DROP POLICY IF EXISTS "role_nav_permissions_admin_delete" ON public.role_nav_permissions;

CREATE POLICY "role_nav_permissions_select" ON public.role_nav_permissions
  FOR SELECT
  TO authenticated
  USING (
    enabled = true
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "role_nav_permissions_admin_insert" ON public.role_nav_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "role_nav_permissions_admin_update" ON public.role_nav_permissions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "role_nav_permissions_admin_delete" ON public.role_nav_permissions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

INSERT INTO public.role_nav_permissions (role, nav_item, enabled)
VALUES
  ('coach', 'coach_dashboard', true),
  ('coach', 'coach_chat', true),
  ('coach', 'coach_knowledge_base', true),
  ('coach', 'coach_programs', true),
  ('coach', 'coach_mobility', true),
  ('coach', 'coach_gym_sessions', true),
  ('coach', 'coach_profile', true),
  ('athlete', 'athlete_plan', true),
  ('athlete', 'athlete_chat', true),
  ('athlete', 'athlete_library', true),
  ('athlete', 'athlete_knowledge_base', true),
  ('athlete', 'athlete_information', true),
  ('athlete', 'athlete_profile', true),
  ('athlete', 'athlete_integrations', true),
  ('athlete', 'athlete_upgrades', true),
  ('solo_plan_holder', 'athlete_plan', true),
  ('solo_plan_holder', 'athlete_library', true),
  ('solo_plan_holder', 'athlete_knowledge_base', true),
  ('solo_plan_holder', 'athlete_information', true),
  ('solo_plan_holder', 'athlete_profile', true),
  ('solo_plan_holder', 'athlete_integrations', true),
  ('solo_plan_holder', 'athlete_upgrades', true)
ON CONFLICT (role, nav_item) DO NOTHING;

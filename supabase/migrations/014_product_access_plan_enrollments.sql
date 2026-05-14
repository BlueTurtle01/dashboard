-- =========================================================
-- Migration 014: product access and plan enrollments
-- =========================================================
-- Commercial product state now lives separately from operational roles.
-- Keep legacy roles in place for compatibility while code migrates to
-- user_product_access and plan_enrollments as the source of truth.

CREATE TABLE IF NOT EXISTS public.user_product_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

ALTER TABLE public.user_product_access
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS product_code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.user_product_access
  ALTER COLUMN product_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_product_access'::regclass
      AND conname = 'user_product_access_product_id_fkey'
  ) THEN
    ALTER TABLE public.user_product_access
      ADD CONSTRAINT user_product_access_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.user_product_access
SET product_code = 'solo_16_week_plan'
WHERE product_code IS NULL;

ALTER TABLE public.user_product_access
  ALTER COLUMN product_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_product_access'::regclass
      AND conname = 'user_product_access_status_check'
  ) THEN
    ALTER TABLE public.user_product_access
      ADD CONSTRAINT user_product_access_status_check CHECK (
        status IN ('active', 'expired', 'cancelled', 'archived')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_product_access'::regclass
      AND conname = 'user_product_access_product_code_check'
  ) THEN
    ALTER TABLE public.user_product_access
      ADD CONSTRAINT user_product_access_product_code_check CHECK (
        product_code IN ('solo_16_week_plan', 'personalised_16_week_plan', 'monthly_coaching')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_product_access_user_id
  ON public.user_product_access(user_id);

CREATE INDEX IF NOT EXISTS idx_user_product_access_product_id
  ON public.user_product_access(product_id);

CREATE INDEX IF NOT EXISTS idx_user_product_access_product_code
  ON public.user_product_access(product_code);

CREATE INDEX IF NOT EXISTS idx_user_product_access_active
  ON public.user_product_access(user_id, product_code, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.plan_enrollments (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_access_id           UUID REFERENCES public.user_product_access(id) ON DELETE SET NULL,
  athlete_plan_id             UUID,
  source_program_template_id  UUID,
  coach_user_id               UUID REFERENCES public.users(id) ON DELETE SET NULL,
  race_id                     UUID,
  race_date                   DATE,
  status                      TEXT NOT NULL DEFAULT 'active',
  coaching_level              TEXT NOT NULL DEFAULT 'none',
  chat_starts_at              TIMESTAMPTZ,
  chat_ends_at                TIMESTAMPTZ,
  starts_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at                     TIMESTAMPTZ,
  metadata                    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_enrollments_status_check CHECK (
    status IN ('active', 'completed', 'expired', 'cancelled', 'archived')
  ),
  CONSTRAINT plan_enrollments_coaching_level_check CHECK (
    coaching_level IN ('none', 'limited', 'full')
  )
);

CREATE INDEX IF NOT EXISTS idx_plan_enrollments_user_id
  ON public.plan_enrollments(user_id);

CREATE INDEX IF NOT EXISTS idx_plan_enrollments_product_access_id
  ON public.plan_enrollments(product_access_id);

CREATE INDEX IF NOT EXISTS idx_plan_enrollments_athlete_plan_id
  ON public.plan_enrollments(athlete_plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_enrollments_coach_user_id
  ON public.plan_enrollments(coach_user_id);

CREATE OR REPLACE FUNCTION public.set_product_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_product_access_updated_at ON public.user_product_access;
CREATE TRIGGER user_product_access_updated_at
  BEFORE UPDATE ON public.user_product_access
  FOR EACH ROW EXECUTE FUNCTION public.set_product_access_updated_at();

DROP TRIGGER IF EXISTS plan_enrollments_updated_at ON public.plan_enrollments;
CREATE TRIGGER plan_enrollments_updated_at
  BEFORE UPDATE ON public.plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_product_access_updated_at();

ALTER TABLE public.user_product_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_product_access_select_own" ON public.user_product_access;
DROP POLICY IF EXISTS "user_product_access_admin_manage" ON public.user_product_access;
DROP POLICY IF EXISTS "plan_enrollments_select_own" ON public.plan_enrollments;
DROP POLICY IF EXISTS "plan_enrollments_coach_select" ON public.plan_enrollments;
DROP POLICY IF EXISTS "plan_enrollments_admin_manage" ON public.plan_enrollments;

CREATE POLICY "user_product_access_select_own" ON public.user_product_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_product_access_admin_manage" ON public.user_product_access
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "plan_enrollments_select_own" ON public.plan_enrollments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "plan_enrollments_coach_select" ON public.plan_enrollments
  FOR SELECT TO authenticated
  USING (
    coach_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.coach_athlete_links
      WHERE coach_athlete_links.coach_user_id = auth.uid()
        AND coach_athlete_links.athlete_user_id = plan_enrollments.user_id
        AND coach_athlete_links.status = 'active'
    )
  );

CREATE POLICY "plan_enrollments_admin_manage" ON public.plan_enrollments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- Backfill legacy solo plan holders into product access.
INSERT INTO public.user_product_access (user_id, product_id, product_code, status, starts_at, metadata)
SELECT
  ur.user_id,
  NULL,
  'solo_16_week_plan',
  'active',
  COALESCE(MIN(ap.created_at), now()),
  jsonb_build_object('source', 'legacy_solo_plan_holder_role')
FROM public.user_roles ur
LEFT JOIN public.athlete_plans ap
  ON ap.athlete_user_id = ur.user_id
 AND COALESCE(ap.status, 'active') = 'active'
WHERE ur.role = 'solo_plan_holder'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_product_access upa
    WHERE upa.user_id = ur.user_id
      AND upa.product_code = 'solo_16_week_plan'
      AND upa.status = 'active'
  )
GROUP BY ur.user_id;

-- Backfill active solo plans into enrollments.
INSERT INTO public.plan_enrollments (
  user_id,
  product_access_id,
  athlete_plan_id,
  source_program_template_id,
  coach_user_id,
  race_id,
  status,
  coaching_level,
  starts_at,
  metadata
)
SELECT
  ap.athlete_user_id,
  upa.id,
  ap.id,
  ap.source_program_template_id,
  ap.coach_user_id,
  ap.event_id,
  COALESCE(ap.status, 'active'),
  CASE WHEN ap.coach_user_id IS NULL THEN 'none' ELSE 'full' END,
  COALESCE(ap.created_at, upa.starts_at, now()),
  jsonb_build_object('source', 'legacy_athlete_plans')
FROM public.athlete_plans ap
JOIN public.user_product_access upa
  ON upa.user_id = ap.athlete_user_id
WHERE upa.product_code = 'solo_16_week_plan'
  AND COALESCE(ap.status, 'active') = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.plan_enrollments pe
    WHERE pe.athlete_plan_id = ap.id
  );

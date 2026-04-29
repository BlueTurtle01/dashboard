-- =========================================================
-- Migration 002: public.users, public.users_meta, FK fixes
-- =========================================================

-- 1. Create users table (single source of truth for every auth user)
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Coaches can read the rows of their linked athletes
CREATE POLICY "users_coach_sees_athlete" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.coach_athlete_links
      WHERE coach_user_id = auth.uid()
        AND athlete_user_id = public.users.id
        AND status = 'active'
    )
  );

-- 3. Trigger: auto-insert users row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULL),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- 5. Backfill: insert a row for every existing auth user, enriching
--    full_name from athlete_profiles then coach_profiles as fallback
INSERT INTO public.users (id, full_name, email, created_at)
SELECT
  au.id,
  COALESCE(ap.full_name, cp.full_name) AS full_name,
  au.email,
  au.created_at
FROM auth.users au
LEFT JOIN public.athlete_profiles ap ON au.id = ap.user_id
LEFT JOIN public.coach_profiles   cp ON au.id = cp.user_id
ON CONFLICT (id) DO NOTHING;

-- 6. Create users_meta (key-value for lightweight per-user settings)
CREATE TABLE IF NOT EXISTS public.users_meta (
  user_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT,
  PRIMARY KEY (user_id, key)
);

ALTER TABLE public.users_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_meta_own" ON public.users_meta
  USING (auth.uid() = user_id);

-- 7. Fix coach_athlete_links FKs
--    The athlete_user_id FK was pointing to athlete_profiles(user_id),
--    which caused inserts to fail for users with no profile row.
--    Both FKs now point to public.users(id).

ALTER TABLE public.coach_athlete_links
  DROP CONSTRAINT IF EXISTS coach_athlete_links_athlete_user_id_fkey;

ALTER TABLE public.coach_athlete_links
  DROP CONSTRAINT IF EXISTS coach_athlete_links_coach_user_id_fkey;

ALTER TABLE public.coach_athlete_links
  ADD CONSTRAINT coach_athlete_links_athlete_user_id_fkey
    FOREIGN KEY (athlete_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.coach_athlete_links
  ADD CONSTRAINT coach_athlete_links_coach_user_id_fkey
    FOREIGN KEY (coach_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

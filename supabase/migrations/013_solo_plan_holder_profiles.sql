-- Backfill account/profile rows required by solo plan holders.
-- Solo plan holders use athlete-facing plan and profile screens but should not
-- need the full "athlete" role.

INSERT INTO public.users (id, email, full_name, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
  au.created_at
FROM auth.users au
WHERE EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = au.id
    AND ur.role = 'solo_plan_holder'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.athlete_profiles (user_id, full_name)
SELECT
  ur.user_id,
  COALESCE(u.full_name, split_part(u.email, '@', 1))
FROM public.user_roles ur
LEFT JOIN public.users u ON u.id = ur.user_id
WHERE ur.role = 'solo_plan_holder'
  AND NOT EXISTS (
    SELECT 1
    FROM public.athlete_profiles ap
    WHERE ap.user_id = ur.user_id
  );

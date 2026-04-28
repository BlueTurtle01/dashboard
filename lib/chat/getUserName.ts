import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Get a user's display name.
 * First tries athlete_profiles (for coaches who might be athletes too).
 * Falls back to email from auth if no profile exists.
 */
export async function getUserDisplayName(
  supabase: any,
  userId: string
): Promise<string> {
  // Try to get from athlete_profiles
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('full_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.full_name) {
    return profile.full_name;
  }

  // Fall back to email from auth (using admin client to access auth data)
  try {
    const adminClient = createAdminClient();
    const { data: { users }, error } = await adminClient.auth.admin.listUsers();

    if (!error && users) {
      const user = users.find((u: any) => u.id === userId);
      if (user?.email) {
        return user.email.split('@')[0];
      }
    }
  } catch (err) {
    console.error('Error fetching user email:', err);
  }

  // Final fallback
  return userId.slice(0, 8);
}

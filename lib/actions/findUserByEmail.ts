"use server";

import { createClient } from "@/lib/supabase/server";

export async function findUserByEmail(email: string) {
  const supabase = await createClient();

  // Check if current user is admin
  const {
    data: { user: currentUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !currentUser) {
    return { user: null, error: "Not authenticated" };
  }

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", currentUser.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    return { user: null, error: "Only admins can assign plans" };
  }

  // Look up user by email in athlete_profiles or coach_profiles
  // These tables link user_id to email via their profiles
  const { data: athleteProfile } = await supabase
    .from("athlete_profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();

  if (athleteProfile) {
    return { user: { id: athleteProfile.user_id, email }, error: null };
  }

  const { data: coachProfile } = await supabase
    .from("coach_profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();

  if (coachProfile) {
    return { user: { id: coachProfile.user_id, email }, error: null };
  }

  // Fallback: try admin.listUsers() for users without profiles yet
  try {
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

    if (!listError && usersData) {
      const user = usersData.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (user) {
        return { user: { id: user.id, email: user.email || email }, error: null };
      }
    }
  } catch (err) {
    // Silently fail and return error below
  }

  return { user: null, error: `User with email "${email}" not found.` };
}

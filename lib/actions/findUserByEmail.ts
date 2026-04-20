"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // Use admin client with service role key to search auth.users
  try {
    const adminClient = createAdminClient();
    const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();

    if (listError) {
      console.error("listUsers error:", listError);
      return { user: null, error: `Could not list users: ${listError.message}` };
    }

    const user = usersData?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      return { user: null, error: `User with email "${email}" not found.` };
    }

    return { user: { id: user.id, email: user.email || email }, error: null };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("findUserByEmail error:", errorMsg);
    return { user: null, error: `Error searching for user: ${errorMsg}` };
  }
}

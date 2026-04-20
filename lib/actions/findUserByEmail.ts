"use server";

import { createClient } from "@/lib/supabase/server";

export async function findUserByEmail(email: string) {
  const supabase = await createClient();

  const { data: usersData, error } = await supabase.auth.admin.listUsers();

  if (error) {
    return { user: null, error: error.message };
  }

  const user = usersData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    return { user: null, error: `User with email "${email}" not found.` };
  }

  return { user: { id: user.id, email: user.email }, error: null };
}

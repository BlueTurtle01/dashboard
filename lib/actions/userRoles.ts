"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppRole } from "@/lib/auth/get-current-user";

const ALL_ROLES: AppRole[] = ["admin", "coach", "athlete", "solo_plan_holder"];

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated");

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!data) throw new Error("Forbidden");
  return supabase;
}

export type UserWithRoles = {
  id: string;
  email: string;
  roles: AppRole[];
};

export async function listUsersWithRoles(): Promise<UserWithRoles[]> {
  await requireAdmin();

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);

  const supabase = await createClient();
  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role");
  if (rolesError) throw new Error(rolesError.message);

  const rolesByUser: Record<string, AppRole[]> = {};
  for (const row of roleRows ?? []) {
    if (!ALL_ROLES.includes(row.role as AppRole)) continue;
    if (!rolesByUser[row.user_id]) rolesByUser[row.user_id] = [];
    rolesByUser[row.user_id].push(row.role as AppRole);
  }

  return (data.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "(no email)",
    roles: rolesByUser[u.id] ?? [],
  }));
}

export async function saveUserRoles(userId: string, roles: AppRole[]) {
  const supabase = await requireAdmin();

  // Delete existing roles for this user
  const { error: deleteError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (roles.length === 0) return;

  const { error: insertError } = await supabase.from("user_roles").insert(
    roles.map((role) => ({ user_id: userId, role }))
  );
  if (insertError) throw new Error(insertError.message);
}

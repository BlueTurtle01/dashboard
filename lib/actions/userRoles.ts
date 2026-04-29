"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppRole, requireAdminOrThrow } from "@/lib/auth/get-current-user";

const ALL_ROLES: AppRole[] = ["admin", "coach", "athlete", "solo_plan_holder"];

export type UserWithRoles = {
  id: string;
  email: string;
  roles: AppRole[];
};

export type UserDetail = UserWithRoles & {
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

export async function listUsersWithRoles(): Promise<UserWithRoles[]> {
  await requireAdminOrThrow();

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

export async function getUserById(userId: string): Promise<UserDetail> {
  await requireAdminOrThrow();

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);

  const { user } = data;

  const supabase = await createClient();
  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesError) throw new Error(rolesError.message);

  return {
    id: user.id,
    email: user.email ?? "(no email)",
    phone: user.phone ?? null,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    roles: (roleRows ?? [])
      .map((r) => r.role as AppRole)
      .filter((r) => ALL_ROLES.includes(r)),
  };
}

export async function saveUserRoles(userId: string, roles: AppRole[]) {
  await requireAdminOrThrow();
  const supabase = await createClient();

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

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient, getAllAuthUsers } from "@/lib/supabase/admin";
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

  // Get auth users using Admin API
  let users;
  try {
    users = await getAllAuthUsers();
  } catch (err) {
    throw new Error(`Failed to list users: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Use admin client to bypass RLS on user_roles table
  let roleRows;
  try {
    const result = await adminClient
      .from("user_roles")
      .select("user_id, role");
    if (result.error) {
      throw new Error(`user_roles query error: ${result.error.message}`);
    }
    roleRows = result.data;
  } catch (err) {
    throw new Error(`Failed to load user roles: ${err instanceof Error ? err.message : String(err)}`);
  }

  const rolesByUser: Record<string, AppRole[]> = {};
  for (const row of roleRows ?? []) {
    if (!ALL_ROLES.includes(row.role as AppRole)) continue;
    if (!rolesByUser[row.user_id]) rolesByUser[row.user_id] = [];
    rolesByUser[row.user_id].push(row.role as AppRole);
  }

  return (users ?? []).map((u: any) => ({
    id: u.id,
    email: u.email ?? "(no email)",
    roles: rolesByUser[u.id] ?? [],
  }));
}

export async function getUserById(userId: string): Promise<UserDetail> {
  await requireAdminOrThrow();

  const adminClient = createAdminClient();

  // Get all auth users and find the one we need
  let allUsers;
  try {
    allUsers = await getAllAuthUsers();
  } catch (err) {
    throw new Error(`Failed to fetch users: ${err instanceof Error ? err.message : String(err)}`);
  }

  const userData = allUsers.find((u: any) => u.id === userId);
  if (!userData) throw new Error("User not found");

  // Use admin client to bypass RLS on user_roles table
  const { data: roleRows, error: rolesError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesError) throw new Error(rolesError.message);

  return {
    id: userData.id,
    email: userData.email ?? "(no email)",
    phone: userData.phone ?? null,
    created_at: userData.created_at,
    last_sign_in_at: userData.last_sign_in_at ?? null,
    email_confirmed_at: userData.email_confirmed_at ?? null,
    roles: (roleRows ?? [])
      .map((r) => r.role as AppRole)
      .filter((r) => ALL_ROLES.includes(r)),
  };
}

export async function saveUserRoles(userId: string, roles: AppRole[]) {
  await requireAdminOrThrow();
  const adminClient = createAdminClient();

  // Delete existing roles for this user
  const { error: deleteError } = await adminClient
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (roles.length === 0) return;

  const { error: insertError } = await adminClient.from("user_roles").insert(
    roles.map((role) => ({ user_id: userId, role }))
  );
  if (insertError) throw new Error(insertError.message);
}

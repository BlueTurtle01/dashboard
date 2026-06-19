"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrThrow } from "@/lib/auth/core";
import type { AppRole } from "@/lib/types/auth";

const ALL_ROLES: AppRole[] = ["admin", "coach", "athlete", "creator"];

async function ensureAthleteProfileForPlanRole(adminClient: any, userId: string) {
  const { data: userData } = await adminClient
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await adminClient
    .from("athlete_profiles")
    .upsert(
      {
        user_id: userId,
        full_name: userData?.email ? String(userData.email).split("@")[0] : null,
      },
      { onConflict: "user_id" },
    );

  if (error) throw new Error(error.message);
}

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

  // Fetch users and roles in parallel
  const [usersResult, rolesResult] = await Promise.all([
    adminClient.from("users").select("id, email"),
    adminClient.from("user_roles").select("user_id, role"),
  ]);

  if (usersResult.error) throw new Error(`users query error: ${usersResult.error.message}`);
  if (rolesResult.error) throw new Error(`user_roles query error: ${rolesResult.error.message}`);

  const users = usersResult.data ?? [];
  const roleRows = rolesResult.data;

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

  const [
    { data: userData, error: userError },
    { data: roleRows, error: rolesError },
  ] = await Promise.all([
    adminClient
      .from("users")
      .select("id, email, phone, created_at, last_sign_in_at, email_confirmed_at")
      .eq("id", userId)
      .maybeSingle(),
    adminClient.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (userError) throw new Error(userError.message);
  if (!userData) throw new Error("User not found");
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

  if (roles.includes("athlete")) {
    await ensureAthleteProfileForPlanRole(adminClient, userId);
  }

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

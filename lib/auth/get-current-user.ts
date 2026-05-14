import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export type AppRole = "admin" | "coach" | "athlete" | "solo_plan_holder" | "creator";
const VIEW_AS_ROLE_COOKIE = "ep_view_as_role";
const VIEWABLE_ROLES: AppRole[] = ["admin", "coach", "athlete", "solo_plan_holder"];

export async function getCurrentUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getCurrentUserRoles(): Promise<AppRole[]> {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => row.role)
    .filter(
      (role): role is AppRole =>
        role === "admin" || role === "coach" || role === "athlete" ||
        role === "solo_plan_holder" || role === "creator"
    );
}

export async function getCurrentUserEffectiveRoles(): Promise<AppRole[]> {
  const roles = await getCurrentUserRoles();

  if (!roles.includes("admin")) {
    return roles;
  }

  const selectedRole = (await cookies()).get(VIEW_AS_ROLE_COOKIE)?.value as AppRole | undefined;

  if (selectedRole && VIEWABLE_ROLES.includes(selectedRole)) {
    return [selectedRole];
  }

  return roles;
}

export async function userHasRole(role: AppRole): Promise<boolean> {
  const roles = await getCurrentUserRoles();
  return roles.includes(role);
}

export async function userHasEffectiveRole(role: AppRole): Promise<boolean> {
  const roles = await getCurrentUserEffectiveRoles();
  return roles.includes(role);
}

export async function requireAdminOrThrow(): Promise<void> {
  const roles = await getCurrentUserRoles();
  if (!roles.includes("admin")) {
    throw new Error("Unauthorized: Admin role required");
  }
}

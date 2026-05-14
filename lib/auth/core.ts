import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/types/auth";

export type { AppRole };

/**
 * Get the currently authenticated user, or null if not logged in
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

/**
 * Get all roles for the current user
 */
export async function getUserRoles(): Promise<AppRole[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error || !data) return [];

  return data
    .map((row) => row.role)
    .filter((role): role is AppRole =>
      ["admin", "coach", "athlete", "solo_plan_holder", "creator"].includes(role)
    );
}

/**
 * Check if user has a specific role
 */
export async function userHasRole(role: AppRole): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.includes(role);
}

/**
 * Require authentication and optionally a specific role.
 * Redirects to /login if not authenticated or lacks required role.
 * Returns the authenticated user.
 */
export async function requireAuth(requiredRole?: AppRole) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (requiredRole) {
    const roles = await getUserRoles();
    if (!roles.includes(requiredRole)) {
      redirect("/login");
    }
  }

  return user;
}

/**
 * Require admin role, throw error if not admin
 */
export async function requireAdminOrThrow(): Promise<void> {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    throw new Error("Unauthorized: Admin role required");
  }
}

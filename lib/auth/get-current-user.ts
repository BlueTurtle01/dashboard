import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "coach" | "athlete" | "solo_plan_holder" | "creator";

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

export async function userHasRole(role: AppRole): Promise<boolean> {
  const roles = await getCurrentUserRoles();
  return roles.includes(role);
}

export async function requireAdminOrThrow(): Promise<void> {
  const roles = await getCurrentUserRoles();
  if (!roles.includes("admin")) {
    throw new Error("Unauthorized: Admin role required");
  }
}
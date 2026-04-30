"use server";

import { requireAdminOrThrow } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, NAV_ITEMS, type NavItemKey, type ManagedRole } from "@/lib/nav-items";

export type ToggleNavPermissionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function toggleNavPermission(
  role: ManagedRole,
  navItem: NavItemKey,
  enabled: boolean
): Promise<ToggleNavPermissionResult> {
  try {
    await requireAdminOrThrow();

    if (role === "admin" || !ALL_ROLES.includes(role)) {
      return { ok: false, error: "Invalid role" };
    }

    if (!NAV_ITEMS.some((item) => item.key === navItem)) {
      return { ok: false, error: "Invalid navigation item" };
    }

    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : await createClient();

    const { error } = await supabase
      .from("role_nav_permissions")
      .upsert({ role, nav_item: navItem, enabled }, { onConflict: "role,nav_item" });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save permission",
    };
  }
}

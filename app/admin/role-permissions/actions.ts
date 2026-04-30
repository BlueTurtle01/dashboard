"use server";

import { revalidatePath } from "next/cache";
import { requireAdminOrThrow } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, NAV_ITEMS, type NavItemKey, type ManagedRole } from "@/lib/nav-items";

export async function toggleNavPermission(
  role: ManagedRole,
  navItem: NavItemKey,
  enabled: boolean
) {
  await requireAdminOrThrow();

  if (role === "admin" || !ALL_ROLES.includes(role)) {
    throw new Error("Invalid role");
  }

  if (!NAV_ITEMS.some((item) => item.key === navItem)) {
    throw new Error("Invalid navigation item");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("role_nav_permissions")
    .upsert({ role, nav_item: navItem, enabled }, { onConflict: "role,nav_item" });

  if (error) {
    throw new Error(`Failed to save permission: ${error.message}`);
  }

  revalidatePath("/admin/role-permissions");
}

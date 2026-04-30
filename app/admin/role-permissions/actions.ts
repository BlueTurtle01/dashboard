"use server";

import { createClient } from "@/lib/supabase/server";
import { type NavItemKey, type ManagedRole } from "@/lib/nav-items";

export async function toggleNavPermission(
  role: ManagedRole,
  navItem: NavItemKey,
  enabled: boolean
) {
  const supabase = await createClient();

  if (enabled) {
    await supabase
      .from("role_nav_permissions")
      .upsert({ role, nav_item: navItem, enabled: true }, { onConflict: "role,nav_item" });
  } else {
    await supabase
      .from("role_nav_permissions")
      .upsert({ role, nav_item: navItem, enabled: false }, { onConflict: "role,nav_item" });
  }
}

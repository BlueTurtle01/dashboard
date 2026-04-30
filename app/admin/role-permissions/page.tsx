import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import { NAV_ITEMS, ALL_ROLES, type NavItemKey, type ManagedRole } from "@/lib/nav-items";
import RolePermissionsClient from "./RolePermissionsClient";

export default async function RolePermissionsPage() {
  const isAdmin = await userHasRole("admin");
  if (!isAdmin) redirect("/");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("role_nav_permissions")
    .select("role, nav_item, enabled");

  // Build a map: role → Set of enabled nav items
  const permissions = {} as Record<ManagedRole, Set<NavItemKey>>;
  for (const role of ALL_ROLES) {
    permissions[role] = new Set<NavItemKey>();
  }

  // Admin always gets everything — no DB rows needed
  for (const item of NAV_ITEMS) {
    permissions["admin"].add(item.key);
  }

  for (const row of rows ?? []) {
    const role = row.role as ManagedRole;
    if (!ALL_ROLES.includes(role)) continue;
    if (row.enabled) {
      permissions[role].add(row.nav_item as NavItemKey);
    }
  }

  const serializedPermissions = {} as Record<ManagedRole, NavItemKey[]>;
  for (const role of ALL_ROLES) {
    serializedPermissions[role] = [...permissions[role]];
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Role Permissions</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Toggle which navigation items each role can access. Changes take effect immediately.
            Admins always have full access and cannot be restricted.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <RolePermissionsClient permissions={serializedPermissions} />
        </div>
      </div>
    </main>
  );
}

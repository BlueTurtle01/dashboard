"use client";

import { useRouter } from "next/navigation";
import type { AppRole } from "@/lib/types/auth";

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  coach: "Coach",
  athlete: "Athlete",
  solo_plan_holder: "Solo Plan Holder",
  creator: "Creator",
};

const ROLE_ROUTES: Partial<Record<AppRole, string>> = {
  admin: "/admin/users",
  coach: "/coach/dashboard",
  athlete: "/athlete",
  solo_plan_holder: "/plan",
};

const VIEW_AS_ROLE_COOKIE = "ep_view_as_role";

export default function RoleViewDropdown({
  roles,
  selectedRole,
}: {
  roles: AppRole[];
  selectedRole: AppRole | null;
}) {
  const router = useRouter();
  const canViewAllRoles = roles.includes("admin");
  const options: AppRole[] = canViewAllRoles
    ? ["admin", "coach", "athlete"]
    : roles.filter((role) => role !== "creator");

  if (options.length <= 1) return null;

  function handleChange(role: AppRole | "actual") {
    if (role === "actual") {
      document.cookie = `${VIEW_AS_ROLE_COOKIE}=; path=/; max-age=0; samesite=lax`;
      router.refresh();
      return;
    }

    document.cookie = `${VIEW_AS_ROLE_COOKIE}=${role}; path=/; max-age=2592000; samesite=lax`;
    router.push(ROLE_ROUTES[role] ?? "/");
    router.refresh();
  }

  return (
    <label className="role-view-switcher">
      <span className="role-view-switcher__label">View as</span>
      <select
        value={selectedRole ?? "actual"}
        onChange={(event) => handleChange(event.target.value as AppRole | "actual")}
        className="role-view-switcher__select"
      >
        <option value="actual">Actual roles</option>
        {options.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
    </label>
  );
}

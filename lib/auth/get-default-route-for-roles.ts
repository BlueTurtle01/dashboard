import type { AppRole } from "@/lib/auth/get-current-user";

export function getDefaultRouteForRoles(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("coach")) return "/coach/dashboard";
  if (roles.includes("athlete")) return "/athlete";
  if (roles.includes("solo_plan_holder")) return "/plan";
  return "/login";
}
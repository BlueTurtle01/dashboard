import type { AppRole } from "@/lib/auth/get-current-user";

export function getDefaultRouteForRoles(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("coach")) return "/coach";
  if (roles.includes("athlete")) return "/athlete";
  return "/login";
}
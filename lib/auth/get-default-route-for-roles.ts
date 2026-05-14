import type { AppRole } from "@/lib/types/auth";
import { getDefaultRouteForAccess } from "@/lib/auth/product-access";

export function getDefaultRouteForRoles(
  roles: AppRole[],
  options: { hasPlanAccess?: boolean } = {}
): string {
  return getDefaultRouteForAccess({ roles, hasPlanAccess: options.hasPlanAccess });
}

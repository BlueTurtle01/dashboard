import type { AppRole } from "@/lib/auth/get-current-user";
import { getDefaultRouteForAccess } from "@/lib/auth/product-access";

export function getDefaultRouteForRoles(
  roles: AppRole[],
  options: { hasPlanAccess?: boolean } = {}
): string {
  return getDefaultRouteForAccess({ roles, hasPlanAccess: options.hasPlanAccess });
}

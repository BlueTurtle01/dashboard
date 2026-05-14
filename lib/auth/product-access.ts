export const PRODUCT_CODES = [
  "solo_16_week_plan",
  "personalised_16_week_plan",
  "monthly_coaching",
] as const;

export type ProductCode = (typeof PRODUCT_CODES)[number];
export type ProductAccessStatus = "active" | "expired" | "cancelled" | "archived";
export type CoachingLevel = "none" | "limited" | "full";

type ProductAccessRow = {
  id: string;
  user_id: string;
  product_code: ProductCode;
  status: ProductAccessStatus;
  starts_at: string | null;
  ends_at: string | null;
};

function productCodeFromRow(row: ProductAccessRow): ProductCode | null {
  return row.product_code ?? null;
}

function isCurrentlyActive(row: { status: string; starts_at?: string | null; ends_at?: string | null }) {
  if (row.status !== "active") return false;

  const now = Date.now();
  if (row.starts_at && Date.parse(row.starts_at) > now) return false;
  if (row.ends_at && Date.parse(row.ends_at) < now) return false;

  return true;
}

export async function getActiveProductCodes(
  supabase: any,
  userId: string
): Promise<ProductCode[]> {
  const { data, error } = await supabase
    .from("user_product_access")
    .select("id, user_id, product_code, status, starts_at, ends_at")
    .eq("user_id", userId);

  if (error || !data) return [];

  return (data as ProductAccessRow[])
    .filter(isCurrentlyActive)
    .map(productCodeFromRow)
    .filter((code): code is ProductCode => Boolean(code));
}

export async function userHasActiveProduct(
  supabase: any,
  userId: string,
  productCodes: ProductCode[]
): Promise<boolean> {
  const activeCodes = await getActiveProductCodes(supabase, userId);
  return activeCodes.some((code) => productCodes.includes(code));
}

export async function userHasPlanAppAccess(supabase: any, userId: string): Promise<boolean> {
  return userHasActiveProduct(supabase, userId, [
    "solo_16_week_plan",
    "personalised_16_week_plan",
    "monthly_coaching",
  ]);
}

export async function getProductIdByCode(
  supabase: any,
  code: ProductCode
): Promise<string | null> {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

export function getDefaultRouteForAccess(options: {
  roles: string[];
  hasPlanAccess?: boolean;
}) {
  const { roles, hasPlanAccess = false } = options;

  if (roles.includes("admin")) return "/admin";
  if (roles.includes("coach")) return "/coach/dashboard";
  if (roles.includes("athlete")) return "/athlete";
  if (hasPlanAccess || roles.includes("solo_plan_holder")) return "/plan";
  return "/login";
}

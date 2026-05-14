export type Race = {
  id: string;
  name: string;
  location: string | null;
  distance_km: number | null;
  terrain_type: string | null;
};

type ProductAccessWithProduct = {
  product_id: string | null;
  products?: { race_id?: string | null } | { race_id?: string | null }[] | null;
};

type PlanRaceLink = {
  event_id: string | null;
  source_program_template_id: string | null;
  plan_json?: Record<string, unknown> | null;
};

function getNestedProductRaceId(accessValue: unknown) {
  const access = Array.isArray(accessValue)
    ? (accessValue[0] as ProductAccessWithProduct | undefined)
    : (accessValue as ProductAccessWithProduct | null | undefined);
  const product = Array.isArray(access?.products) ? access?.products[0] : access?.products;
  return product?.race_id ?? null;
}

export async function getLinkedRaceId(supabase: any, userId: string) {
  const { data: enrollment } = await supabase
    .from("plan_enrollments")
    .select(
      `
      race_id,
      athlete_plan_id,
      source_program_template_id,
      product_access:user_product_access (
        product_id,
        products:product_id (
          race_id
        )
      )
    `
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let raceId = enrollment?.race_id ?? getNestedProductRaceId(enrollment?.product_access);
  let activePlan: PlanRaceLink | null = null;

  if (!raceId) {
    const { data: plan } = await supabase
      .from("athlete_plans")
      .select("event_id, source_program_template_id, plan_json")
      .eq("athlete_user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    activePlan = (plan as PlanRaceLink | null) ?? null;
    raceId = activePlan?.event_id ?? null;
  }

  if (!raceId && enrollment?.athlete_plan_id) {
    const { data: plan } = await supabase
      .from("athlete_plans")
      .select("event_id, source_program_template_id, plan_json")
      .eq("id", enrollment.athlete_plan_id)
      .maybeSingle();

    activePlan = (plan as PlanRaceLink | null) ?? activePlan;
    raceId = activePlan?.event_id ?? null;
  }

  const sourceTemplateId =
    enrollment?.source_program_template_id ??
    activePlan?.source_program_template_id ??
    ((activePlan?.plan_json?.templateId as string | undefined) ?? null);

  if (!raceId && sourceTemplateId) {
    const { data: product } = await supabase
      .from("products")
      .select("race_id")
      .eq("template_id", sourceTemplateId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    raceId = product?.race_id ?? null;
  }

  if (!raceId) {
    const { data: profile } = await supabase
      .from("athlete_profiles")
      .select("selected_event_id")
      .eq("user_id", userId)
      .maybeSingle();

    raceId = profile?.selected_event_id ?? null;
  }

  return raceId ?? null;
}

export async function getLinkedRace(supabase: any, userId: string): Promise<Race | null> {
  const raceId = await getLinkedRaceId(supabase, userId);
  if (!raceId) return null;

  const { data } = await supabase
    .from("races")
    .select("id, name, location, distance_km, terrain_type")
    .eq("id", raceId)
    .maybeSingle();

  return (data as Race | null) ?? null;
}

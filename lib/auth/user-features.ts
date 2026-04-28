import { getCurrentUser } from "./get-current-user";
import { createClient } from "@/lib/supabase/server";

export type UserFeature = "race_info" | "video_analysis" | "vaccinations" | "kit_list";

export async function userHasFeature(feature: UserFeature): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_features")
    .select("feature")
    .eq("user_id", user.id)
    .eq("feature", feature)
    .maybeSingle();

  return !!data;
}

export async function getUserFeatures(): Promise<UserFeature[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_features")
    .select("feature")
    .eq("user_id", user.id);

  return (data?.map((row) => row.feature) ?? []) as UserFeature[];
}

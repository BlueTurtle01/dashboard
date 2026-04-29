"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdminOrThrow } from "@/lib/auth/get-current-user";

export async function grantFeature(userId: string, feature: string) {
  await requireAdminOrThrow();

  const supabase = await createClient();

  const { error } = await supabase.from("user_features").insert({
    user_id: userId,
    feature,
  });

  if (error) {
    throw new Error(`Failed to grant feature: ${error.message}`);
  }
}

export async function revokeFeature(userId: string, feature: string) {
  await requireAdminOrThrow();

  const supabase = await createClient();

  const { error } = await supabase
    .from("user_features")
    .delete()
    .eq("user_id", userId)
    .eq("feature", feature);

  if (error) {
    throw new Error(`Failed to revoke feature: ${error.message}`);
  }
}

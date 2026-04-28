"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";

async function requireAdmin() {
  const roles = await getCurrentUserRoles();
  if (!roles.includes("admin")) {
    throw new Error("Unauthorized: Admin role required");
  }
}

export async function grantFeature(userId: string, feature: string) {
  await requireAdmin();

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
  await requireAdmin();

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

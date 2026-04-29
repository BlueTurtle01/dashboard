"use server";

import { createClient } from "@/lib/supabase/server";
import { UserOnboardingRow } from "@/lib/onboarding/types";

/**
 * Fetch or create the user's onboarding state.
 * Called server-side when a layout needs the initial state before rendering the provider.
 */
export async function getOnboardingState(): Promise<UserOnboardingRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Try to fetch the user's onboarding row
  const { data } = await supabase
    .from("user_onboarding")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // If no row exists, create one (upsert pattern)
  if (!data) {
    const { data: newRow } = await supabase
      .from("user_onboarding")
      .insert({
        user_id: user.id,
        completed_step_ids: [],
        has_seen_tour: false,
        tour_version: 0,
      })
      .select()
      .single();

    return newRow as UserOnboardingRow;
  }

  return data as UserOnboardingRow;
}

/**
 * Mark a step as complete by appending its ID to the completed_step_ids array.
 * Idempotent — duplicate IDs are filtered out.
 */
export async function markStepComplete(stepId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // Fetch current state
  const { data } = await supabase
    .from("user_onboarding")
    .select("completed_step_ids")
    .eq("user_id", user.id)
    .single();

  if (!data) return;

  const currentSteps = data.completed_step_ids || [];
  // Add stepId if not already present
  const updated = Array.from(new Set([...currentSteps, stepId]));

  await supabase
    .from("user_onboarding")
    .update({ completed_step_ids: updated })
    .eq("user_id", user.id);
}

/**
 * Mark the tour as dismissed/completed.
 * Sets has_seen_tour=true and updates tour_version to currentVersion
 * so the user won't be re-prompted until the version bumps again.
 */
export async function dismissTour(currentVersion: number): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // Upsert: create if not exists, update if exists
  await supabase.from("user_onboarding").upsert(
    {
      user_id: user.id,
      has_seen_tour: true,
      tour_version: currentVersion,
    },
    { onConflict: "user_id" }
  );
}

/**
 * Reset the tour to its initial state (for manual restart / testing).
 * Clears completed_step_ids and sets has_seen_tour=false.
 */
export async function resetTour(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("user_onboarding")
    .update({
      completed_step_ids: [],
      has_seen_tour: false,
      tour_version: 0,
    })
    .eq("user_id", user.id);
}

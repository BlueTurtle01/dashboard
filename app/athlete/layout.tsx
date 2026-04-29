import { redirect } from "next/navigation";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";
import { createClient } from "@/lib/supabase/server";
import OnboardingProvider from "@/components/onboarding/OnboardingProvider";
import { athleteOnboardingConfig } from "@/lib/onboarding/athlete-steps";

export default async function AthleteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const roles = await getCurrentUserRoles();
  const canAccess = roles.includes("athlete") || roles.includes("solo_plan_holder");

  if (!canAccess) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let onboardingState = null;
  if (user) {
    const { data } = await supabase
      .from("user_onboarding")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      // Create initial row if it doesn't exist
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
      onboardingState = newRow;
    } else {
      onboardingState = data;
    }
  }

  return (
    <OnboardingProvider
      initialState={onboardingState}
      config={athleteOnboardingConfig}
      role="athlete"
    >
      <main className="app-content">
        {children}
      </main>
    </OnboardingProvider>
  );
}

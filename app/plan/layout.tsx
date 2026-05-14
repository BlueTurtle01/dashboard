import { redirect } from "next/navigation";
import { getCurrentUser, getUserRoles } from "@/lib/auth/core";
import { userHasPlanAppAccess } from "@/lib/auth/product-access";
import { createClient } from "@/lib/supabase/server";
import PwaTopBar from "@/components/pwa/PwaTopBar";
import PwaBottomNav from "@/components/pwa/PwaBottomNav";
import RegisterSW from "@/components/pwa/RegisterSW";

export const metadata = {
  title: "My Plan",
  description: "Your personalized training plan",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  other: {
    "theme-color": "#09090b",
  },
  manifest: "/plan-manifest.json",
};

export default async function PlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const roles = await getUserRoles();
  const supabase = await createClient();
  const canAccess =
    roles.includes("solo_plan_holder") ||
    (await userHasPlanAppAccess(supabase, user.id));

  if (!canAccess) {
    redirect("/login");
  }

  return (
    <>
      <PwaTopBar />
      <main className="pwa-content">
        {children}
      </main>
      <PwaBottomNav />
      <RegisterSW />
    </>
  );
}


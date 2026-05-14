import { redirect } from "next/navigation";
import { getCurrentUserEffectiveRoles } from "@/lib/auth/get-current-user";

export default async function PlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const roles = await getCurrentUserEffectiveRoles();
  const canAccess = roles.includes("solo_plan_holder");

  if (!canAccess) {
    redirect("/login");
  }

  return (
    <main className="app-content">
      {children}
    </main>
  );
}

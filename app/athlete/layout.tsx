import { redirect } from "next/navigation";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";
import AthleteNav from "@/components/AthleteNav";

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

  const isSoloPlanHolder = roles.includes("solo_plan_holder");

  return (
    <main className="app-content">
      <AthleteNav isSoloPlanHolder={isSoloPlanHolder} />
      {children}
    </main>
  );
}

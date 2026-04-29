import { redirect } from "next/navigation";
import { getCurrentUserRoles } from "@/lib/auth/get-current-user";

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

  return (
    <main className="app-content">
      {children}
    </main>
  );
}

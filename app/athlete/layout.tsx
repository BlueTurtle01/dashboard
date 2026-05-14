import { redirect } from "next/navigation";
import { getUserRoles } from "@/lib/auth/core";

export default async function AthleteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const roles = await getUserRoles();
  const canAccess = roles.includes("athlete");

  if (!canAccess) {
    redirect("/login");
  }

  return (
    <main className="app-content">
      {children}
    </main>
  );
}


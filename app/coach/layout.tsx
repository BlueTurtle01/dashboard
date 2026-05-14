import { redirect } from "next/navigation";
import { userHasEffectiveRole } from "@/lib/auth/get-current-user";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasCoachRole = await userHasEffectiveRole("coach");

  if (!hasCoachRole) {
    redirect("/login");
  }

  return <main className="app-content">{children}</main>;
}

import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasCoachRole = await userHasRole("coach");

  if (!hasCoachRole) {
    redirect("/login");
  }

  return <>{children}</>;
}
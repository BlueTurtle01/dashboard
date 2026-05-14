import { redirect } from "next/navigation";
import { userHasEffectiveRole } from "@/lib/auth/get-current-user";

export default async function ProgramTemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasCoachRole = await userHasEffectiveRole("coach");

  if (!hasCoachRole) {
    redirect("/coach/login");
  }

  return children;
}

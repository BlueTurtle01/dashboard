import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";

export default async function CreateWeekTemplateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAdmin = await userHasRole("admin");

  if (!isAdmin) {
    redirect("/coach/week-templates");
  }

  return <>{children}</>;
}

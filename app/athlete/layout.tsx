import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import AthleteNav from "@/components/AthleteNav";

export default async function AthleteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasAthleteRole = await userHasRole("athlete");

  if (!hasAthleteRole) {
    redirect("/login");
  }

  return (
    <>
      <AthleteNav />
      {children}
    </>
  );
}

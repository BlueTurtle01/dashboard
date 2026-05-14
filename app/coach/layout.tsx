import { requireAuth } from "@/lib/auth/core";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth("coach");

  return <main className="app-content">{children}</main>;
}


import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import { getUserById } from "@/lib/actions/userRoles";
import UserDetailClient from "./UserDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const isAdmin = await userHasRole("admin");
  if (!isAdmin) redirect("/login");

  const { userId } = await params;

  let user;
  try {
    user = await getUserById(userId);
  } catch (err) {
    return (
      <main style={{ padding: "40px 24px" }}>
        <p style={{ color: "#b00020" }}>
          {err instanceof Error ? err.message : "Failed to load user."}
        </p>
      </main>
    );
  }

  return <UserDetailClient user={user} />;
}

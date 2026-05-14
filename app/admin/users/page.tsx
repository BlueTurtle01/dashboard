import { redirect } from "next/navigation";
import { userHasRole } from "@/lib/auth/get-current-user";
import { listUsersWithRoles, UserWithRoles } from "@/lib/actions/userRoles";
import UserRolesTable from "./UserRolesTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const isAdmin = await userHasRole("admin");
  if (!isAdmin) redirect("/login");

  let users: UserWithRoles[] = [];
  let loadError: string | null = null;

  try {
    users = await listUsersWithRoles();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error";
    console.error("Error loading users:", err);
    users = [];
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>User Management</h1>
        <p style={subtitleStyle}>
          {users.length} user{users.length !== 1 ? "s" : ""}
        </p>

        {loadError ? (
          <div style={errorStyle}>
            <p><strong>Error loading users:</strong></p>
            <p style={{ fontFamily: "monospace", marginTop: "8px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {loadError}
            </p>
          </div>
        ) : (
          <UserRolesTable users={users} />
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "32px 24px",
  background: "#f5f5f5",
};

const cardStyle: React.CSSProperties = {
  maxWidth: "900px",
  margin: "0 auto",
  background: "#fff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const titleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  marginBottom: "4px",
};

const subtitleStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "14px",
  marginBottom: "24px",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  padding: "16px",
  background: "#fff0f0",
  borderRadius: "8px",
};

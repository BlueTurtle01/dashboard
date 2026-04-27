import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, userHasRole } from "@/lib/auth/get-current-user";
import { getAllTickets, SupportTicket } from "@/lib/actions/support";
import AdminSupportTable from "./AdminSupportTable";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  const isAdmin = await userHasRole("admin");
  if (!isAdmin) redirect("/login");

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  let tickets: SupportTicket[] = [];
  let loadError: string | null = null;

  try {
    tickets = await getAllTickets();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error";
  }

  const openCount = tickets.filter((t) => t.status === "open").length;
  const urgentCount = tickets.filter((t) => t.urgency === "urgent").length;

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={pageHeaderRow}>
          <h1 style={titleStyle}>Support Tickets</h1>
          <Link href="/admin/support/stats" style={analyticsLinkStyle}>
            Analytics →
          </Link>
        </div>
        <div style={statsRow}>
          <div style={statChip}>
            <span style={statNum}>{tickets.length}</span>
            <span style={statLabel}>Total</span>
          </div>
          <div style={{ ...statChip, borderColor: "#2563eb" }}>
            <span style={{ ...statNum, color: "#2563eb" }}>{openCount}</span>
            <span style={statLabel}>Open</span>
          </div>
          <div style={{ ...statChip, borderColor: "#7c3aed" }}>
            <span style={{ ...statNum, color: "#7c3aed" }}>{urgentCount}</span>
            <span style={statLabel}>Urgent</span>
          </div>
        </div>

        {loadError ? (
          <p style={errorStyle}>{loadError}</p>
        ) : (
          <AdminSupportTable tickets={tickets} currentUserId={currentUser.id} />
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
  maxWidth: "1100px",
  margin: "0 auto",
  background: "#fff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const pageHeaderRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
  gap: "16px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  margin: 0,
};

const analyticsLinkStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#111",
  textDecoration: "none",
  padding: "8px 16px",
  border: "1px solid #ddd",
  borderRadius: "8px",
};

const statsRow: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginBottom: "24px",
  flexWrap: "wrap",
};

const statChip: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "12px 24px",
  border: "1px solid #e5e5e5",
  borderRadius: "10px",
  minWidth: "80px",
};

const statNum: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  lineHeight: 1,
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  color: "#888",
  marginTop: "4px",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  padding: "16px",
  background: "#fff0f0",
  borderRadius: "8px",
};

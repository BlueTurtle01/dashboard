import { redirect } from "next/navigation";
import Link from "next/link";
import { userHasRole } from "@/lib/auth/get-current-user";
import { getTicketStats, TicketStats } from "@/lib/actions/support";
import SupportStatsView from "./SupportStatsView";

export const dynamic = "force-dynamic";

export default async function SupportStatsPage() {
  const isAdmin = await userHasRole("admin");
  if (!isAdmin) redirect("/login");

  let stats: TicketStats | null = null;
  let loadError: string | null = null;

  try {
    stats = await getTicketStats();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerRow}>
          <div>
            <h1 style={titleStyle}>Support Analytics</h1>
            <p style={subtitleStyle}>Resolution times and ticket breakdown</p>
          </div>
          <Link href="/admin/support" style={backLink}>
            ← All Tickets
          </Link>
        </div>

        {loadError ? (
          <p style={errorStyle}>{loadError}</p>
        ) : stats ? (
          <SupportStatsView stats={stats} />
        ) : null}
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

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "28px",
  gap: "16px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "14px",
  margin: "4px 0 0",
};

const backLink: React.CSSProperties = {
  fontSize: "14px",
  color: "#555",
  textDecoration: "none",
  padding: "8px 16px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  whiteSpace: "nowrap",
  alignSelf: "flex-start",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  padding: "16px",
  background: "#fff0f0",
  borderRadius: "8px",
};

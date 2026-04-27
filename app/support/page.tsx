import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyTickets, SupportTicket } from "@/lib/actions/support";
import SupportPageClient from "./SupportPageClient";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let tickets: SupportTicket[] = [];
  try {
    tickets = await getMyTickets();
  } catch {
    // start with empty list
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={pageHeaderStyle}>
          <div>
            <h1 style={titleStyle}>Support</h1>
            <p style={subtitleStyle}>
              Get help from our team. Track your tickets below.
            </p>
          </div>
        </div>

        <SupportPageClient initialTickets={tickets} currentUserId={user.id} />
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
  maxWidth: "720px",
  margin: "0 auto",
  background: "#fff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const pageHeaderStyle: React.CSSProperties = {
  marginBottom: "28px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  marginBottom: "4px",
  marginTop: 0,
};

const subtitleStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "14px",
  margin: 0,
};

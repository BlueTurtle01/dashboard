"use client";

import { useState } from "react";
import SupportTicketForm from "./SupportTicketForm";
import MyTickets from "./MyTickets";
import { SupportTicket } from "@/lib/actions/support";

type Tab = "new" | "mine";

export default function SupportPageClient({
  initialTickets,
  currentUserId,
}: {
  initialTickets: SupportTicket[];
  currentUserId: string;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);
  const [successMsg, setSuccessMsg] = useState(false);

  async function handleTicketCreated() {
    setSuccessMsg(true);
    setTab("mine");

    // Refresh tickets list
    try {
      const res = await fetch("/support/api/my-tickets");
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      }
    } catch {
      // silently ignore — user can reload
    }

    setTimeout(() => setSuccessMsg(false), 4000);
  }

  return (
    <div>
      {/* Tabs */}
      <div style={tabsRow}>
        <button
          style={{ ...tabBtn, ...(tab === "new" ? tabBtnActive : {}) }}
          onClick={() => setTab("new")}
        >
          New Ticket
        </button>
        <button
          style={{ ...tabBtn, ...(tab === "mine" ? tabBtnActive : {}) }}
          onClick={() => setTab("mine")}
        >
          My Tickets
          {tickets.filter((t) => t.status === "open" || t.status === "in_progress").length > 0 && (
            <span style={tabBadge}>
              {tickets.filter((t) => t.status === "open" || t.status === "in_progress").length}
            </span>
          )}
        </button>
      </div>

      {successMsg && (
        <div style={successStyle}>
          Ticket submitted successfully. We will be in touch soon.
        </div>
      )}

      {tab === "new" ? (
        <SupportTicketForm onSuccess={handleTicketCreated} />
      ) : (
        <MyTickets tickets={tickets} currentUserId={currentUserId} />
      )}
    </div>
  );
}

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  marginBottom: "24px",
  borderBottom: "2px solid #f0f0f0",
  paddingBottom: "0",
};

const tabBtn: React.CSSProperties = {
  padding: "10px 20px",
  border: "none",
  borderBottom: "2px solid transparent",
  background: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "14px",
  color: "#888",
  marginBottom: "-2px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const tabBtnActive: React.CSSProperties = {
  color: "#111",
  borderBottom: "2px solid #111",
};

const tabBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#111",
  color: "#fff",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 700,
  minWidth: "18px",
  height: "18px",
  padding: "0 5px",
};

const successStyle: React.CSSProperties = {
  background: "#d1fae5",
  color: "#065f46",
  padding: "12px 16px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "20px",
  border: "1px solid #a7f3d0",
};

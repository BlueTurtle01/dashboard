"use client";

import { useState } from "react";
import { TutorialProvider, useTutorial } from "@/lib/context/TutorialContext";
import TutorialInfoBox from "@/components/tutorial/TutorialInfoBox";
import SupportTicketForm from "./SupportTicketForm";
import MyTickets from "./MyTickets";
import { SupportTicket } from "@/lib/actions/support";

type Tab = "new" | "mine";

function SupportPageContent({
  initialTickets,
  currentUserId,
}: {
  initialTickets: SupportTicket[];
  currentUserId: string;
}) {
  const { isInTutorial } = useTutorial();
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
      {isInTutorial && (
        <div style={{ marginBottom: "20px" }}>
          <TutorialInfoBox
            title="Getting Help & Support"
            description="Use this page to report issues, ask questions, or request features. Create new tickets for quick support, or view all your open and resolved tickets."
            step={1}
            totalSteps={2}
            showNext={false}
          />
        </div>
      )}

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

      {isInTutorial && tab === "new" && (
        <div style={{ marginBottom: "20px" }}>
          <TutorialInfoBox
            title="Create a Support Ticket"
            description="Describe your issue, question, or feature request. Our team will review your ticket and respond as soon as possible."
            step={2}
            totalSteps={2}
            showNext={false}
          />
        </div>
      )}

      {isInTutorial && tab === "mine" && (
        <div style={{ marginBottom: "20px" }}>
          <TutorialInfoBox
            title="Track Your Support Tickets"
            description="View all your submitted tickets here. You can see the status of each ticket and follow up on responses from our support team."
            step={2}
            totalSteps={2}
            showNext={false}
          />
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

export default function SupportPageClient({
  initialTickets,
  currentUserId,
  tutorial,
}: {
  initialTickets: SupportTicket[];
  currentUserId: string;
  tutorial?: string;
}) {
  const isInTutorial = tutorial === "support";

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="support">
      <SupportPageContent initialTickets={initialTickets} currentUserId={currentUserId} />
    </TutorialProvider>
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

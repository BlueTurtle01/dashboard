"use client";

import { useState } from "react";
import { SupportTicket, TicketStatus } from "@/lib/actions/support";
import TicketThread from "@/components/TicketThread";

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical Issue",
  billing: "Billing",
  coaching: "Coaching",
  account: "Account",
  feedback: "Feedback",
  other: "Other",
};

const URGENCY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLORS: Record<TicketStatus, { bg: string; text: string }> = {
  open: { bg: "#dbeafe", text: "#1d4ed8" },
  in_progress: { bg: "#fef3c7", text: "#92400e" },
  resolved: { bg: "#d1fae5", text: "#065f46" },
  closed: { bg: "#f3f4f6", text: "#6b7280" },
};

const URGENCY_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

export default function MyTickets({
  tickets: initial,
  currentUserId,
}: {
  tickets: SupportTicket[];
  currentUserId: string;
}) {
  const [tickets] = useState<SupportTicket[]>(initial);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (tickets.length === 0) {
    return (
      <div style={emptyStyle}>
        <p style={emptyTextStyle}>You have not submitted any support tickets yet.</p>
      </div>
    );
  }

  return (
    <div style={listStyle}>
      {tickets.map((ticket) => {
        const isOpen = expanded === ticket.id;
        const colors = STATUS_COLORS[ticket.status];
        return (
          <div key={ticket.id} style={cardStyle}>
            <button
              style={cardHeaderStyle}
              onClick={() => setExpanded(isOpen ? null : ticket.id)}
            >
              <div style={cardHeaderLeft}>
                <span style={{ ...statusBadge, background: colors.bg, color: colors.text }}>
                  {STATUS_LABELS[ticket.status]}
                </span>
                <span style={subjectTextStyle}>{ticket.subject}</span>
              </div>
              <div style={cardHeaderRight}>
                <span style={dateStyle}>
                  {new Date(ticket.created_at).toLocaleDateString()}
                </span>
                <span style={chevronStyle}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </button>

            {isOpen && (
              <div style={cardBodyStyle}>
                <div style={metaGridStyle}>
                  <div style={metaItemStyle}>
                    <span style={metaKeyStyle}>Category</span>
                    <span style={metaValStyle}>{CATEGORY_LABELS[ticket.category]}</span>
                  </div>
                  <div style={metaItemStyle}>
                    <span style={metaKeyStyle}>Urgency</span>
                    <span style={{ ...metaValStyle, color: URGENCY_COLORS[ticket.urgency], fontWeight: 600 }}>
                      {URGENCY_LABELS[ticket.urgency]}
                    </span>
                  </div>
                  <div style={metaItemStyle}>
                    <span style={metaKeyStyle}>Status</span>
                    <span style={{ ...metaValStyle, color: colors.text, fontWeight: 600 }}>
                      {STATUS_LABELS[ticket.status]}
                    </span>
                  </div>
                  {ticket.resolved_at && (
                    <div style={metaItemStyle}>
                      <span style={metaKeyStyle}>Resolved</span>
                      <span style={metaValStyle}>
                        {new Date(ticket.resolved_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div style={sectionLabel}>Your Description</div>
                <p style={descStyle}>{ticket.description}</p>

                {ticket.resolution && (
                  <>
                    <div style={resolutionHeaderStyle}>Resolution</div>
                    <div style={resolutionBoxStyle}>
                      <p style={resolutionTextStyle}>{ticket.resolution}</p>
                    </div>
                  </>
                )}

                <TicketThread
                  ticketId={ticket.id}
                  currentUserId={currentUserId}
                  isAdmin={false}
                  ticketClosed={ticket.status === "closed"}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };

const emptyStyle: React.CSSProperties = {
  padding: "32px",
  textAlign: "center",
  border: "1px dashed #ddd",
  borderRadius: "10px",
};

const emptyTextStyle: React.CSSProperties = { color: "#888", margin: 0, fontSize: "14px" };

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: "10px",
  overflow: "hidden",
};

const cardHeaderStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  background: "none",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  gap: "12px",
};

const cardHeaderLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flex: 1,
  minWidth: 0,
};

const cardHeaderRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexShrink: 0,
};

const statusBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const subjectTextStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#111",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const dateStyle: React.CSSProperties = { fontSize: "12px", color: "#888" };
const chevronStyle: React.CSSProperties = { fontSize: "10px", color: "#aaa" };

const cardBodyStyle: React.CSSProperties = {
  padding: "0 18px 18px",
  borderTop: "1px solid #f0f0f0",
};

const metaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: "12px",
  marginTop: "14px",
  marginBottom: "16px",
};

const metaItemStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "2px" };

const metaKeyStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const metaValStyle: React.CSSProperties = { fontSize: "13px", color: "#333" };

const sectionLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "6px",
};

const descStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#444",
  margin: 0,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const resolutionHeaderStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#065f46",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: "16px",
  marginBottom: "6px",
};

const resolutionBoxStyle: React.CSSProperties = {
  background: "#d1fae5",
  borderRadius: "8px",
  padding: "12px 14px",
  border: "1px solid #a7f3d0",
};

const resolutionTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#065f46",
  margin: 0,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

"use client";

import { useState } from "react";
import {
  SupportTicket,
  TicketStatus,
  updateTicketStatus,
} from "@/lib/actions/support";
import TicketThread from "@/components/TicketThread";

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
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

const URGENCY_COLORS: Record<string, string> = {
  low: "#888",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: "#2563eb",
  in_progress: "#d97706",
  resolved: "#0a7f3f",
  closed: "#888",
};

type DetailModal = {
  ticket: SupportTicket;
  resolution: string;
  status: TicketStatus;
  saving: boolean;
  error: string | null;
};

export default function AdminSupportTable({
  tickets: initial,
  currentUserId,
}: {
  tickets: SupportTicket[];
  currentUserId: string;
}) {
  const [tickets, setTickets] = useState<SupportTicket[]>(initial);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "all">("all");
  const [modal, setModal] = useState<DetailModal | null>(null);

  const filtered = tickets.filter((t) => {
    const matchSearch =
      t.user_email.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function openModal(ticket: SupportTicket) {
    setModal({
      ticket,
      resolution: ticket.resolution ?? "",
      status: ticket.status,
      saving: false,
      error: null,
    });
  }

  function closeModal() {
    setModal(null);
  }

  async function handleSave() {
    if (!modal) return;
    setModal((m) => m && { ...m, saving: true, error: null });

    const result = await updateTicketStatus(
      modal.ticket.id,
      modal.status,
      modal.resolution || undefined
    );

    if (result.error) {
      setModal((m) => m && { ...m, saving: false, error: result.error! });
      return;
    }

    setTickets((prev) =>
      prev.map((t) =>
        t.id === modal.ticket.id
          ? {
              ...t,
              status: modal.status,
              resolution: modal.resolution || null,
              updated_at: new Date().toISOString(),
              resolved_at:
                modal.status === "resolved" || modal.status === "closed"
                  ? new Date().toISOString()
                  : t.resolved_at,
            }
          : t
      )
    );
    closeModal();
  }

  return (
    <div>
      {/* Filters */}
      <div style={filtersRow}>
        <input
          type="search"
          placeholder="Search by email or subject..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchStyle}
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TicketStatus | "all")}
          style={selectFilterStyle}
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>User</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Urgency</th>
              <th style={{ ...thStyle, textAlign: "left" }}>Subject</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ticket) => (
              <tr key={ticket.id} style={trStyle}>
                <td style={tdStyle}>{ticket.user_email}</td>
                <td style={tdCenterStyle}>{CATEGORY_LABELS[ticket.category]}</td>
                <td style={tdCenterStyle}>
                  <span
                    style={{
                      ...badgeStyle,
                      color: URGENCY_COLORS[ticket.urgency],
                      borderColor: URGENCY_COLORS[ticket.urgency],
                    }}
                  >
                    {URGENCY_LABELS[ticket.urgency]}
                  </span>
                </td>
                <td style={tdStyle}>{ticket.subject}</td>
                <td style={tdCenterStyle}>
                  <span
                    style={{
                      ...badgeStyle,
                      color: STATUS_COLORS[ticket.status],
                      borderColor: STATUS_COLORS[ticket.status],
                    }}
                  >
                    {STATUS_LABELS[ticket.status]}
                  </span>
                </td>
                <td style={tdCenterStyle}>
                  {new Date(ticket.created_at).toLocaleDateString()}
                </td>
                <td style={tdCenterStyle}>
                  <button onClick={() => openModal(ticket)} style={viewBtnStyle}>
                    View
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={emptyStyle}>
                  No tickets found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {modal && (
        <div style={overlayStyle} onClick={closeModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>Ticket Detail</h2>
              <button onClick={closeModal} style={closeBtnStyle}>✕</button>
            </div>

            <div style={metaRow}>
              <span style={metaLabel}>From:</span>
              <span>{modal.ticket.user_email}</span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Category:</span>
              <span>{CATEGORY_LABELS[modal.ticket.category]}</span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Urgency:</span>
              <span style={{ color: URGENCY_COLORS[modal.ticket.urgency], fontWeight: 600 }}>
                {URGENCY_LABELS[modal.ticket.urgency]}
              </span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Submitted:</span>
              <span>{new Date(modal.ticket.created_at).toLocaleString()}</span>
            </div>

            <div style={sectionLabel}>Subject</div>
            <p style={subjectStyle}>{modal.ticket.subject}</p>

            <div style={sectionLabel}>Description</div>
            <p style={descStyle}>{modal.ticket.description}</p>

            <div style={sectionLabel}>Status</div>
            <select
              value={modal.status}
              onChange={(e) =>
                setModal((m) => m && { ...m, status: e.target.value as TicketStatus })
              }
              style={selectStyle}
            >
              {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <div style={sectionLabel}>Resolution / Notes</div>
            <textarea
              value={modal.resolution}
              onChange={(e) =>
                setModal((m) => m && { ...m, resolution: e.target.value })
              }
              placeholder="Add resolution notes for the user..."
              style={textareaStyle}
              rows={4}
            />

            {modal.error && <p style={errorStyle}>{modal.error}</p>}

            <div style={modalFooterStyle}>
              <button onClick={closeModal} style={cancelBtnStyle}>
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={modal.saving}
                style={saveBtnStyle}
              >
                {modal.saving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            <TicketThread
              ticketId={modal.ticket.id}
              currentUserId={currentUserId}
              isAdmin={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const filtersRow: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginBottom: "20px",
  flexWrap: "wrap",
};

const searchStyle: React.CSSProperties = {
  flex: 1,
  minWidth: "200px",
  padding: "10px 14px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
};

const selectFilterStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  background: "#fff",
  cursor: "pointer",
};

const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "2px solid #e5e5e5",
  fontWeight: 600,
  whiteSpace: "nowrap",
  textAlign: "center",
  color: "#444",
};

const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#111",
  wordBreak: "break-all",
};

const tdCenterStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: "999px",
  border: "1px solid",
  fontSize: "12px",
  fontWeight: 600,
};

const emptyStyle: React.CSSProperties = {
  padding: "24px",
  textAlign: "center",
  color: "#888",
};

const viewBtnStyle: React.CSSProperties = {
  padding: "5px 14px",
  border: "none",
  borderRadius: "6px",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  padding: "28px",
  width: "100%",
  maxWidth: "560px",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
};

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const modalTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  margin: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "18px",
  cursor: "pointer",
  color: "#888",
  lineHeight: 1,
};

const metaRow: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  fontSize: "14px",
  marginBottom: "8px",
  color: "#333",
};

const metaLabel: React.CSSProperties = {
  fontWeight: 600,
  minWidth: "80px",
  color: "#666",
};

const sectionLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginTop: "16px",
  marginBottom: "6px",
};

const subjectStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  margin: 0,
  color: "#111",
};

const descStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#444",
  margin: 0,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  background: "#fff",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  resize: "vertical",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  fontSize: "13px",
  marginTop: "8px",
};

const modalFooterStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  justifyContent: "flex-end",
  marginTop: "20px",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  background: "#fff",
  color: "#333",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#111",
  color: "#fff",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
};

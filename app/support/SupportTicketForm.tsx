"use client";

import { useState } from "react";
import { createSupportTicket, TicketCategory, TicketUrgency } from "@/lib/actions/support";

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "technical", label: "Technical Issue" },
  { value: "billing", label: "Billing" },
  { value: "coaching", label: "Coaching" },
  { value: "account", label: "Account" },
  { value: "feedback", label: "Feedback" },
  { value: "other", label: "Other" },
];

const URGENCIES: { value: TicketUrgency; label: string; desc: string }[] = [
  { value: "low", label: "Low", desc: "No immediate impact" },
  { value: "medium", label: "Medium", desc: "Affects my workflow" },
  { value: "high", label: "High", desc: "Significantly impacted" },
  { value: "urgent", label: "Urgent", desc: "Cannot use the platform" },
];

export default function SupportTicketForm({ onSuccess }: { onSuccess: () => void }) {
  const [category, setCategory] = useState<TicketCategory>("technical");
  const [urgency, setUrgency] = useState<TicketUrgency>("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);

    const result = await createSupportTicket({ category, urgency, subject, description });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSubject("");
    setDescription("");
    setCategory("technical");
    setUrgency("medium");
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <h2 style={formTitleStyle}>Submit a Support Ticket</h2>
      <p style={formSubtitleStyle}>
        Describe your issue and we'll get back to you as soon as possible.
      </p>

      <div style={fieldGroup}>
        <label style={labelStyle}>Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory)}
          style={selectStyle}
          required
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div style={fieldGroup}>
        <label style={labelStyle}>Urgency</label>
        <div style={urgencyGrid}>
          {URGENCIES.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => setUrgency(u.value)}
              style={{
                ...urgencyBtnStyle,
                ...(urgency === u.value ? urgencyBtnActiveStyle : {}),
              }}
            >
              <span style={urgencyLabelStyle}>{u.label}</span>
              <span style={urgencyDescStyle}>{u.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={fieldGroup}>
        <label style={labelStyle}>Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of your issue"
          style={inputStyle}
          required
          maxLength={200}
        />
      </div>

      <div style={fieldGroup}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Please describe the issue in detail..."
          style={textareaStyle}
          rows={5}
          required
        />
      </div>

      {error && <p style={errorStyle}>{error}</p>}

      <button type="submit" disabled={submitting} style={submitBtnStyle}>
        {submitting ? "Submitting..." : "Submit Ticket"}
      </button>
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0",
};

const formTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  marginBottom: "6px",
  marginTop: 0,
};

const formSubtitleStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#666",
  marginBottom: "24px",
  marginTop: 0,
};

const fieldGroup: React.CSSProperties = {
  marginBottom: "20px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "#444",
  marginBottom: "8px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  background: "#fff",
  cursor: "pointer",
};

const urgencyGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "8px",
};

const urgencyBtnStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  transition: "border-color 0.15s, background 0.15s",
};

const urgencyBtnActiveStyle: React.CSSProperties = {
  border: "2px solid #111",
  background: "#f8f8f8",
};

const urgencyLabelStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#111",
};

const urgencyDescStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#888",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
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
  marginBottom: "12px",
};

const submitBtnStyle: React.CSSProperties = {
  padding: "12px 24px",
  border: "none",
  borderRadius: "8px",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  fontSize: "15px",
  cursor: "pointer",
  alignSelf: "flex-start",
};

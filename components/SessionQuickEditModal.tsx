"use client";

import { PlanSession, PlanSessionType } from "@/lib/planner/types";

const sessionTypeOptions: PlanSessionType[] = ["Easy", "Steady", "Long", "Recovery", "Rest", "Gym"];

export default function SessionQuickEditModal({
  session,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: {
  session: PlanSession | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (session: PlanSession) => void;
  onDelete: (sessionId: string) => void;
}) {
  if (!isOpen || !session) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "560px",
          borderRadius: "16px",
          background: "#ffffff",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700 }}>Quick Edit Session</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              padding: "6px 10px",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: "grid", gap: "16px" }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Type</div>
            <select
              value={session.type}
              onChange={(e) => onSave({ ...session, type: e.target.value as PlanSessionType })}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "12px" }}
            >
              {sessionTypeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "block" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Name</div>
            <input
              value={session.name ?? ""}
              onChange={(e) => onSave({ ...session, name: e.target.value })}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "12px" }}
            />
          </label>

          <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "1fr 1fr" }}>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Duration</div>
              <input
                value={session.duration ?? ""}
                onChange={(e) => onSave({ ...session, duration: e.target.value })}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "12px" }}
              />
            </label>

            <label style={{ display: "block" }}>
              <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Intensity</div>
              <input
                value={session.intensity ?? ""}
                onChange={(e) => onSave({ ...session, intensity: e.target.value })}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: "10px", padding: "12px" }}
              />
            </label>
          </div>

          <label style={{ display: "block" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Description</div>
            <textarea
              value={session.description ?? ""}
              onChange={(e) => onSave({ ...session, description: e.target.value })}
              style={{ width: "100%", minHeight: "120px", border: "1px solid #d1d5db", borderRadius: "10px", padding: "12px" }}
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px" }}>
          <button
            type="button"
            onClick={() => onDelete(session.id)}
            style={{
              border: "1px solid #fca5a5",
              color: "#b91c1c",
              borderRadius: "10px",
              padding: "10px 14px",
              background: "#ffffff",
              cursor: "pointer",
            }}
          >
            Delete Session
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "10px",
              padding: "10px 14px",
              background: "#111827",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

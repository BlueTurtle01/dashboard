"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface PlanVersion {
  id: string;
  version_number: number;
  name: string | null;
  notes: string | null;
  created_at: string;
  is_current: boolean;
}

export default function PlanVersionsPage() {
  const supabase = createClient();
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("plan_versions")
      .select("*")
      .order("version_number", { ascending: false })
      .then(({ data }) => {
        setVersions(data ?? []);
        setLoading(false);
      });
  }, []);

  function startEdit(v: PlanVersion) {
    setEditingId(v.id);
    setEditName(v.name ?? "");
    setEditNotes(v.notes ?? "");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await supabase
      .from("plan_versions")
      .update({ name: editName.trim() || null, notes: editNotes.trim() || null })
      .eq("id", id);
    setVersions(vs =>
      vs.map(v => v.id === id ? { ...v, name: editName.trim() || null, notes: editNotes.trim() || null } : v)
    );
    setEditingId(null);
    setSaving(false);
  }

  async function markCurrent(id: string) {
    await supabase.from("plan_versions").update({ is_current: false }).gte("version_number", 0);
    await supabase.from("plan_versions").update({ is_current: true }).eq("id", id);
    setVersions(vs => vs.map(v => ({ ...v, is_current: v.id === id })));
  }

  if (loading) {
    return <div style={{ padding: 32, fontFamily: "system-ui,sans-serif", color: "#888" }}>Loading…</div>;
  }

  const nextVersionNum = versions.length > 0 ? Math.max(...versions.map(v => v.version_number)) + 1 : 1;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e3a1e" }}>
          Race Readiness Plan Versions
        </h1>
        <p style={{ margin: "8px 0 0", color: "#666", fontSize: 13, lineHeight: 1.6 }}>
          Each version is a snapshot of <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>app/admin/race-readiness/page.tsx</code> at
          the time it was archived. Old versions stay live at their own URL so you can regenerate
          reports using past logic.
        </p>
      </div>

      {/* Version list */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
        {versions.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            No versions archived yet.
          </div>
        ) : (
          versions.map((v, i) => (
            <div
              key={v.id}
              style={{
                padding: "16px 20px",
                borderBottom: i < versions.length - 1 ? "1px solid #f3f4f6" : "none",
                background: v.is_current ? "#f0fdf4" : "#fff",
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

                {/* Left: version info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: "#1e3a1e" }}>v{v.version_number}</span>
                    {v.is_current && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: "#166534", color: "#fff", borderRadius: 4, padding: "2px 7px", letterSpacing: "0.04em" }}>
                        CURRENT
                      </span>
                    )}
                    {v.name && (
                      <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{v.name}</span>
                    )}
                    <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>
                      {new Date(v.created_at).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                  </div>

                  {editingId === v.id ? (
                    <div>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="Version name (e.g. Added terrain section)"
                        style={{
                          width: "100%", boxSizing: "border-box",
                          padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6,
                          fontSize: 13, marginBottom: 6, outline: "none",
                        }}
                      />
                      <textarea
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        placeholder="Describe what changed in this version…"
                        rows={4}
                        style={{
                          width: "100%", boxSizing: "border-box",
                          padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6,
                          fontSize: 13, resize: "vertical", outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => saveEdit(v.id)}
                          disabled={saving}
                          style={{
                            padding: "5px 14px", background: "#1e3a1e", color: "#fff",
                            border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer",
                            opacity: saving ? 0.6 : 1,
                          }}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: "5px 14px", background: "#f3f4f6", color: "#555",
                            border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: v.notes ? "#444" : "#9ca3af", lineHeight: 1.6 }}>
                      {v.notes ?? "No notes — click Edit to add a description of what changed."}
                    </p>
                  )}
                </div>

                {/* Right: actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                  <a
                    href={`/admin/race-readiness/v${v.version_number}`}
                    style={{ fontSize: 13, color: "#2563eb", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}
                  >
                    Open v{v.version_number} →
                  </a>
                  {editingId !== v.id && (
                    <button
                      onClick={() => startEdit(v)}
                      style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Edit notes
                    </button>
                  )}
                  {!v.is_current && (
                    <button
                      onClick={() => markCurrent(v.id)}
                      style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    >
                      Mark current
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* How-to box */}
      <div style={{
        padding: "14px 18px", background: "#f9fafb", border: "1px solid #e5e7eb",
        borderRadius: 8, fontSize: 13, color: "#6b7280", lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>
          Creating version {nextVersionNum}
        </div>
        <div>
          Once you&apos;re happy with the current report, run this in the project directory:
        </div>
        <pre style={{
          margin: "8px 0", padding: "8px 12px", background: "#1e3a1e", color: "#86efac",
          borderRadius: 6, fontSize: 12, overflowX: "auto",
        }}>
          npm run version:save &quot;Describe what changed&quot;
        </pre>
        <div>
          Then commit the new <code style={{ background: "#fff", padding: "0 4px", borderRadius: 3, border: "1px solid #e5e7eb" }}>v{nextVersionNum}/</code> directory and
          deploy. It will be live at{" "}
          <code style={{ background: "#fff", padding: "0 4px", borderRadius: 3, border: "1px solid #e5e7eb" }}>
            /admin/race-readiness/v{nextVersionNum}
          </code>.
        </div>
      </div>
    </div>
  );
}

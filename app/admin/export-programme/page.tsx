"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TemplateRow = {
  id: string;
  name: string;
  event_goal: string | null;
  discipline: string | null;
  plan_length_weeks: number;
  training_days_per_week: number;
  is_active: boolean;
  updated_at: string | null;
};

export default function ExportProgrammePage() {
  const router = useRouter();
  const supabase = createClient();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("program_templates")
        .select("id, name, event_goal, discipline, plan_length_weeks, training_days_per_week, is_active, updated_at")
        .order("updated_at", { ascending: false });

      if (error) {
        setErrorMessage(`Could not load templates: ${error.message}`);
      } else {
        setTemplates((data ?? []) as TemplateRow[]);
      }
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.event_goal ?? "").toLowerCase().includes(q) ||
        (t.discipline ?? "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  return (
    <main style={page}>
      <div style={container}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Export Programme</h1>
            <p style={subtitle}>Select a programme template to preview and export as PDF.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={secondaryBtn}>
            Back to Admin
          </button>
        </div>

        {errorMessage && <p style={errorStyle}>{errorMessage}</p>}

        <section style={card}>
          <div style={filterRow}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, event goal or discipline..."
              style={searchInput}
            />
            <span style={count}>{filtered.length} template{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {loading ? (
            <p style={helper}>Loading templates...</p>
          ) : filtered.length === 0 ? (
            <p style={helper}>No templates found.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Name</th>
                    <th style={th}>Event Goal</th>
                    <th style={th}>Discipline</th>
                    <th style={th}>Length</th>
                    <th style={th}>Days/Week</th>
                    <th style={th}>Status</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div style={{ color: "#999", fontSize: "11px", fontFamily: "monospace" }}>{t.id}</div>
                      </td>
                      <td style={td}>{t.event_goal ?? <span style={{ color: "#999" }}>—</span>}</td>
                      <td style={td}>{t.discipline ?? <span style={{ color: "#999" }}>—</span>}</td>
                      <td style={td}>{t.plan_length_weeks} weeks</td>
                      <td style={td}>{t.training_days_per_week}</td>
                      <td style={td}>
                        <span style={t.is_active ? activeBadge : inactiveBadge}>
                          {t.is_active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/export-programme/${t.id}`)}
                          style={exportBtn}
                        >
                          Preview &amp; Export
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const container: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto" };
const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const title: React.CSSProperties = { margin: 0, fontSize: "28px", fontWeight: 700 };
const subtitle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const card: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px" };
const filterRow: React.CSSProperties = { display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" };
const searchInput: React.CSSProperties = { flex: 1, minWidth: "200px", padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px" };
const count: React.CSSProperties = { fontSize: "14px", color: "#666", whiteSpace: "nowrap" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "12px", borderBottom: "1px solid #ddd", fontSize: "14px", background: "#fafafa" };
const td: React.CSSProperties = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: "14px" };
const helper: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const secondaryBtn: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const exportBtn: React.CSSProperties = { padding: "8px 16px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "13px" };
const activeBadge: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500, background: "#e8f5e9", color: "#2e7d32" };
const inactiveBadge: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500, background: "#f5f5f5", color: "#757575" };

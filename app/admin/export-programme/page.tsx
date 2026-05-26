"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PlanRow = {
  id: string;
  name: string;
  status: string | null;
  updated_at: string | null;
  athlete: { full_name: string | null } | null;
  race: { name: string | null } | null;
};

export default function ExportProgrammePage() {
  const router = useRouter();
  const supabase = createClient();

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("athlete_plans")
        .select(`
          id,
          name,
          status,
          updated_at,
          athlete_profiles!athlete_user_id ( full_name ),
          races!event_id ( name )
        `)
        .order("updated_at", { ascending: false });

      if (error) {
        setErrorMessage(`Could not load plans: ${error.message}`);
      } else {
        setPlans(
          (data ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            name: row.name as string,
            status: row.status as string | null,
            updated_at: row.updated_at as string | null,
            athlete: Array.isArray(row.athlete_profiles)
              ? (row.athlete_profiles[0] ?? null)
              : (row.athlete_profiles as { full_name: string | null } | null),
            race: Array.isArray(row.races)
              ? (row.races[0] ?? null)
              : (row.races as { name: string | null } | null),
          }))
        );
      }
      setLoading(false);
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    let result = plans;
    if (statusFilter !== "all") {
      result = result.filter((p) => (p.status ?? "draft") === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.athlete?.full_name ?? "").toLowerCase().includes(q) ||
          (p.race?.name ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [plans, search, statusFilter]);

  function statusBadge(status: string | null) {
    const s = status ?? "draft";
    const colours: Record<string, React.CSSProperties> = {
      active: { background: "#e8f5e9", color: "#2e7d32" },
      draft: { background: "#fff8e1", color: "#f57f17" },
      archived: { background: "#f5f5f5", color: "#757575" },
    };
    return (
      <span style={{ ...badgeBase, ...(colours[s] ?? colours.draft) }}>{s}</span>
    );
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={headerRow}>
          <div>
            <h1 style={title}>Export Programme</h1>
            <p style={subtitle}>Select an athlete plan to preview and export as PDF.</p>
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
              placeholder="Search by plan name, athlete or race..."
              style={searchInput}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectInput}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <span style={count}>{filtered.length} plan{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {loading ? (
            <p style={helper}>Loading plans...</p>
          ) : filtered.length === 0 ? (
            <p style={helper}>No plans found.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Athlete</th>
                    <th style={th}>Plan Name</th>
                    <th style={th}>Race</th>
                    <th style={th}>Status</th>
                    <th style={th}>Updated</th>
                    <th style={th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((plan) => (
                    <tr key={plan.id}>
                      <td style={td}>{plan.athlete?.full_name ?? <span style={{ color: "#999" }}>Unknown</span>}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{plan.name || "Unnamed plan"}</div>
                        <div style={{ color: "#999", fontSize: "11px", fontFamily: "monospace" }}>{plan.id}</div>
                      </td>
                      <td style={td}>{plan.race?.name ?? <span style={{ color: "#999" }}>No race</span>}</td>
                      <td style={td}>{statusBadge(plan.status)}</td>
                      <td style={td}>
                        {plan.updated_at
                          ? new Date(plan.updated_at).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/export-programme/${plan.id}`)}
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
const selectInput: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px", background: "#fff" };
const count: React.CSSProperties = { fontSize: "14px", color: "#666", whiteSpace: "nowrap" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { textAlign: "left", padding: "12px", borderBottom: "1px solid #ddd", fontSize: "14px", background: "#fafafa" };
const td: React.CSSProperties = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: "14px" };
const helper: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const badgeBase: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500 };
const secondaryBtn: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const exportBtn: React.CSSProperties = { padding: "8px 16px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "13px" };

"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PlanRow = {
  id: string;
  name: string;
  status: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  athlete_user_id: string;
  coach_user_id: string | null;
  source_program_template_id: string | null;
  athlete: { full_name: string | null } | null;
};

export default function AdminPlansPage() {
  const router = useRouter();
  const supabase = createClient();

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function loadPlans() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("athlete_plans")
      .select(`
        id,
        name,
        status,
        is_active,
        created_at,
        updated_at,
        athlete_user_id,
        coach_user_id,
        source_program_template_id,
        athlete_profiles!athlete_user_id ( full_name )
      `)
      .order("updated_at", { ascending: false });

    if (error) {
      setErrorMessage(`Could not load plans: ${error.message}`);
    } else {
      setPlans((data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        athlete: Array.isArray(row.athlete_profiles)
          ? (row.athlete_profiles[0] ?? null)
          : (row.athlete_profiles as { full_name: string | null } | null),
      })) as PlanRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadPlans();
  }, []);

  const filtered = useMemo(() => {
    let result = plans;

    if (statusFilter !== "all") {
      result = result.filter((p) => (p.status ?? "draft") === statusFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (p) =>
          (p.name ?? "").toLowerCase().includes(query) ||
          (p.athlete?.full_name ?? "").toLowerCase().includes(query),
      );
    }

    return result;
  }, [plans, search, statusFilter]);

  // Keep selection in sync when filter changes
  const filteredIds = useMemo(() => new Set(filtered.map((p) => p.id)), [filtered]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) next.add(id);
        return next;
      });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    const ids = [...selected].filter((id) => filteredIds.has(id));
    if (ids.length === 0) return;

    const confirmed = window.confirm(
      `Permanently delete ${ids.length} plan${ids.length !== 1 ? "s" : ""}?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingIds(new Set(ids));
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("athlete_plans")
      .delete()
      .in("id", ids);

    if (error) {
      setErrorMessage(`Could not delete plans: ${error.message}`);
    } else {
      setSuccessMessage(`${ids.length} plan${ids.length !== 1 ? "s" : ""} deleted.`);
      setPlans((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }

    setDeletingIds(new Set());
  }

  async function handleDeleteOne(plan: PlanRow) {
    const confirmed = window.confirm(
      `Permanently delete "${plan.name || "this plan"}"?\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingIds((prev) => new Set([...prev, plan.id]));
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("athlete_plans")
      .delete()
      .eq("id", plan.id);

    if (error) {
      setErrorMessage(`Could not delete plan: ${error.message}`);
    } else {
      setSuccessMessage(`"${plan.name || "Plan"}" deleted.`);
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(plan.id);
        return next;
      });
    }

    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(plan.id);
      return next;
    });
  }

  function statusBadge(status: string | null) {
    const s = status ?? "draft";
    const styles: Record<string, React.CSSProperties> = {
      active: { background: "#e8f5e9", color: "#2e7d32" },
      draft: { background: "#fff8e1", color: "#f57f17" },
      archived: { background: "#f5f5f5", color: "#757575" },
    };
    return (
      <span style={{ ...badgeStyle, ...(styles[s] ?? styles.draft) }}>
        {s}
      </span>
    );
  }

  const selectedInView = filtered.filter((p) => selected.has(p.id)).length;
  const isDeleting = deletingIds.size > 0;

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Athlete Plans</h1>
            <p style={subtitleStyle}>View and permanently delete athlete training plans.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={secondaryButtonStyle}>
            Back to Admin
          </button>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
        {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

        <section style={cardStyle}>
          <div style={filterRowStyle}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by plan name or athlete..."
              style={searchInputStyle}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
            <div style={countStyle}>{filtered.length} plan{filtered.length !== 1 ? "s" : ""}</div>
          </div>

          {selectedInView > 0 && (
            <div style={bulkBarStyle}>
              <span style={{ fontSize: "14px", color: "#333" }}>
                {selectedInView} selected
              </span>
              <button
                type="button"
                onClick={() => void handleDeleteSelected()}
                disabled={isDeleting}
                style={bulkDeleteButtonStyle}
              >
                {isDeleting ? "Deleting..." : `Delete ${selectedInView} plan${selectedInView !== 1 ? "s" : ""}`}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={isDeleting}
                style={clearButtonStyle}
              >
                Clear selection
              </button>
            </div>
          )}

          {loading ? (
            <p style={helperStyle}>Loading plans...</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>No plans found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: "36px" }}>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: "pointer" }}
                        title={allFilteredSelected ? "Deselect all" : "Select all"}
                      />
                    </th>
                    <th style={thStyle}>Plan</th>
                    <th style={thStyle}>Athlete</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Updated</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((plan) => (
                    <tr
                      key={plan.id}
                      style={selected.has(plan.id) ? selectedRowStyle : undefined}
                    >
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={selected.has(plan.id)}
                          onChange={() => toggleOne(plan.id)}
                          disabled={deletingIds.has(plan.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <div style={primaryCellStyle}>{plan.name || "Unnamed plan"}</div>
                        <div style={secondaryCellStyle}>{plan.id}</div>
                      </td>
                      <td style={tdStyle}>
                        {plan.athlete?.full_name ?? <span style={{ color: "#999" }}>Unknown</span>}
                      </td>
                      <td style={tdStyle}>{statusBadge(plan.status)}</td>
                      <td style={tdStyle}>
                        {plan.updated_at
                          ? new Date(plan.updated_at).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOne(plan)}
                          disabled={deletingIds.has(plan.id)}
                          style={deleteButtonStyle}
                        >
                          {deletingIds.has(plan.id) ? "Deleting..." : "Delete"}
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

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "28px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px" };
const filterRowStyle: React.CSSProperties = { display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" };
const searchInputStyle: React.CSSProperties = { flex: 1, minWidth: "200px", padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px" };
const selectStyle: React.CSSProperties = { padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px", background: "#fff" };
const countStyle: React.CSSProperties = { fontSize: "14px", color: "#666", whiteSpace: "nowrap" };
const bulkBarStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", padding: "10px 14px", background: "#fef9e7", border: "1px solid #f0d060", borderRadius: "8px", flexWrap: "wrap" };
const bulkDeleteButtonStyle: React.CSSProperties = { padding: "7px 14px", border: "1px solid #f5c6cb", borderRadius: "8px", background: "#fff", color: "#b00020", fontWeight: 600, cursor: "pointer", fontSize: "13px" };
const clearButtonStyle: React.CSSProperties = { padding: "7px 14px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#444", fontWeight: 500, cursor: "pointer", fontSize: "13px" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px", borderBottom: "1px solid #ddd", fontSize: "14px", background: "#fafafa" };
const tdStyle: React.CSSProperties = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: "14px" };
const selectedRowStyle: React.CSSProperties = { background: "#fffbea" };
const primaryCellStyle: React.CSSProperties = { fontWeight: 600, marginBottom: "2px" };
const secondaryCellStyle: React.CSSProperties = { color: "#999", fontSize: "11px", fontFamily: "monospace" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const successStyle: React.CSSProperties = { color: "#2e7d32", marginBottom: "16px" };
const badgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500 };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const deleteButtonStyle: React.CSSProperties = { padding: "7px 14px", border: "1px solid #f5c6cb", borderRadius: "8px", background: "#fff", color: "#b00020", fontWeight: 600, cursor: "pointer", fontSize: "13px" };

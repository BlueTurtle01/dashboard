"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RaceConditions } from "@/lib/planner/types";

type EventRow = {
  id: string;
  name: string;
  event_type: string;
  event_date: string | null;
  location: string | null;
  terrain_type: string | null;
  climate_type: string | null;
  is_active: boolean;
  race_conditions: RaceConditions | null;
};

export default function AdminEventsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("events")
        .select("id, name, event_type, event_date, location, terrain_type, climate_type, is_active, race_conditions")
        .order("name");

      if (error) {
        setErrorMessage(`Could not load events: ${error.message}`);
      } else {
        setEvents((data || []) as EventRow[]);
      }

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(query) ||
        (e.event_type || "").toLowerCase().includes(query) ||
        (e.location || "").toLowerCase().includes(query),
    );
  }, [events, search]);

  function conditionSummary(rc: RaceConditions | null): string {
    if (!rc) return "—";
    const parts: string[] = [];
    if (rc.temperature) parts.push(rc.temperature.replace(/_/g, " "));
    if (rc.altitude && rc.altitude !== "sea_level") parts.push(rc.altitude.replace(/_/g, " ") + " alt");
    if (rc.specialConditions?.length) parts.push(...rc.specialConditions.map((c) => c.replace(/_/g, " ")));
    return parts.length ? parts.join(", ") : "set";
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Events</h1>
            <p style={subtitleStyle}>
              Manage race events and their environmental conditions.
            </p>
          </div>
          <div style={headerActionsStyle}>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              style={secondaryButtonStyle}
            >
              Back to Admin
            </button>
          </div>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>All Events</h2>
              <p style={sectionSubtitleStyle}>
                Stored in <code>public.events</code>
              </p>
            </div>
            <div style={countStyle}>{filtered.length} shown</div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, type, location..."
            style={searchInputStyle}
          />

          {loading ? (
            <p style={helperStyle}>Loading events...</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>No events found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Location</th>
                    <th style={thStyle}>Terrain</th>
                    <th style={thStyle}>Climate</th>
                    <th style={thStyle}>Race Conditions</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event) => (
                    <tr key={event.id}>
                      <td style={tdStyle}>
                        <div style={primaryCellStyle}>{event.name}</div>
                        <div style={secondaryCellStyle}>{event.event_date || "Date TBC"}</div>
                      </td>
                      <td style={tdStyle}>{event.event_type || "—"}</td>
                      <td style={tdStyle}>{event.location || "—"}</td>
                      <td style={tdStyle}>{event.terrain_type || "—"}</td>
                      <td style={tdStyle}>{event.climate_type || "—"}</td>
                      <td style={tdStyle}>
                        <span style={event.race_conditions ? conditionBadgeStyle : emptyBadgeStyle}>
                          {conditionSummary(event.race_conditions)}
                        </span>
                      </td>
                      <td style={tdStyle}>{event.is_active ? "Yes" : "No"}</td>
                      <td style={tdStyle}>
                        <div style={actionRowStyle}>
                          <button
                            type="button"
                            onClick={() => router.push(`/admin/events/${event.id}/edit`)}
                            style={smallButtonStyle}
                          >
                            Edit Conditions
                          </button>
                        </div>
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
const containerStyle: React.CSSProperties = { maxWidth: "1200px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "28px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", flexWrap: "wrap" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px", marginBottom: "24px" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: "18px", fontWeight: 600 };
const sectionSubtitleStyle: React.CSSProperties = { margin: 0, color: "#666", fontSize: "14px" };
const countStyle: React.CSSProperties = { fontSize: "14px", color: "#666" };
const searchInputStyle: React.CSSProperties = { width: "100%", padding: "12px", border: "1px solid #ccc", borderRadius: "8px", marginBottom: "16px", boxSizing: "border-box" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px", borderBottom: "1px solid #ddd", fontSize: "14px", background: "#fafafa" };
const tdStyle: React.CSSProperties = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: "14px" };
const primaryCellStyle: React.CSSProperties = { fontWeight: 600, marginBottom: "4px" };
const secondaryCellStyle: React.CSSProperties = { color: "#666", fontSize: "13px" };
const actionRowStyle: React.CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#ffffff", color: "#111111", fontWeight: 700, cursor: "pointer" };
const smallButtonStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ccc", borderRadius: "8px", background: "#ffffff", color: "#111111", fontWeight: 600, cursor: "pointer" };
const conditionBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: "12px", background: "#e8f5e9", color: "#2e7d32", fontSize: "12px", fontWeight: 500 };
const emptyBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: "12px", background: "#f5f5f5", color: "#999", fontSize: "12px" };

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface RaceStatRow {
  race_id: string;
  race_name: string;
  latest_year: number;
  entrant_count: number;
  finisher_count: number;
  dnf_count: number;
  dnf_rate: number;
  median_finish_secs: number | null;
}

type SortKey = keyof Omit<RaceStatRow, "race_id">;

const supabase = createClient();

function formatDuration(secs: number | null): string {
  if (secs == null || secs <= 0) return "–";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function dnfColor(rate: number, noFinishers: boolean): string {
  if (noFinishers) return "#9ca3af";
  if (rate < 0.05) return "#15803d";
  if (rate < 0.15) return "#d97706";
  if (rate < 0.30) return "#dc2626";
  return "#7f1d1d";
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px",
      padding: "16px 20px", minWidth: "160px",
    }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: 700, color: "#111827" }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "3px" }}>{sub}</div>}
    </div>
  );
}

export default function RaceStatsPage() {
  const [rows, setRows]               = useState<RaceStatRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [hideNoFinish, setHideNoFinish] = useState(true);
  const [sortKey, setSortKey]         = useState<SortKey>("entrant_count");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("get_race_summary_stats");
    if (err) { setError(err.message); setLoading(false); return; }
    setRows((data ?? []).map((r: RaceStatRow) => ({
      ...r,
      entrant_count:      Number(r.entrant_count),
      finisher_count:     Number(r.finisher_count),
      dnf_count:          Number(r.dnf_count),
      dnf_rate:           Number(r.dnf_rate),
      median_finish_secs: r.median_finish_secs != null ? Number(r.median_finish_secs) : null,
    })));
    setLoading(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = rows
    .filter(r => !hideNoFinish || r.finisher_count > 0)
    .filter(r => !search.trim() || r.race_name.toLowerCase().includes(search.trim().toLowerCase()));

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    const cmp = typeof av === "string"
      ? (av as string).localeCompare(bv as string)
      : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Summary stats (across all loaded rows, before search filter)
  const withFinishers = rows.filter(r => r.finisher_count > 0);
  const totalEntrants = rows.reduce((s, r) => s + r.entrant_count, 0);
  const avgDnfRate    = withFinishers.length
    ? withFinishers.reduce((s, r) => s + r.dnf_rate, 0) / withFinishers.length
    : 0;
  const noFinishCount = rows.filter(r => r.finisher_count === 0).length;

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? <span style={{ marginLeft: "4px", fontSize: "10px" }}>{sortDir === "asc" ? "▲" : "▼"}</span>
      : <span style={{ marginLeft: "4px", fontSize: "10px", color: "#d1d5db" }}>▼</span>;

  const th = (label: string, key: SortKey) => (
    <th
      onClick={() => toggleSort(key)}
      style={{
        textAlign: key === "race_name" ? "left" : "center",
        padding: "10px 14px", fontSize: "11px", fontWeight: 600, color: "#6b7280",
        textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eee",
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
      }}
    >
      {label}<SortArrow k={key} />
    </th>
  );

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: "6px" }}>
        <Link href="/admin/tools" style={{ color: "#2563eb", fontSize: "13px", textDecoration: "none" }}>
          ← Admin Tools
        </Link>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: "#1e3a1e" }}>
        Race Statistics
      </h1>
      <p style={{ margin: "0 0 24px", color: "#666", fontSize: "14px" }}>
        Entry counts, finisher rates, and DNF rates across all races — based on latest year of results.
      </p>

      {/* Summary cards */}
      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "28px" }}>
          <StatCard label="Races with results" value={rows.length.toLocaleString()} />
          <StatCard label="Total entrants" value={totalEntrants.toLocaleString()} sub="sum across latest year per race" />
          <StatCard label="Avg DNF rate" value={`${(avgDnfRate * 100).toFixed(1)}%`} sub="excluding zero-finisher races" />
          <StatCard
            label="Data issues"
            value={noFinishCount.toString()}
            sub="races with 0 finishers recorded"
          />
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Filter by race name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: "1px solid #ddd", borderRadius: "7px", padding: "8px 13px", fontSize: "14px", outline: "none", minWidth: "260px" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", cursor: "pointer" }}>
          <input type="checkbox" checked={hideNoFinish} onChange={e => setHideNoFinish(e.target.checked)} />
          Hide races with no finishers recorded
        </label>
        {!loading && (
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#9ca3af" }}>
            {sorted.length} races shown
          </span>
        )}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading…</p>}
      {error   && <p style={{ color: "#c0392b" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9f9f9" }}>
                {th("Race", "race_name")}
                {th("Year", "latest_year")}
                {th("Entrants", "entrant_count")}
                {th("Finishers", "finisher_count")}
                {th("DNFs", "dnf_count")}
                {th("DNF %", "dnf_rate")}
                {th("Median time", "median_finish_secs")}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                    No races match your filter.
                  </td>
                </tr>
              )}
              {sorted.map((row, i) => {
                const noFinish = row.finisher_count === 0;
                const dnfPct   = (row.dnf_rate * 100).toFixed(1);
                return (
                  <tr
                    key={row.race_id}
                    style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", background: noFinish ? "#fafafa" : "#fff" }}
                  >
                    <td style={{ padding: "10px 14px", fontSize: "13px", color: "#1e3a1e", fontWeight: 500 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {row.race_name}
                        {noFinish && (
                          <span title="No finishers recorded — results may have been imported with incorrect status" style={{ fontSize: "11px", color: "#9ca3af", cursor: "default" }}>⚠</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "13px", color: "#555" }}>
                      {row.latest_year}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "13px", fontWeight: 600, color: "#111827" }}>
                      {row.entrant_count.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "13px", color: "#555" }}>
                      {row.finisher_count.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "13px", color: "#555" }}>
                      {row.dnf_count.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      {row.dnf_count > 0 || row.finisher_count > 0 ? (
                        <span style={{
                          display: "inline-block",
                          fontSize: "12px", fontWeight: 600,
                          color: dnfColor(row.dnf_rate, noFinish),
                          background: noFinish ? "#f3f4f6" : dnfColor(row.dnf_rate, noFinish) + "18",
                          border: `1px solid ${dnfColor(row.dnf_rate, noFinish)}40`,
                          borderRadius: "4px", padding: "2px 8px",
                        }}>
                          {noFinish ? "–" : `${dnfPct}%`}
                        </span>
                      ) : (
                        <span style={{ fontSize: "13px", color: "#d1d5db" }}>–</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "13px", color: "#555" }}>
                      {formatDuration(row.median_finish_secs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ marginTop: "10px", fontSize: "11.5px", color: "#aaa" }}>
          Entrants = all result rows for the latest year (including DNF/DNS). Finishers = recorded finish time and not DNF. Click any column header to sort.
          {noFinishCount > 0 && ` ${noFinishCount} races with no finishers hidden — likely a result status import issue.`}
        </div>
      )}
    </div>
  );
}

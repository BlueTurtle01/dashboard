"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { RacePathRow } from "@/app/api/athlete-network/race-paths/route";

export const dynamic = "force-dynamic";

type SortKey = "pair_count" | "probability" | "avg_year_gap" | "race_a_name" | "race_b_name";

export default function RacePathsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RacePathRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter state
  const [filterRaceA, setFilterRaceA] = useState("all");
  const [filterRaceB, setFilterRaceB] = useState("all");
  const [minCount, setMinCount] = useState(2);

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>("pair_count");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r) => r.role === "admin")) {
        router.push("/login"); return;
      }

      const res = await fetch("/api/athlete-network/race-paths");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load data");
        setLoading(false);
        return;
      }
      setRows(await res.json());
      setLoading(false);
    }
    load().catch(() => { setError("Unexpected error"); setLoading(false); });
  }, [router]);

  // Derive unique race lists for dropdowns
  const raceNames = useMemo(() => {
    const names = new Set<string>();
    rows.forEach((r) => { names.add(r.race_a_name); names.add(r.race_b_name); });
    return ["all", ...Array.from(names).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter(
      (r) =>
        r.pair_count >= minCount &&
        (filterRaceA === "all" || r.race_a_name === filterRaceA) &&
        (filterRaceB === "all" || r.race_b_name === filterRaceB)
    );

    out = [...out].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return out;
  }, [rows, minCount, filterRaceA, filterRaceB, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#ccc", marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortAsc ? "↑" : "↓"}</span>;
  }

  // Summary stats
  const totalPaths = rows.length;
  const topPair = rows[0];
  const uniqueRaceCount = useMemo(() => {
    const ids = new Set([...rows.map((r) => r.race_a_id), ...rows.map((r) => r.race_b_id)]);
    return ids.size;
  }, [rows]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>

        {/* Header */}
        <div style={headerRowStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Link href="/admin/athlete-network" style={breadcrumbStyle}>Data Analysis</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <h1 style={titleStyle}>Race Paths</h1>
            </div>
            <p style={subtitleStyle}>
              Common progressions between races, based on athletes who completed
              both. Race&nbsp;A → Race&nbsp;B means A was done in an earlier year.
              Same-year pairs are counted but flagged.
            </p>
          </div>
          <button onClick={() => router.push("/admin/athlete-network")} style={backButtonStyle}>
            ← Back
          </button>
        </div>

        {/* Stat cards */}
        {!loading && rows.length > 0 && (
          <div style={statsRowStyle}>
            <StatCard label="Path pairs found" value={totalPaths.toLocaleString()} description="Ordered race pairs with ≥ 2 shared athletes" />
            <StatCard label="Races in network" value={uniqueRaceCount.toString()} description="Distinct races involved in at least one path" />
            <StatCard
              label="Most common path"
              value={`${topPair.pair_count} athletes`}
              description={`${topPair.race_a_name} → ${topPair.race_b_name}`}
            />
          </div>
        )}

        {/* Filters */}
        <div style={filterBarStyle}>
          <label style={filterLabelStyle}>
            From race
            <select value={filterRaceA} onChange={(e) => setFilterRaceA(e.target.value)} style={selectStyle}>
              {raceNames.map((n) => (
                <option key={n} value={n}>{n === "all" ? "All races" : n}</option>
              ))}
            </select>
          </label>
          <label style={filterLabelStyle}>
            To race
            <select value={filterRaceB} onChange={(e) => setFilterRaceB(e.target.value)} style={selectStyle}>
              {raceNames.map((n) => (
                <option key={n} value={n}>{n === "all" ? "All races" : n}</option>
              ))}
            </select>
          </label>
          <label style={filterLabelStyle}>
            Min athletes
            <select value={minCount} onChange={(e) => setMinCount(Number(e.target.value))} style={selectStyle}>
              {[2, 3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
          </label>
          <span style={resultCountStyle}>
            {loading ? "Loading…" : `${filtered.length.toLocaleString()} paths`}
          </span>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <section style={cardStyle}>
          {loading ? (
            <p style={helperStyle}>Loading race paths…</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>No paths match the current filters.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th onClick={() => toggleSort("race_a_name")}>
                      From <SortIndicator col="race_a_name" />
                    </Th>
                    <th style={{ ...thStyle, width: "24px", padding: "12px 4px" }} />
                    <Th onClick={() => toggleSort("race_b_name")}>
                      To <SortIndicator col="race_b_name" />
                    </Th>
                    <Th onClick={() => toggleSort("pair_count")} right>
                      Athletes <SortIndicator col="pair_count" />
                    </Th>
                    <Th right>Race A total</Th>
                    <Th onClick={() => toggleSort("probability")} right>
                      % of field <SortIndicator col="probability" />
                    </Th>
                    <Th onClick={() => toggleSort("avg_year_gap")} right>
                      Avg gap <SortIndicator col="avg_year_gap" />
                    </Th>
                    <Th right>Same year</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const prob = Number(row.probability);
                    const sameYearAll = row.same_year_count === row.pair_count;
                    return (
                      <tr key={`${row.race_a_id}-${row.race_b_id}`} style={trStyle}>
                        <td style={tdRaceStyle}>{row.race_a_name}</td>
                        <td style={arrowTdStyle}>→</td>
                        <td style={tdRaceStyle}>{row.race_b_name}</td>
                        <td style={tdNumStyle}>{row.pair_count}</td>
                        <td style={{ ...tdNumStyle, color: "#aaa" }}>{row.race_a_total.toLocaleString()}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <ProbabilityBar prob={prob} />
                        </td>
                        <td style={tdNumStyle}>
                          {sameYearAll ? (
                            <span style={sameYearTagStyle}>same yr</span>
                          ) : (
                            `${Number(row.avg_year_gap).toFixed(1)} yr`
                          )}
                        </td>
                        <td style={tdNumStyle}>
                          {row.same_year_count > 0 ? (
                            <span style={{ color: "#888" }}>{row.same_year_count}</span>
                          ) : (
                            <span style={{ color: "#ddd" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={legendStyle}>
          <span style={legendTitleStyle}>% of field</span>
          <span style={legendNoteStyle}>
            How many athletes who completed Race A also went on to complete Race B.
            &quot;Avg gap&quot; is the mean years between their first completion of each.
            Same-year pairs have no guaranteed ordering within the year.
          </span>
        </div>

      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div style={statCardStyle}>
      <p style={statLabelStyle}>{label}</p>
      <p style={statValueStyle}>{value}</p>
      <p style={statDescStyle}>{description}</p>
    </div>
  );
}

function ProbabilityBar({ prob }: { prob: number }) {
  const pct = (prob * 100).toFixed(1);
  // Colour thresholds: ultra-enriched ≥ 5%, moderate 2–5%, low < 2%
  let barColor = "#d0e8ff";
  let textColor = "#1a6cbf";
  if (prob >= 0.05) { barColor = "#e6f4ea"; textColor = "#1e7c34"; }
  else if (prob >= 0.02) { barColor = "#fff3e6"; textColor = "#d46b08"; }
  return (
    <div style={probBarWrapStyle}>
      <div style={{ ...probBarFillStyle, width: `${Math.min(prob * 500, 100)}%`, background: barColor }} />
      <span style={{ ...probBarTextStyle, color: textColor }}>{pct}%</span>
    </div>
  );
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick?: () => void; right?: boolean }) {
  return (
    <th
      onClick={onClick}
      style={{ ...thStyle, textAlign: right ? "right" : "left", cursor: onClick ? "pointer" : "default", userSelect: "none" }}
    >
      {children}
    </th>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1200px", margin: "0 auto" };

const headerRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: "24px", gap: "16px", flexWrap: "wrap",
};
const breadcrumbStyle: React.CSSProperties = { fontSize: "14px", color: "#666", textDecoration: "none", fontWeight: 500 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "22px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "6px 0 0", color: "#555", fontSize: "14px", lineHeight: 1.4, maxWidth: "600px" };
const backButtonStyle: React.CSSProperties = {
  padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px",
  background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "14px", whiteSpace: "nowrap",
};

const statsRowStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: "16px", marginBottom: "24px",
};
const statCardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "20px 24px" };
const statLabelStyle: React.CSSProperties = { margin: 0, fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" };
const statValueStyle: React.CSSProperties = { margin: "6px 0 4px", fontSize: "26px", fontWeight: 700, color: "#111" };
const statDescStyle: React.CSSProperties = { margin: 0, fontSize: "12px", color: "#777", lineHeight: 1.4 };

const filterBarStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
  marginBottom: "16px", padding: "16px 20px", background: "#fff",
  borderRadius: "10px", border: "1px solid #e5e5e5",
};
const filterLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#444" };
const selectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd",
  fontSize: "13px", background: "#fafafa", cursor: "pointer", maxWidth: "240px",
};
const resultCountStyle: React.CSSProperties = { marginLeft: "auto", fontSize: "13px", color: "#888", fontWeight: 500 };

const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", overflow: "hidden", marginBottom: "16px" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px", padding: "24px" };

const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = {
  padding: "12px 14px", borderBottom: "1px solid #e5e5e5",
  fontSize: "12px", fontWeight: 700, color: "#666",
  background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.04em",
};
const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: "13px", verticalAlign: "middle" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdRaceStyle: React.CSSProperties = { ...tdStyle, fontWeight: 500, maxWidth: "280px" };
const arrowTdStyle: React.CSSProperties = { padding: "11px 2px", fontSize: "14px", color: "#999", verticalAlign: "middle", textAlign: "center", width: "24px" };

const probBarWrapStyle: React.CSSProperties = { position: "relative", display: "inline-flex", alignItems: "center", minWidth: "80px" };
const probBarFillStyle: React.CSSProperties = { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: "4px", height: "100%", minHeight: "24px" };
const probBarTextStyle: React.CSSProperties = { position: "relative", fontSize: "12px", fontWeight: 700, padding: "4px 8px", fontVariantNumeric: "tabular-nums" };

const sameYearTagStyle: React.CSSProperties = { fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: "#f0f0f0", color: "#888", fontWeight: 600 };

const legendStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "#666" };
const legendTitleStyle: React.CSSProperties = { fontWeight: 700, color: "#444" };
const legendNoteStyle: React.CSSProperties = { color: "#999" };

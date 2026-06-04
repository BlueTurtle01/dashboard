"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { RaceSequenceRow } from "@/app/api/athlete-network/race-sequences/route";

export const dynamic = "force-dynamic";

type SortKey = "athlete_count" | "probability" | "path_length" | "avg_span_years";

const LENGTH_LABELS: Record<number, string> = { 2: "2 races", 3: "3 races", 4: "4 races" };
const LENGTH_COLORS: Record<number, { bg: string; color: string; border: string }> = {
  2: { bg: "#f0f4ff", color: "#2952b3", border: "#c7d7f9" },
  3: { bg: "#fff3e6", color: "#b85c00", border: "#fdd5a0" },
  4: { bg: "#f2fbe6", color: "#3a7a00", border: "#c3e89a" },
};

export default function RaceSequencesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RaceSequenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [minLength, setMinLength] = useState(2);
  const [filterRace, setFilterRace] = useState("all");
  const [minAthletes, setMinAthletes] = useState(2);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("athlete_count");
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

      const res = await fetch("/api/athlete-network/race-sequences?min=2&max=4");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load");
        setLoading(false);
        return;
      }
      setRows(await res.json());
      setLoading(false);
    }
    load().catch(() => { setError("Unexpected error"); setLoading(false); });
  }, [router]);

  const raceNames = useMemo(() => {
    const names = new Set<string>();
    rows.forEach((r) => r.path_names.forEach((n) => names.add(n)));
    return ["all", ...Array.from(names).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter(
      (r) =>
        r.path_length >= minLength &&
        r.athlete_count >= minAthletes &&
        (filterRace === "all" || r.path_names.includes(filterRace))
    );
    out = [...out].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [rows, minLength, filterRace, minAthletes, sortKey, sortAsc]);

  // Summary stats by length
  const byLength = useMemo(() => {
    const counts: Record<number, number> = {};
    rows.forEach((r) => { counts[r.path_length] = (counts[r.path_length] ?? 0) + 1; });
    return counts;
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#ccc", marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortAsc ? "↑" : "↓"}</span>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>

        {/* Header */}
        <div style={headerRowStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Link href="/admin/athlete-network" style={breadcrumbStyle}>Data Analysis</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <Link href="/admin/athlete-network/race-paths" style={breadcrumbStyle}>Race Paths</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <h1 style={titleStyle}>Trajectories</h1>
            </div>
            <p style={subtitleStyle}>
              Race sequences of 2–4 steps, ordered chronologically per athlete.
              Within the same year, pairs are canonicalised by race ID to avoid double-counting.
            </p>
          </div>
          <button onClick={() => router.push("/admin/athlete-network/race-paths")} style={backButtonStyle}>
            ← Race Paths
          </button>
        </div>

        {/* Length summary chips */}
        {!loading && (
          <div style={chipsRowStyle}>
            {([2, 3, 4] as const).map((len) => {
              const c = LENGTH_COLORS[len];
              const count = byLength[len] ?? 0;
              const active = minLength === len;
              return (
                <button
                  key={len}
                  onClick={() => setMinLength(len)}
                  style={{
                    ...chipStyle,
                    background: active ? c.bg : "#fff",
                    color: active ? c.color : "#666",
                    border: `1.5px solid ${active ? c.border : "#e0e0e0"}`,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {LENGTH_LABELS[len]}+
                  <span style={{ ...chipCountStyle, background: active ? c.border : "#f0f0f0", color: active ? c.color : "#888" }}>
                    {count}
                  </span>
                </button>
              );
            })}
            <span style={{ marginLeft: "auto", fontSize: "13px", color: "#888" }}>
              Showing paths of ≥{minLength} races
            </span>
          </div>
        )}

        {/* Filters */}
        <div style={filterBarStyle}>
          <label style={filterLabelStyle}>
            Contains race
            <select value={filterRace} onChange={(e) => setFilterRace(e.target.value)} style={selectStyle}>
              {raceNames.map((n) => (
                <option key={n} value={n}>{n === "all" ? "Any race" : n}</option>
              ))}
            </select>
          </label>
          <label style={filterLabelStyle}>
            Min athletes
            <select value={minAthletes} onChange={(e) => setMinAthletes(Number(e.target.value))} style={selectStyle}>
              {[2, 3, 4, 5, 10].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
          </label>
          <span style={resultCountStyle}>
            {loading ? "Loading…" : `${filtered.length} sequences`}
          </span>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <section style={cardStyle}>
          {loading ? (
            <p style={helperStyle}>Computing trajectories…</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>No sequences match the current filters.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th onClick={() => toggleSort("path_length")}>
                      Steps <SortIndicator col="path_length" />
                    </Th>
                    <th style={{ ...thStyle, textAlign: "left" }}>Trajectory</th>
                    <Th onClick={() => toggleSort("athlete_count")} right>
                      Athletes <SortIndicator col="athlete_count" />
                    </Th>
                    <Th right>Race A field</Th>
                    <Th onClick={() => toggleSort("probability")} right>
                      % of field <SortIndicator col="probability" />
                    </Th>
                    <Th onClick={() => toggleSort("avg_span_years")} right>
                      Span <SortIndicator col="avg_span_years" />
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const c = LENGTH_COLORS[row.path_length] ?? LENGTH_COLORS[2];
                    return (
                      <tr key={row.path_names.join("|")} style={trStyle}>
                        <td style={tdStyle}>
                          <span style={{ ...lengthBadgeStyle, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                            {row.path_length}
                          </span>
                        </td>
                        <td style={tdPathStyle}>
                          <PathChain names={row.path_names} />
                        </td>
                        <td style={tdNumStyle}>{row.athlete_count}</td>
                        <td style={{ ...tdNumStyle, color: "#aaa" }}>{Number(row.race_a_total).toLocaleString()}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <ProbBar prob={Number(row.probability)} />
                        </td>
                        <td style={tdNumStyle}>
                          {Number(row.avg_span_years) === 0
                            ? <span style={sameYrStyle}>same yr</span>
                            : `${Number(row.avg_span_years).toFixed(1)} yr`}
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
          <span style={legendNoteStyle}>
            <strong>Steps</strong> = number of races in the chain.
            <strong> % of field</strong> = athletes completing the full sequence ÷ athletes who did Race A.
            <strong> Span</strong> = average years between first and last race in the sequence.
          </span>
        </div>

      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PathChain({ names }: { names: string[] }) {
  return (
    <span style={chainStyle}>
      {names.map((name, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          {i > 0 && <span style={arrowStyle}>→</span>}
          <span style={raceNameStyle}>{name}</span>
        </span>
      ))}
    </span>
  );
}

function ProbBar({ prob }: { prob: number }) {
  const pct = (prob * 100).toFixed(2);
  let barColor = "#e0ecff", textColor = "#1a6cbf";
  if (prob >= 0.05) { barColor = "#e6f4ea"; textColor = "#1e7c34"; }
  else if (prob >= 0.02) { barColor = "#fff3e6"; textColor = "#d46b08"; }
  return (
    <div style={probWrapStyle}>
      <div style={{ ...probFillStyle, width: `${Math.min(prob * 600, 100)}%`, background: barColor }} />
      <span style={{ ...probTextStyle, color: textColor }}>{pct}%</span>
    </div>
  );
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick?: () => void; right?: boolean }) {
  return (
    <th onClick={onClick} style={{ ...thStyle, textAlign: right ? "right" : "left", cursor: onClick ? "pointer" : "default", userSelect: "none" }}>
      {children}
    </th>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1300px", margin: "0 auto" };

const headerRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: "20px", gap: "16px", flexWrap: "wrap",
};
const breadcrumbStyle: React.CSSProperties = { fontSize: "14px", color: "#666", textDecoration: "none", fontWeight: 500 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "22px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "6px 0 0", color: "#555", fontSize: "14px", lineHeight: 1.4, maxWidth: "640px" };
const backButtonStyle: React.CSSProperties = {
  padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px",
  background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "14px", whiteSpace: "nowrap",
};

const chipsRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "12px",
};
const chipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  padding: "7px 14px", borderRadius: "999px", fontSize: "13px",
  cursor: "pointer", transition: "all 0.15s",
};
const chipCountStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, padding: "1px 7px", borderRadius: "999px",
};

const filterBarStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
  marginBottom: "16px", padding: "14px 20px", background: "#fff",
  borderRadius: "10px", border: "1px solid #e5e5e5",
};
const filterLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#444" };
const selectStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "13px", background: "#fafafa", cursor: "pointer", maxWidth: "260px" };
const resultCountStyle: React.CSSProperties = { marginLeft: "auto", fontSize: "13px", color: "#888", fontWeight: 500 };

const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", overflow: "hidden", marginBottom: "16px" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px", padding: "24px" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const thStyle: React.CSSProperties = {
  padding: "11px 14px", borderBottom: "1px solid #e5e5e5",
  fontSize: "12px", fontWeight: 700, color: "#666",
  background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.04em",
};
const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: "13px", verticalAlign: "middle" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdPathStyle: React.CSSProperties = { ...tdStyle, maxWidth: "560px" };

const lengthBadgeStyle: React.CSSProperties = {
  display: "inline-block", width: "26px", height: "26px", lineHeight: "24px",
  textAlign: "center", borderRadius: "6px", fontSize: "13px", fontWeight: 700,
};

const chainStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" };
const arrowStyle: React.CSSProperties = { color: "#bbb", fontSize: "13px", flexShrink: 0 };
const raceNameStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 500, color: "#222" };

const probWrapStyle: React.CSSProperties = { position: "relative", display: "inline-flex", alignItems: "center", minWidth: "72px" };
const probFillStyle: React.CSSProperties = { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: "4px", height: "100%", minHeight: "22px" };
const probTextStyle: React.CSSProperties = { position: "relative", fontSize: "12px", fontWeight: 700, padding: "3px 8px", fontVariantNumeric: "tabular-nums" };

const sameYrStyle: React.CSSProperties = { fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: "#f0f0f0", color: "#888", fontWeight: 600 };

const legendStyle: React.CSSProperties = { fontSize: "12px", color: "#999", lineHeight: 1.6 };
const legendNoteStyle: React.CSSProperties = { display: "block" };

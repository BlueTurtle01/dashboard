"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ClusteredSequenceRow, ClusterProfile } from "@/app/api/athlete-network/race-sequences-clustered/route";
import type { GMMCluster } from "@/lib/race-analysis/clustering";

export const dynamic = "force-dynamic";

type SortKey = "athlete_count" | "probability" | "path_length" | "avg_span_years" | "experience_bias_score";
type BiasFilter = "all" | "low" | "high";

const CLUSTER_COLORS = [
  { bg: "#e8f5e9", color: "#1b5e20", border: "#a5d6a7" },  // Newcomer — green
  { bg: "#e3f2fd", color: "#0d47a1", border: "#90caf9" },  // Regular — blue
  { bg: "#fff3e6", color: "#b85c00", border: "#fdd5a0" },  // Experienced — orange
  { bg: "#fce4ec", color: "#880e4f", border: "#f48fb1" },  // Veteran — pink/red
];

export default function RaceSequencesClusteredPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ClusteredSequenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("athlete_count");
  const [sortAsc, setSortAsc] = useState(false);
  const [biasFilter, setBiasFilter] = useState<BiasFilter>("all");
  const [minAthletes, setMinAthletes] = useState(2);

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

      const res = await fetch("/api/athlete-network/race-sequences-clustered?min=2&max=8");
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

  // Extract cluster definitions from the first row
  const clusters: GMMCluster[] = useMemo(() => rows[0]?.clusters ?? [], [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if (r.athlete_count < minAthletes) return false;
      if (biasFilter === "low" && r.experience_bias_score > 1.5) return false;
      if (biasFilter === "high" && r.experience_bias_score < 2.0) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return out;
  }, [rows, sortKey, sortAsc, biasFilter, minAthletes]);

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
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <Link href="/admin/athlete-network" style={breadcrumbStyle}>Data Analysis</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <Link href="/admin/athlete-network/race-paths" style={breadcrumbStyle}>Race Paths</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <Link href="/admin/athlete-network/race-sequences" style={breadcrumbStyle}>Trajectories</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <h1 style={titleStyle}>Cluster Analysis</h1>
            </div>
            <p style={subtitleStyle}>
              Athletes are grouped into 4 experience clusters via Gaussian Mixture Model (EM).
              Enrichment shows whether a sequence is followed by all athletes or skewed toward veterans.
              Sequences with enrichment ≈ 1 across clusters are genuinely predictive.
            </p>
          </div>
        </div>

        {/* Cluster legend */}
        {!loading && clusters.length > 0 && (
          <div style={legendBoxStyle}>
            <span style={legendTitleStyle}>Experience clusters</span>
            <div style={clusterChipsStyle}>
              {clusters.map((c) => {
                const col = CLUSTER_COLORS[c.id] ?? CLUSTER_COLORS[0];
                return (
                  <div key={c.id} style={{ ...clusterChipStyle, background: col.bg, color: col.color, border: `1.5px solid ${col.border}` }}>
                    <span style={clusterLabelStyle}>{c.label}</span>
                    <span style={clusterStatStyle}>{c.mean_race_count} races avg · {c.mean_span} yr avg</span>
                    <span style={{ ...clusterSizeStyle, background: col.border }}>{c.size} athletes</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={filterBarStyle}>
          <label style={filterLabelStyle}>
            Experience bias
            <select value={biasFilter} onChange={(e) => setBiasFilter(e.target.value as BiasFilter)} style={selectStyle}>
              <option value="all">All sequences</option>
              <option value="low">Low bias (≤ 1.5×)</option>
              <option value="high">High bias (≥ 2×)</option>
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
            {loading ? "Computing clusters…" : `${filtered.length} sequences`}
          </span>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <section style={cardStyle}>
          {loading ? (
            <p style={helperStyle}>Running GMM clustering…</p>
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
                    <Th onClick={() => toggleSort("probability")} right>
                      % of field <SortIndicator col="probability" />
                    </Th>
                    <Th right>Cluster profile</Th>
                    <Th onClick={() => toggleSort("experience_bias_score")} right>
                      Bias <SortIndicator col="experience_bias_score" />
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.path_names.join("|")} style={trStyle}>
                      <td style={tdStyle}>
                        <span style={lengthBadgeStyle}>{row.path_length}</span>
                      </td>
                      <td style={tdPathStyle}>
                        <PathChain names={row.path_names} />
                      </td>
                      <td style={tdNumStyle}>{row.athlete_count}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={probStyle}>{(Number(row.probability) * 100).toFixed(2)}%</span>
                      </td>
                      <td style={{ ...tdStyle, minWidth: "220px" }}>
                        <ClusterBar profile={row.cluster_profile} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <BiasScore score={row.experience_bias_score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={footnotesStyle}>
          <p style={footnoteStyle}>
            <strong>Enrichment</strong> = fraction of sequence athletes in cluster ÷ baseline fraction of cluster in full population.
            1.0 = neutral; {">"} 1.5 = over-represented (experience-driven); {"<"} 0.7 = under-represented.
          </p>
          <p style={footnoteStyle}>
            <strong>Bias score</strong> = max enrichment in the Experienced or Veteran clusters.
            Sequences with low bias are predictive across all experience levels.
          </p>
        </div>

      </div>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function ClusterBar({ profile }: { profile: ClusterProfile[] }) {
  return (
    <div style={clusterBarWrapStyle}>
      {profile.map((p) => {
        const col = CLUSTER_COLORS[p.cluster_id] ?? CLUSTER_COLORS[0];
        const isOver = p.enrichment > 1.4;
        const isUnder = p.enrichment < 0.7 && p.pct_of_sequence > 0;
        return (
          <div
            key={p.cluster_id}
            title={`${p.label}: ${(p.pct_of_sequence * 100).toFixed(0)}% of athletes (×${p.enrichment.toFixed(2)} vs baseline)`}
            style={{
              ...clusterSegStyle,
              background: isOver ? col.bg : "#f5f5f5",
              border: `1px solid ${isOver ? col.border : "#e0e0e0"}`,
              color: isOver ? col.color : "#aaa",
              fontWeight: isOver ? 700 : 400,
              opacity: isUnder ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: "10px" }}>{p.label.slice(0, 3)}</span>
            <span style={{ fontSize: "11px", fontWeight: 700 }}> ×{p.enrichment.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function BiasScore({ score }: { score: number }) {
  let bg = "#e8f5e9", color = "#1b5e20";
  if (score >= 2.0) { bg = "#fce4ec"; color = "#880e4f"; }
  else if (score >= 1.5) { bg = "#fff3e6"; color = "#b85c00"; }
  return (
    <span style={{ ...biasChipStyle, background: bg, color }}>
      ×{score.toFixed(2)}
    </span>
  );
}

function Th({ children, onClick, right }: { children: React.ReactNode; onClick?: () => void; right?: boolean }) {
  return (
    <th onClick={onClick} style={{ ...thStyle, textAlign: right ? "right" : "left", cursor: onClick ? "pointer" : "default", userSelect: "none" }}>
      {children}
    </th>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1400px", margin: "0 auto" };

const headerRowStyle: React.CSSProperties = { marginBottom: "20px" };
const breadcrumbStyle: React.CSSProperties = { fontSize: "14px", color: "#666", textDecoration: "none", fontWeight: 500 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "22px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "6px 0 0", color: "#555", fontSize: "14px", lineHeight: 1.5, maxWidth: "720px" };

const legendBoxStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "10px", border: "1px solid #e5e5e5",
  padding: "14px 20px", marginBottom: "12px",
};
const legendTitleStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: "10px" };
const clusterChipsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const clusterChipStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "8px",
  padding: "6px 12px", borderRadius: "8px", fontSize: "12px",
};
const clusterLabelStyle: React.CSSProperties = { fontWeight: 700 };
const clusterStatStyle: React.CSSProperties = { opacity: 0.8 };
const clusterSizeStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px" };

const filterBarStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
  marginBottom: "16px", padding: "14px 20px", background: "#fff",
  borderRadius: "10px", border: "1px solid #e5e5e5",
};
const filterLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#444" };
const selectStyle: React.CSSProperties = { padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "13px", background: "#fafafa", cursor: "pointer" };
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
const tdPathStyle: React.CSSProperties = { ...tdStyle, maxWidth: "400px" };

const lengthBadgeStyle: React.CSSProperties = {
  display: "inline-block", width: "26px", height: "26px", lineHeight: "24px",
  textAlign: "center", borderRadius: "6px", fontSize: "13px", fontWeight: 700,
  background: "#f0f4ff", color: "#2952b3", border: "1px solid #c7d7f9",
};

const chainStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px" };
const arrowStyle: React.CSSProperties = { color: "#bbb", fontSize: "13px", flexShrink: 0 };
const raceNameStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 500, color: "#222" };

const probStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 700, color: "#444", fontVariantNumeric: "tabular-nums" };

const clusterBarWrapStyle: React.CSSProperties = { display: "flex", gap: "4px", flexWrap: "wrap" };
const clusterSegStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "2px",
  padding: "3px 8px", borderRadius: "6px", fontSize: "11px",
  whiteSpace: "nowrap", cursor: "default",
};

const biasChipStyle: React.CSSProperties = {
  display: "inline-block", padding: "3px 9px", borderRadius: "6px",
  fontSize: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums",
};

const footnotesStyle: React.CSSProperties = { fontSize: "12px", color: "#888" };
const footnoteStyle: React.CSSProperties = { margin: "4px 0", lineHeight: 1.6 };

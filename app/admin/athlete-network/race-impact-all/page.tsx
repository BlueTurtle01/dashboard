"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { PairImpactSummary, CachedResponse } from "@/app/api/athlete-network/race-impact-all/route";

export const dynamic = "force-dynamic";

type SortKey = "time_p_value" | "dnf_p_value" | "treatment_n" | "median_diff_seconds" | "experience_gap";

function formatDiff(seconds: number): string {
  const mins = Math.round(Math.abs(seconds) / 60);
  if (mins === 0) return "±0 min";
  return seconds > 0 ? `+${mins} min` : `−${mins} min`;
}

function formatPct(v: number, d = 1) { return `${(v * 100).toFixed(d)}%`; }

function pLabel(p: number): string {
  if (isNaN(p) || p >= 1) return "—";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function RaceImpactAllPage() {
  const router = useRouter();
  const [rows, setRows] = useState<PairImpactSummary[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [cacheKey, setCacheKey] = useState("");
  const [loadState, setLoadState] = useState<"idle" | "loading" | "computing" | "ready">("idle");
  const [error, setError] = useState("");

  // Controls
  const [firstTimeOnly, setFirstTimeOnly] = useState(true);
  const [minN, setMinN] = useState(5);
  const [sigOnly, setSigOnly] = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("time_p_value");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r) => r.role === "admin")) { router.push("/login"); return; }
      loadCache(true);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function loadCache(silent = false) {
    if (!silent) setLoadState("loading");
    try {
      const res = await fetch(`/api/athlete-network/race-impact-all?first_time_only=${firstTimeOnly}&min_n=${minN}`);
      const body = await res.json() as CachedResponse & { error?: string };
      if (!res.ok) { setError(body.error ?? "Failed"); return; }
      if (body.results) {
        setRows(body.results);
        setComputedAt(body.computed_at);
        setIsStale(body.is_stale);
        setCacheKey(body.cache_key);
        setLoadState("ready");
      } else {
        setLoadState("idle");
      }
    } catch {
      setError("Unexpected error"); setLoadState("idle");
    }
  }

  async function compute() {
    setLoadState("computing");
    setError("");
    try {
      const res = await fetch(
        `/api/athlete-network/race-impact-all?first_time_only=${firstTimeOnly}&min_n=${minN}&limit=100`,
        { method: "POST" }
      );
      const body: CachedResponse = await res.json();
      if (!res.ok) { setError((body as { error: string }).error ?? "Failed"); setLoadState("idle"); return; }
      setRows(body.results ?? []);
      setComputedAt(body.computed_at);
      setIsStale(false);
      setCacheKey(body.cache_key);
      setLoadState("ready");
    } catch {
      setError("Unexpected error"); setLoadState("idle");
    }
  }

  const filtered = useMemo(() => {
    let out = rows;
    if (sigOnly) out = out.filter((r) => r.time_significant || r.dnf_significant);
    return [...out].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "time_p_value") {
        av = isNaN(a.time_p_value) ? 1 : a.time_p_value;
        bv = isNaN(b.time_p_value) ? 1 : b.time_p_value;
      } else if (sortKey === "dnf_p_value") {
        av = a.dnf_p_value; bv = b.dnf_p_value;
      } else if (sortKey === "median_diff_seconds") {
        av = Math.abs(a.median_diff_seconds); bv = Math.abs(b.median_diff_seconds);
      } else {
        av = a[sortKey] as number; bv = b[sortKey] as number;
      }
      return sortAsc ? av - bv : bv - av;
    });
  }, [rows, sigOnly, sortKey, sortAsc]);

  const sigCount = rows.filter((r) => r.time_significant || r.dnf_significant).length;
  const isComputing = loadState === "computing";
  const isLoading = loadState === "loading";
  const hasResults = loadState === "ready" && rows.length > 0;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  }

  function SI({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#ccc", marginLeft: 3 }}>↕</span>;
    return <span style={{ marginLeft: 3 }}>{sortAsc ? "↑" : "↓"}</span>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>

        <div style={headerRowStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Link href="/admin/athlete-network" style={breadcrumbStyle}>Data Analysis</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <h1 style={titleStyle}>Impact Rankings</h1>
            </div>
            <p style={subtitleStyle}>
              All race pairs ranked by statistical significance. Results are cached —
              recompute when new race data is imported.
            </p>
          </div>
          <button onClick={() => router.push("/admin/athlete-network")} style={backButtonStyle}>← Back</button>
        </div>

        {/* Controls */}
        <div style={controlsCardStyle}>
          <div style={controlsRowStyle}>
            <label style={filterLabelStyle}>
              Min treatment group
              <select
                value={minN}
                onChange={(e) => { setMinN(Number(e.target.value)); setLoadState("idle"); }}
                style={selectStyle}
              >
                {[3, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}+ athletes</option>)}
              </select>
            </label>

            <label style={checkLabelStyle}>
              <input
                type="checkbox"
                checked={firstTimeOnly}
                onChange={(e) => { setFirstTimeOnly(e.target.checked); setLoadState("idle"); }}
              />
              <span>First-time Race B only</span>
            </label>

            <button
              onClick={compute}
              disabled={isComputing || isLoading}
              style={{ ...computeButtonStyle, opacity: (isComputing || isLoading) ? 0.55 : 1, cursor: (isComputing || isLoading) ? "not-allowed" : "pointer" }}
            >
              {isComputing ? "Computing…" : hasResults ? "Recompute" : "Compute"}
            </button>
          </div>

          {/* Cache status bar */}
          {(hasResults || isStale) && (
            <div style={cacheStatusBarStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {isStale ? (
                  <span style={staleTagStyle}>Stale</span>
                ) : (
                  <span style={freshTagStyle}>Up to date</span>
                )}
                {computedAt && (
                  <span style={{ fontSize: "12px", color: "#888" }}>
                    Last computed {formatDate(computedAt)}
                  </span>
                )}
                {cacheKey && (
                  <span style={{ fontSize: "11px", color: "#bbb" }}>({cacheKey})</span>
                )}
              </div>
              {isStale && (
                <span style={{ fontSize: "12px", color: "#d46b08" }}>
                  New race results have been imported since this was last computed.
                </span>
              )}
            </div>
          )}

          {hasResults && (
            <div style={postComputeRowStyle}>
              <span style={{ fontSize: "13px", color: "#666" }}>
                {rows.length} pairs analysed ·{" "}
                <strong style={{ color: "#1e7c34" }}>{sigCount} significant</strong>
              </span>
              <label style={checkLabelStyle}>
                <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} />
                <span>Significant only</span>
              </label>
            </div>
          )}
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        {(isComputing || isLoading) && (
          <div style={emptyStateStyle}>
            <p style={emptyTextStyle}>
              {isComputing
                ? "Running analysis across all pairs — this takes a few seconds…"
                : "Loading cached results…"}
            </p>
          </div>
        )}

        {hasResults && !isComputing && !isLoading && (
          <>
            {filtered.length === 0 ? (
              <div style={emptyStateStyle}>
                <p style={emptyTextStyle}>No pairs match the current filters.</p>
              </div>
            ) : (
              <section style={cardStyle}>
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Race A (preparation)</th>
                        <th style={{ ...thStyle, width: "20px" }} />
                        <th style={thStyle}>Race B (goal)</th>
                        <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("treatment_n")}>
                          n <SI col="treatment_n" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("median_diff_seconds")}>
                          Effect <SI col="median_diff_seconds" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "center" }}>Field pos.</th>
                        <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("time_p_value")}>
                          Time p <SI col="time_p_value" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("dnf_p_value")}>
                          DNF p <SI col="dnf_p_value" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort("experience_gap")}>
                          Exp. gap <SI col="experience_gap" />
                        </th>
                        <th style={{ ...thStyle, textAlign: "center" }}>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, idx) => (
                        <PairRow key={idx} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div style={legendStyle}>
              <strong>n</strong> = treatment / control · <strong>Effect</strong> = median time diff (−=faster) ·{" "}
              <strong>Field pos.</strong> = treatment vs control median percentile ·{" "}
              <strong>Exp. gap</strong> = avg races in DB (high = more confounding risk) ·{" "}
              <span style={{ color: "#1e7c34" }}>✓ p &lt; 0.05</span>
            </div>
          </>
        )}

        {loadState === "idle" && !error && (
          <div style={emptyStateStyle}>
            <p style={emptyTextStyle}>
              Click <strong>Compute</strong> to run significance tests across every race pairing.
              Results will be saved and reloaded automatically on future visits.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

function PairRow({ row }: { row: PairImpactSummary }) {
  const diffMins = Math.round(Math.abs(row.median_diff_seconds) / 60);
  const isSlower = row.median_diff_seconds > 30;
  const isFaster = row.median_diff_seconds < -30;

  const treatPct = row.treatment_median_pct;
  const ctrlPct = row.control_median_pct;
  const pctAdv = treatPct != null && ctrlPct != null ? ctrlPct - treatPct : null;
  const expGapColor = row.experience_gap > 2 ? "#b00020" : row.experience_gap > 1 ? "#d46b08" : "#888";

  // Build deep-dive URL (page requires selecting races manually for now)
  const deepUrl = `/admin/athlete-network/race-impact`;

  return (
    <tr style={trStyle}>
      <td style={tdStyle}>{row.race_a_name}</td>
      <td style={{ ...tdStyle, color: "#bbb", padding: "11px 2px" }}>→</td>
      <td style={{ ...tdStyle, fontWeight: 500 }}>{row.race_b_name}</td>

      <td style={tdNumStyle}>
        <span style={{ fontWeight: 600 }}>{row.treatment_n}</span>
        <span style={{ color: "#bbb", fontSize: "12px" }}> / {row.control_n.toLocaleString()}</span>
      </td>

      <td style={tdNumStyle}>
        {diffMins === 0 ? (
          <span style={{ color: "#bbb" }}>—</span>
        ) : (
          <span style={{ fontWeight: 600, color: isFaster ? "#1e7c34" : isSlower ? "#d46b08" : "#888" }}>
            {formatDiff(row.median_diff_seconds)}
          </span>
        )}
      </td>

      <td style={{ ...tdStyle, textAlign: "center" }}>
        {treatPct != null && ctrlPct != null ? (
          <span style={{ fontSize: "12px", color: pctAdv != null && pctAdv > 0.02 ? "#1e7c34" : pctAdv != null && pctAdv < -0.02 ? "#d46b08" : "#888" }}>
            {formatPct(treatPct, 0)} vs {formatPct(ctrlPct, 0)}
          </span>
        ) : <span style={{ color: "#bbb" }}>—</span>}
      </td>

      <td style={tdNumStyle}><PValCell p={row.time_p_value} sig={row.time_significant} /></td>
      <td style={tdNumStyle}><PValCell p={row.dnf_p_value} sig={row.dnf_significant} /></td>

      <td style={{ ...tdNumStyle, color: expGapColor, fontWeight: row.experience_gap > 1 ? 600 : 400 }}>
        {row.experience_gap > 0 ? `+${row.experience_gap.toFixed(1)}` : row.experience_gap.toFixed(1)}
      </td>

      <td style={{ ...tdStyle, textAlign: "center" }}>
        <Link href={deepUrl} style={deepDiveLinkStyle} title="Open in Race Impact">↗</Link>
      </td>
    </tr>
  );
}

function PValCell({ p, sig }: { p: number; sig: boolean }) {
  if (isNaN(p) || p >= 1) return <span style={{ color: "#bbb" }}>—</span>;
  return (
    <span style={{ fontWeight: sig ? 700 : 400, color: sig ? "#1e7c34" : p < 0.1 ? "#d46b08" : "#aaa", fontVariantNumeric: "tabular-nums" }}>
      {sig && <span style={{ marginRight: "4px" }}>✓</span>}
      {pLabel(p)}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1300px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", gap: "16px", flexWrap: "wrap" };
const breadcrumbStyle: React.CSSProperties = { fontSize: "14px", color: "#666", textDecoration: "none", fontWeight: 500 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "22px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "6px 0 0", color: "#555", fontSize: "14px", lineHeight: 1.4, maxWidth: "600px" };
const backButtonStyle: React.CSSProperties = { padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "14px", whiteSpace: "nowrap" };

const controlsCardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "18px 24px", marginBottom: "20px" };
const controlsRowStyle: React.CSSProperties = { display: "flex", alignItems: "flex-end", gap: "20px", flexWrap: "wrap" };
const cacheStatusBarStyle: React.CSSProperties = { marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #f0f0f0", display: "flex", flexDirection: "column", gap: "4px" };
const postComputeRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #f0f0f0" };
const filterLabelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", fontSize: "13px", fontWeight: 600, color: "#444" };
const selectStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "13px", background: "#fafafa", cursor: "pointer" };
const checkLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#444", cursor: "pointer", paddingBottom: "2px" };
const computeButtonStyle: React.CSSProperties = { padding: "10px 24px", borderRadius: "8px", border: "none", background: "#111", color: "#fff", fontWeight: 700, fontSize: "14px" };

const freshTagStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#e6f4ea", color: "#1e7c34" };
const staleTagStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#fff3e6", color: "#d46b08" };

const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", overflow: "hidden", marginBottom: "16px" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const thStyle: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #e5e5e5", fontSize: "11px", fontWeight: 700, color: "#666", background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left" };
const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: "13px", verticalAlign: "middle" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const deepDiveLinkStyle: React.CSSProperties = { fontSize: "14px", color: "#999", textDecoration: "none", padding: "4px 8px", borderRadius: "4px", display: "inline-block" };
const legendStyle: React.CSSProperties = { fontSize: "12px", color: "#999", lineHeight: 1.8 };
const emptyStateStyle: React.CSSProperties = { textAlign: "center", padding: "60px 24px" };
const emptyTextStyle: React.CSSProperties = { color: "#999", fontSize: "14px" };

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { RaceImpactResult } from "@/app/api/athlete-network/race-impact/route";

export const dynamic = "force-dynamic";

interface RaceOption {
  id: string;
  name: string;
}

function formatTime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatPct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}

function pLabel(p: number): string {
  if (isNaN(p)) return "—";
  if (p < 0.001) return "p < 0.001";
  if (p < 0.01) return `p = ${p.toFixed(3)}`;
  return `p = ${p.toFixed(3)}`;
}

export default function RaceImpactPage() {
  const router = useRouter();
  const [races, setRaces] = useState<RaceOption[]>([]);
  const [raceAId, setRaceAId] = useState("");
  const [raceBId, setRaceBId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RaceImpactResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r) => r.role === "admin")) {
        router.push("/login"); return;
      }

      // Races that have results data
      const { data } = await supabase
        .from("races")
        .select("id, name")
        .order("name");
      setRaces((data ?? []) as RaceOption[]);
    }
    init();
  }, [router]);

  async function analyse() {
    if (!raceAId || !raceBId) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(
        `/api/athlete-network/race-impact?race_a_id=${raceAId}&race_b_id=${raceBId}`
      );
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Failed"); return; }
      setResult(body);
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
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
              <h1 style={titleStyle}>Race Impact Analysis</h1>
            </div>
            <p style={subtitleStyle}>
              Does completing Race A before Race B correlate with better Race B outcomes?
              Uses Mann-Whitney U (finish time) and Fisher's exact test (DNF rate) at 95% confidence.
            </p>
          </div>
          <button onClick={() => router.push("/admin/athlete-network")} style={backButtonStyle}>
            ← Back
          </button>
        </div>

        {/* Selectors */}
        <div style={selectorCardStyle}>
          <div style={selectorRowStyle}>
            <label style={selectorLabelStyle}>
              Race A — preparation race
              <select
                value={raceAId}
                onChange={(e) => { setRaceAId(e.target.value); setResult(null); }}
                style={selectStyle}
              >
                <option value="">Select a race…</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>

            <span style={arrowStyle}>→</span>

            <label style={selectorLabelStyle}>
              Race B — goal race
              <select
                value={raceBId}
                onChange={(e) => { setRaceBId(e.target.value); setResult(null); }}
                style={selectStyle}
              >
                <option value="">Select a race…</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>

            <button
              onClick={analyse}
              disabled={!raceAId || !raceBId || loading}
              style={{
                ...analyseButtonStyle,
                opacity: (!raceAId || !raceBId || loading) ? 0.5 : 1,
                cursor: (!raceAId || !raceBId || loading) ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Computing…" : "Analyse"}
            </button>
          </div>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        {result && (
          <>
            {/* Stat cards */}
            <div style={statsRowStyle}>
              <StatCard
                label="Treatment group"
                value={result.treatment.n.toString()}
                description={`Athletes who did ${result.race_a_name} before ${result.race_b_name}`}
              />
              <StatCard
                label="Control group"
                value={result.control.n.toString()}
                description={`Athletes in ${result.race_b_name} without prior ${result.race_a_name}`}
              />
              <SignificanceCard result={result} />
            </div>

            {result.insufficient_data ? (
              <div style={insufficientStyle}>
                <p style={insufficientTextStyle}>
                  <strong>Insufficient data</strong> — fewer than 5 finishers in the treatment group
                  (n = {result.treatment.n_finished}). Statistical tests require more data to be reliable.
                </p>
              </div>
            ) : (
              <>
                {/* Comparison table */}
                <section style={cardStyle}>
                  <h2 style={sectionTitleStyle}>Group comparison</h2>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Metric</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>
                            With {result.race_a_name}
                            <span style={groupNStyle}> (n={result.treatment.n})</span>
                          </th>
                          <th style={{ ...thStyle, textAlign: "right" }}>
                            Without {result.race_a_name}
                            <span style={groupNStyle}> (n={result.control.n})</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <CompRow
                          label="Finished"
                          a={`${result.treatment.n_finished} (${formatPct(result.treatment.n_finished / result.treatment.n)})`}
                          b={`${result.control.n_finished} (${formatPct(result.control.n_finished / result.control.n)})`}
                        />
                        <CompRow
                          label="DNF rate"
                          a={`${formatPct(result.treatment.dnf_rate)} [${formatPct(result.treatment.dnf_ci[0])}–${formatPct(result.treatment.dnf_ci[1])}]`}
                          b={`${formatPct(result.control.dnf_rate)} [${formatPct(result.control.dnf_ci[0])}–${formatPct(result.control.dnf_ci[1])}]`}
                        />
                        <CompRow
                          label="Median finish time"
                          a={formatTime(result.treatment.median_finish_seconds)}
                          b={formatTime(result.control.median_finish_seconds)}
                          highlight={result.time_test.significant}
                        />
                        <CompRow
                          label="IQR (25th–75th %ile)"
                          a={`${formatTime(result.treatment.p25_finish_seconds)} – ${formatTime(result.treatment.p75_finish_seconds)}`}
                          b={`${formatTime(result.control.p25_finish_seconds)} – ${formatTime(result.control.p75_finish_seconds)}`}
                        />
                        <CompRow
                          label="Median field position"
                          a={result.treatment.median_field_percentile != null ? `Top ${formatPct(result.treatment.median_field_percentile)}` : "—"}
                          b={result.control.median_field_percentile != null ? `Top ${formatPct(result.control.median_field_percentile)}` : "—"}
                          highlight={result.time_test.significant}
                        />
                        <tr style={trStyle}>
                          <td style={tdLabelStyle}>Median time difference</td>
                          <td colSpan={2} style={{ ...tdStyle, textAlign: "right" }}>
                            <TimeDiffCell seconds={result.time_test.median_diff_seconds} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Test results */}
                <section style={cardStyle}>
                  <h2 style={sectionTitleStyle}>Statistical tests</h2>
                  <div style={tableWrapStyle}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Test</th>
                          <th style={thStyle}>What it measures</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Statistic</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>p-value</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={trStyle}>
                          <td style={tdLabelStyle}>Mann-Whitney U</td>
                          <td style={tdStyle}>Finish time distribution</td>
                          <td style={tdNumStyle}>
                            {isNaN(result.time_test.z) ? "—" : `Z = ${result.time_test.z.toFixed(2)}`}
                          </td>
                          <td style={tdNumStyle}>{pLabel(result.time_test.p_value)}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <SigBadge significant={result.time_test.significant} pValue={result.time_test.p_value} />
                          </td>
                        </tr>
                        <tr style={trStyle}>
                          <td style={tdLabelStyle}>Fisher's exact</td>
                          <td style={tdStyle}>DNF rate difference</td>
                          <td style={tdNumStyle}>
                            {result.dnf_test.odds_ratio === 999
                              ? "OR = ∞"
                              : `OR = ${result.dnf_test.odds_ratio.toFixed(2)}`}
                          </td>
                          <td style={tdNumStyle}>{pLabel(result.dnf_test.p_value)}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>
                            <SigBadge significant={result.dnf_test.significant} pValue={result.dnf_test.p_value} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p style={testNoteStyle}>
                    Significant = p &lt; 0.05 (95% confidence). OR = odds ratio for DNF (treatment ÷ control).
                    An OR &lt; 1 means the treatment group has fewer DNFs.
                  </p>
                </section>
              </>
            )}

            {/* Confounding caveat */}
            <div style={cautionBoxStyle}>
              <p style={cautionTextStyle}>
                <strong>Observational data caveat:</strong> Athletes with {result.race_a_name} in their
                history tend to be more experienced and prolific racers generally. A significant result
                means these groups perform differently in {result.race_b_name} — it does not establish
                that completing {result.race_a_name} <em>caused</em> the difference. Selection bias
                is the most likely confounding factor.
              </p>
            </div>
          </>
        )}

        {!result && !loading && (
          <div style={emptyStateStyle}>
            <p style={emptyTextStyle}>Select Race A and Race B above, then click Analyse.</p>
          </div>
        )}

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

function SignificanceCard({ result }: { result: RaceImpactResult }) {
  const timesSig = result.time_test.significant;
  const dnfSig = result.dnf_test.significant;
  const either = timesSig || dnfSig;
  const insufficient = result.insufficient_data;

  let bg = "#f5f5f5", color = "#888", label = "Insufficient data";
  if (!insufficient) {
    if (either) { bg = "#e6f4ea"; color = "#1e7c34"; label = "Significant result"; }
    else { bg = "#fff3e6"; color = "#d46b08"; label = "Not significant"; }
  }

  return (
    <div style={{ ...statCardStyle, background: bg }}>
      <p style={{ ...statLabelStyle, color }}>Significance (95% CI)</p>
      <p style={{ ...statValueStyle, color, fontSize: "20px", marginTop: "10px" }}>{label}</p>
      {!insufficient && (
        <p style={{ ...statDescStyle, color }}>
          Time: {pLabel(result.time_test.p_value)} · DNF: {pLabel(result.dnf_test.p_value)}
        </p>
      )}
    </div>
  );
}

function CompRow({ label, a, b, highlight }: { label: string; a: string; b: string; highlight?: boolean }) {
  return (
    <tr style={trStyle}>
      <td style={tdLabelStyle}>{label}</td>
      <td style={{ ...tdStyle, textAlign: "right", fontWeight: highlight ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{a}</td>
      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{b}</td>
    </tr>
  );
}

function TimeDiffCell({ seconds }: { seconds: number }) {
  if (!seconds || seconds === 0) return <span style={{ color: "#888" }}>No difference</span>;
  const mins = Math.round(Math.abs(seconds) / 60);
  const faster = seconds > 0; // positive medianDiff means treatment is slower (higher seconds)
  const label = faster
    ? `Treatment is ${mins} min slower than control`
    : `Treatment is ${mins} min faster than control`;
  const color = faster ? "#d46b08" : "#1e7c34";
  return <span style={{ fontWeight: 600, color }}>{label}</span>;
}

function SigBadge({ significant, pValue }: { significant: boolean; pValue: number }) {
  if (isNaN(pValue)) return <span style={insufBadgeStyle}>—</span>;
  if (significant)
    return <span style={sigBadgeStyle}>✓ Significant</span>;
  return <span style={notSigBadgeStyle}>✗ Not significant</span>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto" };

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

const selectorCardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5",
  padding: "20px 24px", marginBottom: "24px",
};
const selectorRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-end", gap: "16px", flexWrap: "wrap",
};
const selectorLabelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "6px",
  fontSize: "13px", fontWeight: 600, color: "#444", flex: "1 1 200px",
};
const selectStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: "8px", border: "1px solid #ddd",
  fontSize: "13px", background: "#fafafa", cursor: "pointer",
};
const arrowStyle: React.CSSProperties = {
  fontSize: "20px", color: "#bbb", paddingBottom: "8px", flexShrink: 0,
};
const analyseButtonStyle: React.CSSProperties = {
  padding: "10px 24px", borderRadius: "8px", border: "none",
  background: "#111", color: "#fff", fontWeight: 700, fontSize: "14px",
  flexShrink: 0, alignSelf: "flex-end",
};

const statsRowStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: "16px", marginBottom: "24px",
};
const statCardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "20px 24px" };
const statLabelStyle: React.CSSProperties = { margin: 0, fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" };
const statValueStyle: React.CSSProperties = { margin: "6px 0 4px", fontSize: "28px", fontWeight: 700, color: "#111" };
const statDescStyle: React.CSSProperties = { margin: 0, fontSize: "12px", color: "#666", lineHeight: 1.4 };

const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5",
  padding: "24px", marginBottom: "16px",
};
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", fontWeight: 700 };

const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = {
  padding: "10px 14px", borderBottom: "1px solid #e5e5e5",
  fontSize: "12px", fontWeight: 700, color: "#666",
  background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left",
};
const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: "13px", verticalAlign: "middle" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdLabelStyle: React.CSSProperties = { ...tdStyle, color: "#555", width: "180px" };
const groupNStyle: React.CSSProperties = { fontWeight: 400, color: "#aaa" };

const testNoteStyle: React.CSSProperties = { margin: "14px 0 0", fontSize: "12px", color: "#999", lineHeight: 1.5 };

const sigBadgeStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px",
  background: "#e6f4ea", color: "#1e7c34",
};
const notSigBadgeStyle: React.CSSProperties = {
  fontSize: "12px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px",
  background: "#f5f5f5", color: "#888",
};
const insufBadgeStyle: React.CSSProperties = {
  fontSize: "12px", padding: "3px 10px", borderRadius: "999px",
  background: "#f5f5f5", color: "#bbb",
};

const insufficientStyle: React.CSSProperties = {
  background: "#f5f5f5", borderRadius: "12px", border: "1px solid #e0e0e0",
  padding: "20px 24px", marginBottom: "16px",
};
const insufficientTextStyle: React.CSSProperties = { margin: 0, fontSize: "14px", color: "#666" };

const cautionBoxStyle: React.CSSProperties = {
  background: "#fffbe6", border: "1px solid #ffe58f", borderRadius: "10px",
  padding: "16px 20px", marginBottom: "16px",
};
const cautionTextStyle: React.CSSProperties = { margin: 0, fontSize: "13px", color: "#7a5c00", lineHeight: 1.6 };

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center", padding: "60px 24px",
};
const emptyTextStyle: React.CSSProperties = { color: "#999", fontSize: "15px" };

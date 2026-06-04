"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { predictionInterval } from "@/lib/race-analysis/stats";
import type { RaceCorrelationResult, ExperienceBand } from "@/app/api/athlete-network/race-correlation/route";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseTimeInput(value: string): number | null {
  // Accept h:mm:ss, h:mm, or plain minutes
  const parts = value.trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 3600 + parts[1] * 60;
  if (parts.length === 1 && parts[0] > 0) return parts[0] * 60;
  return null;
}

function rLabel(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.7) return "strong";
  if (a >= 0.4) return "moderate";
  if (a >= 0.2) return "weak";
  return "negligible";
}

function rColor(r: number): { bg: string; color: string } {
  const a = Math.abs(r);
  if (a >= 0.5) return { bg: "#e6f4ea", color: "#1e7c34" };
  if (a >= 0.25) return { bg: "#fff3e6", color: "#d46b08" };
  return { bg: "#f5f5f5", color: "#888" };
}

// Estimate percentile rank of targetTime within a band (linear interpolation)
function estimatePercentile(targetTime: number, band: ExperienceBand): number {
  const pts = [
    { p: 10, v: band.p10 }, { p: 25, v: band.p25 }, { p: 50, v: band.p50 },
    { p: 75, v: band.p75 }, { p: 90, v: band.p90 },
  ];
  if (targetTime <= band.p10) return 5;
  if (targetTime >= band.p90) return 95;
  for (let i = 0; i < pts.length - 1; i++) {
    const lo = pts[i], hi = pts[i + 1];
    if (targetTime >= lo.v && targetTime <= hi.v) {
      const frac = (targetTime - lo.v) / (hi.v - lo.v);
      return lo.p + frac * (hi.p - lo.p);
    }
  }
  return 50;
}

function verdict(pct: number): { label: string; bg: string; color: string } {
  // Lower time = faster = lower percentile (more impressive)
  if (pct <= 10) return { label: "Very unlikely — elite level", bg: "#fce4ec", color: "#880e4f" };
  if (pct <= 25) return { label: "Very ambitious", bg: "#fff3e6", color: "#b85c00" };
  if (pct <= 50) return { label: "Ambitious but plausible", bg: "#fffde7", color: "#a07000" };
  if (pct <= 75) return { label: "Realistic", bg: "#e6f4ea", color: "#1e7c34" };
  return { label: "Conservative", bg: "#e3f2fd", color: "#0d47a1" };
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Race { id: string; name: string; }

export default function RaceCorrelationPage() {
  const router = useRouter();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [result, setResult] = useState<RaceCorrelationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [racesLoading, setRacesLoading] = useState(true);
  const [error, setError] = useState("");

  // Target time checker state
  const [targetExp, setTargetExp] = useState("");
  const [targetTime, setTargetTime] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r) => r.role === "admin")) { router.push("/login"); return; }
      const { data } = await supabase.from("races").select("id, name").order("name");
      setRaces((data ?? []) as Race[]);
      setRacesLoading(false);
    }
    init().catch(() => setRacesLoading(false));
  }, [router]);

  async function analyse() {
    if (!selectedRaceId) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/athlete-network/race-correlation?race_id=${selectedRaceId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load");
      } else {
        setResult(await res.json());
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // Target time checker computation (client-side, no round-trip)
  const checkerOutput = useMemo(() => {
    if (!result || !targetExp || !targetTime) return null;
    const expYears = parseFloat(targetExp);
    const timeSec = parseTimeInput(targetTime);
    if (isNaN(expYears) || expYears < 0 || timeSec === null || timeSec <= 0) return null;

    // Find matching band
    const band = result.experience_bands.find(
      (b) => expYears >= b.min_years && expYears <= b.max_years
    ) ?? result.experience_bands[result.experience_bands.length - 1];

    // Regression prediction interval
    const pi = result.regression
      ? predictionInterval(expYears, result.regression)
      : null;

    const pct = band ? Math.round(estimatePercentile(timeSec, band)) : 50;
    const v = verdict(pct);

    return { pct, v, band, pi, expYears, timeSec };
  }, [result, targetExp, targetTime]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>

        {/* Header */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <Link href="/admin/athlete-network" style={breadcrumbStyle}>Data Analysis</Link>
            <span style={{ color: "#ccc" }}>/</span>
            <h1 style={titleStyle}>Race Correlation</h1>
          </div>
          <p style={subtitleStyle}>
            For a selected race, correlate years of running experience with finish time.
            Use the target time checker to assess whether a claimed finish time is realistic given an athlete&apos;s experience level.
          </p>
        </div>

        {/* Race selector */}
        <div style={selectorCardStyle}>
          <label style={filterLabelStyle}>
            Race
            <select
              value={selectedRaceId}
              onChange={(e) => setSelectedRaceId(e.target.value)}
              style={{ ...selectStyle, minWidth: "280px" }}
              disabled={racesLoading}
            >
              <option value="">— select a race —</option>
              {races.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <button
            onClick={analyse}
            disabled={!selectedRaceId || loading}
            style={{ ...analyseButtonStyle, opacity: !selectedRaceId || loading ? 0.5 : 1, cursor: !selectedRaceId || loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Computing…" : "Analyse"}
          </button>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        {result && result.n === 0 && (
          <p style={helperStyle}>No finisher data found for this race.</p>
        )}

        {result && result.n > 0 && (
          <>
            {/* Correlation summary */}
            <div style={statRowStyle}>
              <StatCard
                label="Experience (years) vs time"
                value={isNaN(result.years_correlation.r) ? "—" : result.years_correlation.r.toFixed(3)}
                sub={isNaN(result.years_correlation.r) ? "insufficient data" : `${rLabel(result.years_correlation.r)} · p=${result.years_correlation.pValue}`}
                colors={isNaN(result.years_correlation.r) ? { bg: "#f5f5f5", color: "#888" } : rColor(result.years_correlation.r)}
              />
              <StatCard
                label="Race count vs time"
                value={isNaN(result.count_correlation.r) ? "—" : result.count_correlation.r.toFixed(3)}
                sub={isNaN(result.count_correlation.r) ? "insufficient data" : `${rLabel(result.count_correlation.r)} · p=${result.count_correlation.pValue}`}
                colors={isNaN(result.count_correlation.r) ? { bg: "#f5f5f5", color: "#888" } : rColor(result.count_correlation.r)}
              />
              <StatCard
                label="R² (years model)"
                value={result.regression ? (result.regression.rSquared * 100).toFixed(1) + "%" : "—"}
                sub={result.regression ? `explains ${(result.regression.rSquared * 100).toFixed(1)}% of time variance` : "no model"}
                colors={{ bg: "#f0f4ff", color: "#2952b3" }}
              />
              <StatCard
                label="Finishers analysed"
                value={result.n.toLocaleString()}
                sub={`${result.race_name}`}
                colors={{ bg: "#fafafa", color: "#444" }}
              />
            </div>

            {/* Regression note */}
            {result.regression && (
              <div style={regressionNoteStyle}>
                Trend: each additional year of experience predicts{" "}
                <strong>{Math.abs(Math.round(result.regression.slope))}s {result.regression.slope < 0 ? "faster" : "slower"}</strong>
                {" "}finish time (slope = {result.regression.slope}s/yr, residual SE = {Math.round(result.regression.residualSE)}s).
              </div>
            )}

            {/* Experience-band table */}
            <section style={cardStyle}>
              <div style={cardHeaderStyle}>Finish times by experience band</div>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <Th>Band</Th>
                      <Th right>n</Th>
                      <Th right>p10 (fast)</Th>
                      <Th right>p25</Th>
                      <Th right>Median</Th>
                      <Th right>p75</Th>
                      <Th right>p90 (slow)</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.experience_bands.map((b) => (
                      <tr key={b.label} style={trStyle}>
                        <td style={tdStyle}><span style={bandBadgeStyle}>{b.label}</span></td>
                        <td style={tdNumStyle}>{b.n}</td>
                        <td style={{ ...tdNumStyle, color: "#1e7c34" }}>{fmtTime(b.p10)}</td>
                        <td style={tdNumStyle}>{fmtTime(b.p25)}</td>
                        <td style={{ ...tdNumStyle, fontWeight: 700 }}>{fmtTime(b.p50)}</td>
                        <td style={tdNumStyle}>{fmtTime(b.p75)}</td>
                        <td style={{ ...tdNumStyle, color: "#888" }}>{fmtTime(b.p90)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Target time checker */}
            <section style={cardStyle}>
              <div style={cardHeaderStyle}>Target time checker</div>
              <div style={{ padding: "20px" }}>
                <div style={checkerInputRowStyle}>
                  <label style={filterLabelStyle}>
                    Years of experience
                    <input
                      type="number"
                      min="0" max="30" step="0.5"
                      value={targetExp}
                      onChange={(e) => setTargetExp(e.target.value)}
                      placeholder="e.g. 2"
                      style={inputStyle}
                    />
                  </label>
                  <label style={filterLabelStyle}>
                    Target finish time
                    <input
                      type="text"
                      value={targetTime}
                      onChange={(e) => setTargetTime(e.target.value)}
                      placeholder="h:mm:ss or minutes"
                      style={inputStyle}
                    />
                  </label>
                </div>

                {checkerOutput && (
                  <div style={{ marginTop: "20px" }}>
                    <div style={{ ...verdictBoxStyle, background: checkerOutput.v.bg, borderColor: checkerOutput.v.color + "44" }}>
                      <span style={{ ...verdictLabelStyle, color: checkerOutput.v.color }}>
                        {checkerOutput.v.label}
                      </span>
                      <span style={verdictDetailStyle}>
                        A {checkerOutput.expYears}-year runner finishing in {fmtTime(checkerOutput.timeSec)} would be faster than approximately{" "}
                        <strong>{100 - checkerOutput.pct}%</strong> of {checkerOutput.band?.label ?? "similar"} runners in this race
                        (≈{checkerOutput.pct}th percentile for their experience band).
                      </span>
                    </div>

                    {checkerOutput.pi && (
                      <div style={piBoxStyle}>
                        <div style={piTitleStyle}>Regression prediction (95% interval)</div>
                        <div style={piValuesStyle}>
                          <span>Predicted: <strong>{fmtTime(checkerOutput.pi.predicted)}</strong></span>
                          <span style={{ color: "#888" }}>Lower 95%: {fmtTime(Math.max(0, checkerOutput.pi.lower))}</span>
                          <span style={{ color: "#888" }}>Upper 95%: {fmtTime(checkerOutput.pi.upper)}</span>
                        </div>
                      </div>
                    )}

                    {checkerOutput.band && (
                      <div style={bandContextStyle}>
                        <span style={bandContextTitleStyle}>Distribution for {checkerOutput.band.label} ({checkerOutput.band.n} athletes)</span>
                        <QuantileBar band={checkerOutput.band} targetSecs={checkerOutput.timeSec} />
                      </div>
                    )}
                  </div>
                )}

                <p style={footnoteStyle}>
                  Experience is measured from an athlete&apos;s first appearance in this dataset, not their actual race debut.
                  Underestimates real experience for athletes whose earlier races aren&apos;t in the database.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, colors }: { label: string; value: string; sub: string; colors: { bg: string; color: string } }) {
  return (
    <div style={{ ...statCardStyle, background: colors.bg }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 800, color: colors.color, lineHeight: 1, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "#666" }}>{sub}</div>
    </div>
  );
}

function QuantileBar({ band, targetSecs }: { band: ExperienceBand; targetSecs: number }) {
  const min = band.p10 * 0.92;
  const max = band.p90 * 1.08;
  const range = max - min;

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / range) * 100));

  const segments: { from: number; to: number; color: string }[] = [
    { from: band.p10, to: band.p25, color: "#e8f5e9" },
    { from: band.p25, to: band.p50, color: "#c8e6c9" },
    { from: band.p50, to: band.p75, color: "#ffecb3" },
    { from: band.p75, to: band.p90, color: "#ffe0b2" },
  ];

  const targetPct = pct(targetSecs);

  return (
    <div style={{ position: "relative", height: "36px", borderRadius: "6px", overflow: "visible", marginTop: "10px", background: "#f5f5f5" }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          style={{
            position: "absolute", top: 0, bottom: 0,
            left: `${pct(seg.from)}%`,
            width: `${pct(seg.to) - pct(seg.from)}%`,
            background: seg.color,
          }}
        />
      ))}
      {/* Target marker */}
      <div
        style={{
          position: "absolute", top: "-6px", bottom: "-6px",
          left: `${targetPct}%`,
          width: "3px", background: "#c62828", borderRadius: "2px",
          transform: "translateX(-50%)",
        }}
        title={`Your target: ${fmtTime(targetSecs)}`}
      />
      {/* Labels */}
      {[band.p10, band.p25, band.p50, band.p75, band.p90].map((v, i) => (
        <div key={i} style={{ position: "absolute", top: "38px", left: `${pct(v)}%`, transform: "translateX(-50%)", fontSize: "10px", color: "#888", whiteSpace: "nowrap" }}>
          {["p10", "p25", "p50", "p75", "p90"][i]}
        </div>
      ))}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ ...thStyle, textAlign: right ? "right" : "left" }}>{children}</th>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto" };

const breadcrumbStyle: React.CSSProperties = { fontSize: "14px", color: "#666", textDecoration: "none", fontWeight: 500 };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "22px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: 0, color: "#555", fontSize: "14px", lineHeight: 1.5, maxWidth: "680px" };

const selectorCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
  padding: "16px 20px", background: "#fff", borderRadius: "10px",
  border: "1px solid #e5e5e5", marginBottom: "16px",
};
const filterLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, color: "#444" };
const selectStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "13px", background: "#fafafa", cursor: "pointer" };
const analyseButtonStyle: React.CSSProperties = {
  padding: "9px 20px", borderRadius: "8px", border: "none",
  background: "#2952b3", color: "#fff", fontWeight: 700, fontSize: "13px",
};
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px" };

const statRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px" };
const statCardStyle: React.CSSProperties = { padding: "16px 20px", borderRadius: "10px", border: "1px solid #e5e5e5" };

const regressionNoteStyle: React.CSSProperties = {
  fontSize: "13px", color: "#555", padding: "10px 16px",
  background: "#f0f4ff", borderRadius: "8px", marginBottom: "16px",
  border: "1px solid #c7d7f9",
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", overflow: "hidden", marginBottom: "16px" };
const cardHeaderStyle: React.CSSProperties = { padding: "14px 20px", fontWeight: 700, fontSize: "13px", borderBottom: "1px solid #f0f0f0", background: "#fafafa" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const thStyle: React.CSSProperties = {
  padding: "10px 14px", borderBottom: "1px solid #e5e5e5",
  fontSize: "11px", fontWeight: 700, color: "#666",
  background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.04em",
};
const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };
const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: "13px", verticalAlign: "middle" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const bandBadgeStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#444" };

const checkerInputRowStyle: React.CSSProperties = { display: "flex", gap: "20px", flexWrap: "wrap" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #ddd", fontSize: "13px", width: "140px" };

const verdictBoxStyle: React.CSSProperties = {
  padding: "14px 18px", borderRadius: "10px", border: "1px solid",
  marginBottom: "12px",
};
const verdictLabelStyle: React.CSSProperties = { display: "block", fontWeight: 800, fontSize: "15px", marginBottom: "4px" };
const verdictDetailStyle: React.CSSProperties = { fontSize: "13px", color: "#444", lineHeight: 1.5 };

const piBoxStyle: React.CSSProperties = {
  padding: "12px 16px", borderRadius: "8px", background: "#f0f4ff",
  border: "1px solid #c7d7f9", marginBottom: "16px",
};
const piTitleStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" };
const piValuesStyle: React.CSSProperties = { display: "flex", gap: "24px", flexWrap: "wrap", fontSize: "13px", color: "#333" };

const bandContextStyle: React.CSSProperties = { marginBottom: "36px" };
const bandContextTitleStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#666" };

const footnoteStyle: React.CSSProperties = { fontSize: "12px", color: "#aaa", marginTop: "20px", lineHeight: 1.5 };

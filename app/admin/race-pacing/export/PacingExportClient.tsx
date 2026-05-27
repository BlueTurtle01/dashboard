"use client";

import { useEffect, useState, useCallback } from "react";
import type { PacingGuide, PacingSection } from "@/lib/race-analysis/pacing-model";
import { gradientRowColor, formatPace, formatDuration } from "@/lib/race-analysis/pacing-model";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  raceId: string;
  targetMinutes: number;
  raceName: string;
}

// ── Gradient colour helper ─────────────────────────────────────────────────────

function gradientColor(g: number): string {
  if (g >= 8)  return "#b91c1c";
  if (g >= 4)  return "#b45309";
  if (g >= 2)  return "#6b7280";
  if (g <= -4) return "#1d4ed8";
  if (g <= -2) return "#3b82f6";
  return "#374151";
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PacingExportClient({ raceId, targetMinutes, raceName }: Props) {
  const [guide, setGuide]     = useState<PacingGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // ── Derived goal times ─────────────────────────────────────────────────────
  const stretchTime     = formatDuration(targetMinutes * 0.96);
  const targetTime      = formatDuration(targetMinutes);
  const comfortableTime = formatDuration(targetMinutes * 1.08);

  // ── Fetch pacing guide ─────────────────────────────────────────────────────
  const loadGuide = useCallback(async () => {
    if (!raceId || targetMinutes <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/race-analysis/pacing-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId, target_finish_minutes: targetMinutes }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to generate guide"); return; }
      setGuide(json as PacingGuide);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [raceId, targetMinutes]);

  useEffect(() => { loadGuide(); }, [loadGuide]);

  // ── Loading / error states ─────────────────────────────────────────────────
  if (!raceId || targetMinutes <= 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
        Missing race or target time. Close this tab and try again from the Pacing Strategy page.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af" }}>
        Generating pacing guide…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px", color: "#b91c1c" }}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  if (!guide) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Screen toolbar (hidden on print) ── */}
      <div style={toolbar} className="no-print">
        <button
          type="button"
          onClick={() => window.close()}
          style={backBtn}
        >
          ✕ Close
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "16px" }}>{raceName}</strong>
          <span style={{ color: "#666", marginLeft: "10px", fontSize: "14px" }}>
            · Target: {targetTime}
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          style={printBtn}
        >
          Export to PDF
        </button>
      </div>

      {/* ── A4 document canvas ── */}
      <div style={canvas}>

        {/* ── A4 page ── */}
        <div style={a4Page}>

          {/* Header: logo left, race name right */}
          <div style={printHeader}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e3a1e" }}>
                {raceName}
              </div>
              <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>
                Race Pacing Strategy
              </div>
            </div>
          </div>

          {/* Race stats summary */}
          <div style={{ marginBottom: "20px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 8px" }}>
              Pacing Strategy — {raceName}
            </h1>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              {[
                { label: "Distance",      value: `${guide.total_distance_km} km` },
                { label: "Ascent",        value: `↑${guide.total_ascent_m} m` },
                { label: "Flat equiv.",   value: `${guide.total_flat_equivalent_km} km` },
                { label: "Difficulty",    value: `${guide.difficulty_ratio}×` },
                { label: "Target finish", value: targetTime },
                ...(guide.wind_adjusted && guide.wind_adjusted_flat_equivalent_km
                  ? [{ label: "Wind-adj. flat", value: `${guide.wind_adjusted_flat_equivalent_km} km` }]
                  : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: "9px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#111" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Goal finish times */}
          <div style={{
            display: "flex", gap: "12px", marginBottom: "20px",
            padding: "14px 16px", background: "#f9fafb",
            border: "1px solid #e4e4e7", borderRadius: "8px",
          }}>
            {[
              { label: "Stretch −4%",    time: stretchTime,     accent: "#b45309", bg: "#fef3c7" },
              { label: "Target",          time: targetTime,      accent: "#1e3a1e", bg: "#dcfce7" },
              { label: "Comfortable +8%", time: comfortableTime, accent: "#1d4ed8", bg: "#dbeafe" },
            ].map(({ label, time, accent, bg }) => (
              <div key={label} style={{
                flex: 1, textAlign: "center",
                background: bg, borderRadius: "6px",
                padding: "10px 8px",
                border: `1px solid ${accent}30`,
              }}>
                <div style={{ fontSize: "9px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                  {label}
                </div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>
                  {time}
                </div>
              </div>
            ))}
          </div>

          {/* Section-by-section plan table */}
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "12px", fontWeight: 700, color: "#111", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Section-by-section plan ({guide.sections.length} sections
              {guide.sections_raw !== guide.sections.length
                ? `, merged from ${guide.sections_raw}`
                : ""})
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  <th style={th}>Section (km)</th>
                  <th style={{ ...th, textAlign: "right" }}>Dist</th>
                  <th style={th}>Gradient</th>
                  <th style={{ ...th, textAlign: "right" }}>Flat eq.</th>
                  <th style={{ ...th, textAlign: "right", color: "#b45309" }}>Stretch</th>
                  <th style={{ ...th, textAlign: "right", color: "#1e3a1e" }}>Target pace</th>
                  <th style={{ ...th, textAlign: "right", color: "#1d4ed8" }}>Comfortable</th>
                  <th style={th}>Pace band</th>
                </tr>
              </thead>
              <tbody>
                {guide.sections.map((s: PacingSection, i: number) => {
                  const stretchPace    = formatPace(s.target_pace_min_per_km * 0.96);
                  const comfortPace    = formatPace(s.target_pace_min_per_km * 1.08);

                  return (
                    <tr
                      key={i}
                      style={{
                        background: gradientRowColor(s.avg_gradient_percent),
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <td style={{ ...td, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {s.start_distance_km.toFixed(0)}–{s.end_distance_km.toFixed(0)}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: "#6b7280" }}>
                        {s.distance_km.toFixed(0)}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <span style={{ color: gradientColor(s.avg_gradient_percent), fontWeight: 600 }}>
                          {s.avg_gradient_percent > 0 ? "+" : ""}{s.avg_gradient_percent.toFixed(1)}%
                        </span>
                        {s.terrain !== "road" && (
                          <span style={{ marginLeft: "4px", color: "#9ca3af" }}>{s.terrain}</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: "right", color: "#374151" }}>
                        {s.flat_equivalent_km.toFixed(2)}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#b45309" }}>
                        {stretchPace}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: "#1e3a1e" }}>
                        {s.target_pace}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#1d4ed8" }}>
                        {comfortPace}
                      </td>
                      <td style={{ ...td, fontSize: "10px", color: "#374151", whiteSpace: "nowrap" }}>
                        {s.acceptable_pace_band}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{
            marginTop: "auto",
            paddingTop: "12px",
            borderTop: "1px solid #e4e4e7",
            fontSize: "9px",
            color: "#9ca3af",
            lineHeight: 1.6,
          }}>
            <strong style={{ color: "#6b7280" }}>Flat equiv.</strong> — section distance adjusted for gradient, terrain, fatigue &amp; downhill damage.&nbsp;
            <strong style={{ color: "#6b7280" }}>Pace band</strong> — acceptable range around target pace.&nbsp;
            <strong style={{ color: "#b45309" }}>Stretch</strong> = target × 0.96 &nbsp;·&nbsp;
            <strong style={{ color: "#1d4ed8" }}>Comfortable</strong> = target × 1.08.&nbsp;
            Row colour: red = steep climb · yellow = climb · blue = descent · white = flat.&nbsp;
            Generated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
          </div>

        </div>
        {/* /a4Page */}

      </div>
      {/* /canvas */}

      {/* ── Print + screen CSS ── */}
      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .no-print { display: none !important; }
          .app-sidebar { display: none !important; }
          .app-topbar  { display: none !important; }
          body { margin: 0 !important; padding: 0 !important; background: #fff; }
          .app-content { margin: 0 !important; padding: 0 !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

// A4 at 96 dpi: 794 × 1123 px
const a4Page: React.CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  background: "#fff",
  padding: "40px 48px",
  boxSizing: "border-box",
  breakAfter: "page",
  pageBreakAfter: "always",
  position: "relative",
  display: "flex",
  flexDirection: "column",
};

const canvas: React.CSSProperties = {
  background: "#6b6b6b",
  padding: "32px 0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
};

const toolbar: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "14px 24px",
  background: "#fff",
  borderBottom: "1px solid #e5e5e5",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const backBtn: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "6px",
  background: "#f3f4f6", border: "1px solid #d1d5db",
  color: "#374151", fontSize: "13px", fontWeight: 600,
  cursor: "pointer",
};

const printBtn: React.CSSProperties = {
  padding: "8px 20px", borderRadius: "6px",
  background: "#1e3a1e", border: "none",
  color: "#fff", fontSize: "13px", fontWeight: 600,
  cursor: "pointer",
};

const printHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "2px solid #1e3a1e",
  paddingBottom: "12px",
  marginBottom: "24px",
};

const logoImg: React.CSSProperties = {
  height: "36px",
  width: "auto",
  objectFit: "contain",
};

const th: React.CSSProperties = {
  padding: "5px 8px",
  fontWeight: 600,
  fontSize: "9px",
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  textAlign: "left",
  borderBottom: "2px solid #e4e4e7",
  background: "#f9fafb",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: "11px",
  color: "#111",
  verticalAlign: "top",
};

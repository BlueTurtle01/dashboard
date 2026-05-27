"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import type { PacingGuide, PacingSection } from "@/lib/race-analysis/pacing-model";
import { gradientRowColor, formatPace, formatDuration } from "@/lib/race-analysis/pacing-model";

// ── Helpers ────────────────────────────────────────────────────────────────────

function gradientBadge(gradient: number): { label: string; color: string; bg: string } {
  if (gradient >= 12) return { label: "Very steep ↑", color: "#991b1b", bg: "#fee2e2" };
  if (gradient >= 8)  return { label: "Major climb ↑", color: "#b45309", bg: "#fef3c7" };
  if (gradient >= 4)  return { label: "Climb ↑",       color: "#a16207", bg: "#fefce8" };
  if (gradient >= 2)  return { label: "Gentle ↑",      color: "#6b7280", bg: "#f3f4f6" };
  if (gradient <= -8) return { label: "Steep ↓",       color: "#1e40af", bg: "#dbeafe" };
  if (gradient <= -4) return { label: "Descent ↓",     color: "#1d4ed8", bg: "#eff6ff" };
  if (gradient <= -2) return { label: "Gentle ↓",      color: "#3b82f6", bg: "#f0f9ff" };
  return                     { label: "Flat ↔",         color: "#374151", bg: "#f9fafb" };
}

function windBadge(label: string | undefined): string {
  if (!label || label === "none") return "";
  if (label.includes("strong headwind"))   return "💨↑↑";
  if (label.includes("headwind"))          return "💨↑";
  if (label.includes("tailwind"))          return "💨↓";
  return "💨";
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  raceId: string;
  targetMinutes: number;
  raceName: string;
}


// ── Component ──────────────────────────────────────────────────────────────────

export default function PacingClient({ raceId, targetMinutes, raceName }: Props) {
  const [guide, setGuide]     = useState<PacingGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showWind, setShowWind] = useState(true);

  // ── Derived goal finish times (no API call needed — just scale targetMinutes) ─
  const stretchTime     = formatDuration(targetMinutes * 0.96);
  const comfortableTime = formatDuration(targetMinutes * 1.08);
  const targetTime      = formatDuration(targetMinutes);

  // ── Load pacing guide ────────────────────────────────────────────────────────

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
      setShowWind(json.wind_adjusted ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [raceId, targetMinutes]);

  useEffect(() => { loadGuide(); }, [loadGuide]);

  // ── Section paces (all three goal levels shown simultaneously) ───────────────

  function getTargetPace(s: PacingSection): string {
    return (showWind && s.wind_target_pace) ? s.wind_target_pace : s.target_pace;
  }

  function getStretchPace(s: PacingSection): string {
    const base = (showWind && s.wind_target_pace_min_per_km != null)
      ? s.wind_target_pace_min_per_km : s.target_pace_min_per_km;
    return formatPace(base * 0.96);
  }

  function getComfortPace(s: PacingSection): string {
    const base = (showWind && s.wind_target_pace_min_per_km != null)
      ? s.wind_target_pace_min_per_km : s.target_pace_min_per_km;
    return formatPace(base * 1.08);
  }

  function getPaceBand(s: PacingSection): string {
    return (showWind && s.wind_acceptable_pace_band)
      ? s.wind_acceptable_pace_band
      : s.acceptable_pace_band;
  }

  // ── Export URL ───────────────────────────────────────────────────────────────

  const exportUrl = `/admin/race-pacing/export?race_id=${encodeURIComponent(raceId)}&target_minutes=${targetMinutes}&race_name=${encodeURIComponent(raceName)}`;

  // ── Styles ─────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: "#fff", borderRadius: "12px",
    border: "1px solid #e4e4e7", padding: "20px 24px", marginBottom: "20px",
  };

  const th: React.CSSProperties = {
    padding: "8px 10px", fontWeight: 600, fontSize: "11px",
    color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em",
    textAlign: "left", borderBottom: "2px solid #e4e4e7", background: "#f9fafb",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "9px 10px", fontSize: "13px", color: "#111", verticalAlign: "top",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 24px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "12px", flexWrap: "wrap", gap: "10px",
          }}>
            <Link href="/admin/race-comparison"
              style={{ fontSize: "13px", color: "#6b7280", textDecoration: "none" }}>
              ← Back to Race Comparison
            </Link>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {guide?.wind_adjusted && (
                <label style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  fontSize: "13px", color: "#374151", cursor: "pointer",
                }}>
                  <input
                    type="checkbox"
                    checked={showWind}
                    onChange={e => setShowWind(e.target.checked)}
                    style={{ width: "14px", height: "14px" }}
                  />
                  Wind-adjusted
                </label>
              )}
              <Link href={exportUrl} target="_blank" style={{
                padding: "8px 16px", borderRadius: "8px", textDecoration: "none",
                background: "#1e3a1e", color: "#fff", fontSize: "13px", fontWeight: 600,
              }}>
                Print / Export PDF ↗
              </Link>
            </div>
          </div>

          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#111", margin: "0 0 4px 0" }}>
            Pacing Strategy — {raceName}
          </h1>
          {guide && (
            <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
              Target: <strong>{guide.target_finish_time}</strong>
              &nbsp;·&nbsp;{guide.total_distance_km} km
              &nbsp;·&nbsp;↑{guide.total_ascent_m} m
              &nbsp;·&nbsp;Flat equiv: {guide.total_flat_equivalent_km} km ({guide.difficulty_ratio}×)
              &nbsp;·&nbsp;{guide.sections.length} sections
              {guide.sections_raw !== guide.sections.length && (
                <span style={{ color: "#9ca3af" }}> (merged from {guide.sections_raw})</span>
              )}
              {guide.wind_adjusted && guide.wind_adjusted_flat_equivalent_km && (
                <span style={{ color: "#15803d" }}>
                  &nbsp;·&nbsp;Wind-adj: {guide.wind_adjusted_flat_equivalent_km} km
                </span>
              )}
            </p>
          )}
        </div>

        {/* ── Loading / error ── */}
        {loading && (
          <div style={{ ...card, textAlign: "center", color: "#9ca3af" }}>
            Generating pacing guide…
          </div>
        )}
        {error && (
          <div style={{ ...card, background: "#fff5f5", border: "1px solid #fca5a5", color: "#b91c1c" }}>
            {error}
          </div>
        )}
        {(!raceId || targetMinutes <= 0) && (
          <div style={{ ...card, color: "#6b7280", textAlign: "center" }}>
            Missing race or target time.{" "}
            <Link href="/admin/race-comparison" style={{ color: "#4338ca" }}>
              Go back to Race Comparison
            </Link>{" "}
            and click &quot;View Pacing Strategy&quot;.
          </div>
        )}

        {/* ── Goal finish times ── */}
        {targetMinutes > 0 && (
          <div style={card}>
            <h2 style={{ margin: "0 0 14px 0", fontSize: "15px", fontWeight: 700, color: "#111" }}>
              Goal Finish Times
            </h2>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
              {(
                [
                  { label: "Stretch −4%",    time: stretchTime,     accent: "#b45309", bg: "#fef3c7" },
                  { label: "Target",          time: targetTime,      accent: "#1e3a1e", bg: "#dcfce7" },
                  { label: "Comfortable +8%", time: comfortableTime, accent: "#1d4ed8", bg: "#dbeafe" },
                ]
              ).map(({ label, time, accent, bg }) => (
                <div
                  key={label}
                  style={{
                    background: bg,
                    border: `2px solid ${accent}40`,
                    borderRadius: "10px", padding: "12px 20px",
                    textAlign: "left", minWidth: "140px",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 600, color: accent, textTransform: "uppercase", marginBottom: "3px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: accent, fontVariantNumeric: "tabular-nums" }}>
                    {time}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "12px", color: "#9ca3af" }}>
              Stretch = target × 0.96 &nbsp;·&nbsp; Comfortable = target × 1.08
            </div>
          </div>
        )}

        {guide && (
          <>
            {/* ── Section table ── */}
            <div style={{ ...card, padding: "0", overflow: "hidden" }}>
              <div style={{
                padding: "16px 20px", borderBottom: "1px solid #e4e4e7",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111" }}>
                  Section-by-section plan ({guide.sections.length} sections)
                </h2>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Section</th>
                      <th style={{ ...th, textAlign: "right" }}>Dist</th>
                      <th style={th}>Terrain</th>
                      <th style={{ ...th, textAlign: "right" }}>Flat eq.</th>
                      <th style={{ ...th, textAlign: "right", color: "#b45309" }}>Stretch</th>
                      <th style={{ ...th, textAlign: "right", color: "#1e3a1e" }}>Target</th>
                      <th style={{ ...th, textAlign: "right", color: "#1d4ed8" }}>Comfortable</th>
                      <th style={th}>Pace band</th>
                      {guide.wind_adjusted && showWind && (
                        <>
                          <th style={{ ...th, textAlign: "right", color: "#15803d" }}>Wind pace</th>
                          <th style={{ ...th, color: "#15803d" }}>Wind band</th>
                          <th style={th}>Wind</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {guide.sections.map((s: PacingSection, i: number) => {
                      const rowBg = gradientRowColor(s.avg_gradient_percent);
                      const badge = gradientBadge(s.avg_gradient_percent);

                      return (
                        <tr key={i} style={{ background: rowBg, borderBottom: "1px solid #f3f4f6" }}>

                          <td style={{ ...td, fontFamily: "monospace", fontSize: "12px", whiteSpace: "nowrap" }}>
                            {s.start_distance_km.toFixed(1)}–{s.end_distance_km.toFixed(1)} km
                          </td>

                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", color: "#6b7280" }}>
                            {s.distance_km.toFixed(2)} km
                          </td>

                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 7px", borderRadius: "4px",
                              fontSize: "11px", fontWeight: 600,
                              color: badge.color, background: badge.bg,
                            }}>
                              {s.avg_gradient_percent > 0 ? "+" : ""}{s.avg_gradient_percent.toFixed(1)}%
                            </span>
                            {s.terrain !== "road" && (
                              <span style={{ marginLeft: "5px", fontSize: "11px", color: "#9ca3af" }}>
                                {s.terrain}
                              </span>
                            )}
                          </td>

                          <td style={{ ...td, textAlign: "right", color: "#374151" }}>
                            {s.flat_equivalent_km.toFixed(2)}
                          </td>

                          <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#b45309", whiteSpace: "nowrap" }}>
                            {getStretchPace(s)}
                          </td>

                          <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace", color: "#1e3a1e" }}>
                            {getTargetPace(s)}
                          </td>

                          <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#1d4ed8", whiteSpace: "nowrap" }}>
                            {getComfortPace(s)}
                          </td>

                          <td style={{ ...td, whiteSpace: "nowrap", fontSize: "12px", color: "#374151" }}>
                            {getPaceBand(s)}
                          </td>

                          {guide.wind_adjusted && showWind && (
                            <>
                              <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#15803d", whiteSpace: "nowrap" }}>
                                {s.wind_target_pace ?? "–"}
                              </td>
                              <td style={{ ...td, fontSize: "12px", color: "#15803d", whiteSpace: "nowrap" }}>
                                {s.wind_acceptable_pace_band ?? "–"}
                              </td>
                              <td style={{ ...td, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                                {s.wind_label && s.wind_label !== "none"
                                  ? `${windBadge(s.wind_label)} ${s.wind_label}`
                                  : "–"}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Legend ── */}
            <div style={{ ...card, padding: "14px 20px" }}>
              <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", lineHeight: 1.6 }}>
                <strong>Sections</strong> — 1-km GPS sections are merged by similar gradient,
                then by identical guidance. &nbsp;
                <strong>Flat equiv</strong> — section cost in flat km (gradient + terrain + fatigue
                + downhill damage). &nbsp;
                <strong>Pace band</strong> — acceptable range to stay on track (target pace only). &nbsp;
                Row colour: red = steep climb, yellow = climb, blue = descent, white = flat.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import { use } from "react";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import type { PacingGuide, PacingSection } from "@/lib/race-analysis/pacing-model";
import { gradientRowColor } from "@/lib/race-analysis/pacing-model";

// ── Helpers ────────────────────────────────────────────────────────────────────

function gradientBadge(gradient: number): { label: string; color: string; bg: string } {
  if (gradient >= 12) return { label: "Very steep ↑", color: "#991b1b", bg: "#fee2e2" };
  if (gradient >= 8)  return { label: "Major climb ↑", color: "#b45309", bg: "#fef3c7" };
  if (gradient >= 4)  return { label: "Climb ↑", color: "#a16207", bg: "#fefce8" };
  if (gradient >= 2)  return { label: "Gentle ↑", color: "#6b7280", bg: "#f3f4f6" };
  if (gradient <= -8) return { label: "Steep ↓", color: "#1e40af", bg: "#dbeafe" };
  if (gradient <= -4) return { label: "Descent ↓", color: "#1d4ed8", bg: "#eff6ff" };
  if (gradient <= -2) return { label: "Gentle ↓", color: "#3b82f6", bg: "#f0f9ff" };
  return { label: "Flat ↔", color: "#374151", bg: "#f9fafb" };
}

function windBadge(label: string | undefined): string {
  if (!label || label === "none") return "";
  if (label.includes("strong headwind")) return "💨↑↑";
  if (label.includes("headwind")) return "💨↑";
  if (label.includes("tailwind")) return "💨↓";
  if (label.includes("crosswind")) return "💨↔";
  return "💨";
}

// ── Page (client component — reads searchParams via React use()) ───────────────

export default function RacePacingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = use(searchParams);
  const raceId = (sp.race_id as string | undefined) ?? "";
  const targetMinutes = parseFloat((sp.target_minutes as string | undefined) ?? "0");
  const raceName = (sp.race_name as string | undefined) ?? "Race";

  const [guide, setGuide] = useState<PacingGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [showWind, setShowWind] = useState(true);

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

        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <Link href="/admin/race-comparison"
              style={{ fontSize: "13px", color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              ← Back to Race Comparison
            </Link>
            {guide?.wind_adjusted && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={showWind} onChange={(e) => setShowWind(e.target.checked)}
                  style={{ width: "15px", height: "15px" }} />
                Show wind-adjusted pacing
              </label>
            )}
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
              {guide.wind_adjusted && guide.wind_adjusted_flat_equivalent_km && (
                <>&nbsp;·&nbsp;<span style={{ color: "#15803d" }}>Wind-adj: {guide.wind_adjusted_flat_equivalent_km} km</span></>
              )}
            </p>
          )}
        </div>

        {/* Loading / error */}
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
            Missing race or target time. Go back to{" "}
            <Link href="/admin/race-comparison" style={{ color: "#4338ca" }}>Race Comparison</Link>{" "}
            and use the &quot;View Pacing Strategy&quot; button.
          </div>
        )}

        {guide && (
          <>
            {/* Highest cost sections summary */}
            <div style={card}>
              <h2 style={{ margin: "0 0 14px 0", fontSize: "15px", fontWeight: 700, color: "#111" }}>
                Highest-cost sections (top 5)
              </h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {guide.highest_cost_sections.map((s, i) => {
                  const badge = gradientBadge(s.avg_gradient_percent);
                  const pace = (showWind && s.wind_target_pace) ? s.wind_target_pace : s.target_pace;
                  return (
                    <div key={i} style={{
                      background: gradientRowColor(s.avg_gradient_percent),
                      border: "1px solid #e4e4e7", borderRadius: "8px", padding: "10px 14px",
                      minWidth: "150px", flex: "1",
                    }}>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>
                        km {s.start_km.toFixed(1)} – {s.end_km.toFixed(1)}
                      </div>
                      <div style={{
                        display: "inline-block", padding: "2px 6px", borderRadius: "4px",
                        fontSize: "10px", fontWeight: 600, color: badge.color, background: badge.bg,
                        marginBottom: "4px",
                      }}>
                        {badge.label} {s.avg_gradient_percent > 0 ? "+" : ""}{s.avg_gradient_percent.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>{pace}</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>{s.energy_share_percent}% energy</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full section table */}
            <div style={{ ...card, padding: "0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111" }}>
                  Section-by-section plan ({guide.sections.length} sections)
                </h2>
                <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                  Click strategy note to expand
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Section</th>
                      <th style={{ ...th, textAlign: "right" }}>Dist</th>
                      <th style={th}>Terrain</th>
                      <th style={{ ...th, textAlign: "right" }}>Flat eq.</th>
                      <th style={{ ...th, textAlign: "right" }}>Energy</th>
                      <th style={{ ...th, textAlign: "right" }}>Target</th>
                      <th style={th}>Pace band</th>
                      {guide.wind_adjusted && showWind && (
                        <>
                          <th style={{ ...th, textAlign: "right", color: "#15803d" }}>Wind target</th>
                          <th style={{ ...th, color: "#15803d" }}>Wind band</th>
                          <th style={th}>Wind</th>
                        </>
                      )}
                      <th style={{ ...th, minWidth: "200px" }}>Strategy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guide.sections.map((s: PacingSection, i: number) => {
                      const rowBg = gradientRowColor(s.avg_gradient_percent);
                      const badge = gradientBadge(s.avg_gradient_percent);
                      const isExpanded = expandedNote === i;
                      const shortNote = s.strategy_note.length > 60
                        ? s.strategy_note.slice(0, 57) + "…"
                        : s.strategy_note;

                      return (
                        <tr key={i} style={{ background: rowBg, borderBottom: "1px solid #f3f4f6" }}>
                          {/* Section */}
                          <td style={{ ...td, fontFamily: "monospace", fontSize: "12px", whiteSpace: "nowrap" }}>
                            {s.start_km.toFixed(1)}–{s.end_km.toFixed(1)} km
                          </td>

                          {/* Distance */}
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", color: "#6b7280" }}>
                            {s.distance_km.toFixed(2)} km
                          </td>

                          {/* Gradient badge */}
                          <td style={{ ...td, whiteSpace: "nowrap" }}>
                            <span style={{
                              display: "inline-block", padding: "2px 7px", borderRadius: "4px",
                              fontSize: "11px", fontWeight: 600,
                              color: badge.color, background: badge.bg,
                            }}>
                              {s.avg_gradient_percent > 0 ? "+" : ""}{s.avg_gradient_percent.toFixed(1)}%
                            </span>
                            <span style={{ marginLeft: "5px", fontSize: "11px", color: "#9ca3af" }}>
                              {s.terrain !== "road" ? s.terrain : ""}
                            </span>
                          </td>

                          {/* Flat equiv */}
                          <td style={{ ...td, textAlign: "right", color: "#374151" }}>
                            {s.flat_equivalent_km.toFixed(2)}
                          </td>

                          {/* Energy % */}
                          <td style={{ ...td, textAlign: "right" }}>
                            <span style={{ fontSize: "12px", color: "#374151" }}>
                              {s.energy_share_percent.toFixed(1)}%
                            </span>
                          </td>

                          {/* Target pace */}
                          <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {(showWind && s.wind_target_pace) ? s.wind_target_pace : s.target_pace}
                          </td>

                          {/* Pace band */}
                          <td style={{ ...td, whiteSpace: "nowrap", fontSize: "12px", color: "#374151" }}>
                            {(showWind && s.wind_acceptable_pace_band) ? s.wind_acceptable_pace_band : s.acceptable_pace_band}
                          </td>

                          {/* Wind-adjusted columns */}
                          {guide.wind_adjusted && showWind && (
                            <>
                              <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#15803d", whiteSpace: "nowrap" }}>
                                {s.wind_target_pace ?? "–"}
                              </td>
                              <td style={{ ...td, fontSize: "12px", color: "#15803d", whiteSpace: "nowrap" }}>
                                {s.wind_acceptable_pace_band ?? "–"}
                              </td>
                              <td style={{ ...td, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                                {windBadge(s.wind_label)} {s.wind_label && s.wind_label !== "none" ? s.wind_label : "–"}
                              </td>
                            </>
                          )}

                          {/* Strategy note */}
                          <td
                            style={{ ...td, fontSize: "12px", color: "#374151", cursor: "pointer", maxWidth: "240px" }}
                            onClick={() => setExpandedNote(isExpanded ? null : i)}
                          >
                            {isExpanded ? s.strategy_note : shortNote}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div style={{ ...card, padding: "14px 20px" }}>
              <p style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                How to read this guide
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", lineHeight: 1.6 }}>
                <strong>Target pace</strong> — the ideal pace for this section based on energy share of the flat-equivalent distance.&nbsp;
                <strong>Pace band</strong> — acceptable range; staying within this band keeps you on track.&nbsp;
                {guide.wind_adjusted && showWind && (
                  <><strong>Wind columns</strong> — adjusted for historical wind conditions; use these when wind is expected.&nbsp;</>
                )}
                <strong>Flat equiv</strong> — section cost in flat-road km; a 3 km climb at +10% may cost as much as 6 km of flat.&nbsp;
                <strong>Energy %</strong> — what fraction of your total effort this section takes.&nbsp;
                Row colour indicates gradient: red = steep climb, yellow = climb, blue = descent, white = flat.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

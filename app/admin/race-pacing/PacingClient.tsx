"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import type { PacingGuide, PacingSection } from "@/lib/race-analysis/pacing-model";
import { gradientRowColor } from "@/lib/race-analysis/pacing-model";

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
  if (label.includes("crosswind"))         return "💨↔";
  return "💨";
}

/** Parse "H:MM" or "H:MM:SS" into total minutes, or return 0. */
function parseHMSToMinutes(value: string): number {
  const parts = value.trim().split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  raceId: string;
  targetMinutes: number;
  raceName: string;
}

// ── Goal level type ────────────────────────────────────────────────────────────

type GoalLevel = "target" | "stretch" | "realistic" | "comfortable";

// ── Client component ───────────────────────────────────────────────────────────

export default function PacingClient({ raceId, targetMinutes, raceName }: Props) {
  const [guide, setGuide]       = useState<PacingGuide | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [showWind, setShowWind] = useState(true);
  const [goalLevel, setGoalLevel] = useState<GoalLevel>("target");

  // Half-marathon fitness goal input
  const [hmInput, setHmInput]       = useState("");
  const [hmMinutes, setHmMinutes]   = useState<number | null>(null);
  const [hmPending, setHmPending]   = useState(false);

  // ── API call ────────────────────────────────────────────────────────────────

  const loadGuide = useCallback(async (halfMarathonMinutes?: number) => {
    if (!raceId || targetMinutes <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        race_id: raceId,
        target_finish_minutes: targetMinutes,
      };
      if (halfMarathonMinutes && halfMarathonMinutes > 0) {
        body.half_marathon_minutes = halfMarathonMinutes;
      }

      const res  = await fetch("/api/race-analysis/pacing-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  // Apply half-marathon time
  const applyHalfMarathon = () => {
    const mins = parseHMSToMinutes(hmInput);
    if (mins <= 0) return;
    setHmMinutes(mins);
    setHmPending(false);
    setGoalLevel("realistic");
    loadGuide(mins);
  };

  const clearHalfMarathon = () => {
    setHmMinutes(null);
    setHmInput("");
    setHmPending(false);
    setGoalLevel("target");
    loadGuide();
  };

  // ── Section pace selector ───────────────────────────────────────────────────

  function getSectionPace(s: PacingSection): string {
    if (goalLevel === "stretch")     return s.stretch_target_pace ?? s.target_pace;
    if (goalLevel === "realistic")   return s.realistic_target_pace ?? s.target_pace;
    if (goalLevel === "comfortable") return s.comfortable_target_pace ?? s.target_pace;
    // "target" — use wind-adjusted if toggled
    return (showWind && s.wind_target_pace) ? s.wind_target_pace : s.target_pace;
  }

  function getSectionBand(s: PacingSection): string {
    if (goalLevel !== "target") return "";  // no band for fitness goals (too wide)
    return (showWind && s.wind_acceptable_pace_band)
      ? s.wind_acceptable_pace_band
      : s.acceptable_pace_band;
  }

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

  const goalBtn = (level: GoalLevel, label: string, accent: string): React.ReactNode => (
    <button
      onClick={() => setGoalLevel(level)}
      style={{
        padding: "5px 12px", borderRadius: "6px", border: "1px solid",
        borderColor: goalLevel === level ? accent : "#d1d5db",
        background: goalLevel === level ? accent : "#fff",
        color: goalLevel === level ? "#fff" : "#374151",
        fontSize: "12px", fontWeight: 600, cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 24px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "12px",
          }}>
            <Link href="/admin/race-comparison"
              style={{
                fontSize: "13px", color: "#6b7280", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: "4px",
              }}>
              ← Back to Race Comparison
            </Link>
            {guide?.wind_adjusted && (
              <label style={{
                display: "flex", alignItems: "center", gap: "8px",
                fontSize: "13px", color: "#374151", cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={showWind}
                  onChange={e => setShowWind(e.target.checked)}
                  style={{ width: "15px", height: "15px" }}
                />
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
              &nbsp;·&nbsp;{guide.sections.length} sections
              {guide.sections_raw !== guide.sections.length && (
                <span style={{ color: "#9ca3af" }}> (merged from {guide.sections_raw})</span>
              )}
              {guide.wind_adjusted && guide.wind_adjusted_flat_equivalent_km && (
                <>
                  &nbsp;·&nbsp;
                  <span style={{ color: "#15803d" }}>
                    Wind-adj: {guide.wind_adjusted_flat_equivalent_km} km
                  </span>
                </>
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
            Missing race or target time. Go back to{" "}
            <Link href="/admin/race-comparison" style={{ color: "#4338ca" }}>
              Race Comparison
            </Link>{" "}
            and use the &quot;View Pacing Strategy&quot; button.
          </div>
        )}

        {/* ── Fitness goals panel ── */}
        {!loading && (
          <div style={card}>
            <h2 style={{ margin: "0 0 12px 0", fontSize: "15px", fontWeight: 700, color: "#111" }}>
              Fitness Goal Estimates
            </h2>
            <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#6b7280" }}>
              Enter a recent half-marathon time to add stretch / realistic / comfortable finish
              estimates using Riegel&apos;s formula (based on this course&apos;s flat-equivalent distance).
            </p>

            {/* Input row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="H:MM:SS or H:MM"
                value={hmInput}
                onChange={e => { setHmInput(e.target.value); setHmPending(true); }}
                onKeyDown={e => { if (e.key === "Enter") applyHalfMarathon(); }}
                style={{
                  padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: "8px",
                  fontSize: "14px", width: "140px",
                }}
              />
              <button
                onClick={applyHalfMarathon}
                disabled={!hmPending || !hmInput}
                style={{
                  padding: "8px 16px", borderRadius: "8px", border: "none",
                  background: hmPending && hmInput ? "#4f46e5" : "#d1d5db",
                  color: "#fff", fontSize: "13px", fontWeight: 600,
                  cursor: hmPending && hmInput ? "pointer" : "default",
                }}
              >
                Apply
              </button>
              {hmMinutes && (
                <button
                  onClick={clearHalfMarathon}
                  style={{
                    padding: "8px 14px", borderRadius: "8px", border: "1px solid #d1d5db",
                    background: "#fff", color: "#374151", fontSize: "13px", cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Goal summary */}
            {guide?.fitness_goals && (
              <div style={{ marginTop: "16px" }}>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                  {(["stretch", "realistic", "comfortable"] as const).map((level, i) => {
                    const goals = guide.fitness_goals!;
                    const src   = (showWind && goals.wind_adjusted) ? goals.wind_adjusted : goals.no_wind;
                    const time  = src[level];
                    const colors = ["#b45309", "#15803d", "#1d4ed8"];
                    const bgs    = ["#fef3c7", "#dcfce7", "#dbeafe"];
                    const labels = ["Stretch (−4%)", "Realistic", "Comfortable (+8%)"];
                    return (
                      <div key={level} style={{
                        background: bgs[i], border: `1px solid`,
                        borderColor: colors[i] + "40",
                        borderRadius: "8px", padding: "10px 16px", minWidth: "140px",
                      }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: colors[i], marginBottom: "3px", textTransform: "uppercase" }}>
                          {labels[i]}
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: colors[i] }}>
                          {time}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                  Based on half marathon {guide.fitness_goals.half_marathon_time} · Riegel exponent {guide.fitness_goals.riegel_exponent} · flat-equivalent {guide.total_flat_equivalent_km} km
                </div>
              </div>
            )}
          </div>
        )}

        {guide && (
          <>
            {/* ── Highest-cost sections ── */}
            <div style={card}>
              <h2 style={{ margin: "0 0 14px 0", fontSize: "15px", fontWeight: 700, color: "#111" }}>
                Highest-cost sections (top 5)
              </h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {guide.highest_cost_sections.map((s, i) => {
                  const badge = gradientBadge(s.avg_gradient_percent);
                  const pace  = getSectionPace(s);
                  return (
                    <div key={i} style={{
                      background: gradientRowColor(s.avg_gradient_percent),
                      border: "1px solid #e4e4e7", borderRadius: "8px", padding: "10px 14px",
                      minWidth: "150px", flex: "1",
                    }}>
                      <div style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>
                        km {s.start_distance_km.toFixed(1)} – {s.end_distance_km.toFixed(1)}
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

            {/* ── Goal level selector ── */}
            {guide.fitness_goals && (
              <div style={{
                ...card, padding: "14px 20px",
                display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap",
              }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                  Section paces:
                </span>
                {goalBtn("target",      "Target time", "#111827")}
                {goalBtn("stretch",     "Stretch",     "#b45309")}
                {goalBtn("realistic",   "Realistic",   "#15803d")}
                {goalBtn("comfortable", "Comfortable", "#1d4ed8")}
              </div>
            )}

            {/* ── Full section table ── */}
            <div style={{ ...card, padding: "0", overflow: "hidden" }}>
              <div style={{
                padding: "16px 20px", borderBottom: "1px solid #e4e4e7",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
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
                      <th style={{ ...th, textAlign: "right" }}>Pace</th>
                      {goalLevel === "target" && (
                        <th style={th}>Pace band</th>
                      )}
                      {guide.wind_adjusted && showWind && goalLevel === "target" && (
                        <>
                          <th style={{ ...th, textAlign: "right", color: "#15803d" }}>Wind pace</th>
                          <th style={{ ...th, color: "#15803d" }}>Wind band</th>
                          <th style={th}>Wind</th>
                        </>
                      )}
                      <th style={{ ...th, minWidth: "200px" }}>Strategy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guide.sections.map((s: PacingSection, i: number) => {
                      const rowBg    = gradientRowColor(s.avg_gradient_percent);
                      const badge    = gradientBadge(s.avg_gradient_percent);
                      const isExpanded = expandedNote === i;
                      const shortNote  = s.strategy_note.length > 60
                        ? s.strategy_note.slice(0, 57) + "…"
                        : s.strategy_note;
                      const pace     = getSectionPace(s);
                      const band     = getSectionBand(s);

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
                            <span style={{ marginLeft: "5px", fontSize: "11px", color: "#9ca3af" }}>
                              {s.terrain !== "road" ? s.terrain : ""}
                            </span>
                          </td>

                          <td style={{ ...td, textAlign: "right", color: "#374151" }}>
                            {s.flat_equivalent_km.toFixed(2)}
                          </td>

                          <td style={{ ...td, textAlign: "right" }}>
                            <span style={{ fontSize: "12px", color: "#374151" }}>
                              {s.energy_share_percent.toFixed(1)}%
                            </span>
                          </td>

                          <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {pace}
                          </td>

                          {goalLevel === "target" && (
                            <td style={{ ...td, whiteSpace: "nowrap", fontSize: "12px", color: "#374151" }}>
                              {band}
                            </td>
                          )}

                          {guide.wind_adjusted && showWind && goalLevel === "target" && (
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

            {/* ── Legend ── */}
            <div style={{ ...card, padding: "14px 20px" }}>
              <p style={{ margin: "0 0 6px 0", fontSize: "12px", fontWeight: 600, color: "#374151" }}>
                How to read this guide
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: "#6b7280", lineHeight: 1.6 }}>
                <strong>Sections</strong> — adjacent 1-km GPS sections with similar gradients are
                merged into readable race-plan blocks (first pass), then blocks with identical
                guidance are merged further (second pass).&nbsp;
                <strong>Pace</strong> — target pace for this section based on its share of
                the total flat-equivalent course cost.&nbsp;
                <strong>Pace band</strong> — acceptable range; staying within this band keeps
                you on track.&nbsp;
                {guide.wind_adjusted && showWind && (
                  <>
                    <strong>Wind columns</strong> — adjusted for historical wind conditions.&nbsp;
                  </>
                )}
                {guide.fitness_goals && (
                  <>
                    <strong>Stretch / Realistic / Comfortable</strong> — per-section paces
                    derived from your half-marathon time via Riegel&apos;s formula applied to the
                    flat-equivalent distance.&nbsp;
                  </>
                )}
                <strong>Flat equiv</strong> — section cost in flat km.&nbsp;
                <strong>Energy %</strong> — fraction of total effort.&nbsp;
                Row colour: red = steep climb, yellow = climb, blue = descent, white = flat.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

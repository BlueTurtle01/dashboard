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

type GoalLevel = "stretch" | "target" | "comfortable";

// ── Component ──────────────────────────────────────────────────────────────────

export default function PacingClient({ raceId, targetMinutes, raceName }: Props) {
  const [guide, setGuide]     = useState<PacingGuide | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [showWind, setShowWind] = useState(true);
  const [goalLevel, setGoalLevel] = useState<GoalLevel>("target");

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

  // ── Section pace for the current goal level ──────────────────────────────────
  //
  // Stretch / Comfortable are computed client-side by scaling target_pace_min_per_km.
  // A finish time of T×0.96 means all section paces are also ×0.96 (proportional).

  function getSectionPace(s: PacingSection): string {
    const base = (showWind && s.wind_target_pace_min_per_km != null)
      ? s.wind_target_pace_min_per_km
      : s.target_pace_min_per_km;

    if (goalLevel === "stretch")     return formatPace(base * 0.96);
    if (goalLevel === "comfortable") return formatPace(base * 1.08);
    // "target" — use raw pace strings from the API
    return (showWind && s.wind_target_pace) ? s.wind_target_pace : s.target_pace;
  }

  function getSectionBand(s: PacingSection): string {
    if (goalLevel !== "target") return "";
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

  const goalBtn = (level: GoalLevel, label: string, accent: string) => (
    <button
      key={level}
      onClick={() => setGoalLevel(level)}
      style={{
        padding: "5px 14px", borderRadius: "6px", border: "1px solid",
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
            <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#6b7280" }}>
              Stretch and Comfortable targets are ±% of your Riegel-estimated finish time.
              Use the buttons below to switch all section paces accordingly.
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
              {(
                [
                  { level: "stretch"     as GoalLevel, label: "Stretch −4%",   time: stretchTime,     accent: "#b45309", bg: "#fef3c7" },
                  { level: "target"      as GoalLevel, label: "Target",         time: targetTime,      accent: "#1e3a1e", bg: "#dcfce7" },
                  { level: "comfortable" as GoalLevel, label: "Comfortable +8%", time: comfortableTime, accent: "#1d4ed8", bg: "#dbeafe" },
                ]
              ).map(({ level, label, time, accent, bg }) => (
                <button
                  key={level}
                  onClick={() => setGoalLevel(level)}
                  style={{
                    background: goalLevel === level ? accent : bg,
                    border: `2px solid ${goalLevel === level ? accent : accent + "40"}`,
                    borderRadius: "10px", padding: "12px 20px",
                    cursor: "pointer", textAlign: "left", minWidth: "140px",
                  }}
                >
                  <div style={{ fontSize: "11px", fontWeight: 600, color: goalLevel === level ? "#fff" : accent, textTransform: "uppercase", marginBottom: "3px" }}>
                    {label}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: goalLevel === level ? "#fff" : accent, fontVariantNumeric: "tabular-nums" }}>
                    {time}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: "12px", color: "#9ca3af" }}>
              Stretch = target × 0.96 &nbsp;·&nbsp; Comfortable = target × 1.08 &nbsp;·&nbsp;
              Selecting a goal switches all section paces in the table below.
            </div>
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
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#111" }}>
                        {getSectionPace(s)}
                      </div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>{s.energy_share_percent}% energy</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Goal level selector ── */}
            <div style={{
              ...card, padding: "12px 20px",
              display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
            }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginRight: "4px" }}>
                Show section paces for:
              </span>
              {goalBtn("stretch",     "Stretch (−4%)",    "#b45309")}
              {goalBtn("target",      "Target",           "#1e3a1e")}
              {goalBtn("comfortable", "Comfortable (+8%)", "#1d4ed8")}
            </div>

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

                          <td style={{ ...td, textAlign: "right" }}>
                            <span style={{ fontSize: "12px", color: "#374151" }}>
                              {s.energy_share_percent.toFixed(1)}%
                            </span>
                          </td>

                          <td style={{ ...td, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                            {getSectionPace(s)}
                          </td>

                          {goalLevel === "target" && (
                            <td style={{ ...td, whiteSpace: "nowrap", fontSize: "12px", color: "#374151" }}>
                              {getSectionBand(s)}
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

"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getDayOrderIndex } from "@/lib/planner/dayLabels";

/* ── Pacing section type ── */
type PacingSection = {
  start_km: number;
  end_km: number;
  section_type: string;
  target_pace: string;
  pace_band: string;
};

/* ── Race profile types ── */
type ElevationPoint = { distanceKm: number; elevationM: number };

type RaceElevProfile = {
  points: ElevationPoint[];
  totalDistanceKm: number;
  totalAscentM: number;
  totalDescentM: number;
  climbPerKm: number;
  minElevationM: number;
  maxElevationM: number;
};

type RaceTerrainSeg = { type: string; label: string; percentage: number; distanceKm?: number };

type RaceSustainedSeg = {
  startKm: number; endKm: number; lengthKm: number;
  avgGradient: number; totalElevationM: number;
  type: "climb" | "descent" | "flat";
};

type PositionedTerrainSeg = { startKm: number; endKm: number; type: string; label: string };

type RaceProfileData = {
  elevation: RaceElevProfile | null;
  terrain: RaceTerrainSeg[] | null;
  sustainedSegments: RaceSustainedSeg[] | null;
  positionedTerrain: PositionedTerrainSeg[] | null;
};

function parseRaceElevProfile(value: string | null | undefined): RaceElevProfile | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(p.points) || typeof p.totalDistanceKm !== "number") return null;
    const points = (p.points as unknown[]).flatMap((pt): ElevationPoint[] => {
      if (!pt || typeof pt !== "object") return [];
      const r = pt as Record<string, unknown>;
      if (typeof r.distanceKm !== "number" || typeof r.elevationM !== "number") return [];
      return [{ distanceKm: r.distanceKm, elevationM: r.elevationM }];
    });
    if (points.length < 2) return null;
    const elevs = points.map((p) => p.elevationM);
    return {
      points,
      totalDistanceKm: p.totalDistanceKm,
      totalAscentM: typeof p.totalAscentM === "number" ? p.totalAscentM : 0,
      totalDescentM: typeof p.totalDescentM === "number" ? p.totalDescentM : 0,
      climbPerKm: typeof p.climbPerKm === "number" ? p.climbPerKm : (p.totalDistanceKm > 0 ? (p.totalAscentM as number) / p.totalDistanceKm : 0),
      minElevationM: Math.min(...elevs),
      maxElevationM: Math.max(...elevs),
    };
  } catch { return null; }
}

function parseRaceTerrainSegs(value: string | null | undefined): RaceTerrainSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(p.segments)) return null;
    const segs = (p.segments as unknown[]).flatMap((s): RaceTerrainSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.type !== "string" || typeof r.label !== "string" || typeof r.percentage !== "number") return [];
      return [{ type: r.type, label: r.label, percentage: r.percentage, distanceKm: typeof r.distanceKm === "number" ? r.distanceKm : undefined }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function parseRaceSustainedSegs(value: string | null | undefined): RaceSustainedSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const segs = p.flatMap((s): RaceSustainedSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.startKm !== "number" || typeof r.endKm !== "number" || typeof r.lengthKm !== "number" ||
          typeof r.avgGradient !== "number" || typeof r.totalElevationM !== "number" ||
          (r.type !== "climb" && r.type !== "descent" && r.type !== "flat")) return [];
      return [{ startKm: r.startKm, endKm: r.endKm, lengthKm: r.lengthKm,
                avgGradient: r.avgGradient, totalElevationM: r.totalElevationM,
                type: r.type as RaceSustainedSeg["type"] }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function parsePositionedTerrain(value: string | null | undefined): PositionedTerrainSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const segs = p.flatMap((s): PositionedTerrainSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.startKm !== "number" || typeof r.endKm !== "number" ||
          typeof r.type !== "string" || typeof r.label !== "string") return [];
      return [{ startKm: r.startKm, endKm: r.endKm, type: r.type, label: r.label }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function terrainLabelsForRange(
  positionedTerrain: PositionedTerrainSeg[] | null,
  startKm: number, endKm: number
): string[] {
  if (!positionedTerrain) return [];
  const rangeLen = endKm - startKm;
  const coverage = new Map<string, number>();
  for (const seg of positionedTerrain) {
    const overlap = Math.max(0, Math.min(endKm, seg.endKm) - Math.max(startKm, seg.startKm));
    if (overlap > 0) coverage.set(seg.label, (coverage.get(seg.label) ?? 0) + overlap);
  }
  return [...coverage.entries()]
    .filter(([, v]) => v / rangeLen >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);
}

/* ── DB types ── */
type TemplateExercise = {
  id: string;
  sort_order: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  notes: string | null;
  exercises: { name: string; description: string } | null;
};

type TemplateSession = {
  id: string;
  day_label: string;
  sort_order: number;
  type: string;
  name: string;
  description: string | null;
  duration: string | null;
  duration_minutes: number | null;
  intensity: string | null;
  is_key_session: boolean;
  reason: string | null;
  tags: string[] | null;
  distance_km: number | null;
  num_sets: number | null;
  set_duration_minutes: number | null;
  interval_reps: number | null;
  interval_duration: string | null;
  strides: string | null;
  warmup_minutes: number | null;
  cooldown_minutes: number | null;
  elevation_gain_meters: number | null;
  pack_weight_kg: number | null;
  program_template_session_exercises: TemplateExercise[];
};

type TemplateWeek = {
  id: string;
  week_number: number;
  focus: string | null;
  notes: string | null;
  program_template_sessions: TemplateSession[];
};

type ProgramTemplate = {
  id: string;
  name: string;
  description: string | null;
  event_goal: string | null;
  discipline: string | null;
  plan_length_weeks: number;
  training_days_per_week: number;
  race_id: string | null;
  pacing_data: PacingSection[] | null;
  program_template_weeks: TemplateWeek[];
};

/* ── Helpers ── */
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function sessionDuration(s: TemplateSession): string {
  if (s.duration_minutes) {
    const h = Math.floor(s.duration_minutes / 60);
    const m = s.duration_minutes % 60;
    return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
  }
  return s.duration || "—";
}

function sortSessions(sessions: TemplateSession[]): TemplateSession[] {
  return [...sessions].sort((a, b) => {
    const da = getDayOrderIndex(a.day_label ?? "");
    const db = getDayOrderIndex(b.day_label ?? "");
    const ia = da === -1 ? 99 : da;
    const ib = db === -1 ? 99 : db;
    return ia !== ib ? ia - ib : a.sort_order - b.sort_order;
  });
}

/* ── Race profile sub-components ── */

const TERRAIN_COLORS: Record<string, string> = {
  road: "#78909c", tarmac: "#607d8b", asphalt: "#546e7a",
  trail: "#8d6e63", dirt: "#795548", path: "#a1887f",
  grass: "#66bb6a", grassland: "#81c784",
  gravel: "#bcaaa4", chalk: "#e0e0e0",
  sand: "#ffcc80", beach: "#ffd54f",
  technical: "#5d4037", rocky: "#6d4c41",
  woodland: "#388e3c", forest: "#2e7d32",
  default: "#90a4ae",
};

function terrainColor(type: string) {
  return TERRAIN_COLORS[type.toLowerCase()] ?? TERRAIN_COLORS.default;
}

// Downsample to at most maxPts points while preserving shape
function downsamplePoints(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

function parsePaceToMinutes(pace: string): number | null {
  const match = pace.match(/(\d+):(\d+)/);
  if (!match) return null;
  return parseInt(match[1], 10) + parseInt(match[2], 10) / 60;
}

function formatPaceLabel(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function ElevationChart({ profile, notable, pacingSections }: { profile: RaceElevProfile; notable: RaceSustainedSeg[]; pacingSections?: PacingSection[] }) {
  const W = 698; const H = 200;
  const padL = 46; const padB = 22; const padT = 16;

  // Widen right margin to fit pace axis when pacing data is present
  const hasPacing = (pacingSections?.length ?? 0) > 0;
  const padR = hasPacing ? 54 : 8;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const elevRange = Math.max(profile.maxElevationM - profile.minElevationM, 50);
  const xS = (km: number) => padL + (km / profile.totalDistanceKm) * cW;
  const yS = (m: number) => padT + cH - ((m - profile.minElevationM) / elevRange) * cH;

  const pts = downsamplePoints(profile.points, 300);
  const linePts = pts.map((p) => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ");
  const first = pts[0]; const last = pts[pts.length - 1];
  const areaD = `M${xS(first.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} ` +
    pts.map((p) => `L${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ") +
    ` L${xS(last.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} Z`;

  // Y-axis ticks (4 gridlines)
  const yStep = elevRange / 4;
  const yTicks = Array.from({ length: 5 }, (_, i) => profile.minElevationM + i * yStep);

  // X-axis ticks — roughly every 5 km
  const xInterval = Math.ceil(profile.totalDistanceKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= profile.totalDistanceKm; k += xInterval) xTicks.push(k);

  // ── Pace scale ──────────────────────────────────────────────
  // Parse each section's target pace to minutes-per-km
  const paceParsed = (pacingSections ?? []).map((s) => parsePaceToMinutes(s.target_pace));
  const validPaces = paceParsed.filter((v): v is number => v !== null);
  const paceMinRaw = validPaces.length > 0 ? Math.min(...validPaces) : 0;
  const paceMaxRaw = validPaces.length > 0 ? Math.max(...validPaces) : 30;
  // Add half-minute padding so the line never sits at the exact chart edge
  const paceMin = paceMinRaw - 0.5;
  const paceMax = paceMaxRaw + 0.5;
  const paceRange = Math.max(paceMax - paceMin, 1);
  // Slower pace (higher number) maps to the TOP of the chart —
  // this makes the line rise on climbs, mirroring the elevation profile.
  const paceY = (minPerKm: number) => padT + cH - ((minPerKm - paceMin) / paceRange) * cH;

  // Pace axis ticks at every 1 or 2 whole minutes
  const tickInterval = (paceMaxRaw - paceMinRaw) > 5 ? 2 : 1;
  const firstTick = Math.ceil(paceMin / tickInterval) * tickInterval;
  const paceTicks: number[] = [];
  for (let p = firstTick; p <= paceMax + 0.01; p += tickInterval) paceTicks.push(p);

  const axisX = padL + cW; // right edge of chart area

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Gridlines */}
      {yTicks.map((elev, i) => (
        <line key={i} x1={padL} y1={yS(elev)} x2={axisX} y2={yS(elev)} stroke="#eee" strokeWidth="1" />
      ))}

      {/* Notable segment bands */}
      {notable.map((seg, i) => (
        <rect key={i} x={xS(seg.startKm)} y={padT} width={Math.max(xS(seg.endKm) - xS(seg.startKm), 1)}
          height={cH} fill={seg.type === "climb" ? "#ff980018" : "#1565c018"} />
      ))}

      {/* Filled area */}
      <path d={areaD} fill="#1e3a1e18" />

      {/* Elevation line */}
      <polyline points={linePts} fill="none" stroke="#1e3a1e" strokeWidth="1.5" strokeLinejoin="round" />

      {/* ── Pace stepped line ── */}
      {hasPacing && (
        <g>
          {(pacingSections ?? []).map((sec, i) => {
            const pace = paceParsed[i];
            if (pace === null) return null;
            const x1 = xS(sec.start_km);
            const x2 = xS(sec.end_km);
            const y  = paceY(pace);
            const nextPace = i + 1 < paceParsed.length ? paceParsed[i + 1] : null;
            return (
              <g key={`pace-${i}`}>
                {/* Horizontal segment at this section's pace */}
                <line x1={x1} y1={y} x2={x2} y2={y} stroke="#c0392b" strokeWidth="1.5" strokeLinecap="square" />
                {/* Vertical step connector to the next section */}
                {nextPace !== null && (
                  <line x1={x2} y1={y} x2={x2} y2={paceY(nextPace)} stroke="#c0392b" strokeWidth="1.5" />
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Left Y-axis labels (elevation, m) */}
      {yTicks.map((elev, i) => (
        <text key={i} x={padL - 5} y={yS(elev) + 3.5} textAnchor="end" fontSize="8.5" fill="#888">
          {Math.round(elev)}
        </text>
      ))}

      {/* X-axis ticks + labels */}
      {xTicks.map((km, i) => (
        <g key={i}>
          <line x1={xS(km)} y1={padT + cH} x2={xS(km)} y2={padT + cH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS(km)} y={padT + cH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text>
        </g>
      ))}

      {/* Axis borders */}
      <line x1={padL}  y1={padT}      x2={padL}  y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL}  y1={padT + cH} x2={axisX} y2={padT + cH} stroke="#bbb" strokeWidth="1" />

      {/* ── Right pace axis ── */}
      {hasPacing && (
        <g>
          {/* Axis line in pace colour */}
          <line x1={axisX} y1={padT} x2={axisX} y2={padT + cH} stroke="#c0392b" strokeWidth="1" opacity="0.4" />
          {/* Tick marks + labels */}
          {paceTicks.map((p, i) => {
            const y = paceY(p);
            if (y < padT - 1 || y > padT + cH + 1) return null;
            return (
              <g key={i}>
                <line x1={axisX} y1={y} x2={axisX + 4} y2={y} stroke="#c0392b" strokeWidth="1" />
                <text x={axisX + 7} y={y + 3.5} textAnchor="start" fontSize="8.5" fill="#c0392b">
                  {formatPaceLabel(p)}
                </text>
              </g>
            );
          })}
          {/* Axis label — rotated, sitting at the far right */}
          <text
            x={axisX + 46}
            y={padT + cH / 2}
            textAnchor="middle"
            fontSize="7.5"
            fill="#c0392b"
            opacity="0.7"
            transform={`rotate(-90,${axisX + 46},${padT + cH / 2})`}
          >
            pace min/km
          </text>
        </g>
      )}

      {/* Notable segment labels (elevation ▲▼) */}
      {notable.map((seg, i) => {
        const midX = xS((seg.startKm + seg.endKm) / 2);
        const isClimb = seg.type === "climb";
        return (
          <text key={i} x={midX} y={padT - 3} textAnchor="middle" fontSize="8" fontWeight="700"
            fill={isClimb ? "#bf360c" : "#0d47a1"}>
            {isClimb ? "▲" : "▼"} {Math.abs(Math.round(seg.totalElevationM))}m
          </text>
        );
      })}
    </svg>
  );
}

function TerrainBar({ terrain }: { terrain: RaceTerrainSeg[] }) {
  const sorted = [...terrain].sort((a, b) => b.percentage - a.percentage);
  terrain = sorted;
  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: "18px", borderRadius: "4px", overflow: "hidden", marginBottom: "8px", border: "1px solid #ddd" }}>
        {terrain.map((seg) => (
          <div key={seg.type} style={{ width: `${seg.percentage}%`, background: terrainColor(seg.type), flexShrink: 0 }} />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {terrain.map((seg) => (
          <div key={seg.type} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#444" }}>
            <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: terrainColor(seg.type), border: "1px solid #ccc", flexShrink: 0 }} />
            {seg.label} — {Math.round(seg.percentage)}%
            {seg.distanceKm != null ? ` (${seg.distanceKm.toFixed(1)} km)` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function RaceSummaryPage({ template, profile, pacingSections }: { template: ProgramTemplate; profile: RaceProfileData; pacingSections?: PacingSection[] }) {
  const { elevation, terrain, sustainedSegments } = profile;

  // Top 3–5 notable segments by absolute elevation change, excluding flats
  const notable = (sustainedSegments ?? [])
    .filter((s) => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);

  const hasContent = elevation ?? terrain ?? (sustainedSegments?.length ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Race Course Profile</h2>

      {elevation && (
        <>
          {/* Stats strip */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
            {[
              { label: "Distance", value: `${elevation.totalDistanceKm.toFixed(1)} km` },
              { label: "Total ascent", value: `${Math.round(elevation.totalAscentM).toLocaleString()} m` },
              { label: "Total descent", value: `${Math.round(elevation.totalDescentM).toLocaleString()} m` },
              { label: "Climb / km", value: `${elevation.climbPerKm.toFixed(1)} m/km` },
            ].map(({ label, value }) => (
              <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
                <div style={{ color: "#888", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontWeight: 700, color: "#111", fontSize: "13px" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Elevation chart */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Elevation Profile
              {notable.length > 0 && " — shaded sections are the most significant climbs & descents"}
            </p>
            <ElevationChart profile={elevation} notable={notable} pacingSections={pacingSections} />
          </div>
        </>
      )}

      {/* Notable segments table */}
      {notable.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Notable Segments
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr>
                {["#", "Type", "km range", "Length", "Avg gradient", "Elevation"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "11px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notable.map((seg, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee", color: "#555" }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>
                    <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: "8px", fontSize: "10px", fontWeight: 700,
                      background: seg.type === "climb" ? "#fff3e0" : "#e3f2fd",
                      color: seg.type === "climb" ? "#bf360c" : "#0d47a1" }}>
                      {seg.type === "climb" ? "▲ Climb" : "▼ Descent"}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>{seg.startKm.toFixed(1)}–{seg.endKm.toFixed(1)} km</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>{seg.lengthKm.toFixed(1)} km</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>{Math.abs(seg.avgGradient).toFixed(1)}%</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee", fontWeight: 600 }}>{Math.abs(Math.round(seg.totalElevationM))} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terrain breakdown */}
      {terrain && terrain.length > 0 && (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Terrain Surface
          </p>
          <TerrainBar terrain={terrain} />
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function PrintHeader({ template }: { template: ProgramTemplate }) {
  return (
    <div style={printHeader}>
      <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
      <div style={headerRight}>
        <div style={headerRaceName}>{template.name}</div>
        {template.event_goal && (
          <div style={headerAthleteName}>{template.event_goal}</div>
        )}
      </div>
    </div>
  );
}

function ExerciseTable({ exercises }: { exercises: TemplateExercise[] }) {
  if (exercises.length === 0) return null;
  const sorted = [...exercises].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <table style={exTable}>
      <thead>
        <tr>
          <th style={exTh}>Exercise</th>
          <th style={{ ...exTh, textAlign: "center", width: "110px" }}>Sets / Reps</th>
          <th style={exTh}>Notes</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((ex) => {
          const prescription =
            ex.sets && ex.reps
              ? `${ex.sets} × ${ex.reps}`
              : ex.sets && ex.duration_seconds
              ? `${ex.sets} × ${formatDuration(ex.duration_seconds)}`
              : ex.duration_seconds
              ? formatDuration(ex.duration_seconds)
              : ex.sets
              ? `${ex.sets} sets`
              : "—";
          return (
            <tr key={ex.id}>
              <td style={exTd}>{ex.exercises?.name ?? "Unknown exercise"}</td>
              <td style={{ ...exTd, textAlign: "center", whiteSpace: "nowrap" }}>{prescription}</td>
              <td style={exTd}>{ex.notes || (ex.exercises?.description ? ex.exercises.description.slice(0, 120) : "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SessionSpecs({ session }: { session: TemplateSession }) {
  const specs: string[] = [];
  if (session.warmup_minutes) specs.push(`${session.warmup_minutes} min warm-up`);
  if (session.interval_reps && session.interval_duration) specs.push(`${session.interval_reps} × ${session.interval_duration}`);
  else if (session.interval_reps) specs.push(`${session.interval_reps} reps`);
  if (session.num_sets && session.set_duration_minutes) specs.push(`${session.num_sets} sets × ${session.set_duration_minutes} min`);
  else if (session.num_sets) specs.push(`${session.num_sets} sets`);
  if (session.strides) specs.push(session.strides);
  if (session.elevation_gain_meters) specs.push(`+${Math.round(session.elevation_gain_meters)} m`);
  if (session.pack_weight_kg) specs.push(`${session.pack_weight_kg} kg pack`);
  if (session.cooldown_minutes) specs.push(`${session.cooldown_minutes} min cool-down`);
  if (specs.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "8px" }}>
      {specs.map((p) => (
        <span key={p} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", border: "1px solid #d4d4d4", background: "#f9f9f9", color: "#333", fontVariantNumeric: "tabular-nums" }}>{p}</span>
      ))}
    </div>
  );
}

function GymFocusChart({ session, raceProfile }: { session: TemplateSession; raceProfile: RaceProfileData }) {
  const tags = (session.tags ?? []).filter((t) =>
    /^(uphill|downhill|flat) on /i.test(t)
  );
  if (tags.length === 0 || !raceProfile.elevation || raceProfile.elevation.points.length < 2) return null;

  // Find sustained segments that match any tag
  const matchingSegs = (raceProfile.sustainedSegments ?? []).filter((seg) =>
    tags.some((tag) => {
      const lower = tag.toLowerCase();
      const dir = lower.startsWith("uphill") ? "climb" : lower.startsWith("downhill") ? "descent" : "flat";
      if (seg.type !== dir) return false;
      const terrainLabel = tag.replace(/^(uphill|downhill|flat) on /i, "");
      const labels = terrainLabelsForRange(raceProfile.positionedTerrain, seg.startKm, seg.endKm);
      return labels.some((l) => l.toLowerCase() === terrainLabel.toLowerCase());
    })
  );
  if (matchingSegs.length === 0) return null;

  const { points, totalDistanceKm, minElevationM, maxElevationM } = raceProfile.elevation;
  const W = 650; const H = 70;
  const padL = 0; const padB = 0; const padT = 4; const padR = 0;
  const cW = W - padL - padR; const cH = H - padT - padB;
  const elevRange = Math.max(maxElevationM - minElevationM, 50);
  const xS = (km: number) => padL + (km / totalDistanceKm) * cW;
  const yS = (m: number) => padT + cH - ((m - minElevationM) / elevRange) * cH;

  const pts = downsamplePoints(points, 300);
  const first = pts[0]; const last = pts[pts.length - 1];
  const areaD = `M${xS(first.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} ` +
    pts.map((p) => `L${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ") +
    ` L${xS(last.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} Z`;
  const linePts = pts.map((p) => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ");

  const isDescend = tags.some((t) => /^downhill/i.test(t));
  const highlightFill = isDescend ? "#1565c022" : "#bf360c22";
  const highlightStroke = isDescend ? "#1565c0" : "#bf360c";

  return (
    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Course segment — {tags.join(", ")}
      </p>
      <svg width={W} height={H} style={{ display: "block", borderRadius: "4px", overflow: "hidden" }}>
        {/* Background elevation area */}
        <path d={areaD} fill="#1e3a1e10" />
        <polyline points={linePts} fill="none" stroke="#1e3a1e60" strokeWidth="1" strokeLinejoin="round" />
        {/* Highlighted segments */}
        {matchingSegs.map((seg, i) => (
          <rect key={i}
            x={xS(seg.startKm)} y={padT}
            width={Math.max(xS(seg.endKm) - xS(seg.startKm), 2)} height={cH}
            fill={highlightFill}
          />
        ))}
        {/* Highlighted segment outline */}
        {matchingSegs.map((seg, i) => {
          const segPts = pts.filter((p) => p.distanceKm >= seg.startKm && p.distanceKm <= seg.endKm);
          if (segPts.length < 2) return null;
          return (
            <polyline key={`line-${i}`}
              points={segPts.map((p) => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ")}
              fill="none" stroke={highlightStroke} strokeWidth="2" strokeLinejoin="round"
            />
          );
        })}
        {/* Segment labels */}
        {matchingSegs.map((seg, i) => (
          <text key={`lbl-${i}`}
            x={xS((seg.startKm + seg.endKm) / 2)} y={padT + 12}
            textAnchor="middle" fontSize="8" fontWeight="700" fill={highlightStroke}>
            {seg.type === "climb" ? "▲" : "▼"} {Math.abs(Math.round(seg.totalElevationM))}m · {seg.avgGradient.toFixed(1)}%
          </text>
        ))}
      </svg>
    </div>
  );
}

function SessionCard({ session, raceProfile }: { session: TemplateSession; raceProfile?: RaceProfileData }) {
  const isGym = session.type === "Gym";
  const isRest = session.type === "Rest";
  const col = SESSION_COLOURS[session.type] ?? SESSION_COLOURS.default;

  return (
    <div style={sessionCard}>
      <div style={sessionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ ...typeBadge, background: col.bg, color: col.fg }}>{session.type}</span>
          {session.day_label && <span style={dayLabel}>{session.day_label}</span>}
          {session.is_key_session && <span style={keyBadge}>★ Key Session</span>}
          <strong style={sessionName}>{session.name}</strong>
        </div>
        <div style={sessionMeta}>
          {sessionDuration(session) !== "—" && <span>{sessionDuration(session)}</span>}
          {session.intensity && <span style={{ textTransform: "capitalize" }}>{session.intensity}</span>}
        </div>
      </div>

      {isGym && raceProfile && <GymFocusChart session={session} raceProfile={raceProfile} />}

      {!isRest && <SessionSpecs session={session} />}

      {session.description && (
        <p style={descriptionText}>{session.description}</p>
      )}

      {session.reason && (
        <div style={reasonBox}>
          <span style={reasonLabel}>Why this session:</span>
          <span style={reasonText}>{session.reason}</span>
        </div>
      )}

      {isGym && <ExerciseTable exercises={session.program_template_session_exercises} />}
    </div>
  );
}

function WeeklyMileagePage({ weeks, template }: { weeks: TemplateWeek[]; template: ProgramTemplate }) {
  const sorted = weeks.slice().sort((a, b) => a.week_number - b.week_number);
  const weekMiles = sorted.map((week) => {
    const totalKm = week.program_template_sessions.reduce((sum, s) => sum + (s.distance_km ?? 0), 0);
    return { weekNumber: week.week_number, focus: week.focus ?? "", miles: totalKm * 0.621371 };
  });

  const maxMiles = Math.max(...weekMiles.map((w) => w.miles), 1);
  const niceMax = Math.ceil(maxMiles / 5) * 5;
  const step = niceMax <= 20 ? 5 : niceMax <= 50 ? 10 : 20;
  const yTicks: number[] = [];
  for (let v = 0; v <= niceMax; v += step) yTicks.push(v);

  const chartH = 200;
  const barW = Math.min(32, Math.max(14, Math.floor(560 / weekMiles.length) - 6));
  const gap = 6;
  const yAxisW = 36;
  const totalW = weekMiles.length * (barW + gap);

  if (weekMiles.every((w) => w.miles === 0)) return null;

  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <h2 style={{ margin: "0 0 20px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Weekly Mileage</h2>
      <svg width={yAxisW + totalW} height={chartH + 40} style={{ display: "block", overflow: "visible" }}>
        {yTicks.map((tick) => {
          const y = chartH - (tick / niceMax) * chartH;
          return (
            <g key={tick}>
              <line x1={yAxisW} x2={yAxisW + totalW} y1={y} y2={y} stroke="#e4e4e7" strokeWidth={1} />
              <text x={yAxisW - 4} y={y + 4} fontSize={9} textAnchor="end" fill="#71717a">{tick}</text>
            </g>
          );
        })}
        {weekMiles.map((w, i) => {
          const barH = Math.max(2, (w.miles / niceMax) * chartH);
          const x = yAxisW + i * (barW + gap);
          const y = chartH - barH;
          const focus = w.focus.toLowerCase();
          const fill =
            focus.includes("taper") || focus.includes("peak") ? "#bf360c" :
            focus.includes("recovery") || focus.includes("deload") ? "#78909c" :
            "#1e3a1e";
          return (
            <g key={w.weekNumber}>
              <rect x={x} y={y} width={barW} height={barH} fill={fill} rx={3} />
              {w.miles > 0 && (
                <text x={x + barW / 2} y={y - 4} fontSize={8} textAnchor="middle" fill="#52525b">{w.miles.toFixed(1)}</text>
              )}
              <text x={x + barW / 2} y={chartH + 14} fontSize={8} textAnchor="middle" fill="#71717a">W{w.weekNumber}</text>
              {w.focus && (
                <text x={x + barW / 2} y={chartH + 26} fontSize={7} textAnchor="middle" fill="#a1a1aa"
                  style={{ textOverflow: "ellipsis" }}>{w.focus.length > 8 ? w.focus.slice(0, 7) + "…" : w.focus}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: "16px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {[
          { color: "#1e3a1e", label: "Build / Base" },
          { color: "#bf360c", label: "Taper / Peak" },
          { color: "#78909c", label: "Recovery / Deload" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#555" }}>
            <span style={{ display: "inline-block", width: "12px", height: "12px", borderRadius: "3px", background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}


function WeekDetailPage({ week, template, raceProfile }: { week: TemplateWeek; template: ProgramTemplate; raceProfile?: RaceProfileData }) {
  const sessions = sortSessions(week.program_template_sessions);
  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <div style={weekHeaderBar}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <h2 style={weekTitle}>Week {week.week_number}</h2>
          {week.focus && <span style={focusBadge}>{week.focus}</span>}
        </div>
        {week.notes && <p style={weekNotes}>{week.notes}</p>}
      </div>

      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} raceProfile={raceProfile} />
      ))}
    </div>
  );
}

/* ── Main page ── */
export default function ExportPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params?.planId as string;
  const supabase = createClient();

  const [template, setTemplate] = useState<ProgramTemplate | null>(null);
  const [raceProfile, setRaceProfile] = useState<RaceProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!templateId) return;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("program_templates")
        .select(`
          id, name, description, event_goal, discipline, plan_length_weeks, training_days_per_week, race_id, pacing_data,
          program_template_weeks (
            id, week_number, focus, notes,
            program_template_sessions (
              id, day_label, sort_order, type, name, description,
              duration, duration_minutes, intensity, is_key_session, reason, tags,
              distance_km, num_sets, set_duration_minutes, interval_reps, interval_duration,
              strides, warmup_minutes, cooldown_minutes, elevation_gain_meters, pack_weight_kg,
              program_template_session_exercises (
                id, sort_order, sets, reps, duration_seconds, notes,
                exercises ( name, description )
              )
            )
          )
        `)
        .eq("id", templateId)
        .single();

      if (err || !data) {
        setError(err?.message ?? "Template not found.");
        setLoading(false);
        return;
      }

      // Sort weeks
      const sorted = { ...data } as unknown as ProgramTemplate;
      sorted.program_template_weeks = [...sorted.program_template_weeks].sort(
        (a, b) => a.week_number - b.week_number
      );

      setTemplate(sorted);

      if (sorted.race_id) {
        const { data: metaRows } = await supabase
          .from("races_meta")
          .select("meta_key, meta_value")
          .eq("race_id", sorted.race_id)
          .in("meta_key", ["elevation_profile", "terrain_breakdown", "sustained_segments", "terrain_segments"]);

        const meta: Record<string, string> = {};
        for (const row of (metaRows ?? []) as { meta_key: string; meta_value: string }[]) {
          meta[row.meta_key] = row.meta_value;
        }
        setRaceProfile({
          elevation: parseRaceElevProfile(meta.elevation_profile),
          terrain: parseRaceTerrainSegs(meta.terrain_breakdown),
          sustainedSegments: parseRaceSustainedSegs(meta.sustained_segments),
          positionedTerrain: parsePositionedTerrain(meta.terrain_segments),
        });
      }

      setLoading(false);
    }
    void load();
  }, [templateId]);

  if (loading) {
    return <main style={{ padding: "60px 24px", textAlign: "center" }}><p style={{ color: "#666" }}>Loading template...</p></main>;
  }

  if (error || !template) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#b00020" }}>{error || "Template not found."}</p>
        <button type="button" onClick={() => router.push("/admin/export-programme")} style={backBtn}>Back</button>
      </main>
    );
  }

  const weeks = template.program_template_weeks;

  return (
    <>
      {/* ── Screen toolbar (hidden on print) ── */}
      <div style={toolbar} className="no-print">
        <button type="button" onClick={() => router.push("/admin/export-programme")} style={backBtn}>
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "16px" }}>{template.name}</strong>
          {template.event_goal && (
            <span style={{ color: "#666", marginLeft: "10px", fontSize: "14px" }}>· {template.event_goal}</span>
          )}
          <span style={{ color: "#aaa", marginLeft: "10px", fontSize: "13px" }}>
            {template.plan_length_weeks} weeks · {template.training_days_per_week} days/week
          </span>
        </div>
        <button type="button" onClick={() => window.print()} style={printBtn}>
          Export to PDF
        </button>
      </div>

      {/* ── A4 document canvas ── */}
      <div style={canvas}>

        {/* Cover page */}
        <div style={{ ...a4Page, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={{ maxWidth: "260px", marginBottom: "48px" }} />
          <h1 style={{ fontSize: "30px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 12px" }}>{template.name}</h1>
          {template.event_goal && <p style={{ fontSize: "18px", color: "#555", margin: "4px 0" }}>{template.event_goal}</p>}
          {template.discipline && <p style={{ fontSize: "15px", color: "#888", margin: "4px 0", textTransform: "capitalize" }}>{template.discipline}</p>}
          <p style={{ fontSize: "15px", color: "#888", marginTop: "24px" }}>
            {template.plan_length_weeks} week programme · {template.training_days_per_week} training days per week
          </p>
          {template.description && (
            <p style={{ fontSize: "14px", color: "#666", marginTop: "20px", maxWidth: "480px", lineHeight: "1.6" }}>{template.description}</p>
          )}
        </div>

        {/* Race course profile page */}
        {raceProfile && <RaceSummaryPage template={template} profile={raceProfile} pacingSections={template.pacing_data ?? undefined} />}

        {/* Weekly mileage chart */}
        <WeeklyMileagePage weeks={weeks} template={template} />

        {/* Detail — one week per A4 page */}
        {weeks.map((week) => (
          <WeekDetailPage key={`det-${week.id}`} week={week} template={template} raceProfile={raceProfile ?? undefined} />
        ))}

      </div>

      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .no-print { display: none !important; }
          .app-sidebar { display: none !important; }
          .app-topbar { display: none !important; }
          body { margin: 0 !important; padding: 0 !important; background: #fff; }
          .app-content { margin: 0 !important; padding: 0 !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

/* ── Colour map ── */
const SESSION_COLOURS: Record<string, { bg: string; fg: string }> & { default: { bg: string; fg: string } } = {
  Easy:       { bg: "#e8f5e9", fg: "#2e7d32" },
  Long:       { bg: "#e3f2fd", fg: "#1565c0" },
  Steady:     { bg: "#e8eaf6", fg: "#3949ab" },
  Recovery:   { bg: "#f3e5f5", fg: "#7b1fa2" },
  Gym:        { bg: "#fff3e0", fg: "#e65100" },
  Loaded:     { bg: "#fbe9e7", fg: "#bf360c" },
  Recce:      { bg: "#e0f7fa", fg: "#00695c" },
  Navigation: { bg: "#f1f8e9", fg: "#33691e" },
  functional: { bg: "#fce4ec", fg: "#880e4f" },
  Rest:       { bg: "#f5f5f5", fg: "#9e9e9e" },
  default:    { bg: "#f5f5f5", fg: "#555" },
};

/* ── Styles ── */

// A4 at 96dpi: 794 × 1123px. We use min-height so content can overflow gracefully on screen.
const a4Page: React.CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  background: "#fff",
  padding: "40px 48px",
  boxSizing: "border-box",
  marginBottom: "0",
  breakAfter: "page",
  pageBreakAfter: "always",
  position: "relative",
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

const headerRight: React.CSSProperties = { textAlign: "right" };

const headerRaceName: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1e3a1e",
};

const headerAthleteName: React.CSSProperties = {
  fontSize: "11px",
  color: "#666",
  marginTop: "2px",
};

const weekHeaderBar: React.CSSProperties = { marginBottom: "20px" };

const weekTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 700,
  color: "#1e3a1e",
};

const focusBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: "12px",
  background: "#1e3a1e",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 600,
};

const weekNotes: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "13px",
  color: "#666",
  fontStyle: "italic",
};


const sessionCard: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: "6px",
  padding: "14px",
  marginBottom: "10px",
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const sessionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "8px",
  flexWrap: "wrap",
};

const sessionName: React.CSSProperties = { fontSize: "14px", color: "#111" };

const sessionMeta: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  fontSize: "12px",
  color: "#666",
  whiteSpace: "nowrap",
};

const dayLabel: React.CSSProperties = { fontSize: "12px", color: "#555", fontWeight: 500 };

const typeBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 7px",
  borderRadius: "10px",
  fontSize: "11px",
  fontWeight: 600,
};


const keyBadge: React.CSSProperties = {
  fontSize: "11px",
  color: "#b45309",
  background: "#fef3c7",
  padding: "1px 6px",
  borderRadius: "8px",
  fontWeight: 600,
};

const descriptionText: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "13px",
  color: "#555",
  lineHeight: "1.5",
};

const reasonBox: React.CSSProperties = {
  background: "#f0f7f0",
  border: "1px solid #c8e6c9",
  borderRadius: "5px",
  padding: "8px 12px",
  marginBottom: "10px",
  fontSize: "12px",
  lineHeight: "1.5",
};

const reasonLabel: React.CSSProperties = {
  fontWeight: 600,
  color: "#2e7d32",
  marginRight: "5px",
};

const reasonText: React.CSSProperties = {
  color: "#444",
  fontStyle: "italic",
};

const exTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px",
  marginTop: "8px",
};

const exTh: React.CSSProperties = {
  textAlign: "left",
  padding: "5px 8px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  color: "#555",
  background: "#fafafa",
};

const exTd: React.CSSProperties = {
  padding: "5px 8px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "top",
  color: "#333",
};

const backBtn: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#fff",
  color: "#111",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

const printBtn: React.CSSProperties = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#1e3a1e",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

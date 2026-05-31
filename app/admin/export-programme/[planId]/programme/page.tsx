"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
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
  wind_adjusted_pace: string;
};

/* ── Route / wind types ── */
type RoutePoint = { lat: number; lon: number };

type WindSection = {
  section_id: number;
  start_km: number;
  end_km: number;
  mid_lat: number;
  mid_lon: number;
  bearing_deg: number;
  median_wind_speed_ms: number;
  median_headwind_ms: number;
  median_crosswind_ms: number;
  wind_risk_label: string;
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
  exercises: { name: string; description: string; steps: string[] | null; primary_muscles: string[] | null; secondary_muscles: string[] | null } | null;
};

type MobilityStretch = {
  sort_order: number;
  hold_duration_seconds: number | null;
  stretches: { name: string; steps: string[] | null } | { name: string; steps: string[] | null }[] | null;
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
  target_pace: string | null;
  distance_km: number | null;
  num_sets: number | null;
  set_duration_minutes: number | null;
  interval_reps: number | null;
  interval_duration: string | null;
  interval_distance_meters: number | null;
  rest_seconds: number | null;
  gradient_percent: number | null;
  perceived_effort: number | null;
  strides: string | null;
  warmup_minutes: number | null;
  cooldown_minutes: number | null;
  elevation_gain_meters: number | null;
  pack_weight_kg: number | null;
  terrain: string | null;
  mobility_sessions: {
    mobility_session_stretches: MobilityStretch[];
  } | null;
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
  gpx_data: RoutePoint[] | null;
  wind_data: WindSection[] | null;
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

/* ── Route map (OSM tiles + Mercator projection) ── */

// Web Mercator helpers — same projection as OSM tile server
function osmMercX(lon: number): number {
  return (lon + 180) / 360;
}
function osmMercY(lat: number): number {
  const s = Math.sin(lat * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
function osmTileX(lon: number, z: number): number {
  return Math.floor(osmMercX(lon) * Math.pow(2, z));
}
function osmTileY(lat: number, z: number): number {
  return Math.floor(osmMercY(lat) * Math.pow(2, z));
}

function windRiskColor(label: string): string {
  if (label.includes("high")) return "#c62828";
  if (label.includes("moderate")) return "#e65100";
  return "#546e7a";
}

type OsmTile = { url: string; x: number; y: number; w: number; h: number };

function RouteMap({
  route,
  windSections,
  width = 694,
  height = 240,
}: {
  route: RoutePoint[];
  windSections?: WindSection[];
  width?: number;
  height?: number;
}) {
  // Stable clip-path ID for this component instance
  const clipId = useRef(`mc-${Math.random().toString(36).slice(2, 7)}`).current;
  const [tiles, setTiles] = useState<OsmTile[]>([]);

  // Load OSM tiles whenever the route changes
  useEffect(() => {
    if (route.length < 2) { setTiles([]); return; }

    const lats = route.map(p => p.lat);
    const lons = route.map(p => p.lon);
    const r0lat = Math.min(...lats); const r1lat = Math.max(...lats);
    const r0lon = Math.min(...lons); const r1lon = Math.max(...lons);
    // Add 15 % padding around the route bounding box
    const dlat = r1lat - r0lat; const dlon = r1lon - r0lon;
    const minLat = r0lat - dlat * 0.15 - 0.005;
    const maxLat = r1lat + dlat * 0.15 + 0.005;
    const minLon = r0lon - dlon * 0.15 - 0.008;
    const maxLon = r1lon + dlon * 0.15 + 0.008;

    // Choose highest zoom where total tile count ≤ 16
    let z = 14;
    for (; z >= 8; z--) {
      const nx = osmTileX(maxLon, z) - osmTileX(minLon, z) + 1;
      const ny = osmTileY(minLat, z) - osmTileY(maxLat, z) + 1; // minLat has larger tileY
      if (nx * ny <= 16) break;
    }

    const zPow = Math.pow(2, z);
    const mx0 = osmMercX(minLon); const mx1 = osmMercX(maxLon);
    const my0 = osmMercY(maxLat); const my1 = osmMercY(minLat);
    const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
    const ox = (width  - (mx1 - mx0) * sc) / 2;
    const oy = (height - (my1 - my0) * sc) / 2;
    const tsz = 1 / zPow; // tile size in Mercator units

    const tx0 = osmTileX(minLon, z); const tx1 = osmTileX(maxLon, z);
    const ty0 = osmTileY(maxLat, z); const ty1 = osmTileY(minLat, z);

    const newTiles: OsmTile[] = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        newTiles.push({
          url: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`,
          x: ox + (tx * tsz - mx0) * sc,
          y: oy + (ty * tsz - my0) * sc,
          w: tsz * sc,
          h: tsz * sc,
        });
      }
    }
    setTiles(newTiles);
  }, [route, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  if (route.length < 2) return null;

  // Mercator layout for overlay rendering (same padding formula as the effect above)
  const lats = route.map(p => p.lat);
  const lons = route.map(p => p.lon);
  const r0lat = Math.min(...lats); const r1lat = Math.max(...lats);
  const r0lon = Math.min(...lons); const r1lon = Math.max(...lons);
  const dlat = r1lat - r0lat; const dlon = r1lon - r0lon;
  const minLat = r0lat - dlat * 0.15 - 0.005;
  const maxLat = r1lat + dlat * 0.15 + 0.005;
  const minLon = r0lon - dlon * 0.15 - 0.008;
  const maxLon = r1lon + dlon * 0.15 + 0.008;

  const mx0 = osmMercX(minLon); const mx1 = osmMercX(maxLon);
  const my0 = osmMercY(maxLat); const my1 = osmMercY(minLat);
  const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
  const ox = (width  - (mx1 - mx0) * sc) / 2;
  const oy = (height - (my1 - my0) * sc) / 2;

  const toX = (lon: number) => ox + (osmMercX(lon) - mx0) * sc;
  const toY = (lat: number) => oy + (osmMercY(lat) - my0) * sc;

  const pts = route.map(p => `${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(" ");
  const startPt = route[0]; const endPt = route[route.length - 1];
  const maxWindSpeed = Math.max(...(windSections ?? []).map(s => s.median_wind_speed_ms), 1);
  const hasWind = (windSections?.length ?? 0) > 0;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>

      {/* Fallback background colour while tiles load */}
      <rect x={0} y={0} width={width} height={height} fill="#e8ede8" />

      <g clipPath={`url(#${clipId})`}>
        {/* OSM tile images — aligned via Mercator projection */}
        {tiles.map((t, i) => (
          <image key={i} href={t.url}
            x={t.x.toFixed(1)} y={t.y.toFixed(1)}
            width={t.w.toFixed(1)} height={t.h.toFixed(1)}
            preserveAspectRatio="none"
          />
        ))}

        {/* Route: white halo so it reads against any map background */}
        <polyline points={pts} fill="none" stroke="white" strokeWidth="5"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        <polyline points={pts} fill="none" stroke="#1a3a1a" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Wind arrows */}
        {(windSections ?? []).map((sec, i) => {
          const cx = toX(sec.mid_lon); const cy = toY(sec.mid_lat);
          const color = windRiskColor(sec.wind_risk_label);
          const isSignificant = sec.wind_risk_label !== "low_wind_risk";
          // Arrow points in the direction the wind is BLOWING:
          // positive headwind → wind opposing travel → blowing from bearing, toward bearing+180
          const windDir = sec.median_headwind_ms >= 0
            ? (sec.bearing_deg + 180) % 360
            : sec.bearing_deg % 360;
          const arrowLen = 9 + (sec.median_wind_speed_ms / maxWindSpeed) * 7;
          return (
            <g key={i}
              transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${windDir.toFixed(1)})`}
              opacity={isSignificant ? 1 : 0.5}
            >
              <circle r={arrowLen + 5} fill={color} opacity={0.22} />
              <line x1={0} y1={arrowLen * 0.65} x2={0} y2={-arrowLen * 0.65}
                stroke={color} strokeWidth={isSignificant ? 2.5 : 1.5} strokeLinecap="round" />
              <polygon
                points={`0,${-(arrowLen + 4)} ${-arrowLen * 0.4},${-arrowLen * 0.35} ${arrowLen * 0.4},${-arrowLen * 0.35}`}
                fill={color}
              />
            </g>
          );
        })}

        {/* Start marker */}
        <circle cx={toX(startPt.lon)} cy={toY(startPt.lat)} r={6} fill="#2e7d32" stroke="white" strokeWidth="2" />
        <text x={toX(startPt.lon) + 9} y={toY(startPt.lat) + 4} fontSize="9.5" fontWeight="700"
          stroke="white" strokeWidth="3" paintOrder="stroke" fill="#2e7d32">Start</text>

        {/* Finish marker */}
        <circle cx={toX(endPt.lon)} cy={toY(endPt.lat)} r={6} fill="#c62828" stroke="white" strokeWidth="2" />
        <text x={toX(endPt.lon) + 9} y={toY(endPt.lat) + 4} fontSize="9.5" fontWeight="700"
          stroke="white" strokeWidth="3" paintOrder="stroke" fill="#c62828">Finish</text>
      </g>

      {/* Wind legend (outside clipPath so it's always visible) */}
      {hasWind && (
        <g transform={`translate(${width - 134},${height - 58})`}>
          <rect x={0} y={0} width={130} height={54} fill="white" opacity={0.92} rx={3} />
          <text x={7} y={13} fontSize="8" fontWeight="700" fill="#333">Wind risk</text>
          {[
            { color: "#546e7a", label: "Low" },
            { color: "#e65100", label: "Moderate headwind" },
            { color: "#c62828", label: "High headwind" },
          ].map(({ color, label }, li) => (
            <g key={li} transform={`translate(7,${21 + li * 11})`}>
              <circle r={4} fill={color} />
              <text x={11} y={4} fontSize="7.5" fill="#444">{label}</text>
            </g>
          ))}
        </g>
      )}

      {/* OSM attribution — required by usage policy */}
      <rect x={width - 158} y={height - 14} width={154} height={12} fill="white" opacity={0.75} />
      <text x={width - 4} y={height - 4} textAnchor="end" fontSize="7.5" fill="#555">
        © OpenStreetMap contributors
      </text>
    </svg>
  );
}

function RaceSummaryPage({ template, profile }: { template: ProgramTemplate; profile: RaceProfileData }) {
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

      {/* Route map */}
      {template.gpx_data && template.gpx_data.length > 1 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Route Map
          </p>
          <RouteMap route={template.gpx_data} />
        </div>
      )}

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
            <ElevationChart profile={elevation} notable={notable} />
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

function ExerciseTable({ exercises, pageMap }: { exercises: TemplateExercise[]; pageMap?: Map<string, number> }) {
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
          const exName = ex.exercises?.name;
          const manualPage = exName && pageMap ? pageMap.get(exName) : undefined;
          return (
            <tr key={ex.id}>
              <td style={exTd}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                  <strong>{exName ?? "Unknown exercise"}</strong>
                  {(() => {
                    const primary = (ex.exercises?.primary_muscles ?? []).filter(Boolean);
                    const secondary = (ex.exercises?.secondary_muscles ?? []).filter(Boolean);
                    if (primary.length === 0 && secondary.length === 0) return null;
                    return (
                      <span style={{ fontSize: "11px", color: "#777", fontWeight: 400 }}>
                        {primary.length > 0 && primary.join(", ")}
                        {primary.length > 0 && secondary.length > 0 && " · "}
                        {secondary.length > 0 && <span style={{ color: "#aaa" }}>{secondary.join(", ")}</span>}
                      </span>
                    );
                  })()}
                </div>
                {manualPage !== undefined && (
                  <div style={{ margin: "3px 0 0 0", fontSize: "10px", color: "#888", fontStyle: "italic" }}>
                    See steps on page {manualPage} of the Exercise Manual
                  </div>
                )}
              </td>
              <td style={{ ...exTd, textAlign: "center", whiteSpace: "nowrap" }}>{prescription}</td>
              <td style={exTd}>{ex.notes || (ex.exercises?.description ? ex.exercises.description.slice(0, 120) : "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MobilityStretchList({ session }: { session: TemplateSession }) {
  const stretches = (session.mobility_sessions?.mobility_session_stretches ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => {
      const stretch = Array.isArray(s.stretches) ? s.stretches[0] : s.stretches;
      return { name: stretch?.name ?? "Unknown", steps: stretch?.steps ?? [], holdDurationSeconds: s.hold_duration_seconds };
    });

  if (stretches.length === 0) return null;

  return (
    <table style={{ fontSize: "12px", borderCollapse: "collapse", width: "100%", marginBottom: "10px" }}>
      <thead>
        <tr>
          <th style={{ ...exTh, width: "30px" }}>#</th>
          <th style={exTh}>Stretch</th>
          <th style={{ ...exTh, width: "80px", textAlign: "center" }}>Hold</th>
        </tr>
      </thead>
      <tbody>
        {stretches.map((s, i) => (
          <tr key={i}>
            <td style={{ ...exTd, color: "#888" }}>{i + 1}</td>
            <td style={exTd}>
              <strong>{s.name}</strong>
              {s.steps.length > 0 && (
                <div style={{ margin: "4px 0 0 0", fontSize: "11px", color: "#555", lineHeight: "1.5" }}>
                  {s.steps.map((step, si) => (
                    <div key={si} style={{ display: "flex", gap: "4px" }}>
                      <span style={{ flexShrink: 0, fontWeight: 600 }}>{si + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              )}
            </td>
            <td style={{ ...exTd, textAlign: "center", whiteSpace: "nowrap" }}>
              {s.holdDurationSeconds ? `${s.holdDurationSeconds}s` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SessionSpecs({ session, hideIntensity = false }: { session: TemplateSession; hideIntensity?: boolean }) {
  const isGym = session.type === "Gym";

  if (isGym) {
    // Gym sessions keep a compact pill row for training volume specs only
    const specs: string[] = [];
    if (session.warmup_minutes) specs.push(`${session.warmup_minutes} min warm-up`);
    if (session.num_sets && session.set_duration_minutes) specs.push(`${session.num_sets} sets × ${session.set_duration_minutes} min`);
    else if (session.num_sets) specs.push(`${session.num_sets} sets`);
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

  // Running / functional sessions — key-value list
  const rows: { label: string; value: string }[] = [];
  if (session.distance_km) rows.push({ label: "Distance", value: `${session.distance_km} km` });
  if (!hideIntensity && session.intensity) rows.push({ label: "Intensity", value: session.intensity });
  if (session.terrain) rows.push({ label: "Terrain", value: session.terrain.charAt(0).toUpperCase() + session.terrain.slice(1) });
  if (session.elevation_gain_meters) {
    const elevLabel = { 0: "Flat / none", 100: "Rolling / light climb", 250: "Hilly", 500: "Steep", 1000: "Mountainous / very steep" }[session.elevation_gain_meters];
    rows.push({ label: "Elevation", value: elevLabel ?? `+${Math.round(session.elevation_gain_meters)} m` });
  }
  if (session.pack_weight_kg) rows.push({ label: "Pack weight", value: `${session.pack_weight_kg} kg` });
  if (session.num_sets) {
    const setDur = session.set_duration_minutes != null ? ` × ${Math.round(session.set_duration_minutes * 60)}s` : "";
    rows.push({ label: "Sets", value: `${session.num_sets}${setDur}` });
  }
  if (session.warmup_minutes) rows.push({ label: "Warm-up", value: `${session.warmup_minutes} min` });
  if (session.interval_reps) rows.push({ label: "Intervals", value: String(session.interval_reps) });
  if (session.interval_distance_meters) rows.push({ label: "Interval distance", value: `${session.interval_distance_meters}m` });
  if (session.gradient_percent) rows.push({ label: "Gradient", value: `${session.gradient_percent}%` });
  if (session.interval_duration) rows.push({ label: "Recovery", value: session.interval_duration });
  if (session.rest_seconds) rows.push({ label: "Rest between sets", value: `${session.rest_seconds}s` });
  if (session.perceived_effort) rows.push({ label: "Perceived effort", value: `${session.perceived_effort}%` });
  if (session.strides) rows.push({ label: "Strides", value: session.strides });
  if (session.cooldown_minutes) rows.push({ label: "Cool-down", value: `${session.cooldown_minutes} min` });
  if (session.description) rows.push({ label: "Notes", value: session.description });

  if (rows.length === 0) return null;

  return (
    <table style={{ fontSize: "12px", borderCollapse: "collapse", width: "100%", marginBottom: "10px" }}>
      <tbody>
        {rows.map(({ label, value }) => (
          <tr key={label}>
            <td style={{ padding: "2px 12px 2px 0", fontWeight: 600, color: "#555", whiteSpace: "nowrap", verticalAlign: "top", width: "1%" }}>{label}</td>
            <td style={{ padding: "2px 0", color: "#333", verticalAlign: "top" }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GymFocusChart({ session, raceProfile }: { session: TemplateSession; raceProfile: RaceProfileData }) {
  const allTags = session.tags ?? [];

  // Terrain-based tags: "Uphill on gravel", "Downhill on track", etc.
  const terrainTags = allTags.filter((t) => /^(uphill|downhill|flat) on /i.test(t));

  // Numbered segment tags: "Climb 1", "Climb 2", "Descent 1", etc.
  const numberedTags = allTags.filter((t) => /^(Climb|Descent) \d+$/i.test(t));

  if (terrainTags.length === 0 && numberedTags.length === 0) return null;
  if (!raceProfile.elevation || raceProfile.elevation.points.length < 2) return null;

  const sustainedSegments = raceProfile.sustainedSegments ?? [];

  // Terrain-based matching (existing behaviour)
  const terrainMatchingSegs = sustainedSegments.filter((seg) =>
    terrainTags.some((tag) => {
      const lower = tag.toLowerCase();
      const dir = lower.startsWith("uphill") ? "climb" : lower.startsWith("downhill") ? "descent" : "flat";
      if (seg.type !== dir) return false;
      const terrainLabel = tag.replace(/^(uphill|downhill|flat) on /i, "");
      const labels = terrainLabelsForRange(raceProfile.positionedTerrain, seg.startKm, seg.endKm);
      return labels.some((l) => l.toLowerCase() === terrainLabel.toLowerCase());
    })
  );

  // Numbered segment matching: "Climb 1" → 1st climb by km order, "Descent 2" → 2nd descent, etc.
  const climbs = [...sustainedSegments].filter((s) => s.type === "climb").sort((a, b) => a.startKm - b.startKm);
  const descents = [...sustainedSegments].filter((s) => s.type === "descent").sort((a, b) => a.startKm - b.startKm);
  const numberedMatchingSegs = numberedTags.flatMap((tag) => {
    const m = tag.match(/^(Climb|Descent) (\d+)$/i);
    if (!m) return [];
    const list = m[1].toLowerCase() === "climb" ? climbs : descents;
    const idx = parseInt(m[2], 10) - 1;
    return idx >= 0 && idx < list.length ? [list[idx]] : [];
  });

  // Deduplicate (in case a terrain tag and a numbered tag resolve to the same segment)
  const seen = new Set<string>();
  const matchingSegs = [...terrainMatchingSegs, ...numberedMatchingSegs].filter((seg) => {
    const key = `${seg.startKm}-${seg.endKm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (matchingSegs.length === 0) return null;

  // Build subtitle label
  const labelParts: string[] = [];
  if (terrainTags.length > 0) labelParts.push(terrainTags.join(" / "));
  if (numberedTags.length > 0) labelParts.push(numberedTags.join(", "));
  const subtitleLabel = labelParts.join(" · ");

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

  const hasOnlyDescents = matchingSegs.every((s) => s.type === "descent");
  const highlightFill = hasOnlyDescents ? "#1565c022" : "#bf360c22";
  const highlightStroke = hasOnlyDescents ? "#1565c0" : "#bf360c";

  return (
    <div style={{ marginTop: "8px", marginBottom: "4px" }}>
      <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Course segment — {subtitleLabel}
      </p>
      <svg width={W} height={H} style={{ display: "block", borderRadius: "4px", overflow: "hidden" }}>
        {/* Background elevation area */}
        <path d={areaD} fill="#1e3a1e10" />
        <polyline points={linePts} fill="none" stroke="#1e3a1e60" strokeWidth="1" strokeLinejoin="round" />
        {/* Highlighted segments */}
        {matchingSegs.map((seg, i) => {
          const segFill = seg.type === "descent" ? "#1565c022" : "#bf360c22";
          const segStroke = seg.type === "descent" ? "#1565c0" : "#bf360c";
          return (
            <rect key={i}
              x={xS(seg.startKm)} y={padT}
              width={Math.max(xS(seg.endKm) - xS(seg.startKm), 2)} height={cH}
              fill={segFill}
              stroke={segStroke} strokeWidth="0.5"
            />
          );
        })}
        {/* Highlighted segment elevation line */}
        {matchingSegs.map((seg, i) => {
          const segPts = pts.filter((p) => p.distanceKm >= seg.startKm && p.distanceKm <= seg.endKm);
          if (segPts.length < 2) return null;
          const segStroke = seg.type === "descent" ? "#1565c0" : "#bf360c";
          return (
            <polyline key={`line-${i}`}
              points={segPts.map((p) => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ")}
              fill="none" stroke={segStroke} strokeWidth="2" strokeLinejoin="round"
            />
          );
        })}
        {/* Segment labels */}
        {matchingSegs.map((seg, i) => {
          const segStroke = seg.type === "descent" ? "#1565c0" : "#bf360c";
          return (
            <text key={`lbl-${i}`}
              x={xS((seg.startKm + seg.endKm) / 2)} y={padT + 12}
              textAnchor="middle" fontSize="8" fontWeight="700" fill={segStroke}>
              {seg.type === "climb" ? "▲" : "▼"} {Math.abs(Math.round(seg.totalElevationM))}m · {seg.avgGradient.toFixed(1)}%
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function racePaceForSession(
  session: TemplateSession,
  raceProfile: RaceProfileData | undefined,
  pacingSections: PacingSection[]
): { pace: string; kmRange: string } | null {
  if (pacingSections.length === 0) return null;
  const allTags = session.tags ?? [];
  const terrainTags = allTags.filter((t) => /^(uphill|downhill|flat) on /i.test(t));
  const numberedTags = allTags.filter((t) => /^(Climb|Descent) \d+$/i.test(t));
  if (terrainTags.length === 0 && numberedTags.length === 0) return null;

  // Resolve tagged sustained segments (same logic as GymFocusChart)
  const sustainedSegments = raceProfile?.sustainedSegments ?? [];
  const climbs = [...sustainedSegments].filter((s) => s.type === "climb").sort((a, b) => a.startKm - b.startKm);
  const descents = [...sustainedSegments].filter((s) => s.type === "descent").sort((a, b) => a.startKm - b.startKm);

  const resolvedSegs = [
    ...sustainedSegments.filter((seg) =>
      terrainTags.some((tag) => {
        const lower = tag.toLowerCase();
        const dir = lower.startsWith("uphill") ? "climb" : lower.startsWith("downhill") ? "descent" : "flat";
        if (seg.type !== dir) return false;
        const terrainLabel = tag.replace(/^(uphill|downhill|flat) on /i, "");
        const labels = terrainLabelsForRange(raceProfile?.positionedTerrain ?? null, seg.startKm, seg.endKm);
        return labels.some((l) => l.toLowerCase() === terrainLabel.toLowerCase());
      })
    ),
    ...numberedTags.flatMap((tag) => {
      const m = tag.match(/^(Climb|Descent) (\d+)$/i);
      if (!m) return [];
      const list = m[1].toLowerCase() === "climb" ? climbs : descents;
      const idx = parseInt(m[2], 10) - 1;
      return idx >= 0 && idx < list.length ? [list[idx]] : [];
    }),
  ];

  if (resolvedSegs.length === 0) return null;

  // Find the pacing section with the most overlap against any resolved segment
  let best: { pace: string; kmRange: string } | null = null;
  let bestOverlap = 0;
  for (const seg of resolvedSegs) {
    for (const ps of pacingSections) {
      const overlap = Math.max(0, Math.min(seg.endKm, ps.end_km) - Math.max(seg.startKm, ps.start_km));
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        const pace = ps.wind_adjusted_pace || ps.target_pace;
        best = { pace, kmRange: `${ps.start_km.toFixed(1)}–${ps.end_km.toFixed(1)} km` };
      }
    }
  }
  return best;
}

function SessionCard({ session, raceProfile, pacingSections = [], pairedWarmUp, exercisePageMap }: { session: TemplateSession; raceProfile?: RaceProfileData; pacingSections?: PacingSection[]; pairedWarmUp?: TemplateSession; exercisePageMap?: Map<string, number> }) {
  const isGym = session.type === "Gym";
  const isRest = session.type === "Rest";
  const col = SESSION_COLOURS[session.type] ?? SESSION_COLOURS.default;

  const racePace = !isGym ? racePaceForSession(session, raceProfile, pacingSections) : null;
  const showPaceBlock = !isGym && !!(session.target_pace || racePace);

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
          {/* Suppress intensity when a pace block is shown — pace is more specific */}
          {!showPaceBlock && session.intensity && <span style={{ textTransform: "capitalize" }}>{session.intensity}</span>}
        </div>
      </div>

      {raceProfile && <GymFocusChart session={session} raceProfile={raceProfile} />}

      {!isRest && <SessionSpecs session={session} hideIntensity={showPaceBlock} />}

      {/* Pace context block for running sessions */}
      {showPaceBlock && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "6px 0 4px", borderTop: "1px solid #f0f0f0", paddingTop: "8px" }}>
          {/* Target Pace — always shown so absence is obvious */}
          <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "5px 12px", fontSize: "11px", background: "#fafafa" }}>
            <div style={{ color: "#888", marginBottom: "1px" }}>Target Pace</div>
            <div style={{ fontWeight: 700, color: "#1e3a1e", fontSize: "14px" }}>
              {session.target_pace ? `${session.target_pace}/km` : "—"}
            </div>
          </div>
          {racePace && (
            <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "5px 12px", fontSize: "11px", background: "#fafafa" }}>
              <div style={{ color: "#888", marginBottom: "1px" }}>Race Pace · {racePace.kmRange}</div>
              {/* racePace.pace already contains "/km" from the pacing table */}
              <div style={{ fontWeight: 700, color: "#c0392b", fontSize: "14px" }}>{racePace.pace}</div>
            </div>
          )}
        </div>
      )}

      {isGym && session.description && (
        <p style={descriptionText}>{session.description}</p>
      )}

      {session.reason && (
        <div style={reasonBox}>
          <span style={reasonLabel}>Why this session:</span>
          <span style={reasonText}>{session.reason}</span>
        </div>
      )}

      {isGym && pairedWarmUp && (
        <div style={{ marginBottom: "12px", borderTop: "1px solid #e5e5e5", paddingTop: "10px" }}>
          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Warm-Up — {pairedWarmUp.name}
            {pairedWarmUp.duration_minutes ? ` · ${pairedWarmUp.duration_minutes} min` : ""}
          </p>
          <MobilityStretchList session={pairedWarmUp} />
        </div>
      )}

      {isGym && <ExerciseTable exercises={session.program_template_session_exercises} pageMap={exercisePageMap} />}
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


function formatSectionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRaceTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  const adjustedMins = mins === 60 ? 0 : mins;
  const adjustedHours = mins === 60 ? hours + 1 : hours;
  return `${adjustedHours}h ${adjustedMins.toString().padStart(2, "0")}m`;
}

function RaceStrategyPage({
  template,
  profile,
  pacingSections,
}: {
  template: ProgramTemplate;
  profile: RaceProfileData | null;
  pacingSections: PacingSection[];
}) {
  // Compute estimated total race time
  const totalMinutes = pacingSections.reduce((sum, sec) => {
    const pace = parsePaceToMinutes(sec.target_pace);
    if (pace === null) return sum;
    return sum + (sec.end_km - sec.start_km) * pace;
  }, 0);

  const notable = ((profile?.sustainedSegments ?? []) as RaceSustainedSeg[])
    .filter((s) => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);

  const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "5px 8px",
    borderBottom: "2px solid #1e3a1e", color: "#1e3a1e",
    fontWeight: 600, background: "#f9f9f9", fontSize: "11px",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 8px", borderBottom: "1px solid #eee", fontSize: "12px",
  };

  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Race Strategy</h2>

      {/* Estimated finish time */}
      {totalMinutes > 0 && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 18px", fontSize: "11px", background: "#fafafa" }}>
            <div style={{ color: "#888", marginBottom: "2px" }}>Estimated finish time</div>
            <div style={{ fontWeight: 700, color: "#1e3a1e", fontSize: "20px" }}>{formatRaceTime(totalMinutes)}</div>
            <div style={{ color: "#aaa", fontSize: "10px", marginTop: "2px" }}>based on target pacing strategy</div>
          </div>
          <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
            <div style={{ color: "#888", marginBottom: "2px" }}>Total distance</div>
            <div style={{ fontWeight: 700, color: "#111", fontSize: "13px" }}>
              {pacingSections[pacingSections.length - 1].end_km.toFixed(1)} km
            </div>
          </div>
          <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
            <div style={{ color: "#888", marginBottom: "2px" }}>Sections</div>
            <div style={{ fontWeight: 700, color: "#111", fontSize: "13px" }}>{pacingSections.length}</div>
          </div>
        </div>
      )}

      {/* Elevation + pace chart */}
      {profile?.elevation && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Elevation &amp; Target Pace
          </p>
          <ElevationChart profile={profile.elevation} notable={notable} pacingSections={pacingSections} />
        </div>
      )}

      {/* Route map with wind overlay */}
      {template.gpx_data && template.gpx_data.length > 1 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Route &amp; Wind Conditions
            {template.wind_data && template.wind_data.length > 0 && " — arrows show wind direction · colour shows headwind risk"}
          </p>
          <RouteMap route={template.gpx_data} windSections={template.wind_data ?? undefined} />
        </div>
      )}

      {/* Pacing sections table */}
      <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Section Pacing Plan
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr>
            {["#", "km Range", "Distance", "Section Type", "Target Pace", "Wind Adj. Pace", "Pace Band", "Section Time"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pacingSections.map((sec, i) => {
            const dist = sec.end_km - sec.start_km;
            const pace = parsePaceToMinutes(sec.target_pace);
            const sectionMins = pace !== null ? dist * pace : null;
            const rowBg = i % 2 === 0 ? "#fff" : "#fafafa";
            return (
              <tr key={i} style={{ background: rowBg }}>
                <td style={{ ...tdStyle, color: "#888" }}>{i + 1}</td>
                <td style={tdStyle}>{sec.start_km.toFixed(1)}–{sec.end_km.toFixed(1)} km</td>
                <td style={tdStyle}>{dist.toFixed(1)} km</td>
                <td style={tdStyle}>{formatSectionType(sec.section_type)}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: "#c0392b" }}>{sec.target_pace}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: sec.wind_adjusted_pace && sec.wind_adjusted_pace !== sec.target_pace ? "#1565c0" : "#c0392b" }}>
                  {sec.wind_adjusted_pace || sec.target_pace}
                </td>
                <td style={{ ...tdStyle, color: "#777" }}>{sec.pace_band}</td>
                <td style={{ ...tdStyle, color: "#555" }}>
                  {sectionMins !== null ? formatRaceTime(sectionMins) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WeekDetailPage({ week, template, raceProfile, exercisePageMap }: { week: TemplateWeek; template: ProgramTemplate; raceProfile?: RaceProfileData; exercisePageMap?: Map<string, number> }) {
  const sessions = sortSessions(week.program_template_sessions);
  const pacingSections = template.pacing_data ?? [];

  // Map day_label → mobility session (sessions that have mobility_sessions data)
  const mobilityByDay = new Map<string, TemplateSession>();
  for (const session of sessions) {
    if (session.mobility_sessions && session.day_label) {
      mobilityByDay.set(session.day_label, session);
    }
  }

  // Find which mobility sessions get merged into their paired gym session
  const mergedMobilityIds = new Set<string>();
  for (const session of sessions) {
    if (session.type === "Gym" && session.day_label && mobilityByDay.has(session.day_label)) {
      mergedMobilityIds.add(mobilityByDay.get(session.day_label)!.id);
    }
  }

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

      {sessions
        .filter((s) => !mergedMobilityIds.has(s.id))
        .map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            raceProfile={raceProfile}
            pacingSections={pacingSections}
            exercisePageMap={exercisePageMap}
            pairedWarmUp={
              session.type === "Gym" && session.day_label
                ? mobilityByDay.get(session.day_label)
                : undefined
            }
          />
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

  const exercisePageMap = useMemo(() => {
    if (!template) return new Map<string, number>();
    const uniqueNames = new Set<string>();
    for (const week of template.program_template_weeks) {
      for (const session of week.program_template_sessions) {
        for (const ex of session.program_template_session_exercises) {
          if (ex.exercises?.name) uniqueNames.add(ex.exercises.name);
        }
      }
    }
    const sorted = [...uniqueNames].sort((a, b) => a.localeCompare(b));
    const map = new Map<string, number>();
    sorted.forEach((name, i) => map.set(name, i + 2)); // cover = page 1
    return map;
  }, [template]);

  useEffect(() => {
    if (!templateId) return;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("program_templates")
        .select(`
          id, name, description, event_goal, discipline, plan_length_weeks, training_days_per_week, race_id, pacing_data, gpx_data, wind_data,
          program_template_weeks (
            id, week_number, focus, notes,
            program_template_sessions (
              id, day_label, sort_order, type, name, description,
              duration, duration_minutes, intensity, is_key_session, reason, tags, target_pace,
              distance_km, num_sets, set_duration_minutes, interval_reps, interval_duration, interval_distance_meters, rest_seconds, gradient_percent, perceived_effort,
              strides, warmup_minutes, cooldown_minutes, elevation_gain_meters, pack_weight_kg, terrain,
              mobility_sessions (
                mobility_session_stretches (
                  sort_order, hold_duration_seconds,
                  stretches ( name, steps )
                )
              ),
              program_template_session_exercises (
                id, sort_order, sets, reps, duration_seconds, notes,
                exercises ( name, description, steps, primary_muscles, secondary_muscles )
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
        <button type="button" onClick={() => router.push(`/admin/export-programme/${templateId}`)} style={backBtn}>Back</button>
      </main>
    );
  }

  const weeks = template.program_template_weeks;

  return (
    <>
      {/* ── Screen toolbar (hidden on print) ── */}
      <div style={toolbar} className="no-print">
        <button type="button" onClick={() => router.push(`/admin/export-programme/${templateId}`)} style={backBtn}>
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
        {raceProfile && <RaceSummaryPage template={template} profile={raceProfile} />}

        {/* Weekly mileage chart */}
        <WeeklyMileagePage weeks={weeks} template={template} />

        {/* Race strategy page */}
        {template.pacing_data && template.pacing_data.length > 0 && (
          <RaceStrategyPage template={template} profile={raceProfile} pacingSections={template.pacing_data} />
        )}

        {/* Detail — one week per A4 page */}
        {weeks.map((week) => (
          <WeekDetailPage key={`det-${week.id}`} week={week} template={template} raceProfile={raceProfile ?? undefined} exercisePageMap={exercisePageMap} />
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

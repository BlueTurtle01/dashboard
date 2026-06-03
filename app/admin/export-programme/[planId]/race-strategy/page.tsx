"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ── Types ── */
type PacingSection = {
  start_km: number;
  end_km: number;
  section_type: string;
  target_pace: string;
  pace_band: string;
  wind_adjusted_pace: string;
};

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

type RaceSustainedSeg = {
  startKm: number; endKm: number; lengthKm: number;
  avgGradient: number; totalElevationM: number;
  type: "climb" | "descent" | "flat";
};

type RaceProfileData = {
  elevation: RaceElevProfile | null;
  sustainedSegments: RaceSustainedSeg[] | null;
};

type ProgramTemplate = {
  id: string;
  name: string;
  event_goal: string | null;
  discipline: string | null;
  race_id: string | null;
  pacing_data: PacingSection[] | null;
  gpx_data: RoutePoint[] | null;
  wind_data: WindSection[] | null;
};

/* ── Parse helpers ── */
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
    const elevs = points.map((pt) => pt.elevationM);
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

function parseRaceSustainedSegs(value: string | null | undefined): RaceSustainedSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const segs = p.flatMap((s): RaceSustainedSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (
        typeof r.startKm !== "number" || typeof r.endKm !== "number" ||
        typeof r.lengthKm !== "number" || typeof r.avgGradient !== "number" ||
        typeof r.totalElevationM !== "number" ||
        (r.type !== "climb" && r.type !== "descent" && r.type !== "flat")
      ) return [];
      return [{ startKm: r.startKm, endKm: r.endKm, lengthKm: r.lengthKm,
        avgGradient: r.avgGradient, totalElevationM: r.totalElevationM,
        type: r.type as RaceSustainedSeg["type"] }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

/* ── Pace helpers ── */
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

/* ── Wind effort model ── */

/**
 * Distance-weighted average headwind m/s across a pacing section,
 * using the stored wind_data segments.
 */
function avgHeadwindForSection(section: PacingSection, windData: WindSection[]): number {
  const sectionLen = section.end_km - section.start_km;
  if (sectionLen <= 0 || windData.length === 0) return 0;
  let weightedSum = 0;
  let covered = 0;
  for (const w of windData) {
    const overlap = Math.max(0, Math.min(section.end_km, w.end_km) - Math.max(section.start_km, w.start_km));
    if (overlap > 0) {
      weightedSum += overlap * w.median_headwind_ms;
      covered += overlap;
    }
  }
  return covered > 0 ? weightedSum / covered : 0;
}

/**
 * Energy cost multiplier based on Pugh (1971) aerodynamic drag model.
 * Positive headwindMs = headwind (slows the runner); negative = tailwind (assists).
 * Coefficients (0.018·v + 0.002·v²) calibrated for trail/marathon speeds (2.5–3.5 m/s).
 * Capped at ±20% / 4.5% respectively to avoid unrealistic values.
 */
function effortWindMultiplier(headwindMs: number): number {
  if (headwindMs <= 0) {
    const benefit = Math.min(0.0045 * Math.abs(headwindMs), 0.045);
    return Math.max(0.955, 1 - benefit);
  }
  const penalty = 0.018 * headwindMs + 0.002 * headwindMs ** 2;
  return Math.min(1.20, 1 + penalty);
}

/**
 * Returns the effort-equivalent pace string (M:SS/km) for a section.
 * This is the pace at which the runner expends the same energy per km
 * as running the target pace in calm conditions, accounting for wind drag.
 */
function computeEffortPace(section: PacingSection, windData: WindSection[]): string | null {
  const targetMin = parsePaceToMinutes(section.target_pace);
  if (targetMin === null) return null;
  const headwind = avgHeadwindForSection(section, windData);
  const multiplier = effortWindMultiplier(headwind);
  const adjustedMin = targetMin * multiplier;
  const mins = Math.floor(adjustedMin);
  const secsRaw = Math.round((adjustedMin - mins) * 60);
  const secs = secsRaw === 60 ? 0 : secsRaw;
  const m = secsRaw === 60 ? mins + 1 : mins;
  return `${m}:${secs.toString().padStart(2, "0")}/km`;
}

/* ── ElevationChart ── */
function downsamplePoints(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

function ElevationChart({
  profile, notable, pacingSections,
}: {
  profile: RaceElevProfile;
  notable: RaceSustainedSeg[];
  pacingSections?: PacingSection[];
}) {
  const W = 698; const H = 200;
  const padL = 46; const padB = 22; const padT = 16;
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
  const areaD =
    `M${xS(first.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} ` +
    pts.map((p) => `L${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ") +
    ` L${xS(last.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} Z`;

  const yStep = elevRange / 4;
  const yTicks = Array.from({ length: 5 }, (_, i) => profile.minElevationM + i * yStep);
  const xInterval = Math.ceil(profile.totalDistanceKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= profile.totalDistanceKm; k += xInterval) xTicks.push(k);

  const paceParsed = (pacingSections ?? []).map((s) => parsePaceToMinutes(s.target_pace));
  const validPaces = paceParsed.filter((v): v is number => v !== null);
  const paceMinRaw = validPaces.length > 0 ? Math.min(...validPaces) : 0;
  const paceMaxRaw = validPaces.length > 0 ? Math.max(...validPaces) : 30;
  const paceMin = paceMinRaw - 0.5;
  const paceMax = paceMaxRaw + 0.5;
  const paceRange = Math.max(paceMax - paceMin, 1);
  const paceY = (minPerKm: number) => padT + cH - ((minPerKm - paceMin) / paceRange) * cH;

  const tickInterval = (paceMaxRaw - paceMinRaw) > 5 ? 2 : 1;
  const firstTick = Math.ceil(paceMin / tickInterval) * tickInterval;
  const paceTicks: number[] = [];
  for (let p = firstTick; p <= paceMax + 0.01; p += tickInterval) paceTicks.push(p);

  const axisX = padL + cW;

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((elev, i) => (
        <line key={i} x1={padL} y1={yS(elev)} x2={axisX} y2={yS(elev)} stroke="#eee" strokeWidth="1" />
      ))}
      {notable.map((seg, i) => (
        <rect key={i} x={xS(seg.startKm)} y={padT}
          width={Math.max(xS(seg.endKm) - xS(seg.startKm), 1)} height={cH}
          fill={seg.type === "climb" ? "#ff980018" : "#1565c018"} />
      ))}
      <path d={areaD} fill="#1e3a1e18" />
      <polyline points={linePts} fill="none" stroke="#1e3a1e" strokeWidth="1.5" strokeLinejoin="round" />
      {hasPacing && (
        <g>
          {(pacingSections ?? []).map((sec, i) => {
            const pace = paceParsed[i];
            if (pace === null) return null;
            const x1 = xS(sec.start_km); const x2 = xS(sec.end_km);
            const y = paceY(pace);
            const nextPace = i + 1 < paceParsed.length ? paceParsed[i + 1] : null;
            return (
              <g key={`pace-${i}`}>
                <line x1={x1} y1={y} x2={x2} y2={y} stroke="#c0392b" strokeWidth="1.5" strokeLinecap="square" />
                {nextPace !== null && (
                  <line x1={x2} y1={y} x2={x2} y2={paceY(nextPace)} stroke="#c0392b" strokeWidth="1.5" />
                )}
              </g>
            );
          })}
        </g>
      )}
      {yTicks.map((elev, i) => (
        <text key={i} x={padL - 5} y={yS(elev) + 3.5} textAnchor="end" fontSize="8.5" fill="#888">
          {Math.round(elev)}
        </text>
      ))}
      {xTicks.map((km, i) => (
        <g key={i}>
          <line x1={xS(km)} y1={padT + cH} x2={xS(km)} y2={padT + cH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS(km)} y={padT + cH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text>
        </g>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + cH} x2={axisX} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      {hasPacing && (
        <g>
          <line x1={axisX} y1={padT} x2={axisX} y2={padT + cH} stroke="#c0392b" strokeWidth="1" opacity="0.4" />
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
          <text
            x={axisX + 46} y={padT + cH / 2}
            textAnchor="middle" fontSize="7.5" fill="#c0392b" opacity="0.7"
            transform={`rotate(-90,${axisX + 46},${padT + cH / 2})`}
          >
            pace min/km
          </text>
        </g>
      )}
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

/* ── RouteMap (OSM tiles + Mercator projection) ── */
function osmMercX(lon: number): number { return (lon + 180) / 360; }
function osmMercY(lat: number): number {
  const s = Math.sin(lat * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
function osmTileX(lon: number, z: number): number { return Math.floor(osmMercX(lon) * Math.pow(2, z)); }
function osmTileY(lat: number, z: number): number { return Math.floor(osmMercY(lat) * Math.pow(2, z)); }
function windRiskColor(label: string): string {
  if (label.includes("high")) return "#c62828";
  if (label.includes("moderate")) return "#e65100";
  return "#546e7a";
}

type OsmTile = { url: string; x: number; y: number; w: number; h: number };

function RouteMap({
  route, windSections, width = 694, height = 240,
}: {
  route: RoutePoint[];
  windSections?: WindSection[];
  width?: number;
  height?: number;
}) {
  const clipId = useRef(`mc-${Math.random().toString(36).slice(2, 7)}`).current;
  const [tiles, setTiles] = useState<OsmTile[]>([]);

  useEffect(() => {
    if (route.length < 2) { setTiles([]); return; }
    const lats = route.map(p => p.lat); const lons = route.map(p => p.lon);
    const r0lat = Math.min(...lats); const r1lat = Math.max(...lats);
    const r0lon = Math.min(...lons); const r1lon = Math.max(...lons);
    const dlat = r1lat - r0lat; const dlon = r1lon - r0lon;
    const minLat = r0lat - dlat * 0.15 - 0.005; const maxLat = r1lat + dlat * 0.15 + 0.005;
    const minLon = r0lon - dlon * 0.15 - 0.008; const maxLon = r1lon + dlon * 0.15 + 0.008;
    let z = 14;
    for (; z >= 8; z--) {
      const nx = osmTileX(maxLon, z) - osmTileX(minLon, z) + 1;
      const ny = osmTileY(minLat, z) - osmTileY(maxLat, z) + 1;
      if (nx * ny <= 16) break;
    }
    const zPow = Math.pow(2, z);
    const mx0 = osmMercX(minLon); const mx1 = osmMercX(maxLon);
    const my0 = osmMercY(maxLat); const my1 = osmMercY(minLat);
    const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
    const ox = (width - (mx1 - mx0) * sc) / 2; const oy = (height - (my1 - my0) * sc) / 2;
    const tsz = 1 / zPow;
    const tx0 = osmTileX(minLon, z); const tx1 = osmTileX(maxLon, z);
    const ty0 = osmTileY(maxLat, z); const ty1 = osmTileY(minLat, z);
    const newTiles: OsmTile[] = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        newTiles.push({
          url: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`,
          x: ox + (tx * tsz - mx0) * sc, y: oy + (ty * tsz - my0) * sc,
          w: tsz * sc, h: tsz * sc,
        });
      }
    }
    setTiles(newTiles);
  }, [route, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  if (route.length < 2) return null;
  const lats = route.map(p => p.lat); const lons = route.map(p => p.lon);
  const r0lat = Math.min(...lats); const r1lat = Math.max(...lats);
  const r0lon = Math.min(...lons); const r1lon = Math.max(...lons);
  const dlat = r1lat - r0lat; const dlon = r1lon - r0lon;
  const minLat = r0lat - dlat * 0.15 - 0.005; const maxLat = r1lat + dlat * 0.15 + 0.005;
  const minLon = r0lon - dlon * 0.15 - 0.008; const maxLon = r1lon + dlon * 0.15 + 0.008;
  const mx0 = osmMercX(minLon); const mx1 = osmMercX(maxLon);
  const my0 = osmMercY(maxLat); const my1 = osmMercY(minLat);
  const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
  const ox = (width - (mx1 - mx0) * sc) / 2; const oy = (height - (my1 - my0) * sc) / 2;
  const toX = (lon: number) => ox + (osmMercX(lon) - mx0) * sc;
  const toY = (lat: number) => oy + (osmMercY(lat) - my0) * sc;
  const pts = route.map(p => `${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(" ");
  const startPt = route[0]; const endPt = route[route.length - 1];
  const maxWindSpeed = Math.max(...(windSections ?? []).map(s => s.median_wind_speed_ms), 1);
  const hasWind = (windSections?.length ?? 0) > 0;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={width} height={height} /></clipPath></defs>
      <rect x={0} y={0} width={width} height={height} fill="#e8ede8" />
      <g clipPath={`url(#${clipId})`}>
        {tiles.map((t, i) => (
          <image key={i} href={t.url}
            x={t.x.toFixed(1)} y={t.y.toFixed(1)}
            width={t.w.toFixed(1)} height={t.h.toFixed(1)}
            preserveAspectRatio="none" />
        ))}
        <polyline points={pts} fill="none" stroke="white" strokeWidth="5"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        <polyline points={pts} fill="none" stroke="#1a3a1a" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {(windSections ?? []).map((sec, i) => {
          const cx = toX(sec.mid_lon); const cy = toY(sec.mid_lat);
          const color = windRiskColor(sec.wind_risk_label);
          const isSignificant = sec.wind_risk_label !== "low_wind_risk";
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
                fill={color} />
            </g>
          );
        })}
        <circle cx={toX(startPt.lon)} cy={toY(startPt.lat)} r={6} fill="#2e7d32" stroke="white" strokeWidth="2" />
        <text x={toX(startPt.lon) + 9} y={toY(startPt.lat) + 4} fontSize="9.5" fontWeight="700"
          stroke="white" strokeWidth="3" paintOrder="stroke" fill="#2e7d32">Start</text>
        <circle cx={toX(endPt.lon)} cy={toY(endPt.lat)} r={6} fill="#c62828" stroke="white" strokeWidth="2" />
        <text x={toX(endPt.lon) + 9} y={toY(endPt.lat) + 4} fontSize="9.5" fontWeight="700"
          stroke="white" strokeWidth="3" paintOrder="stroke" fill="#c62828">Finish</text>
      </g>
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
      <rect x={width - 158} y={height - 14} width={154} height={12} fill="white" opacity={0.75} />
      <text x={width - 4} y={height - 4} textAnchor="end" fontSize="7.5" fill="#555">
        © OpenStreetMap contributors
      </text>
    </svg>
  );
}

/* ── Shared print components ── */
function PrintHeader({ template }: { template: ProgramTemplate }) {
  return (
    <div style={printHeader}>
      <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
      <div style={headerRight}>
        <div style={headerRaceName}>{template.name}</div>
        {template.event_goal && <div style={headerAthleteName}>{template.event_goal}</div>}
      </div>
    </div>
  );
}

function PageNumber({ n }: { n: number }) {
  return (
    <div style={{ position: "absolute", bottom: "24px", right: "48px", fontSize: "11px", color: "#aaa" }}>
      {n}
    </div>
  );
}

/* ── Main page ── */
export default function RaceStrategyExportPage() {
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
        .select("id, name, event_goal, discipline, race_id, pacing_data, gpx_data, wind_data")
        .eq("id", templateId)
        .single();

      if (err || !data) {
        setError(err?.message ?? "Template not found.");
        setLoading(false);
        return;
      }

      const t = data as unknown as ProgramTemplate;
      setTemplate(t);

      if (t.race_id) {
        const { data: metaRows } = await supabase
          .from("races_meta")
          .select("meta_key, meta_value")
          .eq("race_id", t.race_id)
          .in("meta_key", ["elevation_profile", "sustained_segments"]);

        const meta: Record<string, string> = {};
        for (const row of (metaRows ?? []) as { meta_key: string; meta_value: string }[]) {
          meta[row.meta_key] = row.meta_value;
        }
        setRaceProfile({
          elevation: parseRaceElevProfile(meta.elevation_profile),
          sustainedSegments: parseRaceSustainedSegs(meta.sustained_segments),
        });
      }

      setLoading(false);
    }
    void load();
  }, [templateId]);

  if (loading) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#666" }}>Loading...</p>
      </main>
    );
  }

  if (error || !template) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#b00020" }}>{error || "Template not found."}</p>
        <button type="button" onClick={() => router.push(`/admin/export-programme/${templateId}`)} style={backBtn}>
          Back
        </button>
      </main>
    );
  }

  const pacingSections = template.pacing_data ?? [];
  const windData = template.wind_data ?? [];
  const hasWindData = windData.length > 0;

  const notable = ((raceProfile?.sustainedSegments ?? []) as RaceSustainedSeg[])
    .filter((s) => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);

  const totalMinutes = pacingSections.reduce((sum, sec) => {
    const pace = parsePaceToMinutes(sec.target_pace);
    if (pace === null) return sum;
    return sum + (sec.end_km - sec.start_km) * pace;
  }, 0);

  const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "5px 8px",
    borderBottom: "2px solid #1e3a1e", color: "#1e3a1e",
    fontWeight: 600, background: "#f9f9f9", fontSize: "11px",
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 8px", borderBottom: "1px solid #eee", fontSize: "12px",
  };

  const totalEffortMinutes = hasWindData ? pacingSections.reduce((sum, sec) => {
    const ep = computeEffortPace(sec, windData);
    const epMin = ep ? parsePaceToMinutes(ep) : null;
    if (epMin === null) return sum;
    return sum + (sec.end_km - sec.start_km) * epMin;
  }, 0) : 0;

  const tableHeaders = [
    "#", "km Range", "Distance", "Section Type",
    "Target Pace",
    ...(hasWindData ? ["Effort Pace"] : []),
    "Pace Band", "Section Time",
  ];

  return (
    <>
      {/* Screen toolbar */}
      <div style={toolbar} className="no-print">
        <button type="button" onClick={() => router.push(`/admin/export-programme/${templateId}`)} style={backBtn}>
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "16px" }}>{template.name}</strong>
          {template.event_goal && (
            <span style={{ color: "#666", marginLeft: "10px", fontSize: "14px" }}>· {template.event_goal}</span>
          )}
        </div>
        <button type="button" onClick={() => window.print()} style={printBtn}>
          Export to PDF
        </button>
      </div>

      {/* A4 canvas */}
      <div style={canvas}>
        <div style={a4Page}>
          <PrintHeader template={template} />
          <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Race Strategy</h2>

          {pacingSections.length === 0 ? (
            <p style={{ color: "#888", fontSize: "14px", marginTop: "40px", textAlign: "center" }}>
              No pacing data has been added to this programme yet.
            </p>
          ) : (
            <>
              {/* Summary stats */}
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
              {raceProfile?.elevation && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Elevation &amp; Target Pace
                  </p>
                  <ElevationChart
                    profile={raceProfile.elevation}
                    notable={notable}
                    pacingSections={pacingSections}
                  />
                </div>
              )}

              {/* Route map */}
              {template.gpx_data && template.gpx_data.length > 1 && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Route &amp; Wind Conditions
                    {hasWindData && " — arrows show wind direction · colour shows headwind risk"}
                  </p>
                  <RouteMap route={template.gpx_data} windSections={template.wind_data ?? undefined} />
                </div>
              )}

              {/* Pacing table */}
              <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Section Pacing Plan
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr>
                    {tableHeaders.map((h) => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pacingSections.map((sec, i) => {
                    const dist = sec.end_km - sec.start_km;
                    const targetPaceMin = parsePaceToMinutes(sec.target_pace);
                    const sectionMins = targetPaceMin !== null ? dist * targetPaceMin : null;
                    const rowBg = i % 2 === 0 ? "#fff" : "#fafafa";

                    const effortPace = hasWindData ? computeEffortPace(sec, windData) : null;
                    const effortPaceMin = effortPace ? parsePaceToMinutes(effortPace) : null;
                    const effortColor =
                      effortPaceMin !== null && targetPaceMin !== null
                        ? effortPaceMin > targetPaceMin + 0.01 ? "#e65100"
                        : effortPaceMin < targetPaceMin - 0.01 ? "#2e7d32"
                        : "#777"
                        : "#777";

                    return (
                      <tr key={i} style={{ background: rowBg }}>
                        <td style={{ ...tdStyle, color: "#888" }}>{i + 1}</td>
                        <td style={tdStyle}>{sec.start_km.toFixed(1)}–{sec.end_km.toFixed(1)} km</td>
                        <td style={tdStyle}>{dist.toFixed(1)} km</td>
                        <td style={tdStyle}>{formatSectionType(sec.section_type)}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#c0392b" }}>{sec.target_pace}</td>
                        {hasWindData && (
                          <td style={{ ...tdStyle, fontWeight: 600, color: effortColor }}>
                            {effortPace ?? "—"}
                          </td>
                        )}
                        <td style={{ ...tdStyle, color: "#777" }}>{sec.pace_band}</td>
                        <td style={{ ...tdStyle, color: "#555" }}>
                          {sectionMins !== null ? formatRaceTime(sectionMins) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f9f9f9", borderTop: "2px solid #1e3a1e" }}>
                    <td
                      colSpan={tableHeaders.length - 1}
                      style={{ ...tdStyle, fontWeight: 600, color: "#1e3a1e", textAlign: "right", paddingRight: "16px", borderBottom: "none" }}
                    >
                      Total — Target Pace
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#1e3a1e", borderBottom: "none" }}>
                      {totalMinutes > 0 ? formatRaceTime(totalMinutes) : "—"}
                    </td>
                  </tr>
                  {hasWindData && totalEffortMinutes > 0 && (
                    <tr style={{ background: "#fff8f5" }}>
                      <td
                        colSpan={tableHeaders.length - 1}
                        style={{ ...tdStyle, fontWeight: 600, color: "#e65100", textAlign: "right", paddingRight: "16px", borderBottom: "none" }}
                      >
                        Total — Effort Pace
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: "#e65100", borderBottom: "none" }}>
                        {formatRaceTime(totalEffortMinutes)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>

              {/* Citations */}
              {hasWindData && (
                <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid #eee" }}>
                  <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Aerodynamic model — Effort Pace
                  </p>
                  <p style={{ margin: "0 0 3px", fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>
                    Pugh, L.G.C.E. (1971). The influence of wind resistance in running and walking and the mechanical efficiency of work against horizontal or vertical forces. <em>Journal of Physiology</em>, 213(2), 255–276.
                  </p>
                  <p style={{ margin: 0, fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>
                    Davies, C.T.M. (1980). Effects of wind assistance and resistance on the forward motion of a runner. <em>Journal of Applied Physiology</em>, 48(4), 702–709.
                  </p>
                </div>
              )}
            </>
          )}

          <PageNumber n={1} />
        </div>
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

/* ── Styles ── */
const a4Page: React.CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  background: "#fff",
  padding: "40px 48px",
  boxSizing: "border-box",
  position: "relative",
};

const canvas: React.CSSProperties = {
  background: "#6b6b6b",
  padding: "32px 0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
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

const logoImg: React.CSSProperties = { height: "36px", width: "auto", objectFit: "contain" };
const headerRight: React.CSSProperties = { textAlign: "right" };
const headerRaceName: React.CSSProperties = { fontSize: "13px", fontWeight: 700, color: "#1e3a1e" };
const headerAthleteName: React.CSSProperties = { fontSize: "11px", color: "#666", marginTop: "2px" };

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

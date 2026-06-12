"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeatherDayRecord } from "@/lib/race-analysis/open-meteo";
import type { FieldStatsResponse } from "@/app/api/race-intelligence/field-stats/route";

/* â”€â”€ API types â”€â”€ */
interface RaceMeta {
  id: string; name: string; slug: string | null;
  total_distance_km: number; total_ascent_m: number; total_descent_m: number;
  race_date: string | null; weather_lat: number | null; weather_lon: number | null;
}
interface TerrainSection {
  start_km: number; end_km: number; distance_km: number;
  section_type: string; terrain: string; avg_gradient_percent: number;
  ascent_m: number; descent_m: number; flat_equivalent_km: number;
}
interface WindSection {
  section_id: number; start_km: number; end_km: number;
  mid_lat: number; mid_lon: number; bearing_deg: number;
  median_wind_speed_ms: number; median_headwind_ms: number; median_crosswind_ms: number;
  wind_risk_label: string;
}
interface AidStation {
  km: number; name?: string;
  water: boolean; food: boolean; medic: boolean; toilets: boolean; dropBags: boolean;
}
interface OverviewResponse {
  race: RaceMeta;
  route: { lat: number; lon: number }[];
  wind_sections: WindSection[] | null;
  elevation_profile: string | null;
  sustained_segments: string | null;
  terrain_sections: TerrainSection[];
  aid_stations: AidStation[] | null;
}
interface RaceOption {
  race_id: string; race_name: string;
  total_distance_km: number | null; total_ascent_m: number | null;
}

/* â”€â”€ Elevation types â”€â”€ */
interface ElevationPoint { distanceKm: number; elevationM: number; }
interface RaceElevProfile {
  points: ElevationPoint[]; totalDistanceKm: number;
  minElevationM: number; maxElevationM: number;
}
interface RaceSustainedSeg {
  startKm: number; endKm: number; totalElevationM: number;
  type: "climb" | "descent" | "flat";
}

/* â”€â”€ Parsers â”€â”€ */
function parseElevProfile(value: string | null): RaceElevProfile | null {
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
    const elevs = points.map(p => p.elevationM);
    return { points, totalDistanceKm: p.totalDistanceKm, minElevationM: Math.min(...elevs), maxElevationM: Math.max(...elevs) };
  } catch { return null; }
}

function parseSustainedSegs(value: string | null): RaceSustainedSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    return p.flatMap((s): RaceSustainedSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.startKm !== "number" || typeof r.endKm !== "number" || typeof r.totalElevationM !== "number" ||
          (r.type !== "climb" && r.type !== "descent" && r.type !== "flat")) return [];
      return [{ startKm: r.startKm, endKm: r.endKm, totalElevationM: r.totalElevationM, type: r.type as RaceSustainedSeg["type"] }];
    });
  } catch { return null; }
}

/* â”€â”€ Helpers â”€â”€ */
function formatRaceTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const adjM = m === 60 ? 0 : m;
  const adjH = m === 60 ? h + 1 : h;
  return `${adjH}h ${adjM.toString().padStart(2, "0")}m`;
}

function formatSecs(s: number): string { return formatRaceTime(s / 60); }

/* â”€â”€ OSM helpers â”€â”€ */
function osmMercX(lon: number) { return (lon + 180) / 360; }
function osmMercY(lat: number) { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
function osmTileX(lon: number, z: number) { return Math.floor(osmMercX(lon) * Math.pow(2, z)); }
function osmTileY(lat: number, z: number) { return Math.floor(osmMercY(lat) * Math.pow(2, z)); }
function windRiskColor(label: string) { if (label.includes("high")) return "#c62828"; if (label.includes("moderate")) return "#e65100"; return "#546e7a"; }
type OsmTile = { url: string; x: number; y: number; w: number; h: number };

function downsample(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COMPONENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

function ElevationChart({ profile, notable, aidStations }: { profile: RaceElevProfile; notable: RaceSustainedSeg[]; aidStations?: AidStation[] }) {
  const W = 698, H = 170, padL = 46, padB = 22, padT = 16, padR = 8;
  const cW = W - padL - padR, cH = H - padT - padB;
  const elevRange = Math.max(profile.maxElevationM - profile.minElevationM, 50);
  const xS = (km: number) => padL + (km / profile.totalDistanceKm) * cW;
  const yS = (m: number)  => padT + cH - ((m - profile.minElevationM) / elevRange) * cH;
  const pts = downsample(profile.points, 300);
  const linePts = pts.map(p => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ");
  const first = pts[0], last = pts[pts.length - 1];
  const areaD =
    `M${xS(first.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} ` +
    pts.map(p => `L${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ") +
    ` L${xS(last.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} Z`;
  const yTicks = Array.from({ length: 5 }, (_, i) => profile.minElevationM + (elevRange / 4) * i);
  const xInt = Math.ceil(profile.totalDistanceKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= profile.totalDistanceKm; k += xInt) xTicks.push(k);
  const elevAtKm = (km: number): number => {
    const sorted = [...pts].sort((a, b) => a.distanceKm - b.distanceKm);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].distanceKm >= km) {
        const prev = sorted[i - 1], curr = sorted[i];
        const t = prev.distanceKm === curr.distanceKm ? 0 : (km - prev.distanceKm) / (curr.distanceKm - prev.distanceKm);
        return prev.elevationM + t * (curr.elevationM - prev.elevationM);
      }
    }
    return sorted[sorted.length - 1]?.elevationM ?? 0;
  };
  void notable;
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((elev, i) => <line key={i} x1={padL} y1={yS(elev)} x2={W - padR} y2={yS(elev)} stroke="#eee" strokeWidth="1" />)}
      <path d={areaD} fill="#1e3a1e18" />
      <polyline points={linePts} fill="none" stroke="#1e3a1e" strokeWidth="1.5" strokeLinejoin="round" />
      {yTicks.map((elev, i) => <text key={i} x={padL - 5} y={yS(elev) + 3.5} textAnchor="end" fontSize="8.5" fill="#888">{Math.round(elev)}</text>)}
      {xTicks.map((km, i) => (
        <g key={i}>
          <line x1={xS(km)} y1={padT + cH} x2={xS(km)} y2={padT + cH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS(km)} y={padT + cH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text>
        </g>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + cH} x2={W - padR} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      {(aidStations ?? []).filter(s => s.km >= 0 && s.km <= profile.totalDistanceKm).map((s, i) => {
        const x = xS(s.km), y = yS(elevAtKm(s.km));
        return (
          <g key={i}>
            <line x1={x} y1={y + 4} x2={x} y2={padT + cH} stroke="#2e7d32" strokeWidth="0.8" strokeDasharray="2,2" />
            <circle cx={x} cy={y} r={3} fill="#2e7d32" stroke="#fff" strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

function RouteMap({ route, windSections, width = 694, height = 200 }: {
  route: { lat: number; lon: number }[];
  windSections?: WindSection[];
  width?: number; height?: number;
}) {
  const clipId = useRef(`mc-${Math.random().toString(36).slice(2, 7)}`).current;
  const [tiles, setTiles] = useState<OsmTile[]>([]);
  useEffect(() => {
    if (route.length < 2) { setTiles([]); return; }
    const lats = route.map(p => p.lat), lons = route.map(p => p.lon);
    const r0lat = Math.min(...lats), r1lat = Math.max(...lats), r0lon = Math.min(...lons), r1lon = Math.max(...lons);
    const dlat = r1lat - r0lat, dlon = r1lon - r0lon;
    const minLat = r0lat - dlat * 0.4 - 0.02, maxLat = r1lat + dlat * 0.4 + 0.02;
    const minLon = r0lon - dlon * 0.4 - 0.03, maxLon = r1lon + dlon * 0.4 + 0.03;
    let z = 12;
    for (; z >= 7; z--) { if ((osmTileX(maxLon, z) - osmTileX(minLon, z) + 1) * (osmTileY(minLat, z) - osmTileY(maxLat, z) + 1) <= 16) break; }
    const zPow = Math.pow(2, z);
    const mx0 = osmMercX(minLon), mx1 = osmMercX(maxLon), my0 = osmMercY(maxLat), my1 = osmMercY(minLat);
    const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
    const ox = (width - (mx1 - mx0) * sc) / 2, oy = (height - (my1 - my0) * sc) / 2;
    const tsz = 1 / zPow;
    const tx0 = osmTileX(minLon, z), tx1 = osmTileX(maxLon, z), ty0 = osmTileY(maxLat, z), ty1 = osmTileY(minLat, z);
    const newTiles: OsmTile[] = [];
    for (let tx = tx0; tx <= tx1; tx++)
      for (let ty = ty0; ty <= ty1; ty++)
        newTiles.push({ url: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, x: ox + (tx * tsz - mx0) * sc, y: oy + (ty * tsz - my0) * sc, w: tsz * sc, h: tsz * sc });
    setTiles(newTiles);
  }, [route, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  if (route.length < 2) return null;
  const lats = route.map(p => p.lat), lons = route.map(p => p.lon);
  const r0lat = Math.min(...lats), r1lat = Math.max(...lats), r0lon = Math.min(...lons), r1lon = Math.max(...lons);
  const dlat = r1lat - r0lat, dlon = r1lon - r0lon;
  const minLat = r0lat - dlat * 0.4 - 0.02, maxLat = r1lat + dlat * 0.4 + 0.02;
  const minLon = r0lon - dlon * 0.4 - 0.03, maxLon = r1lon + dlon * 0.4 + 0.03;
  const mx0 = osmMercX(minLon), mx1 = osmMercX(maxLon), my0 = osmMercY(maxLat), my1 = osmMercY(minLat);
  const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
  const ox = (width - (mx1 - mx0) * sc) / 2, oy = (height - (my1 - my0) * sc) / 2;
  const toX = (lon: number) => ox + (osmMercX(lon) - mx0) * sc;
  const toY = (lat: number) => oy + (osmMercY(lat) - my0) * sc;
  const pts = route.map(p => `${toX(p.lon).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(" ");
  const startPt = route[0], endPt = route[route.length - 1];
  const maxWS = Math.max(...(windSections ?? []).map(s => s.median_wind_speed_ms), 1);
  const hasWind = (windSections?.length ?? 0) > 0;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs><clipPath id={clipId}><rect x={0} y={0} width={width} height={height} /></clipPath></defs>
      <rect x={0} y={0} width={width} height={height} fill="#e8ede8" />
      <g clipPath={`url(#${clipId})`}>
        {tiles.map((t, i) => <image key={i} href={t.url} x={t.x.toFixed(1)} y={t.y.toFixed(1)} width={t.w.toFixed(1)} height={t.h.toFixed(1)} preserveAspectRatio="none" />)}
        <polyline points={pts} fill="none" stroke="white" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        <polyline points={pts} fill="none" stroke="#1a3a1a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {(windSections ?? []).map((sec, i) => {
          const cx = toX(sec.mid_lon), cy = toY(sec.mid_lat), color = windRiskColor(sec.wind_risk_label);
          const isSig = sec.wind_risk_label !== "low_wind_risk";
          const windDir = sec.median_headwind_ms >= 0 ? (sec.bearing_deg + 180) % 360 : sec.bearing_deg % 360;
          const arrowLen = 9 + (sec.median_wind_speed_ms / maxWS) * 7;
          return (
            <g key={i} transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${windDir.toFixed(1)})`} opacity={isSig ? 1 : 0.5}>
              <circle r={arrowLen + 5} fill={color} opacity={0.22} />
              <line x1={0} y1={arrowLen * 0.65} x2={0} y2={-arrowLen * 0.65} stroke={color} strokeWidth={isSig ? 2.5 : 1.5} strokeLinecap="round" />
              <polygon points={`0,${-(arrowLen + 4)} ${-arrowLen * 0.4},${-arrowLen * 0.35} ${arrowLen * 0.4},${-arrowLen * 0.35}`} fill={color} />
            </g>
          );
        })}
        <circle cx={toX(startPt.lon)} cy={toY(startPt.lat)} r={6} fill="#2e7d32" stroke="white" strokeWidth="2" />
        <text x={toX(startPt.lon) + 9} y={toY(startPt.lat) + 4} fontSize="9.5" fontWeight="700" stroke="white" strokeWidth="3" paintOrder="stroke" fill="#2e7d32">Start</text>
        <circle cx={toX(endPt.lon)} cy={toY(endPt.lat)} r={6} fill="#c62828" stroke="white" strokeWidth="2" />
        <text x={toX(endPt.lon) + 9} y={toY(endPt.lat) + 4} fontSize="9.5" fontWeight="700" stroke="white" strokeWidth="3" paintOrder="stroke" fill="#c62828">Finish</text>
      </g>
      {hasWind && (
        <g transform={`translate(${width - 134},${height - 58})`}>
          <rect x={0} y={0} width={130} height={54} fill="white" opacity={0.92} rx={3} />
          <text x={7} y={13} fontSize="8" fontWeight="700" fill="#333">Wind risk</text>
          {[{ color: "#546e7a", label: "Low" }, { color: "#e65100", label: "Moderate headwind" }, { color: "#c62828", label: "High headwind" }].map(({ color, label }, li) => (
            <g key={li} transform={`translate(7,${21 + li * 11})`}>
              <circle r={4} fill={color} />
              <text x={11} y={4} fontSize="7.5" fill="#444">{label}</text>
            </g>
          ))}
        </g>
      )}
      <rect x={width - 158} y={height - 14} width={154} height={12} fill="white" opacity={0.75} />
      <text x={width - 4} y={height - 4} textAnchor="end" fontSize="7.5" fill="#555">Â© OpenStreetMap contributors</text>
    </svg>
  );
}

function TerrainBar({ label, km, pct, color }: { label: string; km: number; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
        <span style={{ color: "#444", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#888" }}>{km.toFixed(1)} km Â· {pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: "8px", background: "#eee", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "4px" }} />
      </div>
    </div>
  );
}

const GRAD_BANDS = [
  { label: "â‰¥15% â†‘",   min:  15, max:  999, color: "#c0392b", textColor: "#c0392b" },
  { label: "8â€“15% â†‘",  min:   8, max:   15, color: "#e65100", textColor: "#e65100" },
  { label: "3â€“8% â†‘",   min:   3, max:    8, color: "#ff9800", textColor: "#bf6e00" },
  { label: "0â€“3%",     min:  -3, max:    3, color: "#78909c", textColor: "#546e7a" },
  { label: "3â€“8% â†“",   min:  -8, max:   -3, color: "#64b5f6", textColor: "#1565c0" },
  { label: "8â€“15% â†“",  min: -15, max:   -8, color: "#1976d2", textColor: "#1565c0" },
  { label: "â‰¥15% â†“",   min: -999, max: -15, color: "#0d47a1", textColor: "#0d47a1" },
];

function gradientBandColor(grad: number): string {
  for (const b of GRAD_BANDS) { if (grad >= b.min && grad < b.max) return b.color; }
  return "#78909c";
}

function GradientHistogram({ sections }: { sections: TerrainSection[] }) {
  const W = 698, H = 160, padL = 48, padR = 12, padT = 16, padB = 30;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const bands = GRAD_BANDS.map(b => ({
    ...b,
    km: sections.filter(s => s.avg_gradient_percent >= b.min && s.avg_gradient_percent < b.max).reduce((sum, s) => sum + s.distance_km, 0),
  }));
  const maxKm = Math.max(...bands.map(b => b.km), 0.1);
  const barW = (chartW / bands.length) - 4;
  const yS = (km: number) => padT + chartH - (km / maxKm) * chartH;
  const yTick = maxKm <= 5 ? 1 : maxKm <= 15 ? 5 : maxKm <= 30 ? 10 : 20;
  const yTicks: number[] = [];
  for (let t = 0; t <= maxKm + yTick; t += yTick) yTicks.push(t);
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)} stroke="#eee" strokeWidth="1" />
          <text x={padL - 5} y={yS(t) + 3.5} textAnchor="end" fontSize="8" fill="#888">{t}km</text>
        </g>
      ))}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      {bands.map((b, i) => {
        const x = padL + i * (chartW / bands.length) + 2;
        const bH = Math.max((b.km / maxKm) * chartH, b.km > 0 ? 2 : 0);
        const y = padT + chartH - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} fill={b.color} rx={2} opacity={0.85} />
            {b.km > 0.1 && <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="7.5" fill={b.textColor} fontWeight="600">{b.km.toFixed(1)}</text>}
            <text x={x + barW / 2} y={padT + chartH + 11} textAnchor="middle" fontSize="8" fill="#555">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TerrainStrip({ sections, totalKm }: { sections: TerrainSection[]; totalKm: number }) {
  const W = 698, H = 52;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {sections.map((s, i) => {
        const x = (s.start_km / totalKm) * W;
        const w = Math.max(((s.end_km - s.start_km) / totalKm) * W, 1);
        return <rect key={i} x={x} y={0} width={w} height={H} fill={gradientBandColor(s.avg_gradient_percent)} opacity={0.8} />;
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const km = f * totalKm;
        const x = f * W;
        return (
          <g key={i}>
            <line x1={x} y1={H - 8} x2={x} y2={H} stroke="white" strokeWidth="1.5" opacity="0.7" />
            <text x={x} y={H + 10} textAnchor="middle" fontSize="8" fill="#555">{Math.round(km)}km</text>
          </g>
        );
      })}
    </svg>
  );
}

function EffortProfileChart({ sections, totalKm }: { sections: TerrainSection[]; totalKm: number }) {
  const W = 698, H = 160, padL = 44, padR = 8, padT = 14, padB = 22;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const ratios = sections.map(s => s.distance_km > 0 ? s.flat_equivalent_km / s.distance_km : 1);
  const maxRatio = Math.max(...ratios, 1.1);
  const yS = (r: number) => padT + chartH - ((r / maxRatio) * chartH);
  const baseline = yS(1.0);
  const yTicks = [0.5, 1.0, 1.5, 2.0, 2.5].filter(t => t <= maxRatio + 0.1);
  const xInt = Math.ceil(totalKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= totalKm; k += xInt) xTicks.push(k);
  return (
    <svg width={W} height={H + 12} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)} stroke={t === 1.0 ? "#ccc" : "#eee"} strokeWidth={t === 1.0 ? 1.5 : 1} />
          <text x={padL - 5} y={yS(t) + 3.5} textAnchor="end" fontSize="8" fill={t === 1.0 ? "#666" : "#aaa"}>{t.toFixed(1)}Ã—</text>
        </g>
      ))}
      <text x={W - padR - 2} y={baseline - 3} textAnchor="end" fontSize="7" fill="#555" opacity="0.7">flat effort</text>
      {sections.map((s, i) => {
        const ratio = ratios[i];
        const x = padL + (s.start_km / totalKm) * chartW;
        const w = Math.max((s.distance_km / totalKm) * chartW - 1, 1);
        const barTop = ratio >= 1 ? yS(ratio) : baseline;
        const barH = Math.abs(yS(ratio) - baseline);
        const color = ratio >= 1.5 ? "#c0392b" : ratio >= 1.2 ? "#e65100" : ratio >= 0.9 ? "#78909c" : ratio >= 0.7 ? "#64b5f6" : "#1976d2";
        return <rect key={i} x={x} y={barTop} width={w} height={Math.max(barH, 1)} fill={color} opacity={0.8} rx={1} />;
      })}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      {xTicks.map((km, i) => (
        <g key={i}>
          <line x1={padL + (km / totalKm) * chartW} y1={padT + chartH} x2={padL + (km / totalKm) * chartW} y2={padT + chartH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={padL + (km / totalKm) * chartW} y={padT + chartH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text>
        </g>
      ))}
    </svg>
  );
}

function DemandCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderLeft: `3px solid ${accent}`, borderRadius: "6px", padding: "10px 12px" }}>
      <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</p>
      <div style={{ fontSize: "11px", color: "#444", lineHeight: "1.5" }}>{children}</div>
    </div>
  );
}

/* Full-width finish time histogram with percentile markers */
function FinishTimeHistogram({ distribution, aggregate }: {
  distribution: { min_min: number; max_min: number; count: number }[];
  aggregate: NonNullable<FieldStatsResponse["aggregate"]>;
}) {
  if (distribution.length === 0) return null;
  const W = 698, H = 180, padL = 42, padR = 12, padT = 20, padB = 40;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const maxCount = Math.max(...distribution.map(b => b.count), 1);
  const barW = Math.max(chartW / distribution.length - 1.5, 2);
  const yS = (c: number) => padT + chartH - (c / maxCount) * chartH;
  const minMin = distribution[0].min_min;
  const maxMin = distribution[distribution.length - 1].max_min;
  const xS = (mins: number) => padL + ((mins - minMin) / Math.max(maxMin - minMin, 1)) * chartW;

  const pctileMarkers = [
    { secs: aggregate.p10_seconds, label: "P10", color: "#1976d2" },
    { secs: aggregate.p25_seconds, label: "P25", color: "#2e7d32" },
    { secs: aggregate.median_seconds, label: "Median", color: "#1e3a1e" },
    { secs: aggregate.p75_seconds, label: "P75", color: "#e65100" },
    { secs: aggregate.p90_seconds, label: "P90", color: "#c62828" },
  ].filter((m): m is { secs: number; label: string; color: string } => m.secs != null && m.secs > 0);

  const yTick = maxCount <= 20 ? 5 : maxCount <= 100 ? 20 : maxCount <= 500 ? 100 : 200;
  const yTicks: number[] = [];
  for (let t = 0; t <= maxCount + yTick; t += yTick) yTicks.push(t);

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Y gridlines */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)} stroke="#eee" strokeWidth="1" />
          <text x={padL - 4} y={yS(t) + 3.5} textAnchor="end" fontSize="7.5" fill="#888">{t}</text>
        </g>
      ))}
      {/* Bars */}
      {distribution.map((b, i) => {
        const bH = Math.max((b.count / maxCount) * chartH, b.count > 0 ? 2 : 0);
        const x = padL + i * (chartW / distribution.length) + 1;
        return <rect key={i} x={x} y={yS(b.count)} width={barW} height={bH} fill="#1e3a1e" opacity={0.5} rx={1} />;
      })}
      {/* Percentile lines */}
      {pctileMarkers.map((m, i) => {
        const x = xS(m.secs / 60);
        return (
          <g key={i}>
            <line x1={x} y1={padT} x2={x} y2={padT + chartH} stroke={m.color} strokeWidth="1.5" strokeDasharray="4,2" opacity="0.85" />
            <text x={x} y={padT - 5} textAnchor="middle" fontSize="7.5" fill={m.color} fontWeight="600">{m.label}</text>
            <text x={x} y={padT + chartH + 11} textAnchor="middle" fontSize="7" fill={m.color}>{formatSecs(m.secs)}</text>
          </g>
        );
      })}
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      {/* X time ticks */}
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const mins = minMin + f * (maxMin - minMin);
        const x = padL + f * chartW;
        return (
          <g key={i}>
            <line x1={x} y1={padT + chartH} x2={x} y2={padT + chartH + 4} stroke="#ccc" strokeWidth="1" />
            <text x={x} y={padT + chartH + 24} textAnchor="middle" fontSize="7.5" fill="#666">{formatRaceTime(mins)}</text>
          </g>
        );
      })}
      <text x={W / 2} y={H} textAnchor="middle" fontSize="7.5" fill="#aaa">finish time</text>
      <text x={10} y={padT + chartH / 2} textAnchor="middle" fontSize="7.5" fill="#bbb" transform={`rotate(-90,10,${padT + chartH / 2})`}>finishers</text>
    </svg>
  );
}

/* Race search combobox */
function RaceSearchCombobox({ races, selectedId, onSelect }: {
  races: RaceOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selectedRace = races.find(r => r.race_id === selectedId);
  const [query, setQuery] = useState(selectedRace?.race_name ?? "");
  const [open, setOpen]   = useState(false);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedRace && !query) setQuery(selectedRace.race_name);
  }, [selectedRace]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (races.length > 0 && inputRef.current && inputRef.current === document.activeElement) setOpen(true);
  }, [races.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? races.filter(r => r.race_name.toLowerCase().includes(q)) : races;
    return list.slice(0, 30);
  }, [query, races]);

  function select(race: RaceOption) { setQuery(race.race_name); setOpen(false); onSelect(race.race_id); }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={races.length === 0 ? "Loading racesâ€¦" : "Search racesâ€¦"}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none", width: "280px" }}
      />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "320px", maxHeight: "320px", overflowY: "auto", marginTop: "4px" }}>
          {filtered.map(r => (
            <button
              key={r.race_id}
              type="button"
              onClick={() => select(r)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>{r.race_name}</div>
              {r.total_distance_km != null && (
                <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                  {r.total_distance_km.toFixed(1)} km Â· {Math.round(r.total_ascent_m ?? 0)}m â†‘
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STYLE CONSTANTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const a4Page: React.CSSProperties = { width: "794px", minHeight: "1123px", background: "#fff", padding: "40px 48px 52px", boxSizing: "border-box", position: "relative", marginBottom: "24px" };
const canvas: React.CSSProperties = { background: "#6b6b6b", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" };
const printHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #1e3a1e", paddingBottom: "12px", marginBottom: "18px" };
const sectionLabel: React.CSSProperties = { margin: "0 0 4px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px" };
const generateBtn: React.CSSProperties = { padding: "10px 24px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px" };
const printBtn: React.CSSProperties = { padding: "10px 20px", border: "1px solid #1e3a1e", borderRadius: "8px", background: "#fff", color: "#1e3a1e", fontWeight: 600, cursor: "pointer", fontSize: "14px" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "4px 8px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "10px" };
const tdStyle: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #eee", fontSize: "11px" };

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN PAGE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function RaceIntelligencePage() {
  const supabase = createClient();

  const [races, setRaces]               = useState<RaceOption[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState("");
  const [noRaceProfile, setNoRaceProfile] = useState(false);
  const [result, setResult]             = useState<OverviewResponse | null>(null);
  const [fieldStats, setFieldStats]     = useState<FieldStatsResponse | null>(null);
  const [fieldStatsLoading, setFieldStatsLoading] = useState(false);
  const [weather, setWeather]           = useState<WeatherDayRecord[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Derived â€” elevation + segments
  const elevProfile   = result ? parseElevProfile(result.elevation_profile) : null;
  const sustainedSegs = result ? parseSustainedSegs(result.sustained_segments) : null;
  const notable       = (sustainedSegs ?? [])
    .filter(s => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);
  const windData = result?.wind_sections ?? [];

  // Surface composition
  const surfaceSummary = useMemo(() => {
    const secs = result?.terrain_sections ?? [];
    const map: Record<string, number> = {};
    for (const s of secs) { if (s.terrain) map[s.terrain] = (map[s.terrain] ?? 0) + s.distance_km; }
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return { entries: Object.entries(map).sort((a, b) => b[1] - a[1]), total };
  }, [result]);

  // Terrain composition (climb / flat / descent)
  const terrainSummary = useMemo(() => {
    const secs  = result?.terrain_sections ?? [];
    const total = secs.reduce((s, t) => s + t.distance_km, 0);
    const climbing   = secs.filter(s => s.section_type.includes("climb")).reduce((s, t) => s + t.distance_km, 0);
    const descending = secs.filter(s => s.section_type.includes("descent")).reduce((s, t) => s + t.distance_km, 0);
    return { total, climbing, descending, flat: Math.max(0, total - climbing - descending) };
  }, [result]);

  // Course demand computations
  const secs          = result?.terrain_sections ?? [];
  const totalKm       = result?.race.total_distance_km ?? 0;
  const totalAscentM  = result?.race.total_ascent_m  ?? 0;
  const totalDescentM = result?.race.total_descent_m ?? 0;
  // Floor each section at 1.0Ã— â€” descents don't reduce race difficulty in practice
  const totalFlatEq   = secs.reduce((s, t) => s + Math.max(t.flat_equivalent_km, t.distance_km), 0);
  const effortRatio   = totalKm > 0 ? totalFlatEq / totalKm : 1;
  const effortRatioLabel = effortRatio < 1.03 ? "essentially flat"
    : effortRatio < 1.08 ? "gently rolling"
    : effortRatio < 1.15 ? "moderately hilly"
    : effortRatio < 1.25 ? "significantly hilly"
    : effortRatio < 1.40 ? "very hilly"
    : effortRatio < 1.60 ? "mountainous"
    : "extreme vertical";

  const steepestClimb = useMemo(() =>
    [...secs].filter(s => s.section_type.includes("climb") && s.distance_km >= 1)
      .sort((a, b) => b.avg_gradient_percent - a.avg_gradient_percent)[0] ?? null,
    [secs]
  );
  const steepestDescent = useMemo(() =>
    [...secs].filter(s => s.section_type.includes("descent") && s.distance_km >= 1)
      .sort((a, b) => a.avg_gradient_percent - b.avg_gradient_percent)[0] ?? null,
    [secs]
  );

  const sectionRatios  = secs.filter(s => s.distance_km > 0).map(s => s.flat_equivalent_km / s.distance_km);
  const meanRatio      = sectionRatios.length > 0 ? sectionRatios.reduce((a, b) => a + b, 0) / sectionRatios.length : 1;
  const stdRatio       = sectionRatios.length > 1
    ? Math.sqrt(sectionRatios.reduce((s, r) => s + (r - meanRatio) ** 2, 0) / sectionRatios.length)
    : 0;
  const cvRatio        = meanRatio > 0 ? stdRatio / meanRatio : 0;
  const complexityLabel = cvRatio > 0.45 ? "High" : cvRatio > 0.25 ? "Moderate" : "Low";
  const complexityColor = cvRatio > 0.45 ? "#c0392b" : cvRatio > 0.25 ? "#e65100" : "#2e7d32";

  const technicalKm  = secs.filter(s => s.terrain === "technical_trail" || s.terrain === "fell").reduce((a, s) => a + s.distance_km, 0);
  const technicalPct = totalKm > 0 ? Math.round((technicalKm / totalKm) * 100) : 0;

  const steepClimbKm   = secs.filter(s => s.avg_gradient_percent >= 8).reduce((a, s) => a + s.distance_km, 0);
  const steepDescentKm = secs.filter(s => s.avg_gradient_percent < -8).reduce((a, s) => a + s.distance_km, 0);
  const runnableKm     = secs.filter(s => s.avg_gradient_percent >= -3 && s.avg_gradient_percent < 3).reduce((a, s) => a + s.distance_km, 0);

  // Terrain Ã— gradient pairings â€” what the course actually asks of you
  const terrainPairings = useMemo(() => {
    const map = new Map<string, {
      section_type: string; terrain: string;
      total_km: number; ascent_m: number; descent_m: number; flat_equiv_km: number; gradients: number[];
    }>();
    for (const s of secs) {
      const key = `${s.section_type}|${s.terrain}`;
      if (!map.has(key)) map.set(key, { section_type: s.section_type, terrain: s.terrain, total_km: 0, ascent_m: 0, descent_m: 0, flat_equiv_km: 0, gradients: [] });
      const p = map.get(key)!;
      p.total_km += s.distance_km;
      p.ascent_m += s.ascent_m;
      p.descent_m += s.descent_m;
      p.flat_equiv_km += s.flat_equivalent_km;
      p.gradients.push(s.avg_gradient_percent);
    }
    const grand = [...map.values()].reduce((s, p) => s + p.total_km, 0);
    return [...map.values()]
      .sort((a, b) => b.total_km - a.total_km)
      .map(p => ({
        ...p,
        pct:          grand > 0 ? (p.total_km / grand) * 100 : 0,
        avg_gradient: p.gradients.reduce((a, b) => a + b, 0) / Math.max(p.gradients.length, 1),
        effort_ratio: p.total_km > 0 ? p.flat_equiv_km / p.total_km : 1,
      }));
  }, [secs]);

  // Aid station largest gap
  const aidGaps = useMemo(() => {
    const sorted = (result?.aid_stations ?? []).sort((a, b) => a.km - b.km);
    if (sorted.length === 0) return null;
    let maxGap = sorted[0].km;
    for (let i = 1; i < sorted.length; i++) maxGap = Math.max(maxGap, sorted[i].km - sorted[i - 1].km);
    const afterLast = totalKm > 0 ? totalKm - sorted[sorted.length - 1].km : 0;
    return Math.max(maxGap, afterLast);
  }, [result, totalKm]);

  // Cumulative ascent at halfway (for loading label)
  const loadingLabel = useMemo(() => {
    if (!elevProfile || totalAscentM <= 0) return null;
    const halfKm = totalKm / 2;
    const pts = downsample(elevProfile.points, 400);
    let running = 0, halfwayAscent = 0;
    for (let i = 1; i < pts.length; i++) {
      const diff = pts[i].elevationM - pts[i - 1].elevationM;
      if (diff > 0) running += diff;
      if (pts[i].distanceKm <= halfKm) halfwayAscent = running;
    }
    if (running <= 0) return null;
    const pct = halfwayAscent / running;
    return pct > 0.55 ? "Front-loaded" : pct < 0.45 ? "Back-loaded" : "Even";
  }, [elevProfile, totalKm, totalAscentM]);

  // Race date
  const raceDate      = result?.race.race_date ?? null;
  const raceDateLabel = raceDate ? new Date(raceDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

  // Weather averages
  const avgMaxTemp = weather.length > 0 ? weather.reduce((s, d) => s + (d.temp_max_c ?? 0), 0) / weather.length : null;
  const avgMinTemp = weather.length > 0 ? weather.reduce((s, d) => s + (d.temp_min_c ?? 0), 0) / weather.length : null;
  const avgPrecip  = weather.length > 0 ? weather.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0) / weather.length : null;
  const wetPct     = weather.length > 0 ? Math.round((weather.filter(d => (d.precipitation_mm ?? 0) > 1).length / weather.length) * 100) : null;

  // Load races on mount
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("races").select("id, name").order("name");
      if (!data) return;
      setRaces(data.map(r => ({ race_id: r.id as string, race_name: r.name as string, total_distance_km: null, total_ascent_m: null })));
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRaceSelect(id: string) {
    setSelectedRaceId(id);
    void (async () => {
      try {
        const { data } = await supabase.from("race_profiles").select("race_id, total_distance_km, total_ascent_m").eq("race_id", id).maybeSingle();
        if (!data) return;
        const d = data as { total_distance_km: number | null; total_ascent_m: number | null };
        setRaces(prev => prev.map(r => r.race_id === id ? { ...r, total_distance_km: d.total_distance_km ?? null, total_ascent_m: d.total_ascent_m ?? null } : r));
      } catch { /* optional */ }
    })();
  }

  async function handleGenerate() {
    if (!selectedRaceId) { setGenError("Please select a race."); return; }
    setGenerating(true);
    setGenError("");
    setNoRaceProfile(false);
    setResult(null);
    setFieldStats(null);
    setWeather([]);

    // Step 1: race overview (sequential â€” feeds downstream)
    let effectiveResult: OverviewResponse;
    try {
      const res  = await fetch("/api/race-readiness/overview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: selectedRaceId }),
      });
      const json = await res.json() as OverviewResponse & { error?: string };
      if (res.status === 404 || (!res.ok && json.error?.includes("No race profile"))) {
        const raceName = races.find(r => r.race_id === selectedRaceId)?.race_name ?? "Unknown race";
        setNoRaceProfile(true);
        effectiveResult = {
          race: { id: selectedRaceId, name: raceName, slug: null, total_distance_km: 0, total_ascent_m: 0, total_descent_m: 0, race_date: null, weather_lat: null, weather_lon: null },
          route: [], wind_sections: null, elevation_profile: null, sustained_segments: null, terrain_sections: [], aid_stations: null,
        };
      } else if (!res.ok || json.error) {
        setGenError(json.error ?? "Failed to load race overview.");
        setGenerating(false);
        return;
      } else {
        effectiveResult = json;
      }
    } catch {
      setGenError("Network error loading race overview.");
      setGenerating(false);
      return;
    }

    // Step 2: parallel â€” field stats, weather
    const effectiveDate = effectiveResult.race.race_date;
    const hasWeather = effectiveDate && effectiveResult.race.weather_lat !== null && effectiveResult.race.weather_lon !== null;

    setFieldStatsLoading(true);
    setWeatherLoading(!!hasWeather);

    const fieldStatsPromise: Promise<FieldStatsResponse | null> = fetch(
      `/api/race-intelligence/field-stats?race_id=${encodeURIComponent(selectedRaceId)}`
    ).then(r => r.ok ? r.json() as Promise<FieldStatsResponse> : null).catch(() => null);

    const weatherPromise: Promise<WeatherDayRecord[]> = hasWeather
      ? (() => {
          const [, monthStr, dayStr] = effectiveDate!.split("-");
          return fetch("/api/race-analysis/weather-history", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: effectiveResult.race.weather_lat, lon: effectiveResult.race.weather_lon, month: parseInt(monthStr, 10), day: parseInt(dayStr, 10) }),
          }).then(r => r.ok ? (r.json() as Promise<{ data: WeatherDayRecord[] }>).then(d => d.data ?? []) : []).catch(() => []);
        })()
      : Promise.resolve([]);

    const [fieldStatsData, weatherData] = await Promise.all([fieldStatsPromise, weatherPromise]);

    setResult(effectiveResult);
    setFieldStats(fieldStatsData);
    setWeather(weatherData);
    setFieldStatsLoading(false);
    setWeatherLoading(false);
    setGenerating(false);
  }

  function handleExportPdf() {
    window.print();
  }

  const SURFACE_COLORS: Record<string, string> = {
    road: "#78909c", trail: "#66bb6a", technical_trail: "#e65100",
    fell: "#a5d6a7", grass: "#81c784", pavement: "#90a4ae",
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f9f9f9" }}>
      {/* Config panel */}
      <div className="no-print" style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "24px 32px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Race</div>
          <RaceSearchCombobox races={races} selectedId={selectedRaceId} onSelect={handleRaceSelect} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating} style={generateBtn}>
            {generating ? "Loadingâ€¦" : "Generate Report"}
          </button>
          {genError && <span style={{ fontSize: "12px", color: "#b00020" }}>{genError}</span>}
        </div>
        {result && (
          <button type="button" onClick={handleExportPdf} style={printBtn}>
            Print / Save PDF
          </button>
        )}
      </div>

      {result && (
        <div style={canvas} className="race-strategy-canvas">
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              @page { margin: 15mm 20mm; }
              body { margin: 0; }
              .race-strategy-canvas { background: transparent !important; display: block !important; padding: 0 !important; gap: 0 !important; }
              .rr-page { width: auto !important; height: auto !important; min-height: 0 !important; overflow: visible !important; position: static !important; margin-bottom: 0 !important; padding: 40px 48px 40px !important; break-before: page !important; page-break-before: always !important; }
              .rr-page-first { break-before: auto !important; page-break-before: auto !important; }
              .no-print { display: none !important; }
            }
          `}} />

          {/* â”€â”€ Page 1: Race Overview â”€â”€ */}
          <div style={a4Page} className="rr-page rr-page-first">
            <div style={printHeader}>
              <div>
                <p style={{ ...sectionLabel, color: "#1e3a1e" }}>Tortoise Endurance</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>Race Intelligence Report</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#888" }}>
                  {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>

            <h1 style={{ margin: "0 0 4px", fontSize: "28px", fontWeight: 800, color: "#1e3a1e" }}>Race Intelligence</h1>
            <h2 style={{ margin: "0 0 24px", fontSize: "20px", fontWeight: 600, color: "#333" }}>{result.race.name}</h2>

            {noRaceProfile && (
              <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", fontSize: "12px", color: "#795548" }}>
                No GPX profile found for this race â€” course charts are unavailable. Field statistics and other data will still appear below.
              </div>
            )}

            {/* Key stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
              {[
                { label: "Distance", value: totalKm > 0 ? `${totalKm.toFixed(1)} km` : "â€”" },
                { label: "Ascent", value: totalAscentM > 0 ? `${Math.round(totalAscentM).toLocaleString()} m` : "â€”" },
                { label: "Descent", value: totalDescentM > 0 ? `${Math.round(totalDescentM).toLocaleString()} m` : "â€”" },
                { label: "Race date", value: raceDateLabel ?? "â€”" },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: "#f9f9f9", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "12px 14px" }}>
                  <p style={sectionLabel}>{label}</p>
                  <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1e3a1e" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Secondary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
              {[
                { label: "Flat-equiv.", value: totalKm > 0 ? `${totalFlatEq.toFixed(1)} km` : "â€”" },
                { label: "Effort ratio", value: totalKm > 0 ? `${effortRatio.toFixed(2)}Ã—` : "â€”", sub: totalKm > 0 ? effortRatioLabel : undefined },
                { label: "Complexity", value: totalKm > 0 ? complexityLabel : "â€”", color: totalKm > 0 ? complexityColor : "#aaa" },
                { label: "Race type", value: fieldStats?.aggregate?.cluster_label ?? (fieldStatsLoading ? "Loadingâ€¦" : "â€”") },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{ background: "#f9f9f9", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "12px 14px" }}>
                  <p style={sectionLabel}>{label}</p>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: color ?? "#333" }}>{value}</p>
                  {sub && <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#777" }}>{sub}</p>}
                </div>
              ))}
            </div>

            {/* Route map */}
            {result.route.length >= 2 && (
              <>
                <p style={sectionLabel}>Route</p>
                <RouteMap route={result.route} windSections={windData} width={694} height={380} />
              </>
            )}
          </div>

          {/* â”€â”€ Page 2: Elevation & Terrain â”€â”€ */}
          {(elevProfile || result.terrain_sections.length > 0) && (
            <div style={a4Page} className="rr-page">
              <div style={printHeader}>
                <p style={{ ...sectionLabel, color: "#1e3a1e", margin: 0 }}>Elevation &amp; Terrain</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{result.race.name}</p>
              </div>

              {elevProfile && (
                <>
                  <p style={sectionLabel}>Elevation Profile</p>
                  <div style={{ marginBottom: "20px" }}>
                    <ElevationChart profile={elevProfile} notable={notable} aidStations={result.aid_stations ?? []} />
                    <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "10px", color: "#888" }}>
                      <span>â— Aid station</span>
                      {loadingLabel && <span style={{ fontWeight: 600, color: "#555" }}>Ascent loading: {loadingLabel}</span>}
                    </div>
                  </div>
                </>
              )}

              {result.terrain_sections.length > 0 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                    {/* Gradient composition */}
                    <div>
                      <p style={sectionLabel}>Gradient Composition</p>
                      {terrainSummary.total > 0 && (
                        <>
                          <TerrainBar label="Climbing" km={terrainSummary.climbing} pct={(terrainSummary.climbing / terrainSummary.total) * 100} color="#e65100" />
                          <TerrainBar label="Flat / rolling" km={terrainSummary.flat} pct={(terrainSummary.flat / terrainSummary.total) * 100} color="#78909c" />
                          <TerrainBar label="Descending" km={terrainSummary.descending} pct={(terrainSummary.descending / terrainSummary.total) * 100} color="#1976d2" />
                        </>
                      )}
                    </div>
                    {/* Surface composition */}
                    <div>
                      <p style={sectionLabel}>Surface Composition</p>
                      {surfaceSummary.entries.map(([terrain, km]) => (
                        <TerrainBar
                          key={terrain}
                          label={terrain.replaceAll("_", " ")}
                          km={km}
                          pct={surfaceSummary.total > 0 ? (km / surfaceSummary.total) * 100 : 0}
                          color={SURFACE_COLORS[terrain] ?? "#90a4ae"}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* â”€â”€ Page 3: Course Demands â”€â”€ */}
          {result.terrain_sections.length > 0 && (
            <div style={a4Page} className="rr-page">
              <div style={printHeader}>
                <p style={{ ...sectionLabel, color: "#1e3a1e", margin: 0 }}>Course Demands</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{result.race.name}</p>
              </div>

              <p style={sectionLabel}>Gradient Distribution</p>
              <div style={{ marginBottom: "20px" }}>
                <GradientHistogram sections={result.terrain_sections} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "6px" }}>
                  {GRAD_BANDS.map(b => (
                    <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "10px", height: "10px", background: b.color, borderRadius: "2px", opacity: 0.85 }} />
                      <span style={{ fontSize: "9px", color: "#666" }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p style={sectionLabel}>Effort Multiplier by Section</p>
              <div style={{ background: "#f8faf8", border: "1px solid #dde8dd", borderRadius: "6px", padding: "10px 14px", marginBottom: "12px", fontSize: "11px", color: "#444", lineHeight: "1.65" }}>
                <p style={{ margin: "0 0 6px" }}>
                  Each bar shows the <strong>metabolic cost multiplier</strong> for that section relative to flat road running.
                  The calculation uses the <strong>Minetti grade-adjusted energy cost model</strong> (Minetti et al., 2002, <em>J. Physiol.</em> 543:405â€“412),
                  which expresses the oxygen cost of locomotion at gradient <em>g</em> as:
                </p>
                <p style={{ margin: "0 0 6px", fontFamily: "monospace", fontSize: "10.5px", paddingLeft: "12px" }}>
                  C(g) = 1 + 4.5g + 19gÂ² âˆ’ 43.3gÂ³
                </p>
                <p style={{ margin: 0 }}>
                  A bar at <strong>1.5Ã—</strong> means that section demands 50% more energy than the same distance on flat ground.
                  Bars <em>below</em> 1.0Ã— represent descents where gravity reduces locomotion cost â€”
                  but note that steep downhill running imposes high <strong>eccentric quad load</strong> even when the energy figure looks favourable,
                  and is a primary driver of late-race muscle damage and slowing.
                  The overall effort ratio of <strong>{effortRatio.toFixed(2)}Ã—</strong> means this course demands{" "}
                  <strong>{((effortRatio - 1) * 100).toFixed(0)}% more energy</strong> than a flat course of the same distance â€”
                  {" "}<em>{effortRatioLabel}</em>.
                  Climbing sections are weighted by the Minetti cost function above.
                  Descent sections are treated as 1.0Ã— (flat-equivalent) rather than as a benefit,
                  because eccentric quad loading on downhills accumulates significant fatigue
                  regardless of the lower aerobic cost.
                </p>
              </div>
              <div style={{ marginBottom: "24px" }}>
                <EffortProfileChart sections={result.terrain_sections} totalKm={totalKm} />
                <div style={{ display: "flex", gap: "16px", marginTop: "5px", flexWrap: "wrap" }}>
                  {[{ color: "#c0392b", label: "â‰¥1.5Ã— very hard" }, { color: "#e65100", label: "1.2â€“1.5Ã— hard" }, { color: "#78909c", label: "0.9â€“1.2Ã— moderate" }, { color: "#64b5f6", label: "0.7â€“0.9Ã— easy descent" }, { color: "#1976d2", label: "<0.7Ã— steep descent" }].map(({ color, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "10px", height: "10px", background: color, borderRadius: "2px", opacity: 0.85 }} />
                      <span style={{ fontSize: "9px", color: "#666" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p style={sectionLabel}>Demand Summary</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <DemandCard title="Steepest Climb" accent="#c0392b">
                  {steepestClimb
                    ? <>{steepestClimb.avg_gradient_percent.toFixed(1)}% avg Â· {steepestClimb.distance_km.toFixed(1)} km Â· km {steepestClimb.start_km.toFixed(0)}â€“{steepestClimb.end_km.toFixed(0)}</>
                    : "No significant climbs"}
                </DemandCard>
                <DemandCard title="Steepest Descent" accent="#1565c0">
                  {steepestDescent
                    ? <>{Math.abs(steepestDescent.avg_gradient_percent).toFixed(1)}% avg Â· {steepestDescent.distance_km.toFixed(1)} km Â· km {steepestDescent.start_km.toFixed(0)}â€“{steepestDescent.end_km.toFixed(0)}</>
                    : "No significant descents"}
                </DemandCard>
                <DemandCard title="Pacing Complexity" accent={complexityColor}>
                  <strong>{complexityLabel}</strong> â€” effort varies {cvRatio.toFixed(2)} across sections.
                  {steepClimbKm > 0 && <> {steepClimbKm.toFixed(1)} km of steep climbing (â‰¥8%).</>}
                  {steepDescentKm > 0 && <> {steepDescentKm.toFixed(1)} km of steep descent (â‰¥8%).</>}
                  {runnableKm > 0 && <> {runnableKm.toFixed(1)} km runnable (0â€“3%).</>}
                </DemandCard>
                <DemandCard title="Technical Terrain" accent="#e65100">
                  {technicalPct > 0
                    ? <>{technicalPct}% of course is technical trail or fell ({technicalKm.toFixed(1)} km). Expect slower pace on technical sections.</>
                    : "No technical trail or fell sections detected."}
                </DemandCard>
              </div>

              {terrainPairings.length > 0 && (
                <>
                  <p style={{ ...sectionLabel, marginTop: "28px", marginBottom: "8px" }}>Course Character Breakdown</p>
                  <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#555", lineHeight: "1.5" }}>
                    Every gradient-surface combination on this course, ranked by distance. This shows exactly what type of effort is required
                    and on what terrain â€” useful for identifying specific preparation needs (e.g. downhill running on technical trail, sustained climbing on fell).
                  </p>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Gradient type</th>
                        <th style={thStyle}>Surface</th>
                        <th style={thStyle}>Distance</th>
                        <th style={thStyle}>% of course</th>
                        <th style={thStyle}>Avg gradient</th>
                        <th style={thStyle}>Effort ratio</th>
                        <th style={thStyle}>What to expect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terrainPairings.map((p, i) => {
                        const gradColor = p.avg_gradient > 8 ? "#c0392b" : p.avg_gradient > 3 ? "#e65100" : p.avg_gradient < -8 ? "#0d47a1" : p.avg_gradient < -3 ? "#1976d2" : "#546e7a";
                        const effortColor = p.effort_ratio >= 1.5 ? "#c0392b" : p.effort_ratio >= 1.2 ? "#e65100" : p.effort_ratio <= 0.7 ? "#0d47a1" : p.effort_ratio <= 0.9 ? "#1976d2" : "#555";
                        const noteMap: Record<string, string> = {
                          "steep_climb|technical_trail": "Hard anaerobic climbing â€” hands may be needed",
                          "steep_climb|fell":            "Steep fell climbing â€” expect power hiking",
                          "steep_climb|road":            "Sustained road climb â€” manageable gradient but high volume",
                          "steep_climb|trail":           "Trail climb â€” rhythmic effort, poles recommended",
                          "sustained_climb|technical_trail": "Long technical climb â€” technical footing while working hard",
                          "sustained_climb|fell":        "Open fell climbing â€” variable underfoot, exposed",
                          "sustained_climb|road":        "Long road climb â€” steady aerobic effort",
                          "sustained_climb|trail":       "Long trail climb â€” key to race strategy",
                          "mild_climb|trail":            "Runnable climb â€” maintain rhythm",
                          "mild_climb|road":             "Easy road rise â€” target a consistent pace",
                          "flat|road":                   "Fast runnable section â€” opportunity to recover time",
                          "flat|trail":                  "Flat trail â€” variable underfoot, less consistent pace",
                          "flat|fell":                   "Flat fell â€” soft ground, higher energy cost than road",
                          "mild_descent|trail":          "Runnable descent â€” controlled momentum",
                          "mild_descent|road":           "Fast road descent â€” protect quads",
                          "sustained_descent|technical_trail": "Technical descent â€” high quad damage risk, key training target",
                          "sustained_descent|fell":      "Open fell descent â€” technical footing, high speed possible",
                          "sustained_descent|trail":     "Long descent â€” quad-loading, pace management critical",
                          "steep_descent|technical_trail": "Very steep technical descent â€” highest quad damage risk on course",
                          "steep_descent|fell":          "Very steep fell descent â€” bracken/rocks, high injury risk",
                          "steep_descent|road":          "Steep road descent â€” aggressive braking forces",
                        };
                        const noteKey = `${p.section_type}|${p.terrain}`;
                        const note = noteMap[noteKey] ?? `${p.section_type.replaceAll("_", " ")} on ${p.terrain.replaceAll("_", " ")}`;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...tdStyle, fontWeight: 600, color: gradColor }}>{p.section_type.replaceAll("_", " ")}</td>
                            <td style={tdStyle}>{p.terrain.replaceAll("_", " ")}</td>
                            <td style={{ ...tdStyle, fontFamily: "monospace" }}>{p.total_km.toFixed(1)} km</td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{p.pct.toFixed(0)}%</td>
                            <td style={{ ...tdStyle, color: gradColor }}>{p.avg_gradient > 0 ? "+" : ""}{p.avg_gradient.toFixed(1)}%</td>
                            <td style={{ ...tdStyle, fontWeight: 600, color: effortColor }}>{p.effort_ratio.toFixed(2)}Ã—</td>
                            <td style={{ ...tdStyle, fontSize: "10px", color: "#555" }}>{note}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {/* â”€â”€ Page 4: Aid Stations â”€â”€ */}
          {(result.aid_stations?.length ?? 0) > 0 && (
            <div style={a4Page} className="rr-page">
              <div style={printHeader}>
                <p style={{ ...sectionLabel, color: "#1e3a1e", margin: 0 }}>Aid Stations</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{result.race.name}</p>
              </div>

              {aidGaps !== null && (
                <div style={{ background: "#f0f4f0", border: "1px solid #c8dac8", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px", display: "flex", gap: "24px" }}>
                  <div>
                    <p style={sectionLabel}>Total aid stations</p>
                    <p style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>{result.aid_stations!.length}</p>
                  </div>
                  <div>
                    <p style={sectionLabel}>Largest unsupported gap</p>
                    <p style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: aidGaps > 20 ? "#c0392b" : aidGaps > 12 ? "#e65100" : "#1e3a1e" }}>
                      {aidGaps.toFixed(1)} km
                    </p>
                  </div>
                </div>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Km</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Gap from prev.</th>
                    <th style={thStyle}>Water</th>
                    <th style={thStyle}>Food</th>
                    <th style={thStyle}>Medic</th>
                    <th style={thStyle}>Toilets</th>
                    <th style={thStyle}>Drop bags</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.aid_stations ?? []).sort((a, b) => a.km - b.km).map((s, i, arr) => {
                    const gap = i === 0 ? s.km : s.km - arr[i - 1].km;
                    const tick = (v: boolean) => <span style={{ color: v ? "#2e7d32" : "#bbb" }}>{v ? "âœ“" : "â€“"}</span>;
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{s.km.toFixed(1)}</td>
                        <td style={tdStyle}>{s.name ?? `Station ${i + 1}`}</td>
                        <td style={{ ...tdStyle, color: gap > 20 ? "#c0392b" : gap > 12 ? "#e65100" : "#555" }}>{gap.toFixed(1)} km</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{tick(s.water)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{tick(s.food)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{tick(s.medic)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{tick(s.toilets)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{tick(s.dropBags)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* â”€â”€ Page 5: Historical Field Data â”€â”€ */}
          {fieldStats && (
            <div style={a4Page} className="rr-page">
              <div style={printHeader}>
                <p style={{ ...sectionLabel, color: "#1e3a1e", margin: 0 }}>Historical Field Statistics</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{result.race.name}</p>
              </div>

              {!fieldStats.has_data ? (
                <p style={{ color: "#888", fontSize: "13px" }}>No historical results data available for this race.</p>
              ) : (
                <>
                  {/* Aggregate stat tiles */}
                  {fieldStats.aggregate && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
                      {[
                        { label: "Total finishers", value: fieldStats.aggregate.total_finishers.toLocaleString() },
                        { label: "DNF rate", value: `${(fieldStats.aggregate.dnf_rate * 100).toFixed(1)}%`, color: fieldStats.aggregate.dnf_rate > 0.25 ? "#c0392b" : fieldStats.aggregate.dnf_rate > 0.1 ? "#e65100" : "#2e7d32" },
                        { label: "Years of data", value: String(fieldStats.aggregate.years_of_data) },
                        { label: "Course record", value: fieldStats.aggregate.fastest_seconds ? formatSecs(fieldStats.aggregate.fastest_seconds) : "â€”" },
                        { label: "Median finish", value: fieldStats.aggregate.median_seconds ? formatSecs(fieldStats.aggregate.median_seconds) : "â€”" },
                        { label: "P25 (fast quarter)", value: fieldStats.aggregate.p25_seconds ? formatSecs(fieldStats.aggregate.p25_seconds) : "â€”" },
                        { label: "P75 (slow quarter)", value: fieldStats.aggregate.p75_seconds ? formatSecs(fieldStats.aggregate.p75_seconds) : "â€”" },
                        { label: "Race type", value: fieldStats.aggregate.cluster_label ?? "â€”" },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: "#f9f9f9", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "12px 14px" }}>
                          <p style={sectionLabel}>{label}</p>
                          <p style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: color ?? "#1e3a1e" }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Year-by-year */}
                  {(fieldStats.by_year ?? []).length > 0 && (
                    <>
                      <p style={{ ...sectionLabel, marginBottom: "8px" }}>Year-by-Year Results</p>
                      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px" }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Year</th>
                            <th style={thStyle}>Finishers</th>
                            <th style={thStyle}>Starters</th>
                            <th style={thStyle}>DNF rate</th>
                            <th style={thStyle}>Median finish</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(fieldStats.by_year ?? []).map((yr, i) => (
                            <tr key={yr.year} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{yr.year}</td>
                              <td style={tdStyle}>{yr.finishers.toLocaleString()}</td>
                              <td style={tdStyle}>{yr.starters.toLocaleString()}</td>
                              <td style={{ ...tdStyle, color: yr.dnf_rate > 0.25 ? "#c0392b" : yr.dnf_rate > 0.1 ? "#e65100" : "#2e7d32", fontWeight: 600 }}>
                                {(yr.dnf_rate * 100).toFixed(1)}%
                              </td>
                              <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                                {yr.median_seconds ? formatSecs(yr.median_seconds) : "â€”"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {/* Gender split */}
                  {(fieldStats.by_gender ?? []).length > 1 && (
                    <>
                      <p style={{ ...sectionLabel, marginBottom: "8px" }}>Gender Breakdown</p>
                      <div style={{ display: "flex", gap: "12px" }}>
                        {(fieldStats.by_gender ?? []).map(g => (
                          <div key={g.gender} style={{ background: "#f9f9f9", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "12px 18px", minWidth: "120px" }}>
                            <p style={sectionLabel}>{g.gender}</p>
                            <p style={{ margin: "0 0 2px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>{g.count.toLocaleString()}</p>
                            {g.median_seconds && <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>Median {formatSecs(g.median_seconds)}</p>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* â”€â”€ Page 6: Finish Time Distribution â”€â”€ */}
          {fieldStats?.has_data && (fieldStats.distribution ?? []).length > 0 && fieldStats.aggregate && (
            <div style={a4Page} className="rr-page">
              <div style={printHeader}>
                <p style={{ ...sectionLabel, color: "#1e3a1e", margin: 0 }}>Finish Time Distribution</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{result.race.name} Â· all years combined</p>
              </div>

              <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#555" }}>
                Distribution of {fieldStats.aggregate.total_finishers.toLocaleString()} finishers across {fieldStats.aggregate.years_of_data} year{fieldStats.aggregate.years_of_data !== 1 ? "s" : ""} of results data. Percentile lines show where the fastest 10%, 25%, median, 75%, and 90% runners finish.
              </p>

              <FinishTimeHistogram distribution={fieldStats.distribution!} aggregate={fieldStats.aggregate} />

              {fieldStats.aggregate.median_seconds && (
                <div style={{ marginTop: "28px", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px" }}>
                  {[
                    { label: "P10 (top 10%)", secs: fieldStats.aggregate.p10_seconds, color: "#1976d2" },
                    { label: "P25 (top 25%)", secs: fieldStats.aggregate.p25_seconds, color: "#2e7d32" },
                    { label: "Median (P50)", secs: fieldStats.aggregate.median_seconds, color: "#1e3a1e" },
                    { label: "P75", secs: fieldStats.aggregate.p75_seconds, color: "#e65100" },
                    { label: "P90", secs: fieldStats.aggregate.p90_seconds, color: "#c62828" },
                  ].map(({ label, secs, color }) => (
                    <div key={label} style={{ background: "#f9f9f9", border: `1px solid ${color}30`, borderTop: `3px solid ${color}`, borderRadius: "6px", padding: "10px 12px" }}>
                      <p style={{ ...sectionLabel, color }}>{label}</p>
                      <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color }}>{secs ? formatSecs(secs) : "â€”"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ Page 7: Weather Intelligence â”€â”€ */}
          {(weatherLoading || weather.length > 0) && (
            <div style={a4Page} className="rr-page">
              <div style={printHeader}>
                <p style={{ ...sectionLabel, color: "#1e3a1e", margin: 0 }}>Weather Intelligence</p>
                <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{result.race.name}</p>
              </div>

              {weatherLoading ? (
                <p style={{ color: "#888", fontSize: "13px" }}>Loading historical weather dataâ€¦</p>
              ) : weather.length === 0 ? (
                <p style={{ color: "#888", fontSize: "13px" }}>No weather history available for this race date and location.</p>
              ) : (
                <>
                  <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#555" }}>
                    Based on {weather.length} years of historical weather data for the race date and location (ERA5 reanalysis via Open-Meteo).
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "28px" }}>
                    {[
                      { label: "Typical high", value: avgMaxTemp !== null ? `${avgMaxTemp.toFixed(1)} Â°C` : "â€”" },
                      { label: "Typical low", value: avgMinTemp !== null ? `${avgMinTemp.toFixed(1)} Â°C` : "â€”" },
                      { label: "Avg precipitation", value: avgPrecip !== null ? `${avgPrecip.toFixed(1)} mm` : "â€”" },
                      { label: "Wet day probability", value: wetPct !== null ? `${wetPct}%` : "â€”", color: wetPct !== null && wetPct > 50 ? "#c0392b" : wetPct !== null && wetPct > 25 ? "#e65100" : "#2e7d32" },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background: "#f9f9f9", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "12px 14px" }}>
                        <p style={sectionLabel}>{label}</p>
                        <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: color ?? "#1e3a1e" }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Year-by-year weather table (up to 10 most recent) */}
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Year</th>
                        <th style={thStyle}>Min Â°C</th>
                        <th style={thStyle}>Max Â°C</th>
                        <th style={thStyle}>Precipitation (mm)</th>
                        <th style={thStyle}>Conditions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...weather].slice(-15).reverse().map((d, i) => {
                        const precip = d.precipitation_mm ?? 0;
                        const condLabel = precip > 5 ? "Wet" : precip > 1 ? "Damp" : (d.temp_max_c ?? 20) > 25 ? "Hot" : "Dry";
                        const condColor = precip > 5 ? "#1565c0" : precip > 1 ? "#1976d2" : (d.temp_max_c ?? 20) > 25 ? "#c62828" : "#2e7d32";
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{(d as { year?: number }).year ?? "â€”"}</td>
                            <td style={tdStyle}>{d.temp_min_c?.toFixed(1) ?? "â€”"}</td>
                            <td style={tdStyle}>{d.temp_max_c?.toFixed(1) ?? "â€”"}</td>
                            <td style={tdStyle}>{precip.toFixed(1)}</td>
                            <td style={{ ...tdStyle, color: condColor, fontWeight: 600 }}>{condLabel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading state before any result */}
      {generating && !result && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px" }}>
          <p style={{ color: "#888", fontSize: "14px" }}>Generating race intelligence reportâ€¦</p>
        </div>
      )}
    </main>
  );
}

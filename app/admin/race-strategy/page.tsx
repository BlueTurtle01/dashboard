"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeatherDayRecord } from "@/lib/race-analysis/open-meteo";

/* ── API response types ── */
interface RaceMeta { id: string; name: string; total_distance_km: number; total_ascent_m: number; total_descent_m: number; race_date: string | null; weather_lat: number | null; weather_lon: number | null; }
interface PacingSection { start_km: number; end_km: number; section_type: string; target_pace: string; pace_band: string; }
interface WindSection { section_id: number; start_km: number; end_km: number; mid_lat: number; mid_lon: number; bearing_deg: number; median_wind_speed_ms: number; median_headwind_ms: number; median_crosswind_ms: number; wind_risk_label: string; }
interface GenerateResponse { race: RaceMeta; pacing: PacingSection[]; route: { lat: number; lon: number }[]; wind_sections: WindSection[] | null; elevation_profile: string | null; sustained_segments: string | null; }

/* ── Race picker types ── */
interface RaceOption { race_id: string; race_name: string; total_distance_km: number; total_ascent_m: number; has_wind: boolean; }

/* ── Elevation types ── */
interface ElevationPoint { distanceKm: number; elevationM: number; }
interface RaceElevProfile { points: ElevationPoint[]; totalDistanceKm: number; minElevationM: number; maxElevationM: number; }
interface RaceSustainedSeg { startKm: number; endKm: number; type: "climb" | "descent" | "flat"; totalElevationM: number; }

/* ── Parse helpers ── */
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
    const elevs = points.map(pt => pt.elevationM);
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

/* ── Pace helpers ── */
function parsePaceToMinutes(pace: string): number | null {
  const m = pace.match(/(\d+):(\d+)/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}
function formatPaceLabel(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
function formatSectionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function formatRaceTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins  = Math.round(totalMinutes % 60);
  const m = mins === 60 ? 0 : mins;
  const h = mins === 60 ? hours + 1 : hours;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/* ── Wind effort model ── */
function avgHeadwindForSection(sec: PacingSection, windData: WindSection[]): number {
  const len = sec.end_km - sec.start_km;
  if (len <= 0 || windData.length === 0) return 0;
  let ws = 0, covered = 0;
  for (const w of windData) {
    const overlap = Math.max(0, Math.min(sec.end_km, w.end_km) - Math.max(sec.start_km, w.start_km));
    if (overlap > 0) { ws += overlap * w.median_headwind_ms; covered += overlap; }
  }
  return covered > 0 ? ws / covered : 0;
}
function effortWindMultiplier(headwindMs: number): number {
  if (headwindMs <= 0) return Math.max(0.955, 1 - Math.min(0.0045 * Math.abs(headwindMs), 0.045));
  return Math.min(1.20, 1 + 0.018 * headwindMs + 0.002 * headwindMs ** 2);
}
function computeEffortPace(sec: PacingSection, windData: WindSection[]): string | null {
  const targetMin = parsePaceToMinutes(sec.target_pace);
  if (targetMin === null) return null;
  const adj = targetMin * effortWindMultiplier(avgHeadwindForSection(sec, windData));
  const mins = Math.floor(adj);
  const secsRaw = Math.round((adj - mins) * 60);
  const s = secsRaw === 60 ? 0 : secsRaw;
  const m = secsRaw === 60 ? mins + 1 : mins;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/* ── Temperature & precipitation effort models ── */

/**
 * Pace multiplier for ambient temperature, based on Ely et al. (2007).
 * Optimal range 5–13°C; penalty scales above 13°C. Mild cold penalty below 5°C.
 */
function tempMultiplier(avgTempC: number): number {
  if (avgTempC < 5)  return Math.min(1.03, 1 + 0.003 * (5 - avgTempC));
  if (avgTempC <= 13) return 1.0;
  return Math.min(1.20, 1 + 0.004 * (avgTempC - 13));
}

/**
 * Pace multiplier for precipitation. Light rain provides negligible effect;
 * heavier rain degrades traction and increases drag (especially on trail).
 */
function precipMultiplier(precipMm: number): number {
  if (precipMm < 1)  return 1.0;
  if (precipMm < 5)  return 1 + 0.003 * precipMm;
  if (precipMm < 20) return 1.015 + 0.002 * (precipMm - 5);
  return 1.045;
}

function applyMultiplierToPace(targetPace: string, multiplier: number): string | null {
  const targetMin = parsePaceToMinutes(targetPace);
  if (targetMin === null) return null;
  const adj = targetMin * multiplier;
  const mins = Math.floor(adj);
  const secsRaw = Math.round((adj - mins) * 60);
  const s = secsRaw === 60 ? 0 : secsRaw;
  const m = secsRaw === 60 ? mins + 1 : mins;
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/* ── Checkpoint builder ── */
interface Checkpoint { label: string; distanceKm: number; targetMinutes: number; effortMinutes: number; isHighlight: boolean; }
function buildCheckpoints(pacing: PacingSection[], windData: WindSection[]): Checkpoint[] {
  if (pacing.length === 0) return [];
  const totalKm = pacing[pacing.length - 1].end_km;
  const halfwayKm = totalKm / 2;
  const marks: number[] = [];
  for (let km = 5; km < totalKm - 0.5; km += 5) marks.push(km);
  if (!marks.some(m => Math.abs(m - halfwayKm) < 1)) {
    marks.push(halfwayKm);
    marks.sort((a, b) => a - b);
  }
  marks.push(totalKm);
  return marks.map(km => {
    let tMin = 0, eMin = 0;
    for (const sec of pacing) {
      if (sec.start_km >= km) break;
      const dist = Math.min(sec.end_km, km) - sec.start_km;
      const tPace = parsePaceToMinutes(sec.target_pace);
      if (tPace !== null) {
        tMin += dist * tPace;
        if (windData.length > 0) eMin += dist * tPace * effortWindMultiplier(avgHeadwindForSection(sec, windData));
      }
    }
    const isFinish = km >= totalKm - 0.01;
    const isHalfway = !isFinish && Math.abs(km - halfwayKm) < 1;
    const label = isFinish ? "Finish" : isHalfway
      ? `Halfway · ${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`
      : `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)} km`;
    return { label, distanceKm: km, targetMinutes: tMin, effortMinutes: eMin, isHighlight: isFinish || isHalfway };
  });
}

/* ── OSM map helpers ── */
function osmMercX(lon: number) { return (lon + 180) / 360; }
function osmMercY(lat: number) { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
function osmTileX(lon: number, z: number) { return Math.floor(osmMercX(lon) * Math.pow(2, z)); }
function osmTileY(lat: number, z: number) { return Math.floor(osmMercY(lat) * Math.pow(2, z)); }
function windRiskColor(label: string) { if (label.includes("high")) return "#c62828"; if (label.includes("moderate")) return "#e65100"; return "#546e7a"; }
type OsmTile = { url: string; x: number; y: number; w: number; h: number };

/* ── Display components ── */
function downsample(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

function ElevationChart({ profile, notable, pacing }: { profile: RaceElevProfile; notable: RaceSustainedSeg[]; pacing?: PacingSection[] }) {
  const W = 698, H = 200, padL = 46, padB = 22, padT = 16;
  const hasPacing = (pacing?.length ?? 0) > 0;
  const padR = hasPacing ? 54 : 8;
  const cW = W - padL - padR, cH = H - padT - padB;
  const elevRange = Math.max(profile.maxElevationM - profile.minElevationM, 50);
  const xS = (km: number) => padL + (km / profile.totalDistanceKm) * cW;
  const yS = (m: number)  => padT + cH - ((m - profile.minElevationM) / elevRange) * cH;
  const pts = downsample(profile.points, 300);
  const linePts = pts.map(p => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ");
  const first = pts[0], last = pts[pts.length - 1];
  const areaD = `M${xS(first.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} ` +
    pts.map(p => `L${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ") +
    ` L${xS(last.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} Z`;
  const yTicks = Array.from({ length: 5 }, (_, i) => profile.minElevationM + (elevRange / 4) * i);
  const xInt = Math.ceil(profile.totalDistanceKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= profile.totalDistanceKm; k += xInt) xTicks.push(k);
  const paceParsed = (pacing ?? []).map(s => parsePaceToMinutes(s.target_pace));
  const validPaces = paceParsed.filter((v): v is number => v !== null);
  const paceMinRaw = validPaces.length ? Math.min(...validPaces) : 0;
  const paceMaxRaw = validPaces.length ? Math.max(...validPaces) : 30;
  const paceMin = paceMinRaw - 0.5, paceMax = paceMaxRaw + 0.5;
  const paceRange = Math.max(paceMax - paceMin, 1);
  const paceY = (m: number) => padT + cH - ((m - paceMin) / paceRange) * cH;
  const tickInt = (paceMaxRaw - paceMinRaw) > 5 ? 2 : 1;
  const firstTick = Math.ceil(paceMin / tickInt) * tickInt;
  const paceTicks: number[] = [];
  for (let p = firstTick; p <= paceMax + 0.01; p += tickInt) paceTicks.push(p);
  const axisX = padL + cW;
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((elev, i) => <line key={i} x1={padL} y1={yS(elev)} x2={axisX} y2={yS(elev)} stroke="#eee" strokeWidth="1" />)}
      {notable.map((seg, i) => <rect key={i} x={xS(seg.startKm)} y={padT} width={Math.max(xS(seg.endKm) - xS(seg.startKm), 1)} height={cH} fill={seg.type === "climb" ? "#ff980018" : "#1565c018"} />)}
      <path d={areaD} fill="#1e3a1e18" />
      <polyline points={linePts} fill="none" stroke="#1e3a1e" strokeWidth="1.5" strokeLinejoin="round" />
      {hasPacing && (
        <g>
          {(pacing ?? []).map((sec, i) => {
            const pace = paceParsed[i]; if (pace === null) return null;
            const x1 = xS(sec.start_km), x2 = xS(sec.end_km), y = paceY(pace);
            const next = i + 1 < paceParsed.length ? paceParsed[i + 1] : null;
            return <g key={i}><line x1={x1} y1={y} x2={x2} y2={y} stroke="#c0392b" strokeWidth="1.5" strokeLinecap="square" />{next !== null && <line x1={x2} y1={y} x2={x2} y2={paceY(next)} stroke="#c0392b" strokeWidth="1.5" />}</g>;
          })}
        </g>
      )}
      {yTicks.map((elev, i) => <text key={i} x={padL - 5} y={yS(elev) + 3.5} textAnchor="end" fontSize="8.5" fill="#888">{Math.round(elev)}</text>)}
      {xTicks.map((km, i) => <g key={i}><line x1={xS(km)} y1={padT + cH} x2={xS(km)} y2={padT + cH + 4} stroke="#ccc" strokeWidth="1" /><text x={xS(km)} y={padT + cH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text></g>)}
      <line x1={padL} y1={padT} x2={padL} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + cH} x2={axisX} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      {hasPacing && <g>
        <line x1={axisX} y1={padT} x2={axisX} y2={padT + cH} stroke="#c0392b" strokeWidth="1" opacity="0.4" />
        {paceTicks.map((p, i) => { const y = paceY(p); if (y < padT - 1 || y > padT + cH + 1) return null; return <g key={i}><line x1={axisX} y1={y} x2={axisX + 4} y2={y} stroke="#c0392b" strokeWidth="1" /><text x={axisX + 7} y={y + 3.5} textAnchor="start" fontSize="8.5" fill="#c0392b">{formatPaceLabel(p)}</text></g>; })}
        <text x={axisX + 46} y={padT + cH / 2} textAnchor="middle" fontSize="7.5" fill="#c0392b" opacity="0.7" transform={`rotate(-90,${axisX + 46},${padT + cH / 2})`}>pace min/km</text>
      </g>}
      {notable.map((seg, i) => { const midX = xS((seg.startKm + seg.endKm) / 2); const isClimb = seg.type === "climb"; return <text key={i} x={midX} y={padT - 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={isClimb ? "#bf360c" : "#0d47a1"}>{isClimb ? "▲" : "▼"} {Math.abs(Math.round(seg.totalElevationM))}m</text>; })}
    </svg>
  );
}

function RouteMap({ route, windSections, width = 694, height = 240 }: { route: { lat: number; lon: number }[]; windSections?: WindSection[]; width?: number; height?: number }) {
  const clipId = useRef(`mc-${Math.random().toString(36).slice(2, 7)}`).current;
  const [tiles, setTiles] = useState<OsmTile[]>([]);
  useEffect(() => {
    if (route.length < 2) { setTiles([]); return; }
    const lats = route.map(p => p.lat), lons = route.map(p => p.lon);
    const r0lat = Math.min(...lats), r1lat = Math.max(...lats), r0lon = Math.min(...lons), r1lon = Math.max(...lons);
    const dlat = r1lat - r0lat, dlon = r1lon - r0lon;
    const minLat = r0lat - dlat * 0.15 - 0.005, maxLat = r1lat + dlat * 0.15 + 0.005;
    const minLon = r0lon - dlon * 0.15 - 0.008, maxLon = r1lon + dlon * 0.15 + 0.008;
    let z = 14;
    for (; z >= 8; z--) { if ((osmTileX(maxLon, z) - osmTileX(minLon, z) + 1) * (osmTileY(minLat, z) - osmTileY(maxLat, z) + 1) <= 16) break; }
    const zPow = Math.pow(2, z);
    const mx0 = osmMercX(minLon), mx1 = osmMercX(maxLon), my0 = osmMercY(maxLat), my1 = osmMercY(minLat);
    const sc = Math.min(width / (mx1 - mx0), height / (my1 - my0));
    const ox = (width - (mx1 - mx0) * sc) / 2, oy = (height - (my1 - my0) * sc) / 2;
    const tsz = 1 / zPow;
    const tx0 = osmTileX(minLon, z), tx1 = osmTileX(maxLon, z), ty0 = osmTileY(maxLat, z), ty1 = osmTileY(minLat, z);
    const newTiles: OsmTile[] = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) newTiles.push({ url: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, x: ox + (tx * tsz - mx0) * sc, y: oy + (ty * tsz - my0) * sc, w: tsz * sc, h: tsz * sc });
    setTiles(newTiles);
  }, [route, width, height]); // eslint-disable-line react-hooks/exhaustive-deps
  if (route.length < 2) return null;
  const lats = route.map(p => p.lat), lons = route.map(p => p.lon);
  const r0lat = Math.min(...lats), r1lat = Math.max(...lats), r0lon = Math.min(...lons), r1lon = Math.max(...lons);
  const dlat = r1lat - r0lat, dlon = r1lon - r0lon;
  const minLat = r0lat - dlat * 0.15 - 0.005, maxLat = r1lat + dlat * 0.15 + 0.005;
  const minLon = r0lon - dlon * 0.15 - 0.008, maxLon = r1lon + dlon * 0.15 + 0.008;
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
          return <g key={i} transform={`translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${windDir.toFixed(1)})`} opacity={isSig ? 1 : 0.5}><circle r={arrowLen + 5} fill={color} opacity={0.22} /><line x1={0} y1={arrowLen * 0.65} x2={0} y2={-arrowLen * 0.65} stroke={color} strokeWidth={isSig ? 2.5 : 1.5} strokeLinecap="round" /><polygon points={`0,${-(arrowLen + 4)} ${-arrowLen * 0.4},${-arrowLen * 0.35} ${arrowLen * 0.4},${-arrowLen * 0.35}`} fill={color} /></g>;
        })}
        <circle cx={toX(startPt.lon)} cy={toY(startPt.lat)} r={6} fill="#2e7d32" stroke="white" strokeWidth="2" />
        <text x={toX(startPt.lon) + 9} y={toY(startPt.lat) + 4} fontSize="9.5" fontWeight="700" stroke="white" strokeWidth="3" paintOrder="stroke" fill="#2e7d32">Start</text>
        <circle cx={toX(endPt.lon)} cy={toY(endPt.lat)} r={6} fill="#c62828" stroke="white" strokeWidth="2" />
        <text x={toX(endPt.lon) + 9} y={toY(endPt.lat) + 4} fontSize="9.5" fontWeight="700" stroke="white" strokeWidth="3" paintOrder="stroke" fill="#c62828">Finish</text>
      </g>
      {hasWind && <g transform={`translate(${width - 134},${height - 58})`}>
        <rect x={0} y={0} width={130} height={54} fill="white" opacity={0.92} rx={3} />
        <text x={7} y={13} fontSize="8" fontWeight="700" fill="#333">Wind risk</text>
        {[{ color: "#546e7a", label: "Low" }, { color: "#e65100", label: "Moderate headwind" }, { color: "#c62828", label: "High headwind" }].map(({ color, label }, li) => <g key={li} transform={`translate(7,${21 + li * 11})`}><circle r={4} fill={color} /><text x={11} y={4} fontSize="7.5" fill="#444">{label}</text></g>)}
      </g>}
      <rect x={width - 158} y={height - 14} width={154} height={12} fill="white" opacity={0.75} />
      <text x={width - 4} y={height - 4} textAnchor="end" fontSize="7.5" fill="#555">© OpenStreetMap contributors</text>
    </svg>
  );
}

/* ── Weather insights ── */
function generateWeatherInsights(data: WeatherDayRecord[]): { tempInsight: string; rainInsight: string } {
  if (data.length === 0) return { tempInsight: "", rainInsight: "" };

  const avgTemps   = data.map(d => ((d.temp_max_c ?? 0) + (d.temp_min_c ?? 0)) / 2);
  const maxTemps   = data.map(d => d.temp_max_c ?? 0);
  const minTemps   = data.map(d => d.temp_min_c ?? 0);
  const precips    = data.map(d => d.precipitation_mm ?? 0);
  const n = data.length;

  const meanAvgTemp = avgTemps.reduce((s, t) => s + t, 0) / n;
  const meanMax     = maxTemps.reduce((s, t) => s + t, 0) / n;
  const meanMin     = minTemps.reduce((s, t) => s + t, 0) / n;
  const absMax      = Math.max(...maxTemps);
  const absMin      = Math.min(...minTemps);
  const tempStdDev  = Math.sqrt(avgTemps.reduce((s, t) => s + (t - meanAvgTemp) ** 2, 0) / n);

  const meanPrecip  = precips.reduce((s, p) => s + p, 0) / n;
  const maxPrecip   = Math.max(...precips);
  const wetYears    = precips.filter(p => p > 1).length;
  const wetPct      = Math.round((wetYears / n) * 100);
  const precipStdDev = Math.sqrt(precips.reduce((s, p) => s + (p - meanPrecip) ** 2, 0) / n);

  // Temperature summary
  let tempCondition: string;
  if (meanAvgTemp < 5)       tempCondition = "Cold conditions are typical. Muscles will take longer to warm up — build in a proper warm-up routine and layer accordingly.";
  else if (meanAvgTemp <= 13) tempCondition = "Near-optimal conditions for running performance. No significant heat or cold management should be needed.";
  else if (meanAvgTemp <= 18) tempCondition = `Mild warmth (avg ${meanAvgTemp.toFixed(1)}°C) will add a modest effort penalty. Good hydration strategy will cover it without major pace changes.`;
  else if (meanAvgTemp <= 24) tempCondition = `Warm conditions (avg ${meanAvgTemp.toFixed(1)}°C) will meaningfully increase effort. Plan for heat management — make full use of aid stations, consider pre-cooling, and expect a noticeable pace penalty.`;
  else                        tempCondition = `Hot race conditions (avg ${meanAvgTemp.toFixed(1)}°C). Significant performance reduction expected. Aggressive cooling, early hydration, and a conservative early pace are essential.`;

  let tempConsistency: string;
  if (tempStdDev < 1.5)       tempConsistency = `Temperature is highly consistent year-to-year (±${tempStdDev.toFixed(1)}°C). The effort pace adjustments shown are a reliable guide.`;
  else if (tempStdDev < 3.0)  tempConsistency = `Moderate year-to-year variation (±${tempStdDev.toFixed(1)}°C, range ${absMin.toFixed(0)}–${absMax.toFixed(0)}°C). Conditions are broadly predictable but check the forecast in race week.`;
  else                        tempConsistency = `Temperature varies substantially year-to-year (±${tempStdDev.toFixed(1)}°C, ranging from ${absMin.toFixed(0)}°C to ${absMax.toFixed(0)}°C). Race-day conditions could differ significantly from the historical average — monitor the forecast closely.`;

  const tempInsight = `Average high ${meanMax.toFixed(1)}°C · low ${meanMin.toFixed(1)}°C on race day. ${tempCondition} ${tempConsistency}`;

  // Rainfall summary
  let rainCondition: string;
  if (wetPct < 30)       rainCondition = `Rain is uncommon on this date (${wetPct}% of years had measurable rainfall). Dry conditions are the norm and no specific wet-weather preparation should be required.`;
  else if (wetPct < 60)  rainCondition = `Rain occurs in roughly ${wetPct}% of years — worth packing wet-weather kit as a precaution, but a dry race day is equally plausible.`;
  else if (wetPct < 85)  rainCondition = `Rain is common on this date (${wetPct}% of years). Wet-weather kit, grip-focused footwear, and adjusted expectations for technical terrain are recommended.`;
  else                   rainCondition = `Rain is very likely (${wetPct}% of years had measurable rainfall). Plan firmly for wet conditions — waterproofs, appropriate grip, and a conservative approach on slippery sections.`;

  let rainConsistency: string;
  if (precipStdDev < 3 && meanPrecip < 5)  rainConsistency = `When rain does fall it is typically light (avg ${meanPrecip.toFixed(1)} mm), so the impact on pace should be minimal.`;
  else if (maxPrecip < 10)                  rainConsistency = `Amounts have been modest historically (max ${maxPrecip.toFixed(1)} mm), suggesting light to moderate rain rather than heavy downpours.`;
  else                                      rainConsistency = `Rainfall is variable — the wettest recorded year for this date saw ${maxPrecip.toFixed(1)} mm. While average conditions are more moderate, a significantly wet race is a real possibility.`;

  const rainInsight = `Average ${meanPrecip.toFixed(1)} mm on race day (0–${maxPrecip.toFixed(1)} mm range). ${rainCondition} ${rainConsistency}`;

  return { tempInsight, rainInsight };
}

/* ── Weather chart ── */
function WeatherChart({ data }: { data: WeatherDayRecord[] }) {
  if (data.length === 0) return null;
  const W = 698, tempH = 140, precH = 80, gap = 10;
  const padL = 40, padR = 12, padTop = 20, padBot = 24;
  const n = data.length;
  const colW = (W - padL - padR) / n;
  const barW = Math.max(colW * 0.55, 8);

  const allMaxTemps = data.map(d => d.temp_max_c).filter((v): v is number => v !== null);
  const allMinTemps = data.map(d => d.temp_min_c).filter((v): v is number => v !== null);
  const allPrecips  = data.map(d => d.precipitation_mm).filter((v): v is number => v !== null);

  const tempMax = allMaxTemps.length ? Math.ceil(Math.max(...allMaxTemps) / 5) * 5 + 5  : 30;
  const tempMin = allMinTemps.length ? Math.floor(Math.min(...allMinTemps) / 5) * 5 - 5 : 0;
  const tempRange = Math.max(tempMax - tempMin, 10);
  const precipMax = allPrecips.length ? Math.ceil(Math.max(...allPrecips) / 5) * 5 + 5 : 20;

  const tH        = tempH - padTop - padBot;
  const pyBaseline = precH - padBot;        // y of the x-axis within the precip panel
  const pyTop      = 6;                     // top margin within precip panel
  const pHinner    = pyBaseline - pyTop;    // usable height for bars
  const tyS = (c: number) => padTop + tH - ((c - tempMin) / tempRange) * tH;
  const pyS = (mm: number) => pyBaseline - (mm / precipMax) * pHinner;

  const tempTicks: number[] = [];
  const tickStep = tempRange > 30 ? 10 : 5;
  for (let t = Math.ceil(tempMin / tickStep) * tickStep; t <= tempMax; t += tickStep) tempTicks.push(t);

  return (
    <svg width={W} height={tempH + gap + precH} style={{ display: "block", overflow: "visible" }}>
      {/* Temp gridlines */}
      {tempTicks.map((t, i) => <line key={i} x1={padL} y1={tyS(t)} x2={W - padR} y2={tyS(t)} stroke="#eee" strokeWidth="1" />)}
      <line x1={padL} y1={padTop} x2={padL} y2={padTop + tH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padTop + tH} x2={W - padR} y2={padTop + tH} stroke="#bbb" strokeWidth="1" />
      {tempTicks.map((t, i) => <text key={i} x={padL - 4} y={tyS(t) + 3.5} textAnchor="end" fontSize="8" fill="#888">{t}°</text>)}

      {/* Temp range bars */}
      {data.map((d, i) => {
        const cx = padL + (i + 0.5) * colW;
        const x = cx - barW / 2;
        if (d.temp_max_c === null && d.temp_min_c === null) return null;
        const maxC = d.temp_max_c ?? d.temp_min_c!;
        const minC = d.temp_min_c ?? d.temp_max_c!;
        const yTop = tyS(maxC);
        const yBot = tyS(minC);
        const h = Math.max(yBot - yTop, 2);
        const tempMid = (maxC + minC) / 2;
        const barColor = tempMid > 20 ? "#ef5350" : tempMid > 12 ? "#ff9800" : "#42a5f5";
        return (
          <g key={i}>
            <rect x={x} y={yTop} width={barW} height={h} fill={barColor} opacity={0.75} rx={2} />
            <text x={cx} y={yTop - 3} textAnchor="middle" fontSize="7.5" fill={barColor} fontWeight="600">{Math.round(maxC)}°</text>
            <text x={cx} y={yBot + 9} textAnchor="middle" fontSize="7.5" fill={barColor}>{Math.round(minC)}°</text>
            <text x={cx} y={padTop + tH + 13} textAnchor="middle" fontSize="8" fill="#555">{d.year}</text>
          </g>
        );
      })}

      {/* Precip panel */}
      <g transform={`translate(0,${tempH + gap})`}>
        {/* Top gridline + max label */}
        <line x1={padL} y1={pyTop} x2={W - padR} y2={pyTop} stroke="#eee" strokeWidth="1" />
        <text x={padL - 4} y={pyTop + 3.5} textAnchor="end" fontSize="7.5" fill="#aaa">{precipMax}</text>
        {/* Y-axis + baseline */}
        <line x1={padL} y1={pyTop} x2={padL} y2={pyBaseline} stroke="#bbb" strokeWidth="1" />
        <line x1={padL} y1={pyBaseline} x2={W - padR} y2={pyBaseline} stroke="#bbb" strokeWidth="1" />
        {/* "mm" unit label */}
        <text x={padL + 4} y={pyTop - 2} textAnchor="start" fontSize="7.5" fill="#888">mm</text>
        {data.map((d, i) => {
          const cx = padL + (i + 0.5) * colW;
          const mm = d.precipitation_mm ?? 0;
          const barH = Math.max((mm / precipMax) * pHinner, mm > 0 ? 2 : 0);
          const yTop = pyS(mm);
          return (
            <g key={i}>
              <rect x={cx - barW / 2} y={yTop} width={barW} height={barH} fill="#1565c0" opacity={0.65} rx={1} />
              {mm > 0 && <text x={cx} y={yTop - 2} textAnchor="middle" fontSize="7" fill="#1565c0">{mm.toFixed(1)}</text>}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function PageNumber({ n }: { n: number }) {
  return <div style={{ position: "absolute", bottom: "24px", right: "48px", fontSize: "11px", color: "#aaa" }}>{n}</div>;
}

/* ── Main page ── */
export default function StandaloneRaceStrategyPage() {
  const supabase = createClient();

  const [races, setRaces]               = useState<RaceOption[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [hours, setHours]               = useState("");
  const [minutes, setMinutes]           = useState("");
  const [raceDate, setRaceDate]         = useState("");   // "YYYY-MM-DD"
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState("");
  const [result, setResult]             = useState<GenerateResponse | null>(null);
  const [weather, setWeather]           = useState<WeatherDayRecord[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Derived
  const elevProfile  = result ? parseElevProfile(result.elevation_profile) : null;
  const sustainedSegs = result ? parseSustainedSegs(result.sustained_segments) : null;
  const notable = (sustainedSegs ?? []).filter(s => s.type !== "flat").sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM)).slice(0, 5);
  const windData = result?.wind_sections ?? [];
  const hasWind  = windData.length > 0;
  const pacing   = result?.pacing ?? [];
  const totalMinutes = pacing.reduce((sum, sec) => { const p = parsePaceToMinutes(sec.target_pace); return p ? sum + (sec.end_km - sec.start_km) * p : sum; }, 0);
  const totalEffortMinutes = hasWind ? pacing.reduce((sum, sec) => { const ep = computeEffortPace(sec, windData); const epMin = ep ? parsePaceToMinutes(ep) : null; return epMin ? sum + (sec.end_km - sec.start_km) * epMin : sum; }, 0) : 0;
  const checkpoints = buildCheckpoints(pacing, hasWind ? windData : []);

  // Weather-derived averages for temp/rain effort columns
  const avgTempC = weather.length > 0
    ? weather.reduce((s, d) => s + ((d.temp_max_c ?? 0) + (d.temp_min_c ?? 0)) / 2, 0) / weather.length
    : null;
  const avgPrecipMm = weather.length > 0
    ? weather.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0) / weather.length
    : null;
  const hasTemp  = avgTempC  !== null;
  const hasRain  = avgPrecipMm !== null;
  const tMult    = hasTemp  ? tempMultiplier(avgTempC!)    : 1;
  const pMult    = hasRain  ? precipMultiplier(avgPrecipMm!) : 1;

  const tableHeaders = [
    "#", "km Range", "Distance", "Section Type", "Target Pace",
    ...(hasWind  ? ["Wind Effort"]  : []),
    ...(hasTemp  ? ["Temp Effort"]  : []),
    ...(hasRain  ? ["Rain Effort"]  : []),
    "Pace Band", "Section Time",
  ];
  const totalCols = tableHeaders.length;

  // Load races with profiles
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("race_profiles")
        .select("race_id, total_distance_km, total_ascent_m, profile_source, metadata")
        .order("race_id");
      if (!data) return;
      const raceIds = data.map(r => r.race_id);
      const { data: raceRows } = await supabase
        .from("races")
        .select("id, name")
        .in("id", raceIds)
        .order("name");
      const nameMap = new Map((raceRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
      setRaces(data.map(r => ({
        race_id:           r.race_id,
        race_name:         nameMap.get(r.race_id) ?? (r.metadata as { race_name?: string })?.race_name ?? r.race_id,
        total_distance_km: r.total_distance_km,
        total_ascent_m:    r.total_ascent_m,
        has_wind:          r.profile_source === "gpx_wind",
      })));
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    if (!selectedRaceId) { setGenError("Please select a race."); return; }
    const h = parseInt(hours || "0", 10);
    const m = parseInt(minutes || "0", 10);
    const target_minutes = h * 60 + m;
    if (target_minutes <= 0) { setGenError("Please enter a target time."); return; }

    setGenerating(true);
    setGenError("");
    setResult(null);
    setWeather([]);

    const res = await fetch("/api/race-strategy/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ race_id: selectedRaceId, target_minutes }),
    });
    const json = await res.json() as GenerateResponse & { error?: string };

    if (!res.ok || json.error) {
      setGenError(json.error ?? "Failed to generate strategy.");
      setGenerating(false);
      return;
    }

    setResult(json);
    setGenerating(false);

    // Auto-populate date from race_dates if not already set
    const effectiveDate = raceDate || json.race.race_date || "";
    if (!raceDate && json.race.race_date) setRaceDate(json.race.race_date);

    // Fetch weather if we have a date + coordinates
    if (effectiveDate && json.race.weather_lat !== null && json.race.weather_lon !== null) {
      const [, monthStr, dayStr] = effectiveDate.split("-");
      setWeatherLoading(true);
      try {
        const wRes = await fetch("/api/race-analysis/weather-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: json.race.weather_lat, lon: json.race.weather_lon, month: parseInt(monthStr, 10), day: parseInt(dayStr, 10) }),
        });
        if (wRes.ok) {
          const wJson = await wRes.json() as { data: WeatherDayRecord[] };
          setWeather(wJson.data ?? []);
        }
      } catch { /* weather is optional */ }
      setWeatherLoading(false);
    }
  }

  const thStyle: React.CSSProperties = { textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "11px" };
  const tdStyle: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid #eee", fontSize: "12px" };

  return (
    <main style={{ minHeight: "100vh", background: "#f9f9f9" }}>
      {/* Config panel */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "24px 32px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Race</div>
          <select value={selectedRaceId} onChange={e => setSelectedRaceId(e.target.value)} style={inputStyle}>
            <option value="">— Select race —</option>
            {races.map(r => (
              <option key={r.race_id} value={r.race_id}>
                {r.race_name} · {r.total_distance_km.toFixed(1)} km · {Math.round(r.total_ascent_m)}m ↑{r.has_wind ? " · wind ✓" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Target time</div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input type="number" min={0} max={99} value={hours} onChange={e => setHours(e.target.value)} placeholder="h" style={{ ...inputStyle, width: "64px" }} />
            <span style={{ color: "#555", fontSize: "14px" }}>h</span>
            <input type="number" min={0} max={59} value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="mm" style={{ ...inputStyle, width: "64px" }} />
            <span style={{ color: "#555", fontSize: "14px" }}>min</span>
          </div>
        </div>
        <div>
          <div style={labelStyle}>Race date <span style={{ color: "#aaa", fontWeight: 400 }}>(auto-filled from database · used for weather history)</span></div>
          <input type="date" value={raceDate} onChange={e => setRaceDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating} style={generateBtn}>
            {generating ? "Generating…" : "Generate Strategy"}
          </button>
          {genError && <span style={{ fontSize: "12px", color: "#b00020" }}>{genError}</span>}
        </div>
        {result && (
          <button type="button" onClick={() => window.print()} style={printBtn}>Export to PDF</button>
        )}
      </div>

      {/* A4 canvas */}
      {result && (
        <div style={canvas}>
          {/* ── Page 1: Race Strategy ── */}
          <div style={a4Page}>
            {/* Header */}
            <div style={printHeader}>
              <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Strategy</div>
              </div>
            </div>

            <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Race Strategy</h2>

            {/* Summary stats */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
              {[
                { label: "Target finish", value: formatRaceTime(totalMinutes), large: true },
                { label: "Total distance", value: `${result.race.total_distance_km.toFixed(1)} km` },
                { label: "Total ascent", value: `${Math.round(result.race.total_ascent_m)} m` },
                { label: "Sections", value: String(pacing.length) },
              ].map(({ label, value, large }) => (
                <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
                  <div style={{ color: "#888", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontWeight: 700, color: "#1e3a1e", fontSize: large ? "20px" : "13px" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Elevation + pace chart */}
            {elevProfile && (
              <div style={{ marginBottom: "20px" }}>
                <p style={sectionLabel}>Elevation &amp; Target Pace</p>
                <ElevationChart profile={elevProfile} notable={notable} pacing={pacing} />
              </div>
            )}

            {/* Route map */}
            {result.route.length > 1 && (
              <div style={{ marginBottom: "20px" }}>
                <p style={sectionLabel}>Route &amp; Wind Conditions{hasWind && " — arrows show wind direction · colour shows headwind risk"}</p>
                <RouteMap route={result.route} windSections={windData.length ? windData : undefined} />
              </div>
            )}

            {/* Pacing table */}
            <p style={sectionLabel}>Section Pacing Plan</p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr>{tableHeaders.map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {pacing.map((sec, i) => {
                  const dist = sec.end_km - sec.start_km;
                  const tPaceMin = parsePaceToMinutes(sec.target_pace);
                  const sectionMins = tPaceMin !== null ? dist * tPaceMin : null;
                  const rowBg = i % 2 === 0 ? "#fff" : "#fafafa";
                  const windPace    = hasWind ? computeEffortPace(sec, windData) : null;
                  const tempPace    = hasTemp ? applyMultiplierToPace(sec.target_pace, tMult) : null;
                  const rainPace    = hasRain ? applyMultiplierToPace(sec.target_pace, pMult) : null;
                  const paceColor = (pace: string | null) => {
                    const pm = pace ? parsePaceToMinutes(pace) : null;
                    if (pm === null || tPaceMin === null) return "#777";
                    return pm > tPaceMin + 0.01 ? "#e65100" : pm < tPaceMin - 0.01 ? "#2e7d32" : "#777";
                  };
                  return (
                    <tr key={i} style={{ background: rowBg }}>
                      <td style={{ ...tdStyle, color: "#888" }}>{i + 1}</td>
                      <td style={tdStyle}>{sec.start_km.toFixed(1)}–{sec.end_km.toFixed(1)} km</td>
                      <td style={tdStyle}>{dist.toFixed(1)} km</td>
                      <td style={tdStyle}>{formatSectionType(sec.section_type)}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: "#c0392b" }}>{sec.target_pace}</td>
                      {hasWind && <td style={{ ...tdStyle, fontWeight: 600, color: paceColor(windPace) }}>{windPace ?? "—"}</td>}
                      {hasTemp && <td style={{ ...tdStyle, fontWeight: 600, color: paceColor(tempPace) }}>{tempPace ?? "—"}</td>}
                      {hasRain && <td style={{ ...tdStyle, fontWeight: 600, color: paceColor(rainPace) }}>{rainPace ?? "—"}</td>}
                      <td style={{ ...tdStyle, color: "#777" }}>{sec.pace_band}</td>
                      <td style={{ ...tdStyle, color: "#555" }}>{sectionMins !== null ? formatRaceTime(sectionMins) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f9f9f9", borderTop: "2px solid #1e3a1e" }}>
                  <td colSpan={totalCols - 1} style={{ ...tdStyle, fontWeight: 600, color: "#1e3a1e", textAlign: "right", paddingRight: "16px", borderBottom: "none" }}>Total — Target Pace</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#1e3a1e", borderBottom: "none" }}>{totalMinutes > 0 ? formatRaceTime(totalMinutes) : "—"}</td>
                </tr>
                {hasWind && totalEffortMinutes > 0 && (
                  <tr style={{ background: "#fff8f5" }}>
                    <td colSpan={totalCols - 1} style={{ ...tdStyle, fontWeight: 600, color: "#e65100", textAlign: "right", paddingRight: "16px", borderBottom: "none" }}>Total — Wind Effort</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#e65100", borderBottom: "none" }}>{formatRaceTime(totalEffortMinutes)}</td>
                  </tr>
                )}
                {hasTemp && totalMinutes > 0 && (
                  <tr style={{ background: "#fff8f5" }}>
                    <td colSpan={totalCols - 1} style={{ ...tdStyle, fontWeight: 600, color: "#e65100", textAlign: "right", paddingRight: "16px", borderBottom: "none" }}>Total — Temp Effort</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#e65100", borderBottom: "none" }}>{formatRaceTime(totalMinutes * tMult)}</td>
                  </tr>
                )}
                {hasRain && totalMinutes > 0 && (
                  <tr style={{ background: "#fff8f5" }}>
                    <td colSpan={totalCols - 1} style={{ ...tdStyle, fontWeight: 600, color: "#e65100", textAlign: "right", paddingRight: "16px", borderBottom: "none" }}>Total — Rain Effort</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: "#e65100", borderBottom: "none" }}>{formatRaceTime(totalMinutes * pMult)}</td>
                  </tr>
                )}
              </tfoot>
            </table>

            {/* Checkpoints */}
            {checkpoints.length > 0 && (
              <div style={{ marginTop: "24px" }}>
                <p style={sectionLabel}>Time Checkpoints</p>
                <table style={{ borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, minWidth: "140px" }}>Point</th>
                      <th style={thStyle}>Target Pace</th>
                      {hasWind && <th style={thStyle}>Wind Effort</th>}
                      {hasTemp && <th style={thStyle}>Temp Effort</th>}
                      {hasRain && <th style={thStyle}>Rain Effort</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {checkpoints.map((cp, i) => (
                      <tr key={i} style={{ background: cp.isHighlight ? "#f0f7f0" : i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ ...tdStyle, fontWeight: cp.isHighlight ? 700 : 400, color: cp.isHighlight ? "#1e3a1e" : "#333" }}>{cp.label}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: "#1e3a1e" }}>{formatRaceTime(cp.targetMinutes)}</td>
                        {hasWind && <td style={{ ...tdStyle, fontWeight: 600, color: "#e65100" }}>{formatRaceTime(cp.effortMinutes)}</td>}
                        {hasTemp && <td style={{ ...tdStyle, fontWeight: 600, color: "#e65100" }}>{formatRaceTime(cp.targetMinutes * tMult)}</td>}
                        {hasRain && <td style={{ ...tdStyle, fontWeight: 600, color: "#e65100" }}>{formatRaceTime(cp.targetMinutes * pMult)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Conditions summary note */}
            {(hasTemp || hasRain) && (
              <p style={{ margin: "16px 0 0", fontSize: "11px", color: "#888", fontStyle: "italic" }}>
                Effort paces based on historical averages for this race date:{" "}
                {hasTemp && `avg temperature ${avgTempC!.toFixed(1)}°C`}
                {hasTemp && hasRain && " · "}
                {hasRain && `avg rainfall ${avgPrecipMm!.toFixed(1)} mm`}
                {". "}
                Wind effort varies per section.
              </p>
            )}

            {/* Citations */}
            {(hasWind || hasTemp || hasRain) && (
              <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid #eee" }}>
                <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Performance models</p>
                {hasWind && <>
                  <p style={{ margin: "0 0 3px", fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>Pugh, L.G.C.E. (1971). The influence of wind resistance in running and walking and the mechanical efficiency of work against horizontal or vertical forces. <em>Journal of Physiology</em>, 213(2), 255–276.</p>
                  <p style={{ margin: "0 0 5px", fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>Davies, C.T.M. (1980). Effects of wind assistance and resistance on the forward motion of a runner. <em>Journal of Applied Physiology</em>, 48(4), 702–709.</p>
                </>}
                {hasTemp && <p style={{ margin: "0 0 3px", fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>Ely, M.R. et al. (2007). Impact of weather on marathon-running performance. <em>Medicine &amp; Science in Sports &amp; Exercise</em>, 39(3), 487–493.</p>}
                {hasTemp && <p style={{ margin: "0 0 3px", fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>Vihma, T. (2010). Effects of weather on the performance of marathon runners. <em>International Journal of Biometeorology</em>, 54(3), 297–306.</p>}
              </div>
            )}

            <PageNumber n={1} />
          </div>

          {/* ── Page 2: Historical Weather (if date provided and data loaded) ── */}
          {(weather.length > 0 || weatherLoading) && (
            <div style={a4Page}>
              <div style={printHeader}>
                <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Historical Race-Day Weather</div>
                </div>
              </div>

              <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Historical Race-Day Weather</h2>
              {raceDate && (
                <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#666" }}>
                  Temperature and rainfall on {new Date(raceDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })} for the last {weather.length || "10"} years · ERA5 reanalysis data via Open-Meteo
                </p>
              )}

              {weatherLoading ? (
                <p style={{ color: "#888", fontSize: "13px" }}>Loading weather data…</p>
              ) : weather.length > 0 ? (
                <>
                  <p style={{ ...sectionLabel, marginBottom: "10px" }}>
                    Temperature range (°C) &amp; Precipitation (mm)
                  </p>
                  <WeatherChart data={weather} />

                  <div style={{ marginTop: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    {[
                      { label: "Avg max temp", value: `${(weather.reduce((s, d) => s + (d.temp_max_c ?? 0), 0) / weather.length).toFixed(1)}°C` },
                      { label: "Avg min temp", value: `${(weather.reduce((s, d) => s + (d.temp_min_c ?? 0), 0) / weather.length).toFixed(1)}°C` },
                      { label: "Avg rainfall", value: `${(weather.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0) / weather.length).toFixed(1)} mm` },
                      { label: "Wettest year", value: (() => { const w = [...weather].sort((a, b) => (b.precipitation_mm ?? 0) - (a.precipitation_mm ?? 0))[0]; return `${w.year} (${(w.precipitation_mm ?? 0).toFixed(1)} mm)`; })() },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
                        <div style={{ color: "#888", marginBottom: "2px" }}>{label}</div>
                        <div style={{ fontWeight: 700, color: "#111", fontSize: "13px" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Insight summaries */}
                  {(() => {
                    const { tempInsight, rainInsight } = generateWeatherInsights(weather);
                    return (
                      <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "14px 16px" }}>
                          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Temperature outlook</p>
                          <p style={{ margin: 0, fontSize: "12px", color: "#444", lineHeight: "1.6" }}>{tempInsight}</p>
                        </div>
                        <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "14px 16px" }}>
                          <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rainfall outlook</p>
                          <p style={{ margin: 0, fontSize: "12px", color: "#444", lineHeight: "1.6" }}>{rainInsight}</p>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid #eee" }}>
                    <p style={{ margin: "0 0 5px", fontSize: "10px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>Data source</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#aaa", lineHeight: "1.5" }}>
                      Hersbach, H. et al. (2023). ERA5 hourly data on single levels from 1940 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS). Retrieved via Open-Meteo Historical Weather API (archive-api.open-meteo.com).
                    </p>
                  </div>
                </>
              ) : null}

              <PageNumber n={2} />
            </div>
          )}
        </div>
      )}

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
    </main>
  );
}

/* ── Styles ── */
const a4Page: React.CSSProperties = { width: "794px", minHeight: "1123px", background: "#fff", padding: "40px 48px", boxSizing: "border-box", position: "relative", breakAfter: "page", pageBreakAfter: "always" };
const canvas: React.CSSProperties = { background: "#6b6b6b", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" };
const printHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #1e3a1e", paddingBottom: "12px", marginBottom: "24px" };
const logoImg: React.CSSProperties = { height: "36px", width: "auto", objectFit: "contain" };
const sectionLabel: React.CSSProperties = { margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px" };
const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none" };
const generateBtn: React.CSSProperties = { padding: "10px 24px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px" };
const printBtn: React.CSSProperties = { padding: "10px 20px", border: "1px solid #1e3a1e", borderRadius: "8px", background: "#fff", color: "#1e3a1e", fontWeight: 600, cursor: "pointer", fontSize: "14px" };

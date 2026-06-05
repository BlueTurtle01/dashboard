"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeatherDayRecord } from "@/lib/race-analysis/open-meteo";

/* ── API types ── */
interface RaceMeta {
  id: string; name: string;
  total_distance_km: number; total_ascent_m: number; total_descent_m: number;
  race_date: string | null; weather_lat: number | null; weather_lon: number | null;
}
interface TerrainSection {
  start_km: number; end_km: number; distance_km: number;
  section_type: string; avg_gradient_percent: number; ascent_m: number; descent_m: number;
}
interface WindSection {
  section_id: number; start_km: number; end_km: number;
  mid_lat: number; mid_lon: number; bearing_deg: number;
  median_wind_speed_ms: number; median_headwind_ms: number; median_crosswind_ms: number;
  wind_risk_label: string;
}
interface OverviewResponse {
  race: RaceMeta;
  route: { lat: number; lon: number }[];
  wind_sections: WindSection[] | null;
  elevation_profile: string | null;
  sustained_segments: string | null;
  terrain_sections: TerrainSection[];
}
interface DistributionBucket { min_min: number; max_min: number; count: number; }
interface ResultsResponse {
  has_data: boolean; latest_year?: number; total_finishers?: number;
  distribution?: DistributionBucket[];
}
interface RaceOption {
  race_id: string; race_name: string; total_distance_km: number; total_ascent_m: number;
}

/* ── Elevation types ── */
interface ElevationPoint { distanceKm: number; elevationM: number; }
interface RaceElevProfile {
  points: ElevationPoint[]; totalDistanceKm: number;
  minElevationM: number; maxElevationM: number;
}
interface RaceSustainedSeg {
  startKm: number; endKm: number; totalElevationM: number;
  type: "climb" | "descent" | "flat";
}

/* ── Parsers ── */
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

/* ── Helpers ── */
function formatRaceTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  const adjM = m === 60 ? 0 : m;
  const adjH = m === 60 ? h + 1 : h;
  return `${adjH}h ${adjM.toString().padStart(2, "0")}m`;
}

function formatSectionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ── OSM helpers ── */
function osmMercX(lon: number) { return (lon + 180) / 360; }
function osmMercY(lat: number) { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
function osmTileX(lon: number, z: number) { return Math.floor(osmMercX(lon) * Math.pow(2, z)); }
function osmTileY(lat: number, z: number) { return Math.floor(osmMercY(lat) * Math.pow(2, z)); }
function windRiskColor(label: string) { if (label.includes("high")) return "#c62828"; if (label.includes("moderate")) return "#e65100"; return "#546e7a"; }
type OsmTile = { url: string; x: number; y: number; w: number; h: number };

/* ── Downsample ── */
function downsample(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

/* ── ElevationChart (terrain only, no pace overlay) ── */
function ElevationChart({ profile, notable }: { profile: RaceElevProfile; notable: RaceSustainedSeg[] }) {
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

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((elev, i) => <line key={i} x1={padL} y1={yS(elev)} x2={W - padR} y2={yS(elev)} stroke="#eee" strokeWidth="1" />)}
      {notable.map((seg, i) => (
        <rect key={i}
          x={xS(seg.startKm)} y={padT}
          width={Math.max(xS(seg.endKm) - xS(seg.startKm), 1)} height={cH}
          fill={seg.type === "climb" ? "#ff980018" : "#1565c018"} />
      ))}
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
      {notable.map((seg, i) => {
        const midX = xS((seg.startKm + seg.endKm) / 2);
        const isClimb = seg.type === "climb";
        return <text key={i} x={midX} y={padT - 3} textAnchor="middle" fontSize="8" fontWeight="700" fill={isClimb ? "#bf360c" : "#0d47a1"}>{isClimb ? "▲" : "▼"} {Math.abs(Math.round(seg.totalElevationM))}m</text>;
      })}
    </svg>
  );
}

/* ── RouteMap ── */
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
    for (let tx = tx0; tx <= tx1; tx++)
      for (let ty = ty0; ty <= ty1; ty++)
        newTiles.push({ url: `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`, x: ox + (tx * tsz - mx0) * sc, y: oy + (ty * tsz - my0) * sc, w: tsz * sc, h: tsz * sc });
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
      <text x={width - 4} y={height - 4} textAnchor="end" fontSize="7.5" fill="#555">© OpenStreetMap contributors</text>
    </svg>
  );
}

/* ── Terrain breakdown bar ── */
function TerrainBar({ label, km, pct, color }: { label: string; km: number; pct: number; color: string }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "3px" }}>
        <span style={{ color: "#444", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#888" }}>{km.toFixed(1)} km · {pct.toFixed(0)}%</span>
      </div>
      <div style={{ height: "8px", background: "#eee", borderRadius: "4px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "4px" }} />
      </div>
    </div>
  );
}

/* ── Distribution mini chart ── */
function DistributionMini({ dist, totalFinishers }: { dist: DistributionBucket[]; totalFinishers: number }) {
  if (dist.length === 0) return null;
  const W = 320, H = 70, padL = 6, padR = 6, padT = 6, padB = 18;
  const chartW = W - padL - padR, chartH = H - padT - padB;
  const maxCount = Math.max(...dist.map(b => b.count), 1);
  const barW = Math.max(chartW / dist.length - 1.5, 3);

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {dist.map((b, i) => {
        const bH = Math.max((b.count / maxCount) * chartH, 1);
        const x = padL + i * (chartW / dist.length);
        const y = padT + chartH - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bH} fill="#1e3a1e" opacity={0.55} rx={1} />
          </g>
        );
      })}
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      {[dist[0], dist[Math.floor(dist.length / 2)], dist[dist.length - 1]].filter(Boolean).map((b, i) => {
        const positions = [0, Math.floor(dist.length / 2), dist.length - 1];
        const x = padL + positions[i] * (chartW / dist.length);
        return <text key={i} x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="7.5" fill="#888">{b.min_min}m</text>;
      })}
      <text x={W / 2} y={padT + 8} textAnchor="middle" fontSize="7" fill="#aaa">{totalFinishers.toLocaleString()} finishers</text>
    </svg>
  );
}

/* ── Page number ── */
function PageNumber({ n }: { n: number }) {
  return <div style={{ position: "absolute", bottom: "24px", right: "48px", fontSize: "11px", color: "#aaa" }}>{n}</div>;
}

/* ── Style constants (matching race-strategy palette) ── */
const a4Page: React.CSSProperties = { width: "794px", minHeight: "1123px", background: "#fff", padding: "40px 48px", boxSizing: "border-box", position: "relative", breakAfter: "page", pageBreakAfter: "always" };
const canvas: React.CSSProperties = { background: "#6b6b6b", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" };
const printHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #1e3a1e", paddingBottom: "12px", marginBottom: "24px" };
const logoImg: React.CSSProperties = { height: "36px", width: "auto", objectFit: "contain" };
const sectionLabel: React.CSSProperties = { margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" };
const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px" };
const inputStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none" };
const generateBtn: React.CSSProperties = { padding: "10px 24px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px" };
const printBtn: React.CSSProperties = { padding: "10px 20px", border: "1px solid #1e3a1e", borderRadius: "8px", background: "#fff", color: "#1e3a1e", fontWeight: 600, cursor: "pointer", fontSize: "14px" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "4px 8px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "10px" };
const tdStyle: React.CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #eee", fontSize: "11px" };

/* ── Main page ── */
export default function RaceReadinessPage() {
  const supabase = createClient();

  const [races, setRaces]           = useState<RaceOption[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState("");
  const [result, setResult]         = useState<OverviewResponse | null>(null);
  const [weather, setWeather]       = useState<WeatherDayRecord[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [results, setResults]       = useState<ResultsResponse | null>(null);

  // Derived
  const elevProfile = result ? parseElevProfile(result.elevation_profile) : null;
  const sustainedSegs = result ? parseSustainedSegs(result.sustained_segments) : null;
  const notable = (sustainedSegs ?? [])
    .filter(s => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);
  const windData = result?.wind_sections ?? [];

  // Terrain breakdown aggregation
  const terrainSummary = (() => {
    const secs = result?.terrain_sections ?? [];
    const total = secs.reduce((s, t) => s + t.distance_km, 0);
    const climbing   = secs.filter(s => s.section_type.includes("climb")).reduce((s, t) => s + t.distance_km, 0);
    const descending = secs.filter(s => s.section_type.includes("descent")).reduce((s, t) => s + t.distance_km, 0);
    const flat = Math.max(0, total - climbing - descending);
    return { total, climbing, descending, flat };
  })();

  // Race date for display
  const raceDate = result?.race.race_date ?? null;
  const raceDateLabel = raceDate
    ? new Date(raceDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // Weather-derived summary
  const avgMaxTemp = weather.length > 0 ? weather.reduce((s, d) => s + (d.temp_max_c ?? 0), 0) / weather.length : null;
  const avgMinTemp = weather.length > 0 ? weather.reduce((s, d) => s + (d.temp_min_c ?? 0), 0) / weather.length : null;
  const avgPrecip  = weather.length > 0 ? weather.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0) / weather.length : null;
  const wetPct     = weather.length > 0 ? Math.round((weather.filter(d => (d.precipitation_mm ?? 0) > 1).length / weather.length) * 100) : null;

  // Results-derived stats
  const raceStats = (() => {
    if (!results?.has_data || !results.distribution?.length) return null;
    const dist = results.distribution;
    const total = results.total_finishers ?? 0;
    const fastestMin = dist[0].min_min;
    let cumulative = 0;
    let medianMin = dist[Math.floor(dist.length / 2)].min_min;
    for (const b of dist) {
      cumulative += b.count;
      if (cumulative >= total / 2) { medianMin = (b.min_min + b.max_min) / 2; break; }
    }
    return { total, fastestMin, medianMin, year: results.latest_year };
  })();

  // Load races
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("race_profiles")
        .select("race_id, total_distance_km, total_ascent_m, metadata")
        .order("race_id");
      if (!data) return;
      const raceIds = data.map(r => r.race_id);
      const { data: raceRows } = await supabase
        .from("races").select("id, name").in("id", raceIds).order("name");
      const nameMap = new Map((raceRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
      setRaces(data.map(r => ({
        race_id:           r.race_id,
        race_name:         nameMap.get(r.race_id) ?? (r.metadata as { race_name?: string })?.race_name ?? r.race_id,
        total_distance_km: r.total_distance_km,
        total_ascent_m:    r.total_ascent_m,
      })));
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    if (!selectedRaceId) { setGenError("Please select a race."); return; }
    setGenerating(true);
    setGenError("");
    setResult(null);
    setWeather([]);
    setResults(null);

    const res = await fetch("/api/race-readiness/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ race_id: selectedRaceId }),
    });
    const json = await res.json() as OverviewResponse & { error?: string };
    if (!res.ok || json.error) {
      setGenError(json.error ?? "Failed to load race overview.");
      setGenerating(false);
      return;
    }
    setResult(json);
    setGenerating(false);

    // Fetch weather history
    const effectiveDate = json.race.race_date;
    if (effectiveDate && json.race.weather_lat !== null && json.race.weather_lon !== null) {
      const [, monthStr, dayStr] = effectiveDate.split("-");
      setWeatherLoading(true);
      try {
        const wRes = await fetch("/api/race-analysis/weather-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: json.race.weather_lat, lon: json.race.weather_lon, month: parseInt(monthStr, 10), day: parseInt(dayStr, 10) }),
        });
        if (wRes.ok) setWeather(((await wRes.json()) as { data: WeatherDayRecord[] }).data ?? []);
      } catch { /* weather optional */ }
      setWeatherLoading(false);
    }

    // Fetch race results (neutral query — we only use distribution + totals)
    try {
      const rRes = await fetch("/api/race-strategy/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: selectedRaceId, target_minutes: 600 }),
      });
      if (rRes.ok) setResults((await rRes.json()) as ResultsResponse);
    } catch { /* results optional */ }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f9f9f9" }}>
      {/* ── Config panel ── */}
      <div className="no-print" style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "24px 32px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Race</div>
          <select value={selectedRaceId} onChange={e => setSelectedRaceId(e.target.value)} style={inputStyle}>
            <option value="">— Select race —</option>
            {races.map(r => (
              <option key={r.race_id} value={r.race_id}>
                {r.race_name} · {r.total_distance_km.toFixed(1)} km · {Math.round(r.total_ascent_m)}m ↑
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating} style={generateBtn}>
            {generating ? "Loading…" : "Generate Overview"}
          </button>
          {genError && <span style={{ fontSize: "12px", color: "#b00020" }}>{genError}</span>}
        </div>
        {result && (
          <button type="button" onClick={() => window.print()} style={printBtn}>Export to PDF</button>
        )}
      </div>

      {/* ── A4 Canvas ── */}
      {result && (
        <div style={canvas} className="race-strategy-canvas">

          {/* ═══════════════════════════════════════════════════
              PAGE 1 — Race Overview
          ═══════════════════════════════════════════════════ */}
          <div style={a4Page}>
            {/* Header */}
            <div style={printHeader}>
              <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
              </div>
            </div>

            {/* Title */}
            <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Race Overview</h2>
            <p style={{ margin: "0 0 18px", fontSize: "12px", color: "#888" }}>
              Course profile, terrain character, and historical conditions
              {raceDateLabel ? ` · ${raceDateLabel}` : ""}
            </p>

            {/* Stats chips */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
              {[
                { label: "Distance",      value: `${result.race.total_distance_km.toFixed(1)} km` },
                { label: "Total ascent",  value: `${Math.round(result.race.total_ascent_m)} m ↑` },
                { label: "Total descent", value: `${Math.round(result.race.total_descent_m)} m ↓` },
                { label: "Climb / km",    value: `${(result.race.total_ascent_m / result.race.total_distance_km).toFixed(0)} m/km` },
                ...(raceDateLabel ? [{ label: "Race date", value: raceDateLabel }] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
                  <div style={{ color: "#888", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontWeight: 700, color: "#1e3a1e", fontSize: "13px" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Elevation profile */}
            {elevProfile && (
              <div style={{ marginBottom: "18px" }}>
                <p style={sectionLabel}>Course Elevation Profile</p>
                <ElevationChart profile={elevProfile} notable={notable} />
                {notable.length > 0 && (
                  <div style={{ marginTop: "4px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "9px", color: "#bf360c" }}>▲ amber = significant climb</span>
                    <span style={{ fontSize: "9px", color: "#0d47a1" }}>▼ blue = significant descent</span>
                  </div>
                )}
              </div>
            )}

            {/* Route map */}
            {result.route.length > 1 && (
              <div style={{ marginBottom: "18px" }}>
                <p style={sectionLabel}>
                  Course Map{windData.length > 0 && " — arrows show wind direction · colour shows headwind risk"}
                </p>
                <RouteMap route={result.route} windSections={windData.length ? windData : undefined} height={195} />
              </div>
            )}

            {/* Terrain + Notable segments — 2 columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
              {/* Terrain breakdown */}
              <div>
                <p style={sectionLabel}>Terrain Composition</p>
                <TerrainBar label="Climbing" km={terrainSummary.climbing} pct={terrainSummary.total > 0 ? (terrainSummary.climbing / terrainSummary.total) * 100 : 0} color="#c0392b" />
                <TerrainBar label="Descending" km={terrainSummary.descending} pct={terrainSummary.total > 0 ? (terrainSummary.descending / terrainSummary.total) * 100 : 0} color="#1565c0" />
                <TerrainBar label="Flat / Rolling" km={terrainSummary.flat} pct={terrainSummary.total > 0 ? (terrainSummary.flat / terrainSummary.total) * 100 : 0} color="#546e7a" />
              </div>

              {/* Notable segments */}
              {notable.length > 0 && (
                <div>
                  <p style={sectionLabel}>Key Segments</p>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Segment</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Elev.</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Dist.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notable.map((seg, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ ...tdStyle, color: seg.type === "climb" ? "#c0392b" : "#1565c0", fontWeight: 600 }}>
                            {seg.type === "climb" ? "▲" : "▼"} km {seg.startKm.toFixed(1)}–{seg.endKm.toFixed(1)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                            {seg.type === "climb" ? "+" : ""}{Math.round(seg.totalElevationM)}m
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", color: "#888" }}>
                            {(seg.endKm - seg.startKm).toFixed(1)} km
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Historical weather + Race history — 2 columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              {/* Weather summary */}
              <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "12px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Historical Weather
                </p>
                {weatherLoading ? (
                  <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>Loading weather data…</p>
                ) : weather.length > 0 && avgMaxTemp !== null ? (
                  <>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {[
                        { label: "Avg high", value: `${avgMaxTemp.toFixed(1)}°C` },
                        { label: "Avg low",  value: `${avgMinTemp!.toFixed(1)}°C` },
                        { label: "Avg rain", value: `${avgPrecip!.toFixed(1)} mm` },
                        { label: "Wet probability", value: `${wetPct}%` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ fontSize: "10px" }}>
                          <div style={{ color: "#aaa" }}>{label}</div>
                          <div style={{ fontWeight: 700, color: "#333", fontSize: "12px" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#555", lineHeight: "1.5" }}>
                      {(() => {
                        if (avgMaxTemp === null) return "";
                        const meanAvg = (avgMaxTemp + avgMinTemp!) / 2;
                        const wPct = wetPct ?? 0;
                        const tempNote = meanAvg < 5 ? "Cold conditions typical." :
                          meanAvg <= 13 ? "Near-optimal temperatures for performance." :
                          meanAvg <= 18 ? `Mild warmth (avg ${meanAvg.toFixed(0)}°C) — modest effort penalty.` :
                          `Warm conditions (avg ${meanAvg.toFixed(0)}°C) — plan for heat management.`;
                        const rainNote = wPct < 30 ? "Rain uncommon." :
                          wPct < 60 ? `Rain in ${wPct}% of years — pack wet-weather kit.` :
                          `Rain likely (${wPct}% of years) — wet conditions expected.`;
                        return `${tempNote} ${rainNote}`;
                      })()}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#bbb" }}>
                      ERA5 reanalysis · last {weather.length} years
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: "11px", color: "#aaa", margin: 0 }}>
                    {raceDate ? "No weather data available." : "No race date on record — weather history unavailable."}
                  </p>
                )}
              </div>

              {/* Race history */}
              <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "12px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Race History{raceStats?.year ? ` · ${raceStats.year}` : ""}
                </p>
                {raceStats ? (
                  <>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {[
                        { label: "Finishers",    value: raceStats.total.toLocaleString() },
                        { label: "Fastest time", value: formatRaceTime(raceStats.fastestMin) },
                        { label: "Median time",  value: formatRaceTime(raceStats.medianMin) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ fontSize: "10px" }}>
                          <div style={{ color: "#aaa" }}>{label}</div>
                          <div style={{ fontWeight: 700, color: "#333", fontSize: "12px" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {results?.distribution && (
                      <DistributionMini dist={results.distribution} totalFinishers={raceStats.total} />
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: "11px", color: "#aaa", margin: 0 }}>No results data on record for this race.</p>
                )}
              </div>
            </div>

            {/* Notable segments detail table (if space allows) */}
            {notable.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <p style={sectionLabel}>Segment Detail</p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr>
                      {["#", "Type", "km Range", "Distance", "Elevation change", "Avg Gradient"].map(h => (
                        <th key={h} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {notable.map((seg, i) => {
                      const len = seg.endKm - seg.startKm;
                      const avgGrad = len > 0 ? (Math.abs(seg.totalElevationM) / (len * 1000)) * 100 : 0;
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ ...tdStyle, color: "#888" }}>{i + 1}</td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: seg.type === "climb" ? "#c0392b" : "#1565c0" }}>
                            {seg.type === "climb" ? "▲ Climb" : "▼ Descent"}
                          </td>
                          <td style={tdStyle}>{seg.startKm.toFixed(1)}–{seg.endKm.toFixed(1)} km</td>
                          <td style={tdStyle}>{len.toFixed(1)} km</td>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>
                            {seg.type === "climb" ? "+" : ""}{Math.round(seg.totalElevationM)} m
                          </td>
                          <td style={{ ...tdStyle, color: "#555" }}>{avgGrad.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Data source note */}
            <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #eee" }}>
              <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: "1.5" }}>
                Course data derived from GPX file. Elevation data from ERA5 reanalysis. Race results from official published results.
                {weather.length > 0 && " Weather: Hersbach et al. (2023) ERA5 via Open-Meteo Historical Weather API."}
              </p>
            </div>

            <PageNumber n={1} />
          </div>
        </div>
      )}

      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .no-print { display: none !important; }
          .race-strategy-canvas { background: #fff !important; padding: 0 !important; gap: 0 !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </main>
  );
}

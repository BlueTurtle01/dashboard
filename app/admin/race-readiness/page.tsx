"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  section_type: string; terrain: string; avg_gradient_percent: number;
  ascent_m: number; descent_m: number; flat_equivalent_km: number;
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
interface HalfwayAnalysis {
  key: string; label: string;
  recommended_seconds: number; aggressive_seconds: number;
  typical_ratio: number; pct_positive_split: number; band_size: number;
}
interface LateAnalysis {
  key: string; label: string;
  avg_final_section_minutes: number;
  avg_fade_pct: number; controlled_pct: number; final_dist_note: string;
}
interface ResultsResponse {
  has_data: boolean; latest_year?: number; total_finishers?: number;
  distribution?: DistributionBucket[];
  halfway_analysis?: HalfwayAnalysis | null;
  late_analysis?: LateAnalysis | null;
}
interface RaceOption {
  race_id: string; race_name: string; total_distance_km: number | null; total_ascent_m: number | null;
}

/* ── Athlete types ── */
interface AthleteSearchHit {
  athlete_key: string;
  race_count: number;
  finish_count: number;
  first_result_year: number | null;
  last_result_year: number | null;
  career_span_years: number | null;
  avg_ascent_m: number | null;
  cluster_label: string | null;
}
interface AthleteProfile {
  athlete_key: string;
  gender: string | null;
  age_group: string | null;
  club: string | null;
  race_count: number;
  finish_count: number;
  dnf_count: number;
  dnf_rate: number | null;
  avg_perf_index: number | null;
  recency_perf_index: number | null;
  avg_flat_equiv_km: number | null;
  max_flat_equiv_km: number | null;
  avg_ascent_m: number | null;
  max_ascent_m: number | null;
  avg_difficulty_ratio: number | null;
  first_result_year: number | null;
  last_result_year: number | null;
  career_span_years: number | null;
  cluster_label: string | null;
}
interface AthleteRace {
  race_id: string;
  race_name: string;
  result_year: number;
  result_status: string;
  finish_seconds: number | null;
  position: number | null;
  age_group: string | null;
  gender: string | null;
  club: string | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  flat_equivalent_km: number | null;
  total_finishers: number | null;
}
interface TerrainPairing {
  section_type: string;
  terrain: string;
  total_km: number;
  race_count: number;
}
interface AthleteResponse {
  profile: AthleteProfile;
  races: AthleteRace[];
  terrain_pairings?: TerrainPairing[];
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

function formatSecs(totalSeconds: number): string {
  return formatRaceTime(totalSeconds / 60);
}

/* ── OSM helpers ── */
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

/* ══════════════════════════════════════════════════════════════════
   PAGE 1 COMPONENTS
══════════════════════════════════════════════════════════════════ */

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
      {notable.map((seg, i) => <rect key={i} x={xS(seg.startKm)} y={padT} width={Math.max(xS(seg.endKm) - xS(seg.startKm), 1)} height={cH} fill={seg.type === "climb" ? "#ff980018" : "#1565c018"} />)}
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
        return <rect key={i} x={x} y={y} width={barW} height={bH} fill="#1e3a1e" opacity={0.55} rx={1} />;
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

/* ══════════════════════════════════════════════════════════════════
   PAGE 3 COMPONENTS
══════════════════════════════════════════════════════════════════ */

/* Race search combobox — client-side filter over all loaded races */
function RaceSearchCombobox({ races, selectedId, onSelect }: {
  races: RaceOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selectedRace = races.find(r => r.race_id === selectedId);
  const [query, setQuery] = useState(selectedRace?.race_name ?? "");
  const [open, setOpen]   = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? races.filter(r => r.race_name.toLowerCase().includes(q)) : races;
    return list.slice(0, 30);
  }, [query, races]);

  function select(race: RaceOption) {
    setQuery(race.race_name);
    setOpen(false);
    onSelect(race.race_id);
  }

  const inS: React.CSSProperties = { ...inputStyle, width: "280px" };
  const dropS: React.CSSProperties = { position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "320px", maxHeight: "320px", overflowY: "auto", marginTop: "4px" };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder="Search races…"
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={inS}
      />
      {open && filtered.length > 0 && (
        <div style={dropS}>
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
                  {r.total_distance_km.toFixed(1)} km · {Math.round(r.total_ascent_m ?? 0)}m ↑
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Athlete search combobox — shown in the no-print config panel */
function AthleteSearchCombobox({ onSelect, selectedKey }: {
  onSelect: (key: string) => void;
  selectedKey: string;
}) {
  const [query, setQuery]       = useState(selectedKey);
  const [hits, setHits]         = useState<AthleteSearchHit[]>([]);
  const [open, setOpen]         = useState(false);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedKey && !query) setQuery(selectedKey);
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (value.trim().length < 2) { setHits([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(value.trim())}&limit=8`);
        if (res.ok) {
          const json = await res.json() as { athletes: AthleteSearchHit[] };
          setHits(json.athletes ?? []);
          setOpen(true);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  }

  function select(hit: AthleteSearchHit) {
    setQuery(hit.athlete_key);
    setOpen(false);
    setHits([]);
    onSelect(hit.athlete_key);
  }

  const inputS: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none", width: "260px" };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder="Search athlete name…"
        onChange={e => handleInput(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        style={inputS}
      />
      {searching && <span style={{ position: "absolute", right: "12px", top: "10px", fontSize: "11px", color: "#aaa" }}>…</span>}
      {open && hits.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "320px", maxHeight: "320px", overflowY: "auto", marginTop: "4px" }}>
          {hits.map(h => (
            <button
              key={h.athlete_key}
              type="button"
              onClick={() => select(h)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>{h.athlete_key}</div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px", display: "flex", gap: "10px" }}>
                <span>{h.race_count} race{h.race_count !== 1 ? "s" : ""}</span>
                {h.first_result_year && <span>{h.first_result_year}{h.last_result_year && h.last_result_year !== h.first_result_year ? `–${h.last_result_year}` : ""}</span>}
                {h.avg_ascent_m && <span>{Math.round(h.avg_ascent_m)}m avg ↑</span>}
                {h.cluster_label && <span style={{ color: "#1e3a1e", fontStyle: "italic" }}>{h.cluster_label}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Performance trend chart — scatter of finish time vs year */
function PerformanceTrendChart({ races, recentThreshold }: { races: AthleteRace[]; recentThreshold: number }) {
  const W = 698, H = 140, padL = 42, padR = 16, padT = 16, padB = 28;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  // Only races with both position and total_finishers, sorted chronologically
  type PlotPoint = { year: number; pct: number; raceName: string; pos: number; total: number; isRecent: boolean };
  const plotPts: PlotPoint[] = races
    .filter(r => r.result_status === "FINISHED" && r.position && r.total_finishers && r.total_finishers > 1)
    .sort((a, b) => a.result_year !== b.result_year ? a.result_year - b.result_year : (a.position ?? 999) - (b.position ?? 999))
    .map(r => ({
      year:     r.result_year,
      // % of field beaten: 100% = winner, 0% = last; higher = better
      pct:      ((r.total_finishers! - r.position!) / (r.total_finishers! - 1)) * 100,
      raceName: r.race_name,
      pos:      r.position!,
      total:    r.total_finishers!,
      isRecent: r.result_year >= recentThreshold,
    }));

  if (plotPts.length < 2) return null;

  const years   = plotPts.map(p => p.year);
  const minYear = Math.min(...years), maxYear = Math.max(...years);

  // X spread: if all same year use index order, otherwise spread by year
  const singleYear = minYear === maxYear;
  const xS = (p: PlotPoint, i: number) =>
    padL + (singleYear ? (i / (plotPts.length - 1)) * chartW : ((p.year - minYear) / (maxYear - minYear)) * chartW);
  // Y: 0% at bottom, 100% at top; add 5% padding each end
  const yS = (pct: number) => padT + chartH - ((pct / 100) * chartH);

  // Fixed Y ticks at 0, 25, 50, 75, 100
  const yTicks = [0, 25, 50, 75, 100];

  // X ticks — one per year, thinned if needed
  const xYears = Array.from(new Set(years)).sort((a, b) => a - b);
  const xStep  = xYears.length > 8 ? Math.ceil(xYears.length / 6) : 1;

  // Linear regression for trend line (on year → pct)
  const n  = plotPts.length;
  const mx = years.reduce((s, v) => s + v, 0) / n;
  const my = plotPts.map(p => p.pct).reduce((s, v) => s + v, 0) / n;
  const slope = plotPts.reduce((s, p) => s + (p.year - mx) * (p.pct - my), 0) /
    Math.max(plotPts.reduce((s, p) => s + (p.year - mx) ** 2, 0), 0.001);
  const intercept = my - slope * mx;
  const trendPct1 = Math.min(100, Math.max(0, intercept + slope * minYear));
  const trendPct2 = Math.min(100, Math.max(0, intercept + slope * maxYear));

  // Dot colour by percentile: top 10% = gold, top 25% = green, else slate
  function dotColor(pct: number, isRecent: boolean): string {
    if (pct >= 90) return "#e65100";   // top 10% — standout
    if (pct >= 75) return "#1e3a1e";   // top 25%
    if (isRecent)  return "#546e7a";
    return "#90a4ae";
  }

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Gridlines + Y labels */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)}
            stroke={t === 50 ? "#ddd" : "#f0f0f0"} strokeWidth={t === 50 ? "1.5" : "1"} strokeDasharray={t === 50 ? "4,3" : undefined} />
          <text x={padL - 5} y={yS(t) + 3.5} textAnchor="end" fontSize="8" fill="#aaa">{t}%</text>
        </g>
      ))}
      {/* Trend line */}
      {!singleYear && (
        <line
          x1={xS(plotPts[0], 0)} y1={yS(trendPct1)}
          x2={xS(plotPts[plotPts.length - 1], plotPts.length - 1)} y2={yS(trendPct2)}
          stroke={slope > 0 ? "#2e7d32" : "#c0392b"} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.55"
        />
      )}
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#ccc" strokeWidth="1" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#ccc" strokeWidth="1" />
      {/* X ticks */}
      {xYears.filter((_, i) => i % xStep === 0).map((yr, i) => (
        <g key={i}>
          <line x1={xS({ year: yr } as PlotPoint, i)} y1={padT + chartH} x2={xS({ year: yr } as PlotPoint, i)} y2={padT + chartH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS({ year: yr } as PlotPoint, i)} y={padT + chartH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{yr}</text>
        </g>
      ))}
      {/* Scatter dots */}
      {plotPts.map((p, i) => (
        <circle key={i} cx={xS(p, i)} cy={yS(p.pct)} r={5}
          fill={dotColor(p.pct, p.isRecent)} stroke="white" strokeWidth="1.5" opacity="0.9" />
      ))}
      {/* Y-axis label */}
      <text x={10} y={padT + chartH / 2} textAnchor="middle" fontSize="7.5" fill="#bbb"
        transform={`rotate(-90,10,${padT + chartH / 2})`}>field beaten</text>
      {/* Legend */}
      <circle cx={W - padR - 120} cy={padT + 8} r={4} fill="#e65100" />
      <text x={W - padR - 113} y={padT + 11} fontSize="7.5" fill="#666">Top 10%</text>
      <circle cx={W - padR - 70} cy={padT + 8} r={4} fill="#1e3a1e" />
      <text x={W - padR - 63} y={padT + 11} fontSize="7.5" fill="#666">Top 25%</text>
      <circle cx={W - padR - 18} cy={padT + 8} r={4} fill="#90a4ae" />
      <text x={W - padR - 11} y={padT + 11} fontSize="7.5" fill="#666">Rest</text>
    </svg>
  );
}

/* Race history rows — shared between recent and highlights sections */
function RaceHistoryRows({ races, highlightIds }: { races: AthleteRace[]; highlightIds?: Set<string> }) {
  function fmt(s: number | null) {
    if (!s || s <= 0) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  function statusBadge(status: string): { label: string; color: string } {
    if (status === "FINISHED" || status === "UNKNOWN") return { label: "Fin", color: "#2e7d32" };
    if (status === "DNF") return { label: "DNF", color: "#c0392b" };
    if (status === "DNS") return { label: "DNS", color: "#888" };
    return { label: status.slice(0, 3), color: "#888" };
  }
  const thS: React.CSSProperties = { textAlign: "left", padding: "3px 7px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "9.5px" };
  const tdS: React.CSSProperties = { padding: "3px 7px", borderBottom: "1px solid #eee", fontSize: "10.5px" };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...thS, width: "28%" }}>Race</th>
          <th style={{ ...thS, width: "6%" }}>Year</th>
          <th style={thS}>Status</th>
          <th style={thS}>Time</th>
          <th style={thS}>Position</th>
          <th style={thS}>Dist</th>
          <th style={thS}>Ascent</th>
          <th style={{ ...thS, width: "6%" }}>Cat</th>
        </tr>
      </thead>
      <tbody>
        {races.map((r, i) => {
          const { label: statusLabel, color: statusColor } = statusBadge(r.result_status);
          const isHighlight = highlightIds?.has(`${r.race_id}|${r.result_year}`);
          const posPct = r.position && r.total_finishers
            ? Math.round((r.position / r.total_finishers) * 100) : null;
          const rowBg = isHighlight ? "#fffbf0" : i % 2 === 0 ? "#fff" : "#fafafa";
          return (
            <tr key={i} style={{ background: rowBg }}>
              <td style={{ ...tdS, fontWeight: isHighlight ? 600 : 400, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isHighlight && <span style={{ color: "#e65100", marginRight: "4px", fontSize: "9px" }}>★</span>}
                {r.race_name}
              </td>
              <td style={{ ...tdS, color: "#888" }}>{r.result_year}</td>
              <td style={{ ...tdS, fontWeight: 600, color: statusColor }}>{statusLabel}</td>
              <td style={{ ...tdS, fontFamily: "monospace", fontSize: "10px" }}>{fmt(r.finish_seconds)}</td>
              <td style={{ ...tdS, fontSize: "10px" }}>
                {r.position ? (
                  <span>
                    {r.position}
                    {r.total_finishers ? <span style={{ color: "#aaa", fontSize: "9px" }}>/{r.total_finishers}</span> : ""}
                    {posPct !== null ? <span style={{ color: posPct <= 10 ? "#2e7d32" : posPct <= 25 ? "#1565c0" : "#888", fontSize: "9px", marginLeft: "3px" }}>({posPct}%)</span> : ""}
                  </span>
                ) : "—"}
              </td>
              <td style={{ ...tdS, color: "#666" }}>{r.total_distance_km ? `${r.total_distance_km.toFixed(0)}km` : "—"}</td>
              <td style={{ ...tdS, color: "#666" }}>{r.total_ascent_m ? `${Math.round(r.total_ascent_m)}m` : "—"}</td>
              <td style={{ ...tdS, color: "#888", fontSize: "9.5px" }}>{r.age_group ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PAGE 2 COMPONENTS
══════════════════════════════════════════════════════════════════ */

const GRAD_BANDS = [
  { label: "≥15% ↑",   min:  15, max:  999, color: "#c0392b", textColor: "#c0392b" },
  { label: "8–15% ↑",  min:   8, max:   15, color: "#e65100", textColor: "#e65100" },
  { label: "3–8% ↑",   min:   3, max:    8, color: "#ff9800", textColor: "#bf6e00" },
  { label: "0–3%",     min:  -3, max:    3, color: "#78909c", textColor: "#546e7a" },
  { label: "3–8% ↓",   min:  -8, max:   -3, color: "#64b5f6", textColor: "#1565c0" },
  { label: "8–15% ↓",  min: -15, max:   -8, color: "#1976d2", textColor: "#1565c0" },
  { label: "≥15% ↓",   min: -999, max: -15, color: "#0d47a1", textColor: "#0d47a1" },
];

function gradientBandColor(grad: number): string {
  for (const b of GRAD_BANDS) {
    if (grad >= b.min && grad < b.max) return b.color;
  }
  return "#78909c";
}

/* Gradient distribution histogram */
function GradientHistogram({ sections }: { sections: TerrainSection[] }) {
  const W = 698, H = 130, padL = 48, padR = 12, padT = 16, padB = 30;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const bands = GRAD_BANDS.map(b => ({
    ...b,
    km: sections
      .filter(s => s.avg_gradient_percent >= b.min && s.avg_gradient_percent < b.max)
      .reduce((sum, s) => sum + s.distance_km, 0),
  }));

  const maxKm = Math.max(...bands.map(b => b.km), 0.1);
  const barW = (chartW / bands.length) - 4;
  const yS = (km: number) => padT + chartH - (km / maxKm) * chartH;

  // y-axis ticks at nice intervals
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
            {b.km > 0.1 && (
              <text x={x + barW / 2} y={y - 3} textAnchor="middle" fontSize="7.5" fill={b.textColor} fontWeight="600">
                {b.km.toFixed(1)}
              </text>
            )}
            <text x={x + barW / 2} y={padT + chartH + 11} textAnchor="middle" fontSize="8" fill="#555">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* Cumulative ascent line chart */
function CumulativeAscentChart({ profile }: { profile: RaceElevProfile }) {
  const W = 698, H = 160, padL = 52, padR = 12, padT = 16, padB = 24;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  // Compute cumulative ascent per point
  const pts = downsample(profile.points, 400);
  const cumPts: { km: number; cumAscent: number }[] = [{ km: pts[0].distanceKm, cumAscent: 0 }];
  let running = 0;
  for (let i = 1; i < pts.length; i++) {
    const diff = pts[i].elevationM - pts[i - 1].elevationM;
    if (diff > 0) running += diff;
    cumPts.push({ km: pts[i].distanceKm, cumAscent: running });
  }

  const totalKm = profile.totalDistanceKm;
  const totalAscent = running;
  const xS = (km: number) => padL + (km / totalKm) * chartW;
  const yS = (m: number)  => padT + chartH - (m / Math.max(totalAscent, 1)) * chartH;

  const linePts = cumPts.map(p => `${xS(p.km).toFixed(1)},${yS(p.cumAscent).toFixed(1)}`).join(" ");

  // Y-axis ticks
  const yStep = totalAscent < 1000 ? 200 : totalAscent < 3000 ? 500 : 1000;
  const yTicks: number[] = [];
  for (let t = 0; t <= totalAscent; t += yStep) yTicks.push(t);
  if (yTicks[yTicks.length - 1] < totalAscent) yTicks.push(Math.ceil(totalAscent / yStep) * yStep);

  // Quarter markers
  const quarters = [0.25, 0.5, 0.75].map(f => {
    const targetKm = f * totalKm;
    const pt = cumPts.reduce((best, p) => Math.abs(p.km - targetKm) < Math.abs(best.km - targetKm) ? p : best);
    return { km: targetKm, pct: Math.round((pt.cumAscent / totalAscent) * 100) };
  });

  const xInt = Math.ceil(totalKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= totalKm; k += xInt) xTicks.push(k);

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)} stroke="#eee" strokeWidth="1" />
          <text x={padL - 5} y={yS(t) + 3.5} textAnchor="end" fontSize="8" fill="#888">{t}m</text>
        </g>
      ))}
      {quarters.map(({ km, pct }, i) => (
        <g key={i}>
          <line x1={xS(km)} y1={padT} x2={xS(km)} y2={padT + chartH} stroke="#e0e0e0" strokeWidth="1" strokeDasharray="3,3" />
          <text x={xS(km)} y={padT - 3} textAnchor="middle" fontSize="7.5" fill="#aaa">{pct}%</text>
        </g>
      ))}
      <path
        d={`M${xS(cumPts[0].km).toFixed(1)},${(padT + chartH).toFixed(1)} ` +
           cumPts.map(p => `L${xS(p.km).toFixed(1)},${yS(p.cumAscent).toFixed(1)}`).join(" ") +
           ` L${xS(cumPts[cumPts.length - 1].km).toFixed(1)},${(padT + chartH).toFixed(1)} Z`}
        fill="#c0392b18"
      />
      <polyline points={linePts} fill="none" stroke="#c0392b" strokeWidth="2" strokeLinejoin="round" />
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      {xTicks.map((km, i) => (
        <g key={i}>
          <line x1={xS(km)} y1={padT + chartH} x2={xS(km)} y2={padT + chartH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS(km)} y={padT + chartH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text>
        </g>
      ))}
      {/* Dashed line at 50% ascent */}
      <line x1={padL} y1={yS(totalAscent * 0.5)} x2={W - padR} y2={yS(totalAscent * 0.5)} stroke="#c0392b" strokeWidth="1" strokeDasharray="4,4" opacity="0.4" />
      <text x={W - padR - 2} y={yS(totalAscent * 0.5) - 3} textAnchor="end" fontSize="7" fill="#c0392b" opacity="0.7">50% ascent</text>
    </svg>
  );
}

/* Terrain strip — color-coded sections across the course */
function TerrainStrip({ sections, totalKm }: { sections: TerrainSection[]; totalKm: number }) {
  const W = 698, H = 32;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {sections.map((s, i) => {
        const x = (s.start_km / totalKm) * W;
        const w = Math.max(((s.end_km - s.start_km) / totalKm) * W, 1);
        const color = gradientBandColor(s.avg_gradient_percent);
        return <rect key={i} x={x} y={0} width={w} height={H} fill={color} opacity={0.8} />;
      })}
      {/* km ticks */}
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

/* Effort profile chart — flat_equivalent_km / distance_km per section */
function EffortProfileChart({ sections, totalKm }: { sections: TerrainSection[]; totalKm: number }) {
  const W = 698, H = 120, padL = 44, padR = 8, padT = 14, padB = 22;
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
      {/* Gridlines */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)} stroke={t === 1.0 ? "#ccc" : "#eee"} strokeWidth={t === 1.0 ? 1.5 : 1} />
          <text x={padL - 5} y={yS(t) + 3.5} textAnchor="end" fontSize="8" fill={t === 1.0 ? "#666" : "#aaa"}>{t.toFixed(1)}×</text>
        </g>
      ))}
      {/* Flat-equivalent reference label */}
      <text x={W - padR - 2} y={baseline - 3} textAnchor="end" fontSize="7" fill="#555" opacity="0.7">flat effort</text>

      {/* Bars */}
      {sections.map((s, i) => {
        const ratio = ratios[i];
        const x = padL + (s.start_km / totalKm) * chartW;
        const w = Math.max((s.distance_km / totalKm) * chartW - 1, 1);
        const barTop = ratio >= 1 ? yS(ratio) : baseline;
        const barH = Math.abs(yS(ratio) - baseline);
        const color = ratio >= 1.5 ? "#c0392b" : ratio >= 1.2 ? "#e65100" : ratio >= 0.9 ? "#78909c" : ratio >= 0.7 ? "#64b5f6" : "#1976d2";
        return <rect key={i} x={x} y={barTop} width={w} height={Math.max(barH, 1)} fill={color} opacity={0.8} rx={1} />;
      })}

      {/* Axes */}
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

/* Demand card */
function DemandCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fafafa", border: `1px solid #e0e0e0`, borderLeft: `3px solid ${accent}`, borderRadius: "6px", padding: "12px 14px" }}>
      <p style={{ margin: "0 0 7px", fontSize: "11px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</p>
      <div style={{ fontSize: "11px", color: "#444", lineHeight: "1.6" }}>{children}</div>
    </div>
  );
}

/* Page number */
function PageNumber({ n }: { n: number }) {
  return <div style={{ position: "absolute", bottom: "24px", right: "48px", fontSize: "11px", color: "#aaa" }}>{n}</div>;
}

/* ══════════════════════════════════════════════════════════════════
   STYLE CONSTANTS
══════════════════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function RaceReadinessPage() {
  const supabase = createClient();

  const [races, setRaces]                 = useState<RaceOption[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [generating, setGenerating]       = useState(false);
  const [genError, setGenError]           = useState("");
  const [noRaceProfile, setNoRaceProfile] = useState(false);
  const [result, setResult]               = useState<OverviewResponse | null>(null);
  const [weather, setWeather]             = useState<WeatherDayRecord[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [results, setResults]             = useState<ResultsResponse | null>(null);
  const [splitAnalysis, setSplitAnalysis] = useState<ResultsResponse | null>(null);
  const [selectedAthleteKey, setSelectedAthleteKey] = useState("");
  const [athlete, setAthlete]             = useState<AthleteResponse | null>(null);
  const [athleteLoading, setAthleteLoading] = useState(false);
  const [athleteError, setAthleteError]   = useState("");

  const fetchAthlete = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setAthleteLoading(true);
    setAthleteError("");
    setAthlete(null);
    try {
      const res = await fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(key.trim())}`);
      const json = await res.json() as AthleteResponse & { error?: string };
      if (!res.ok || json.error) { setAthleteError(json.error ?? "Failed to load athlete."); }
      else setAthlete(json);
    } catch { setAthleteError("Network error loading athlete."); }
    setAthleteLoading(false);
  }, []);

  // Derived — elevation + segments
  const elevProfile    = result ? parseElevProfile(result.elevation_profile) : null;
  const sustainedSegs  = result ? parseSustainedSegs(result.sustained_segments) : null;
  const notable        = (sustainedSegs ?? [])
    .filter(s => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);
  const windData       = result?.wind_sections ?? [];

  // Terrain aggregates
  const terrainSummary = (() => {
    const secs  = result?.terrain_sections ?? [];
    const total = secs.reduce((s, t) => s + t.distance_km, 0);
    const climbing   = secs.filter(s => s.section_type.includes("climb")).reduce((s, t) => s + t.distance_km, 0);
    const descending = secs.filter(s => s.section_type.includes("descent")).reduce((s, t) => s + t.distance_km, 0);
    return { total, climbing, descending, flat: Math.max(0, total - climbing - descending) };
  })();

  // Race date display
  const raceDate      = result?.race.race_date ?? null;
  const raceDateLabel = raceDate
    ? new Date(raceDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // Weather averages
  const avgMaxTemp = weather.length > 0 ? weather.reduce((s, d) => s + (d.temp_max_c ?? 0), 0) / weather.length : null;
  const avgMinTemp = weather.length > 0 ? weather.reduce((s, d) => s + (d.temp_min_c ?? 0), 0) / weather.length : null;
  const avgPrecip  = weather.length > 0 ? weather.reduce((s, d) => s + (d.precipitation_mm ?? 0), 0) / weather.length : null;
  const wetPct     = weather.length > 0 ? Math.round((weather.filter(d => (d.precipitation_mm ?? 0) > 1).length / weather.length) * 100) : null;

  // Results-derived stats
  const raceStats = (() => {
    if (!results?.has_data || !results.distribution?.length) return null;
    const dist  = results.distribution;
    const total = results.total_finishers ?? 0;
    const fastestMin = dist[0].min_min;
    let cumulative = 0;
    let medianMin  = dist[Math.floor(dist.length / 2)].min_min;
    for (const b of dist) {
      cumulative += b.count;
      if (cumulative >= total / 2) { medianMin = (b.min_min + b.max_min) / 2; break; }
    }
    return { total, fastestMin, medianMin, year: results.latest_year };
  })();

  // Load races list — all races, with profile data (distance/ascent) where available
  useEffect(() => {
    async function load() {
      const { data: raceRows } = await supabase.from("races").select("id, name").order("name");
      if (!raceRows) return;
      const raceIds = raceRows.map(r => r.id as string);
      const { data: profileRows } = await supabase
        .from("race_profiles")
        .select("race_id, total_distance_km, total_ascent_m")
        .in("race_id", raceIds);
      const profileMap = new Map((profileRows ?? []).map(r => [r.race_id as string, r]));
      setRaces(raceRows.map(r => ({
        race_id:           r.id as string,
        race_name:         r.name as string,
        total_distance_km: profileMap.get(r.id as string)?.total_distance_km ?? null,
        total_ascent_m:    profileMap.get(r.id as string)?.total_ascent_m ?? null,
      })));
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch split analysis when median is known
  useEffect(() => {
    if (!raceStats?.medianMin || !selectedRaceId) return;
    void (async () => {
      try {
        const r = await fetch("/api/race-strategy/results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ race_id: selectedRaceId, target_minutes: Math.round(raceStats.medianMin) }),
        });
        if (r.ok) setSplitAnalysis(await r.json() as ResultsResponse);
      } catch { /* optional */ }
    })();
  }, [raceStats?.medianMin, selectedRaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGenerate() {
    if (!selectedRaceId) { setGenError("Please select a race."); return; }
    setGenerating(true);
    setGenError("");
    setNoRaceProfile(false);
    setResult(null);
    setWeather([]);
    setResults(null);
    setSplitAnalysis(null);

    const res  = await fetch("/api/race-readiness/overview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ race_id: selectedRaceId }),
    });
    const json = await res.json() as OverviewResponse & { error?: string };

    let effectiveResult: OverviewResponse;
    if (res.status === 404 || (!res.ok && json.error?.includes("No race profile"))) {
      // No route profile uploaded yet — still allow athlete pages to render
      const raceName = races.find(r => r.race_id === selectedRaceId)?.race_name ?? "Unknown race";
      setNoRaceProfile(true);
      effectiveResult = {
        race: { id: selectedRaceId, name: raceName, total_distance_km: 0, total_ascent_m: 0, total_descent_m: 0, race_date: null, weather_lat: null, weather_lon: null },
        route: [], wind_sections: null, elevation_profile: null, sustained_segments: null, terrain_sections: [],
      };
    } else if (!res.ok || json.error) {
      setGenError(json.error ?? "Failed to load race overview.");
      setGenerating(false);
      return;
    } else {
      effectiveResult = json;
    }

    setResult(effectiveResult);
    setGenerating(false);

    // Weather history
    const effectiveDate = effectiveResult.race.race_date;
    if (effectiveDate && effectiveResult.race.weather_lat !== null && effectiveResult.race.weather_lon !== null) {
      const [, monthStr, dayStr] = effectiveDate.split("-");
      setWeatherLoading(true);
      try {
        const wRes = await fetch("/api/race-analysis/weather-history", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: effectiveResult.race.weather_lat, lon: effectiveResult.race.weather_lon, month: parseInt(monthStr, 10), day: parseInt(dayStr, 10) }),
        });
        if (wRes.ok) setWeather(((await wRes.json()) as { data: WeatherDayRecord[] }).data ?? []);
      } catch { /* optional */ }
      setWeatherLoading(false);
    }

    // Initial results (for distribution + to compute median for split analysis)
    try {
      const rRes = await fetch("/api/race-strategy/results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: selectedRaceId, target_minutes: 600 }),
      });
      if (rRes.ok) setResults(await rRes.json() as ResultsResponse);
    } catch { /* optional */ }
  }

  /* ── Page 2 demand computations ── */
  const secs          = result?.terrain_sections ?? [];
  const totalKm       = result?.race.total_distance_km ?? 0;
  const totalAscentM  = result?.race.total_ascent_m ?? 0;
  const totalDescentM = result?.race.total_descent_m ?? 0;

  // Flat-equivalent total (total energy cost expressed as flat km)
  const totalFlatEq   = secs.reduce((s, t) => s + t.flat_equivalent_km, 0);
  const effortRatio   = totalKm > 0 ? totalFlatEq / totalKm : 1;

  // Steepest sustained section (by abs avg gradient, min 2km)
  const steepestClimb = [...secs]
    .filter(s => s.section_type.includes("climb") && s.distance_km >= 1)
    .sort((a, b) => b.avg_gradient_percent - a.avg_gradient_percent)[0] ?? null;
  const steepestDescent = [...secs]
    .filter(s => s.section_type.includes("descent") && s.distance_km >= 1)
    .sort((a, b) => a.avg_gradient_percent - b.avg_gradient_percent)[0] ?? null;

  // Final third analysis from sections
  const finalThirdStart = totalKm * (2 / 3);
  const finalThirdSecs  = secs.filter(s => s.start_km >= finalThirdStart);
  const finalThirdAscent = finalThirdSecs.reduce((s, t) => s + t.ascent_m, 0);
  const finalThirdFlatEq = finalThirdSecs.reduce((s, t) => s + t.flat_equivalent_km, 0);
  const finalThirdLen    = finalThirdSecs.reduce((s, t) => s + t.distance_km, 0);
  const finalThirdEffort = finalThirdLen > 0 ? finalThirdFlatEq / finalThirdLen : 1;

  // Pacing complexity index: coefficient of variation of effort ratios across sections
  const sectionRatios  = secs.filter(s => s.distance_km > 0).map(s => s.flat_equivalent_km / s.distance_km);
  const meanRatio      = sectionRatios.length > 0 ? sectionRatios.reduce((a, b) => a + b, 0) / sectionRatios.length : 1;
  const stdRatio       = sectionRatios.length > 1
    ? Math.sqrt(sectionRatios.reduce((s, r) => s + (r - meanRatio) ** 2, 0) / sectionRatios.length)
    : 0;
  const cvRatio        = meanRatio > 0 ? stdRatio / meanRatio : 0;
  const complexityLabel = cvRatio > 0.45 ? "High" : cvRatio > 0.25 ? "Moderate" : "Low";
  const complexityColor = cvRatio > 0.45 ? "#c0392b" : cvRatio > 0.25 ? "#e65100" : "#2e7d32";

  // Cumulative ascent at halfway
  const halfwayAscentPct = (() => {
    if (!elevProfile || totalAscentM <= 0) return null;
    const halfKm = totalKm / 2;
    const pts = downsample(elevProfile.points, 400);
    let running = 0;
    let halfwayAscent = 0;
    for (let i = 1; i < pts.length; i++) {
      const diff = pts[i].elevationM - pts[i - 1].elevationM;
      if (diff > 0) running += diff;
      if (pts[i].distanceKm <= halfKm) halfwayAscent = running;
    }
    return Math.round((halfwayAscent / running) * 100);
  })();

  // Race pattern (from results)
  const halfway = splitAnalysis?.halfway_analysis ?? null;
  const late    = splitAnalysis?.late_analysis    ?? null;

  return (
    <main style={{ minHeight: "100vh", background: "#f9f9f9" }}>
      {/* ── Config panel ── */}
      <div className="no-print" style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "24px 32px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Race</div>
          <RaceSearchCombobox
            races={races}
            selectedId={selectedRaceId}
            onSelect={id => setSelectedRaceId(id)}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <button type="button" onClick={() => void handleGenerate()} disabled={generating} style={generateBtn}>
            {generating ? "Loading…" : "Generate Overview"}
          </button>
          {genError && <span style={{ fontSize: "12px", color: "#b00020" }}>{genError}</span>}
        </div>
        <div>
          <div style={labelStyle}>Athlete</div>
          <AthleteSearchCombobox
            selectedKey={selectedAthleteKey}
            onSelect={key => { setSelectedAthleteKey(key); void fetchAthlete(key); }}
          />
          {athleteLoading && <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Loading athlete…</div>}
          {athleteError && <div style={{ fontSize: "11px", color: "#b00020", marginTop: "4px" }}>{athleteError}</div>}
        </div>
        {result && <button type="button" onClick={() => window.print()} style={printBtn}>Export to PDF</button>}
      </div>

      {result && (
        <div style={canvas} className="race-strategy-canvas">

          {/* ═══════════════════════════════════════
              PAGE 1 — Race Overview
          ═══════════════════════════════════════ */}
          <div style={a4Page}>
            <div style={printHeader}>
              <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
              </div>
            </div>

            <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Race Overview</h2>
            <p style={{ margin: "0 0 18px", fontSize: "12px", color: "#888" }}>
              Course profile, terrain character, and historical conditions{raceDateLabel ? ` · ${raceDateLabel}` : ""}
            </p>

            {noRaceProfile && (
              <div style={{ padding: "24px", background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: "8px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                No route profile has been uploaded for this race. Course analysis, elevation chart, and terrain data are unavailable.
              </div>
            )}

            {!noRaceProfile && <><div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
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

            {elevProfile && (
              <div style={{ marginBottom: "18px" }}>
                <p style={sectionLabel}>Course Elevation Profile</p>
                <ElevationChart profile={elevProfile} notable={notable} />
                {notable.length > 0 && (
                  <div style={{ marginTop: "4px", display: "flex", gap: "16px" }}>
                    <span style={{ fontSize: "9px", color: "#bf360c" }}>▲ amber = significant climb</span>
                    <span style={{ fontSize: "9px", color: "#0d47a1" }}>▼ blue = significant descent</span>
                  </div>
                )}
              </div>
            )}

            {result.route.length > 1 && (
              <div style={{ marginBottom: "18px" }}>
                <p style={sectionLabel}>Course Map{windData.length > 0 && " — arrows show wind direction · colour shows headwind risk"}</p>
                <RouteMap route={result.route} windSections={windData.length ? windData : undefined} height={195} />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
              <div>
                <p style={sectionLabel}>Terrain Composition</p>
                <TerrainBar label="Climbing"      km={terrainSummary.climbing}   pct={terrainSummary.total > 0 ? (terrainSummary.climbing   / terrainSummary.total) * 100 : 0} color="#c0392b" />
                <TerrainBar label="Descending"    km={terrainSummary.descending} pct={terrainSummary.total > 0 ? (terrainSummary.descending / terrainSummary.total) * 100 : 0} color="#1565c0" />
                <TerrainBar label="Flat / Rolling" km={terrainSummary.flat}      pct={terrainSummary.total > 0 ? (terrainSummary.flat       / terrainSummary.total) * 100 : 0} color="#546e7a" />
              </div>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "12px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>Historical Weather</p>
                {weatherLoading ? (
                  <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>Loading…</p>
                ) : weather.length > 0 && avgMaxTemp !== null ? (
                  <>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {[
                        { label: "Avg high",        value: `${avgMaxTemp.toFixed(1)}°C` },
                        { label: "Avg low",          value: `${avgMinTemp!.toFixed(1)}°C` },
                        { label: "Avg rain",         value: `${avgPrecip!.toFixed(1)} mm` },
                        { label: "Wet probability",  value: `${wetPct}%` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ fontSize: "10px" }}>
                          <div style={{ color: "#aaa" }}>{label}</div>
                          <div style={{ fontWeight: 700, color: "#333", fontSize: "12px" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#555", lineHeight: "1.5" }}>
                      {(() => {
                        const meanAvg = (avgMaxTemp + avgMinTemp!) / 2;
                        const wPct = wetPct ?? 0;
                        const tempNote = meanAvg < 5 ? "Cold conditions typical." :
                          meanAvg <= 13 ? "Near-optimal temperatures." :
                          meanAvg <= 18 ? `Mild warmth (avg ${meanAvg.toFixed(0)}°C) — modest effort penalty.` :
                          `Warm conditions (avg ${meanAvg.toFixed(0)}°C) — plan heat management.`;
                        const rainNote = wPct < 30 ? "Rain uncommon." :
                          wPct < 60 ? `Rain in ${wPct}% of years — pack wet-weather kit.` :
                          `Rain likely (${wPct}% of years).`;
                        return `${tempNote} ${rainNote}`;
                      })()}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#bbb" }}>ERA5 reanalysis · last {weather.length} years</p>
                  </>
                ) : (
                  <p style={{ fontSize: "11px", color: "#aaa", margin: 0 }}>
                    {raceDate ? "No weather data available." : "No race date on record."}
                  </p>
                )}
              </div>

              <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "8px", padding: "12px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Race History{raceStats?.year ? ` · ${raceStats.year}` : ""}
                </p>
                {raceStats ? (
                  <>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                      {[
                        { label: "Finishers",    value: raceStats.total.toLocaleString() },
                        { label: "Fastest",      value: formatRaceTime(raceStats.fastestMin) },
                        { label: "Median time",  value: formatRaceTime(raceStats.medianMin) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ fontSize: "10px" }}>
                          <div style={{ color: "#aaa" }}>{label}</div>
                          <div style={{ fontWeight: 700, color: "#333", fontSize: "12px" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {results?.distribution && <DistributionMini dist={results.distribution} totalFinishers={raceStats.total} />}
                  </>
                ) : (
                  <p style={{ fontSize: "11px", color: "#aaa", margin: 0 }}>No results data on record.</p>
                )}
              </div>
            </div>

            <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #eee" }}>
              <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: "1.5" }}>
                Course data derived from GPX file. Elevation data from ERA5 reanalysis. Race results from official published results.
                {weather.length > 0 && " Weather: Hersbach et al. (2023) ERA5 via Open-Meteo Historical Weather API."}
              </p>
            </div></>}
            <PageNumber n={1} />
          </div>

          {/* ═══════════════════════════════════════
              PAGE 2 — Race Demands Profile
          ═══════════════════════════════════════ */}
          {secs.length > 0 && (
            <div style={a4Page}>
              <div style={printHeader}>
                <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Demands Profile</div>
                </div>
              </div>

              <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Race Demands Profile</h2>
              <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#888" }}>
                Physical and environmental demands an athlete will face on this course
              </p>

              {/* ── Section 1: Gradient distribution ── */}
              <div style={{ marginBottom: "20px" }}>
                <p style={sectionLabel}>Gradient Distribution — kilometres at each slope band</p>
                <GradientHistogram sections={secs} />
                {/* Legend */}
                <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                  {GRAD_BANDS.map(b => (
                    <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: b.color, opacity: 0.85, flexShrink: 0 }} />
                      <span style={{ fontSize: "9px", color: "#555" }}>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Section 2: Cumulative ascent ── */}
              {elevProfile && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={sectionLabel}>
                    Climbing Load Over Course
                    {halfwayAscentPct !== null ? ` — ${halfwayAscentPct}% of total ascent completed at halfway` : ""}
                  </p>
                  <CumulativeAscentChart profile={elevProfile} />
                  <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#aaa" }}>
                    Dashed percentages show how much of the total {Math.round(totalAscentM)}m ascent has accumulated at each quarter of the course.
                  </p>
                </div>
              )}

              {/* ── Section 3: Terrain strip + effort profile ── */}
              <div style={{ marginBottom: "20px" }}>
                <p style={sectionLabel}>Section-by-Section Effort Multiplier — vs. flat running pace</p>
                <EffortProfileChart sections={secs} totalKm={totalKm} />
                <div style={{ marginTop: "4px", display: "flex", gap: "14px", alignItems: "center" }}>
                  <span style={{ fontSize: "9px", color: "#888" }}>
                    1.0× = flat running effort. Higher bars = more energy per km. Lower bars = descent assistance.
                  </span>
                  <span style={{ fontSize: "9px", color: "#888" }}>Overall: <strong style={{ color: "#333" }}>{effortRatio.toFixed(2)}× average effort multiplier</strong></span>
                </div>
              </div>

              {/* ── Section 4: Terrain colour strip ── */}
              <div style={{ marginBottom: "20px" }}>
                <p style={sectionLabel}>Terrain Character Strip — gradient colour across the course</p>
                <TerrainStrip sections={secs} totalKm={totalKm} />
                <div style={{ marginTop: "14px" }} />
              </div>

              {/* ── Section 5: Demand summary (4 cards) ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <DemandCard title="Climbing Demand" accent="#c0392b">
                  <strong>{Math.round(totalAscentM)}m</strong> total ascent over{" "}
                  <strong>{terrainSummary.climbing.toFixed(1)} km</strong> of climbing terrain ({((terrainSummary.climbing / totalKm) * 100).toFixed(0)}% of course).
                  {steepestClimb && (
                    <> Steepest sustained section: <strong>{steepestClimb.avg_gradient_percent.toFixed(1)}%</strong> average gradient
                    {" "}(km {steepestClimb.start_km.toFixed(1)}–{steepestClimb.end_km.toFixed(1)}, {steepestClimb.distance_km.toFixed(1)} km).
                    </>
                  )}
                  {halfwayAscentPct !== null && (
                    <> <strong>{halfwayAscentPct}%</strong> of all climbing is done before halfway — {halfwayAscentPct > 55 ? "the course is front-loaded" : halfwayAscentPct < 45 ? "the course is back-loaded — the hardest work comes late" : "climbing is broadly even across both halves"}.</>
                  )}
                </DemandCard>

                <DemandCard title="Descending Demand" accent="#1565c0">
                  <strong>{Math.round(totalDescentM)}m</strong> total descent over{" "}
                  <strong>{terrainSummary.descending.toFixed(1)} km</strong> of descending terrain ({((terrainSummary.descending / totalKm) * 100).toFixed(0)}% of course).
                  {steepestDescent && (
                    <> Steepest descent: <strong>{Math.abs(steepestDescent.avg_gradient_percent).toFixed(1)}%</strong> average gradient
                    {" "}(km {steepestDescent.start_km.toFixed(1)}–{steepestDescent.end_km.toFixed(1)}, {steepestDescent.distance_km.toFixed(1)} km).
                    </>
                  )}
                  {" "}Significant descending volume creates{" "}
                  {totalDescentM > 2000 ? "substantial eccentric loading — quad fatigue is a key risk for this race" :
                   totalDescentM > 1000 ? "moderate eccentric loading — quad strength and downhill technique are important" :
                   "limited eccentric loading compared to the climbing volume"}.
                </DemandCard>

                <DemandCard title="Final Third Demands" accent="#e65100">
                  {finalThirdLen > 0 ? (
                    <>
                      The final third of the race (km {(finalThirdStart).toFixed(1)}–{totalKm.toFixed(1)}) covers{" "}
                      <strong>{finalThirdLen.toFixed(1)} km</strong> with <strong>{Math.round(finalThirdAscent)}m</strong> of remaining ascent.
                      {" "}Effort multiplier is <strong style={{ color: finalThirdEffort > effortRatio * 1.1 ? "#c0392b" : finalThirdEffort < effortRatio * 0.9 ? "#2e7d32" : "#555" }}>{finalThirdEffort.toFixed(2)}×</strong>{" "}
                      ({finalThirdEffort > effortRatio * 1.1 ? "harder than average — fatigue management is critical" :
                        finalThirdEffort < effortRatio * 0.9 ? "easier than average — opportunity to push if reserves allow" :
                        "similar to overall average — consistent effort required to the finish"}).
                      {late && (
                        <> Results data shows athletes typically slow by <strong>{late.avg_fade_pct.toFixed(1)}%</strong> in the final section, with <strong>{late.controlled_pct.toFixed(0)}%</strong> maintaining a controlled finish.</>
                      )}
                    </>
                  ) : <span style={{ color: "#aaa" }}>No data available.</span>}
                </DemandCard>

                <DemandCard title="Pacing Complexity" accent={complexityColor}>
                  <strong style={{ color: complexityColor }}>{complexityLabel} complexity</strong>.{" "}
                  {cvRatio > 0.45
                    ? "Effort varies dramatically between sections. Athletes must manage pace aggressively — running by feel or heart rate rather than fixed pace is essential."
                    : cvRatio > 0.25
                    ? "Moderate variation in effort across sections. Pace targets should be adapted per section; a single pace plan will misrepresent the demands."
                    : "Effort is relatively consistent across sections. A steady, measured approach is appropriate for most of this course."
                  }
                  {" "}Overall flat-equivalent distance: <strong>{totalFlatEq.toFixed(1)} km</strong> ({effortRatio.toFixed(2)}× the actual {totalKm.toFixed(1)} km).
                  {halfway && (
                    <> Historical data: <strong>{halfway.pct_positive_split.toFixed(0)}%</strong> of athletes run a positive split (too fast in the first half).</>
                  )}
                </DemandCard>
              </div>

              {/* ── Race pattern data (if available) ── */}
              {(halfway ?? late) && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={sectionLabel}>Race Pattern — from {raceStats?.year ?? "historical"} results data</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    {halfway && (
                      <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "6px", padding: "12px 14px" }}>
                        <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Halfway Split — {halfway.label}
                        </p>
                        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                          {[
                            { label: "Recommended split", value: formatSecs(halfway.recommended_seconds) },
                            { label: "Aggressive split",  value: formatSecs(halfway.aggressive_seconds) },
                            { label: "Positive split %",  value: `${halfway.pct_positive_split.toFixed(0)}%` },
                            { label: "Typical ratio",     value: `${(halfway.typical_ratio * 100).toFixed(1)}% of finish` },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ fontSize: "10px" }}>
                              <div style={{ color: "#aaa", marginBottom: "2px" }}>{label}</div>
                              <div style={{ fontWeight: 700, color: "#333", fontSize: "12px" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#555", lineHeight: "1.5" }}>
                          Based on {halfway.band_size} finishers near the median finish time.
                          {halfway.pct_positive_split > 55
                            ? " The majority go out too fast — a conserved first half is strongly advised."
                            : halfway.pct_positive_split > 35
                            ? " A significant proportion positive-split — disciplined pacing in the first half pays dividends."
                            : " Most athletes manage pacing well on this course."}
                        </p>
                      </div>
                    )}
                    {late && (
                      <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "6px", padding: "12px 14px" }}>
                        <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Late Race — {late.final_dist_note}
                        </p>
                        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                          {[
                            { label: "Avg final section", value: formatRaceTime(late.avg_final_section_minutes) },
                            { label: "Avg fade",          value: `+${late.avg_fade_pct.toFixed(1)}%` },
                            { label: "Controlled finish", value: `${late.controlled_pct.toFixed(0)}%` },
                          ].map(({ label, value }) => (
                            <div key={label} style={{ fontSize: "10px" }}>
                              <div style={{ color: "#aaa", marginBottom: "2px" }}>{label}</div>
                              <div style={{ fontWeight: 700, color: label === "Avg fade" ? "#e65100" : "#333", fontSize: "12px" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#555", lineHeight: "1.5" }}>
                          {late.avg_fade_pct > 15
                            ? "Significant late-race fade is common on this course. Strength endurance and race-specific long runs in training are critical preparation."
                            : late.avg_fade_pct > 7
                            ? "Moderate fade is typical. Training should include race-specific fatigue tolerance work in the final phase."
                            : "Athletes tend to finish strongly — the late course suits a consistent effort."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ paddingTop: "12px", borderTop: "1px solid #eee" }}>
                <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: "1.5" }}>
                  Effort multipliers derived from grade-adjusted energy cost modelling (Minetti et al. 2002). Gradient bands calculated from GPS-derived section gradients.
                  {(halfway ?? late) && " Race pattern data from official results."}
                </p>
              </div>

              <PageNumber n={2} />
            </div>
          )}

          {/* ═══════════════════════════════════════
              PAGE 3 — Athlete Overview
          ═══════════════════════════════════════ */}
          {athlete && (() => {
            const p = athlete.profile;
            const races = athlete.races;

            // Recent: last 2 years from last result year
            const lastYear = p.last_result_year ?? new Date().getFullYear();
            const recentThreshold = lastYear - 1;
            const recentRaces  = races.filter(r => r.result_year >= recentThreshold).slice(0, 10);

            // Career highlights: best position, longest, highest ascent, earliest, + DNF if notable
            const finished = races.filter(r => r.result_status === "FINISHED" && r.finish_seconds);
            const byPos    = [...finished].filter(r => r.position).sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
            const byDist   = [...finished].filter(r => r.total_distance_km).sort((a, b) => (b.total_distance_km ?? 0) - (a.total_distance_km ?? 0));
            const byAscent = [...finished].filter(r => r.total_ascent_m).sort((a, b) => (b.total_ascent_m ?? 0) - (a.total_ascent_m ?? 0));
            const earliest = [...races].sort((a, b) => a.result_year - b.result_year)[0];

            const uniqueById = (arr: AthleteRace[]) => {
              const seen = new Set<string>();
              return arr.filter(r => {
                const k = `${r.race_id}|${r.result_year}`;
                if (seen.has(k)) return false;
                seen.add(k); return true;
              });
            };

            const highlightRaces = uniqueById([
              ...(byPos[0] ? [byPos[0]] : []),
              ...(byDist[0] && byDist[0].total_distance_km !== byPos[0]?.total_distance_km ? [byDist[0]] : []),
              ...(byAscent[0] ? [byAscent[0]] : []),
              ...(earliest ? [earliest] : []),
            ].filter(r => !recentRaces.some(rr => rr.race_id === r.race_id && rr.result_year === r.result_year)));

            const highlightIds = new Set(highlightRaces.map(r => `${r.race_id}|${r.result_year}`));

            // Career stat chips
            type Chip = { label: string; value: string; sub?: string; accent?: string };
            const chips: Chip[] = [
              { label: "Races", value: String(p.race_count) },
              { label: "Finishes", value: String(p.finish_count) },
              ...(p.dnf_count > 0 ? [{ label: "DNFs", value: String(p.dnf_count), accent: "#c0392b" }] : []),
              ...(p.career_span_years ? [{ label: "Career Span", value: `${p.career_span_years} yr${p.career_span_years !== 1 ? "s" : ""}`, sub: `${p.first_result_year ?? ""}–${p.last_result_year ?? ""}` }] : []),
              ...(p.avg_ascent_m ? [{ label: "Avg Ascent", value: `${Math.round(p.avg_ascent_m)}m` }] : []),
              ...(p.max_ascent_m ? [{ label: "Max Ascent", value: `${Math.round(p.max_ascent_m)}m` }] : []),
              ...(p.avg_flat_equiv_km ? [{ label: "Avg Eq. Km", value: `${p.avg_flat_equiv_km.toFixed(1)} km` }] : []),
              ...(p.cluster_label ? [{ label: "Athlete Type", value: p.cluster_label, accent: "#1e3a1e" }] : []),
            ];

            return (
              <div style={a4Page}>
                {/* Header */}
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{p.athlete_key}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Athlete Overview</div>
                  </div>
                </div>

                {/* Identity row */}
                <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
                  {[
                    p.gender && { k: "Gender", v: p.gender },
                    p.age_group && { k: "Category", v: p.age_group },
                    p.club && { k: "Club", v: p.club },
                    { k: "Active", v: `${p.first_result_year ?? "?"} – ${p.last_result_year ?? "?"}` },
                  ].filter(Boolean).map((item, i) => {
                    const { k, v } = item as { k: string; v: string };
                    return (
                      <div key={i} style={{ background: "#f5f5f5", borderRadius: "6px", padding: "8px 14px" }}>
                        <div style={{ fontSize: "9px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e3a1e", marginTop: "2px" }}>{v}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Career stat chips */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
                  {chips.map((c, i) => (
                    <div key={i} style={{ border: `1.5px solid ${c.accent ?? "#e0e0e0"}`, borderRadius: "20px", padding: "5px 14px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ fontSize: "9px", color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: c.accent ?? "#222" }}>{c.value}</div>
                      {c.sub && <div style={{ fontSize: "8.5px", color: "#bbb" }}>{c.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Performance trend */}
                {races.filter(r => r.result_status === "FINISHED" && r.position && r.total_finishers).length >= 2 && (
                  <div style={{ marginBottom: "22px" }}>
                    <p style={sectionLabel}>Field Position Over Time</p>
                    <PerformanceTrendChart races={races} recentThreshold={recentThreshold} />
                    <div style={{ fontSize: "8.5px", color: "#aaa", marginTop: "4px" }}>
                      Each dot is one race finish. Y-axis shows percentage of field beaten (higher = better). Trend line direction: {(() => {
                        const fin = races.filter(r => r.result_status === "FINISHED" && r.position && r.total_finishers && r.total_finishers > 1);
                        if (fin.length < 2) return "insufficient data.";
                        const pts = fin.map(r => ({ year: r.result_year, pct: ((r.total_finishers! - r.position!) / (r.total_finishers! - 1)) * 100 }));
                        const n = pts.length, mx = pts.reduce((s, p) => s + p.year, 0) / n, my = pts.reduce((s, p) => s + p.pct, 0) / n;
                        const slope = pts.reduce((s, p) => s + (p.year - mx) * (p.pct - my), 0) / Math.max(pts.reduce((s, p) => s + (p.year - mx) ** 2, 0), 0.001);
                        return slope > 1 ? "moving up the field over time." : slope < -1 ? "moving down the field over time." : "broadly stable.";
                      })()}
                    </div>
                  </div>
                )}

                {/* Recent races */}
                {recentRaces.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={sectionLabel}>Recent Races (last 2 years)</p>
                    <RaceHistoryRows races={recentRaces} />
                  </div>
                )}

                {/* Career highlights */}
                {highlightRaces.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={sectionLabel}>Career Highlights ★</p>
                    <RaceHistoryRows races={highlightRaces} highlightIds={highlightIds} />
                  </div>
                )}

                {/* Footer note */}
                <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid #eee" }}>
                  <p style={{ fontSize: "8.5px", color: "#bbb", margin: 0 }}>
                    Athlete data sourced from race results database. Starred rows indicate personal bests or career-significant performances.
                    {p.cluster_label && ` Athlete type classification from similarity clustering.`}
                  </p>
                </div>

                <PageNumber n={3} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 4 — Experience Gaps
          ═══════════════════════════════════════ */}
          {athlete && result.terrain_sections.length > 0 && (() => {
            const p = athlete.profile;

            // Aggregate target race pairings from its terrain sections
            const targetPairingMap: Record<string, { section_type: string; terrain: string; km: number }> = {};
            for (const sec of result.terrain_sections) {
              const key = `${sec.section_type}|${sec.terrain}`;
              if (!targetPairingMap[key]) targetPairingMap[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0 };
              targetPairingMap[key].km += sec.distance_km;
            }

            // Round and sort by km descending (importance order)
            const targetList = Object.values(targetPairingMap)
              .map(tp => ({ ...tp, km: Math.round(tp.km * 10) / 10 }))
              .filter(tp => tp.km >= 0.1)
              .sort((a, b) => b.km - a.km);

            // Athlete's existing km per pairing
            const athleteMap: Record<string, number> = {};
            for (const p of athlete.terrain_pairings ?? []) {
              athleteMap[`${p.section_type}|${p.terrain}`] = p.total_km;
            }

            // Build gap rows
            const gapRows = targetList.map(tp => {
              const athleteKm = athleteMap[`${tp.section_type}|${tp.terrain}`] ?? 0;
              const pct = tp.km > 0 ? Math.min(100, Math.round((athleteKm / tp.km) * 100)) : 100;
              const status: "none" | "partial" | "met" =
                athleteKm === 0 ? "none" : pct >= 100 ? "met" : "partial";
              return { ...tp, athleteKm, pct, status };
            });

            const noneCount    = gapRows.filter(r => r.status === "none").length;
            const partialCount = gapRows.filter(r => r.status === "partial").length;
            const metCount     = gapRows.filter(r => r.status === "met").length;

            const sectionTypeLabel = (s: string) =>
              s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const terrainLabel = (t: string) =>
              t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const pairingColor = (s: string) =>
              s.includes("climb") ? "#c0392b" : s.includes("descent") ? "#1565c0" : "#2e7d32";

            const statusBadge = (row: (typeof gapRows)[0]) => {
              if (row.status === "met")     return { label: "Met",            bg: "#e8f5e9", color: "#2e7d32" };
              if (row.status === "partial") return { label: `${row.pct}% met`, bg: "#fff3e0", color: "#f57c00" };
              return                               { label: "No experience",   bg: "#fce4ec", color: "#c0392b" };
            };

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{p.athlete_key}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Experience Gaps</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Experience Gaps</h2>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                  Every terrain demand of {result.race.name} — ordered by distance on course (most impactful first)
                </p>

                {/* Summary chips */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
                  {noneCount > 0 && (
                    <div style={{ background: "#fce4ec", borderRadius: "20px", padding: "5px 14px", fontSize: "11px", fontWeight: 700, color: "#c0392b" }}>
                      {noneCount} demand{noneCount !== 1 ? "s" : ""} with no prior experience
                    </div>
                  )}
                  {partialCount > 0 && (
                    <div style={{ background: "#fff3e0", borderRadius: "20px", padding: "5px 14px", fontSize: "11px", fontWeight: 700, color: "#f57c00" }}>
                      {partialCount} partially met
                    </div>
                  )}
                  {metCount > 0 && (
                    <div style={{ background: "#e8f5e9", borderRadius: "20px", padding: "5px 14px", fontSize: "11px", fontWeight: 700, color: "#2e7d32" }}>
                      {metCount} fully met
                    </div>
                  )}
                </div>

                {/* Gap table */}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: "160px" }}>Gradient Type</th>
                      <th style={{ ...thStyle, width: "110px" }}>Surface</th>
                      <th style={{ ...thStyle, width: "65px" }}>Race km</th>
                      <th style={{ ...thStyle, width: "75px" }}>Athlete km</th>
                      <th style={{ ...thStyle, width: "110px" }}>Status</th>
                      <th style={thStyle}>Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapRows.map((row, i) => {
                      const col    = pairingColor(row.section_type);
                      const badge  = statusBadge(row);
                      const metPct = Math.min(100, row.pct);
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: col }}>
                            {sectionTypeLabel(row.section_type)}
                          </td>
                          <td style={{ ...tdStyle, color: "#555" }}>{terrainLabel(row.terrain)}</td>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{row.km.toFixed(1)}</td>
                          <td style={{ ...tdStyle, color: row.athleteKm > 0 ? "#333" : "#ccc" }}>
                            {row.athleteKm > 0 ? row.athleteKm.toFixed(1) : "—"}
                          </td>
                          <td style={tdStyle}>
                            <span style={{ background: badge.bg, color: badge.color, borderRadius: "10px", padding: "2px 8px", fontSize: "9.5px", fontWeight: 700, whiteSpace: "nowrap" }}>
                              {badge.label}
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ position: "relative", height: "10px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${metPct}%`, background: row.status === "met" ? "#2e7d32" : row.status === "partial" ? "#f57c00" : "#eee", borderRadius: "3px" }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ marginTop: "12px", fontSize: "8.5px", color: "#bbb" }}>
                  Demands ordered by distance on the target course — longer sections carry more physical consequence.
                  Athlete km drawn from all finished races in their career history.
                </div>

                <PageNumber n={4} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 5 — Demands Built Up
          ═══════════════════════════════════════ */}
          {athlete && (() => {
            const p = athlete.profile;
            const allRaces = athlete.races;

            const finishedRaces = allRaces.filter(r => r.result_status === "FINISHED" && r.finish_seconds);

            const targetDist   = (result.race.total_distance_km ?? 0) > 0 ? result.race.total_distance_km : null;
            const targetAscent = (result.race.total_ascent_m    ?? 0) > 0 ? result.race.total_ascent_m    : null;

            const maxDist   = finishedRaces.reduce((m, r) => Math.max(m, r.total_distance_km ?? 0), 0) || null;
            const maxAscent = finishedRaces.reduce((m, r) => Math.max(m, r.total_ascent_m    ?? 0), 0) || null;
            const maxFlatEq = finishedRaces.reduce((m, r) => Math.max(m, r.flat_equivalent_km ?? 0), 0) || null;
            const maxTime   = finishedRaces.reduce((m, r) => Math.max(m, r.finish_seconds     ?? 0), 0) || null;

            const normDist   = Math.max(maxDist ?? 0, targetDist ?? 0)   || 1;
            const normAscent = Math.max(maxAscent ?? 0, targetAscent ?? 0) || 1;

            const tableRaces = [...finishedRaces].sort((a, b) => b.result_year - a.result_year).slice(0, 10);

            const pairings = athlete.terrain_pairings ?? [];
            const maxPairingKm = pairings.reduce((m, p) => Math.max(m, p.total_km), 0) || 1;

            const sectionTypeLabel = (s: string) =>
              s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const terrainLabel = (t: string) =>
              t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const pairingColor = (s: string) =>
              s.includes("climb") ? "#c0392b" : s.includes("descent") ? "#1565c0" : "#2e7d32";

            const fmtTime = (secs: number) => {
              const h = Math.floor(secs / 3600);
              const m = Math.floor((secs % 3600) / 60);
              return h > 0 ? `${h}h ${m}m` : `${m}m`;
            };

            type DCard = { label: string; achieved: number | null; target: number | null; fmtFn: (n: number) => string; color: string };
            const cards: DCard[] = [
              { label: "Distance",     achieved: maxDist,   target: targetDist,   fmtFn: n => `${n.toFixed(0)} km`,      color: "#1565c0" },
              { label: "Ascent",       achieved: maxAscent, target: targetAscent, fmtFn: n => `${Math.round(n)}m`,       color: "#c0392b" },
              ...(maxFlatEq ? [{ label: "Flat Equiv.", achieved: maxFlatEq, target: null, fmtFn: (n: number) => `${n.toFixed(1)} km`, color: "#e65100" }] : []),
              { label: "Time on Feet", achieved: maxTime,   target: null,         fmtFn: fmtTime,                        color: "#6a1b9a" },
            ];

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{p.athlete_key}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Demands Built Up</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Demands Built Up</h2>
                <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#888" }}>
                  What this athlete has already experienced — compared to the demands of {result.race.name}
                </p>

                {/* Demand comparison cards */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
                  {cards.map((card, i) => {
                    const pct = card.target && card.achieved ? Math.round((card.achieved / card.target) * 100) : null;
                    const barColor = pct === null ? card.color : pct >= 100 ? "#2e7d32" : pct >= 70 ? "#f57c00" : "#c0392b";
                    return (
                      <div key={i} style={{ border: `2px solid ${barColor}30`, borderRadius: "8px", padding: "14px 16px", background: `${barColor}06` }}>
                        <div style={{ fontSize: "9px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{card.label}</div>
                        <div style={{ fontSize: "22px", fontWeight: 700, color: "#1e3a1e" }}>
                          {card.achieved ? card.fmtFn(card.achieved) : "—"}
                        </div>
                        {card.target && (
                          <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>Target: {card.fmtFn(card.target)}</div>
                        )}
                        {pct !== null && (
                          <>
                            <div style={{ height: "6px", background: "#eee", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: "3px" }} />
                            </div>
                            <div style={{ fontSize: "10px", color: barColor, fontWeight: 600, marginTop: "4px" }}>
                              {pct >= 100 ? "✓ Demand met" : `${pct}% of target demand`}
                            </div>
                          </>
                        )}
                        {pct === null && card.achieved && !card.target && (
                          <div style={{ fontSize: "10px", color: "#aaa", marginTop: "8px" }}>longest effort on record</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Terrain / elevation pairings */}
                {pairings.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={sectionLabel}>Top 10 Elevation · Terrain Pairings — kilometres built across all finishes</p>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: "180px" }}>Gradient Type</th>
                          <th style={{ ...thStyle, width: "130px" }}>Surface</th>
                          <th style={{ ...thStyle, width: "55px" }}>km</th>
                          <th style={{ ...thStyle, width: "50px" }}>Races</th>
                          <th style={thStyle}>Experience</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pairings.map((pair, i) => {
                          const barPct = (pair.total_km / maxPairingKm) * 100;
                          const col = pairingColor(pair.section_type);
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ ...tdStyle, fontWeight: 600, color: col }}>
                                {sectionTypeLabel(pair.section_type)}
                              </td>
                              <td style={{ ...tdStyle, color: "#555" }}>{terrainLabel(pair.terrain)}</td>
                              <td style={{ ...tdStyle, fontWeight: 700 }}>{pair.total_km.toFixed(1)}</td>
                              <td style={{ ...tdStyle, color: "#888" }}>{pair.race_count}</td>
                              <td style={tdStyle}>
                                <div style={{ height: "10px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${barPct}%`, background: col, borderRadius: "3px", opacity: 0.75 }} />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Race history table with demand bars */}
                {tableRaces.length > 0 ? (
                  <div>
                    <p style={sectionLabel}>Finished Race History — Demands vs Target</p>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Race</th>
                          <th style={thStyle}>Yr</th>
                          <th style={thStyle}>Time</th>
                          <th style={{ ...thStyle, width: "170px" }}>Distance</th>
                          <th style={{ ...thStyle, width: "170px" }}>Ascent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRaces.map((r, i) => {
                          const dPct    = r.total_distance_km ? Math.min(100, (r.total_distance_km / normDist)   * 100) : 0;
                          const aPct    = r.total_ascent_m    ? Math.min(100, (r.total_ascent_m    / normAscent) * 100) : 0;
                          const tgtDPct = targetDist   ? Math.min(100, (targetDist   / normDist)   * 100) : null;
                          const tgtAPct = targetAscent ? Math.min(100, (targetAscent / normAscent) * 100) : null;
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={tdStyle}>{r.race_name}</td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{r.result_year}</td>
                              <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{r.finish_seconds ? fmtTime(r.finish_seconds) : "—"}</td>
                              <td style={tdStyle}>
                                <div style={{ position: "relative", height: "12px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
                                  <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${dPct}%`, background: "#1565c0", borderRadius: "3px", opacity: 0.75 }} />
                                  {tgtDPct !== null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${tgtDPct}% - 1px)`, width: "2px", background: "#c0392b" }} />}
                                </div>
                                <div style={{ fontSize: "8px", color: "#888", marginTop: "1px" }}>{r.total_distance_km ? `${r.total_distance_km.toFixed(0)} km` : "—"}</div>
                              </td>
                              <td style={tdStyle}>
                                <div style={{ position: "relative", height: "12px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
                                  <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${aPct}%`, background: "#c0392b", borderRadius: "3px", opacity: 0.75 }} />
                                  {tgtAPct !== null && <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${tgtAPct}% - 1px)`, width: "2px", background: "#1e3a1e" }} />}
                                </div>
                                <div style={{ fontSize: "8px", color: "#888", marginTop: "1px" }}>{r.total_ascent_m ? `${Math.round(r.total_ascent_m)}m` : "—"}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {(targetDist || targetAscent) && (
                      <div style={{ marginTop: "8px", fontSize: "8.5px", color: "#999" }}>
                        Red line on each bar = target race demand
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: "14px" }}>
                    No finished race data found for this athlete.
                  </div>
                )}

                <PageNumber n={5} />
              </div>
            );
          })()}

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

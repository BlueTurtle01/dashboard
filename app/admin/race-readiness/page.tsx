"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeatherDayRecord } from "@/lib/race-analysis/open-meteo";

/* ── API types ── */
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
  km: number;
  name?: string;
  water: boolean;
  food: boolean;
  medic: boolean;
  toilets: boolean;
  dropBags: boolean;
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
  cat_position: number | null;
  cat_finishers: number | null;
}
interface TerrainPairing {
  section_type: string;
  terrain: string;
  total_km: number;
  race_count: number;
  avg_gradient: number;
}
interface AthleteResponse {
  profile: AthleteProfile;
  races: AthleteRace[];
  terrain_pairings?: TerrainPairing[];
  races_with_profile?: number;
}

/* ── Experience context types ── */
interface ExpContextScale {
  goal_distance_km: number; goal_ascent_m: number; goal_flat_equiv_km: number;
  athlete_max_dist:       { km: number; race_name: string; year: number } | null;
  athlete_max_ascent:     { m: number;  race_name: string; year: number } | null;
  athlete_max_flat_equiv: { km: number; race_name: string; year: number } | null;
  distance_ratio: number; ascent_ratio: number; flat_equiv_ratio: number;
}
interface ExpContextTimeEstimate {
  estimated_min_hours: number; estimated_max_hours: number;
  basis_race_name: string; basis_finish_hours: number;
  athlete_longest_hours: number; athlete_longest_race_name: string;
}
interface ExpContextBiggestClimb {
  goal: { km: number; ascent_m: number; avg_grad: number; start_km: number; end_km: number };
  athlete_best: { km: number; ascent_m: number; race_name: string; year: number } | null;
  ratio: number | null;
}
interface ExpContextOpeningMatch {
  goal_opening_km: number; goal_dominant_type: string; goal_dominant_terrain: string;
  goal_climb_pct: number;
  matched_race_name: string | null; matched_race_year: number | null;
  similarity: number;
}
interface ExperienceContextResult {
  scale: ExpContextScale | null;
  time_estimate: ExpContextTimeEstimate | null;
  biggest_climb: ExpContextBiggestClimb | null;
  opening_match: ExpContextOpeningMatch | null;
}

/* ── Prep races types ── */
interface PrepRaceGapFill {
  section_type: string;
  terrain: string;
  race_km: number;
  needed_km: number;
}
interface PrepRaceSuggestion {
  race_id: string;
  race_name: string;
  race_slug: string | null;
  distance_miles: number;
  next_date: string | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  gap_fill_score: number;
  gaps_filled: PrepRaceGapFill[];
}
interface PrepRacesResult {
  centroid: { lat: number; lon: number } | null;
  radius_miles: number;
  suggestions: PrepRaceSuggestion[];
}

/* ── Elevation profile match types ── */
type LoadingLabel = "front" | "even" | "back";
interface ElevProfileMatch {
  race_name: string;
  year: number;
  race_km: number;
  loading_label: LoadingLabel;
  halfway_pct: number;
  similarity_pct: number;
  partial_desc: string | null;
  total_ascent_m: number;
}
interface ElevProfileMatchResult {
  goal_loading_label: LoadingLabel | null;
  goal_halfway_pct: number | null;
  best_match: ElevProfileMatch | null;
  /** 20 values in [0,1]: fraction of total ascent at each 5% step of distance */
  match_curve: number[] | null;
  races_compared: number;
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
    const minLat = r0lat - dlat * 0.15 - 0.005, maxLat = r1lat + dlat * 0.15 + 0.005;
    const minLon = r0lon - dlon * 0.15 - 0.008, maxLon = r1lon + dlon * 0.15 + 0.008;
    let z = 14;
    for (; z >= 8; z--) { if ((osmTileX(maxLon, z) - osmTileX(minLon, z) + 1) * (osmTileY(minLat, z) - osmTileY(maxLat, z) + 1) <= 16) break; }
    const zPow = Math.pow(2, z);
    const mx0 = osmMercX(minLon), mx1 = osmMercX(maxLon), my0 = osmMercY(maxLat), my1 = osmMercY(minLat);
    const sc = Math.max(width / (mx1 - mx0), height / (my1 - my0));
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
  const sc = Math.max(width / (mx1 - mx0), height / (my1 - my0));
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
        const labelMins = b.min_min;
        const lh = Math.floor(labelMins / 60), lm = Math.round(labelMins % 60);
        const label = `${lh}h${lm > 0 ? ` ${lm}m` : ""}`;
        return <text key={i} x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="7.5" fill="#888">{label}</text>;
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

  // If the input is already focused when races finish loading, open the dropdown
  useEffect(() => {
    if (races.length > 0 && inputRef.current && inputRef.current === document.activeElement) {
      setOpen(true);
    }
  }, [races.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
        ref={inputRef}
        type="text"
        value={query}
        placeholder={races.length === 0 ? "Loading races…" : "Search races…"}
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

  const isFinished = (r: AthleteRace) => r.result_status === "FINISHED" || r.result_status === "UNKNOWN";

  // Full points: have position + total_finishers — can compute % field beaten
  type PlotPoint = { year: number; pct: number; raceName: string; pos: number; total: number; isRecent: boolean };
  const plotPts: PlotPoint[] = races
    .filter(r => isFinished(r) && r.position && r.total_finishers && r.total_finishers > 1)
    .sort((a, b) => a.result_year !== b.result_year ? a.result_year - b.result_year : (a.position ?? 999) - (b.position ?? 999))
    .map(r => ({
      year:     r.result_year,
      pct:      ((r.total_finishers! - r.position!) / (r.total_finishers! - 1)) * 100,
      raceName: r.race_name,
      pos:      r.position!,
      total:    r.total_finishers!,
      isRecent: r.result_year >= recentThreshold,
    }));

  // No-data points: finished with a position but no field-size info
  type NoDataPoint = { year: number; raceName: string; isRecent: boolean };
  const noDataPts: NoDataPoint[] = races
    .filter(r => isFinished(r) && r.position && (!r.total_finishers || r.total_finishers <= 1))
    .sort((a, b) => a.result_year - b.result_year)
    .map(r => ({ year: r.result_year, raceName: r.race_name, isRecent: r.result_year >= recentThreshold }));

  const allYears = [...plotPts.map(p => p.year), ...noDataPts.map(p => p.year)];
  if (plotPts.length + noDataPts.length < 2) return null;

  const minYear = Math.min(...allYears), maxYear = Math.max(...allYears);
  const singleYear = minYear === maxYear;

  // X position by year
  const xByYear = (yr: number) =>
    padL + (singleYear ? chartW / 2 : ((yr - minYear) / (maxYear - minYear)) * chartW);
  const yS = (pct: number) => padT + chartH - ((pct / 100) * chartH);

  const yTicks = [0, 25, 50, 75, 100];
  const xYears = Array.from(new Set(allYears)).sort((a, b) => a - b);
  const xStep  = xYears.length > 8 ? Math.ceil(xYears.length / 6) : 1;

  // Linear regression on full plotPts only
  const n  = plotPts.length;
  const mx = plotPts.reduce((s, p) => s + p.year, 0) / Math.max(n, 1);
  const my = plotPts.reduce((s, p) => s + p.pct,  0) / Math.max(n, 1);
  const slope = n >= 2
    ? plotPts.reduce((s, p) => s + (p.year - mx) * (p.pct - my), 0) /
      Math.max(plotPts.reduce((s, p) => s + (p.year - mx) ** 2, 0), 0.001)
    : 0;
  const intercept = my - slope * mx;
  const trendX1 = xByYear(minYear), trendX2 = xByYear(maxYear);
  const trendY1 = yS(Math.min(100, Math.max(0, intercept + slope * minYear)));
  const trendY2 = yS(Math.min(100, Math.max(0, intercept + slope * maxYear)));

  function dotColor(pct: number, isRecent: boolean): string {
    if (pct >= 90) return "#e65100";
    if (pct >= 75) return "#1e3a1e";
    if (isRecent)  return "#546e7a";
    return "#90a4ae";
  }

  return (
    <>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        {/* Gridlines + Y labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padL} y1={yS(t)} x2={W - padR} y2={yS(t)}
              stroke={t === 50 ? "#ddd" : "#f0f0f0"} strokeWidth={t === 50 ? "1.5" : "1"} strokeDasharray={t === 50 ? "4,3" : undefined} />
            <text x={padL - 5} y={yS(t) + 3.5} textAnchor="end" fontSize="8" fill="#aaa">{t}%</text>
          </g>
        ))}
        {/* Trend line (only when we have ≥2 full points) */}
        {!singleYear && n >= 2 && (
          <line x1={trendX1} y1={trendY1} x2={trendX2} y2={trendY2}
            stroke={slope > 0 ? "#2e7d32" : "#c0392b"} strokeWidth="1.5" strokeDasharray="5,3" opacity="0.55" />
        )}
        {/* Axes */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#ccc" strokeWidth="1" />
        <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#ccc" strokeWidth="1" />
        {/* X ticks */}
        {xYears.filter((_, i) => i % xStep === 0).map((yr, i) => (
          <g key={i}>
            <line x1={xByYear(yr)} y1={padT + chartH} x2={xByYear(yr)} y2={padT + chartH + 4} stroke="#ccc" strokeWidth="1" />
            <text x={xByYear(yr)} y={padT + chartH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{yr}</text>
          </g>
        ))}
        {/* Full dots — field position known */}
        {plotPts.map((p, i) => (
          <circle key={i} cx={xByYear(p.year)} cy={yS(p.pct)} r={5}
            fill={dotColor(p.pct, p.isRecent)} stroke="white" strokeWidth="1.5" opacity="0.9" />
        ))}
        {/* No-data dots — finished but no field size; plotted at 50% as hollow rings */}
        {noDataPts.map((p, i) => (
          <circle key={`nd-${i}`} cx={xByYear(p.year)} cy={yS(50)} r={4.5}
            fill="white" stroke="#aaa" strokeWidth="1.5" strokeDasharray="2,1.5" opacity="0.85" />
        ))}
        {/* Y-axis label */}
        <text x={10} y={padT + chartH / 2} textAnchor="middle" fontSize="7.5" fill="#bbb"
          transform={`rotate(-90,10,${padT + chartH / 2})`}>field beaten</text>
      </svg>
      {/* Legend — below chart to avoid obscuring data */}
      <div style={{ display: "flex", gap: "14px", marginTop: "5px", flexWrap: "wrap", paddingLeft: `${padL}px` }}>
        {[
          { color: "#e65100", label: "Top 10%" },
          { color: "#1e3a1e", label: "Top 25%" },
          { color: "#90a4ae", label: "Rest" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: "8px", color: "#666" }}>{label}</span>
          </div>
        ))}
        {noDataPts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", border: "1.5px dashed #aaa", flexShrink: 0 }} />
            <span style={{ fontSize: "8px", color: "#666" }}>No field data (shown at 50%)</span>
          </div>
        )}
      </div>
    </>
  );
}

/* Race history rows — shared between recent and highlights sections */
function RaceHistoryRows({ races, highlightIds }: { races: AthleteRace[]; highlightIds?: Set<string> }) {
  function fmt(s: number | null) {
    if (!s || s <= 0) return "—";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  function statusBadge(status: string): { label: string; color: string } {
    if (status === "FINISHED" || status === "UNKNOWN") return { label: "Finished", color: "#2e7d32" };
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
  const W = 698, H = 160, padL = 48, padR = 12, padT = 16, padB = 30;
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

/* Cumulative ascent line chart — X axis: % of distance, Y axis: absolute metres */
function CumulativeAscentChart({ profile, comparison }: {
  profile: RaceElevProfile;
  comparison?: { curve: number[]; totalAscentM: number; label: string } | null;
}) {
  const W = 698, H = 170, padL = 52, padR = 12, padT = 16, padB = 36;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  // Build goal race cumulative ascent in absolute metres
  const pts = downsample(profile.points, 400);
  const cumPts: { pct: number; ascent: number }[] = [{ pct: 0, ascent: 0 }];
  let running = 0;
  const totalKm = profile.totalDistanceKm;
  for (let i = 1; i < pts.length; i++) {
    const diff = pts[i].elevationM - pts[i - 1].elevationM;
    if (diff > 0) running += diff;
    cumPts.push({ pct: (pts[i].distanceKm / totalKm) * 100, ascent: running });
  }
  const goalTotalAscent = running;

  // Shared Y range — driven by whichever race climbs more
  const compTotalAscent = comparison?.totalAscentM ?? 0;
  const yMax = Math.max(goalTotalAscent, compTotalAscent, 1);

  const xS = (pct: number) => padL + (pct / 100) * chartW;
  const yS = (m: number)   => padT + chartH - (m / yMax) * chartH;

  const goalLinePts = cumPts.map(p => `${xS(p.pct).toFixed(1)},${yS(p.ascent).toFixed(1)}`).join(" ");
  const goalAreaD =
    `M${xS(0).toFixed(1)},${(padT + chartH).toFixed(1)} ` +
    cumPts.map(p => `L${xS(p.pct).toFixed(1)},${yS(p.ascent).toFixed(1)}`).join(" ") +
    ` L${xS(100).toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  // Comparison line: denormalize curve values back to absolute metres
  const compPts = comparison?.curve
    ? [{ x: 0, y: 0 }, ...comparison.curve.map((v, i) => ({
        x: ((i + 1) / comparison.curve.length) * 100,
        y: v * comparison.totalAscentM,
      }))]
    : null;
  const compLinePts = compPts
    ? compPts.map(p => `${xS(p.x).toFixed(1)},${yS(p.y).toFixed(1)}`).join(" ")
    : null;

  // Y-axis ticks at 0%, 25%, 50%, 75%, 100% of yMax
  const yTickFractions = [0, 0.25, 0.5, 0.75, 1];
  const xPctTicks = [0, 25, 50, 75, 100];

  // Quarter distance annotations (goal race ascent in metres at 25/50/75% distance)
  const quarters = [25, 50, 75];
  const quartAnnotations = quarters.map(q => {
    const pt = cumPts.reduce((best, p) => Math.abs(p.pct - q) < Math.abs(best.pct - q) ? p : best);
    return { q, ascent: Math.round(pt.ascent) };
  });

  const fmtM = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)}k m` : `${Math.round(m)} m`;

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Y grid lines + labels */}
      {yTickFractions.map((f, i) => {
        const m = f * yMax;
        return (
          <g key={i}>
            <line x1={padL} y1={yS(m)} x2={W - padR} y2={yS(m)} stroke="#eee" strokeWidth="1" />
            <text x={padL - 4} y={yS(m) + 3.5} textAnchor="end" fontSize="7.5" fill="#888">{fmtM(m)}</text>
          </g>
        );
      })}
      {/* Quarter distance markers */}
      {quartAnnotations.map(({ q, ascent }, i) => (
        <g key={i}>
          <line x1={xS(q)} y1={padT} x2={xS(q)} y2={padT + chartH} stroke="#e0e0e0" strokeWidth="1" strokeDasharray="3,3" />
          <text x={xS(q)} y={padT - 3} textAnchor="middle" fontSize="7.5" fill="#aaa">{fmtM(ascent)}</text>
        </g>
      ))}
      {/* Goal race area + line */}
      <path d={goalAreaD} fill="#c0392b18" />
      <polyline points={goalLinePts} fill="none" stroke="#c0392b" strokeWidth="2" strokeLinejoin="round" />
      {/* Comparison line */}
      {compLinePts && (
        <polyline points={compLinePts} fill="none" stroke="#1565c0" strokeWidth="1.8"
          strokeLinejoin="round" strokeDasharray="5,3" />
      )}
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#bbb" strokeWidth="1" />
      {/* X-axis ticks */}
      {xPctTicks.map((t, i) => (
        <g key={i}>
          <line x1={xS(t)} y1={padT + chartH} x2={xS(t)} y2={padT + chartH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS(t)} y={padT + chartH + 12} textAnchor="middle" fontSize="8" fill="#888">{t}%</text>
        </g>
      ))}
      {/* Axis labels */}
      <text x={padL + chartW / 2} y={H - 2} textAnchor="middle" fontSize="7.5" fill="#aaa">% of course distance</text>
      <text
        x={10} y={padT + chartH / 2}
        textAnchor="middle" fontSize="7.5" fill="#aaa"
        transform={`rotate(-90, 10, ${padT + chartH / 2})`}
      >cumulative ascent (m)</text>
      {/* Legend */}
      {comparison && (
        <g transform={`translate(${padL + 8}, ${padT + 8})`}>
          <rect x={0} y={0} width={320} height={22} fill="white" opacity={0.88} rx={3} />
          <line x1={6} y1={11} x2={22} y2={11} stroke="#c0392b" strokeWidth="2" />
          <text x={27} y={14.5} fontSize="8" fill="#333">Goal race ({Math.round(goalTotalAscent).toLocaleString()} m ↑)</text>
          {compLinePts && (
            <>
              <line x1={140} y1={11} x2={156} y2={11} stroke="#1565c0" strokeWidth="1.8" strokeDasharray="5,3" />
              <text x={161} y={14.5} fontSize="8" fill="#333">{comparison.label} ({comparison.totalAscentM.toLocaleString()} m ↑)</text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}

/* Terrain strip — color-coded sections across the course */
function TerrainStrip({ sections, totalKm }: { sections: TerrainSection[]; totalKm: number }) {
  const W = 698, H = 52;
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
    <div style={{ background: "#fafafa", border: `1px solid #e0e0e0`, borderLeft: `3px solid ${accent}`, borderRadius: "6px", padding: "10px 12px" }}>
      <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</p>
      <div style={{ fontSize: "11px", color: "#444", lineHeight: "1.5" }}>{children}</div>
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
const printHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #1e3a1e", paddingBottom: "12px", marginBottom: "18px" };
const logoImg: React.CSSProperties = { height: "36px", width: "auto", objectFit: "contain" };
const sectionLabel: React.CSSProperties = { margin: "0 0 4px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" };
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
  const [reportAthlete, setReportAthlete] = useState<AthleteResponse | null>(null);
  const [athleteLoading, setAthleteLoading] = useState(false);
  const [athleteError, setAthleteError]   = useState("");
  const [radiusMiles, setRadiusMiles]     = useState(100);
  const [prepRaces, setPrepRaces]         = useState<PrepRacesResult | null>(null);
  const [prepRacesLoading, setPrepRacesLoading] = useState(false);
  const [expContext, setExpContext]        = useState<ExperienceContextResult | null>(null);
  const [expContextLoading, setExpContextLoading] = useState(false);
  const [elevProfileMatch, setElevProfileMatch] = useState<ElevProfileMatchResult | null>(null);
  const [includedRaceKeys, setIncludedRaceKeys] = useState<Set<string>>(new Set());
  const [athleteAidData, setAthleteAidData]     = useState<Record<string, AidStation[]>>({});

  const fetchAthlete = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setAthleteLoading(true);
    setAthleteError("");
    setAthlete(null);
    try {
      const res = await fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(key.trim())}`);
      const json = await res.json() as AthleteResponse & { error?: string };
      if (!res.ok || json.error) { setAthleteError(json.error ?? "Failed to load athlete."); }
      else {
        setAthlete(json);
        setIncludedRaceKeys(new Set(json.races.map(r => `${r.race_id}|${r.result_year}`)));
      }
    } catch { setAthleteError("Network error loading athlete."); }
    setAthleteLoading(false);
  }, []);

  // reportAthlete is fetched at generate-time with the include filter applied server-side,
  // so its races, terrain pairings, and profile stats already reflect only selected races.
  const filteredAthleteRaces = reportAthlete?.races ?? [];

  // Derived — elevation + segments
  const elevProfile    = result ? parseElevProfile(result.elevation_profile) : null;
  const sustainedSegs  = result ? parseSustainedSegs(result.sustained_segments) : null;
  const notable        = (sustainedSegs ?? [])
    .filter(s => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);
  const windData       = result?.wind_sections ?? [];

  // Elevation aggregates (climbing / descending / flat)
  const terrainSummary = (() => {
    const secs  = result?.terrain_sections ?? [];
    const total = secs.reduce((s, t) => s + t.distance_km, 0);
    const climbing   = secs.filter(s => s.section_type.includes("climb")).reduce((s, t) => s + t.distance_km, 0);
    const descending = secs.filter(s => s.section_type.includes("descent")).reduce((s, t) => s + t.distance_km, 0);
    return { total, climbing, descending, flat: Math.max(0, total - climbing - descending) };
  })();

  // Surface / terrain composition (road, trail, fell, etc.)
  const surfaceSummary = (() => {
    const secs = result?.terrain_sections ?? [];
    const map: Record<string, number> = {};
    for (const s of secs) {
      if (s.terrain) map[s.terrain] = (map[s.terrain] ?? 0) + s.distance_km;
    }
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { entries, total };
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

  // Load races list — names only on mount (fast), profile data loads when a race is selected
  useEffect(() => {
    async function load() {
      const { data: raceRows } = await supabase.from("races").select("id, name").order("name");
      if (!raceRows) return;
      setRaces(raceRows.map(r => ({
        race_id:           r.id as string,
        race_name:         r.name as string,
        total_distance_km: null,
        total_ascent_m:    null,
      })));
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When a race is selected, lazily fetch its profile to show distance/ascent in the UI
  function handleRaceSelect(id: string) {
    setSelectedRaceId(id);
    void (async () => {
      try {
        const { data } = await supabase
          .from("race_profiles")
          .select("race_id, total_distance_km, total_ascent_m")
          .eq("race_id", id)
          .maybeSingle();
        if (!data) return;
        const d = data as { total_distance_km: number | null; total_ascent_m: number | null };
        setRaces(prev => prev.map(r =>
          r.race_id === id ? { ...r, total_distance_km: d.total_distance_km ?? null, total_ascent_m: d.total_ascent_m ?? null } : r
        ));
      } catch { /* profile is optional — shown if available */ }
    })();
  }

  async function handleGenerate() {
    if (!selectedRaceId) { setGenError("Please select a race."); return; }
    setGenerating(true);
    setGenError("");
    setNoRaceProfile(false);
    // Clear previous report so nothing renders until all data is ready
    setResult(null);
    setWeather([]);
    setResults(null);
    setSplitAnalysis(null);
    setPrepRaces(null);
    setExpContext(null);
    setReportAthlete(null);
    setAthleteAidData({});

    // ── Step 1: Race overview (sequential — its response feeds downstream calls) ──
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

    // ── Step 2: Fire remaining calls in parallel ──
    const effectiveDate = effectiveResult.race.race_date;
    const hasWeather = effectiveDate && effectiveResult.race.weather_lat !== null && effectiveResult.race.weather_lon !== null;

    const weatherPromise: Promise<WeatherDayRecord[]> = hasWeather
      ? (() => {
          const [, monthStr, dayStr] = effectiveDate!.split("-");
          return fetch("/api/race-analysis/weather-history", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat: effectiveResult.race.weather_lat, lon: effectiveResult.race.weather_lon, month: parseInt(monthStr, 10), day: parseInt(dayStr, 10) }),
          }).then(r => r.ok ? (r.json() as Promise<{ data: WeatherDayRecord[] }>).then(d => d.data ?? []) : []).catch(() => []);
        })()
      : Promise.resolve([]);

    const resultsPromise: Promise<ResultsResponse | null> = fetch("/api/race-strategy/results", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ race_id: selectedRaceId, target_minutes: 600 }),
    }).then(r => r.ok ? r.json() as Promise<ResultsResponse> : null).catch(() => null);

    const prepRacesPromise: Promise<PrepRacesResult | null> = (selectedAthleteKey.trim() && selectedRaceId)
      ? fetch(`/api/race-readiness/prep-races?key=${encodeURIComponent(selectedAthleteKey.trim())}&race_id=${encodeURIComponent(selectedRaceId)}&radius_miles=${radiusMiles}`)
          .then(r => r.ok ? r.json() as Promise<PrepRacesResult> : null).catch(() => null)
      : Promise.resolve(null);

    const expContextPromise: Promise<ExperienceContextResult | null> = (selectedAthleteKey.trim() && selectedRaceId)
      ? fetch(`/api/race-readiness/experience-context?key=${encodeURIComponent(selectedAthleteKey.trim())}&race_id=${encodeURIComponent(selectedRaceId)}`)
          .then(r => r.ok ? r.json() as Promise<ExperienceContextResult> : null).catch(() => null)
      : Promise.resolve(null);

    const elevProfileMatchPromise: Promise<ElevProfileMatchResult | null> = (selectedAthleteKey.trim() && selectedRaceId)
      ? fetch(`/api/race-readiness/elevation-profile-match?key=${encodeURIComponent(selectedAthleteKey.trim())}&race_id=${encodeURIComponent(selectedRaceId)}`)
          .then(r => r.ok ? r.json() as Promise<ElevProfileMatchResult> : null).catch(() => null)
      : Promise.resolve(null);

    // Fetch athlete with the include filter applied so terrain pairings and profile
    // stats are computed only from the selected races.
    const includeParam = [...includedRaceKeys].join(",");
    const reportAthletePromise: Promise<AthleteResponse | null> = selectedAthleteKey.trim()
      ? fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(selectedAthleteKey.trim())}&include=${encodeURIComponent(includeParam)}`)
          .then(r => r.ok ? r.json() as Promise<AthleteResponse> : null).catch(() => null)
      : Promise.resolve(null);

    const [weatherData, resultsData, prepRacesData, expContextData, elevProfileMatchData, reportAthleteData] = await Promise.all([
      weatherPromise, resultsPromise, prepRacesPromise, expContextPromise, elevProfileMatchPromise, reportAthletePromise,
    ]);

    // ── Step 3: Split analysis — needs the median derived from resultsData ──
    let splitData: ResultsResponse | null = null;
    if (resultsData?.has_data && resultsData.distribution?.length) {
      const dist = resultsData.distribution;
      const total = resultsData.total_finishers ?? 0;
      let cumulative = 0;
      let medianMin  = dist[Math.floor(dist.length / 2)].min_min;
      for (const b of dist) {
        cumulative += b.count;
        if (cumulative >= total / 2) { medianMin = (b.min_min + b.max_min) / 2; break; }
      }
      try {
        const r = await fetch("/api/race-strategy/results", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ race_id: selectedRaceId, target_minutes: Math.round(medianMin) }),
        });
        if (r.ok) splitData = await r.json() as ResultsResponse;
      } catch { /* optional */ }
    }

    // ── Step 4: Commit everything at once — report renders fully or not at all ──
    setResult(effectiveResult);
    setWeather(weatherData);
    setResults(resultsData);
    setSplitAnalysis(splitData);
    setPrepRaces(prepRacesData);
    setExpContext(expContextData);
    setElevProfileMatch(elevProfileMatchData);
    if (reportAthleteData) {
      setReportAthlete(reportAthleteData);
      // Fetch aid station data for athlete's previous races
      const raceIds = reportAthleteData.races.map((r: { race_id: string }) => r.race_id);
      if (raceIds.length > 0) {
        fetch("/api/race-readiness/aid-stations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ race_ids: raceIds }),
        })
          .then(r => r.json())
          .then((data: Record<string, AidStation[]>) => setAthleteAidData(data))
          .catch(() => { /* aid station data is non-critical — silently skip */ });
      }
    }
    setGenerating(false);
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

  // Gradient distribution stats for PAGE 3 narrative
  const runnableKm    = secs.filter(s => s.avg_gradient_percent >= -3 && s.avg_gradient_percent < 3).reduce((a, s) => a + s.distance_km, 0);
  const steepClimbKm  = secs.filter(s => s.avg_gradient_percent >= 8).reduce((a, s) => a + s.distance_km, 0);
  const steepDescentKm = secs.filter(s => s.avg_gradient_percent < -8).reduce((a, s) => a + s.distance_km, 0);
  const runnablePct   = totalKm > 0 ? Math.round(runnableKm    / totalKm * 100) : 0;
  const steepClimbPct = totalKm > 0 ? Math.round(steepClimbKm  / totalKm * 100) : 0;
  const steepDescentPct = totalKm > 0 ? Math.round(steepDescentKm / totalKm * 100) : 0;
  const courseCharacter = runnablePct > 60
    ? "mostly flat and runnable — athletes can hold a consistent rhythm for large stretches"
    : steepClimbPct + steepDescentPct > 30
    ? "technically demanding — a large proportion of the course is steep in either direction"
    : runnablePct > 35
    ? "mixed terrain — runnable sections break up the climbing and descending"
    : "constantly variable — gradient changes frequently, making a fixed pace target unreliable";

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
            onSelect={handleRaceSelect}
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
        <div>
          <div style={labelStyle}>Prep race radius</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="number"
              value={radiusMiles}
              min={10}
              max={500}
              step={10}
              onChange={e => setRadiusMiles(Math.max(10, Math.min(500, Number(e.target.value))))}
              style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", width: "70px" }}
            />
            <span style={{ fontSize: "12px", color: "#888" }}>miles</span>
          </div>
        </div>
        {result && <button type="button" onClick={() => window.print()} style={printBtn}>Export to PDF</button>}

        {/* ── Race picker — shows after athlete loads ── */}
        {athlete && !athleteLoading && (
          <div style={{ flexBasis: "100%", borderTop: "1px solid #eee", paddingTop: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <div style={labelStyle}>Races to include in analysis</div>
              <span style={{ fontSize: "12px", color: "#888" }}>
                {includedRaceKeys.size} of {athlete.races.length} selected
              </span>
              <button
                type="button"
                onClick={() => setIncludedRaceKeys(new Set(athlete.races.map(r => `${r.race_id}|${r.result_year}`)))}
                style={{ fontSize: "12px", color: "#1e3a1e", background: "none", border: "1px solid #1e3a1e", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
              >Select all</button>
              <button
                type="button"
                onClick={() => setIncludedRaceKeys(new Set())}
                style={{ fontSize: "12px", color: "#888", background: "none", border: "1px solid #ccc", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}
              >Clear all</button>
            </div>
            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e5e5", borderRadius: "8px" }}>
              {[...athlete.races].sort((a, b) => b.result_year - a.result_year).map(r => {
                const key = `${r.race_id}|${r.result_year}`;
                const checked = includedRaceKeys.has(key);
                return (
                  <label
                    key={key}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 12px", cursor: "pointer", borderBottom: "1px solid #f5f5f5", background: checked ? "#fff" : "#fafafa" }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        const next = new Set(includedRaceKeys);
                        if (e.target.checked) next.add(key); else next.delete(key);
                        setIncludedRaceKeys(next);
                      }}
                      style={{ accentColor: "#1e3a1e", width: "14px", height: "14px", flexShrink: 0 }}
                    />
                    <span style={{ fontSize: "12px", color: "#999", width: "36px", flexShrink: 0 }}>{r.result_year}</span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: checked ? "#1e3a1e" : "#aaa", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.race_name}</span>
                    {r.total_distance_km != null && <span style={{ fontSize: "11px", color: "#bbb", flexShrink: 0 }}>{r.total_distance_km.toFixed(0)} km</span>}
                    {r.total_ascent_m != null && <span style={{ fontSize: "11px", color: "#bbb", flexShrink: 0 }}>{Math.round(r.total_ascent_m).toLocaleString()}m ↑</span>}
                    <span style={{ fontSize: "11px", fontWeight: 600, flexShrink: 0, color: r.result_status === "FINISHED" ? "#2e7d32" : r.result_status === "DNF" ? "#c0392b" : "#888" }}>{r.result_status}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {result && (
        <div style={canvas} className="race-strategy-canvas">

          {/* ═══════════════════════════════════════
              TABLE OF CONTENTS
          ═══════════════════════════════════════ */}
          {(() => {
            type TocEntry = { title: string; body: string; visible: boolean };
            const entries: TocEntry[] = [
              {
                title: "Executive Readiness Verdict",
                body: "The opening verdict page — overall readiness rating, the athlete's single biggest strength, primary risk, and the top preparation priorities. Also sets out what this report does and does not assess.",
                visible: !!(reportAthlete && expContext),
              },
              {
                title: "Readiness Narrative",
                body: "A plain-English synthesis of the full report — why the athlete is or is not broadly ready, what the course demands relative to their history, and what could still catch them out on race day.",
                visible: !!reportAthlete,
              },
              {
                title: "Readiness Scorecard",
                body: "A structured summary across six readiness dimensions: Distance, Ascent, Descent, Terrain specificity, Technical terrain, and Aid logistics. Each is rated Strong / Moderate / Major gap / Unknown with the underlying numbers shown.",
                visible: !!reportAthlete,
              },
              {
                title: "Race Overview",
                body: "A high-level picture of the course: mapped route, terrain composition, and key course metrics. Use this page to build a shared mental model of the race before reading the deeper analysis.",
                visible: true,
              },
              {
                title: "Elevation",
                body: "The elevation profile, composition, and climbing load show how ascent is distributed across the course — when the hard work arrives, how the course is weighted front-to-back, and how the climbing density compares to races the athlete has already completed.",
                visible: !!(elevProfile || terrainSummary.total > 0),
              },
              {
                title: "Race Demands Profile",
                body: "What the course requires, shown through three technical charts. The gradient histogram reveals how much of the course is steep, the effort multiplier chart shows the energy cost of each section, and the technical terrain panel identifies where off-road ground falls in the race.",
                visible: true,
              },
              {
                title: "Race Demands Profile (continued)",
                body: "Demand summary cards quantify the four key physical challenges — climbing volume, descending load, final third demands, and effort variability. Late-race pattern data shows how athletes typically manage late-race fatigue on this course.",
                visible: true,
              },
              {
                title: "Athlete Overview",
                body: "A profile of the athlete's competitive history, including career highlights, recent results, and category finishes over the last two years. This page establishes the baseline from which all readiness comparisons on subsequent pages are drawn.",
                visible: !!reportAthlete,
              },
              {
                title: "Experience Gaps",
                body: "Every terrain type on the goal course is listed — climb trail, descent road, flat fell, and so on — alongside how many kilometres of that terrain the athlete has covered in previous races. Red and amber rows identify where targeted build-up would have the most impact.",
                visible: !!reportAthlete,
              },
              {
                title: "Demands Built Up",
                body: "The athlete's peak single-race load versus what this race demands. Bar charts compare the highest distance, ascent, and flat-equivalent effort the athlete has recorded against the goal race targets — the fastest way to spot which dimensions are under-prepared.",
                visible: !!reportAthlete,
              },
              {
                title: "Aid Station Analysis",
                body: "Gap analysis between aid stations, comparison against the athlete's largest previously-managed unsupported stretch, and preparation flags for nutrition logistics and drop bag strategy.",
                visible: !!reportAthlete,
              },
              {
                title: "Suggested Preparation Races",
                body: "Nearby races ranked by how effectively they would close the athlete's identified experience gaps. Each suggestion lists the specific terrain types it covers and the kilometres it would contribute toward closing each gap.",
                visible: !!reportAthlete,
              },
              {
                title: "Experience Context",
                body: "Three contextual comparisons that put the goal race in perspective: scale ratios showing how much bigger this race is than anything the athlete has done, the biggest climb on the course versus the athlete's personal best, and which past race most resembles the opening section.",
                visible: !!(reportAthlete && expContext),
              },
              {
                title: "Suggested Next Steps",
                body: "Prioritised actions for the preparation period — specific training focus areas, race-day logistics to confirm, and the most impactful gaps to address before the start line.",
                visible: !!reportAthlete,
              },
              {
                title: "Appendix A — Complete Race History",
                body: "Every race on record for this athlete, sorted by year. Includes distance, ascent, finishing time, and overall and category positions.",
                visible: !!reportAthlete,
              },
            ];
            const visible = entries.filter(e => e.visible);
            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness Report</div>
                  </div>
                </div>
                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Report Contents</h2>
                <p style={{ margin: "0 0 24px", fontSize: "12px", color: "#888" }}>
                  What each section covers and what to look for
                </p>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {visible.map((entry, i) => (
                    <div key={i} style={{
                      display: "flex", gap: "16px", padding: "14px 0",
                      borderBottom: i < visible.length - 1 ? "1px solid #f0f0f0" : "none",
                      alignItems: "flex-start",
                    }}>
                      <div style={{
                        flexShrink: 0, width: "26px", height: "26px", borderRadius: "50%",
                        background: "#1e3a1e", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 700, marginTop: "2px",
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e", marginBottom: "4px" }}>
                          {entry.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "#555", lineHeight: 1.65 }}>
                          {entry.body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 1 — Executive Readiness Verdict
          ═══════════════════════════════════════ */}
          {result && reportAthlete && expContext && (() => {
            type ReadinessLevel = "strong" | "moderate" | "major_gap" | "unknown";

            const firstName  = reportAthlete.profile.athlete_key.split(" ")[0];
            const sc         = expContext.scale;
            const goalDist   = result.race.total_distance_km;
            const goalAscent = result.race.total_ascent_m;
            const goalDescent= result.race.total_descent_m;

            // ── Athlete bests ──────────────────────────────────────────────
            const athDist   = sc?.athlete_max_dist?.km ?? 0;
            const athAscent = sc?.athlete_max_ascent?.m ?? reportAthlete.profile.max_ascent_m ?? 0;
            const athFlatEq = sc?.athlete_max_flat_equiv?.km ?? reportAthlete.profile.max_flat_equiv_km ?? 0;
            const goalFlatEq= sc?.goal_flat_equiv_km ?? 0;

            // ── Status levels ──────────────────────────────────────────────
            const levelColor = (l: ReadinessLevel) =>
              l === "strong" ? "#2e7d32" : l === "moderate" ? "#f57c00" : l === "major_gap" ? "#c0392b" : "#9e9e9e";
            const levelBg = (l: ReadinessLevel) =>
              l === "strong" ? "#e8f5e9" : l === "moderate" ? "#fff3e0" : l === "major_gap" ? "#fce4ec" : "#f5f5f5";
            const levelLabel = (l: ReadinessLevel) =>
              l === "strong" ? "Strong" : l === "moderate" ? "Moderate" : l === "major_gap" ? "Major gap" : "Unknown";

            const distStatus: ReadinessLevel =
              athDist === 0 || goalDist === 0 ? "unknown" :
              athDist >= goalDist         ? "strong" :
              athDist >= goalDist * 0.7   ? "moderate" : "major_gap";

            const ascentStatus: ReadinessLevel =
              athAscent === 0 || goalAscent === 0 ? "unknown" :
              athAscent >= goalAscent * 0.8 ? "strong" :
              athAscent >= goalAscent * 0.5 ? "moderate" : "major_gap";

            const flatStatus: ReadinessLevel =
              athFlatEq === 0 || goalFlatEq === 0 ? "unknown" :
              athFlatEq >= goalFlatEq * 0.8  ? "strong" :
              athFlatEq >= goalFlatEq * 0.55 ? "moderate" : "major_gap";

            // ── Gap rows (same logic as page 5 / Experience Gaps) ─────────
            const _tpm: Record<string, { section_type: string; terrain: string; km: number }> = {};
            for (const sec of result.terrain_sections) {
              const key = `${sec.section_type}|${sec.terrain}`;
              if (!_tpm[key]) _tpm[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0 };
              _tpm[key].km += sec.distance_km;
            }
            const _aem: Record<string, number> = {};
            for (const tp of reportAthlete.terrain_pairings ?? []) {
              _aem[`${tp.section_type}|${tp.terrain}`] = tp.total_km;
            }
            const summaryGapRows = Object.values(_tpm)
              .filter(tp => tp.km >= 0.1)
              .map(tp => {
                const exactKm = _aem[`${tp.section_type}|${tp.terrain}`] ?? 0;
                const pct = tp.km > 0 ? Math.min(100, Math.round((exactKm / tp.km) * 100)) : 100;
                return {
                  section_type: tp.section_type, terrain: tp.terrain,
                  km: tp.km, exactKm, pct,
                  status: exactKm === 0 ? "none" as const : pct >= 100 ? "met" as const : "partial" as const,
                };
              });

            const descentRows      = summaryGapRows.filter(r => r.section_type.includes("descent"));
            const descentDemandKm  = descentRows.reduce((s, r) => s + r.km, 0);
            const descentCoveredKm = descentRows.reduce((s, r) => s + r.exactKm, 0);
            const descentStatus: ReadinessLevel =
              descentDemandKm === 0 ? "unknown" :
              descentCoveredKm / descentDemandKm >= 0.8 ? "strong" :
              descentCoveredKm / descentDemandKm >= 0.5 ? "moderate" : "major_gap";

            const trailRows      = summaryGapRows.filter(r => ["trail","technical_trail","fell"].includes(r.terrain));
            const trailDemandKm  = trailRows.reduce((s, r) => s + r.km, 0);
            const trailCoveredKm = trailRows.reduce((s, r) => s + r.exactKm, 0);
            const terrainStatus: ReadinessLevel =
              trailDemandKm === 0 ? "unknown" :
              trailCoveredKm / trailDemandKm >= 0.8 ? "strong" :
              trailCoveredKm / trailDemandKm >= 0.5 ? "moderate" : "major_gap";

            // ── Overall verdict ────────────────────────────────────────────
            const statusList = [distStatus, ascentStatus, descentStatus, terrainStatus]
              .filter((s): s is "strong" | "moderate" | "major_gap" => s !== "unknown");
            const majorCount = statusList.filter(s => s === "major_gap").length;
            const metCount   = summaryGapRows.filter(r => r.status === "met").length;

            const overallLabel =
              majorCount >= 2 ? "Not yet race-specific ready" :
              majorCount === 1 ? "Aerobically capable, but race-specific gaps remain" :
              statusList.includes("moderate") ? "Mostly ready, with specific risks" :
              "Race-specific ready";

            const verdictColor =
              overallLabel === "Race-specific ready"      ? "#2e7d32" :
              overallLabel.includes("Mostly ready")        ? "#f57c00" :
              overallLabel.includes("Aerobically capable") ? "#e65100" : "#c0392b";

            // ── Verdict text ───────────────────────────────────────────────
            const verdictParts: string[] = [];
            if (distStatus === "strong" && sc?.athlete_max_dist) {
              verdictParts.push(
                `${firstName} has demonstrated the endurance to complete distances longer than ${result.race.name} — ` +
                `the longest recorded race is ${sc.athlete_max_dist.race_name} (${sc.athlete_max_dist.km.toFixed(0)} km).`
              );
            } else if (distStatus === "major_gap" && goalDist > 0) {
              verdictParts.push(`At ${goalDist.toFixed(0)} km, ${result.race.name} is longer than anything clearly on record for ${firstName}.`);
            }
            if (ascentStatus === "major_gap" && athAscent > 0 && goalAscent > 0) {
              const ar = (goalAscent / athAscent).toFixed(1);
              const goalPerKm = goalDist > 0 ? Math.round(goalAscent / goalDist) : 0;
              verdictParts.push(
                `The main concern is not distance — it is vertical load. The target race demands ${Math.round(goalAscent).toLocaleString()} m of ascent ` +
                `(${goalPerKm} m/km), ${ar}× more than the best on record (${Math.round(athAscent).toLocaleString()} m).`
              );
            } else if (ascentStatus === "moderate" && athAscent > 0 && goalAscent > 0) {
              const goalPerKm = goalDist > 0 ? Math.round(goalAscent / goalDist) : 0;
              verdictParts.push(`The ascent load is a step up: ${Math.round(goalAscent).toLocaleString()} m target (${goalPerKm} m/km) vs ${Math.round(athAscent).toLocaleString()} m best recorded.`);
            }
            if (verdictParts.length === 0) {
              verdictParts.push(`${firstName}'s readiness for ${result.race.name} has been assessed across distance, ascent, descent, and terrain specificity.`);
            }
            const verdictText = verdictParts.join(" ");

            // ── Biggest strength ───────────────────────────────────────────
            let strengthText =
              distStatus === "strong" && sc?.athlete_max_dist
                ? `${firstName} has already proven the ability to complete ultra-distance events longer than ${result.race.name}. ` +
                  `The longest recorded race — ${sc.athlete_max_dist.race_name} (${sc.athlete_max_dist.km.toFixed(0)} km, ${sc.athlete_max_dist.year}) — ` +
                  `shows basic endurance and willingness to stay on course for a long time are not in question.`
              : flatStatus === "strong" && sc?.athlete_max_flat_equiv
                ? `${firstName}'s total effort capacity is strong. A best flat-equivalent load of ${sc.athlete_max_flat_equiv.km.toFixed(1)} km ` +
                  `(${sc.athlete_max_flat_equiv.race_name}, ${sc.athlete_max_flat_equiv.year}) shows the engine is there for sustained effort.`
              : metCount > 0
                ? `${firstName} has covered ${metCount} of ${summaryGapRows.length} terrain-demand types at or above race-ready levels. ` +
                  `That breadth of proven experience across conditions is a genuine asset.`
                : `Completing multiple ultra-distance events demonstrates commitment and the ability to manage race-day adversity over extended periods.`;

            // ── Biggest limiter ────────────────────────────────────────────
            let limiterText =
              ascentStatus === "major_gap"
                ? (() => {
                    const pct = goalAscent > 0 && athAscent > 0 ? Math.round((athAscent / goalAscent) * 100) : null;
                    return (
                      `Vertical load is the main limiter. ${result.race.name} includes ${goalAscent > 0 ? Math.round(goalAscent).toLocaleString() : "—"} m of ascent, ` +
                      `compared with ${firstName}'s best recorded ascent of ${athAscent > 0 ? Math.round(athAscent).toLocaleString() : "unknown"} m` +
                      `${sc?.athlete_max_ascent ? ` (${sc.athlete_max_ascent.race_name}, ${sc.athlete_max_ascent.year})` : ""}. ` +
                      `${pct != null ? `That is only ${pct}% of the target race demand.` : ""}`
                    );
                  })()
              : terrainStatus === "major_gap"
                ? `Trail and fell-specific experience is the key gap. The target race is predominantly off-road mountain terrain, and the majority of matched race history does not reflect equivalent trail or fell conditions.`
              : descentStatus === "major_gap"
                ? `Descending volume is the main limiter. The race includes ${goalDescent > 0 ? Math.round(goalDescent).toLocaleString() : "—"} m of descent, with limited proven experience of equivalent descent loads. Eccentric quad loading over repeated technical descents is a specific risk.`
              : flatStatus === "major_gap"
                ? `Total effort duration is the key gap. The race effort load exceeds anything clearly on record and will require sustained output at a level not yet fully replicated in training or racing.`
                : `No single dominant limiter identified. Focus on maintaining race-specific training quality and arriving at the start line healthy and rested.`;

            // ── Race-day risks ─────────────────────────────────────────────
            const risks: string[] = [];
            if (ascentStatus === "major_gap") risks.push("Repeated steep climbs causing unsustainable effort spikes — no equivalent training stimulus visible in race history.");
            if (descentStatus === "major_gap" || descentStatus === "moderate") risks.push("Steep descending creating quad fatigue and elevated injury risk over the second half of the course.");
            if (terrainStatus === "major_gap") risks.push("Limited trail and fell-specific experience — technical terrain adds time, effort, and navigational risk.");
            if (distStatus === "strong" && (ascentStatus === "major_gap" || terrainStatus === "major_gap")) risks.push("Effort trap — the distance alone may feel manageable, masking the much larger vertical and terrain demands.");
            if (risks.length === 0) {
              risks.push("Maintain race-specific training quality and a disciplined taper approach.");
              risks.push("Race-day nutrition, hydration, and kit management will be the key variables.");
            }

            // ── Next step & feeder race ────────────────────────────────────
            const nextStepText =
              ascentStatus === "major_gap"
                ? "Do not treat this as a distance problem. Preparation should focus on mountain-specific vertical load: long sustained climbs, controlled technical descents, and at least one training block that replicates steep mountain terrain before race day."
              : terrainStatus === "major_gap"
                ? "Prioritise trail and fell-specific training. Seek out technical off-road routes with meaningful ascent and descent. The goal is to build confidence and efficiency on the same kind of terrain the race demands."
              : distStatus !== "strong"
                ? "Build overall endurance base with a focus on time on feet at race-equivalent effort. A progressive long-run block leading into a race-simulation event would be ideal."
                : "Continue building on the existing base. Race-specific preparation — nutrition strategy, kit management, and course familiarity — will be the key variables on the day.";

            const raceDate = result.race.race_date ? new Date(result.race.race_date + "T12:00:00") : null;
            const cutoff   = raceDate ? new Date(raceDate.getTime() - 28 * 86_400_000) : null;
            const feederRace = prepRaces?.suggestions
              .filter(s => s.next_date != null && cutoff != null && new Date(s.next_date + "T12:00:00") <= cutoff)
              .sort((a, b) => b.gap_fill_score - a.gap_fill_score)[0] ?? null;

            // ── Score cards ────────────────────────────────────────────────
            const overallConfidenceLevel: ReadinessLevel =
              majorCount >= 2 ? "major_gap" :
              majorCount === 1 ? "moderate" :
              statusList.includes("moderate") ? "moderate" : "strong";

            const scoreCards: { title: string; level: ReadinessLevel; detail: string }[] = [
              {
                title: "Distance",
                level: distStatus,
                detail: athDist > 0 && goalDist > 0
                  ? `${athDist.toFixed(0)} km max vs ${goalDist.toFixed(0)} km target`
                  : "Insufficient data",
              },
              {
                title: "Ascent",
                level: ascentStatus,
                detail: athAscent > 0 && goalAscent > 0
                  ? `${Math.round(athAscent).toLocaleString()} m max vs ${Math.round(goalAscent).toLocaleString()} m target`
                  : "Insufficient data",
              },
              {
                title: "Descent",
                level: descentStatus,
                detail: descentDemandKm > 0
                  ? `${(Math.round(descentCoveredKm * 10) / 10).toFixed(1)} km covered of ${(Math.round(descentDemandKm * 10) / 10).toFixed(1)} km`
                  : "Insufficient data",
              },
              {
                title: "Terrain specificity",
                level: terrainStatus,
                detail: trailDemandKm > 0
                  ? `${(Math.round(trailCoveredKm * 10) / 10).toFixed(1)} km trail/fell vs ${(Math.round(trailDemandKm * 10) / 10).toFixed(1)} km demanded`
                  : "No off-road demand detected",
              },
              {
                title: "Time-on-feet load",
                level: flatStatus,
                detail: athFlatEq > 0 && goalFlatEq > 0
                  ? `${athFlatEq.toFixed(1)} km effort-equiv vs ${goalFlatEq.toFixed(1)} km goal`
                  : "Insufficient data",
              },
              {
                title: "Overall confidence",
                level: overallConfidenceLevel,
                detail: summaryGapRows.length > 0
                  ? `${metCount} of ${summaryGapRows.length} demand types fully met`
                  : "No course profile data",
              },
            ];

            // ── Card style helpers ─────────────────────────────────────────
            const panelCard = (accent: string, bg: string): React.CSSProperties => ({
              background: bg, border: `1px solid ${accent}40`,
              borderLeft: `4px solid ${accent}`, borderRadius: "6px", padding: "12px 14px",
            });
            const panelHead2: React.CSSProperties = {
              fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: "5px",
            };

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Executive Readiness Verdict</h2>
                <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#888" }}>
                  Overall verdict, main strength, primary risk, and what this report does and does not assess
                </p>

                {/* ── Race Ready definition ────────────────────────────────── */}
                <div style={{
                  background: "#f5f5f5", border: "1px solid #e0e0e0",
                  borderLeft: "4px solid #546e7a", borderRadius: "6px",
                  padding: "10px 14px", marginBottom: "12px",
                }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#546e7a", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>
                    What &ldquo;race ready&rdquo; means in this report
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#444", lineHeight: 1.55 }}>
                    Race ready means you have the physical foundation to complete this race safely and without being overwhelmed by its specific demands.
                    {" "}It does not mean you will win, hit a target time, or that preparation is complete.
                    {" "}It means the gap between what this race requires and what you have demonstrated in prior racing is manageable with appropriate preparation.
                    {" "}Where gaps exist, this report identifies them specifically.
                  </div>
                </div>

                {/* ── Overall verdict ─────────────────────────────────────── */}
                <div style={{
                  background: `${verdictColor}0c`, border: `1px solid ${verdictColor}35`,
                  borderLeft: `6px solid ${verdictColor}`, borderRadius: "6px",
                  padding: "12px 16px", marginBottom: "12px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: verdictColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>Overall Verdict</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: verdictColor }}>{overallLabel}</div>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "#333", lineHeight: 1.5 }}>{verdictText}</div>
                </div>

                {/* ── Strength + Limiter ──────────────────────────────────── */}
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Strengths & Limiters</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <div style={panelCard("#2e7d32", "#f9fffe")}>
                    <div style={{ ...panelHead2, color: "#2e7d32" }}>Biggest Strength</div>
                    <div style={{ fontSize: "11px", color: "#333", lineHeight: 1.5 }}>{strengthText}</div>
                  </div>
                  <div style={panelCard(verdictColor, "#fffaf9")}>
                    <div style={{ ...panelHead2, color: verdictColor }}>Biggest Limiter</div>
                    <div style={{ fontSize: "11px", color: "#333", lineHeight: 1.5 }}>{limiterText}</div>
                  </div>
                </div>

                {/* ── Race-day risks ──────────────────────────────────────── */}
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Race-Day Risk Factors</p>
                <div style={{ ...panelCard("#e65100", "#fffaf5"), marginBottom: "10px" }}>
                  <div style={{ ...panelHead2, color: "#e65100" }}>Main Race-Day Risks</div>
                  <ul style={{ margin: 0, paddingLeft: "16px" }}>
                    {risks.map((r, i) => (
                      <li key={i} style={{ fontSize: "10.5px", color: "#444", lineHeight: 1.45, marginBottom: i < risks.length - 1 ? "4px" : 0 }}>{r}</li>
                    ))}
                  </ul>
                </div>

                {/* ── Recommended next step ───────────────────────────────── */}
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Recommended Preparation</p>
                <div style={{ ...panelCard("#1565c0", "#f0f4ff"), marginBottom: "8px" }}>
                  <div style={{ ...panelHead2, color: "#1565c0" }}>Recommended Next Step</div>
                  <div style={{ fontSize: "11px", color: "#333", lineHeight: 1.5 }}>{nextStepText}</div>
                  {feederRace ? (
                    <div style={{ marginTop: "6px", fontSize: "10.5px", color: "#1565c0", fontWeight: 600 }}>
                      Suitable preparation race: {feederRace.race_name}
                      {feederRace.next_date ? ` — ${new Date(feederRace.next_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
                      {feederRace.gap_fill_score > 0 ? ` (${Math.round(feederRace.gap_fill_score)}% demand coverage)` : ""}
                    </div>
                  ) : raceDate ? (
                    <div style={{ marginTop: "5px", fontSize: "10px", color: "#888" }}>No suitable preparation race identified before race day — use race-specific training blocks instead.</div>
                  ) : null}
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div style={{ paddingTop: "8px", borderTop: "1px solid #eee" }}>
                  <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: 1.5 }}>
                    Readiness assessment is based on available race-history data, course profile, terrain classification, historical weather, and modelled race demands.
                    It is not a guarantee of performance or safety.
                  </p>
                </div>

                <PageNumber n={1} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 2 — Readiness Narrative
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const p = reportAthlete.profile;
            const athleteName = p.athlete_key ?? "This athlete";
            const allRaces    = filteredAthleteRaces;
            const finished    = allRaces.filter(r => r.result_status === "FINISHED" && r.finish_seconds);
            const byDist      = [...finished].filter(r => r.total_distance_km).sort((a, b) => (b.total_distance_km ?? 0) - (a.total_distance_km ?? 0));
            const byAscent    = [...finished].filter(r => r.total_ascent_m).sort((a, b) => (b.total_ascent_m ?? 0) - (a.total_ascent_m ?? 0));
            const lastYear    = p.last_result_year ?? new Date().getFullYear();
            const recentRaces = allRaces.filter(r => r.result_year >= lastYear - 1).slice(0, 10);

            let gapNone = 0, gapSurface = 0, gapPartial = 0, gapMet = 0, gapTotal = 0;
            if (result.terrain_sections.length > 0) {
              const targetMap: Record<string, number> = {};
              for (const sec of result.terrain_sections) {
                const key = `${sec.section_type}|${sec.terrain}`;
                targetMap[key] = (targetMap[key] ?? 0) + sec.distance_km;
              }
              const athleteExact: Record<string, number> = {};
              const athleteCross: Record<string, number> = {};
              for (const tp of reportAthlete.terrain_pairings ?? []) {
                athleteExact[`${tp.section_type}|${tp.terrain}`] = tp.total_km;
                athleteCross[tp.section_type] = (athleteCross[tp.section_type] ?? 0) + tp.total_km;
              }
              for (const [key, km] of Object.entries(targetMap)) {
                if (km < 0.1) continue;
                gapTotal++;
                const [stype, terrain] = key.split("|");
                const exact = athleteExact[key] ?? 0;
                const cross = (athleteCross[stype] ?? 0) - exact;
                if      (exact >= km)  gapMet++;
                else if (exact > 0)    gapPartial++;
                else if (cross > 0)    gapSurface++;
                else                   gapNone++;
              }
            }

            const longestDist   = byDist[0]?.total_distance_km ?? 0;
            const highestAscent = byAscent[0]?.total_ascent_m ?? 0;
            const hasProfile    = secs.length > 0;
            const raceName      = result.race.name;

            const readinessScore = (() => {
              let s = 0;
              if (longestDist >= totalKm * 0.8) s += 2;
              else if (longestDist >= totalKm * 0.5) s += 1;
              if (highestAscent >= totalAscentM * 0.7 && totalAscentM > 0) s += 2;
              else if (highestAscent >= totalAscentM * 0.4 && totalAscentM > 0) s += 1;
              if (recentRaces.length >= 3) s += 1;
              if ((p.race_count ?? 0) >= 15) s += 1;
              if (gapNone === 0 && gapTotal > 0) s += 2;
              else if (gapNone <= 1) s += 1;
              return s;
            })();

            const verdictLabel = readinessScore >= 7
              ? "Well-Prepared"
              : readinessScore >= 4
              ? "Partially Prepared — Targeted Gaps"
              : "Significant Preparation Required";
            const verdictColor = readinessScore >= 7 ? "#2e7d32" : readinessScore >= 4 ? "#e65100" : "#c0392b";
            const verdictBg    = readinessScore >= 7 ? "#e8f5e9" : readinessScore >= 4 ? "#fff3e0" : "#fce4ec";

            const para1 = (() => {
              const parts: string[] = [];
              parts.push(`${athleteName} has ${p.race_count ?? 0} races on record across ${p.career_span_years ?? "?"} year${(p.career_span_years ?? 0) !== 1 ? "s" : ""} of competition.`);
              if (longestDist > 0) parts.push(`The longest race on record is ${longestDist.toFixed(0)} km${highestAscent > 0 ? ` with a career-best single-race ascent of ${Math.round(highestAscent).toLocaleString()} m` : ""}.`);
              if (recentRaces.length > 0) parts.push(`There are ${recentRaces.length} race${recentRaces.length !== 1 ? "s" : ""} on record from the last two years, indicating ${recentRaces.length >= 3 ? "active" : "limited"} recent competitive form.`);
              else parts.push(`There are no races on record in the last two years — current fitness and form cannot be assessed from historical data alone.`);
              return parts.join(" ");
            })();

            const para2 = (() => {
              if (!hasProfile) return null;
              const parts: string[] = [];
              parts.push(`${raceName} is a ${totalKm.toFixed(0)} km course${totalAscentM > 0 ? ` with ${Math.round(totalAscentM).toLocaleString()} m of ascent and ${Math.round(totalDescentM).toLocaleString()} m of descent` : ""}.`);
              if (effortRatio > 0) parts.push(`The average effort multiplier across the course is ${effortRatio.toFixed(2)}× — every kilometre costs roughly ${effortRatio.toFixed(2)} times the energy of flat running.`);
              if (runnablePct < 30) parts.push(`With only ${runnablePct}% of the course near-flat, this is not a race where pace targets are meaningful — sustained effort management is required throughout.`);
              else if (runnablePct >= 50) parts.push(`${runnablePct}% of the course is near-flat, giving the athlete extended opportunities for efficient, rhythmical running.`);
              return parts.join(" ");
            })();

            const para3 = (() => {
              const parts: string[] = [];
              const distGap = totalKm > 0 && longestDist < totalKm * 0.55;
              const ascentGap = totalAscentM > 500 && highestAscent < totalAscentM * 0.4;
              if (distGap && ascentGap) {
                parts.push(`The two most significant readiness gaps are distance and vertical. The goal race (${totalKm.toFixed(0)} km, ${Math.round(totalAscentM).toLocaleString()} m) substantially exceeds the athlete's recorded maximum in both dimensions.`);
                parts.push(`This does not mean it is unachievable — but it means the event will introduce new physiological territory, and conservative pacing and careful preparation are particularly important.`);
              } else if (distGap) {
                parts.push(`Distance is the primary readiness gap: the goal race (${totalKm.toFixed(0)} km) is well beyond the longest race on record (${longestDist.toFixed(0)} km).`);
                parts.push(`Specific long-run preparation and time-on-feet are the most important training priorities.`);
              } else if (ascentGap) {
                parts.push(`Vertical experience is the primary gap: the goal race requires ${Math.round(totalAscentM).toLocaleString()} m of ascent, where the career best is ${Math.round(highestAscent).toLocaleString()} m.`);
                parts.push(`Dedicated hill and mountain training — both climbing strength and downhill durability — is the most important preparation focus.`);
              } else if (longestDist >= totalKm * 0.8 && highestAscent >= totalAscentM * 0.7) {
                parts.push(`From a distance and vertical perspective, ${athleteName} has demonstrated the capacity for what this race demands.`);
                parts.push(`The primary readiness question shifts to terrain familiarity and race-specific preparation — not whether the distance and ascent are achievable.`);
              } else {
                parts.push(`The athlete has partial preparation for the race demands. Distance experience covers ${longestDist > 0 ? `${Math.round((longestDist / totalKm) * 100)}% of the goal distance` : "an unknown proportion"} and vertical experience covers ${highestAscent > 0 && totalAscentM > 0 ? `${Math.round((highestAscent / totalAscentM) * 100)}% of the goal ascent` : "an unknown proportion"}.`);
              }
              return parts.join(" ");
            })();

            const para4 = (() => {
              if (gapTotal === 0) return null;
              const parts: string[] = [];
              if (gapNone === 0 && gapSurface === 0) {
                parts.push(`The terrain experience gap analysis shows no entirely untested terrain demand types — every gradient and surface combination required by the race has appeared in the athlete's history in some form.`);
                if (gapPartial > 0) parts.push(`${gapPartial} demand type${gapPartial !== 1 ? "s" : ""} are partially covered — the athlete has experience here, but not at the full volume the race requires.`);
              } else {
                if (gapNone > 0) parts.push(`The experience gap analysis identifies ${gapNone} terrain demand type${gapNone !== 1 ? "s" : ""} with no precedent in the athlete's race history — these are entirely new combinations of gradient and surface.`);
                if (gapSurface > 0) parts.push(`${gapSurface} additional demand type${gapSurface !== 1 ? "s" : ""} show surface gaps — the gradient is familiar, but not on this specific terrain.`);
                if (gapMet > 0) parts.push(`${gapMet} of ${gapTotal} demand types are fully covered, showing relevant preparation exists for a meaningful proportion of the course.`);
              }
              return parts.join(" ");
            })();

            const para5 = (() => {
              const parts: string[] = [];
              if (readinessScore >= 7) {
                parts.push(`Taken together, the evidence across this report suggests ${athleteName} is well-placed for ${raceName}.`);
                parts.push(`The experience base is relevant, the terrain demands are largely familiar, and the distance and vertical are within established range.`);
                parts.push(`The focus going into the event should be on execution quality, course-specific pacing, and arriving at the start line healthy.`);
              } else if (readinessScore >= 4) {
                parts.push(`${athleteName} has a meaningful foundation for ${raceName}, but specific gaps remain.`);
                parts.push(`These gaps are preparation opportunities rather than barriers — but they require targeted action before race day.`);
                parts.push(`The most impactful preparation will address the specific terrain and distance gaps identified in this report, rather than general fitness work.`);
              } else {
                parts.push(`This report identifies significant preparation gaps for ${raceName}.`);
                parts.push(`The race presents substantial new territory across multiple dimensions — distance, vertical, and terrain.`);
                parts.push(`That does not make the race unachievable, but it does mean that the preparation period carries significant weight. The athlete would benefit from building experience progressively across the key gap areas before the event.`);
              }
              return parts.join(" ");
            })();

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Readiness Narrative</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Readiness Narrative</h2>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                  A synthesised assessment drawing on all sections of this report
                </p>

                <div style={{ background: verdictBg, border: `2px solid ${verdictColor}`, borderRadius: "8px", padding: "12px 16px", marginBottom: "20px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: verdictColor, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>Overall Readiness Assessment</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: verdictColor }}>{verdictLabel}</div>
                  <div style={{ fontSize: "10px", color: "#555", marginTop: "4px" }}>{raceName} · {athleteName}</div>
                </div>

                <div style={{ marginBottom: "18px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Findings by Section</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {[
                      {
                        title: "Race Character",
                        positive: hasProfile && runnablePct >= 35 ? `${runnablePct}% runnable — rhythm is achievable.` : null,
                        concern: hasProfile && runnablePct < 25 ? `Only ${runnablePct}% runnable — no consistent pace target is possible.` : hasProfile && (steepClimbPct + steepDescentPct) > 30 ? `${steepClimbPct + steepDescentPct}% steep gradient — strength is a requirement.` : null,
                      },
                      {
                        title: "Race Demands",
                        positive: hasProfile && finalThirdEffort <= effortRatio * 1.08 ? `Final third effort is close to the course average.` : null,
                        concern: hasProfile && totalAscentM >= 2000 ? `${Math.round(totalAscentM).toLocaleString()} m ascent — high-volume climbing demand.` : hasProfile && finalThirdEffort > effortRatio * 1.15 ? `Final third is ${((finalThirdEffort / effortRatio - 1) * 100).toFixed(0)}% harder than course average.` : null,
                      },
                      {
                        title: "Athlete Experience",
                        positive: longestDist >= totalKm * 0.8 && totalKm > 0 ? `Distance-comparable experience on record.` : recentRaces.length >= 3 ? `Active recent form (${recentRaces.length} races in 2 years).` : null,
                        concern: longestDist < totalKm * 0.55 && totalKm > 0 ? `Goal race is new territory by distance.` : recentRaces.length === 0 ? `No recent race form on record.` : null,
                      },
                      {
                        title: "Experience Gaps",
                        positive: gapTotal > 0 && gapNone === 0 ? `No entirely untested terrain demands.` : gapMet > gapTotal * 0.6 && gapTotal > 0 ? `${gapMet}/${gapTotal} demand types covered.` : null,
                        concern: gapNone > 0 ? `${gapNone} demand type${gapNone !== 1 ? "s" : ""} with zero experience.` : gapSurface > 0 ? `${gapSurface} surface gap${gapSurface !== 1 ? "s" : ""} — terrain adaptation untested.` : null,
                      },
                    ].map(({ title, positive, concern }) => (
                      <div key={title} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 12px", background: "#fafafa" }}>
                        <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{title}</div>
                        {positive && <div style={{ fontSize: "9px", color: "#2e7d32", marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #c8e6c9", lineHeight: 1.4 }}>✓ {positive}</div>}
                        {concern  && <div style={{ fontSize: "9px", color: "#c0392b", marginBottom: "0",  paddingLeft: "7px", borderLeft: "2px solid #ffcdd2", lineHeight: 1.4 }}>⚠ {concern}</div>}
                        {!positive && !concern && <div style={{ fontSize: "9px", color: "#aaa" }}>Insufficient data.</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>Full Assessment</div>
                <div style={{ fontSize: "10.5px", color: "#333", lineHeight: 1.6 }}>
                  <p style={{ margin: "0 0 10px" }}>{para1}</p>
                  {para2 && <p style={{ margin: "0 0 10px" }}>{para2}</p>}
                  {para3 && <p style={{ margin: "0 0 10px" }}>{para3}</p>}
                  {para4 && <p style={{ margin: "0 0 10px" }}>{para4}</p>}
                  <p style={{ margin: 0 }}>{para5}</p>
                </div>

                <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid #eee" }}>
                  <p style={{ fontSize: "8.5px", color: "#bbb", margin: 0, lineHeight: 1.5 }}>
                    This narrative is generated algorithmically from race profile data, athlete history, and terrain gap analysis.
                    It reflects the data available at the time of report generation and should be read alongside the detailed sections above.
                    Readiness assessments do not substitute for coach judgement.
                  </p>
                </div>

                <PageNumber n={2} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 3 — Readiness Scorecard
          ═══════════════════════════════════════ */}
          {result && reportAthlete && expContext && (() => {
            type ReadinessLevel = "strong" | "moderate" | "major_gap" | "unknown";

            const sc3        = expContext.scale;
            const goalDist3  = result.race.total_distance_km;
            const goalAscent3= result.race.total_ascent_m;
            const goalDescent3 = result.race.total_descent_m;

            const athDist3   = sc3?.athlete_max_dist?.km ?? 0;
            const athAscent3 = sc3?.athlete_max_ascent?.m ?? reportAthlete.profile.max_ascent_m ?? 0;
            const athFlatEq3 = sc3?.athlete_max_flat_equiv?.km ?? reportAthlete.profile.max_flat_equiv_km ?? 0;
            const goalFlatEq3= sc3?.goal_flat_equiv_km ?? 0;

            const lc3 = (l: ReadinessLevel) =>
              l === "strong" ? "#2e7d32" : l === "moderate" ? "#f57c00" : l === "major_gap" ? "#c0392b" : "#9e9e9e";
            const ll3 = (l: ReadinessLevel) =>
              l === "strong" ? "Strong" : l === "moderate" ? "Moderate" : l === "major_gap" ? "Major gap" : "Unknown";

            const distStatus3: ReadinessLevel =
              athDist3 === 0 || goalDist3 === 0 ? "unknown" :
              athDist3 >= goalDist3         ? "strong" :
              athDist3 >= goalDist3 * 0.7   ? "moderate" : "major_gap";

            const ascentStatus3: ReadinessLevel =
              athAscent3 === 0 || goalAscent3 === 0 ? "unknown" :
              athAscent3 >= goalAscent3 * 0.8 ? "strong" :
              athAscent3 >= goalAscent3 * 0.5 ? "moderate" : "major_gap";

            const tpm3: Record<string, { section_type: string; terrain: string; km: number }> = {};
            for (const sec of result.terrain_sections) {
              const key = `${sec.section_type}|${sec.terrain}`;
              if (!tpm3[key]) tpm3[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0 };
              tpm3[key].km += sec.distance_km;
            }
            const aem3: Record<string, number> = {};
            for (const tp of reportAthlete.terrain_pairings ?? []) {
              aem3[`${tp.section_type}|${tp.terrain}`] = tp.total_km;
            }
            const gapRows3 = Object.values(tpm3)
              .filter(tp => tp.km >= 0.1)
              .map(tp => {
                const exactKm = aem3[`${tp.section_type}|${tp.terrain}`] ?? 0;
                const pct = tp.km > 0 ? Math.min(100, Math.round((exactKm / tp.km) * 100)) : 100;
                return { section_type: tp.section_type, terrain: tp.terrain, km: tp.km, exactKm, pct,
                  status: exactKm === 0 ? "none" as const : pct >= 100 ? "met" as const : "partial" as const };
              });

            const descentRows3     = gapRows3.filter(r => r.section_type.includes("descent"));
            const descentDemand3   = descentRows3.reduce((s, r) => s + r.km, 0);
            const descentCovered3  = descentRows3.reduce((s, r) => s + r.exactKm, 0);
            const descentStatus3: ReadinessLevel =
              descentDemand3 === 0 ? "unknown" :
              descentCovered3 / descentDemand3 >= 0.8 ? "strong" :
              descentCovered3 / descentDemand3 >= 0.5 ? "moderate" : "major_gap";

            const trailRows3      = gapRows3.filter(r => ["trail","technical_trail","fell"].includes(r.terrain));
            const trailDemand3    = trailRows3.reduce((s, r) => s + r.km, 0);
            const trailCovered3   = trailRows3.reduce((s, r) => s + r.exactKm, 0);
            const terrainStatus3: ReadinessLevel =
              trailDemand3 === 0 ? "unknown" :
              trailCovered3 / trailDemand3 >= 0.8 ? "strong" :
              trailCovered3 / trailDemand3 >= 0.5 ? "moderate" : "major_gap";

            const techRows3      = gapRows3.filter(r => r.terrain === "technical_trail");
            const techDemand3    = techRows3.reduce((s, r) => s + r.km, 0);
            const techCovered3   = techRows3.reduce((s, r) => s + r.exactKm, 0);
            const technicalStatus3: ReadinessLevel =
              techDemand3 === 0 ? "unknown" :
              techCovered3 / techDemand3 >= 0.7 ? "strong" :
              techCovered3 / techDemand3 >= 0.4 ? "moderate" : "major_gap";

            const aidStns3    = result.aid_stations ?? [];
            const aidSorted3  = [...aidStns3].sort((a, b) => a.km - b.km);
            const aidStops3   = [0, ...aidSorted3.map(s => s.km), goalDist3];
            const aidGaps3    = aidStops3.slice(1).map((km, i) => km - aidStops3[i]);
            const aidMaxGap3  = aidGaps3.length > 1 ? Math.max(...aidGaps3) : 0;
            const aidStatus3: ReadinessLevel =
              aidStns3.length === 0 ? "unknown" :
              aidMaxGap3 <= 15 ? "strong" :
              aidMaxGap3 <= 25 ? "moderate" : "major_gap";

            const metCount3   = gapRows3.filter(r => r.status === "met").length;
            const statusList3 = [distStatus3, ascentStatus3, descentStatus3, terrainStatus3]
              .filter((s): s is "strong" | "moderate" | "major_gap" => s !== "unknown");
            const majorCount3 = statusList3.filter(s => s === "major_gap").length;
            const overallLevel3: ReadinessLevel =
              majorCount3 >= 2 ? "major_gap" :
              majorCount3 === 1 ? "moderate" :
              statusList3.includes("moderate") ? "moderate" : "strong";

            const scoreCards3: { title: string; level: ReadinessLevel; detail: string }[] = [
              {
                title: "Distance",
                level: distStatus3,
                detail: athDist3 > 0 && goalDist3 > 0
                  ? `${athDist3.toFixed(0)} km max vs ${goalDist3.toFixed(0)} km target`
                  : "Insufficient data",
              },
              {
                title: "Ascent",
                level: ascentStatus3,
                detail: athAscent3 > 0 && goalAscent3 > 0
                  ? `${Math.round(athAscent3).toLocaleString()} m max vs ${Math.round(goalAscent3).toLocaleString()} m target`
                  : "Insufficient data",
              },
              {
                title: "Descent",
                level: descentStatus3,
                detail: descentDemand3 > 0
                  ? `${(Math.round(descentCovered3 * 10) / 10).toFixed(1)} km covered of ${(Math.round(descentDemand3 * 10) / 10).toFixed(1)} km`
                  : "Insufficient data",
              },
              {
                title: "Terrain specificity",
                level: terrainStatus3,
                detail: trailDemand3 > 0
                  ? `${(Math.round(trailCovered3 * 10) / 10).toFixed(1)} km trail/fell vs ${(Math.round(trailDemand3 * 10) / 10).toFixed(1)} km demanded`
                  : "No off-road demand detected",
              },
              {
                title: "Technical terrain",
                level: technicalStatus3,
                detail: techDemand3 > 0
                  ? `${(Math.round(techCovered3 * 10) / 10).toFixed(1)} km technical trail vs ${(Math.round(techDemand3 * 10) / 10).toFixed(1)} km demanded`
                  : "No technical trail on course",
              },
              {
                title: "Aid logistics",
                level: aidStatus3,
                detail: aidStns3.length > 0
                  ? `${aidSorted3.length} station${aidSorted3.length !== 1 ? "s" : ""} · longest gap ${aidMaxGap3.toFixed(1)} km`
                  : "No aid station data",
              },
              {
                title: "Overall confidence",
                level: overallLevel3,
                detail: gapRows3.length > 0
                  ? `${metCount3} of ${gapRows3.length} demand types fully met`
                  : "No course profile data",
              },
            ];

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Readiness Scorecard</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Readiness Scorecard</h2>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                  How {reportAthlete.profile.athlete_key.split(" ")[0]} measures up against {result.race.name} across every key dimension
                </p>

                <div style={{ border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden", marginBottom: "20px" }}>
                  {scoreCards3.map((card, i) => (
                    <div key={card.title} style={{
                      display: "flex", alignItems: "center", gap: "14px",
                      padding: "12px 16px",
                      borderTop: i > 0 ? "1px solid #f0f0f0" : "none",
                      background: "#fff",
                    }}>
                      <div style={{ width: "4px", alignSelf: "stretch", background: lc3(card.level), borderRadius: "2px", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#333" }}>{card.title}</div>
                        <div style={{ fontSize: "10px", color: "#999", marginTop: "2px" }}>{card.detail}</div>
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: lc3(card.level), flexShrink: 0 }}>
                        {ll3(card.level)}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ paddingTop: "8px", borderTop: "1px solid #eee" }}>
                  <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: 1.5 }}>
                    Strong = demands met at ≥80% of target level. Moderate = partial but meaningful preparation. Major gap = significant shortfall requiring targeted preparation. Aid logistics is rated on maximum unsupported gap length.
                  </p>
                </div>

                <PageNumber n={3} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 4 — Race Overview
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

            {result.route.length > 1 && (
              <div style={{ marginBottom: "18px" }}>
                <p style={sectionLabel}>Course Map{windData.length > 0 && " — arrows show wind direction · colour shows headwind risk"}</p>
                <RouteMap route={result.route} windSections={windData.length ? windData : undefined} height={560} />
              </div>
            )}

            {surfaceSummary.total > 0 && (() => {
              const SURFACE_COLOR: Record<string, string> = {
                road: "#90a4ae", pavement: "#90a4ae", track: "#78909c",
                gravel: "#a1887f", trail: "#66bb6a", technical_trail: "#388e3c",
                fell: "#8d6e63", mud: "#6d4c41", sand: "#ffa726", snow: "#80d8ff",
              };
              const SURFACE_LABEL: Record<string, string> = {
                road: "Road", pavement: "Pavement", track: "Track",
                gravel: "Gravel", trail: "Trail", technical_trail: "Technical Trail",
                fell: "Fell", mud: "Mud", sand: "Sand", snow: "Snow",
              };
              return (
                <div style={{ marginBottom: "18px" }}>
                  <p style={sectionLabel}>Terrain Composition</p>
                  {surfaceSummary.entries.map(([surface, km]) => (
                    <TerrainBar
                      key={surface}
                      label={SURFACE_LABEL[surface] ?? surface.charAt(0).toUpperCase() + surface.slice(1).replace(/_/g, " ")}
                      km={km}
                      pct={surfaceSummary.total > 0 ? (km / surfaceSummary.total) * 100 : 0}
                      color={SURFACE_COLOR[surface] ?? "#90a4ae"}
                    />
                  ))}
                </div>
              );
            })()}


            <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #eee" }}>
              <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: "1.5" }}>
                Course data derived from GPX file. Elevation data from ERA5 reanalysis. Race results from official published results.
              </p>
            </div></>}
            <PageNumber n={4} />
          </div>

          {/* ═══════════════════════════════════════
              PAGE 5 — Elevation
          ═══════════════════════════════════════ */}
          {(elevProfile || terrainSummary.total > 0) && (
            <div style={a4Page}>
              <div style={printHeader}>
                <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Elevation</div>
                </div>
              </div>

              <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Elevation</h2>
              <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
                {(() => {
                  const goalDist = result.race.total_distance_km;
                  const goalAscent = result.race.total_ascent_m;
                  const goalPerKm = goalDist > 0 && goalAscent > 0 ? goalAscent / goalDist : 0;

                  const base = `The elevation profile, composition, and climbing load show how ascent is distributed across ${result.race.name} — when the hard work arrives and how the course is weighted.`;

                  if (goalPerKm === 0) return base;

                  const comparables = filteredAthleteRaces
                    .filter(r => r.total_distance_km && r.total_ascent_m && r.result_status === "FINISHED" &&
                      r.total_distance_km >= goalDist * 0.6 && r.total_distance_km <= goalDist * 1.4)
                    .map(r => ({ name: r.race_name, year: r.result_year, distKm: r.total_distance_km!, perKm: r.total_ascent_m! / r.total_distance_km! }))
                    .sort((a, b) => Math.abs(a.distKm - goalDist) - Math.abs(b.distKm - goalDist))
                    .slice(0, 2);

                  const goalPerKmRounded = Math.round(goalPerKm);

                  if (comparables.length === 0) {
                    return `${base} The course averages ${goalPerKmRounded} m of ascent per km — a distance-neutral measure that allows comparison across races of different lengths.`;
                  }

                  const c1 = comparables[0];
                  const c1PerKm = Math.round(c1.perKm);
                  // Use rounded values so the displayed numbers and the percentage are consistent
                  const pct1 = c1PerKm > 0 ? Math.round(((goalPerKmRounded - c1PerKm) / c1PerKm) * 100) : 0;

                  let compText = "";
                  if (Math.abs(pct1) < 5) {
                    compText = `${c1.name} (${c1.year}, ${c1.distKm.toFixed(0)} km) averaged a similar ${c1PerKm} m/km.`;
                  } else if (pct1 > 0) {
                    compText = `${c1.name} (${c1.year}, ${c1.distKm.toFixed(0)} km) averaged ${c1PerKm} m/km — the goal race has ${pct1}% more climbing per km.`;
                  } else {
                    compText = `${c1.name} (${c1.year}, ${c1.distKm.toFixed(0)} km) averaged ${c1PerKm} m/km — the goal race has ${Math.abs(pct1)}% less climbing per km.`;
                  }

                  if (comparables.length > 1 && comparables[1].name !== c1.name) {
                    const c2 = comparables[1];
                    const c2PerKm = Math.round(c2.perKm);
                    const pct2 = c2PerKm > 0 ? Math.round(((goalPerKmRounded - c2PerKm) / c2PerKm) * 100) : 0;
                    if (Math.abs(pct2) < 5) {
                      compText += ` ${c2.name} (${c2.year}, ${c2.distKm.toFixed(0)} km) also averaged a similar ${c2PerKm} m/km.`;
                    } else {
                      compText += ` ${c2.name} (${c2.year}, ${c2.distKm.toFixed(0)} km) averaged ${c2PerKm} m/km — ${pct2 > 0 ? `${pct2}% more` : `${Math.abs(pct2)}% less`} climbing per km than the goal race.`;
                    }
                  }

                  return `${base} The course averages ${goalPerKmRounded} m of ascent per km. ${compText}`;
                })()}
              </p>

              {/* ── Elevation profile chart ── */}
              {elevProfile && (
                <div style={{ marginBottom: "18px" }}>
                  <p style={sectionLabel}>Course Elevation Profile</p>
                  <ElevationChart profile={elevProfile} notable={notable} aidStations={result.aid_stations ?? []} />
                </div>
              )}

              {/* ── Elevation composition + key segments ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "18px" }}>
                <div>
                  <p style={sectionLabel}>Elevation Composition</p>
                  <TerrainBar label="Climbing"       km={terrainSummary.climbing}   pct={terrainSummary.total > 0 ? (terrainSummary.climbing   / terrainSummary.total) * 100 : 0} color="#c0392b" />
                  <TerrainBar label="Descending"     km={terrainSummary.descending} pct={terrainSummary.total > 0 ? (terrainSummary.descending / terrainSummary.total) * 100 : 0} color="#1565c0" />
                  <TerrainBar label="Flat / Rolling" km={terrainSummary.flat}       pct={terrainSummary.total > 0 ? (terrainSummary.flat       / terrainSummary.total) * 100 : 0} color="#546e7a" />
                  {halfwayAscentPct !== null && (
                    <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#444", lineHeight: 1.55 }}>
                      {halfwayAscentPct > 55
                        ? `Front-loaded — ${halfwayAscentPct}% of total ascent arrives in the first half. Managing effort on the early climbs is key to protecting the second half.`
                        : halfwayAscentPct < 45
                        ? `Back-loaded — only ${halfwayAscentPct}% of ascent arrives in the first half, leaving ${100 - halfwayAscentPct}% for when fatigue is highest. Conserving reserves early is critical.`
                        : `Evenly loaded — ${halfwayAscentPct}% of ascent in the first half and ${100 - halfwayAscentPct}% in the second. Climbing demand is consistent throughout; no single section dominates.`}
                    </p>
                  )}
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

              {/* ── Climbing load over course ── */}
              {elevProfile && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "8px" }}>
                    Climbing Load Over Course
                    {halfwayAscentPct !== null ? ` — ${halfwayAscentPct}% of total ascent completed at halfway` : ""}
                  </p>
                  <CumulativeAscentChart
                    profile={elevProfile}
                    comparison={
                      elevProfileMatch?.best_match && elevProfileMatch.match_curve
                        ? {
                            curve: elevProfileMatch.match_curve,
                            totalAscentM: elevProfileMatch.best_match.total_ascent_m,
                            label: `${elevProfileMatch.best_match.race_name} (${elevProfileMatch.best_match.year})`,
                          }
                        : null
                    }
                  />
                  <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#aaa", lineHeight: 1.4 }}>
                    Dashed markers show what proportion of total climbing has accumulated at each quarter of distance.
                    {elevProfileMatch?.best_match ? " Red = goal race · Blue dashed = closest matched past race." : " Late-loading courses are especially demanding because hard climbs arrive when the athlete is already fatigued."}
                  </p>
                </div>
              )}

              {/* ── Elevation profile reference (athlete comparison) ── */}
              {elevProfileMatch && (() => {
                const em = elevProfileMatch;
                const loadDesc: Record<LoadingLabel, string> = {
                  front: "front-loaded — most climbing in the first half",
                  back:  "back-loaded — most climbing in the second half",
                  even:  "evenly loaded — climbing spread across both halves",
                };
                const goalDesc = em.goal_loading_label ? loadDesc[em.goal_loading_label] : null;
                const m = em.best_match;

                let headline = "";
                let body = "";
                let accentColor = "#1e3a1e";
                let borderColor = "#1e3a1e";

                if (m) {
                  const raceRef = `${m.race_name} (${m.year})`;
                  const partialPrefix = m.partial_desc
                    ? `The climbing in ${m.partial_desc} of this race resembles`
                    : "The elevation profile of this course resembles";
                  const sameLoading = em.goal_loading_label === m.loading_label;

                  if (m.similarity_pct >= 75) {
                    accentColor = "#2e7d32"; borderColor = "#2e7d32";
                    headline = `Profile match — ${raceRef}`;
                    body = sameLoading
                      ? `${partialPrefix} ${raceRef}, which you completed${m.partial_desc ? "" : ` (${m.race_km.toFixed(0)} km)`}. Both are ${loadDesc[m.loading_label]}. Your experience on that race translates directly here — the climbing arrives in the same pattern.`
                      : `${partialPrefix} ${raceRef}. The overall distribution of climbing is similar, giving you a useful reference for how this course will feel.`;
                  } else {
                    accentColor = "#e65100"; borderColor = "#e65100";
                    headline = `Closest profile — ${raceRef}`;
                    body = `${partialPrefix} ${raceRef}${m.partial_desc ? "" : ` (${m.race_km.toFixed(0)} km)`}, though the match is partial. Both are broadly ${loadDesc[m.loading_label]}. Use it as a rough guide rather than a direct comparison.`;
                  }
                } else {
                  accentColor = "#b71c1c"; borderColor = "#b71c1c";
                  headline = "No close profile match in race history";
                  const noMatchBody = em.races_compared === 0
                    ? "No elevation profile data is available for past races to make a comparison."
                    : goalDesc
                    ? `None of the ${em.races_compared} past race${em.races_compared !== 1 ? "s" : ""} with elevation data share a similar loading pattern. This ${goalDesc} is relatively uncharted territory — a potential gap to address specifically in preparation.`
                    : "No closely matching elevation profile was found in this athlete's race history.";
                  body = noMatchBody;
                }

                return (
                  <div style={{
                    background: "#fafafa", border: "1px solid #e0e0e0",
                    borderLeft: `4px solid ${borderColor}`,
                    borderRadius: "6px", padding: "12px 14px", marginBottom: "14px",
                  }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>
                      Elevation Profile Reference
                    </div>
                    <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#1e1e1e", marginBottom: "4px" }}>
                      {headline}
                    </div>
                    <div style={{ fontSize: "10px", color: "#444", lineHeight: 1.55 }}>
                      {body}
                    </div>
                    {m && (() => {
                      const goalAscent = elevProfile?.points
                        ? (() => {
                            let acc = 0;
                            const sorted = [...elevProfile.points].sort((a, b) => a.distanceKm - b.distanceKm);
                            for (let i = 1; i < sorted.length; i++) {
                              const d = sorted[i].elevationM - sorted[i - 1].elevationM;
                              if (d > 0) acc += d;
                            }
                            return acc;
                          })()
                        : null;
                      const lowVolumeNote = goalAscent && goalAscent > 0 && m.total_ascent_m < goalAscent * 0.5
                        ? `Note: this past race has ${Math.round((m.total_ascent_m / goalAscent) * 100)}% of the goal race's climbing — the distribution pattern is similar but the volume is materially less.`
                        : null;
                      return (
                        <>
                          <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
                            {[
                              { label: "Similarity",        value: `${m.similarity_pct}%` },
                              { label: "Past race dist.",   value: `${m.race_km.toFixed(0)} km` },
                              { label: "Past race ascent",  value: `${m.total_ascent_m.toLocaleString()} m` },
                              { label: "Loading",           value: m.loading_label === "front" ? "Front-loaded" : m.loading_label === "back" ? "Back-loaded" : "Even" },
                              { label: "Halfway ascent",    value: `${m.halfway_pct}% by halfway` },
                            ].map(({ label, value }) => (
                              <div key={label} style={{ fontSize: "9.5px" }}>
                                <div style={{ color: "#aaa", marginBottom: "1px" }}>{label}</div>
                                <div style={{ fontWeight: 600, color: "#333" }}>{value}</div>
                              </div>
                            ))}
                          </div>
                          {lowVolumeNote && (
                            <div style={{ marginTop: "6px", fontSize: "9px", color: "#888", fontStyle: "italic" }}>
                              {lowVolumeNote}
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {!m && em.races_compared > 0 && goalDesc && (
                      <div style={{ marginTop: "6px", fontSize: "9px", color: "#888" }}>
                        {em.races_compared} past race{em.races_compared !== 1 ? "s" : ""} compared
                      </div>
                    )}
                  </div>
                );
              })()}

              <PageNumber n={5} />
            </div>
          )}

          {/* ═══════════════════════════════════════
              PAGE 6 — Race Demands Profile
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

              <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Race Demands Profile</h2>
              <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
                Understanding what {result.race.name} demands physically is the foundation for assessing whether you are ready for it.
                The two charts below show the gradient distribution across slope bands and the relative energy cost of each section.
              </p>

              {/* ── Section 1: Gradient distribution ── */}
              <div style={{ marginBottom: "20px" }}>
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Gradient Distribution — kilometres at each slope band</p>
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
                <p style={{ margin: "2px 0 0", fontSize: "9px", color: "#aaa", lineHeight: 1.4 }}>
                  {totalKm > 0 ? (
                    <>
                      {runnablePct}% of the course is near-flat (within ±3%), {steepClimbPct}% is steep uphill (≥8%), and {steepDescentPct}% is steep downhill (≥8%).
                      {" "}This course is {courseCharacter}.
                      {runnablePct < 25 ? " This matters for readiness because the athlete must tolerate repeated shifts in effort: steep climbing, steep descending, and short recovery sections. The race is unlikely to feel rhythmical or steady." : ""}
                    </>
                  ) : "Shows how much of the route falls into each slope band — a quick guide to whether the race is runnable, climb-heavy, descent-heavy, or constantly variable."}
                </p>
              </div>

              {/* ── Section 2: Terrain strip + effort profile ── */}
              <div style={{ marginBottom: "20px" }}>
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Section-by-Section Effort Multiplier — vs. flat running pace</p>
                <EffortProfileChart sections={secs} totalKm={totalKm} />
                <div style={{ marginTop: "4px" }}>
                  <div style={{ fontSize: "9px", color: "#888", lineHeight: 1.4 }}>
                    <strong style={{ color: "#333" }}>Average effort multiplier: {effortRatio.toFixed(2)}×</strong>
                    {" — "}on average, each kilometre costs approximately {effortRatio.toFixed(2)}× the energy of flat running.
                    This is a comparative metric: it helps compare this course against flatter races in an athlete&apos;s history, not a literal prediction of individual difficulty.
                  </div>
                  <div style={{ fontSize: "9px", color: "#aaa", marginTop: "3px", lineHeight: 1.35 }}>
                    Each bar shows that section&apos;s effort cost vs. flat running. 1.0× = same energy. Uphill bars are taller; downhill bars shorter —
                    but <strong style={{ color: "#666" }}>downhills are not free</strong>.
                    {" "}Very gentle descents recover a small amount of energy, but steeper or prolonged downhills demand hard eccentric braking from the quadriceps.
                    {" "}On long mountain courses, athletes often slow the most in the second half not because they run out of aerobic capacity,
                    but because their legs fail from accumulated downhill load.
                  </div>
                </div>
              </div>

              {/* ── Technical terrain analysis ── */}
              {(() => {
                const technicalSecs = secs.filter(s => s.terrain === "trail" || s.terrain === "fell" || s.terrain === "mountain" || s.terrain === "technical_trail");
                const totalTechnicalKm = Math.round(technicalSecs.reduce((sum, s) => sum + s.distance_km, 0) * 10) / 10;
                const technicalPct = totalKm > 0 ? Math.round((totalTechnicalKm / totalKm) * 100) : 0;
                const lateThirdStart = totalKm * (2 / 3);
                const midThirdStart  = totalKm / 3;
                const lateTechnicalKm  = Math.round(technicalSecs.filter(s => s.start_km >= lateThirdStart).reduce((sum, s) => sum + s.distance_km, 0) * 10) / 10;
                const earlyTechnicalKm = Math.round(technicalSecs.filter(s => s.end_km   <= midThirdStart).reduce((sum, s) => sum + s.distance_km, 0) * 10) / 10;

                let technicalSummary = "";
                let technicalAccent = "#546e7a";
                if (totalTechnicalKm === 0) {
                  technicalSummary = "No technical (trail, fell, or mountain) terrain detected on this course. The route runs predominantly on road or gravel.";
                } else if (lateTechnicalKm / totalTechnicalKm > 0.4) {
                  technicalAccent = "#e65100";
                  technicalSummary = `${lateTechnicalKm} km of technical terrain arrives in the final third of the race — when fatigue is highest and foot-placement errors are most likely. `
                    + `Athletes with limited trail or fell experience are at elevated risk of slowing significantly, losing confidence on technical descents, or misjudging footing under fatigue. `
                    + `Specific preparation on this terrain type, especially late in long training runs, is important.`;
                } else if (earlyTechnicalKm / totalTechnicalKm > 0.4) {
                  technicalAccent = "#f57c00";
                  technicalSummary = `Most technical terrain is concentrated in the first third of the race. `
                    + `Managing pace on this ground early is critical — going too hard on technical surface at the start will compound fatigue over the remainder of the course.`;
                } else {
                  technicalSummary = `Technical terrain is distributed across the course rather than concentrated in one section. `
                    + `Consistent movement efficiency on variable ground will be required throughout the race.`;
                }

                if (totalTechnicalKm === 0) {
                  return null;
                }

                return (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "8px" }}>Technical Terrain on Course</p>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                      {[
                        { label: "Technical km", value: `${totalTechnicalKm} km` },
                        { label: "% of course",  value: `${technicalPct}%` },
                        { label: "In final third", value: `${lateTechnicalKm} km` },
                        { label: "In first third", value: `${earlyTechnicalKm} km` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "5px", padding: "6px 12px", fontSize: "10px", background: "#fafafa" }}>
                          <div style={{ color: "#aaa", marginBottom: "2px" }}>{label}</div>
                          <div style={{ fontWeight: 700, color: "#1e3a1e", fontSize: "12px" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{
                      background: "#fafafa", border: "1px solid #e0e0e0",
                      borderLeft: `4px solid ${technicalAccent}`, borderRadius: "6px",
                      padding: "10px 14px",
                    }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: technicalAccent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                        Technical Terrain Assessment
                      </div>
                      <div style={{ fontSize: "10.5px", color: "#333", lineHeight: 1.5 }}>
                        {technicalSummary}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── What this means for you ── */}
              {totalKm > 0 && totalAscentM > 0 && effortRatio > 0 && (
                <div style={{
                  background: "#f8f8f8", border: "1px solid #e0e0e0",
                  borderLeft: "4px solid #1e3a1e", borderRadius: "6px",
                  padding: "12px 14px", marginBottom: "14px",
                }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>
                    What this means for you
                  </div>
                  <div style={{ fontSize: "10.5px", color: "#333", lineHeight: 1.45 }}>
                    {result.race.name} is not just a {totalKm.toFixed(0)} km endurance challenge.
                    {" "}The {Math.round(totalAscentM).toLocaleString()} m of ascent and {Math.round(totalDescentM).toLocaleString()} m of descent make each kilometre
                    significantly more costly than flat running — averaging {effortRatio.toFixed(2)}× the effort.
                    {" "}The primary preparation need is vertical durability: climbing strength, downhill resilience,
                    and the ability to stay controlled after repeated effort spikes.
                  </div>
                </div>
              )}

              {/* ── Page 4 Readiness Summary ── */}
              {(() => {
                const positives: string[] = [];
                const concerns:  string[] = [];
                if (runnablePct >= 40) positives.push(`${runnablePct}% of the course is runnable terrain — a consistent rhythm is achievable for large stretches.`);
                if (cvRatio < 0.3 && totalKm > 0) positives.push(`Effort variability is ${complexityLabel.toLowerCase()} — the course does not demand constant intensity switching.`);
                if (runnablePct < 25 && totalKm > 0) concerns.push(`Only ${runnablePct}% of the course is near-flat. A fixed pace target will not work; the athlete must be practiced at managing effort by feel.`);
                if ((steepClimbPct + steepDescentPct) > 30) concerns.push(`${steepClimbPct + steepDescentPct}% of the course is steep (≥8% gradient in either direction) — specific strength and technical movement skills are required.`);
                if (cvRatio > 0.4 && totalKm > 0) concerns.push(`High effort variability means the athlete must absorb large, repeated intensity spikes. A single output strategy across the race will not work.`);
                if (positives.length === 0 && concerns.length === 0) return null;
                return (
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "2px solid #e8f5e9" }}>
                    <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>What this section tells us about readiness</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <div style={{ fontSize: "8px", fontWeight: 700, color: "#2e7d32", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Positive indicators</div>
                        {positives.length > 0 ? positives.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #c8e6c9" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>None identified from course character alone.</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: "8px", fontWeight: 700, color: "#c0392b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Key considerations</div>
                        {concerns.length > 0 ? concerns.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #ffcdd2" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>No major concerns from course character data.</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <PageNumber n={6} />
            </div>
          )}

          {/* ═══════════════════════════════════════
              PAGE 7 — Race Demands Profile (continued)
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

              <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Race Demands Profile</h2>
              <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#888" }}>
                Demand summary and race pattern data
              </p>
              <p style={{ margin: "0 0 16px", fontSize: "11.5px", color: "#444", lineHeight: 1.6 }}>
                These cards translate the course data into the four physical demands that matter most for {result.race.name}.
                They are written honestly: where a demand is significant, it is significant — softening it does not help you prepare.
                Read each card as a direct statement about what this race will test, and whether you are ready for it.
              </p>

              {/* ── Demand summary (4 cards) ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                <DemandCard title="Climbing Demand" accent="#c0392b">
                  {totalAscentM > 0 && terrainSummary.climbing > 0 ? (
                    <>
                      Total ascent: <strong>{Math.round(totalAscentM).toLocaleString()} m</strong> across{" "}
                      <strong>{terrainSummary.climbing.toFixed(1)} km</strong> of climbing terrain
                      ({((terrainSummary.climbing / totalKm) * 100).toFixed(0)}% of the course).
                      {halfwayAscentPct !== null ? (
                        halfwayAscentPct > 55
                          ? ` The climbing is front-loaded — ${halfwayAscentPct}% of all ascent is done before halfway. Starting conservatively on climbs protects performance in the second half.`
                          : halfwayAscentPct < 45
                          ? ` The climbing is back-loaded — only ${halfwayAscentPct}% of ascent arrives before halfway, meaning hard climbs continue when the athlete is already fatigued.`
                          : " Climbing is spread broadly across both halves, requiring repeatable climbing output rather than a single strong effort."
                      ) : null}
                      {steepestClimb ? (
                        <> The steepest sustained section averages <strong>{steepestClimb.avg_gradient_percent.toFixed(1)}%</strong> gradient
                        {" "}(km {steepestClimb.start_km.toFixed(1)}–{steepestClimb.end_km.toFixed(1)}).</>
                      ) : null}
                    </>
                  ) : (
                    <span style={{ color: "#aaa" }}>Insufficient course data.</span>
                  )}
                </DemandCard>

                <DemandCard title="Descending Demand" accent="#1565c0">
                  {totalDescentM > 0 && terrainSummary.descending > 0 ? (
                    <>
                      The race includes{" "}
                      <strong>{Math.round(totalDescentM).toLocaleString()} m</strong> of descent across{" "}
                      <strong>{terrainSummary.descending.toFixed(1)} km</strong> of descending terrain
                      {" "}({((terrainSummary.descending / totalKm) * 100).toFixed(0)}% of course).
                      {steepestDescent ? (
                        <> Steepest descent: <strong>{Math.abs(steepestDescent.avg_gradient_percent).toFixed(1)}%</strong> average gradient
                        {" "}(km {steepestDescent.start_km.toFixed(1)}–{steepestDescent.end_km.toFixed(1)}).</>
                      ) : null}
                      {" "}
                      {totalDescentM > 2000
                        ? "This volume creates substantial eccentric load on the quads and calves. Even aerobically fit athletes can be stopped by leg damage if downhill durability has not been specifically trained."
                        : totalDescentM > 1000
                        ? "This creates moderate eccentric loading. Downhill technique and quad strength are important contributors to a controlled finish."
                        : "Descending load is limited relative to the climbing volume."}
                    </>
                  ) : (
                    <span style={{ color: "#aaa" }}>Insufficient course data.</span>
                  )}
                </DemandCard>

                <DemandCard title="Final Third Demands" accent="#e65100">
                  {finalThirdLen > 0 ? (
                    <>
                      The final third spans km {(finalThirdStart).toFixed(1)}–{totalKm.toFixed(1)}:{" "}
                      <strong>{finalThirdLen.toFixed(1)} km</strong> with <strong>{Math.round(finalThirdAscent)} m</strong> of remaining ascent.
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

                <DemandCard title="Effort Variability" accent={complexityColor}>
                  <strong style={{ color: complexityColor }}>{complexityLabel} effort variability.</strong>
                  {" "}
                  {cvRatio > 0.45
                    ? "The energy cost changes sharply from section to section. Managing intensity by effort feel, heart rate, or breathing rate is essential — the course does not allow a single consistent output level."
                    : cvRatio > 0.25
                    ? "Effort varies noticeably between sections. Adapting output section-by-section is important; a single constant output will either over-stress on the climbs or under-utilise on the flats."
                    : "Effort is relatively consistent across sections. A steady, measured approach is appropriate for most of this course."
                  }
                  {totalFlatEq > 0 && totalKm > 0 ? (
                    <>
                      {" "}Estimated flat-effort equivalent: <strong>{totalFlatEq.toFixed(1)} km</strong> ({effortRatio.toFixed(2)}× the actual {totalKm.toFixed(1)} km) —
                      a comparative load metric, not a literal distance prediction.
                    </>
                  ) : null}
                </DemandCard>
              </div>

              {/* ── Late race pattern data (if available) ── */}
              {late && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={sectionLabel}>Late Race Pattern — from {raceStats?.year ?? "historical"} results data</p>
                  <div style={{ background: "#fafafa", border: "1px solid #eee", borderRadius: "6px", padding: "12px 14px" }}>
                    <p style={{ margin: "0 0 8px", fontSize: "10px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Late Race — {late.final_dist_note}
                    </p>
                    <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
                      {[
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
                </div>
              )}

              <div style={{ paddingTop: "12px", borderTop: "1px solid #eee" }}>
                <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: "1.5" }}>
                  Effort multipliers derived from grade-adjusted energy cost modelling (Minetti et al. 2002). Gradient bands calculated from GPS-derived section gradients.
                  {late && " Race pattern data from official results."}
                </p>
              </div>

              {/* ── Page 5 Readiness Summary ── */}
              {(() => {
                const positives: string[] = [];
                const concerns:  string[] = [];
                if (totalAscentM > 0 && totalAscentM < 1800) positives.push(`Climbing volume (${Math.round(totalAscentM).toLocaleString()} m) is substantial but not extreme — within reach with consistent training.`);
                if (totalDescentM > 0 && totalDescentM <= totalAscentM * 1.1) positives.push(`Descent volume is proportionate to ascent — no unusual eccentric loading beyond what climbing preparation covers.`);
                if (finalThirdEffort > 0 && finalThirdEffort <= effortRatio * 1.08) positives.push(`The final third effort (${finalThirdEffort.toFixed(2)}×) is close to the course average — no severe late-race spike in difficulty.`);
                if (totalAscentM >= 2500) concerns.push(`${Math.round(totalAscentM).toLocaleString()} m of ascent is a high-volume demand. Athletes without big-ascent training may find accumulated fatigue overwhelming.`);
                if (totalDescentM >= 2000) concerns.push(`${Math.round(totalDescentM).toLocaleString()} m of descent creates substantial eccentric quad load. Downhill-specific durability training is essential.`);
                if (finalThirdEffort > effortRatio * 1.15) concerns.push(`The final third is ${((finalThirdEffort / effortRatio - 1) * 100).toFixed(0)}% harder than the course average — late-race strength endurance is the primary training priority.`);
                if (late && late.avg_fade_pct > 15) concerns.push(`Historical data shows ${late.avg_fade_pct.toFixed(1)}% average late-race slowing — this course historically tests durability hard.`);
                if (positives.length === 0 && concerns.length === 0) return null;
                return (
                  <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "2px solid #e8f5e9" }}>
                    <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>What this section tells us about readiness</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div>
                        <div style={{ fontSize: "8px", fontWeight: 700, color: "#2e7d32", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Positive indicators</div>
                        {positives.length > 0 ? positives.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #c8e6c9" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>None identified from demand profile alone.</div>}
                      </div>
                      <div>
                        <div style={{ fontSize: "8px", fontWeight: 700, color: "#c0392b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Key considerations</div>
                        {concerns.length > 0 ? concerns.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #ffcdd2" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>No major concerns from this demand profile.</div>}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <PageNumber n={7} />
            </div>
          )}

          {/* ═══════════════════════════════════════
              PAGE 8 — Athlete Overview
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const p = reportAthlete.profile;
            const races = filteredAthleteRaces;

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
                    <div key={i} style={{ background: "#f5f5f5", borderRadius: "6px", padding: "8px 14px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: c.accent ?? "#1e3a1e", marginTop: "2px" }}>{c.value}</div>
                      {c.sub && <div style={{ fontSize: "8.5px", color: "#aaa" }}>{c.sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Race-readiness framing note */}
                {(() => {
                  const goalAscent = result.race.total_ascent_m ?? 0;
                  let verticalNote = "";
                  if (p.max_ascent_m && goalAscent > 0) {
                    if (p.max_ascent_m < goalAscent * 0.7) {
                      verticalNote = ` The heaviest climbing race on record (${Math.round(p.max_ascent_m).toLocaleString()}m) is well below ${result.race.name}'s ${Math.round(goalAscent).toLocaleString()}m of ascent — vertical exposure is a genuine gap.`;
                    } else if (p.max_ascent_m < goalAscent) {
                      verticalNote = ` The heaviest climbing race on record (${Math.round(p.max_ascent_m).toLocaleString()}m) falls short of ${result.race.name}'s ${Math.round(goalAscent).toLocaleString()}m of ascent.`;
                    } else {
                      verticalNote = ` Prior races have reached or exceeded ${result.race.name}'s ${Math.round(goalAscent).toLocaleString()}m of climbing, which is a positive vertical indicator.`;
                    }
                  }
                  const dnfRate = p.race_count > 0 ? Math.round((p.dnf_count / p.race_count) * 100) : 0;
                  const dnfNote = dnfRate >= 20
                    ? ` A DNF rate of ${dnfRate}% (${p.dnf_count} from ${p.race_count} races) is worth understanding — causes should be considered before targeting a race of this scale.`
                    : "";
                  return (
                    <p style={{ margin: "0 0 18px", fontSize: "11px", color: "#444", lineHeight: 1.55 }}>
                      {`${p.athlete_key} has ${p.race_count} races on record across ${p.career_span_years ?? "—"} years of competition.`}
                      {verticalNote}
                      {dnfNote}
                      {` The pages that follow assess whether this background translates to readiness for ${result.race.name}.`}
                    </p>
                  );
                })()}


                {/* Recent races */}
                {recentRaces.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={sectionLabel}>Recent Races (last 2 years)</p>
                    <RaceHistoryRows races={recentRaces} />
                  </div>
                )}

                {/* Category results table */}
                {(() => {
                  const catRaces = recentRaces.filter(r =>
                    r.result_status === "FINISHED" && r.cat_position && r.age_group
                  );
                  if (catRaces.length === 0) return null;
                  const thC: React.CSSProperties = { textAlign: "left", padding: "3px 7px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "9.5px" };
                  const tdC: React.CSSProperties = { padding: "3px 7px", borderBottom: "1px solid #eee", fontSize: "10.5px" };
                  return (
                    <div style={{ marginBottom: "20px" }}>
                      <p style={sectionLabel}>Category Results (last 2 years)</p>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ ...thC, width: "34%" }}>Race</th>
                            <th style={{ ...thC, width: "6%" }}>Year</th>
                            <th style={{ ...thC, width: "8%" }}>Cat</th>
                            <th style={thC}>Time</th>
                            <th style={thC}>Cat. Position</th>
                            <th style={thC}>Cat. Finishers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catRaces.map((r, i) => {
                            const fmtTime = (s: number | null) => {
                              if (!s || s <= 0) return "—";
                              const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
                              return `${h}:${String(m).padStart(2, "0")}`;
                            };
                            const catPct = r.cat_position && r.cat_finishers
                              ? Math.round((r.cat_position / r.cat_finishers) * 100) : null;
                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                                <td style={{ ...tdC, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.race_name}</td>
                                <td style={{ ...tdC, color: "#888" }}>{r.result_year}</td>
                                <td style={{ ...tdC, fontSize: "9.5px", color: "#555" }}>{r.age_group}</td>
                                <td style={{ ...tdC, fontFamily: "monospace", fontSize: "10px" }}>{fmtTime(r.finish_seconds)}</td>
                                <td style={tdC}>
                                  {r.cat_position}
                                  {r.cat_finishers ? <span style={{ color: "#aaa", fontSize: "9px" }}>/{r.cat_finishers}</span> : ""}
                                </td>
                                <td style={tdC}>
                                  {catPct !== null && (
                                    <span style={{ color: catPct <= 10 ? "#2e7d32" : catPct <= 25 ? "#1565c0" : "#888", fontSize: "10px", fontWeight: 600 }}>
                                      top {catPct}%
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Career highlights */}
                {highlightRaces.length > 0 && (
                  <div style={{ marginBottom: "20px" }}>
                    <p style={sectionLabel}>Career Highlights ★</p>
                    <RaceHistoryRows races={highlightRaces} highlightIds={highlightIds} />
                  </div>
                )}

                {/* ── Page 6 Readiness Summary ── */}
                {(() => {
                  const positives: string[] = [];
                  const concerns:  string[] = [];
                  const longestDist = byDist[0]?.total_distance_km ?? 0;
                  const highestAscent = byAscent[0]?.total_ascent_m ?? 0;
                  if ((p.race_count ?? 0) >= 15) positives.push(`Strong race base — ${p.race_count} races across ${p.career_span_years ?? "?"} year${(p.career_span_years ?? 0) !== 1 ? "s" : ""} of competition.`);
                  if (longestDist >= totalKm * 0.8) positives.push(`Comparable distance experience — longest race on record is ${longestDist.toFixed(0)} km (goal race: ${totalKm.toFixed(0)} km).`);
                  if (highestAscent >= totalAscentM * 0.7 && totalAscentM > 0) positives.push(`Relevant vertical experience — career-best ascent is ${Math.round(highestAscent).toLocaleString()} m in a single race.`);
                  if (recentRaces.length >= 3) positives.push(`Active recent form — ${recentRaces.length} races in the last two years.`);
                  if ((p.race_count ?? 0) < 5) concerns.push(`Limited race experience (${p.race_count ?? 0} races on record) — race management under fatigue is an important unknown.`);
                  if (longestDist < totalKm * 0.55 && totalKm > 0) concerns.push(`The goal race (${totalKm.toFixed(0)} km) is well beyond the longest race on record (${longestDist.toFixed(0)} km) — new territory by a significant margin.`);
                  if (highestAscent < totalAscentM * 0.4 && totalAscentM > 500) concerns.push(`Career-best single-race ascent (${Math.round(highestAscent).toLocaleString()} m) is well below the goal race demands (${Math.round(totalAscentM).toLocaleString()} m).`);
                  if (recentRaces.length === 0) concerns.push(`No races on record in the last two years — current fitness and form are unknown.`);
                  if (positives.length === 0 && concerns.length === 0) return null;
                  return (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "2px solid #e8f5e9" }}>
                      <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>What this section tells us about readiness</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <div style={{ fontSize: "8px", fontWeight: 700, color: "#2e7d32", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Positive indicators</div>
                          {positives.length > 0 ? positives.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #c8e6c9" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>None identified from experience base alone.</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: "8px", fontWeight: 700, color: "#c0392b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Key considerations</div>
                          {concerns.length > 0 ? concerns.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #ffcdd2" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>No major concerns from career profile.</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Footer note */}
                <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid #eee" }}>
                  <p style={{ fontSize: "8.5px", color: "#bbb", margin: 0 }}>
                    Athlete data sourced from race results database. Starred rows indicate personal bests or career-significant performances.
                    {p.cluster_label && ` Athlete type classification from similarity clustering.`}
                  </p>
                </div>

                <PageNumber n={8} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 9 — Experience Gaps
          ═══════════════════════════════════════ */}
          {reportAthlete && result.terrain_sections.length > 0 && (() => {
            const p = reportAthlete.profile;

            // Aggregate target race pairings from its terrain sections
            const targetPairingMap: Record<string, { section_type: string; terrain: string; km: number; weightedGrad: number }> = {};
            for (const sec of result.terrain_sections) {
              const key = `${sec.section_type}|${sec.terrain}`;
              if (!targetPairingMap[key]) targetPairingMap[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0, weightedGrad: 0 };
              targetPairingMap[key].km          += sec.distance_km;
              targetPairingMap[key].weightedGrad += sec.avg_gradient_percent * sec.distance_km;
            }

            // Round and sort by km descending (importance order)
            const targetList = Object.values(targetPairingMap)
              .map(tp => ({
                ...tp,
                km:           Math.round(tp.km * 10) / 10,
                avg_gradient: tp.km > 0 ? Math.round((tp.weightedGrad / tp.km) * 10) / 10 : 0,
              }))
              .filter(tp => tp.km >= 0.1)
              .sort((a, b) => b.km - a.km);

            // Exact terrain match (section_type + terrain must both match)
            const athleteExactMap: Record<string, number> = {};
            for (const p of reportAthlete.terrain_pairings ?? []) {
              athleteExactMap[`${p.section_type}|${p.terrain}`] = p.total_km;
            }

            // Cross-terrain index: same gradient on OTHER surfaces — shown as context
            const athleteCrossIndex: Record<string, Array<{ terrain: string; km: number }>> = {};
            for (const p of reportAthlete.terrain_pairings ?? []) {
              if (!athleteCrossIndex[p.section_type]) athleteCrossIndex[p.section_type] = [];
              athleteCrossIndex[p.section_type].push({ terrain: p.terrain, km: p.total_km });
            }

            // Build gap rows — 4-level status (met / partial / surface_gap / none)
            const gapRows = targetList.map(tp => {
              const exactKm = Math.round((athleteExactMap[`${tp.section_type}|${tp.terrain}`] ?? 0) * 10) / 10;
              const crossEntries = (athleteCrossIndex[tp.section_type] ?? [])
                .filter(e => e.terrain !== tp.terrain)
                .sort((a, b) => b.km - a.km);
              const crossKm = Math.round(crossEntries.reduce((s, e) => s + e.km, 0) * 10) / 10;
              const crossSurface = crossEntries.length > 0 ? crossEntries[0].terrain : null;
              const pct = tp.km > 0 ? Math.min(100, Math.round((exactKm / tp.km) * 100)) : 100;
              const status: "none" | "partial" | "met" | "surface_gap" =
                exactKm === 0 && crossKm > 0 ? "surface_gap" :
                exactKm === 0               ? "none" :
                pct >= 100                  ? "met" : "partial";
              return { ...tp, exactKm, crossKm, crossSurface, pct, status };
            });

            const climbRows   = gapRows.filter(r => r.section_type.includes("climb"));
            const descentRows = gapRows.filter(r => r.section_type.includes("descent"));
            const flatRows    = gapRows.filter(r => !r.section_type.includes("climb") && !r.section_type.includes("descent"));

            const noneCount       = gapRows.filter(r => r.status === "none").length;
            const surfaceGapCount = gapRows.filter(r => r.status === "surface_gap").length;
            const partialCount    = gapRows.filter(r => r.status === "partial").length;
            const metCount        = gapRows.filter(r => r.status === "met").length;

            const sectionTypeLabel = (s: string, avgGrad?: number) => {
              if (avgGrad !== undefined) {
                if (s === "steep_climb"   && avgGrad >= 12) return "Very Steep Climb";
                if (s === "steep_descent" && avgGrad <= -12) return "Very Steep Descent";
              }
              return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            };
            const terrainLabel = (t: string) =>
              t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const pairingColor = (s: string) =>
              s.includes("climb") ? "#c0392b" : s.includes("descent") ? "#1565c0" : "#2e7d32";

            const statusBadge = (row: (typeof gapRows)[0]) => {
              if (row.status === "met")          return { label: "Covered",       bg: "#e8f5e9", color: "#2e7d32" };
              if (row.status === "partial")      return { label: `${row.pct}% met`, bg: "#fff3e0", color: "#f57c00" };
              if (row.status === "surface_gap")  return { label: "Surface gap",   bg: "#fff3e0", color: "#e65100" };
              return                                    { label: "No experience", bg: "#fce4ec", color: "#c0392b" };
            };

            const sectionSummary = (rows: typeof gapRows) => {
              const gaps    = rows.filter(r => r.status === "none").length;
              const surface = rows.filter(r => r.status === "surface_gap").length;
              const partial = rows.filter(r => r.status === "partial").length;
              const covered = rows.filter(r => r.status === "met").length;
              const parts: string[] = [];
              if (gaps    > 0) parts.push(`${gaps} no experience`);
              if (surface > 0) parts.push(`${surface} surface gap${surface !== 1 ? "s" : ""}`);
              if (partial > 0) parts.push(`${partial} partial`);
              if (covered > 0) parts.push(`${covered} covered`);
              return parts.join(" · ");
            };

            const renderGapRows = (rows: typeof gapRows) =>
              rows.map((row, i) => {
                const col   = pairingColor(row.section_type);
                const badge = statusBadge(row);
                return (
                  <tr key={`${row.section_type}|${row.terrain}`} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      <span style={{ color: col }}>{sectionTypeLabel(row.section_type, row.avg_gradient)}</span>
                      <div style={{ fontSize: "8.5px", color: "#aaa", fontWeight: 400, marginTop: "1px" }}>
                        {terrainLabel(row.terrain)} · avg {row.avg_gradient > 0 ? "+" : ""}{row.avg_gradient.toFixed(1)}%
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{row.km.toFixed(1)}</td>
                    <td style={tdStyle}>
                      <span style={{ color: row.exactKm > 0 ? "#333" : "#ccc", fontWeight: row.exactKm > 0 ? 600 : 400 }}>
                        {row.exactKm > 0 ? `${row.exactKm.toFixed(1)} km` : "—"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {row.crossKm > 0 && row.crossSurface ? (
                        <span style={{ color: row.status === "surface_gap" ? "#e65100" : "#aaa", fontSize: "10px" }}>
                          {row.crossKm.toFixed(1)} km on {terrainLabel(row.crossSurface)}
                        </span>
                      ) : (
                        <span style={{ color: "#ddd" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: badge.bg, color: badge.color, borderRadius: "10px", padding: "2px 8px", fontSize: "9.5px", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              });

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
                  Every terrain demand of {result.race.name} — split by ascent and descent
                </p>

                {/* Summary chips */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                  {noneCount > 0 && (
                    <div style={{ background: "#fce4ec", borderRadius: "20px", padding: "4px 12px", fontSize: "10.5px", fontWeight: 700, color: "#c0392b" }}>
                      {noneCount} no experience
                    </div>
                  )}
                  {surfaceGapCount > 0 && (
                    <div style={{ background: "#fff3e0", borderRadius: "20px", padding: "4px 12px", fontSize: "10.5px", fontWeight: 700, color: "#e65100" }}>
                      {surfaceGapCount} surface gap{surfaceGapCount !== 1 ? "s" : ""}
                    </div>
                  )}
                  {partialCount > 0 && (
                    <div style={{ background: "#fff8e1", borderRadius: "20px", padding: "4px 12px", fontSize: "10.5px", fontWeight: 700, color: "#f57c00" }}>
                      {partialCount} partially met
                    </div>
                  )}
                  {metCount > 0 && (
                    <div style={{ background: "#e8f5e9", borderRadius: "20px", padding: "4px 12px", fontSize: "10.5px", fontWeight: 700, color: "#2e7d32" }}>
                      {metCount} covered
                    </div>
                  )}
                </div>

                {/* Honest gap explanation */}
                <p style={{ margin: "0 0 10px", fontSize: "11px", color: "#444", lineHeight: 1.55 }}>
                  {noneCount > 0
                    ? `${noneCount} demand${noneCount !== 1 ? "s" : ""} on ${result.race.name} have no equivalent in this athlete's race history. These are genuine experience gaps — terrain not tested in a race context.`
                    : surfaceGapCount > 0
                    ? `All gradient types on ${result.race.name} appear in this athlete's history, but on different surfaces. Fitness transfers; terrain-specific technique and muscle recruitment do not.`
                    : partialCount > 0
                    ? `All terrain types have some prior exposure, but several are underrepresented relative to the course demands.`
                    : `Every terrain demand of ${result.race.name} is covered by prior experience.`
                  }
                  {` Each row is ordered by course distance — the longer the "Race km" value, the greater the physical consequence.`}
                </p>

                {/* Terrain type definitions */}
                <div style={{ background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 14px", marginBottom: "10px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "7px" }}>
                    Terrain &amp; Section Type Glossary
                  </div>

                  <div style={{ fontSize: "9px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Surface types</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", marginBottom: "10px" }}>
                    {[
                      { term: "Road",  def: "Paved or tarmac surface. Consistent grip; foot-strike patterns differ from off-road." },
                      { term: "Trail", def: "Unpaved path or track. Variable underfoot; higher ankle and calf demand than road." },
                      { term: "Fell",  def: "Open moorland with no defined path. Rough, unpredictable footing; high ankle stability demand." },
                    ].map(({ term, def }) => (
                      <div key={term} style={{ fontSize: "9.5px", color: "#444", lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700, color: "#333" }}>{term}: </span>{def}
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "8px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Section types</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px" }}>
                      {[
                        { term: "Sustained Climb",   def: "Long continuous uphill, typically 3+ km. Aerobic and muscular endurance is the key demand." },
                        { term: "Steep Climb",        def: "Short to medium uphill above ~8–10%. Explosive leg drive; heart rate spikes quickly." },
                        { term: "Mild Climb",         def: "Gradual uphill, 1–3%. Often runnable but accumulates fatigue over distance." },
                        { term: "Sustained Descent",  def: "Long continuous downhill. Eccentric quad load — the primary source of late-race leg failure." },
                        { term: "Steep Descent",      def: "Short to medium downhill above ~8–10%. Technical foot placement and braking force required." },
                      ].map(({ term, def }) => (
                        <div key={term} style={{ fontSize: "9.5px", color: "#444", lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 700, color: "#333" }}>{term}: </span>{def}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Profile coverage warning */}
                {(() => {
                  const rwp = reportAthlete.races_with_profile ?? 0;
                  const total = reportAthlete.profile.finish_count;
                  if (rwp === 0 || rwp >= total) return null;
                  return (
                    <div style={{ background: "#fff8e1", border: "1px solid #ffe082", borderRadius: "6px",
                      padding: "7px 12px", marginBottom: "10px", fontSize: "10.5px", color: "#795500" }}>
                      <strong>Data coverage:</strong> Terrain experience is based on {rwp} of {total} finished
                      races with GPS profile data. The remaining {total - rwp} races count toward career stats
                      but have no terrain breakdown — gaps may be understated.
                      {" "}<a
                        href={`/admin/data-coverage?race_id=${encodeURIComponent(result.race.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#795500", fontWeight: 600, textDecoration: "underline" }}
                      >
                        Check data coverage →
                      </a>
                    </div>
                  );
                })()}

                {/* Gap tables — one per movement type */}
                {[
                  { rows: climbRows,   accent: "#c0392b", bg: "#f9ecec", border: "#f0c8c8", label: "▲ Ascent" },
                  { rows: descentRows, accent: "#1565c0", bg: "#eaf2fb", border: "#c3d9f3", label: "▼ Descent" },
                  { rows: flatRows,    accent: "#2e7d32", bg: "#f0f7f0", border: "#c3e6c3", label: "— Rolling / Flat" },
                ].filter(g => g.rows.length > 0).map(g => (
                  <div key={g.label} style={{ marginBottom: "16px" }}>
                    <div style={{ padding: "5px 8px", background: g.bg, borderTop: `2px solid ${g.accent}`, borderBottom: `1px solid ${g.border}`, marginBottom: "0" }}>
                      <span style={{ fontWeight: 700, fontSize: "10px", color: g.accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.label}</span>
                      <span style={{ marginLeft: "10px", fontSize: "9px", color: "#999" }}>{sectionSummary(g.rows)}</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, width: "180px" }}>Terrain Demand</th>
                          <th style={{ ...thStyle, width: "70px" }}>Race km</th>
                          <th style={{ ...thStyle, width: "80px" }}>Your experience</th>
                          <th style={thStyle}>On other surfaces</th>
                          <th style={{ ...thStyle, width: "110px" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {renderGapRows(g.rows)}
                      </tbody>
                    </table>
                  </div>
                ))}

                <div style={{ marginTop: "10px", fontSize: "8.5px", color: "#666", lineHeight: 1.6 }}>
                  <strong>Covered</strong> — raced this terrain at or above the required volume.{" "}
                  <strong>Surface gap</strong> — done this gradient on a different surface; aerobic fitness transfers but terrain-specific adaptation does not.{" "}
                  <strong>No experience</strong> — this gradient and surface combination is untested in any race on record.
                  Demands ordered by course distance within each section — longer sections have greater physical consequence.
                </div>

                {/* ── Page 8 Readiness Summary ── */}
                {(() => {
                  const positives: string[] = [];
                  const concerns:  string[] = [];
                  const totalDemands = gapRows.length;
                  if (metCount === totalDemands && totalDemands > 0) positives.push(`All ${totalDemands} terrain demand types are covered from race history — no unexperienced combinations.`);
                  else if (metCount > 0) positives.push(`${metCount} of ${totalDemands} terrain demand types are fully covered, with volume matching or exceeding what the race requires.`);
                  if (surfaceGapCount > 0 && noneCount === 0) positives.push(`Where specific surface experience is missing, the gradient pattern is familiar — aerobic and strength adaptation transfers.`);
                  if (noneCount === 0 && surfaceGapCount === 0 && partialCount > 0) positives.push(`No completely untested combinations — all demand types appear in the race history in some form.`);
                  if (noneCount > 0) concerns.push(`${noneCount} terrain demand type${noneCount !== 1 ? "s" : ""} are entirely untested — this gradient on this surface has never appeared in any race on record.`);
                  if (surfaceGapCount > 0) concerns.push(`${surfaceGapCount} demand type${surfaceGapCount !== 1 ? "s" : ""} show a surface gap — the gradient band is familiar but the specific surface is not. Terrain-specific neuromuscular adaptation cannot be assumed.`);
                  const highVolGaps = gapRows.filter(r => (r.status === "none" || r.status === "surface_gap") && r.km >= 5);
                  if (highVolGaps.length > 0) concerns.push(`${highVolGaps.length} high-volume gap${highVolGaps.length !== 1 ? "s" : ""} (≥5 km each) represent substantial unexperienced course sections.`);
                  if (positives.length === 0 && concerns.length === 0) return null;
                  return (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "2px solid #e8f5e9" }}>
                      <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "7px" }}>What this section tells us about readiness</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div>
                          <div style={{ fontSize: "8px", fontWeight: 700, color: "#2e7d32", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Positive indicators</div>
                          {positives.length > 0 ? positives.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #c8e6c9" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>None identified from gap analysis.</div>}
                        </div>
                        <div>
                          <div style={{ fontSize: "8px", fontWeight: 700, color: "#c0392b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Key considerations</div>
                          {concerns.length > 0 ? concerns.map((t, i) => <div key={i} style={{ fontSize: "8.5px", color: "#333", lineHeight: 1.45, marginBottom: "3px", paddingLeft: "7px", borderLeft: "2px solid #ffcdd2" }}>{t}</div>) : <div style={{ fontSize: "8.5px", color: "#aaa" }}>No significant gaps identified.</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <PageNumber n={9} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 10 — Demands Built Up
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const p = reportAthlete.profile;
            const allRaces = filteredAthleteRaces;

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

            const pairings = (reportAthlete.terrain_pairings ?? []).slice(0, 10);
            const maxPairingKm = pairings.reduce((m, p) => Math.max(m, p.total_km), 0) || 1;

            const sectionTypeLabel = (s: string, avgGrad?: number) => {
              if (avgGrad !== undefined) {
                if (s === "steep_climb"   && avgGrad >= 12) return "Very Steep Climb";
                if (s === "steep_descent" && avgGrad <= -12) return "Very Steep Descent";
              }
              return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            };
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

                {/* Honest distance/ascent framing */}
                {(() => {
                  const distGap   = targetDist   !== null && maxDist   !== null ? (maxDist   >= targetDist   ? "met" : "gap") : null;
                  const ascentGap = targetAscent !== null && maxAscent !== null ? (maxAscent >= targetAscent ? "met" : "gap") : null;
                  let framingText = "";
                  if (distGap === "gap" && ascentGap === "gap") {
                    framingText = `Neither the distance (${targetDist?.toFixed(0)} km) nor the ascent (${Math.round(targetAscent ?? 0).toLocaleString()}m) of ${result.race.name} has been matched in a single race finish. Both are unvalidated at this scale — a meaningful consideration for race day.`;
                  } else if (distGap === "gap") {
                    framingText = `The ascent of ${result.race.name} has been matched in prior racing, but the full distance (${targetDist?.toFixed(0)} km) has not been completed in a single race. Distance tolerance is the primary unconfirmed demand.`;
                  } else if (ascentGap === "gap") {
                    framingText = `The distance of ${result.race.name} has been covered in prior racing, but the full ascent (${Math.round(targetAscent ?? 0).toLocaleString()}m) has not been matched in a single race. Vertical load is the primary unconfirmed demand.`;
                  } else if (distGap === "met" && ascentGap === "met") {
                    framingText = `Both the distance and ascent of ${result.race.name} have been matched or exceeded in prior race finishes — a meaningful baseline. Recency and terrain specificity of those races determine how well this transfers.`;
                  } else {
                    framingText = `The chart shows the athlete's maximum achieved values compared to the demands of ${result.race.name}.`;
                  }
                  return (
                    <p style={{ margin: "0 0 16px", fontSize: "11px", color: "#444", lineHeight: 1.55 }}>
                      {framingText}
                    </p>
                  );
                })()}

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
                                {sectionTypeLabel(pair.section_type, pair.avg_gradient)}
                                <div style={{ fontSize: "8.5px", color: "#999", fontWeight: 400, marginTop: "1px" }}>
                                  avg {pair.avg_gradient > 0 ? "+" : ""}{pair.avg_gradient.toFixed(1)}%
                                </div>
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

                <PageNumber n={10} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 11 — Aid Station Analysis
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const stations: AidStation[] = result.aid_stations ?? [];
            const sorted = [...stations].sort((a, b) => a.km - b.km);

            const stops = [0, ...sorted.map(s => s.km), totalKm];
            const gaps  = stops.slice(1).map((km, i) => ({ km, gapKm: km - stops[i], fromKm: stops[i] }));
            const maxGap     = gaps.length > 0 ? Math.max(...gaps.map(g => g.gapKm)) : 0;
            const avgGap     = gaps.length > 0 ? gaps.reduce((s, g) => s + g.gapKm, 0) / gaps.length : 0;
            const hasDropBag = sorted.some(s => s.dropBags);
            const hasFood    = sorted.some(s => s.food);

            const athleteRaceGaps: { race_name: string; maxGap: number }[] = [];
            for (const race of filteredAthleteRaces) {
              const sts = athleteAidData[race.race_id];
              if (!sts || sts.length === 0) continue;
              const sortedSts = [...sts].sort((a, b) => a.km - b.km);
              const raceGaps  = sortedSts.slice(1).map((s, i) => s.km - sortedSts[i].km);
              athleteRaceGaps.push({ race_name: race.race_name, maxGap: Math.max(...raceGaps) });
            }
            const athleteMaxGap = athleteRaceGaps.length > 0
              ? Math.max(...athleteRaceGaps.map(r => r.maxGap))
              : null;

            interface AidFlag { color: string; bg: string; border: string; text: string; }
            const flags: AidFlag[] = [];
            if (maxGap > 20) flags.push({ color: "#c0392b", bg: "#fce4ec", border: "#ffcdd2", text: `Longest gap is ${maxGap.toFixed(1)} km — water carry is essential for this stretch.` });
            else if (maxGap > 15) flags.push({ color: "#e65100", bg: "#fff3e0", border: "#ffe0b2", text: `Longest gap is ${maxGap.toFixed(1)} km — carry a gel or bar leaving the preceding station.` });
            if (athleteMaxGap !== null && maxGap > athleteMaxGap * 1.2) flags.push({ color: "#c0392b", bg: "#fce4ec", border: "#ffcdd2", text: `Goal race max gap (${maxGap.toFixed(1)} km) exceeds the athlete's largest recorded gap (${athleteMaxGap.toFixed(1)} km) — self-supported carrying is new territory.` });
            if (!hasFood) flags.push({ color: "#c0392b", bg: "#fce4ec", border: "#ffcdd2", text: `No food provided at any aid station — athlete must carry all race nutrition.` });
            if (!hasDropBag && totalKm > 50) flags.push({ color: "#e65100", bg: "#fff3e0", border: "#ffe0b2", text: `No drop bag support on a ${totalKm.toFixed(0)} km race — confirm kit and nutrition strategy accounts for full self-sufficiency.` });
            const longRunGaps = gaps.filter(g => g.gapKm > 10);
            if (longRunGaps.length >= 3) flags.push({ color: "#e65100", bg: "#fff3e0", border: "#ffe0b2", text: `${longRunGaps.length} gaps exceed 10 km — a hydration pack may be worth considering over handheld bottles.` });

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Aid Station Analysis</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Aid Station Analysis</h2>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                  Gap analysis and logistics preparation for {result.race.name}
                </p>

                {stations.length === 0 ? (
                  <div style={{ padding: "24px", border: "1px dashed #d1d5db", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: 6 }}>No aid station data recorded for this race.</div>
                    <div style={{ fontSize: "11px", color: "#bbb" }}>Add stations via <em>Admin → Aid Stations</em> or the race editor on the frontend.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "16px" }}>
                      {[
                        { label: "Stations", value: String(sorted.length) },
                        { label: "Longest gap", value: `${maxGap.toFixed(1)} km`, highlight: maxGap > 20 ? "#c0392b" : maxGap > 15 ? "#e65100" : undefined },
                        { label: "Average gap", value: `${avgGap.toFixed(1)} km` },
                        { label: "Drop bags", value: hasDropBag ? "Yes" : "No", highlight: !hasDropBag && totalKm > 50 ? "#e65100" : hasDropBag ? "#2e7d32" : undefined },
                      ].map(({ label, value, highlight }) => (
                        <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: 6, padding: "8px 10px", textAlign: "center", background: "#fafafa" }}>
                          <div style={{ fontSize: "8px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: highlight ?? "#1e3a1e" }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginBottom: "14px" }}>
                      <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Course Layout</div>
                      <div style={{ position: "relative", height: "20px", background: "#e8f5e9", borderRadius: 4, overflow: "visible" }}>
                        {sorted.map((s, i) => {
                          const pct = totalKm > 0 ? (s.km / totalKm) * 100 : 0;
                          return (
                            <div key={i} title={`${s.name ?? `Station ${i+1}`} — ${s.km.toFixed(1)} km`} style={{
                              position: "absolute", left: `${pct}%`, top: "-3px",
                              transform: "translateX(-50%)",
                              width: 6, height: 26, background: "#2e7d32",
                              borderRadius: 2, cursor: "default",
                            }} />
                          );
                        })}
                        {gaps.map((g, i) => {
                          if (g.gapKm < 3) return null;
                          const midPct = totalKm > 0 ? ((g.fromKm + g.gapKm / 2) / totalKm) * 100 : 0;
                          return (
                            <div key={i} style={{
                              position: "absolute", left: `${midPct}%`, top: "24px",
                              transform: "translateX(-50%)", fontSize: "7px",
                              color: g.gapKm > 15 ? "#c0392b" : "#666", whiteSpace: "nowrap",
                            }}>{g.gapKm.toFixed(1)} km</div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px", color: "#999", marginTop: "22px" }}>
                        <span>Start (0 km)</span>
                        <span>Finish ({totalKm.toFixed(0)} km)</span>
                      </div>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Stations</div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e0e0e0", background: "#f9fafb" }}>
                            {["km", "Name", "Gap from prev", "💧", "🍊", "🩺", "🚻", "🎒"].map(h => (
                              <th key={h} style={{ padding: "3px 6px", textAlign: h === "km" || h.startsWith("Gap") ? "right" : "center", fontSize: "8px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((s, i) => {
                            const gapKm = i === 0 ? s.km : s.km - sorted[i-1].km;
                            const isLargeGap = gapKm > 15;
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", background: isLargeGap ? "#fff8f0" : undefined }}>
                                <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 600, color: "#1e3a1e", whiteSpace: "nowrap" }}>{s.km.toFixed(1)}</td>
                                <td style={{ padding: "3px 6px", color: "#444" }}>{s.name ?? `Station ${i + 1}`}</td>
                                <td style={{ padding: "3px 6px", textAlign: "right", color: isLargeGap ? "#c0392b" : "#555", fontWeight: isLargeGap ? 700 : 400 }}>{gapKm.toFixed(1)} km</td>
                                {(["water", "food", "medic", "toilets", "dropBags"] as const).map(k => (
                                  <td key={k} style={{ padding: "3px 6px", textAlign: "center", color: s[k] ? "#2e7d32" : "#ddd" }}>{s[k] ? "✓" : "–"}</td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {athleteRaceGaps.length > 0 && (
                      <div style={{ marginBottom: "14px" }}>
                        <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Athlete's Historical Aid Station Experience</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                          {[
                            { label: "Races with data", value: String(athleteRaceGaps.length) },
                            { label: "Largest gap experienced", value: athleteMaxGap !== null ? `${athleteMaxGap.toFixed(1)} km` : "—", highlight: athleteMaxGap !== null && maxGap > athleteMaxGap * 1.2 ? "#c0392b" : undefined },
                            { label: "Goal race max gap", value: `${maxGap.toFixed(1)} km` },
                          ].map(({ label, value, highlight }) => (
                            <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: 6, padding: "7px 10px", background: "#fafafa" }}>
                              <div style={{ fontSize: "8px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                              <div style={{ fontSize: "13px", fontWeight: 700, color: highlight ?? "#1e3a1e" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {athleteRaceGaps.length === 0 && (
                      <div style={{ padding: "10px 12px", background: "#f9fafb", border: "1px solid #e0e0e0", borderRadius: 6, fontSize: "9px", color: "#888", marginBottom: "14px" }}>
                        No aid station data available for any of the athlete's previous races — gap comparison cannot be performed.
                      </div>
                    )}

                    {(() => {
                      const athleteName = reportAthlete.profile.athlete_key ?? "The athlete";
                      const raceName    = result.race.name;

                      const expPara = (() => {
                        if (athleteRaceGaps.length === 0) {
                          return `There is no recorded aid station data from ${athleteName}'s previous races, so a direct comparison against the goal race logistics cannot be made from historical evidence. Preparation should be built around the goal race demands outlined above.`;
                        }
                        const bestRace = athleteRaceGaps.reduce((a, b) => b.maxGap > a.maxGap ? b : a);
                        const raceWord = athleteRaceGaps.length === 1 ? "race" : "races";
                        return `${athleteRaceGaps.length} of ${athleteName}'s previous ${raceWord} ${athleteRaceGaps.length === 1 ? "has" : "have"} aid station data on record. The largest unsupported gap navigated to date is ${athleteMaxGap!.toFixed(1)} km, recorded at ${bestRace.race_name}.`;
                      })();

                      const demandPara = (() => {
                        const stationWord = sorted.length === 1 ? "station" : "stations";
                        const facilityParts: string[] = [];
                        if (hasFood) facilityParts.push("food");
                        if (hasDropBag) facilityParts.push("drop bag support");
                        const facilityStr = facilityParts.length > 0
                          ? ` Stations offering ${facilityParts.join(" and ")} are available on the course.`
                          : "";
                        const noFoodStr = !hasFood ? " No food is provided at any station — all race nutrition must be carried." : "";
                        const noDropStr = !hasDropBag && totalKm > 50 ? ` There is no drop bag support; all kit and nutrition must be self-carried for the full ${totalKm.toFixed(0)} km.` : "";
                        return `${raceName} has ${sorted.length} aid ${stationWord} across ${totalKm.toFixed(0)} km, giving an average gap of ${avgGap.toFixed(1)} km between support points and a maximum unsupported stretch of ${maxGap.toFixed(1)} km.${facilityStr}${noFoodStr}${noDropStr}`;
                      })();

                      const assessmentPara = (() => {
                        if (athleteRaceGaps.length === 0) {
                          return `Without historical gap data, the priority preparation focus should be practising ${maxGap.toFixed(1)} km of continuous running self-supported — carrying the full hydration and nutrition load the race will require. Long training days without crew access are the most relevant preparation vehicle.`;
                        }
                        const parts: string[] = [];
                        if (maxGap <= athleteMaxGap! * 1.05) {
                          parts.push(`The goal race's longest unsupported stretch (${maxGap.toFixed(1)} km) is within the range ${athleteName} has already managed in competition — aid station logistics are unlikely to be a limiting factor.`);
                        } else if (maxGap <= athleteMaxGap! * 1.2) {
                          parts.push(`The goal race's maximum gap of ${maxGap.toFixed(1)} km is modestly beyond the athlete's recorded experience (${athleteMaxGap!.toFixed(1)} km). One or two long training runs practising self-sufficiency at this stretch should be sufficient preparation.`);
                        } else {
                          parts.push(`The goal race's maximum gap of ${maxGap.toFixed(1)} km is meaningfully longer than the largest gap ${athleteName} has managed (${athleteMaxGap!.toFixed(1)} km). Carrying capacity, hydration planning, and self-supported running at this distance all require specific training attention.`);
                        }
                        if (!hasFood) {
                          parts.push(`With no food provision at stations, this is also a nutrition logistics challenge — the athlete must calculate and carry all carbohydrate needs from the start or between crew points.`);
                        }
                        return parts.join(" ");
                      })();

                      return (
                        <div style={{ marginBottom: "16px" }}>
                          <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Summary</div>
                          <div style={{ fontSize: "10px", color: "#333", lineHeight: 1.65, display: "flex", flexDirection: "column", gap: 8 }}>
                            <p style={{ margin: 0 }}>{expPara}</p>
                            <p style={{ margin: 0 }}>{demandPara}</p>
                            <p style={{ margin: 0 }}>{assessmentPara}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {flags.length > 0 && (
                      <div>
                        <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Preparation Flags</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {flags.map((f, i) => (
                            <div key={i} style={{ padding: "7px 10px", background: f.bg, border: `1px solid ${f.border}`, borderLeft: `3px solid ${f.color}`, borderRadius: 5, fontSize: "9.5px", color: "#333", lineHeight: 1.5 }}>
                              {f.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                <PageNumber n={11} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 12 — Suggested Preparation Races
          ═══════════════════════════════════════ */}
          {(prepRaces && reportAthlete) && (() => {
            const stl = (s: string) => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const tl  = (t: string) => t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const scoreColor = (n: number) => n >= 70 ? "#2e7d32" : n >= 40 ? "#e65100" : "#78909c";
            const formatDate = (d: string) =>
              new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

            const suggestions = prepRaces?.suggestions ?? [];

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Suggested Preparation Races</h2>
                <p style={{ margin: "0 0 18px", fontSize: "12px", color: "#888" }}>
                  Races within {prepRaces?.radius_miles ?? radiusMiles} miles of {reportAthlete?.profile.athlete_key.split(" ")[0]}&apos;s race base
                  that best address identified experience gaps for {result.race.name}
                  {prepRaces?.centroid ? ` · base inferred from ${suggestions.length > 0 ? "race" : ""} history` : ""}
                </p>

                {prepRacesLoading && !prepRaces && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: "13px" }}>
                    Searching for preparation races…
                  </div>
                )}

                {prepRaces && suggestions.length === 0 && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: "13px" }}>
                    No scored races found within {prepRaces.radius_miles} miles.
                    {!prepRaces.centroid && " Unable to infer athlete's location from race history."}
                  </div>
                )}

                {suggestions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {suggestions.map((s, i) => {
                      const col = scoreColor(s.gap_fill_score);
                      return (
                        <div key={s.race_id} style={{ border: `1px solid #e5e5e5`, borderLeft: `4px solid ${col}`, borderRadius: "6px", padding: "12px 14px", background: "#fff" }}>
                          {/* Header row */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                            <div style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
                              {i + 1}. {s.race_name}
                            </div>
                            <div style={{ background: col, color: "#fff", borderRadius: "10px", padding: "2px 10px", fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap", marginLeft: "12px" }}>
                              {s.gap_fill_score}% gap coverage
                            </div>
                          </div>

                          {/* Stats row */}
                          <div style={{ fontSize: "10.5px", color: "#666", marginBottom: "8px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                            <span>📍 {s.distance_miles.toFixed(1)} mi away</span>
                            {s.next_date && <span>📅 Next: {formatDate(s.next_date)}</span>}
                            {s.total_distance_km != null && <span>↔ {s.total_distance_km.toFixed(1)} km</span>}
                            {s.total_ascent_m != null && <span>↑ {Math.round(s.total_ascent_m).toLocaleString()} m</span>}
                          </div>

                          {/* Coverage bar */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                            <div style={{ fontSize: "9px", color: "#aaa", whiteSpace: "nowrap" }}>Coverage</div>
                            <div style={{ flex: 1, height: "6px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${s.gap_fill_score}%`, background: col, borderRadius: "3px" }} />
                            </div>
                          </div>

                          {/* Gap fills */}
                          <div>
                            <div style={{ fontSize: "9.5px", color: "#555", fontWeight: 600, marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                              Experience gaps addressed:
                            </div>
                            {s.gaps_filled.slice(0, 5).map((f, j) => {
                              const fillPct = Math.min(100, Math.round((f.race_km / f.needed_km) * 100));
                              const gapCol  = f.section_type.includes("climb") ? "#c0392b" : f.section_type.includes("descent") ? "#1565c0" : "#2e7d32";
                              return (
                                <div key={j} style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "10.5px", color: "#333", marginBottom: "2px" }}>
                                  <span style={{ color: gapCol, fontWeight: 700, flexShrink: 0 }}>›</span>
                                  <span>
                                    <span style={{ fontWeight: 600 }}>{stl(f.section_type)}</span>
                                    {" / "}
                                    <span style={{ color: "#555" }}>{tl(f.terrain)}</span>
                                    {" — "}
                                    <span style={{ fontWeight: 600 }}>{f.race_km.toFixed(1)} km</span>
                                    <span style={{ color: "#999", fontSize: "9.5px" }}>
                                      {" "}({fillPct}% of your {f.needed_km.toFixed(1)} km gap)
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                            {s.gaps_filled.length > 5 && (
                              <div style={{ fontSize: "9.5px", color: "#aaa", marginTop: "2px" }}>
                                +{s.gaps_filled.length - 5} more gap types addressed
                              </div>
                            )}
                          </div>

                          {/* Training plan QR — only if this race has a published slug */}
                          {s.race_slug && (() => {
                            const raceUrl = `https://www.tortoiseendurance.com/feeder-races/${s.race_slug}`;
                            return (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #f0f0f0" }}>
                                <div>
                                  <div style={{ fontSize: "9.5px", fontWeight: 700, color: "#1e3a1e", marginBottom: "2px" }}>Training plans available</div>
                                  <div style={{ fontSize: "8.5px", color: "#888", lineHeight: 1.4 }}>We have structured plans for {s.race_name}.<br />Scan to view start dates and durations.</div>
                                </div>
                                <div style={{ textAlign: "center", marginLeft: "10px", flexShrink: 0 }}>
                                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(raceUrl)}`} alt={`QR — ${raceUrl}`} width={60} height={60} style={{ display: "block", borderRadius: "3px" }} />
                                  <div style={{ fontSize: "7px", color: "#bbb", marginTop: "2px" }}>Scan for plans</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: "16px", fontSize: "8.5px", color: "#bbb" }}>
                  Races scored by how much of your identified experience gaps they address, weighted by km needed.
                  Location inferred from centroid of athlete&apos;s career race history. Races already completed by this athlete are excluded.
                </div>

                <div style={{ marginTop: "14px", padding: "10px 14px", background: "#fafafa", border: "1px solid #e8e8e8", borderLeft: "3px solid #b0b0b0", borderRadius: "4px", fontSize: "9px", color: "#888", lineHeight: 1.6 }}>
                  <strong style={{ color: "#666" }}>Data limitations:</strong> This report is based on publicly available race results and course data.
                  {" "}It does not account for training completed outside of race events — an athlete may be significantly better prepared than their race history alone suggests.
                  {" "}Injury history is not assessed; a history of injury at this distance, terrain type, or training load may affect the likelihood of completing the goal race in ways this report cannot identify.
                  {" "}Use this report as a structured starting point for a coaching conversation, not as a definitive assessment of an individual&apos;s readiness.
                </div>

                {/* Training plans callout — only when the race has a published slug */}
                {result.race.slug && (() => {
                  const raceUrl = `https://www.tortoiseendurance.com/feeder-races/${result.race.slug}`;
                  const qrSrc   = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(raceUrl)}`;
                  return (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "20px", alignItems: "center", background: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px", padding: "14px 18px", marginTop: "16px" }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#1e3a1e", marginBottom: "4px" }}>Training Plans Available for {result.race.name}</div>
                        <div style={{ fontSize: "10px", color: "#555", lineHeight: 1.5, marginBottom: "6px" }}>
                          We offer structured training plans tailored to this race — from 8-week programmes to full 6-month build cycles.
                          Scan the QR code to view available plans and start dates.
                        </div>
                        <div style={{ fontSize: "9px", color: "#aaa" }}>tortoiseendurance.com/feeder-races/{result.race.slug}</div>
                      </div>
                      <div style={{ textAlign: "center", flexShrink: 0 }}>
                        <img src={qrSrc} alt={`QR — ${raceUrl}`} width={80} height={80} style={{ display: "block", borderRadius: "4px" }} />
                        <div style={{ fontSize: "8px", color: "#aaa", marginTop: "3px" }}>Scan to view plans</div>
                      </div>
                    </div>
                  );
                })()}

                <PageNumber n={12} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 13 — Experience Context
          ═══════════════════════════════════════ */}
          {(expContextLoading || expContext) && (() => {
            const fmtH = (h: number) => {
              const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
              return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
            };
            const stl = (s: string) => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const tl  = (t: string) => t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

            const panelStyle: React.CSSProperties = {
              borderLeft: "4px solid #1e3a1e", borderRadius: "6px", padding: "14px 18px",
              background: "#fafafa", border: "1px solid #e8e8e8", borderLeftColor: "#1e3a1e",
              marginBottom: "10px",
            };
            const panelHead: React.CSSProperties = { fontSize: "10px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" };
            const insightLine: React.CSSProperties = { fontSize: "13.5px", fontWeight: 700, color: "#111", lineHeight: 1.35, marginBottom: "6px" };
            const detailLine: React.CSSProperties = { fontSize: "10.5px", color: "#666", lineHeight: 1.5 };
            const barTrack: React.CSSProperties = { height: "6px", background: "#e8e8e8", borderRadius: "3px", overflow: "hidden", marginTop: "6px", position: "relative" };

            const ec = expContext;
            const sc = ec?.scale;
            const te = ec?.time_estimate;
            const bc = ec?.biggest_climb;
            const om = ec?.opening_match;

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Experience Context</h2>
                <p style={{ margin: "0 0 18px", fontSize: "12px", color: "#888" }}>
                  How {reportAthlete?.profile.athlete_key.split(" ")[0]}&apos;s past races compare to the demands of {result.race.name}
                </p>

                {expContextLoading && !ec && (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "#aaa", fontSize: "13px" }}>Analysing race history…</div>
                )}

                {ec && (
                  <div>
                    {/* ── Scale ───────────────────────────────────── */}
                    {sc && (
                      <div style={{ ...panelStyle, borderLeftColor: "#c0392b" }}>
                        <div style={{ ...panelHead, color: "#c0392b" }}>Course Scale</div>
                        <div style={insightLine}>
                          {sc.distance_ratio >= 1.1
                            ? `This race is ${sc.distance_ratio}× longer and ${sc.ascent_ratio}× more climbing than ${sc.athlete_max_dist ? sc.athlete_max_dist.race_name : "your longest event"}.`
                            : sc.distance_ratio < 1
                            ? `At ${sc.goal_distance_km}km, this race is shorter than your longest (${sc.athlete_max_dist?.km}km). The ${sc.ascent_ratio}× ascent increase is the bigger step up.`
                            : `This race is a similar distance to your longest events — but ${sc.ascent_ratio}× more climbing.`}
                        </div>
                        <div style={detailLine}>
                          Your longest: {sc.athlete_max_dist ? `${sc.athlete_max_dist.race_name} (${sc.athlete_max_dist.km} km, ${sc.athlete_max_ascent?.m != null ? `${Math.round(sc.athlete_max_ascent.m).toLocaleString()}m ↑` : ""})` : "No data"}
                          {" · "}Goal race: {sc.goal_distance_km} km, {Math.round(sc.goal_ascent_m).toLocaleString()}m ↑
                        </div>
                        <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                          {[
                            { label: "Distance", goal: sc.goal_distance_km, best: sc.athlete_max_dist?.km ?? 0, unit: "km", ratio: sc.distance_ratio },
                            { label: "Ascent",   goal: sc.goal_ascent_m,    best: sc.athlete_max_ascent?.m ?? 0, unit: "m",  ratio: sc.ascent_ratio },
                            { label: "Effort",   goal: sc.goal_flat_equiv_km, best: sc.athlete_max_flat_equiv?.km ?? 0, unit: "flat-km", ratio: sc.flat_equiv_ratio },
                          ].map(({ label, goal, best, unit, ratio }) => (
                            <div key={label} style={{ flex: 1 }}>
                              <div style={{ fontSize: "9px", color: "#aaa", marginBottom: "2px" }}>{label}</div>
                              <div style={barTrack}>
                                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, (best / Math.max(goal, best)) * 100)}%`, background: "#78909c", borderRadius: "3px" }} />
                                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, (goal / Math.max(goal, best)) * 100)}%`, background: "#c0392b", borderRadius: "3px", opacity: 0.7 }} />
                              </div>
                              <div style={{ fontSize: "8.5px", color: "#888", marginTop: "2px" }}>
                                {ratio}× · {goal} {unit} vs {best || "—"} {unit} best
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* ── Biggest climb ────────────────────────────── */}
                    {bc && (
                      <div style={{ ...panelStyle, borderLeftColor: "#e65100" }}>
                        <div style={{ ...panelHead, color: "#e65100" }}>Biggest Challenge</div>
                        <div style={insightLine}>
                          {bc.athlete_best
                            ? `The main climb (km ${bc.goal.start_km}–${bc.goal.end_km}, ${Math.round(bc.goal.ascent_m).toLocaleString()}m ↑ over ${bc.goal.km} km at ${bc.goal.avg_grad}%) is ${bc.ratio}× bigger than any climb in your history.`
                            : `The main climb (${Math.round(bc.goal.ascent_m).toLocaleString()}m ↑ over ${bc.goal.km} km) — no comparable climb in your race history.`}
                        </div>
                        <div style={detailLine}>
                          {bc.athlete_best
                            ? `Your biggest recorded climb: ${bc.athlete_best.km} km, ${Math.round(bc.athlete_best.ascent_m).toLocaleString()}m ↑ (${bc.athlete_best.race_name}, ${bc.athlete_best.year})`
                            : "No climb data found in your race profiles."}
                        </div>
                        {bc.athlete_best && bc.ratio != null && (
                          <div style={barTrack}>
                            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, (bc.athlete_best.ascent_m / bc.goal.ascent_m) * 100)}%`, background: "#78909c", borderRadius: "3px" }} />
                            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", background: "#e65100", borderRadius: "3px", opacity: 0.25 }} />
                            <div style={{ fontSize: "8px", color: "#e65100", position: "absolute", right: "4px", top: "50%", transform: "translateY(-50%)", fontWeight: 700 }}>{bc.ratio}×</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Opening profile match ────────────────────── */}
                    {om && (
                      <div style={{ ...panelStyle, borderLeftColor: "#2e7d32" }}>
                        <div style={{ ...panelHead, color: "#2e7d32" }}>Opening Profile</div>
                        <div style={insightLine}>
                          {om.matched_race_name
                            ? `The opening ${om.goal_opening_km} km (${om.goal_climb_pct}% climbing, ${tl(om.goal_dominant_terrain)} terrain) is similar to how ${om.matched_race_name} (${om.matched_race_year}) started.`
                            : `The opening ${om.goal_opening_km} km — ${stl(om.goal_dominant_type)} on ${tl(om.goal_dominant_terrain)} terrain — has no close match in your race history.`}
                        </div>
                        <div style={detailLine}>
                          {om.matched_race_name
                            ? `Similarity score ${Math.round(om.similarity * 100)}% — dominant character: ${stl(om.goal_dominant_type)} on ${tl(om.goal_dominant_terrain)}.`
                            : `Dominant character: ${stl(om.goal_dominant_type)} on ${tl(om.goal_dominant_terrain)}. Prepare for an unfamiliar opening pace.`}
                        </div>
                      </div>
                    )}

                  </div>
                )}

                <PageNumber n={13} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              PAGE 14 — Suggested Next Steps
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const p = reportAthlete.profile;
            const allRaces    = filteredAthleteRaces;
            const finished    = allRaces.filter(r => r.result_status === "FINISHED" && r.finish_seconds);
            const byDist      = [...finished].filter(r => r.total_distance_km).sort((a, b) => (b.total_distance_km ?? 0) - (a.total_distance_km ?? 0));
            const byAscent    = [...finished].filter(r => r.total_ascent_m).sort((a, b) => (b.total_ascent_m ?? 0) - (a.total_ascent_m ?? 0));
            const lastYear    = p.last_result_year ?? new Date().getFullYear();
            const recentRaces = allRaces.filter(r => r.result_year >= lastYear - 1).slice(0, 10);
            const longestDist   = byDist[0]?.total_distance_km ?? 0;
            const highestAscent = byAscent[0]?.total_ascent_m ?? 0;

            // Terrain demand breakdown
            const raceTerrainsKm: Record<string, number> = {};
            for (const sec of result.terrain_sections) {
              raceTerrainsKm[sec.terrain] = (raceTerrainsKm[sec.terrain] ?? 0) + sec.distance_km;
            }
            const athleteExact: Record<string, number> = {};
            const athleteCross: Record<string, number> = {};
            for (const tp of reportAthlete.terrain_pairings ?? []) {
              athleteExact[`${tp.section_type}|${tp.terrain}`] = tp.total_km;
              athleteCross[tp.section_type] = (athleteCross[tp.section_type] ?? 0) + tp.total_km;
            }
            // Which terrain types have a gap (no matched experience at all)?
            const terrainGaps = new Set<string>();
            for (const sec of result.terrain_sections) {
              if (sec.distance_km < 0.1) continue;
              const key = `${sec.section_type}|${sec.terrain}`;
              const exact = athleteExact[key] ?? 0;
              if (exact < sec.distance_km * 0.5) terrainGaps.add(sec.terrain);
            }
            const hasGravel    = (raceTerrainsKm["gravel"] ?? 0) > 1;
            const hasTechnical = (raceTerrainsKm["technical_trail"] ?? 0) > 1;
            const hasSand      = (raceTerrainsKm["sand"] ?? 0) > 0.5;
            const gravelGap    = hasGravel    && terrainGaps.has("gravel");
            const technicalGap = hasTechnical && terrainGaps.has("technical_trail");
            const totalSteepDescentKm = result.terrain_sections.filter(s => s.section_type === "very_steep_descent" || s.section_type === "steep_descent").reduce((a, s) => a + s.distance_km, 0);

            interface NextStep {
              category: string;
              title: string;
              detail: string;
              priority: "high" | "medium" | "low";
            }
            const steps: NextStep[] = [];

            // ── Training Load ─────────────────────────────────────────────────
            if (longestDist > 0 && longestDist < totalKm * 0.6) {
              steps.push({
                category: "Training Load",
                title: "Build race-distance capacity",
                detail: `Your longest race on record is ${longestDist.toFixed(0)} km — the goal race is ${totalKm.toFixed(0)} km. Prioritise progressive long runs and back-to-back training days to accumulate race-relevant time on feet. You don't need to run ${totalKm.toFixed(0)} km in training, but your longest effort should reach at least ${Math.round(totalKm * 0.7)} km before race day.`,
                priority: "high",
              });
            } else if (longestDist > 0 && longestDist < totalKm * 0.8) {
              steps.push({
                category: "Training Load",
                title: "Close the final distance gap",
                detail: `Your longest race is ${longestDist.toFixed(0)} km. The goal race is ${totalKm.toFixed(0)} km — within reach, but leaving a meaningful volume gap. A long race or linked training day in the build-up will bridge this.`,
                priority: "medium",
              });
            }

            // ── Climbing strength ─────────────────────────────────────────────
            if (totalAscentM > 500 && highestAscent < totalAscentM * 0.5) {
              steps.push({
                category: "Strength & Conditioning",
                title: "Develop quad strength for climbing",
                detail: `The race requires ${Math.round(totalAscentM).toLocaleString()} m of ascent; your career best in a single race is ${Math.round(highestAscent).toLocaleString()} m. Sustained climbing demands muscular endurance that flat running does not develop. Add loaded step-ups, uphill repeats, and weighted split squats to your training.`,
                priority: "high",
              });
            } else if (totalAscentM > 1500) {
              steps.push({
                category: "Strength & Conditioning",
                title: "Maintain climbing-specific conditioning",
                detail: `With ${Math.round(totalAscentM).toLocaleString()} m of ascent on the course, uphill-specific conditioning should form a regular part of your training throughout the build. Don't let flat-running volume crowd it out.`,
                priority: "medium",
              });
            }

            // ── Downhill durability ───────────────────────────────────────────
            if (totalSteepDescentKm > 5) {
              steps.push({
                category: "Strength & Conditioning",
                title: "Eccentric loading for steep descents",
                detail: `The course has ${totalSteepDescentKm.toFixed(1)} km of steep descent. Braking forces on steep downhills produce eccentric muscle damage — particularly in the quads and calves — that flat training does not replicate. Add downhill running repeats, eccentric step-downs, and loaded single-leg heel drops to build resilience and reduce late-race damage.`,
                priority: totalSteepDescentKm > 12 ? "high" : "medium",
              });
            }

            // ── Ankle stability ───────────────────────────────────────────────
            if (gravelGap || technicalGap) {
              steps.push({
                category: "Strength & Conditioning",
                title: "Ankle stability for uneven terrain",
                detail: `The course includes ${[hasGravel && "gravel", hasTechnical && "technical/rocky terrain"].filter(Boolean).join(" and ")}, surfaces where lateral ankle stability is critical. Your race history shows limited experience here. Add single-leg balance progressions, resistance band eversion work, and prioritise trail over road in your build training.`,
                priority: "high",
              });
            } else if (hasGravel || hasTechnical) {
              steps.push({
                category: "Strength & Conditioning",
                title: "Maintain ankle stability work",
                detail: `The course includes ${[hasGravel && "gravel", hasTechnical && "rocky terrain"].filter(Boolean).join(" and ")}. You have relevant experience, but continue ankle stability exercises throughout your build to arrive at the start line robust rather than just capable.`,
                priority: "low",
              });
            }

            // ── Technical terrain exposure ────────────────────────────────────
            if (technicalGap) {
              steps.push({
                category: "Terrain Specificity",
                title: "Seek technical trail exposure",
                detail: `The race includes rocky, technical terrain — a surface with no direct precedent in your recent race history. Technical trail confidence requires specific exposure; you cannot develop it on road or groomed trail. Prioritise rough-surface training runs and at least one technical race or recce in the build-up.`,
                priority: "high",
              });
            }

            if (hasSand) {
              steps.push({
                category: "Terrain Specificity",
                title: "Practise on sand",
                detail: `The course includes sand sections. Sand running costs significantly more energy per kilometre than any other surface. If you have no sand experience, one or two beach runs before race day will calibrate your effort expectations and reduce the risk of overcooking those sections.`,
                priority: "medium",
              });
            }

            // ── Power hiking ──────────────────────────────────────────────────
            if (secs.length > 0 && runnablePct < 30) {
              steps.push({
                category: "Terrain Specificity",
                title: "Practise efficient power hiking",
                detail: `Only ${runnablePct}% of the course is near-flat — most athletes will hike the majority of the climbing. Efficient power hiking is a trainable skill. Practise uphill hiking at race effort specifically, focusing on arm drive and cadence rather than pace. Poor hiking technique burns disproportionate energy on races like this.`,
                priority: "medium",
              });
            }

            // ── Warm-up race ──────────────────────────────────────────────────
            if (recentRaces.length < 2) {
              steps.push({
                category: "Race Preparation",
                title: "Enter a warm-up race",
                detail: `Limited recent competitive form on record. A build-up race (ideally on similar terrain, 4–10 weeks out) will help calibrate nutrition, race management, and equipment well before the main event. Race-day skills fade without regular use.`,
                priority: "medium",
              });
            }

            // ── Effort-based pacing ───────────────────────────────────────────
            if (effortRatio > 1.4) {
              steps.push({
                category: "Race Preparation",
                title: "Train by effort, not pace",
                detail: `The course's average effort multiplier is ${effortRatio.toFixed(2)}× — pace is meaningless as a metric here. Train using perceived effort and heart rate zones. If you have never raced without a pace target, practise this discipline in your long training runs well before race day.`,
                priority: "medium",
              });
            }

            // ── Nutrition ─────────────────────────────────────────────────────
            if (totalKm > 50) {
              steps.push({
                category: "Race Preparation",
                title: "Build a fuelling strategy",
                detail: `For a ${totalKm.toFixed(0)} km race, active fuelling is non-negotiable — the majority of DNFs and performance collapses in long races are nutrition-related. Practise taking on calories at race pace in your long sessions. Target 60–90 g carbohydrate per hour once you are moving above 3–4 hours, adjusted for your tolerance.`,
                priority: totalKm > 80 ? "high" : "medium",
              });
            }

            // ── Footwear ──────────────────────────────────────────────────────
            if (hasTechnical || (hasGravel && gravelGap)) {
              steps.push({
                category: "Equipment",
                title: "Confirm footwear for the terrain",
                detail: `The course includes ${[hasTechnical && "technical rocky sections", hasGravel && "gravel tracks"].filter(Boolean).join(" and ")}. Ensure your race shoes provide ${hasTechnical ? "a rock plate and maximum grip" : "adequate grip on loose surfaces"}. Road or lightly lugged shoes are likely insufficient for parts of this course — test your footwear choice on comparable terrain before race day.`,
                priority: "medium",
              });
            }

            // ── Aid station gap rules ─────────────────────────────────────────
            if (result.aid_stations && result.aid_stations.length > 0) {
              const sorted_stations = [...result.aid_stations].sort((a, b) => a.km - b.km);
              const stops = [0, ...sorted_stations.map((s: AidStation) => s.km), totalKm];
              const gaps = stops.slice(1).map((km, i) => km - stops[i]);
              const maxGap = Math.max(...gaps);

              // Athlete's max experienced gap across all races with data
              const athleteMaxGap = Object.values(athleteAidData).reduce((best, stations) => {
                if (stations.length === 0) return best;
                const sortedS = [...stations].sort((a, b) => a.km - b.km);
                const gapList = sortedS.slice(1).map((s, i) => s.km - sortedS[i].km);
                return Math.max(best, ...gapList);
              }, 0);

              if (maxGap > 15) {
                const isNewTerritory = athleteMaxGap === 0 || maxGap > athleteMaxGap * 1.2;
                steps.push({
                  category: "Race Preparation",
                  title: "Carry nutrition for long unsupported stretches",
                  detail: `The longest gap between aid stations on the course is ${maxGap.toFixed(1)} km${isNewTerritory && athleteMaxGap > 0 ? ` — your longest previously recorded gap is ${athleteMaxGap.toFixed(1)} km, so this is new territory` : ""}. ${maxGap > 20 ? "You will need to carry water and calories to cover this stretch safely." : "Take a gel or snack at the preceding station to cover this gap comfortably."} Practise carrying nutrition at race pace in your long training runs before the event.`,
                  priority: maxGap > 20 ? "high" : "medium",
                });
              }

              const hasNoFood = !sorted_stations.some((s: AidStation) => s.food);
              if (hasNoFood) {
                steps.push({
                  category: "Race Preparation",
                  title: "No food provision at aid stations — carry all nutrition",
                  detail: `None of the recorded aid stations for this race offer food. You will need to carry your full race nutrition from the start, or rely on crew support if the race permits it. Calculate your carbohydrate needs (60–90 g/hr above 3 hours) and test your carrying strategy in training.`,
                  priority: "high",
                });
              }

              const hasNoDropBags = !sorted_stations.some((s: AidStation) => s.dropBags);
              if (hasNoDropBags && totalKm > 50) {
                steps.push({
                  category: "Race Preparation",
                  title: "No drop bag support — practise self-sufficiency",
                  detail: `This race has no drop bag stations. For a ${totalKm.toFixed(0)} km event, that means everything you need must either be carried from the start or sourced at aid stations. Practise your full race kit and nutrition load in a long training day before the event.`,
                  priority: "medium",
                });
              }
            }

            if (steps.length === 0) return null;

            const categories = [...new Set(steps.map(s => s.category))];
            const priorityOrder: Record<NextStep["priority"], number> = { high: 0, medium: 1, low: 2 };
            const sorted = [...steps].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

            const priorityStyle: Record<NextStep["priority"], { dot: string; label: string; bg: string; border: string }> = {
              high:   { dot: "#c0392b", label: "Priority", bg: "#fce4ec", border: "#ffcdd2" },
              medium: { dot: "#e65100", label: "Recommended", bg: "#fff3e0", border: "#ffe0b2" },
              low:    { dot: "#1565c0", label: "Maintenance", bg: "#e3f2fd", border: "#bbdefb" },
            };

            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Suggested Next Steps</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Suggested Next Steps</h2>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                  Specific preparation actions derived from the gap analysis and course demands
                </p>

                {/* Category legend */}
                <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                  {(["high", "medium", "low"] as const).filter(pri => steps.some(s => s.priority === pri)).map(pri => (
                    <div key={pri} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: priorityStyle[pri].dot, flexShrink: 0 }} />
                      <span style={{ fontSize: "9px", color: "#555", fontWeight: 600 }}>{priorityStyle[pri].label}</span>
                    </div>
                  ))}
                </div>

                {/* Steps grouped by category */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {categories.map(cat => {
                    const catSteps = sorted.filter(s => s.category === cat);
                    return (
                      <div key={cat}>
                        <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px", borderBottom: "1px solid #e0e0e0", paddingBottom: "3px" }}>{cat}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          {catSteps.map((step, i) => {
                            const ps = priorityStyle[step.priority];
                            return (
                              <div key={i} style={{ display: "flex", gap: "10px", padding: "8px 10px", background: ps.bg, border: `1px solid ${ps.border}`, borderRadius: "6px", borderLeft: `3px solid ${ps.dot}` }}>
                                <div style={{ flexShrink: 0, paddingTop: "2px" }}>
                                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: ps.dot }} />
                                </div>
                                <div>
                                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a1e", marginBottom: "3px" }}>{step.title}</div>
                                  <div style={{ fontSize: "9.5px", color: "#444", lineHeight: 1.5 }}>{step.detail}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #eee" }}>
                  <p style={{ fontSize: "8.5px", color: "#bbb", margin: 0, lineHeight: 1.5 }}>
                    These recommendations are generated from race profile data and athlete history. They are a starting point for coach and athlete discussion, not a complete training plan.
                  </p>
                </div>

                <PageNumber n={14} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              APPENDIX A — Complete Race History
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const allRaces = [...filteredAthleteRaces].sort(
              (a, b) => (b.result_year ?? 0) - (a.result_year ?? 0) || a.race_name.localeCompare(b.race_name)
            );
            const formatTime = (secs: number): string => {
              const h = Math.floor(secs / 3600);
              const m = Math.floor((secs % 3600) / 60);
              return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
            };
            return (
              <div style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Complete Race History</div>
                  </div>
                </div>

                <div style={{ marginBottom: "4px", display: "flex", alignItems: "baseline", gap: "10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em" }}>Appendix A</div>
                  <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Complete Race History</h2>
                </div>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                  All {allRaces.length} race{allRaces.length !== 1 ? "s" : ""} on record for {reportAthlete.profile.athlete_key ?? "this athlete"}
                </p>

                {allRaces.length === 0 ? (
                  <div style={{ padding: "24px", border: "1px dashed #d1d5db", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: "13px", color: "#9ca3af" }}>No race history on record.</div>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8.5px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #1e3a1e", background: "#f9fafb" }}>
                        {["Year", "Race", "Dist (km)", "Ascent (m)", "Time", "Overall", "Category", "Status"].map(h => (
                          <th key={h} style={{ padding: "4px 6px", textAlign: h === "Race" ? "left" : "right", fontSize: "7.5px", fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allRaces.map((r, i) => {
                        const finished = r.result_status === "FINISHED";
                        return (
                          <tr key={r.race_id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#888", whiteSpace: "nowrap" }}>{r.result_year}</td>
                            <td style={{ padding: "3px 6px", color: "#1e3a1e", fontWeight: 500 }}>{r.race_name}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#444" }}>{r.total_distance_km != null ? r.total_distance_km.toFixed(0) : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#444" }}>{r.total_ascent_m != null ? Math.round(r.total_ascent_m).toLocaleString() : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: finished ? "#1e3a1e" : "#888", whiteSpace: "nowrap" }}>{r.finish_seconds != null ? formatTime(r.finish_seconds) : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#555" }}>{r.position != null ? `${r.position}${r.total_finishers != null ? `/${r.total_finishers}` : ""}` : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#555" }}>{r.cat_position != null ? `${r.cat_position}${r.cat_finishers != null ? `/${r.cat_finishers}` : ""}` : "—"}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <span style={{ fontSize: "7.5px", fontWeight: 700, color: finished ? "#2e7d32" : "#888", background: finished ? "#e8f5e9" : "#f3f4f6", borderRadius: 3, padding: "1px 4px" }}>
                                {r.result_status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <PageNumber n={15} />
              </div>
            );
          })()}

        </div>
      )}

      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .no-print { display: none !important; }
          .app-sidebar { display: none !important; }
          .app-topbar  { display: none !important; }
          body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .app-content { margin: 0 !important; padding: 0 !important; }
          .race-strategy-canvas { background: #fff !important; padding: 0 !important; gap: 0 !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </main>
  );
}

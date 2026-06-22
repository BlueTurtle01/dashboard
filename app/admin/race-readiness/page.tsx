"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { savePlanVersion } from "./actions";
import type { WeatherDayRecord } from "@/lib/race-analysis/open-meteo";
import {
  calculatePacingComplexityIndex,
  type PacingComplexityComponents,
} from "@/lib/race-analysis/pacing-complexity";

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
  pacing_complexity_index: number | null;
  pacing_complexity_components: PacingComplexityComponents | null;
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
interface ExpContextBiggestDescent {
  goal: { km: number; descent_m: number; avg_grad: number; start_km: number; end_km: number };
  athlete_best: { km: number; descent_m: number; race_name: string; year: number } | null;
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
  biggest_descent: ExpContextBiggestDescent | null;
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
interface AssessmentTest {
  id: string;
  name: string;
  description: string | null;
  aim: string | null;
  instructions: string[];
  target_muscles: string[];
  notes: string | null;
  category: "strength" | "imbalance" | "flexibility" | null;
  what_to_record: string | null;
  rating_uphill: number | null;
  rating_downhill: number | null;
  rating_technical: number | null;
  rating_gravel_stability: number | null;
  rating_general_asymmetry: number | null;
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

/* Athlete search combobox — client-side filter over preloaded names, with API fallback
   for athletes only in race_results (not in als_athlete_profiles) */
function AthleteSearchCombobox({ athletes, onSelect, selectedKey }: {
  athletes: { athlete_key: string; race_count: number }[];
  onSelect: (key: string) => void;
  selectedKey: string;
}) {
  const [query, setQuery]         = useState(selectedKey);
  const [open, setOpen]           = useState(false);
  const [apiHits, setApiHits]     = useState<{ athlete_key: string; race_count: number }[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedKey && !query) setQuery(selectedKey);
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (athletes.length > 0 && inputRef.current === document.activeElement) setOpen(true);
  }, [athletes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const localFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return athletes.slice(0, 30);
    return athletes.filter(a => a.athlete_key.toLowerCase().includes(q)).slice(0, 30);
  }, [query, athletes]);

  // Fall back to API when local list returns sparse results (covers race_results-only athletes)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setApiHits([]); return; }
    if (localFiltered.length >= 5) { setApiHits([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(q)}&limit=30`);
        if (res.ok) {
          const json = await res.json() as { athletes: { athlete_key: string; race_count: number }[] };
          const localKeys = new Set(athletes.map(a => a.athlete_key));
          setApiHits((json.athletes ?? []).filter(a => !localKeys.has(a.athlete_key)));
        }
      } catch { /* ignore */ }
    }, 300);
  }, [query, localFiltered.length, athletes]);

  const displayed = useMemo(() => {
    const combined = [...localFiltered, ...apiHits];
    return combined.slice(0, 30);
  }, [localFiltered, apiHits]);

  function select(a: { athlete_key: string }) {
    setQuery(a.athlete_key);
    setOpen(false);
    setApiHits([]);
    onSelect(a.athlete_key);
  }

  const inputS: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none", width: "260px" };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={athletes.length === 0 ? "Loading athletes…" : "Search athlete name…"}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        style={inputS}
      />
      {open && displayed.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "320px", maxHeight: "320px", overflowY: "auto", marginTop: "4px" }}>
          {displayed.map(a => (
            <button
              key={a.athlete_key}
              type="button"
              onClick={() => select(a)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#111" }}>{a.athlete_key}</div>
              <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                {a.race_count} race{a.race_count !== 1 ? "s" : ""}
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
    <div style={{ background: "#fafafa", border: `1px solid #e0e0e0`, borderLeft: `3px solid ${accent}`, borderRadius: "6px", padding: "10px 12px", breakInside: "avoid", pageBreakInside: "avoid" }}>
      <p style={{ margin: "0 0 5px", fontSize: "11px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</p>
      <div style={{ fontSize: "11px", color: "#444", lineHeight: "1.5" }}>{children}</div>
    </div>
  );
}

/* Page number */
function PageNumber({ n }: { n: number }) {
  return <div className="rr-page-number" style={{ textAlign: "right", fontSize: "11px", color: "#aaa", marginTop: "12px" }}>{n}</div>;
}

/* ══════════════════════════════════════════════════════════════════
   STYLE CONSTANTS
══════════════════════════════════════════════════════════════════ */
const a4Page: React.CSSProperties = { width: "794px", minHeight: "1123px", background: "#fff", padding: "40px 48px 52px", boxSizing: "border-box", position: "relative", marginBottom: "24px" };
const canvas: React.CSSProperties = { background: "#6b6b6b", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" };
const printHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #1e3a1e", paddingBottom: "12px", marginBottom: "18px", breakAfter: "avoid", pageBreakAfter: "avoid" };
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
  const [athleteNames, setAthleteNames]   = useState<{ athlete_key: string; race_count: number }[]>([]);
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
  const [assessmentTests, setAssessmentTests]   = useState<AssessmentTest[]>([]);
  const [versionModal, setVersionModal]   = useState(false);
  const [versionName, setVersionName]     = useState("");
  const [versionNotes, setVersionNotes]   = useState("");
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionResult, setVersionResult] = useState<{ version: number; fileCopied: boolean } | null>(null);

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

  // Load athlete names only on mount — explicit range overrides PostgREST's default row cap
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("als_athlete_profiles")
        .select("athlete_key, race_count")
        .order("race_count", { ascending: false })
        .range(0, 9999);
      if (data) setAthleteNames(data as { athlete_key: string; race_count: number }[]);
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load assessment tests once on mount
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("assessment_tests")
        .select("id, name, description, aim, instructions, target_muscles, notes, category, what_to_record, rating_uphill, rating_downhill, rating_technical, rating_gravel_stability, rating_general_asymmetry")
        .order("category, name");
      if (data) setAssessmentTests(data as AssessmentTest[]);
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

  function handleExportPdf() { window.print(); }

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

  // Full pacing complexity index for goal race (uses flat_equivalent_km + start_km)
  const goalPacingComplexity = secs.length >= 3
    ? calculatePacingComplexityIndex(secs, totalKm, totalFlatEq)
    : null;

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
    const pct = Math.round((halfwayAscent / running) * 100);
    return Number.isFinite(pct) ? pct : null;
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
            athletes={athleteNames}
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
        {result && <button type="button" onClick={handleExportPdf} style={printBtn}>Export to PDF</button>}
        <button
          type="button"
          className="no-print"
          onClick={() => { setVersionModal(true); setVersionResult(null); setVersionName(""); setVersionNotes(""); }}
          style={{ padding: "8px 16px", background: "#f0f9f0", color: "#1e3a1e", border: "1px solid #a7c4a7", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", alignSelf: "flex-end" }}
        >
          Save version
        </button>

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
          <style dangerouslySetInnerHTML={{ __html: `
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap');
            @media print {
              * { font-family: 'Arial Unicode MS', 'Noto Sans', 'Segoe UI', Arial, Helvetica, sans-serif !important; }
              @page { margin: 15mm 20mm; }
              body { margin: 0; }
              .race-strategy-canvas { background: transparent !important; display: block !important; padding: 0 !important; gap: 0 !important; }
              .rr-page {
                width: auto !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
                position: static !important;
                margin-bottom: 0 !important;
                padding: 40px 48px 40px !important;
                break-before: page !important;
                page-break-before: always !important;
                break-inside: auto !important;
                page-break-inside: auto !important;
              }
              .rr-page-first {
                break-before: auto !important;
                page-break-before: auto !important;
              }
              .rr-page table {
                break-inside: auto !important;
                page-break-inside: auto !important;
              }
              .rr-page thead {
                display: table-header-group;
              }
              .rr-page tfoot {
                display: table-footer-group;
              }
              .rr-page tr,
              .rr-page th,
              .rr-page td {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .rr-page h2,
              .rr-page p:first-child,
              .rr-page-number {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .rr-page-number {
                break-before: avoid !important;
                page-break-before: avoid !important;
              }
              .rr-card-stack {
                display: block !important;
              }
              .rr-card-stack > * {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
                margin-bottom: 8px !important;
              }
              .rr-card-stack > *:last-child {
                margin-bottom: 0 !important;
              }
            }
          ` }} />


          {/* ═══════════════════════════════════════
              TABLE OF CONTENTS
          ═══════════════════════════════════════ */}
          <div className="rr-page rr-page-first" style={a4Page}>
            <div style={printHeader}>
              <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result?.race.name ?? "Race Readiness"}</div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness Report</div>
              </div>
            </div>
            <h1 style={{ margin: "0 0 4px", fontSize: "26px", fontWeight: 800, color: "#1e3a1e" }}>Race Readiness Report</h1>
            <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#888" }}>
              {reportAthlete ? reportAthlete.profile.athlete_key : "Athlete"}{result ? ` · ${result.race.name}` : ""}
            </p>

            <div style={{ borderLeft: "3px solid #e8e8e8", paddingLeft: "12px", marginBottom: "20px" }}>
              <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#555", fontStyle: "italic" }}>
                This report covers one theme at a time - distance, then vertical load, then terrain, then pacing, then logistics. Each section is self-contained. Read it through once, then return to whichever theme your preparation needs most.
              </p>
            </div>

            <div style={{ fontSize: "9px", fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "5px" }}>Theme 1 - Distance</div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
              <strong style={{ color: "#1e3a1e" }}>Distance &amp; Time-on-Feet Readiness</strong>{" "}compares your longest race against the target, adjusts for the extra energy cost of climbing, and estimates your finish window. The question is not just whether you have run far enough - it is whether you have spent enough time on your feet under fatigue.
            </p>

            <div style={{ fontSize: "9px", fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "16px", marginBottom: "5px" }}>Theme 2 - Vertical load</div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
              <strong style={{ color: "#1e3a1e" }}>Vertical Load Readiness</strong>{" "}is often where the decisive gap lives. It compares the total ascent this race demands against your career best, examines descent load separately - steep downhill damages muscles that climbing does not - and puts the biggest single climb on the course against the biggest you have tackled. If this section shows red, it is the primary preparation priority.
            </p>

            <div style={{ fontSize: "9px", fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "16px", marginBottom: "5px" }}>Theme 3 - Terrain</div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
              Two pages cover terrain.{" "}<strong style={{ color: "#1e3a1e" }}>Terrain Readiness</strong>{" "}gives the headline: which surface types the race uses and how much experience you have on each.{" "}<strong style={{ color: "#1e3a1e" }}>Terrain Gap Analysis</strong>{" "}goes deeper, listing every specific terrain type with the exact kilometres you have accumulated. Terrain gaps show up as race-day surprise - sections feeling harder than expected because your body has not adapted to that gradient and surface together.
            </p>

            <div style={{ fontSize: "9px", fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "16px", marginBottom: "5px" }}>Theme 4 - Pacing</div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
              <strong style={{ color: "#1e3a1e" }}>Pacing &amp; Effort Management</strong>{" "}shows how effort is distributed across the course: where the major climbs fall, how much of the course is genuinely steep, and what each kilometre costs relative to flat running. These pages answer the question most people ask too late - where to hold back, and where it is safe to push. A third page then compares this course&apos;s{" "}<strong style={{ color: "#1e3a1e" }}>Pacing Complexity Index</strong>{" "}- scored 0-100 using effort variability, gradient transitions, and recovery availability - against the athlete&apos;s previous races, to show whether the pacing challenge is new territory or familiar ground.
            </p>

            <div style={{ fontSize: "9px", fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "16px", marginBottom: "5px" }}>Theme 5 - Aid &amp; logistics</div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
              <strong style={{ color: "#1e3a1e" }}>Aid Station &amp; Logistics</strong>{" "}maps the support points, gaps between them, and drop bag availability. Logistics failures are rarely about fitness - this section flags where the risk lies.
            </p>

            <div style={{ fontSize: "9px", fontWeight: 700, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "16px", marginBottom: "5px" }}>Theme 6 - Physical readiness</div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
              <strong style={{ color: "#1e3a1e" }}>Physical Readiness Checks</strong>{" "}contains what race data cannot generate: self-reflection questions only you can answer, and targeted physical tests derived from the specific gaps this report identifies. They surface imbalances and asymmetries that accumulate quietly and show up loudly in a long mountain race.
            </p>

            <div style={{ borderTop: "1px solid #f0f0f0", marginTop: "16px", paddingTop: "14px" }}>
              <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.75, color: "#333" }}>
                The final pages are for action.{" "}<strong style={{ color: "#1e3a1e" }}>Suggested Preparation Priorities</strong>{" "}orders specific steps by urgency across training, strength, terrain, race prep, and equipment.{" "}<strong style={{ color: "#1e3a1e" }}>Suggested Preparation Races</strong>{" "}identifies nearby events ranked by how well each one closes your specific gaps.
              </p>
            </div>
          </div>

          {/* ═══════════════════════════════════════
              1 — Executive Readiness Verdict  (p1)
          ═══════════════════════════════════════ */}
          {result && reportAthlete && expContext && (() => {
            type ReadinessLevel = "strong" | "moderate" | "major_gap" | "unknown";

            const firstName  = reportAthlete.profile.athlete_key.split(" ")[0];
            const sc         = expContext.scale;
            const goalDist   = result.race.total_distance_km;
            const goalAscent = result.race.total_ascent_m;
            const goalDescent= result.race.total_descent_m;

            const athDist   = sc?.athlete_max_dist?.km ?? 0;
            const athAscent = sc?.athlete_max_ascent?.m ?? reportAthlete.profile.max_ascent_m ?? 0;
            const athFlatEq = sc?.athlete_max_flat_equiv?.km ?? reportAthlete.profile.max_flat_equiv_km ?? 0;
            const goalFlatEq= sc?.goal_flat_equiv_km ?? 0;

            const levelColor = (l: ReadinessLevel) =>
              l === "strong" ? "#2e7d32" : l === "moderate" ? "#f57c00" : l === "major_gap" ? "#c0392b" : "#9e9e9e";

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

            const techRows      = summaryGapRows.filter(r => r.terrain === "technical_trail");
            const techDemandKm  = techRows.reduce((s, r) => s + r.km, 0);
            const techCoveredKm = techRows.reduce((s, r) => s + r.exactKm, 0);
            const technicalStatus: ReadinessLevel =
              techDemandKm === 0 ? "unknown" :
              techCoveredKm / techDemandKm >= 0.7 ? "strong" :
              techCoveredKm / techDemandKm >= 0.4 ? "moderate" : "major_gap";

            const aidStnsV = result.aid_stations ?? [];
            const aidSortedV = [...aidStnsV].sort((a, b) => a.km - b.km);
            const aidStopsV  = [0, ...aidSortedV.map(s => s.km), goalDist];
            const aidGapsV   = aidStopsV.slice(1).map((km, i) => km - aidStopsV[i]);
            const aidMaxGapV = aidGapsV.length > 1 ? Math.max(...aidGapsV) : 0;
            const aidStatus: ReadinessLevel =
              aidStnsV.length === 0 ? "unknown" :
              aidMaxGapV <= 15 ? "strong" :
              aidMaxGapV <= 25 ? "moderate" : "major_gap";

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

            let strengthText =
              distStatus === "strong" && sc?.athlete_max_dist
                ? `${firstName} has already proven the ability to complete ultra-distance events longer than ${result.race.name}. ` +
                  `The longest recorded race — ${sc.athlete_max_dist.race_name} (${sc.athlete_max_dist.km.toFixed(0)} km, ${sc.athlete_max_dist.year}) — ` +
                  `shows basic endurance and willingness to stay on course for a long time are not in question.`
              : flatStatus === "strong" && sc?.athlete_max_flat_equiv
                ? `${firstName}'s total effort capacity is strong. A best effort-adjusted load of ${sc.athlete_max_flat_equiv.km.toFixed(1)} km ` +
                  `(${sc.athlete_max_flat_equiv.race_name}, ${sc.athlete_max_flat_equiv.year}) shows the engine is there for sustained effort.`
              : metCount > 0
                ? `${firstName} has covered ${metCount} of ${summaryGapRows.length} terrain-demand types at or above race-ready levels. ` +
                  `That breadth of proven experience across conditions is a genuine asset.`
                : `Completing multiple ultra-distance events demonstrates commitment and the ability to manage race-day adversity over extended periods.`;

            const zeroRows = summaryGapRows.filter(r => r.status === "none");
            const technicalZeroRows = summaryGapRows.filter(r =>
              ["technical_trail", "fell"].includes(r.terrain) && r.status === "none"
            );
            const moderateStatuses = [ascentStatus, terrainStatus, descentStatus, flatStatus]
              .filter((s): s is "moderate" => s === "moderate");
            let limiterText =
              ascentStatus === "major_gap"
                ? (() => {
                    const pct = goalAscent > 0 && athAscent > 0 ? Math.round((athAscent / goalAscent) * 100) : null;
                    return (
                      `Vertical load is the main limiter. ${result.race.name} includes ${goalAscent > 0 ? Math.round(goalAscent).toLocaleString() : "—"} m of ascent, ` +
                      `compared with ${firstName}'s best recorded ascent of ${athAscent > 0 ? Math.round(athAscent).toLocaleString() : "unknown"} m` +
                      `${sc?.athlete_max_ascent ? ` (${sc.athlete_max_ascent.race_name}, ${sc.athlete_max_ascent.year})` : ""}. ` +
                      `${pct != null ? `That is ${pct}% of the target race demand.` : ""}`
                    );
                  })()
              : terrainStatus === "major_gap"
                ? `Trail and fell-specific experience is the key gap. The target race is predominantly off-road mountain terrain, and the majority of matched race history does not reflect equivalent trail or fell conditions.`
              : descentStatus === "major_gap"
                ? `Descending volume is the main limiter. The race includes ${goalDescent > 0 ? Math.round(goalDescent).toLocaleString() : "—"} m of descent, with limited proven experience of equivalent descent loads.`
              : flatStatus === "major_gap"
                ? `Total effort duration is the key gap. The race effort load exceeds anything clearly on record and will require sustained output at a level not yet fully replicated.`
              : technicalZeroRows.length > 0 && zeroRows.length >= 3
                ? `Primary limiter: specificity, not volume. ${firstName} has the endurance for this race — the gap is in terrain-specific preparation. The race contains ${technicalZeroRows.map(r => r.terrain.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")).join(", ")} terrain with no equivalent in the confirmed race record.`
              : moderateStatuses.length >= 2
                ? `No single critical limiter, but ${moderateStatuses.length} moderate preparation gaps are present. The priority is to target the specific terrain and conditions the course demands in training, rather than accumulating general volume.`
                : `No significant preparation gaps identified across distance, ascent, descent, or terrain specificity. Focus on a disciplined taper and race-day nutrition execution.`;

            const risks: string[] = [];
            if (ascentStatus === "major_gap") risks.push("Repeated steep climbs causing unsustainable effort spikes — no equivalent training stimulus visible in race history.");
            if (descentStatus === "major_gap" || descentStatus === "moderate") risks.push("Steep descending creating quad fatigue and elevated injury risk over the second half of the course.");
            if (terrainStatus === "major_gap") risks.push("Limited trail and fell-specific experience — technical terrain adds time, effort, and navigational risk.");
            if (distStatus === "strong" && (ascentStatus === "major_gap" || terrainStatus === "major_gap")) risks.push("Effort trap — the distance alone may feel manageable, masking the much larger vertical and terrain demands.");
            if (risks.length === 0) {
              risks.push("Maintain race-specific training quality and a disciplined taper approach.");
              risks.push("Race-day nutrition, hydration, and kit management will be the key variables.");
            }

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

            const panelCard = (accent: string, bg: string): React.CSSProperties => ({
              background: bg, border: `1px solid ${accent}40`,
              borderLeft: `4px solid ${accent}`, borderRadius: "6px", padding: "14px 16px",
            });
            const panelHead2: React.CSSProperties = {
              fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.07em", marginBottom: "6px",
            };

            // Top 3 priorities for mini-table
            const priorityItems: { dim: string; status: ReadinessLevel; action: string }[] = [];
            if (ascentStatus === "major_gap" || ascentStatus === "moderate")
              priorityItems.push({ dim: "Vertical load", status: ascentStatus, action: ascentStatus === "major_gap" ? "Mountain-specific climb blocks required" : "Step up sustained climbing volume" });
            if (terrainStatus === "major_gap" || terrainStatus === "moderate")
              priorityItems.push({ dim: "Terrain specificity", status: terrainStatus, action: terrainStatus === "major_gap" ? "Trail/fell experience urgently needed" : "Increase off-road training ratio" });
            if (descentStatus === "major_gap" || descentStatus === "moderate")
              priorityItems.push({ dim: "Descent durability", status: descentStatus, action: descentStatus === "major_gap" ? "Eccentric loading + descent repeats" : "Add downhill running to build programme" });
            if (distStatus === "major_gap" || distStatus === "moderate")
              priorityItems.push({ dim: "Race distance", status: distStatus, action: distStatus === "major_gap" ? "Progressive long-run block to ≥70% of race distance" : "One more long race or linked training day" });
            if (flatStatus === "major_gap" || flatStatus === "moderate")
              priorityItems.push({ dim: "Effort load (flat-equiv.)", status: flatStatus, action: "Build total effort-adjusted training load" });
            if (technicalStatus === "major_gap" || technicalStatus === "moderate")
              priorityItems.push({ dim: "Technical terrain", status: technicalStatus, action: technicalStatus === "major_gap" ? "Specific technical trail exposure required before race day" : "Increase technical trail running in training" });
            if (aidStatus === "major_gap" || aidStatus === "moderate")
              priorityItems.push({ dim: "Aid station gaps", status: aidStatus, action: aidStatus === "major_gap" ? "Practice carrying fluids and nutrition for 25+ km unsupported" : "Plan nutrition and hydration for gaps up to 25 km" });
            const top3 = priorityItems.slice(0, 3);

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Executive Readiness Verdict</h2>
                <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#888" }}>
                  Overall verdict · Main strength · Primary limiter · Top preparation priorities
                </p>

                <div style={{
                  background: "#f5f5f5", border: "1px solid #e0e0e0",
                  borderLeft: "4px solid #546e7a", borderRadius: "6px",
                  padding: "10px 16px", marginBottom: "14px",
                }}>
                  <div style={{ fontSize: "9.5px", color: "#555", lineHeight: 1.6 }}>
                    <strong style={{ color: "#546e7a", textTransform: "uppercase", fontSize: "9px", letterSpacing: "0.05em" }}>What &ldquo;race ready&rdquo; means here: </strong>
                    You have the physical foundation to complete this race safely without being overwhelmed by its specific demands. It does not mean you will win or that preparation is complete.
                    Where gaps exist, this report identifies them specifically.
                  </div>
                </div>

                <div style={{
                  background: `${verdictColor}0c`, border: `1px solid ${verdictColor}35`,
                  borderLeft: `6px solid ${verdictColor}`, borderRadius: "6px",
                  padding: "12px 16px", marginBottom: "14px",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "5px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: verdictColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>Overall Verdict</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: verdictColor }}>{overallLabel}</div>
                  </div>
                  <div style={{ fontSize: "11px", color: "#333", lineHeight: 1.5 }}>{verdictText}</div>
                </div>

                <p style={{ ...sectionLabel, marginBottom: "7px" }}>Strengths &amp; Limiters</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                  <div style={panelCard("#2e7d32", "#f9fffe")}>
                    <div style={{ ...panelHead2, color: "#2e7d32" }}>Biggest Strength</div>
                    <div style={{ fontSize: "10.5px", color: "#333", lineHeight: 1.5 }}>{strengthText}</div>
                  </div>
                  <div style={panelCard(verdictColor, "#fffaf9")}>
                    <div style={{ ...panelHead2, color: verdictColor }}>Biggest Limiter</div>
                    <div style={{ fontSize: "10.5px", color: "#333", lineHeight: 1.5 }}>{limiterText}</div>
                  </div>
                </div>

                <p style={{ ...sectionLabel, marginBottom: "7px" }}>Race-Day Risk Factors</p>
                <div style={{ ...panelCard("#e65100", "#fffaf5"), marginBottom: "14px" }}>
                  <div style={{ ...panelHead2, color: "#e65100" }}>Main Race-Day Risks</div>
                  <ul style={{ margin: 0, paddingLeft: "16px" }}>
                    {risks.map((r, i) => (
                      <li key={i} style={{ fontSize: "10px", color: "#444", lineHeight: 1.45, marginBottom: i < risks.length - 1 ? "3px" : 0 }}>{r}</li>
                    ))}
                  </ul>
                </div>

                {top3.length > 0 && (
                  <>
                    <p style={{ ...sectionLabel, marginBottom: "7px" }}>Top Preparation Priorities</p>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
                      <thead>
                        <tr style={{ background: "#f9f9f9" }}>
                          <th style={thStyle}>Priority area</th>
                          <th style={{ ...thStyle, width: "80px" }}>Status</th>
                          <th style={thStyle}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top3.map((item, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{item.dim}</td>
                            <td style={{ ...tdStyle }}>
                              <span style={{ fontSize: "9.5px", fontWeight: 700, color: levelColor(item.status), background: `${levelColor(item.status)}15`, padding: "1px 6px", borderRadius: "3px" }}>
                                {item.status === "major_gap" ? "Major gap" : item.status === "moderate" ? "Moderate" : item.status === "strong" ? "Strong" : "Unknown"}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, fontSize: "10px" }}>{item.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                <div style={{ ...panelCard("#1565c0", "#f0f4ff"), marginBottom: "8px" }}>
                  <div style={{ ...panelHead2, color: "#1565c0" }}>Recommended Next Step</div>
                  <div style={{ fontSize: "10.5px", color: "#333", lineHeight: 1.5 }}>{nextStepText}</div>
                  {feederRace && (
                    <div style={{ marginTop: "5px", fontSize: "10px", color: "#1565c0", fontWeight: 600 }}>
                      Suitable preparation race: {feederRace.race_name}
                      {feederRace.gap_fill_score > 0 ? ` (${Math.round(feederRace.gap_fill_score)}% demand coverage)` : ""}
                    </div>
                  )}
                </div>

                <div style={{ paddingTop: "8px", borderTop: "1px solid #eee" }}>
                  <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: 1.5 }}>
                    Readiness assessment is based on available race-history data, course profile, terrain classification, and modelled race demands. It is not a guarantee of performance or safety.
                  </p>
                </div>

                <PageNumber n={1} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              1b — Readiness Scorecard  (p2)
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
            const flatStatus3: ReadinessLevel =
              athFlatEq3 === 0 || goalFlatEq3 === 0 ? "unknown" :
              athFlatEq3 >= goalFlatEq3 * 0.8  ? "strong" :
              athFlatEq3 >= goalFlatEq3 * 0.55 ? "moderate" : "major_gap";

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

            const descentRows3    = gapRows3.filter(r => r.section_type.includes("descent"));
            const descentDemand3  = descentRows3.reduce((s, r) => s + r.km, 0);
            const descentCovered3 = descentRows3.reduce((s, r) => s + r.exactKm, 0);
            const descentStatus3: ReadinessLevel =
              descentDemand3 === 0 ? "unknown" :
              descentCovered3 / descentDemand3 >= 0.8 ? "strong" :
              descentCovered3 / descentDemand3 >= 0.5 ? "moderate" : "major_gap";

            const trailRows3   = gapRows3.filter(r => ["trail","technical_trail","fell"].includes(r.terrain));
            const trailDemand3 = trailRows3.reduce((s, r) => s + r.km, 0);
            const trailCovered3= trailRows3.reduce((s, r) => s + r.exactKm, 0);
            const terrainStatus3: ReadinessLevel =
              trailDemand3 === 0 ? "unknown" :
              trailCovered3 / trailDemand3 >= 0.8 ? "strong" :
              trailCovered3 / trailDemand3 >= 0.5 ? "moderate" : "major_gap";

            const techRows3   = gapRows3.filter(r => r.terrain === "technical_trail");
            const techDemand3 = techRows3.reduce((s, r) => s + r.km, 0);
            const techCovered3= techRows3.reduce((s, r) => s + r.exactKm, 0);
            const technicalStatus3: ReadinessLevel =
              techDemand3 === 0 ? "unknown" :
              techCovered3 / techDemand3 >= 0.7 ? "strong" :
              techCovered3 / techDemand3 >= 0.4 ? "moderate" : "major_gap";

            const aidStns3   = result.aid_stations ?? [];
            const aidSorted3 = [...aidStns3].sort((a, b) => a.km - b.km);
            const aidStops3  = [0, ...aidSorted3.map(s => s.km), goalDist3];
            const aidGaps3   = aidStops3.slice(1).map((km, i) => km - aidStops3[i]);
            const aidMaxGap3 = aidGaps3.length > 1 ? Math.max(...aidGaps3) : 0;
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

            const scoreCards3: { title: string; level: ReadinessLevel; detail: string; interp: string }[] = [
              {
                title: "Distance",
                level: distStatus3,
                detail: athDist3 > 0 && goalDist3 > 0
                  ? `${athDist3.toFixed(0)} km best vs ${goalDist3.toFixed(0)} km target (${athDist3 > 0 && goalDist3 > 0 ? Math.round((athDist3 / goalDist3) * 100) : "—"}% of target)`
                  : "Insufficient data",
                interp: distStatus3 === "strong" ? "Best race distance meets or exceeds target." : distStatus3 === "moderate" ? "Within 70–100% — a meaningful step up but within reach." : distStatus3 === "major_gap" ? "Target distance significantly exceeds anything on record." : "No data available.",
              },
              {
                title: "Ascent",
                level: ascentStatus3,
                detail: athAscent3 > 0 && goalAscent3 > 0
                  ? `${Math.round(athAscent3).toLocaleString()} m best vs ${Math.round(goalAscent3).toLocaleString()} m target (${Math.round((athAscent3 / goalAscent3) * 100)}% of target)`
                  : "Insufficient data",
                interp: ascentStatus3 === "strong" ? "Ascent load well within proven capacity." : ascentStatus3 === "moderate" ? "50–80% of target — a genuine step up in vertical load." : ascentStatus3 === "major_gap" ? "Target ascent significantly exceeds best on record. Vertical load is the primary risk." : "No data available.",
              },
              {
                title: "Descent",
                level: descentStatus3,
                detail: descentDemand3 > 0
                  ? `${descentCovered3.toFixed(1)} km covered of ${descentDemand3.toFixed(1)} km demanded — ${goalDescent3 > 0 ? `${Math.round(goalDescent3).toLocaleString()} m total descent` : ""}`
                  : "Insufficient data",
                interp: descentStatus3 === "strong" ? "Descent experience broadly covers race demands." : descentStatus3 === "moderate" ? "Partial descent experience — some uncharted territory." : descentStatus3 === "major_gap" ? "Descent load significantly under-covered. Eccentric quad damage risk late in race." : "No descent data.",
              },
              {
                title: "Terrain specificity",
                level: terrainStatus3,
                detail: trailDemand3 > 0
                  ? `${trailCovered3.toFixed(1)} km trail/fell vs ${trailDemand3.toFixed(1)} km demanded (${Math.round((trailCovered3 / trailDemand3) * 100)}% of target)`
                  : "No off-road demand detected",
                interp: terrainStatus3 === "strong" ? "Trail and fell experience well matched to course demands." : terrainStatus3 === "moderate" ? "Partial trail coverage — some off-road specificity work needed." : terrainStatus3 === "major_gap" ? "Limited off-road experience relative to course demands." : "No trail demand detected.",
              },
              {
                title: "Technical terrain",
                level: technicalStatus3,
                detail: techDemand3 > 0
                  ? `${techCovered3.toFixed(1)} km technical vs ${techDemand3.toFixed(1)} km demanded (${Math.round((techCovered3 / techDemand3) * 100)}% of target)`
                  : "No technical trail on course",
                interp: technicalStatus3 === "strong" ? "Technical trail experience adequate." : technicalStatus3 === "moderate" ? "Partial technical experience — route-finding and ankle stability need attention." : technicalStatus3 === "major_gap" ? "No comparable technical trail experience — specific exposure required." : "No technical trail on this course.",
              },
              {
                title: "Effort load",
                level: flatStatus3,
                detail: athFlatEq3 > 0 && goalFlatEq3 > 0
                  ? `${athFlatEq3.toFixed(1)} km effort-equiv. best vs ${goalFlatEq3.toFixed(1)} km target (${Math.round((athFlatEq3 / goalFlatEq3) * 100)}% of target)`
                  : "Insufficient data",
                interp: flatStatus3 === "strong" ? "Total effort load well within demonstrated capacity." : flatStatus3 === "moderate" ? "55–80% of target effort load covered." : flatStatus3 === "major_gap" ? "Target effort load significantly exceeds anything on record." : "No effort data available.",
              },
              {
                title: "Aid logistics",
                level: aidStatus3,
                detail: aidStns3.length > 0
                  ? `${aidSorted3.length} station${aidSorted3.length !== 1 ? "s" : ""} · longest gap ${aidMaxGap3.toFixed(1)} km`
                  : "No aid station data",
                interp: aidStatus3 === "strong" ? "Aid spacing is manageable — regular support throughout." : aidStatus3 === "moderate" ? "Gaps up to 25 km — carrying nutrition and water requires planning." : aidStatus3 === "major_gap" ? "Longest gap exceeds 25 km — significant self-sufficiency required." : "No aid data recorded.",
              },
              {
                title: "Overall confidence",
                level: overallLevel3,
                detail: gapRows3.length > 0
                  ? `${metCount3} of ${gapRows3.length} terrain demand types fully covered`
                  : "No course profile data",
                interp: overallLevel3 === "strong" ? "No major gaps — well prepared across all dimensions." : overallLevel3 === "moderate" ? "Capable overall but specific gaps need targeted preparation." : overallLevel3 === "major_gap" ? "Multiple significant gaps — focused preparation plan required before race day." : "Insufficient data for an overall rating.",
              },
            ];

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Readiness Scorecard</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>Readiness Scorecard</h2>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                  How {reportAthlete.profile.athlete_key.split(" ")[0]} measures up against {result.race.name} across every key dimension
                </p>

                <div style={{ border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
                  {scoreCards3.map((card, i) => (
                    <div key={card.title} style={{
                      display: "flex", alignItems: "flex-start", gap: "14px",
                      padding: "10px 16px",
                      borderTop: i > 0 ? "1px solid #f0f0f0" : "none",
                      background: "#fff",
                    }}>
                      <div style={{ width: "4px", alignSelf: "stretch", background: lc3(card.level), borderRadius: "2px", flexShrink: 0, marginTop: "2px" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "#333" }}>{card.title}</div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: lc3(card.level), flexShrink: 0, marginLeft: "8px" }}>{ll3(card.level)}</div>
                        </div>
                        <div style={{ fontSize: "10px", color: "#999", marginTop: "1px" }}>{card.detail}</div>
                        <div style={{ fontSize: "9.5px", color: "#666", marginTop: "2px", lineHeight: 1.45 }}>{card.interp}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ paddingTop: "8px", borderTop: "1px solid #eee" }}>
                  <p style={{ margin: 0, fontSize: "9px", color: "#bbb", lineHeight: 1.5 }}>
                    Strong = demands met at ≥80% of target level (≥70% for distance). Moderate = partial but meaningful preparation. Major gap = significant shortfall requiring targeted preparation.
                    All ratios expressed as athlete best / race target — a higher percentage means better coverage.
                  </p>
                </div>

                <PageNumber n={2} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              2 — Distance & Time-on-Feet Readiness  (p3)
          ═══════════════════════════════════════ */}
          {result && reportAthlete && expContext && (() => {
            const firstName = reportAthlete.profile.athlete_key.split(" ")[0];
            const sc  = expContext.scale;
            const te  = expContext.time_estimate;

            const goalDist   = result.race.total_distance_km;
            const goalFlatEq = sc?.goal_flat_equiv_km ?? 0;
            const athDist    = sc?.athlete_max_dist?.km ?? 0;
            const athFlatEq  = sc?.athlete_max_flat_equiv?.km ?? reportAthlete.profile.max_flat_equiv_km ?? 0;

            const distRatio    = goalDist   > 0 && athDist   > 0 ? athDist   / goalDist   : null;
            const flatEqRatio  = goalFlatEq > 0 && athFlatEq > 0 ? athFlatEq / goalFlatEq : null;

            const barColor = (ratio: number | null) =>
              ratio === null ? "#9e9e9e" : ratio >= 1 ? "#2e7d32" : ratio >= 0.7 ? "#f57c00" : "#c0392b";

            const fmtH = (h: number) => {
              const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
              return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
            };

            const distInterpText = (() => {
              if (!sc) return `No scale data available to compare ${firstName}'s race history against ${result.race.name}.`;
              if (distRatio === null) return `Insufficient data to compare distance demands.`;
              if (distRatio >= 1) return `${firstName}'s best race distance (${athDist.toFixed(0)} km — ${sc.athlete_max_dist?.race_name}, ${sc.athlete_max_dist?.year}) exceeds the target of ${goalDist.toFixed(0)} km. Basic endurance capacity is not in question. The preparation focus should shift to the vertical and terrain-specific demands rather than raw distance.`;
              if (distRatio >= 0.8) return `${firstName}'s best distance (${athDist.toFixed(0)} km) reaches ${Math.round(distRatio * 100)}% of the ${goalDist.toFixed(0)} km target. This is a meaningful step up but well within a progressive training arc. At least one long training day or race at ≥${Math.round(goalDist * 0.7)} km before race day would close this gap.`;
              if (distRatio >= 0.6) return `At ${Math.round(distRatio * 100)}% of target distance, ${firstName} has a real distance gap. The ${goalDist.toFixed(0)} km target is significantly longer than the ${athDist.toFixed(0)} km best on record. A structured distance build is required — progressive long runs and back-to-back training days to accumulate race-relevant time on feet.`;
              return `${firstName}'s best race distance (${athDist.toFixed(0)} km) is only ${Math.round(distRatio * 100)}% of the ${goalDist.toFixed(0)} km target. This is the most significant raw distance gap and must be addressed directly in preparation before race day.`;
            })();

            const flatEqInterpText = (() => {
              if (flatEqRatio === null) return null;
              const pct = Math.round(flatEqRatio * 100);
              if (flatEqRatio >= 1) return `Effort-adjusted distance fully covered at ${athFlatEq.toFixed(1)} km equivalent${sc?.athlete_max_flat_equiv ? ` (${sc.athlete_max_flat_equiv.race_name}, ${sc.athlete_max_flat_equiv.year})` : ""}. The total energy output required by ${result.race.name} is within proven territory.`;
              if (flatEqRatio >= 0.7) return `Effort-adjusted distance at ${pct}% of target — a step up but manageable. The ${totalFlatEq > 0 ? totalFlatEq.toFixed(1) : "—"} km effort equivalent of ${result.race.name} is larger than the geographic distance because of its climbing load.`;
              return `Effort-adjusted distance at only ${pct}% of target. The total energy cost of ${result.race.name} — after accounting for its climbing — is ${goalFlatEq.toFixed(1)} km equivalent, significantly above the ${athFlatEq.toFixed(1)} km best on record.`;
            })();

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Distance &amp; Time-on-Feet</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>2 — Distance &amp; Time-on-Feet Readiness</h2>
                <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                  Race scale vs {firstName}&apos;s demonstrated capacity · Effort-adjusted distance · Time estimate
                </p>

                {/* Raw distance comparison */}
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "8px" }}>Race Distance — Race requires vs Athlete has demonstrated</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "10px" }}>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "12px 14px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Race requires</div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#1e3a1e" }}>{goalDist != null ? goalDist.toFixed(0) : "—"}</div>
                      <div style={{ fontSize: "11px", color: "#888" }}>km geographic distance</div>
                      {goalFlatEq > 0 && <div style={{ fontSize: "10px", color: "#666", marginTop: "2px" }}>{goalFlatEq.toFixed(1)} km effort-adjusted</div>}
                    </div>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "12px 14px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>{firstName} has demonstrated</div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: barColor(distRatio) }}>{athDist > 0 ? athDist.toFixed(0) : "—"}</div>
                      <div style={{ fontSize: "11px", color: "#888" }}>km best race distance</div>
                      {sc?.athlete_max_dist && <div style={{ fontSize: "10px", color: "#999", marginTop: "2px" }}>{sc.athlete_max_dist.race_name} ({sc.athlete_max_dist.year})</div>}
                    </div>
                  </div>
                  {distRatio !== null && (
                    <div style={{ marginBottom: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#aaa", marginBottom: "3px" }}>
                        <span>0%</span>
                        <span style={{ fontWeight: 700, color: barColor(distRatio) }}>{Math.round(distRatio * 100)}% of target distance</span>
                        <span>100%</span>
                      </div>
                      <div style={{ height: "8px", background: "#eee", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, distRatio * 100)}%`, background: barColor(distRatio), borderRadius: "4px" }} />
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: "8px", padding: "10px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: `4px solid ${barColor(distRatio)}`, borderRadius: "5px", fontSize: "10.5px", color: "#333", lineHeight: 1.55 }}>
                    {distInterpText}
                  </div>
                </div>

                {/* Effort-adjusted distance */}
                {(goalFlatEq > 0 || athFlatEq > 0) && (
                  <div style={{ marginBottom: "16px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Effort-Adjusted Distance (flat-equivalent km)</p>
                    <p style={{ margin: "0 0 8px", fontSize: "9.5px", color: "#666", lineHeight: 1.5 }}>
                      <strong>Effort-adjusted distance</strong> expresses the total energy cost of a race as an equivalent flat distance, using the Minetti grade-adjusted energy model.
                      It accounts for climbing and descending costs so races of different profiles can be compared fairly.
                      Raw geographic distance and effort-adjusted distance will always differ on mountain courses.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                      <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 14px", background: "#fafafa", textAlign: "center" }}>
                        <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>Race effort-adjusted target</div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: "#1e3a1e" }}>{goalFlatEq > 0 ? goalFlatEq.toFixed(1) : "—"}</div>
                        <div style={{ fontSize: "10px", color: "#888" }}>flat-equivalent km</div>
                        {goalDist > 0 && goalFlatEq > 0 && <div style={{ fontSize: "9px", color: "#aaa", marginTop: "2px" }}>avg {(goalFlatEq / goalDist).toFixed(2)}× effort per raw km</div>}
                      </div>
                      <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 14px", background: "#fafafa", textAlign: "center" }}>
                        <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{firstName}&apos;s best effort-adjusted</div>
                        <div style={{ fontSize: "22px", fontWeight: 800, color: barColor(flatEqRatio) }}>{athFlatEq > 0 ? athFlatEq.toFixed(1) : "—"}</div>
                        <div style={{ fontSize: "10px", color: "#888" }}>flat-equivalent km</div>
                        {sc?.athlete_max_flat_equiv && <div style={{ fontSize: "9px", color: "#aaa", marginTop: "2px" }}>{sc.athlete_max_flat_equiv.race_name} ({sc.athlete_max_flat_equiv.year})</div>}
                      </div>
                    </div>
                    {flatEqRatio !== null && (
                      <div style={{ marginBottom: "4px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#aaa", marginBottom: "3px" }}>
                          <span>0%</span>
                          <span style={{ fontWeight: 700, color: barColor(flatEqRatio) }}>{Math.round(flatEqRatio * 100)}% of target effort load</span>
                          <span>100%</span>
                        </div>
                        <div style={{ height: "8px", background: "#eee", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, flatEqRatio * 100)}%`, background: barColor(flatEqRatio), borderRadius: "4px" }} />
                        </div>
                      </div>
                    )}
                    {flatEqInterpText && (
                      <div style={{ marginTop: "8px", padding: "9px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: `4px solid ${barColor(flatEqRatio)}`, borderRadius: "5px", fontSize: "10px", color: "#444", lineHeight: 1.5 }}>
                        {flatEqInterpText}
                      </div>
                    )}
                  </div>
                )}

                {/* Time estimate */}
                {te && (
                  <div style={{ marginBottom: "14px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Time-on-Feet Estimate</p>
                    <div style={{ background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "6px", padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "6px" }}>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Estimated finish window</div>
                          <div style={{ fontSize: "16px", fontWeight: 800, color: "#1e3a1e" }}>{fmtH(te.estimated_min_hours)} – {fmtH(te.estimated_max_hours)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Based on</div>
                          <div style={{ fontSize: "11px", color: "#555" }}>{te.basis_race_name} ({fmtH(te.basis_finish_hours)} finish)</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Longest race on record</div>
                          <div style={{ fontSize: "11px", color: "#555" }}>{te.athlete_longest_race_name} ({fmtH(te.athlete_longest_hours)})</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "9.5px", color: "#666", lineHeight: 1.5 }}>
                        {fmtH(te.estimated_min_hours)} to {fmtH(te.estimated_max_hours)} on course is significantly longer than {firstName}&apos;s longest previous race ({fmtH(te.athlete_longest_hours)} at {te.athlete_longest_race_name}).
                        {" "}Planning and practising race-day nutrition, pacing, and kit management for this duration is essential — not optional.
                      </div>
                    </div>
                  </div>
                )}

                <PageNumber n={3} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              3a — Vertical Load: Ascent  (p4)
          ═══════════════════════════════════════ */}
          {result && reportAthlete && expContext && (() => {
            const firstName = reportAthlete.profile.athlete_key.split(" ")[0];
            const sc = expContext.scale;
            const bc = expContext.biggest_climb;
            const bd = expContext.biggest_descent;

            const goalAscent  = result.race.total_ascent_m;
            const goalDescent = result.race.total_descent_m;
            const goalDist    = result.race.total_distance_km;
            const athAscent   = sc?.athlete_max_ascent?.m ?? reportAthlete.profile.max_ascent_m ?? 0;
            const ascentRatio = goalAscent > 0 && athAscent > 0 ? athAscent / goalAscent : null;

            const descentSecs   = secs.filter(s => s.section_type.includes("descent"));
            const descentKm     = descentSecs.reduce((a, s) => a + s.distance_km, 0);
            const statusColor = (r: number | null) =>
              r === null ? "#9e9e9e" : r >= 0.8 ? "#2e7d32" : r >= 0.5 ? "#f57c00" : "#c0392b";

            const athleteDescentKm = (() => {
              const dm: Record<string, number> = {};
              for (const tp of reportAthlete.terrain_pairings ?? []) {
                if (tp.section_type.includes("descent")) {
                  dm[tp.terrain] = (dm[tp.terrain] ?? 0) + tp.total_km;
                }
              }
              return Object.values(dm).reduce((a, b) => a + b, 0);
            })();
            const descentCoveredRatio = descentKm > 0 && athleteDescentKm > 0 ? athleteDescentKm / descentKm : null;

            const goalPerKm = goalDist > 0 && goalAscent > 0 ? Math.round(goalAscent / goalDist) : 0;

            return (<>
              {/* PAGE 4 — Ascent + biggest climb + late-race load */}
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Vertical Load Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>3 — Vertical Load Readiness</h2>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                  Ascent demand · Biggest climb comparison · Final-third climbing
                </p>

                {/* Ascent */}
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "8px" }}>Ascent — Race requires vs your best</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "12px 14px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Race requires</div>
                      <div style={{ fontSize: "24px", fontWeight: 800, color: "#c0392b" }}>{goalAscent > 0 ? Math.round(goalAscent).toLocaleString() : "—"}</div>
                      <div style={{ fontSize: "11px", color: "#888" }}>metres total ascent</div>
                      {goalPerKm > 0 && <div style={{ fontSize: "9.5px", color: "#999", marginTop: "2px" }}>{goalPerKm} m per km average</div>}
                    </div>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "12px 14px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Your best</div>
                      <div style={{ fontSize: "24px", fontWeight: 800, color: statusColor(ascentRatio) }}>{athAscent > 0 ? Math.round(athAscent).toLocaleString() : "—"}</div>
                      <div style={{ fontSize: "11px", color: "#888" }}>metres best single race</div>
                      {sc?.athlete_max_ascent && <div style={{ fontSize: "9.5px", color: "#999", marginTop: "2px" }}>{sc.athlete_max_ascent.race_name} ({sc.athlete_max_ascent.year})</div>}
                    </div>
                  </div>
                  {ascentRatio !== null && (
                    <div style={{ marginBottom: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#aaa", marginBottom: "3px" }}>
                        <span>0%</span>
                        <span style={{ fontWeight: 700, color: statusColor(ascentRatio) }}>{Math.round(ascentRatio * 100)}% of target ascent</span>
                        <span>100%</span>
                      </div>
                      <div style={{ height: "8px", background: "#eee", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, ascentRatio * 100)}%`, background: statusColor(ascentRatio), borderRadius: "4px" }} />
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: "6px", padding: "9px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: `4px solid ${statusColor(ascentRatio)}`, borderRadius: "5px", fontSize: "10px", color: "#333", lineHeight: 1.5 }}>
                    {ascentRatio === null
                      ? "Insufficient ascent data to compare."
                      : ascentRatio >= 1
                        ? `Your best ascent (${Math.round(athAscent).toLocaleString()} m) meets or exceeds the ${Math.round(goalAscent).toLocaleString()} m target. Vertical capacity is proven — preparation should focus on terrain specificity and descent durability.`
                      : ascentRatio >= 0.8
                        ? `Your best ascent is ${Math.round(ascentRatio * 100)}% of target — a genuine step up but manageable with targeted climbing blocks. Focus on sustained uphill effort at threshold rather than just accumulating flat volume.`
                      : ascentRatio >= 0.5
                        ? `At ${Math.round(ascentRatio * 100)}% of target, this is a significant vertical step-up. ${Math.round(goalAscent).toLocaleString()} m of ascent${goalPerKm > 0 ? ` at ${goalPerKm} m/km` : ""} will require specific mountain-conditioning work — not just running more.`
                        : `Vertical load is the primary preparation risk. The ${Math.round(goalAscent).toLocaleString()} m target is ${goalAscent > 0 && athAscent > 0 ? (goalAscent / athAscent).toFixed(1) : "—"}× higher than anything on record. This requires a fundamental shift in training focus toward mountain-specific climbing.`
                    }
                  </div>
                </div>

                {/* Biggest climb comparison */}
                {bc && (
                  <div style={{ marginBottom: "14px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Biggest Single Climb — Race vs Your Best</p>
                    <div style={{ background: "#fafafa", border: "1px solid #e8e8e8", borderLeft: "4px solid #e65100", borderRadius: "6px", padding: "12px 14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Race&apos;s main climb</div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#c0392b" }}>{Math.round(bc.goal.ascent_m).toLocaleString()} m ↑ over {bc.goal.km} km</div>
                          <div style={{ fontSize: "9.5px", color: "#666", marginTop: "2px" }}>km {bc.goal.start_km}–{bc.goal.end_km} · avg {bc.goal.avg_grad}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Your best climb</div>
                          {bc.athlete_best
                            ? <>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{Math.round(bc.athlete_best.ascent_m).toLocaleString()} m ↑ over {bc.athlete_best.km} km</div>
                                <div style={{ fontSize: "9.5px", color: "#666", marginTop: "2px" }}>{bc.athlete_best.race_name} ({bc.athlete_best.year})</div>
                              </>
                            : <div style={{ fontSize: "12px", color: "#aaa" }}>No comparable climb on record</div>
                          }
                        </div>
                      </div>
                      {bc.athlete_best && bc.ratio != null && (
                        <div style={{ marginBottom: "6px" }}>
                          <div style={{ height: "6px", background: "#eee", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
                            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, (bc.athlete_best.ascent_m / bc.goal.ascent_m) * 100)}%`, background: "#78909c", borderRadius: "3px" }} />
                          </div>
                          <div style={{ fontSize: "9px", color: "#e65100", marginTop: "3px", fontWeight: 600 }}>
                            Your best climb is {bc.ratio}× smaller than the race&apos;s main climb
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: "10px", color: "#444", lineHeight: 1.5 }}>
                        {bc.athlete_best
                          ? bc.ratio != null && bc.ratio > 2
                            ? `The main climb on ${result.race.name} is more than twice as large as any climb in your race history. This is the most significant mountain-specific preparation gap. Finding training routes or races that include climbs of comparable length and gradient is a preparation priority.`
                            : bc.ratio != null && bc.ratio > 1.2
                            ? `The race's main climb meaningfully exceeds your best on record. Specific targeted sessions on long sustained climbs — not just distance volume — are needed to bridge this gap.`
                            : `Your biggest recorded climb is a reasonable match for the race's main challenge. The scaling is manageable with good race-day pacing from the start of each climb.`
                          : `No equivalent climb found in your race history. This is a preparation gap: seek out races or training routes that include sustained mountain climbs comparable to this course.`
                        }
                      </div>
                    </div>
                  </div>
                )}

                {/* Final-third ascent */}
                {finalThirdAscent > 0 && totalAscentM > 0 && (
                  <div style={{ marginBottom: "14px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Late-Race Vertical Load</p>
                    <div style={{ background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "6px", padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "6px" }}>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Final third ascent</div>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "#c0392b" }}>{Math.round(finalThirdAscent).toLocaleString()} m</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>% of total ascent</div>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: "#c0392b" }}>{Math.round((finalThirdAscent / totalAscentM) * 100)}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Final-third effort multiplier</div>
                          <div style={{ fontSize: "16px", fontWeight: 700, color: finalThirdEffort > effortRatio * 1.1 ? "#c0392b" : "#1e3a1e" }}>{finalThirdEffort.toFixed(2)}×</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "10px", color: "#444", lineHeight: 1.5 }}>
                        {finalThirdAscent / totalAscentM > 0.35
                          ? `The final third of the course carries ${Math.round((finalThirdAscent / totalAscentM) * 100)}% of total ascent — a heavily back-loaded profile. Hard climbing arrives when you are most fatigued. Training the ability to climb efficiently in a tired state is more valuable than adding fresh-leg climbing volume.`
                          : finalThirdAscent / totalAscentM < 0.2
                          ? `Only ${Math.round((finalThirdAscent / totalAscentM) * 100)}% of total ascent falls in the final third — this course front-loads its climbing. Managing effort on early climbs is critical to avoid entering the back half already depleted.`
                          : `Late-race climbing is moderate — ${Math.round((finalThirdAscent / totalAscentM) * 100)}% of total ascent in the final third. Neither heavily front- nor back-loaded; consistent pacing across the whole course is the priority.`
                        }
                      </div>
                    </div>
                  </div>
                )}

                <PageNumber n={4} />
              </div>

              {/* PAGE 5 — Descent + biggest descent */}
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Vertical Load Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>3 — Vertical Load Readiness (continued)</h2>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                  Descent demand · Biggest descent comparison
                </p>

                {/* Descent */}
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "8px" }}>Descent — Race requires vs your experience</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "8px" }}>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 12px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Total descent</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#1565c0" }}>{goalDescent > 0 ? Math.round(goalDescent).toLocaleString() : "—"}</div>
                      <div style={{ fontSize: "10px", color: "#888" }}>m descent (race)</div>
                    </div>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 12px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Descent sections</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: "#1565c0" }}>{descentKm.toFixed(1)}</div>
                      <div style={{ fontSize: "10px", color: "#888" }}>km of descending terrain</div>
                    </div>
                    <div style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "10px 12px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>Your descent km</div>
                      <div style={{ fontSize: "20px", fontWeight: 800, color: statusColor(descentCoveredRatio) }}>{athleteDescentKm > 0 ? athleteDescentKm.toFixed(1) : "—"}</div>
                      <div style={{ fontSize: "10px", color: "#888" }}>km logged in race history</div>
                    </div>
                  </div>
                  <div style={{ padding: "9px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: `4px solid #1565c0`, borderRadius: "5px", fontSize: "10px", color: "#333", lineHeight: 1.5 }}>
                    {goalDescent > 0
                      ? `The race includes ${Math.round(goalDescent).toLocaleString()} m of total descent across ${descentKm.toFixed(1)} km of descending terrain. Eccentric quad loading on repeated technical descents creates muscle damage that flat or climbing training does not replicate. ${descentCoveredRatio !== null ? `You have ${athleteDescentKm.toFixed(1)} km of descent experience on record — ${Math.round(descentCoveredRatio * 100)}% of the race demand. ` : ""}Specific downhill training and eccentric loading work should be a priority regardless of current fitness level.`
                      : `No descent data available for this race — verify total descent figure in race profile.`
                    }
                  </div>
                </div>

                {/* Biggest descent comparison */}
                {bd && (
                  <div style={{ marginBottom: "14px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Biggest Single Descent — Race vs Your Best</p>
                    <div style={{ background: "#fafafa", border: "1px solid #e8e8e8", borderLeft: "4px solid #1565c0", borderRadius: "6px", padding: "12px 14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Race&apos;s main descent</div>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1565c0" }}>{Math.round(bd.goal.descent_m).toLocaleString()} m ↓ over {bd.goal.km} km</div>
                          <div style={{ fontSize: "9.5px", color: "#666", marginTop: "2px" }}>km {bd.goal.start_km}–{bd.goal.end_km} · avg {bd.goal.avg_grad}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", color: "#aaa", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>Your best descent</div>
                          {bd.athlete_best
                            ? <>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{Math.round(bd.athlete_best.descent_m).toLocaleString()} m ↓ over {bd.athlete_best.km} km</div>
                                <div style={{ fontSize: "9.5px", color: "#666", marginTop: "2px" }}>{bd.athlete_best.race_name} ({bd.athlete_best.year})</div>
                              </>
                            : <div style={{ fontSize: "12px", color: "#aaa" }}>No comparable descent on record</div>
                          }
                        </div>
                      </div>
                      {bd.athlete_best && bd.ratio != null && (
                        <div style={{ marginBottom: "6px" }}>
                          <div style={{ height: "6px", background: "#eee", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
                            <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, (bd.athlete_best.descent_m / bd.goal.descent_m) * 100)}%`, background: "#78909c", borderRadius: "3px" }} />
                          </div>
                          <div style={{ fontSize: "9px", color: "#1565c0", marginTop: "3px", fontWeight: 600 }}>
                            Your best descent is {bd.ratio}× smaller than the race&apos;s main descent
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: "10px", color: "#444", lineHeight: 1.5 }}>
                        {bd.athlete_best
                          ? bd.ratio != null && bd.ratio > 2
                            ? `The main descent on ${result.race.name} is more than twice as large as any single descent in your race history. Steep technical descending under fatigue is a distinct skill — seek out training runs with comparable sustained descents before race day.`
                            : bd.ratio != null && bd.ratio > 1.2
                            ? `The race's main descent exceeds your best on record. Eccentric loading, step-downs, and regular downhill running sessions will build the quad resilience this requires.`
                            : `Your biggest recorded descent is a reasonable match for the race's main descent. Focus on maintaining form and not braking too hard when tired.`
                          : `No equivalent descent found in your race history. Prioritise sustained downhill running in training — preferably on technical terrain — before race day.`
                        }
                      </div>
                    </div>
                  </div>
                )}

                <PageNumber n={5} />
              </div>
            </>);
          })()}

          {/* ═══════════════════════════════════════
              4a — Terrain Readiness: Surface & Pairings  (p5)
          ═══════════════════════════════════════ */}
          {reportAthlete && result.terrain_sections.length > 0 && (() => {
            const firstName = reportAthlete.profile.athlete_key.split(" ")[0];
            const stl = (s: string) => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const tl  = (t: string) => t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const pairingColor = (s: string) =>
              s.includes("climb") ? "#c0392b" : s.includes("descent") ? "#1565c0" : "#2e7d32";

            // Build athlete terrain pairing totals
            const athletePairings = (reportAthlete.terrain_pairings ?? [])
              .slice()
              .sort((a, b) => b.total_km - a.total_km);
            const maxAthKm = athletePairings.length > 0 ? athletePairings[0].total_km : 1;

            // Build race demand map
            const raceDemandMap: Record<string, { section_type: string; terrain: string; km: number; avgGrad: number }> = {};
            for (const sec of result.terrain_sections) {
              const key = `${sec.section_type}|${sec.terrain}`;
              if (!raceDemandMap[key]) raceDemandMap[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0, avgGrad: sec.avg_gradient_percent };
              raceDemandMap[key].km += sec.distance_km;
            }
            const raceKeys = new Set(Object.keys(raceDemandMap));
            const athleteKeySet = new Set((reportAthlete.terrain_pairings ?? []).map(p => `${p.section_type}|${p.terrain}`));

            // Proven: athlete has experience in a terrain type the race demands, sorted by athlete km
            const provenPairings = athletePairings
              .filter(p => raceKeys.has(`${p.section_type}|${p.terrain}`) && p.total_km > 0)
              .slice(0, 5);

            // Gaps: race demands where athlete has little/no experience
            const gapPairings = Object.values(raceDemandMap)
              .filter(d => d.km >= 0.5)
              .map(d => {
                const exactKm = (reportAthlete.terrain_pairings ?? []).find(p => `${p.section_type}|${p.terrain}` === `${d.section_type}|${d.terrain}`)?.total_km ?? 0;
                const pct = d.km > 0 ? Math.round((exactKm / d.km) * 100) : 100;
                return { ...d, exactKm, pct, status: exactKm === 0 ? "none" as const : pct >= 100 ? "met" as const : "partial" as const };
              })
              .filter(d => d.status !== "met")
              .sort((a, b) => b.km - a.km)
              .slice(0, 5);

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Terrain Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>4 — Terrain Readiness</h2>
                <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#888" }}>
                  Proven terrain types vs priority gaps · Surface-level experience matched to race demands
                </p>

                {/* Surface composition */}
                {surfaceSummary.total > 0 && (
                  <div style={{ marginBottom: "14px" }}>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Surface Composition — what the race course requires</p>
                    {surfaceSummary.entries.map(([terrain, km]) => {
                      const pct = surfaceSummary.total > 0 ? (km / surfaceSummary.total) * 100 : 0;
                      const col = terrain === "technical_trail" ? "#c0392b" : terrain === "fell" ? "#e65100" : terrain === "trail" ? "#2e7d32" : terrain === "gravel" ? "#f57c00" : "#78909c";
                      return (
                        <div key={terrain} style={{ marginBottom: "4px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", marginBottom: "2px" }}>
                            <span style={{ color: "#444", fontWeight: 600 }}>{tl(terrain)}</span>
                            <span style={{ color: "#888" }}>{km.toFixed(1)} km · {pct.toFixed(0)}%</span>
                          </div>
                          <div style={{ height: "7px", background: "#eee", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: "3px", opacity: 0.8 }} />
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: "8px", padding: "7px 10px", background: "#fffde7", border: "1px solid #fff176", borderRadius: "5px", fontSize: "9px", color: "#795500", lineHeight: 1.5 }}>
                      <strong>Note:</strong> Terrain classifications are derived from race database data and GPS track analysis. They may not capture all technical features of individual course sections. Use these classifications as a guide for preparation, not a definitive map.
                    </div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  {/* Proven terrain types */}
                  <div>
                    <p style={{ ...sectionLabel, marginBottom: "8px", color: "#2e7d32" }}>Proven terrain types</p>
                    <p style={{ margin: "0 0 7px", fontSize: "9.5px", color: "#666", lineHeight: 1.45 }}>
                      Terrain types this race demands where {firstName} has demonstrated experience.
                    </p>
                    {provenPairings.length === 0 ? (
                      <div style={{ fontSize: "10px", color: "#aaa", fontStyle: "italic" }}>No directly matching terrain types found between race demands and athlete history.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {provenPairings.map((p, i) => {
                          const raceDemand = raceDemandMap[`${p.section_type}|${p.terrain}`]?.km ?? 0;
                          const pct = raceDemand > 0 ? Math.min(100, Math.round((p.total_km / raceDemand) * 100)) : 100;
                          const col = pairingColor(p.section_type);
                          const barPct = maxAthKm > 0 ? (p.total_km / maxAthKm) * 100 : 0;
                          return (
                            <div key={i} style={{ padding: "7px 10px", background: "#f0faf0", border: "1px solid #c8e6c9", borderLeft: `3px solid ${col}`, borderRadius: "5px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: col }}>{stl(p.section_type)}</span>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: "#2e7d32" }}>{p.total_km.toFixed(1)} km</span>
                              </div>
                              <div style={{ fontSize: "9px", color: "#666", marginBottom: "3px" }}>{tl(p.terrain)} · {p.race_count} race{p.race_count !== 1 ? "s" : ""}</div>
                              <div style={{ height: "5px", background: "#e0e0e0", borderRadius: "2px", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${barPct}%`, background: col, borderRadius: "2px", opacity: 0.7 }} />
                              </div>
                              {raceDemand > 0 && (
                                <div style={{ fontSize: "8.5px", color: pct >= 100 ? "#2e7d32" : "#f57c00", marginTop: "2px" }}>
                                  {pct >= 100 ? "✓ Demand covered" : `${pct}% of race demand met`}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Priority terrain gaps */}
                  <div>
                    <p style={{ ...sectionLabel, marginBottom: "8px", color: "#c0392b" }}>Priority terrain gaps</p>
                    <p style={{ margin: "0 0 7px", fontSize: "9.5px", color: "#666", lineHeight: 1.45 }}>
                      Race demands where {firstName}&apos;s experience is insufficient or absent.
                    </p>
                    {gapPairings.length === 0 ? (
                      <div style={{ fontSize: "10px", color: "#2e7d32", fontWeight: 600 }}>No significant terrain gaps identified — all major race demands appear covered in athlete history.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {gapPairings.map((d, i) => {
                          const col = pairingColor(d.section_type);
                          const badgeColor = d.status === "none" ? "#c0392b" : d.pct >= 50 ? "#f57c00" : "#e65100";
                          const badgeLabel = d.status === "none" ? "No experience" : `${d.pct}% of demand`;
                          return (
                            <div key={i} style={{ padding: "7px 10px", background: "#fce4ec20", border: "1px solid #ffcdd2", borderLeft: `3px solid ${badgeColor}`, borderRadius: "5px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "2px" }}>
                                <span style={{ fontSize: "10px", fontWeight: 700, color: col }}>{stl(d.section_type)}</span>
                                <span style={{ fontSize: "9.5px", fontWeight: 700, color: badgeColor }}>{badgeLabel}</span>
                              </div>
                              <div style={{ fontSize: "9px", color: "#666", marginBottom: "2px" }}>{tl(d.terrain)} · race needs {d.km.toFixed(1)} km</div>
                              {d.exactKm > 0 && (
                                <div style={{ fontSize: "8.5px", color: "#888" }}>Has: {d.exactKm.toFixed(1)} km</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Terrain interpretation */}
                <div style={{ padding: "10px 14px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: "4px solid #1e3a1e", borderRadius: "6px", fontSize: "10px", color: "#333", lineHeight: 1.55 }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>What this means for preparation</div>
                  {gapPairings.length === 0
                    ? `${firstName}'s terrain experience broadly covers what ${result.race.name} demands. The preparation focus should be on maintaining race-specific fitness, practising on similar routes, and arriving at the start line confident in the terrain.`
                    : gapPairings.some(d => d.status === "none")
                      ? `${firstName} has ${gapPairings.filter(d => d.status === "none").length} terrain type${gapPairings.filter(d => d.status === "none").length !== 1 ? "s" : ""} in the race profile with no equivalent experience on record. These are not just preparation gaps — they are potential sources of race-day surprise and overexertion. Specific terrain exposure before race day is a priority, not a nice-to-have.`
                      : `All terrain gaps are partial rather than complete — ${firstName} has some relevant experience, but not at the volume the race demands. Increasing time on equivalent terrain surfaces is the priority. Generic fitness will not substitute for terrain-specific adaptation.`
                  }
                </div>

                <p style={{ margin: "12px 0 0", fontSize: "9px", color: "#bbb", lineHeight: 1.5 }}>
                  See the next page for the full terrain gap table showing exact experience vs race demand for every terrain type on course.
                </p>

                <PageNumber n={6} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              4b — Terrain Gap Analysis (p6)
          ═══════════════════════════════════════ */}
          {reportAthlete && result.terrain_sections.length > 0 && (() => {
            const firstName = reportAthlete.profile.athlete_key.split(" ")[0];
            const stl = (s: string, avgGrad?: number) => {
              if (avgGrad !== undefined) {
                if (s === "steep_climb"   && avgGrad >= 12) return "Very Steep Climb";
                if (s === "steep_descent" && avgGrad <= -12) return "Very Steep Descent";
              }
              return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            };
            const tl  = (t: string) => t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const pairingColor = (s: string) =>
              s.includes("climb") ? "#c0392b" : s.includes("descent") ? "#1565c0" : "#2e7d32";

            // Aggregate race demands
            const targetPairingMap: Record<string, { section_type: string; terrain: string; km: number; weightedGrad: number }> = {};
            for (const sec of result.terrain_sections) {
              const key = `${sec.section_type}|${sec.terrain}`;
              if (!targetPairingMap[key]) targetPairingMap[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0, weightedGrad: 0 };
              targetPairingMap[key].km          += sec.distance_km;
              targetPairingMap[key].weightedGrad += sec.avg_gradient_percent * sec.distance_km;
            }
            const targetList = Object.values(targetPairingMap)
              .map(tp => ({ ...tp, km: Math.round(tp.km * 10) / 10, avg_gradient: tp.km > 0 ? Math.round((tp.weightedGrad / tp.km) * 10) / 10 : 0 }))
              .filter(tp => tp.km >= 0.1)
              .sort((a, b) => b.km - a.km);

            const athleteExactMap: Record<string, number> = {};
            for (const p of reportAthlete.terrain_pairings ?? []) {
              athleteExactMap[`${p.section_type}|${p.terrain}`] = p.total_km;
            }

            const athleteCrossIndex: Record<string, Array<{ terrain: string; km: number }>> = {};
            for (const p of reportAthlete.terrain_pairings ?? []) {
              if (!athleteCrossIndex[p.section_type]) athleteCrossIndex[p.section_type] = [];
              athleteCrossIndex[p.section_type].push({ terrain: p.terrain, km: p.total_km });
            }

            const gapRows = targetList.map(tp => {
              const exactKm = Math.round((athleteExactMap[`${tp.section_type}|${tp.terrain}`] ?? 0) * 10) / 10;
              const crossEntries = (athleteCrossIndex[tp.section_type] ?? [])
                .filter(e => e.terrain !== tp.terrain)
                .sort((a, b) => b.km - a.km);
              const crossKm      = Math.round(crossEntries.reduce((s, e) => s + e.km, 0) * 10) / 10;
              const crossSurface = crossEntries.length > 0 ? crossEntries[0].terrain : null;
              const pct = tp.km > 0 ? Math.min(100, Math.round((exactKm / tp.km) * 100)) : 100;
              const status: "none" | "partial" | "met" | "surface_gap" =
                exactKm === 0 && crossKm > 0 ? "surface_gap" :
                exactKm === 0               ? "none" :
                pct >= 100                  ? "met" : "partial";
              return { ...tp, exactKm, crossKm, crossSurface, pct, status };
            });

            const noneCount       = gapRows.filter(r => r.status === "none").length;
            const surfaceGapCount = gapRows.filter(r => r.status === "surface_gap").length;
            const partialCount    = gapRows.filter(r => r.status === "partial").length;
            const metCount        = gapRows.filter(r => r.status === "met").length;

            const statusBadge = (row: (typeof gapRows)[0]) => {
              if (row.status === "met")          return { label: "Covered",       bg: "#e8f5e9", color: "#2e7d32" };
              if (row.status === "partial")      return { label: `${row.pct}% of demand`, bg: "#fff3e0", color: "#f57c00" };
              if (row.status === "surface_gap")  return { label: "Surface gap",   bg: "#fff3e0", color: "#e65100" };
              return                                    { label: "No experience", bg: "#fce4ec", color: "#c0392b" };
            };

            // Group rows by terrain, sort each group by race-needs km desc
            const terrainGroupMap: Record<string, typeof gapRows> = {};
            for (const row of gapRows) {
              if (!terrainGroupMap[row.terrain]) terrainGroupMap[row.terrain] = [];
              terrainGroupMap[row.terrain].push(row);
            }
            for (const rows of Object.values(terrainGroupMap)) {
              rows.sort((a, b) => b.km - a.km);
            }

            // Sort terrains by total uncovered km (biggest gap first)
            const terrainGapKm = (terrain: string) =>
              terrainGroupMap[terrain].reduce((s, r) => s + Math.max(0, r.km - r.exactKm), 0);
            const sortedTerrains = Object.keys(terrainGroupMap).sort((a, b) => terrainGapKm(b) - terrainGapKm(a));

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Terrain Gap Analysis</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>4 — Terrain Gap Analysis</h2>
                <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#888" }}>
                  Full gap table: race demands vs {firstName}&apos;s exact and cross-terrain experience
                </p>

                {/* Summary legend */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                  {[
                    { label: "Covered", bg: "#e8f5e9", color: "#2e7d32", n: metCount },
                    { label: "Partial", bg: "#fff3e0", color: "#f57c00", n: partialCount },
                    { label: "Surface gap", bg: "#fff3e0", color: "#e65100", n: surfaceGapCount },
                    { label: "No experience", bg: "#fce4ec", color: "#c0392b", n: noneCount },
                  ].map(({ label, bg, color, n }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontSize: "9px", fontWeight: 700, color, background: bg, padding: "1px 6px", borderRadius: "3px" }}>{label}</span>
                      <span style={{ fontSize: "9px", color: "#aaa" }}>({n})</span>
                    </div>
                  ))}
                </div>

                {sortedTerrains.map(terrain => {
                  const rows = terrainGroupMap[terrain];
                  const terrainGap = terrainGapKm(terrain);
                  const totalDemand = rows.reduce((s, r) => s + r.km, 0);
                  return (
                    <div key={terrain} style={{ marginBottom: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
                        <p style={{ ...sectionLabel, margin: 0 }}>{tl(terrain)}</p>
                        <span style={{ fontSize: "8.5px", color: terrainGap > 0 ? "#c0392b" : "#2e7d32", fontWeight: 600 }}>
                          {terrainGap > 0 ? `${terrainGap.toFixed(1)} km gap` : "Fully covered"}
                          {" · "}{totalDemand.toFixed(1)} km demanded
                        </span>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9.5px" }}>
                        <thead>
                          <tr style={{ background: "#f9f9f9" }}>
                            <th style={{ ...thStyle, fontSize: "9px" }}>Gradient</th>
                            <th style={{ ...thStyle, textAlign: "right", fontSize: "9px", width: "70px" }}>Race needs</th>
                            <th style={{ ...thStyle, textAlign: "right", fontSize: "9px", width: "70px" }}>You have</th>
                            <th style={{ ...thStyle, fontSize: "9px", width: "110px" }}>Status</th>
                            <th style={{ ...thStyle, fontSize: "9px", width: "90px" }}>Cross-terrain</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => {
                            const col   = pairingColor(row.section_type);
                            const badge = statusBadge(row);
                            return (
                              <tr key={`${row.section_type}|${row.terrain}`} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", breakInside: "avoid", pageBreakInside: "avoid" }}>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>
                                  <span style={{ color: col }}>{stl(row.section_type, row.avg_gradient)}</span>
                                  <div style={{ fontSize: "8px", color: "#aaa", fontWeight: 400, marginTop: "1px" }}>
                                    {row.avg_gradient > 0 ? "+" : ""}{row.avg_gradient.toFixed(1)}%
                                  </div>
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{row.km.toFixed(1)} km</td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                  <span style={{ color: row.exactKm > 0 ? "#333" : "#ccc", fontWeight: row.exactKm > 0 ? 600 : 400 }}>
                                    {row.exactKm > 0 ? `${row.exactKm.toFixed(1)} km` : "—"}
                                  </span>
                                </td>
                                <td style={tdStyle}>
                                  <span style={{ fontSize: "8.5px", fontWeight: 700, color: badge.color, background: badge.bg, padding: "1px 5px", borderRadius: "3px" }}>
                                    {badge.label}
                                  </span>
                                </td>
                                <td style={{ ...tdStyle, fontSize: "8.5px", color: "#888" }}>
                                  {row.crossSurface && row.crossKm > 0
                                    ? `${row.crossKm.toFixed(1)} km ${tl(row.crossSurface)}`
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}

                {/* Interpretation */}
                <div style={{ padding: "9px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: "4px solid #1e3a1e", borderRadius: "5px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>Reading this table</div>
                  <div style={{ fontSize: "9.5px", color: "#444", lineHeight: 1.5 }}>
                    Tables are grouped by terrain surface and ordered by size of gap. Within each table, rows are gradient buckets (Steep Climb, Mild Descent, etc.) sorted by race demand.
                    <strong> Race needs</strong> = total km of that surface at that gradient. <strong>You have</strong> = exact km at the same surface and gradient from confirmed race finishes.
                    <strong> Cross-terrain</strong> = km at the same gradient on a different surface — similar effort, different footing. A &ldquo;Surface gap&rdquo; means the gradient is covered but not on this surface.
                    {metCount > 0 && ` ${metCount} demand type${metCount !== 1 ? "s" : ""} fully covered.`}
                    {(noneCount + surfaceGapCount) > 0 && ` ${noneCount + surfaceGapCount} with no or only cross-terrain experience.`}
                  </div>
                </div>

                <div style={{ padding: "7px 10px", background: "#fffde7", border: "1px solid #fff176", borderRadius: "5px", fontSize: "8.5px", color: "#795500", lineHeight: 1.5 }}>
                  <strong>Caveat:</strong> Terrain classifications are derived from GPS track and database data. Local conditions (mud, loose rock, navigation difficulty) may make a section harder than the classification suggests. Use this table as a preparation guide, not a definitive race-day predictor.
                </div>

                <PageNumber n={7} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              5a — Pacing & Effort: Elevation  (p7)
          ═══════════════════════════════════════ */}
          {(elevProfile || terrainSummary.total > 0) && (
            <div className="rr-page" style={a4Page}>
              <div style={printHeader}>
                <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Pacing &amp; Effort</div>
                </div>
              </div>

              <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>5 — Pacing &amp; Effort Management</h2>
              <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
                {(() => {
                  const goalDist   = result.race.total_distance_km;
                  const goalAscent = result.race.total_ascent_m;
                  const goalPerKm  = goalDist > 0 && goalAscent > 0 ? goalAscent / goalDist : 0;
                  const base = `Elevation profile, climbing load distribution, and effort multipliers for ${result.race.name} — how the course is weighted and what that means for pacing.`;
                  if (goalPerKm === 0) return base;
                  const comparables = filteredAthleteRaces
                    .filter(r => r.total_distance_km && r.total_ascent_m && r.result_status === "FINISHED" &&
                      r.total_distance_km >= goalDist * 0.6 && r.total_distance_km <= goalDist * 1.4)
                    .map(r => ({ name: r.race_name, year: r.result_year, distKm: r.total_distance_km!, perKm: r.total_ascent_m! / r.total_distance_km! }))
                    .sort((a, b) => Math.abs(a.distKm - goalDist) - Math.abs(b.distKm - goalDist))
                    .slice(0, 1);
                  const goalPerKmRounded = Math.round(goalPerKm);
                  if (comparables.length === 0) return `${base} The course averages ${goalPerKmRounded} m of ascent per km.`;
                  const c1 = comparables[0];
                  const c1PerKm = Math.round(c1.perKm);
                  const pct1 = c1PerKm > 0 ? Math.round(((goalPerKmRounded - c1PerKm) / c1PerKm) * 100) : 0;
                  const compText = Math.abs(pct1) < 5
                    ? `${c1.name} (${c1.year}) averaged a similar ${c1PerKm} m/km.`
                    : pct1 > 0
                    ? `${c1.name} (${c1.year}) averaged ${c1PerKm} m/km — the goal race has ${pct1}% more climbing per km.`
                    : `${c1.name} (${c1.year}) averaged ${c1PerKm} m/km — the goal race has ${Math.abs(pct1)}% less climbing per km.`;
                  return `${base} The course averages ${goalPerKmRounded} m per km. ${compText}`;
                })()}
              </p>

              {elevProfile && (
                <div style={{ marginBottom: "14px" }}>
                  <p style={sectionLabel}>Course Elevation Profile</p>
                  <ElevationChart profile={elevProfile} notable={notable} aidStations={result.aid_stations ?? []} />
                  <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#aaa", lineHeight: 1.4 }}>
                    Aid stations shown as markers on the profile. Notable climbs and descents labelled. Use this profile to plan where to ease off, conserve, and push on race day.
                  </p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "14px" }}>
                <div>
                  <p style={sectionLabel}>Elevation Composition</p>
                  <TerrainBar label="Climbing"       km={terrainSummary.climbing}   pct={terrainSummary.total > 0 ? (terrainSummary.climbing   / terrainSummary.total) * 100 : 0} color="#c0392b" />
                  <TerrainBar label="Descending"     km={terrainSummary.descending} pct={terrainSummary.total > 0 ? (terrainSummary.descending / terrainSummary.total) * 100 : 0} color="#1565c0" />
                  <TerrainBar label="Flat / Rolling" km={terrainSummary.flat}       pct={terrainSummary.total > 0 ? (terrainSummary.flat       / terrainSummary.total) * 100 : 0} color="#546e7a" />
                  {halfwayAscentPct !== null && (
                    <p style={{ margin: "8px 0 0", fontSize: "10px", color: "#444", lineHeight: 1.55 }}>
                      {halfwayAscentPct > 55
                        ? `Front-loaded — ${halfwayAscentPct}% of total ascent arrives in the first half. Conserve on early climbs to protect the second half.`
                        : halfwayAscentPct < 45
                        ? `Back-loaded — only ${halfwayAscentPct}% of ascent in the first half, leaving ${100 - halfwayAscentPct}% for when fatigue is highest. Arriving at halfway with energy reserves is critical.`
                        : `Evenly loaded — ${halfwayAscentPct}% of ascent in the first half. Consistent output required throughout rather than front- or back-loading effort.`}
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

              {elevProfile && (
                <div style={{ marginBottom: "14px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "8px" }}>
                    Climbing Load Over Course
                    {halfwayAscentPct !== null ? ` — ${halfwayAscentPct}% of total ascent completed at halfway` : ""}
                  </p>
                  <CumulativeAscentChart
                    profile={elevProfile}
                    comparison={null}
                  />
                  <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#aaa", lineHeight: 1.4 }}>
                    Dashed markers show cumulative ascent at each quarter of distance. Late-loading courses are especially demanding because hard climbs arrive when the athlete is already fatigued.
                    {result.race.total_ascent_m != null && (
                      <span> Official course ascent: {Math.round(result.race.total_ascent_m).toLocaleString()} m. Chart uses GPX-smoothed values and may differ slightly.</span>
                    )}
                  </p>
                </div>
              )}


              <PageNumber n={8} />
            </div>
          )}

          {/* ═══════════════════════════════════════
              5b — Pacing & Effort: Analysis  (p8)
          ═══════════════════════════════════════ */}
          {secs.length > 0 && (
            <div className="rr-page" style={a4Page}>
              <div style={printHeader}>
                <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Pacing &amp; Effort (continued)</div>
                </div>
              </div>

              <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>5 — Pacing &amp; Effort (continued)</h2>
              <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
                Gradient distribution · Effort multiplier · Pacing complexity · Technical terrain timing
              </p>

              {/* Gradient histogram */}
              <div style={{ marginBottom: "16px" }}>
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Gradient Distribution — km at each slope band</p>
                <GradientHistogram sections={secs} />
                <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                  {GRAD_BANDS.map(b => (
                    <div key={b.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: b.color, opacity: 0.85, flexShrink: 0 }} />
                      <span style={{ fontSize: "9px", color: "#555" }}>{b.label}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "9px", color: "#aaa", lineHeight: 1.4 }}>
                  {totalKm > 0 ? (
                    <>
                      {runnablePct}% near-flat (within ±3%), {steepClimbPct}% steep uphill (≥8%), {steepDescentPct}% steep downhill (≥8%). This course is {courseCharacter}.
                      {runnablePct < 25 ? " A fixed pace target will not work — the athlete must manage effort by feel, shifting between climbing, descending, and recovery throughout." : ""}
                    </>
                  ) : "Shows how much of the route falls into each slope band."}
                </p>
              </div>

              {/* Effort profile */}
              <div style={{ marginBottom: "16px" }}>
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Section-by-Section Effort Multiplier — vs flat running</p>
                <EffortProfileChart sections={secs} totalKm={totalKm} />
                <div style={{ marginTop: "4px" }}>
                  <div style={{ fontSize: "9px", color: "#888", lineHeight: 1.4 }}>
                    <strong style={{ color: "#333" }}>Average effort multiplier: {effortRatio.toFixed(2)}×</strong>
                    {" — "}each kilometre costs approximately {effortRatio.toFixed(2)}× the energy of flat running on average.
                    Each bar shows that section&apos;s effort cost. <strong style={{ color: "#666" }}>Downhills are not free</strong> — steep descents demand hard eccentric quad loading that accumulates as muscle damage over the second half of the race.
                  </div>
                </div>
              </div>

              {/* Pacing complexity */}
              <div style={{ marginBottom: "14px" }}>
                <p style={{ ...sectionLabel, marginBottom: "8px" }}>Pacing Complexity &amp; Late-Race Load</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "10px" }}>
                  {[
                    { label: "Pacing complexity", value: complexityLabel, color: complexityColor, note: `CV = ${cvRatio.toFixed(2)}` },
                    { label: "Runnable terrain", value: `${runnablePct}%`, color: runnablePct > 50 ? "#2e7d32" : runnablePct > 25 ? "#f57c00" : "#c0392b", note: `${runnableKm.toFixed(0)} km flat sections` },
                    { label: "Avg effort multiplier", value: `${effortRatio.toFixed(2)}×`, color: effortRatio > 1.6 ? "#c0392b" : effortRatio > 1.3 ? "#f57c00" : "#2e7d32", note: "per km vs flat" },
                    { label: "Final-third effort", value: `${finalThirdEffort.toFixed(2)}×`, color: finalThirdEffort > effortRatio * 1.1 ? "#c0392b" : "#1e3a1e", note: finalThirdLen > 0 ? `${finalThirdLen.toFixed(0)} km at ${(finalThirdEffort).toFixed(2)}×` : "" },
                  ].map(({ label, value, color, note }) => (
                    <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 10px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
                      <div style={{ fontSize: "16px", fontWeight: 800, color }}>{value}</div>
                      {note && <div style={{ fontSize: "8px", color: "#bbb", marginTop: "2px" }}>{note}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ padding: "9px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: `4px solid ${complexityColor}`, borderRadius: "5px", fontSize: "10px", color: "#333", lineHeight: 1.5 }}>
                  {cvRatio > 0.45
                    ? `This is a high-complexity course — effort demand swings sharply between sections. A fixed heart-rate target or pace strategy will fail. The athlete must respond to terrain: hike aggressively on climbs, run conservatively on runnable sections, and manage descents as work, not recovery. Running by effort and perceived exertion is the only viable pacing strategy.`
                    : cvRatio > 0.25
                    ? `Moderate pacing complexity — the course has meaningful variation in effort demand but not constant extreme shifts. A broadly consistent effort target is achievable on runnable sections, with disciplined hiking on the steep climbs. Heart-rate zones provide a reasonable guide but expect them to spike on the climbs.`
                    : `Lower pacing complexity — effort demand is relatively consistent across the course. A heart-rate or effort-based strategy is viable. The priority is not to over-reach on any single section.`
                  }
                </div>
              </div>

              {/* Technical terrain analysis */}
              {(() => {
                const technicalSecs = secs.filter(s => s.terrain === "trail" || s.terrain === "fell" || s.terrain === "mountain" || s.terrain === "technical_trail");
                const totalTechnicalKm = Math.round(technicalSecs.reduce((sum, s) => sum + s.distance_km, 0) * 10) / 10;
                if (totalTechnicalKm === 0) return null;
                const lateThirdStart = totalKm * (2 / 3);
                const midThirdStart  = totalKm / 3;
                const lateTechnicalKm  = Math.round(technicalSecs.filter(s => s.start_km >= lateThirdStart).reduce((sum, s) => sum + s.distance_km, 0) * 10) / 10;
                const earlyTechnicalKm = Math.round(technicalSecs.filter(s => s.end_km <= midThirdStart).reduce((sum, s) => sum + s.distance_km, 0) * 10) / 10;
                const technicalPct     = totalKm > 0 ? Math.round((totalTechnicalKm / totalKm) * 100) : 0;

                let technicalSummary = "";
                let technicalAccent  = "#546e7a";
                if (lateTechnicalKm / totalTechnicalKm > 0.4) {
                  technicalAccent  = "#e65100";
                  technicalSummary = `${lateTechnicalKm} km of technical terrain arrives in the final third — when fatigue is highest and foot-placement errors are most likely. Specific preparation on this terrain type, especially late in long training runs, is essential.`;
                } else if (earlyTechnicalKm / totalTechnicalKm > 0.4) {
                  technicalAccent  = "#f57c00";
                  technicalSummary = `Most technical terrain is concentrated early. Going too hard on technical ground at the start compounds fatigue over the remainder of the course. Disciplined early pacing on technical sections is key.`;
                } else {
                  technicalSummary = `Technical terrain is distributed across the course. Consistent movement efficiency on variable ground is required throughout — no single section dominates.`;
                }
                return (
                  <div>
                    <p style={{ ...sectionLabel, marginBottom: "6px" }}>Technical Terrain Timing</p>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
                      {[
                        { label: "Technical km total", value: `${totalTechnicalKm} km` },
                        { label: "% of course",        value: `${technicalPct}%` },
                        { label: "In final third",     value: `${lateTechnicalKm} km` },
                        { label: "In first third",     value: `${earlyTechnicalKm} km` },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "5px", padding: "5px 10px", fontSize: "10px", background: "#fafafa" }}>
                          <div style={{ color: "#aaa", marginBottom: "1px" }}>{label}</div>
                          <div style={{ fontWeight: 700, color: "#1e3a1e", fontSize: "12px" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "#fafafa", border: "1px solid #e0e0e0", borderLeft: `4px solid ${technicalAccent}`, borderRadius: "6px", padding: "9px 12px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: technicalAccent, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>Technical Terrain Assessment</div>
                      <div style={{ fontSize: "10px", color: "#333", lineHeight: 1.5 }}>{technicalSummary}</div>
                    </div>
                  </div>
                );
              })()}

              <p style={{ margin: "14px 0 0", fontSize: "10px", color: "#888", lineHeight: 1.5, borderTop: "1px solid #f0f0f0", paddingTop: "10px" }}>
                The next page compares this course&apos;s pacing complexity against the athlete&apos;s previous races, using effort variability, gradient transitions, recovery scarcity, late-race complexity, and terrain overlap.
              </p>

              <PageNumber n={9} />
            </div>
          )}

          {/* ═══════════════════════════════════════
              5c — Pacing Complexity Comparison  (p9)
          ═══════════════════════════════════════ */}
          {secs.length > 0 && goalPacingComplexity?.has_sufficient_data && (() => {
            const goalPci = goalPacingComplexity;
            const pciColor = (score: number) =>
              score >= 76 ? "#c0392b" : score >= 51 ? "#e65100" : score >= 26 ? "#f57c00" : "#2e7d32";
            const goalColor = pciColor(goalPci.score);

            const prevWithData = filteredAthleteRaces
              .filter(r => r.result_status === "FINISHED" && r.pacing_complexity_index !== null)
              .sort((a, b) => (b.pacing_complexity_index ?? 0) - (a.pacing_complexity_index ?? 0));
            const prevWithoutData = filteredAthleteRaces
              .filter(r => r.result_status === "FINISHED" && r.pacing_complexity_index === null);

            const prevMax = prevWithData.length > 0 ? (prevWithData[0].pacing_complexity_index ?? 0) : null;
            const prevRaceAtMax = prevWithData[0]?.race_name ?? null;
            const delta = prevMax !== null ? goalPci.score - prevMax : null;
            const closestMatch = prevWithData.length > 0
              ? [...prevWithData].sort((a, b) =>
                  Math.abs((a.pacing_complexity_index ?? 0) - goalPci.score) -
                  Math.abs((b.pacing_complexity_index ?? 0) - goalPci.score)
                )[0]
              : null;

            const dominantKey = (Object.entries(goalPci.components) as [string, number][])
              .sort(([, a], [, b]) => b - a)[0][0];
            const mainReasonMap: Record<string, string> = {
              effort_variability:     "High variability in section effort cost",
              steep_transitions:      "Frequent steep climb/descent transitions",
              recovery_scarcity:      "Limited flat recovery between hard efforts",
              final_third_complexity: "Complex and demanding final third",
              terrain_overlap:        "Hard sections on non-road or fell terrain",
            };
            const mainReason = mainReasonMap[dominantKey] ?? "Multiple compounding factors";

            const componentRows: { label: string; key: keyof typeof goalPci.components; meaning: string }[] = [
              { label: "Effort variability",     key: "effort_variability",     meaning: "How much the energy cost per kilometre swings across the course. Low: effort is relatively consistent — a steady-state strategy is viable. High: cost changes sharply between sections and a fixed heart-rate or pace target will repeatedly break down." },
              { label: "Steep transitions",      key: "steep_transitions",      meaning: "How often the course switches between materially different gradient bands per 10 km. Low: long sustained sections with time to find a rhythm. High: the course changes character frequently, requiring constant mental and physical gear-changes." },
              { label: "Recovery scarcity",      key: "recovery_scarcity",      meaning: "How little flat or easy terrain sits between hard efforts — combining the ratio of recovery to hard ground with the length of the longest continuous hard stretch. Low: recovery sections break up the difficulty. High: hard terrain runs back-to-back with little relief in between." },
              { label: "Final-third complexity", key: "final_third_complexity", meaning: "Whether the course remains demanding and variable in its last third. Low: the finish section is more uniform or easier, allowing the athlete to consolidate. High: late-race sections are just as complex as the rest, when fatigue makes misjudgement most costly." },
              { label: "Non-road hard overlap",  key: "terrain_overlap",        meaning: "How much of the hard terrain falls on trail, fell, or mountain surfaces rather than road. Low: most of the difficult climbing and descending is on firm, predictable ground. High: steep or hard sections largely coincide with terrain that requires active foot placement and slows movement speed." },
              { label: "Sustained effort burden", key: "sustained_effort",      meaning: "How long the total pacing challenge must be held, based on the race's flat-equivalent energy cost. Low: a shorter or less demanding race where accumulated fatigue has limited time to compound. High: a long or tough race where every earlier pacing error narrows the margin available later." },
            ];

            let interpretationText = "";
            const firstName = reportAthlete?.profile.athlete_key.split(" ")[0] ?? "The athlete";
            if (prevWithData.length === 0) {
              interpretationText = `We can calculate pacing complexity for ${result?.race.name ?? "this race"}, but there is not enough route data in ${firstName}'s race history to compare it reliably against previous events. The score of ${goalPci.score}/100 (${goalPci.rating}) reflects effort variability, gradient transitions, recovery scarcity, and terrain overlap across this specific course.`;
            } else if (delta !== null && delta > 5) {
              interpretationText = `${result?.race.name ?? "This race"} is the most pacing-complex race in ${firstName}'s available history. The difficulty is not just the total distance or ascent — it is the repeated need to change effort. A fixed pace target is unlikely to work. Preparation should include long runs where steep climbs, technical descents, and short recovery sections are practised in sequence.`;
            } else if (delta !== null && Math.abs(delta) <= 5) {
              interpretationText = `This race is similar in pacing complexity to ${firstName}'s hardest previous race${prevRaceAtMax ? ` (${prevRaceAtMax})` : ""}. The demands are familiar in pattern, but still need respecting because the total distance and vertical load may be higher. The pacing challenge is not new territory, but execution under greater fatigue is.`;
            } else {
              interpretationText = `${firstName} has already completed a race with similar or greater pacing complexity${prevRaceAtMax ? ` (${prevRaceAtMax})` : ""}. The key question is whether ${firstName} can handle this complexity at the goal race's distance and vertical load. The pattern of effort adjustment should feel manageable, but volume and vertical demand may still stretch capacity.`;
            }

            const tableRows = [
              { name: result?.race.name ?? "Goal race", score: goalPci.score, rating: goalPci.rating, isGoal: true },
              ...prevWithData.slice(0, 5).map(r => ({
                name: `${r.race_name}${r.result_year ? ` (${r.result_year})` : ""}`,
                score: r.pacing_complexity_index ?? 0,
                rating: r.pacing_complexity_index !== null
                  ? (r.pacing_complexity_index >= 76 ? "Very High" : r.pacing_complexity_index >= 51 ? "High" : r.pacing_complexity_index >= 26 ? "Moderate" : "Low")
                  : "—",
                isGoal: false,
              })),
            ];

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result?.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Pacing Complexity Comparison</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>5c — Pacing Complexity Comparison</h2>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#555", lineHeight: 1.5 }}>
                  How difficult this course is to manage compared with your previous races
                </p>

                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "14px" }}>
                  {[
                    {
                      label: "Goal race complexity",
                      value: `${goalPci.score} / 100`,
                      sub: goalPci.rating,
                      color: goalColor,
                    },
                    {
                      label: "Previous race max",
                      value: prevMax !== null ? `${prevMax} / 100` : "—",
                      sub: prevRaceAtMax ?? "No data",
                      color: prevMax !== null ? pciColor(prevMax) : "#aaa",
                    },
                    {
                      label: "vs previous max",
                      value: delta !== null
                        ? `${delta >= 0 ? "+" : ""}${delta} pts`
                        : "No comparison",
                      sub: delta !== null
                        ? delta > 5 ? "New high" : delta < -5 ? "Below previous high" : "Similar level"
                        : "Insufficient route data",
                      color: delta !== null ? (delta > 5 ? "#c0392b" : delta < -5 ? "#2e7d32" : "#f57c00") : "#aaa",
                    },
                    {
                      label: "Main complexity driver",
                      value: mainReason,
                      sub: `Highest sub-score: ${goalPci.components[dominantKey as keyof typeof goalPci.components]}`,
                      color: goalColor,
                      small: true,
                    },
                  ].map(({ label, value, sub, color, small }) => (
                    <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 10px", background: "#fafafa", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: "#888", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
                      <div style={{ fontSize: small ? "10px" : "15px", fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
                      {sub && <div style={{ fontSize: "8px", color: "#bbb", marginTop: "2px" }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Comparison table */}
                <div style={{ marginBottom: "14px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "6px" }}>Pacing Complexity — Goal Race vs Previous Races</p>
                  {prevWithData.length === 0 ? (
                    <div style={{ padding: "10px 14px", background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "5px", fontSize: "10px", color: "#888" }}>
                      No previous races with route section data are available for comparison.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                      <thead>
                        <tr style={{ background: "#f5f5f5" }}>
                          <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0" }}>Race</th>
                          <th style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0", width: "80px" }}>Score</th>
                          <th style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0", width: "70px" }}>Rating</th>
                          <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0" }}>Complexity bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row, i) => (
                          <tr key={i} style={{ borderLeft: row.isGoal ? `3px solid ${goalColor}` : "3px solid transparent", background: row.isGoal ? "#f0f7f0" : i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "5px 8px", color: row.isGoal ? "#1e3a1e" : "#333", fontWeight: row.isGoal ? 700 : 400, borderBottom: "1px solid #f0f0f0" }}>{row.name}</td>
                            <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: pciColor(row.score), borderBottom: "1px solid #f0f0f0" }}>{row.score}</td>
                            <td style={{ padding: "5px 8px", textAlign: "center", color: pciColor(row.score), borderBottom: "1px solid #f0f0f0", fontSize: "9px", fontWeight: 600 }}>{row.rating}</td>
                            <td style={{ padding: "5px 8px", borderBottom: "1px solid #f0f0f0" }}>
                              <div style={{ background: "#eee", borderRadius: "3px", height: "8px", width: "100%", overflow: "hidden" }}>
                                <div style={{ background: pciColor(row.score), height: "100%", width: `${row.score}%`, borderRadius: "3px", transition: "width 0.3s" }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Component breakdown */}
                <div style={{ marginBottom: "14px" }}>
                  <p style={{ ...sectionLabel, marginBottom: "6px" }}>Goal Race — Component Breakdown</p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                    <thead>
                      <tr style={{ background: "#f5f5f5" }}>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0" }}>Component</th>
                        <th style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0", width: "50px" }}>Score</th>
                        <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: "#555", borderBottom: "1px solid #e0e0e0" }}>What it means</th>
                      </tr>
                    </thead>
                    <tbody>
                      {componentRows.map((row, i) => {
                        const s = goalPci.components[row.key];
                        return (
                          <tr key={row.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "5px 8px", color: "#333", borderBottom: "1px solid #f0f0f0", fontWeight: row.key === dominantKey ? 700 : 400 }}>{row.label}{row.key === dominantKey ? " ★" : ""}</td>
                            <td style={{ padding: "5px 8px", textAlign: "center", fontWeight: 700, color: pciColor(s), borderBottom: "1px solid #f0f0f0" }}>{s}</td>
                            <td style={{ padding: "5px 8px", color: "#555", borderBottom: "1px solid #f0f0f0" }}>{row.meaning}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p style={{ margin: "4px 0 0", fontSize: "8px", color: "#aaa" }}>★ Highest-scoring component — the dominant source of pacing complexity on this course.</p>
                </div>

                {/* Interpretation box */}
                <div style={{ padding: "10px 14px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: `4px solid ${goalColor}`, borderRadius: "5px", fontSize: "10px", color: "#333", lineHeight: 1.6, marginBottom: "10px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: goalColor, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>What this means for preparation</div>
                  {interpretationText}
                  {closestMatch && closestMatch.race_name !== prevRaceAtMax && (
                    <div style={{ marginTop: "6px", fontSize: "9px", color: "#888" }}>
                      Closest complexity match in race history: <strong>{closestMatch.race_name}</strong> ({closestMatch.pacing_complexity_index}/100).
                    </div>
                  )}
                </div>

                {/* Data note */}
                {prevWithoutData.length > 0 && (
                  <div style={{ padding: "7px 12px", background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "4px", fontSize: "9px", color: "#999", lineHeight: 1.5 }}>
                    Pacing complexity comparison is only shown for races where route profile data is available.
                    {" "}{prevWithoutData.length} previous race{prevWithoutData.length !== 1 ? "s" : ""} {prevWithoutData.length !== 1 ? "are" : "is"} excluded from this comparison (no route section data recorded).
                  </div>
                )}

                <PageNumber n={10} />
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════
              6 — Aid Station & Logistics  (p9)
          ═══════════════════════════════════════ */}
          {reportAthlete && (() => {
            const stations: AidStation[] = result.aid_stations ?? [];
            const sorted = [...stations].sort((a, b) => a.km - b.km);
            const stops  = [0, ...sorted.map(s => s.km), totalKm];
            const gaps   = stops.slice(1).map((km, i) => ({ km, gapKm: km - stops[i], fromKm: stops[i] }));
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
            if (!hasFood) flags.push({ color: "#c0392b", bg: "#fce4ec", border: "#ffcdd2", text: "No food provided at any aid station — athlete must carry all race nutrition." });
            if (!hasDropBag && totalKm > 50) flags.push({ color: "#e65100", bg: "#fff3e0", border: "#ffe0b2", text: `No drop bag support on a ${totalKm.toFixed(0)} km race — confirm kit and nutrition strategy accounts for full self-sufficiency.` });
            const longRunGaps = gaps.filter(g => g.gapKm > 10);
            if (longRunGaps.length >= 3) flags.push({ color: "#e65100", bg: "#fff3e0", border: "#ffe0b2", text: `${longRunGaps.length} gaps exceed 10 km — a hydration pack may be worth considering over handheld bottles.` });

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Aid Station Analysis</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>6 — Aid Station &amp; Logistics</h2>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                  Gap analysis and logistics preparation for {result.race.name}
                </p>

                {stations.length === 0 ? (
                  <div style={{ padding: "24px", border: "1px dashed #d1d5db", borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontSize: "13px", color: "#9ca3af", marginBottom: 6 }}>No aid station data recorded for this race.</div>
                    <div style={{ fontSize: "11px", color: "#bbb" }}>Add stations via <em>Admin → Aid Stations</em> or the race editor.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "14px" }}>
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

                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Course Layout</div>
                      <div style={{ position: "relative", height: "20px", background: "#e8f5e9", borderRadius: 4, overflow: "visible" }}>
                        {sorted.map((s, i) => {
                          const pct = totalKm > 0 ? (s.km / totalKm) * 100 : 0;
                          return (
                            <div key={i} title={`${s.name ?? `Station ${i+1}`} — ${s.km.toFixed(1)} km`} style={{ position: "absolute", left: `${pct}%`, top: "-3px", transform: "translateX(-50%)", width: 6, height: 26, background: "#2e7d32", borderRadius: 2 }} />
                          );
                        })}
                        {gaps.map((g, i) => {
                          if (g.gapKm < 3) return null;
                          const midPct = totalKm > 0 ? ((g.fromKm + g.gapKm / 2) / totalKm) * 100 : 0;
                          return (
                            <div key={i} style={{ position: "absolute", left: `${midPct}%`, top: "24px", transform: "translateX(-50%)", fontSize: "7px", color: g.gapKm > 15 ? "#c0392b" : "#666", whiteSpace: "nowrap" }}>
                              {g.gapKm.toFixed(1)} km
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "7.5px", color: "#999", marginTop: "22px" }}>
                        <span>Start (0 km)</span>
                        <span>Finish ({totalKm.toFixed(0)} km)</span>
                      </div>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ fontSize: "8.5px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Stations</div>
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

                    {flags.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginBottom: "10px" }}>
                        {flags.map((f, i) => (
                          <div key={i} style={{ padding: "7px 10px", background: f.bg, border: `1px solid ${f.border}`, borderLeft: `3px solid ${f.color}`, borderRadius: "5px", fontSize: "10px", color: f.color, lineHeight: 1.4 }}>
                            {f.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Interpretation */}
                    <div style={{ padding: "9px 12px", background: "#f8f8f8", border: "1px solid #e8e8e8", borderLeft: "4px solid #1e3a1e", borderRadius: "5px", fontSize: "10px", color: "#333", lineHeight: 1.5 }}>
                      {maxGap > 20
                        ? `The longest unsupported stretch of ${maxGap.toFixed(1)} km is significant. Arriving at the preceding station with a full water carry and calories for ${Math.ceil(maxGap / 6)} hours of running is essential. Practise this carrying load in training before race day — do not test your hydration strategy for the first time on the course.`
                        : maxGap > 12
                        ? `The ${maxGap.toFixed(1)} km maximum gap is manageable but requires active attention. Treat each preceding station as a refuelling stop even if you do not feel you need it — the gap ahead may be longer than expected.`
                        : `Aid station spacing is manageable throughout — no gap exceeds 12 km. The logistics focus should be on station management efficiency (in and out quickly) and using each station to top up rather than waiting until low.`
                      }
                    </div>
                  </>
                )}

                <PageNumber n={11} />
              </div>
            );
          })()}


          {/* ═══════════════════════════════════════
              7 — Physical Readiness Checks  (p10)
          ═══════════════════════════════════════ */}
          {reportAthlete && assessmentTests.length > 0 && (() => {
            const athleteMap: Record<string, number> = {};
            for (const p of reportAthlete.terrain_pairings ?? []) {
              const k = `${p.section_type}|${p.terrain}`;
              athleteMap[k] = (athleteMap[k] ?? 0) + p.total_km;
            }
            const dims = {
              uphill:   { demand: 0, gap: 0 },
              downhill: { demand: 0, gap: 0 },
              technical:{ demand: 0, gap: 0 },
              gravel:   { demand: 0, gap: 0 },
            };
            for (const sec of result?.terrain_sections ?? []) {
              const covered = athleteMap[`${sec.section_type}|${sec.terrain}`] ?? 0;
              const gap = Math.max(0, sec.distance_km - covered);
              if (sec.section_type.includes("climb"))   { dims.uphill.demand   += sec.distance_km; dims.uphill.gap   += gap; }
              if (sec.section_type.includes("descent")) { dims.downhill.demand += sec.distance_km; dims.downhill.gap += gap; }
              if (sec.terrain === "technical_trail")    { dims.technical.demand+= sec.distance_km; dims.technical.gap+= gap; }
              if (sec.terrain === "gravel")             { dims.gravel.demand   += sec.distance_km; dims.gravel.gap   += gap; }
            }
            const w = {
              uphill:            dims.uphill.demand   > 0 ? Math.min(1, dims.uphill.gap   / dims.uphill.demand)   : 0,
              downhill:          dims.downhill.demand > 0 ? Math.min(1, dims.downhill.gap / dims.downhill.demand) : 0,
              technical:         dims.technical.demand> 0 ? Math.min(1, dims.technical.gap/ dims.technical.demand): 0,
              gravel_stability:  dims.gravel.demand   > 0 ? Math.min(1, dims.gravel.gap   / dims.gravel.demand)   : 0,
              general_asymmetry: Math.min(1, 0.4 + (reportAthlete.profile.dnf_rate ?? 0) * 0.6),
            };

            const DIM_META: { key: keyof typeof w; ratingKey: keyof AssessmentTest; label: string }[] = [
              { key: "uphill",            ratingKey: "rating_uphill",            label: "Uphill" },
              { key: "downhill",          ratingKey: "rating_downhill",          label: "Downhill" },
              { key: "technical",         ratingKey: "rating_technical",         label: "Technical" },
              { key: "gravel_stability",  ratingKey: "rating_gravel_stability",  label: "Gravel stability" },
              { key: "general_asymmetry", ratingKey: "rating_general_asymmetry", label: "General asymmetry" },
            ];

            type ScoredTest = { test: AssessmentTest; score: number; gapTags: string[] };
            const scored: ScoredTest[] = assessmentTests.map(test => {
              let score = 0;
              for (const { key, ratingKey } of DIM_META) {
                const rating = (test[ratingKey] as number | null) ?? 0;
                score += rating * w[key];
              }
              const gapTags = DIM_META
                .map(({ key, ratingKey, label }) => {
                  const rating = (test[ratingKey] as number | null) ?? 0;
                  return { label, rating, contribution: rating * w[key] };
                })
                .filter(t => t.rating >= 4 && t.contribution > 0)
                .sort((a, b) => b.contribution - a.contribution)
                .slice(0, 3)
                .map(t => t.label);
              return { test, score, gapTags };
            }).sort((a, b) => b.score - a.score);

            const hasGaps = Object.values(w).some(v => v > 0.25);
            const priorityCount = hasGaps ? Math.min(5, Math.ceil(assessmentTests.length / 2)) : 0;
            const priorityItems = scored.slice(0, priorityCount).filter(s => s.score > 0);
            const optionalItems = scored.slice(priorityItems.length);

            const activeGapLabels = DIM_META
              .filter(({ key }) => w[key] >= 0.25)
              .map(({ label }) => label.toLowerCase());
            const gapSentence = activeGapLabels.length > 0
              ? `Based on ${activeGapLabels.slice(0, -1).join(", ")}${activeGapLabels.length > 1 ? " and " : ""}${activeGapLabels[activeGapLabels.length - 1]} gaps identified in your experience analysis, the following tests are most relevant.`
              : "Complete the tests below to build a full picture of your physical readiness.";

            const catColor = (cat: string | null) =>
              cat === "strength" ? "#1565c0" : cat === "imbalance" ? "#c0392b" : cat === "flexibility" ? "#2e7d32" : "#4a148c";
            const catLabel = (cat: string | null) =>
              cat === "strength" ? "Strength" : cat === "imbalance" ? "Imbalance" : cat === "flexibility" ? "Flexibility" : "General";

            const renderCard = ({ test, gapTags }: ScoredTest, showTags: boolean) => {
              const color = catColor(test.category);
              return (
                <div key={test.id} style={{ border: "1px solid #e8e8e8", borderLeft: `4px solid ${color}`, borderRadius: "6px", padding: "10px 14px", background: "#fafafa", breakInside: "avoid", pageBreakInside: "avoid" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#111" }}>{test.name}</div>
                    <span style={{ fontSize: "9px", fontWeight: 600, color, background: `${color}18`, padding: "1px 7px", borderRadius: "4px", whiteSpace: "nowrap", marginLeft: "8px", flexShrink: 0 }}>
                      {catLabel(test.category)}
                    </span>
                  </div>
                  {showTags && gapTags.length > 0 && (
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "6px" }}>
                      {gapTags.map(tag => (
                        <span key={tag} style={{ fontSize: "9px", fontWeight: 600, color: "#b45309", background: "#fffbeb", padding: "1px 6px", borderRadius: "10px", border: "1px solid #fde68a" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {test.aim && (
                    <div style={{ fontSize: "10px", color, fontWeight: 600, marginBottom: "6px" }}>Identifies: {test.aim}</div>
                  )}
                  {test.description && (
                    <div style={{ fontSize: "10px", color: "#666", lineHeight: 1.5, marginBottom: "6px" }}>{test.description}</div>
                  )}
                  {test.instructions.length > 0 && (
                    <ol style={{ margin: "0 0 6px", paddingLeft: "18px", listStyleType: "decimal" }}>
                      {test.instructions.map((step, i) => (
                        <li key={i} style={{ fontSize: "10px", color: "#444", lineHeight: 1.6, marginBottom: "1px" }}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {test.what_to_record && (
                    <div style={{ fontSize: "10px", color: "#555", background: "#f0f4f0", borderRadius: "4px", padding: "5px 8px", marginTop: "4px" }}>
                      <span style={{ fontWeight: 600 }}>Record: </span>{test.what_to_record}
                    </div>
                  )}
                  {test.notes && (
                    <div style={{ fontSize: "10px", color: "#888", fontStyle: "italic", marginTop: "4px" }}>{test.notes}</div>
                  )}
                </div>
              );
            };

            const dashboardUrl = "https://www.tortoiseendurance.com/dashboard";
            const dashboardQrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(dashboardUrl)}`;

            const recordingCta = (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "#f0f4f0", border: "1px solid #c8d8c8", borderLeft: "4px solid #1e3a1e", borderRadius: "6px", marginTop: "16px", breakInside: "avoid", pageBreakInside: "avoid" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a1e", marginBottom: "3px" }}>Record your results</div>
                  <div style={{ fontSize: "10px", color: "#555", lineHeight: 1.5, marginBottom: "4px" }}>
                    Log your assessment results in your athlete dashboard to track improvements over time.
                  </div>
                  <div style={{ fontSize: "8.5px", color: "#aaa" }}>tortoiseendurance.com/dashboard</div>
                </div>
                <div style={{ textAlign: "center", marginLeft: "16px", flexShrink: 0 }}>
                  <img src={dashboardQrSrc} alt="QR — athlete dashboard" width={80} height={80} style={{ display: "block", borderRadius: "3px" }} />
                  <div style={{ fontSize: "7.5px", color: "#aaa", marginTop: "2px" }}>Scan to open</div>
                </div>
              </div>
            );

            return (
              <>
                {/* ── Page 10: Priority assessments ─────────────────────── */}
                <div className="rr-page" style={a4Page}>
                  <div style={printHeader}>
                    <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{reportAthlete.profile.athlete_key}</div>
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Physical Self-Assessments</div>
                    </div>
                  </div>

                  <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>7 — Physical Self-Assessments</h2>
                  <p style={{ margin: "0 0 16px", fontSize: "12px", color: "#888" }}>
                    Tests to identify strength gaps, imbalances, and flexibility limitations that may not be visible in race data.
                  </p>

                  {priorityItems.length > 0 ? (
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "2px solid #f59e0b", paddingBottom: "4px", marginBottom: "6px" }}>
                        Priority assessments
                      </div>
                      <p style={{ margin: "0 0 10px", fontSize: "10.5px", color: "#666", lineHeight: 1.5 }}>{gapSentence}</p>
                      <div className="rr-card-stack" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {priorityItems.map(s => renderCard(s, true))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "14px", background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "6px", fontSize: "10.5px", color: "#666", lineHeight: 1.5 }}>
                      No priority assessments identified based on the current gap profile. All tests are listed on the next page.
                    </div>
                  )}

                  {/* Only show recording CTA here when there are no optional items (single-page mode) */}
                  {optionalItems.length === 0 && recordingCta}

                  <PageNumber n={12} />
                </div>

                {/* ── Page 11: Optional assessments + recording CTA ─────── */}
                <div className="rr-page" style={a4Page}>
                  <div style={printHeader}>
                    <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{reportAthlete.profile.athlete_key}</div>
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Physical Self-Assessments</div>
                    </div>
                  </div>

                  <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>7 — Physical Self-Assessments (continued)</h2>
                  <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                    Additional tests covering areas not highlighted by your specific gap profile.
                  </p>

                  {optionalItems.length > 0 ? (
                    <div style={{ marginBottom: "6px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "2px solid #ddd", paddingBottom: "4px", marginBottom: "6px" }}>
                        {priorityItems.length > 0 ? "For a fuller picture" : "All assessments"}
                      </div>
                      {priorityItems.length > 0 && (
                        <p style={{ margin: "0 0 10px", fontSize: "10.5px", color: "#666", lineHeight: 1.5 }}>
                          These tests cover areas not highlighted by your specific gap profile but may reveal underlying physical limitations worth monitoring.
                        </p>
                      )}
                      <div className="rr-card-stack" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {optionalItems.map(s => renderCard(s, false))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "14px", background: "#fafafa", border: "1px solid #e8e8e8", borderRadius: "6px", fontSize: "10.5px", color: "#666", lineHeight: 1.5, marginBottom: "6px" }}>
                      No additional assessments beyond those shown on the previous page.
                    </div>
                  )}

                  {recordingCta}

                  <PageNumber n={13} />
                </div>

                {/* ── Page 12: Assessment results recording table ─────── */}
                <div className="rr-page" style={a4Page}>
                  <div style={printHeader}>
                    <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{reportAthlete.profile.athlete_key}</div>
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Assessment Results</div>
                    </div>
                  </div>

                  <h2 style={{ margin: "0 0 2px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>7 — Assessment Results</h2>
                  <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                    Use this page to record your results. Where a test measures each side separately, a row is provided for each.
                  </p>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                    <thead>
                      <tr style={{ background: "#1e3a1e" }}>
                        <th style={{ textAlign: "left", padding: "7px 10px", fontSize: "9px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em", width: "44%" }}>Assessment</th>
                        <th style={{ textAlign: "center", padding: "7px 6px", fontSize: "9px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em", width: "7%" }}>Side</th>
                        <th style={{ textAlign: "left", padding: "7px 10px", fontSize: "9px", fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scored.flatMap(({ test }, idx) => {
                        const hasSides = test.what_to_record
                          ? /left|right|each side|each leg|each foot|each arm|both sides/i.test(test.what_to_record)
                          : false;
                        const bg = idx % 2 === 0 ? "#fff" : "#f7f9f7";
                        const nameTd = (span: number) => (
                          <td rowSpan={span} style={{ padding: "9px 10px", borderBottom: "1px solid #ddd", verticalAlign: "top", background: bg }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a1e", lineHeight: 1.4 }}>{test.name}</div>
                            {test.what_to_record && (
                              <div style={{ fontSize: "8.5px", color: "#777", marginTop: "2px", lineHeight: 1.3 }}>{test.what_to_record}</div>
                            )}
                          </td>
                        );
                        const sideTd = (label: string) => (
                          <td style={{ padding: "9px 6px", borderBottom: "1px solid #ddd", verticalAlign: "middle", textAlign: "center", fontSize: "9px", fontWeight: 700, color: "#555", background: bg }}>
                            {label}
                          </td>
                        );
                        const mkResultTd = () => (
                          <td style={{ padding: "9px 10px", borderBottom: "1px solid #ddd", verticalAlign: "bottom", background: bg }}>
                            <div style={{ borderBottom: "1px solid #bbb", height: "20px" }} />
                          </td>
                        );
                        if (hasSides) {
                          return [
                            <tr key={`${test.id}-L`}>{nameTd(2)}{sideTd("L")}{mkResultTd()}</tr>,
                            <tr key={`${test.id}-R`}>{sideTd("R")}{mkResultTd()}</tr>,
                          ];
                        }
                        return [<tr key={test.id}>{nameTd(1)}{sideTd("")}{mkResultTd()}</tr>];
                      })}
                    </tbody>
                  </table>

                  <PageNumber n={14} />
                </div>
              </>
            );
          })()}


          {/* ═══════════════════════════════════════
              8 — Suggested Preparation Priorities  (p11)
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

            const raceTerrainsKm: Record<string, number> = {};
            for (const sec of result.terrain_sections) {
              raceTerrainsKm[sec.terrain] = (raceTerrainsKm[sec.terrain] ?? 0) + sec.distance_km;
            }
            const athleteExact: Record<string, number> = {};
            for (const tp of reportAthlete.terrain_pairings ?? []) {
              athleteExact[`${tp.section_type}|${tp.terrain}`] = tp.total_km;
            }
            const terrainGaps = new Set<string>();
            for (const sec of result.terrain_sections) {
              if (sec.distance_km < 0.1) continue;
              const exact = athleteExact[`${sec.section_type}|${sec.terrain}`] ?? 0;
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

            if (longestDist > 0 && longestDist < totalKm * 0.6) {
              steps.push({ category: "Training Load", title: "Build race-distance capacity", detail: `Your longest race on record is ${longestDist.toFixed(0)} km — the goal race is ${totalKm.toFixed(0)} km. Prioritise progressive long runs and back-to-back training days. Your longest effort should reach at least ${Math.round(totalKm * 0.7)} km before race day.`, priority: "high" });
            } else if (longestDist > 0 && longestDist < totalKm * 0.8) {
              steps.push({ category: "Training Load", title: "Close the final distance gap", detail: `Your longest race is ${longestDist.toFixed(0)} km vs the ${totalKm.toFixed(0)} km target. A long race or linked training day in the build-up will bridge this.`, priority: "medium" });
            }

            if (totalAscentM > 500 && highestAscent < totalAscentM * 0.5) {
              steps.push({ category: "Strength & Conditioning", title: "Develop quad strength for climbing", detail: `The race requires ${Math.round(totalAscentM).toLocaleString()} m of ascent; career best in a single race is ${Math.round(highestAscent).toLocaleString()} m. Add loaded step-ups, uphill repeats, and weighted split squats.`, priority: "high" });
            } else if (totalAscentM > 1500) {
              steps.push({ category: "Strength & Conditioning", title: "Maintain climbing-specific conditioning", detail: `With ${Math.round(totalAscentM).toLocaleString()} m of ascent on course, uphill-specific conditioning should form a regular part of your training throughout the build.`, priority: "medium" });
            }

            if (totalSteepDescentKm > 5) {
              steps.push({ category: "Strength & Conditioning", title: "Eccentric loading for steep descents", detail: `The course has ${totalSteepDescentKm.toFixed(1)} km of steep descent. Add downhill running repeats, eccentric step-downs, and loaded single-leg heel drops to build resilience.`, priority: totalSteepDescentKm > 12 ? "high" : "medium" });
            }

            if (gravelGap || technicalGap) {
              steps.push({ category: "Strength & Conditioning", title: "Ankle stability for uneven terrain", detail: `The course includes ${[hasGravel && "gravel", hasTechnical && "technical/rocky terrain"].filter(Boolean).join(" and ")} with limited experience in your history. Add single-leg balance progressions, resistance band eversion work, and trail-over-road training.`, priority: "high" });
            }

            if (technicalGap) {
              steps.push({ category: "Terrain Specificity", title: "Seek technical trail exposure", detail: "The race includes rocky, technical terrain with no direct precedent in your recent race history. Technical trail confidence requires specific exposure; it cannot be developed on road or groomed trail.", priority: "high" });
            }

            if (hasSand) {
              steps.push({ category: "Terrain Specificity", title: "Practise on sand", detail: "Sand running costs significantly more energy per kilometre than any other surface. One or two beach runs before race day will calibrate your effort expectations.", priority: "medium" });
            }

            if (secs.length > 0 && runnablePct < 30) {
              steps.push({ category: "Terrain Specificity", title: "Practise efficient power hiking", detail: `Only ${runnablePct}% of the course is near-flat — most athletes will hike the majority of the climbing. Practise uphill hiking at race effort, focusing on arm drive and cadence.`, priority: "medium" });
            }

            if (recentRaces.length < 2) {
              steps.push({ category: "Race Preparation", title: "Enter a warm-up race", detail: "Limited recent competitive form on record. A build-up race (ideally on similar terrain, 4-10 weeks out) will help calibrate nutrition, race management, and equipment.", priority: "medium" });
            }

            if (effortRatio > 1.4) {
              steps.push({ category: "Race Preparation", title: "Train by effort, not pace", detail: `The course's average effort multiplier is ${effortRatio.toFixed(2)}× — pace is meaningless as a metric here. Train using perceived effort and heart rate. Practise this in long training runs well before race day.`, priority: "medium" });
            }

            if (totalKm > 50) {
              steps.push({ category: "Race Preparation", title: "Build a fuelling strategy", detail: `For a ${totalKm.toFixed(0)} km race, active fuelling is non-negotiable. Target 60-90 g carbohydrate per hour above 3-4 hours, practised at race pace in your long sessions.`, priority: totalKm > 80 ? "high" : "medium" });
            }

            if (hasTechnical || (hasGravel && gravelGap)) {
              steps.push({ category: "Equipment", title: "Confirm footwear for the terrain", detail: `The course includes ${[hasTechnical && "technical rocky sections", hasGravel && "gravel tracks"].filter(Boolean).join(" and ")}. Ensure your race shoes provide ${hasTechnical ? "a rock plate and maximum grip" : "adequate grip on loose surfaces"}. Test your footwear on comparable terrain before race day.`, priority: "medium" });
            }

            if (result.aid_stations && result.aid_stations.length > 0) {
              const sortedStations = [...result.aid_stations].sort((a, b) => a.km - b.km);
              const aidStops = [0, ...sortedStations.map((s: AidStation) => s.km), totalKm];
              const aidGapsLocal = aidStops.slice(1).map((km, i) => km - aidStops[i]);
              const maxAidGap = Math.max(...aidGapsLocal);
              if (maxAidGap > 15) {
                steps.push({ category: "Race Preparation", title: "Carry nutrition for long unsupported stretches", detail: `The longest gap between aid stations is ${maxAidGap.toFixed(1)} km. ${maxAidGap > 20 ? "Carry water and calories to cover this stretch safely." : "Take a gel or snack at the preceding station."} Practise carrying nutrition at race pace in your long training runs.`, priority: maxAidGap > 20 ? "high" : "medium" });
              }
              if (!sortedStations.some((s: AidStation) => s.food)) {
                steps.push({ category: "Race Preparation", title: "No food at aid stations — carry all nutrition", detail: "None of the recorded aid stations offer food. Calculate your carbohydrate needs (60-90 g/hr above 3 hours) and test your carrying strategy in training.", priority: "high" });
              }
            }

            if (steps.length === 0) return null;

            const priorityOrder: Record<NextStep["priority"], number> = { high: 0, medium: 1, low: 2 };
            const sortedSteps = [...steps].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
            const priorityStyle: Record<NextStep["priority"], { dot: string; label: string; bg: string; border: string }> = {
              high:   { dot: "#c0392b", label: "Priority",    bg: "#fce4ec", border: "#ffcdd2" },
              medium: { dot: "#e65100", label: "Recommended", bg: "#fff3e0", border: "#ffe0b2" },
              low:    { dot: "#1565c0", label: "Maintenance", bg: "#e3f2fd", border: "#bbdefb" },
            };

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Preparation Priorities</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>8 — Suggested Preparation Priorities</h2>
                <p style={{ margin: "0 0 14px", fontSize: "12px", color: "#888" }}>
                  Specific preparation actions derived from gap analysis and course demands
                </p>

                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "9.5px" }}>
                  <thead>
                    <tr style={{ background: "#f9f9f9" }}>
                      <th style={{ ...thStyle, width: "80px", fontSize: "9px" }}>Priority</th>
                      <th style={thStyle}>Action</th>
                      <th style={{ ...thStyle, width: "130px", fontSize: "9px" }}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSteps.map((step, i) => {
                      const ps = priorityStyle[step.priority];
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", breakInside: "avoid", pageBreakInside: "avoid" }}>
                          <td style={{ ...tdStyle }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: ps.dot, display: "inline-block", flexShrink: 0 }} />
                              <span style={{ fontSize: "9px", fontWeight: 600, color: ps.dot }}>{ps.label}</span>
                            </span>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#1e3a1e", marginBottom: "2px" }}>{step.title}</div>
                            <div style={{ fontSize: "9px", color: "#555", lineHeight: 1.45 }}>{step.detail}</div>
                          </td>
                          <td style={{ ...tdStyle, fontSize: "9px", color: "#888" }}>{step.category}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ paddingTop: "8px", borderTop: "1px solid #eee" }}>
                  <p style={{ fontSize: "8.5px", color: "#bbb", margin: 0, lineHeight: 1.5 }}>
                    These recommendations are generated from race profile data and athlete history. They are not a complete training plan — priorities are ordered from highest to lowest urgency based on the gap analysis.
                  </p>
                </div>

                <PageNumber n={15} />
              </div>
            );
          })()}


          {/* ═══════════════════════════════════════
              9 — Suggested Preparation Races  (p12)
          ═══════════════════════════════════════ */}
          {(prepRaces && reportAthlete) && (() => {
            const stl = (s: string) => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const tl  = (t: string) => t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            const scoreColor = (n: number) => n >= 70 ? "#2e7d32" : n >= 40 ? "#e65100" : "#78909c";

            const suggestions = prepRaces?.suggestions ?? [];

            return (
              <div className="rr-page" style={a4Page}>
                <div style={printHeader}>
                  <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{result.race.name}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Race Readiness</div>
                  </div>
                </div>

                <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700, color: "#1e3a1e" }}>9 — Suggested Preparation Races</h2>
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
                  <div className="rr-card-stack" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {suggestions.slice(0, 3).map((s, i) => {
                      const col = scoreColor(s.gap_fill_score);
                      return (
                        <div key={s.race_id} style={{ border: `1px solid #e5e5e5`, borderLeft: `4px solid ${col}`, borderRadius: "6px", padding: "12px 14px", background: "#fff", breakInside: "avoid", pageBreakInside: "avoid" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                            <div style={{ fontWeight: 700, fontSize: "13px", color: "#111" }}>
                              {i + 1}. {s.race_name}
                            </div>
                            <div style={{ background: col, color: "#fff", borderRadius: "10px", padding: "2px 10px", fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap", marginLeft: "12px" }}>
                              {s.gap_fill_score}% gap coverage
                            </div>
                          </div>

                          <div style={{ fontSize: "10.5px", color: "#666", marginBottom: "8px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                            <span>📍 {s.distance_miles.toFixed(1)} mi away</span>
                            {s.total_distance_km != null && <span>↔ {s.total_distance_km.toFixed(1)} km</span>}
                            {s.total_ascent_m != null && <span>↑ {Math.round(s.total_ascent_m).toLocaleString()} m</span>}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                            <div style={{ fontSize: "9px", color: "#aaa", whiteSpace: "nowrap" }}>Coverage</div>
                            <div style={{ flex: 1, height: "6px", background: "#f0f0f0", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${s.gap_fill_score}%`, background: col, borderRadius: "3px" }} />
                            </div>
                          </div>

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
                  {" "}Use this report as a structured input for planning, not as a definitive assessment of an individual&apos;s readiness.
                </div>

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

                <PageNumber n={16} />
              </div>
            );
          })()}


          {/* ═══════════════════════════════════════
              APPENDIX A — Complete Race History  (p14)
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
              <div className="rr-page" style={a4Page}>
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
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#555" }}>
                              {r.position != null
                                ? `${r.position}${r.total_finishers != null ? `/${r.total_finishers}` : ""}`
                                : "—"}
                            </td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#555" }}>
                              {r.cat_position != null && r.cat_finishers != null && r.cat_finishers > 1
                                ? `${r.cat_position}/${r.cat_finishers}`
                                : "—"}
                            </td>
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

                <PageNumber n={17} />
              </div>
            );
          })()}

        </div>
      )}

      {/* ── Save version modal ── */}
      {versionModal && (
        <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px 32px", width: "440px", maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: "17px", fontWeight: 700, color: "#1e3a1e" }}>Save as new version</h3>
            <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#666" }}>
              Archives the current plan so you can return to it later for any race or athlete.
            </p>

            {versionResult ? (
              <div>
                <div style={{ padding: "14px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", marginBottom: "16px" }}>
                  <div style={{ fontWeight: 700, color: "#166534", marginBottom: "6px", fontSize: "14px" }}>✓ Saved as version {versionResult.version}</div>
                  {versionResult.fileCopied ? (
                    <div style={{ fontSize: "12px", color: "#15803d", lineHeight: 1.6 }}>
                      File copied to <code style={{ background: "#dcfce7", padding: "0 4px", borderRadius: 3 }}>v{versionResult.version}/page.tsx</code>.
                      Commit that directory and deploy — it will be live at <code style={{ background: "#dcfce7", padding: "0 4px", borderRadius: 3 }}>/admin/race-readiness/v{versionResult.version}</code>.
                    </div>
                  ) : (
                    <div style={{ fontSize: "12px", color: "#166534", lineHeight: 1.6 }}>
                      DB record created (v{versionResult.version}). The file copy must be done locally — run{" "}
                      <code style={{ background: "#dcfce7", padding: "0 4px", borderRadius: 3 }}>npm run version:save</code>{" "}
                      in the project directory, then commit and deploy.
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setVersionModal(false)}
                  style={{ width: "100%", padding: "9px", background: "#1e3a1e", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#444", marginBottom: "4px" }}>
                  Version name <span style={{ fontWeight: 400, color: "#999" }}>(optional)</span>
                </label>
                <input
                  value={versionName}
                  onChange={e => setVersionName(e.target.value)}
                  placeholder="e.g. Added terrain section"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "13px", marginBottom: "14px", outline: "none" }}
                />
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#444", marginBottom: "4px" }}>What changed?</label>
                <textarea
                  value={versionNotes}
                  onChange={e => setVersionNotes(e.target.value)}
                  placeholder="Describe the changes in this version…"
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "13px", resize: "vertical", outline: "none", marginBottom: "18px" }}
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    disabled={versionSaving}
                    onClick={async () => {
                      setVersionSaving(true);
                      try {
                        const r = await savePlanVersion(versionName, versionNotes);
                        setVersionResult(r);
                      } catch (e) {
                        alert("Failed to save version: " + (e instanceof Error ? e.message : String(e)));
                      }
                      setVersionSaving(false);
                    }}
                    style={{ flex: 1, padding: "9px", background: "#1e3a1e", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer", opacity: versionSaving ? 0.6 : 1 }}
                  >
                    {versionSaving ? "Saving…" : "Save version"}
                  </button>
                  <button
                    onClick={() => setVersionModal(false)}
                    style={{ padding: "9px 18px", background: "#f3f4f6", color: "#555", border: "none", borderRadius: "8px", fontSize: "14px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
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
          .race-strategy-canvas { background: #fff !important; display: block !important; padding: 0 !important; gap: 0 !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </main>
  );
}

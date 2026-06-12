"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WeatherDayRecord } from "@/lib/race-analysis/open-meteo";
import {
  tex as rTex,
  renderMetricGrid,
  renderCallout,
  renderBadge,
  renderProgressRow,
  renderLongTable,
  renderShortTable,
  renderSectionHeader,
  renderSubsectionHeader,
  renderTwoColumnCallouts,
  renderAssessmentCard,
  type MetricCard,
} from "@/lib/latex/render";

/* ── API types (mirrored from race-readiness/page.tsx) ── */
interface RaceMeta { id: string; name: string; slug: string | null; total_distance_km: number; total_ascent_m: number; total_descent_m: number; race_date: string | null; weather_lat: number | null; weather_lon: number | null; }
interface TerrainSection { start_km: number; end_km: number; distance_km: number; section_type: string; terrain: string; avg_gradient_percent: number; ascent_m: number; descent_m: number; flat_equivalent_km: number; }
interface WindSection { section_id: number; start_km: number; end_km: number; mid_lat: number; mid_lon: number; bearing_deg: number; median_wind_speed_ms: number; median_headwind_ms: number; median_crosswind_ms: number; wind_risk_label: string; }
interface AidStation { km: number; name?: string; water: boolean; food: boolean; medic: boolean; toilets: boolean; dropBags: boolean; }
interface OverviewResponse { race: RaceMeta; route: { lat: number; lon: number }[]; wind_sections: WindSection[] | null; elevation_profile: string | null; sustained_segments: string | null; terrain_sections: TerrainSection[]; aid_stations: AidStation[] | null; }
interface DistributionBucket { min_min: number; max_min: number; count: number; }
interface HalfwayAnalysis { key: string; label: string; recommended_seconds: number; aggressive_seconds: number; typical_ratio: number; pct_positive_split: number; band_size: number; }
interface LateAnalysis { key: string; label: string; avg_final_section_minutes: number; avg_fade_pct: number; controlled_pct: number; final_dist_note: string; }
interface ResultsResponse { has_data: boolean; latest_year?: number; total_finishers?: number; distribution?: DistributionBucket[]; halfway_analysis?: HalfwayAnalysis | null; late_analysis?: LateAnalysis | null; }
interface RaceOption { race_id: string; race_name: string; total_distance_km: number | null; total_ascent_m: number | null; }
interface AthleteProfile { athlete_key: string; gender: string | null; age_group: string | null; club: string | null; race_count: number; finish_count: number; dnf_count: number; dnf_rate: number | null; avg_perf_index: number | null; recency_perf_index: number | null; avg_flat_equiv_km: number | null; max_flat_equiv_km: number | null; avg_ascent_m: number | null; max_ascent_m: number | null; avg_difficulty_ratio: number | null; first_result_year: number | null; last_result_year: number | null; career_span_years: number | null; cluster_label: string | null; }
interface AthleteRace { race_id: string; race_name: string; result_year: number; result_status: string; finish_seconds: number | null; position: number | null; age_group: string | null; gender: string | null; club: string | null; total_distance_km: number | null; total_ascent_m: number | null; flat_equivalent_km: number | null; total_finishers: number | null; cat_position: number | null; cat_finishers: number | null; }
interface TerrainPairing { section_type: string; terrain: string; total_km: number; race_count: number; avg_gradient: number; }
interface AthleteResponse { profile: AthleteProfile; races: AthleteRace[]; terrain_pairings?: TerrainPairing[]; races_with_profile?: number; }
interface ExpContextScale { goal_distance_km: number; goal_ascent_m: number; goal_flat_equiv_km: number; athlete_max_dist: { km: number; race_name: string; year: number } | null; athlete_max_ascent: { m: number; race_name: string; year: number } | null; athlete_max_flat_equiv: { km: number; race_name: string; year: number } | null; distance_ratio: number; ascent_ratio: number; flat_equiv_ratio: number; }
interface ExpContextTimeEstimate { estimated_min_hours: number; estimated_max_hours: number; basis_race_name: string; basis_finish_hours: number; athlete_longest_hours: number; athlete_longest_race_name: string; }
interface ExpContextBiggestClimb { goal: { km: number; ascent_m: number; avg_grad: number; start_km: number; end_km: number }; athlete_best: { km: number; ascent_m: number; race_name: string; year: number } | null; ratio: number | null; }
interface ExpContextOpeningMatch { goal_opening_km: number; goal_dominant_type: string; goal_dominant_terrain: string; goal_climb_pct: number; matched_race_name: string | null; matched_race_year: number | null; similarity: number; }
interface ExperienceContextResult { scale: ExpContextScale | null; time_estimate: ExpContextTimeEstimate | null; biggest_climb: ExpContextBiggestClimb | null; opening_match: ExpContextOpeningMatch | null; }
interface PrepRaceGapFill { section_type: string; terrain: string; race_km: number; needed_km: number; }
interface PrepRaceSuggestion { race_id: string; race_name: string; race_slug: string | null; distance_miles: number; next_date: string | null; total_distance_km: number | null; total_ascent_m: number | null; gap_fill_score: number; gaps_filled: PrepRaceGapFill[]; }
interface PrepRacesResult { centroid: { lat: number; lon: number } | null; radius_miles: number; suggestions: PrepRaceSuggestion[]; }
type LoadingLabel = "front" | "even" | "back";
interface ElevProfileMatch { race_name: string; year: number; race_km: number; loading_label: LoadingLabel; halfway_pct: number; similarity_pct: number; partial_desc: string | null; total_ascent_m: number; }
interface ElevProfileMatchResult { goal_loading_label: LoadingLabel | null; goal_halfway_pct: number | null; best_match: ElevProfileMatch | null; match_curve: number[] | null; races_compared: number; }
interface ElevationPoint { distanceKm: number; elevationM: number; }
interface RaceElevProfile { points: ElevationPoint[]; totalDistanceKm: number; minElevationM: number; maxElevationM: number; }
interface RaceSustainedSeg { startKm: number; endKm: number; totalElevationM: number; type: "climb" | "descent" | "flat"; }
interface AssessmentTest { id: string; name: string; description: string | null; aim: string | null; instructions: string[]; target_muscles: string[]; notes: string | null; category: "strength" | "imbalance" | "flexibility" | null; what_to_record: string | null; rating_uphill: number | null; rating_downhill: number | null; rating_technical: number | null; rating_gravel_stability: number | null; rating_general_asymmetry: number | null; }

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
function formatSecs(totalSeconds: number): string { return formatRaceTime(totalSeconds / 60); }
function downsample(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

/* ── LaTeX helpers ── */
const tex = rTex; // delegate to shared helper

function stl(s: string) { return s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }
function tl(t: string) { return t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "); }

type ReadinessLevel = "strong" | "moderate" | "major_gap" | "unknown";
function levelLabel(l: ReadinessLevel): string {
  return l === "strong" ? "Strong" : l === "moderate" ? "Moderate" : l === "major_gap" ? "Major gap" : "Unknown";
}
function levelColor(l: ReadinessLevel): string {
  return l === "strong" ? "accentgreen" : l === "moderate" ? "accentorange" : l === "major_gap" ? "accentred" : "gray";
}

/* ══════════════════════════════════════════════════════════════════
   LaTeX Generator
══════════════════════════════════════════════════════════════════ */
interface GenParams {
  result: OverviewResponse;
  reportAthlete: AthleteResponse | null;
  expContext: ExperienceContextResult | null;
  prepRaces: PrepRacesResult | null;
  elevProfile: RaceElevProfile | null;
  sustainedSegs: RaceSustainedSeg[] | null;
  results: ResultsResponse | null;
  splitAnalysis: ResultsResponse | null;
  elevProfileMatch: ElevProfileMatchResult | null;
  assessmentTests: AssessmentTest[];
  athleteAidData: Record<string, AidStation[]>;
  weather: WeatherDayRecord[];
}

function generateLatex(p: GenParams): string {
  const { result, reportAthlete, expContext, prepRaces, elevProfile, sustainedSegs, results, splitAnalysis, elevProfileMatch, assessmentTests, athleteAidData } = p;

  const race = result.race;
  const secs = result.terrain_sections;
  const totalKm = race.total_distance_km;
  const totalAscentM = race.total_ascent_m;
  const totalDescentM = race.total_descent_m;

  const notable = (parseSustainedSegs(result.sustained_segments) ?? [])
    .filter(s => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);

  const filteredRaces = reportAthlete?.races ?? [];
  const finished = filteredRaces.filter(r => r.result_status === "FINISHED" && r.finish_seconds);
  const byDist = [...finished].filter(r => r.total_distance_km).sort((a, b) => (b.total_distance_km ?? 0) - (a.total_distance_km ?? 0));
  const byAscent = [...finished].filter(r => r.total_ascent_m).sort((a, b) => (b.total_ascent_m ?? 0) - (a.total_ascent_m ?? 0));

  const totalFlatEq = secs.reduce((s, t) => s + t.flat_equivalent_km, 0);
  const effortRatio = totalKm > 0 ? totalFlatEq / totalKm : 1;
  const runnableKm = secs.filter(s => s.avg_gradient_percent >= -3 && s.avg_gradient_percent < 3).reduce((a, s) => a + s.distance_km, 0);
  const runnablePct = totalKm > 0 ? Math.round(runnableKm / totalKm * 100) : 0;

  const terrainSummary = (() => {
    const total = secs.reduce((s, t) => s + t.distance_km, 0);
    const climbing = secs.filter(s => s.section_type.includes("climb")).reduce((s, t) => s + t.distance_km, 0);
    const descending = secs.filter(s => s.section_type.includes("descent")).reduce((s, t) => s + t.distance_km, 0);
    return { total, climbing, descending, flat: Math.max(0, total - climbing - descending) };
  })();

  const surfaceSummary = (() => {
    const map: Record<string, number> = {};
    for (const s of secs) { if (s.terrain) map[s.terrain] = (map[s.terrain] ?? 0) + s.distance_km; }
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { entries, total };
  })();

  const raceDateLabel = race.race_date
    ? new Date(race.race_date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const raceStats = (() => {
    if (!results?.has_data || !results.distribution?.length) return null;
    const dist = results.distribution;
    const total = results.total_finishers ?? 0;
    const fastestMin = dist[0].min_min;
    let cumulative = 0;
    let medianMin = dist[Math.floor(dist.length / 2)].min_min;
    for (const b of dist) { cumulative += b.count; if (cumulative >= total / 2) { medianMin = (b.min_min + b.max_min) / 2; break; } }
    return { total, fastestMin, medianMin, year: results.latest_year };
  })();

  /* ── Scorecard computations (mirrored from page 1 / page 3) ── */
  const sc = expContext?.scale ?? null;
  const athDist = sc?.athlete_max_dist?.km ?? 0;
  const athAscent = sc?.athlete_max_ascent?.m ?? reportAthlete?.profile.max_ascent_m ?? 0;
  const athFlatEq = sc?.athlete_max_flat_equiv?.km ?? reportAthlete?.profile.max_flat_equiv_km ?? 0;
  const goalFlatEq = sc?.goal_flat_equiv_km ?? 0;

  const distStatus: ReadinessLevel = athDist === 0 || totalKm === 0 ? "unknown" : athDist >= totalKm ? "strong" : athDist >= totalKm * 0.7 ? "moderate" : "major_gap";
  const ascentStatus: ReadinessLevel = athAscent === 0 || totalAscentM === 0 ? "unknown" : athAscent >= totalAscentM * 0.8 ? "strong" : athAscent >= totalAscentM * 0.5 ? "moderate" : "major_gap";
  const flatStatus: ReadinessLevel = athFlatEq === 0 || goalFlatEq === 0 ? "unknown" : athFlatEq >= goalFlatEq * 0.8 ? "strong" : athFlatEq >= goalFlatEq * 0.55 ? "moderate" : "major_gap";

  const targetPairingMap: Record<string, { section_type: string; terrain: string; km: number }> = {};
  for (const sec of secs) {
    const key = `${sec.section_type}|${sec.terrain}`;
    if (!targetPairingMap[key]) targetPairingMap[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0 };
    targetPairingMap[key].km += sec.distance_km;
  }
  const athleteExactMap: Record<string, number> = {};
  for (const tp of reportAthlete?.terrain_pairings ?? []) athleteExactMap[`${tp.section_type}|${tp.terrain}`] = tp.total_km;
  const summaryGapRows = Object.values(targetPairingMap).filter(tp => tp.km >= 0.1).map(tp => {
    const exactKm = athleteExactMap[`${tp.section_type}|${tp.terrain}`] ?? 0;
    const pct = tp.km > 0 ? Math.min(100, Math.round((exactKm / tp.km) * 100)) : 100;
    return { section_type: tp.section_type, terrain: tp.terrain, km: tp.km, exactKm, pct, status: exactKm === 0 ? "none" as const : pct >= 100 ? "met" as const : "partial" as const };
  });

  const descentRows = summaryGapRows.filter(r => r.section_type.includes("descent"));
  const descentDemandKm = descentRows.reduce((s, r) => s + r.km, 0);
  const descentCoveredKm = descentRows.reduce((s, r) => s + r.exactKm, 0);
  const descentStatus: ReadinessLevel = descentDemandKm === 0 ? "unknown" : descentCoveredKm / descentDemandKm >= 0.8 ? "strong" : descentCoveredKm / descentDemandKm >= 0.5 ? "moderate" : "major_gap";
  const trailRows = summaryGapRows.filter(r => ["trail","technical_trail","fell"].includes(r.terrain));
  const trailDemandKm = trailRows.reduce((s, r) => s + r.km, 0);
  const trailCoveredKm = trailRows.reduce((s, r) => s + r.exactKm, 0);
  const terrainStatus: ReadinessLevel = trailDemandKm === 0 ? "unknown" : trailCoveredKm / trailDemandKm >= 0.8 ? "strong" : trailCoveredKm / trailDemandKm >= 0.5 ? "moderate" : "major_gap";

  const aidSorted = [...(result.aid_stations ?? [])].sort((a, b) => a.km - b.km);
  const aidStops = [0, ...aidSorted.map(s => s.km), totalKm];
  const aidGapValues = aidStops.slice(1).map((km, i) => km - aidStops[i]);
  const aidMaxGap = aidGapValues.length > 1 ? Math.max(...aidGapValues) : 0;
  const aidStatus: ReadinessLevel = aidSorted.length === 0 ? "unknown" : aidMaxGap <= 15 ? "strong" : aidMaxGap <= 25 ? "moderate" : "major_gap";

  const statusList = [distStatus, ascentStatus, descentStatus, terrainStatus].filter((s): s is "strong" | "moderate" | "major_gap" => s !== "unknown");
  const majorCount = statusList.filter(s => s === "major_gap").length;
  const metCount = summaryGapRows.filter(r => r.status === "met").length;
  const overallLabel = majorCount >= 2 ? "Not yet race-specific ready" : majorCount === 1 ? "Aerobically capable, but race-specific gaps remain" : statusList.includes("moderate") ? "Mostly ready, with specific risks" : "Race-specific ready";

  /* ── Verdict text ── */
  const firstName = reportAthlete?.profile.athlete_key.split(" ")[0] ?? "The athlete";
  const verdictParts: string[] = [];
  if (distStatus === "strong" && sc?.athlete_max_dist) verdictParts.push(`${firstName} has demonstrated the endurance to complete distances longer than ${race.name} — the longest recorded race is ${sc.athlete_max_dist.race_name} (${sc.athlete_max_dist.km.toFixed(0)} km).`);
  else if (distStatus === "major_gap" && totalKm > 0) verdictParts.push(`At ${totalKm.toFixed(0)} km, ${race.name} is longer than anything clearly on record for ${firstName}.`);
  if (ascentStatus === "major_gap" && athAscent > 0 && totalAscentM > 0) {
    const ar = (totalAscentM / athAscent).toFixed(1);
    const goalPerKm = totalKm > 0 ? Math.round(totalAscentM / totalKm) : 0;
    verdictParts.push(`The main concern is not distance — it is vertical load. The target race demands ${Math.round(totalAscentM).toLocaleString()} m of ascent (${goalPerKm} m/km), ${ar}x more than the best on record (${Math.round(athAscent).toLocaleString()} m).`);
  } else if (ascentStatus === "moderate" && athAscent > 0 && totalAscentM > 0) {
    const goalPerKm = totalKm > 0 ? Math.round(totalAscentM / totalKm) : 0;
    verdictParts.push(`The ascent load is a step up: ${Math.round(totalAscentM).toLocaleString()} m target (${goalPerKm} m/km) vs ${Math.round(athAscent).toLocaleString()} m best recorded.`);
  }
  if (verdictParts.length === 0) verdictParts.push(`${firstName}'s readiness for ${race.name} has been assessed across distance, ascent, descent, and terrain specificity.`);
  const verdictText = verdictParts.join(" ");

  /* ── Experience gaps (page 9 logic) ── */
  const targetPairingFull: Record<string, { section_type: string; terrain: string; km: number; weightedGrad: number }> = {};
  for (const sec of secs) {
    const key = `${sec.section_type}|${sec.terrain}`;
    if (!targetPairingFull[key]) targetPairingFull[key] = { section_type: sec.section_type, terrain: sec.terrain, km: 0, weightedGrad: 0 };
    targetPairingFull[key].km += sec.distance_km;
    targetPairingFull[key].weightedGrad += sec.avg_gradient_percent * sec.distance_km;
  }
  const athleteCrossIndex: Record<string, Array<{ terrain: string; km: number }>> = {};
  for (const tp of reportAthlete?.terrain_pairings ?? []) {
    if (!athleteCrossIndex[tp.section_type]) athleteCrossIndex[tp.section_type] = [];
    athleteCrossIndex[tp.section_type].push({ terrain: tp.terrain, km: tp.total_km });
  }
  const gapRows = Object.values(targetPairingFull).map(tp => {
    const km = Math.round(tp.km * 10) / 10;
    const avg_gradient = tp.km > 0 ? Math.round((tp.weightedGrad / tp.km) * 10) / 10 : 0;
    const exactKm = Math.round((athleteExactMap[`${tp.section_type}|${tp.terrain}`] ?? 0) * 10) / 10;
    const crossEntries = (athleteCrossIndex[tp.section_type] ?? []).filter(e => e.terrain !== tp.terrain).sort((a, b) => b.km - a.km);
    const crossKm = Math.round(crossEntries.reduce((s, e) => s + e.km, 0) * 10) / 10;
    const crossSurface = crossEntries.length > 0 ? crossEntries[0].terrain : null;
    const pct = tp.km > 0 ? Math.min(100, Math.round((exactKm / tp.km) * 100)) : 100;
    const status: "none" | "partial" | "met" | "surface_gap" = exactKm === 0 && crossKm > 0 ? "surface_gap" : exactKm === 0 ? "none" : pct >= 100 ? "met" : "partial";
    return { section_type: tp.section_type, terrain: tp.terrain, km, avg_gradient, exactKm, crossKm, crossSurface, pct, status };
  }).filter(r => r.km >= 0.1).sort((a, b) => b.km - a.km);

  /* ══════════════════════════════════════════════════════════════════
     Preamble
  ══════════════════════════════════════════════════════════════════ */
  const lines: string[] = [];
  const ln = (...strs: string[]) => { for (const s of strs) lines.push(s); };

  ln(
    "\\documentclass[a4paper,11pt]{article}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[top=2.4cm,bottom=2.2cm,left=2cm,right=2cm]{geometry}",
    "\\usepackage[table,dvipsnames]{xcolor}",
    "\\usepackage{booktabs}",
    "\\usepackage{longtable}",
    "\\usepackage{array}",
    "\\usepackage{microtype}",
    "\\usepackage{pgfplots}",
    "\\pgfplotsset{compat=1.18}",
    "\\usepackage{tikz}",
    "\\usepackage{parskip}",
    "\\usepackage{tabularx}",
    "\\usepackage[hidelinks]{hyperref}",
    "\\usepackage{makecell}",
    "\\usepackage{lmodern}",
    "\\usepackage{tortoise_report}",  // brand style (copied to tmpDir at compile time)
    "",
    `\\racenameset{${tex(race.name)}}`,
    "",
    `\\title{%`,
    `  \\vspace{-1cm}%`,
    `  {\\color{TortoiseGreen}\\rule{\\linewidth}{1.5pt}}\\\\[8pt]%`,
    `  \\textbf{\\color{TortoiseGreen}\\Large Race Readiness Report}\\\\[6pt]%`,
    `  {\\large\\color{TortoiseDarkGrey}${tex(race.name)}}\\\\[4pt]%`,
    `  {\\color{TortoiseGreen}\\rule{\\linewidth}{1.5pt}}%`,
    `}`,
    reportAthlete ? `\\author{\\normalsize\\color{TortoiseDarkGrey}${tex(reportAthlete.profile.athlete_key)}}` : "\\author{}",
    "\\date{\\normalsize\\color{TortoiseDarkGrey}\\today}",
    "",
    "\\begin{document}",
    "\\thispagestyle{plain}",
    "\\maketitle",
    "\\thispagestyle{plain}",
    "\\tableofcontents",
    "\\newpage",
    "\\pagestyle{fancy}",
  );

  /* ══════════════════════════════════════════════════════════════════
     SECTION 1 — Executive Readiness Verdict
  ══════════════════════════════════════════════════════════════════ */
  if (reportAthlete && expContext) {
    ln("", renderSectionHeader("Executive Readiness Verdict", "Overall verdict, main strength, primary risk, and what this report does and does not assess."));

    /* What "race ready" means */
    ln(renderCallout("insight", "What \\textquotedblleft race ready\\textquotedblright\\ means in this report",
      "Race ready means you have the physical foundation to complete this race safely and without being overwhelmed by its specific demands. " +
      "It does not mean you will win, hit a target time, or that preparation is complete. " +
      "It means the gap between what this race requires and what you have demonstrated in prior racing is manageable with appropriate preparation."
    ));

    /* Overall verdict callout */
    const verdictCalloutType = majorCount >= 2 ? "risk" : majorCount === 1 ? "priority" : statusList.includes("moderate") ? "priority" : "positive";
    ln(renderCallout(verdictCalloutType, `Overall Verdict: ${tex(overallLabel)}`, tex(verdictText)));

    /* Readiness scorecard using TortoiseLongTable */
    const scoreCards: { title: string; level: ReadinessLevel; detail: string }[] = [
      { title: "Distance", level: distStatus, detail: athDist > 0 && totalKm > 0 ? `${athDist.toFixed(0)} km max vs ${totalKm.toFixed(0)} km target` : "Insufficient data" },
      { title: "Ascent", level: ascentStatus, detail: athAscent > 0 && totalAscentM > 0 ? `${Math.round(athAscent).toLocaleString()} m max vs ${Math.round(totalAscentM).toLocaleString()} m target` : "Insufficient data" },
      { title: "Descent", level: descentStatus, detail: descentDemandKm > 0 ? `${descentCoveredKm.toFixed(1)} km covered of ${descentDemandKm.toFixed(1)} km` : "Insufficient data" },
      { title: "Terrain specificity", level: terrainStatus, detail: trailDemandKm > 0 ? `${trailCoveredKm.toFixed(1)} km trail/fell vs ${trailDemandKm.toFixed(1)} km demanded` : "No off-road demand detected" },
      { title: "Time-on-feet load", level: flatStatus, detail: athFlatEq > 0 && goalFlatEq > 0 ? `${athFlatEq.toFixed(1)} km effort-equiv vs ${goalFlatEq.toFixed(1)} km goal` : "Insufficient data" },
      { title: "Aid logistics", level: aidStatus, detail: aidSorted.length > 0 ? `${aidSorted.length} station${aidSorted.length !== 1 ? "s" : ""}, longest gap ${aidMaxGap.toFixed(1)} km` : "No aid station data" },
    ];
    ln(renderLongTable(
      "X[2,l] X[1,c] X[3,l]",
      ["Dimension", "Rating", "Detail"],
      scoreCards.map(c => [tex(c.title), renderBadge(c.level), `\\small ${tex(c.detail)}`]),
    ));

    /* Strength / Limiter side-by-side */
    const zeroRows = summaryGapRows.filter(r => r.status === "none");
    const strengthText = distStatus === "strong" && sc?.athlete_max_dist
      ? `${firstName} has already proven the ability to complete ultra-distance events longer than ${race.name}. The longest recorded race -- ${sc.athlete_max_dist.race_name} (${sc.athlete_max_dist.km.toFixed(0)} km, ${sc.athlete_max_dist.year}) -- shows basic endurance is not in question.`
      : flatStatus === "strong" && sc?.athlete_max_flat_equiv
      ? `${firstName}'s total effort capacity is strong. A best flat-equivalent load of ${sc.athlete_max_flat_equiv.km.toFixed(1)} km shows the engine is there for sustained effort.`
      : metCount > 0
      ? `${firstName} has covered ${metCount} of ${summaryGapRows.length} terrain-demand types at or above race-ready levels.`
      : "Completing multiple ultra-distance events demonstrates commitment and the ability to manage race-day adversity.";

    const limiterText = ascentStatus === "major_gap"
      ? `Vertical load is the main limiter. ${race.name} includes ${Math.round(totalAscentM).toLocaleString()} m of ascent, compared with ${firstName}'s best recorded ascent of ${Math.round(athAscent).toLocaleString()} m.`
      : terrainStatus === "major_gap"
      ? "Trail and fell-specific experience is the key gap. The target race is predominantly off-road mountain terrain."
      : descentStatus === "major_gap"
      ? `Descending volume is the main limiter. The race includes ${Math.round(totalDescentM).toLocaleString()} m of descent with limited proven experience of equivalent descent loads.`
      : flatStatus === "major_gap"
      ? "Total effort duration is the key gap. The race effort load exceeds anything clearly on record."
      : zeroRows.length >= 3
      ? `Primary limiter: specificity, not volume. ${zeroRows.length} demand types have zero coverage in the confirmed race record.`
      : "No significant preparation gaps identified across distance, ascent, descent, or terrain specificity.";

    ln(renderTwoColumnCallouts(
      "positive", "Biggest Strength", tex(strengthText),
      majorCount >= 1 ? "risk" : "priority", "Biggest Limiter", tex(limiterText),
    ));
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTION 2 — Race Overview
  ══════════════════════════════════════════════════════════════════ */
  ln("", renderSectionHeader("Race Overview", "Course profile, terrain character, and key metrics."));

  /* 4-up metric cards */
  const raceMetricCards: MetricCard[] = [
    { label: "Distance", value: `${tex(totalKm.toFixed(1))} km`, note: "Total course distance", variant: "neutral" },
    { label: "Total Ascent", value: `${tex(Math.round(totalAscentM).toLocaleString())} m`, note: `${totalKm > 0 ? tex((totalAscentM / totalKm).toFixed(0)) : "{--}"} m/km`, variant: "neutral" },
    { label: "Total Descent", value: `${tex(Math.round(totalDescentM).toLocaleString())} m`, note: "Total descent", variant: "neutral" },
    { label: "Effort Multiplier", value: `${tex(effortRatio.toFixed(2))}\\texttimes`, note: `${tex(totalFlatEq.toFixed(1))} km flat-equiv`, variant: effortRatio >= 1.5 ? "warning" : "neutral" },
  ];
  ln(renderMetricGrid(raceMetricCards, 4));

  /* Race date + finisher stats (small secondary cards) */
  const statsCards: MetricCard[] = [];
  if (raceDateLabel) statsCards.push({ label: "Race Date", value: `\\normalsize ${tex(raceDateLabel)}`, variant: "neutral" });
  if (raceStats) {
    statsCards.push({ label: `Finishers (${tex(String(raceStats.year))})`, value: tex(raceStats.total.toLocaleString()), variant: "neutral" });
    statsCards.push({ label: "Median Finish", value: `\\normalsize ${tex(formatRaceTime(raceStats.medianMin))}`, variant: "neutral" });
    statsCards.push({ label: "Course Record", value: `\\normalsize ${tex(formatRaceTime(raceStats.fastestMin))}`, variant: "neutral" });
  }
  if (statsCards.length > 0) ln(renderMetricGrid(statsCards, statsCards.length <= 2 ? 2 : statsCards.length <= 3 ? 3 : 4));

  /* Terrain composition progress bars */
  if (terrainSummary.total > 0) {
    ln("", renderSubsectionHeader("Terrain Composition"));
    const climbPct  = terrainSummary.total > 0 ? terrainSummary.climbing  / terrainSummary.total : 0;
    const descPct   = terrainSummary.total > 0 ? terrainSummary.descending / terrainSummary.total : 0;
    const flatPct   = terrainSummary.total > 0 ? terrainSummary.flat       / terrainSummary.total : 0;
    ln(renderProgressRow("Climbing",   `${tex(terrainSummary.climbing.toFixed(1))} km (${tex((climbPct*100).toFixed(0))}\\%)`,  climbPct, "TortoiseRed"));
    ln(renderProgressRow("Descending", `${tex(terrainSummary.descending.toFixed(1))} km (${tex((descPct*100).toFixed(0))}\\%)`, descPct, "TortoiseAmber"));
    ln(renderProgressRow("Flat / Rolling", `${tex(terrainSummary.flat.toFixed(1))} km (${tex((flatPct*100).toFixed(0))}\\%)`,   flatPct, "TortoiseGreen"));
  }

  /* Surface composition table */
  if (surfaceSummary.total > 0) {
    const SURFACE_LABEL: Record<string, string> = { road: "Road", pavement: "Pavement", track: "Track", gravel: "Gravel", trail: "Trail", technical_trail: "Technical Trail", fell: "Fell", mud: "Mud", sand: "Sand", snow: "Snow" };
    ln("", renderSubsectionHeader("Surface Composition"));
    ln(renderShortTable(
      "lrr",
      ["Surface", "km", "\\%"],
      surfaceSummary.entries.map(([surface, km]) => {
        const pct = surfaceSummary.total > 0 ? (km / surfaceSummary.total * 100) : 0;
        const label = SURFACE_LABEL[surface] ?? stl(surface);
        return [tex(label), tex(km.toFixed(1)), `${tex(pct.toFixed(0))}\\%`];
      }),
    ));
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTION 3 — Elevation
  ══════════════════════════════════════════════════════════════════ */
  if (elevProfile || terrainSummary.total > 0) {
    ln("", renderSectionHeader("Elevation Profile", "Elevation profile, composition, and climbing load."));

    if (elevProfile) {
      /* Key segments table */
      if (notable.length > 0) {
        ln("", renderSubsectionHeader("Key Segments"),
          "\\begin{center}\\begin{tabular}{lrr}\\toprule",
          "\\textbf{Segment} & \\textbf{Elevation} & \\textbf{Distance} \\\\\\midrule",
        );
        for (const seg of notable) {
          const arrow = seg.type === "climb" ? "+" : "";
          ln(`km ${tex(seg.startKm.toFixed(1))}--${tex(seg.endKm.toFixed(1))} (${tex(seg.type)}) & ${tex(arrow)}${tex(Math.round(seg.totalElevationM))} m & ${tex((seg.endKm - seg.startKm).toFixed(1))} km \\\\`);
        }
        ln("\\bottomrule\\end{tabular}\\end{center}");
      }

      /* pgfplots elevation chart */
      const pts = downsample(elevProfile.points, 150);
      const coordStr = pts.map(pt => `(${pt.distanceKm.toFixed(2)},${pt.elevationM.toFixed(1)})`).join(" ");
      ln(
        "",
        renderSubsectionHeader("Course Elevation Profile"),
        "\\begin{center}",
        "\\begin{tikzpicture}",
        "\\begin{axis}[",
        "  width=14cm, height=5cm,",
        `  xmin=0, xmax=${elevProfile.totalDistanceKm.toFixed(1)},`,
        `  ymin=${(elevProfile.minElevationM - 50).toFixed(0)}, ymax=${(elevProfile.maxElevationM + 50).toFixed(0)},`,
        "  xlabel={Distance (km)}, ylabel={Elevation (m)},",
        "  axis lines=left,",
        "  grid=major, grid style={gray!20},",
        "  tick label style={font=\\tiny},",
        "  label style={font=\\small},",
        "  fill between/on layer=axis background,",
        "]",
        `\\addplot[TortoiseGreen, thick, fill=TortoiseLightGreen] coordinates { ${coordStr} } \\closedcycle;`,
        "\\end{axis}",
        "\\end{tikzpicture}",
        "\\end{center}",
      );
    }

    /* Elevation profile match */
    if (elevProfileMatch) {
      const em = elevProfileMatch;
      const loadDesc: Record<LoadingLabel, string> = { front: "front-loaded (most climbing in the first half)", back: "back-loaded (most climbing in the second half)", even: "evenly loaded (climbing spread across both halves)" };
      const goalDesc = em.goal_loading_label ? loadDesc[em.goal_loading_label] : null;
      const m = em.best_match;
      ln("", renderSubsectionHeader("Elevation Profile Match"));
      if (m) {
        ln(`${tex(race.name)} is ${goalDesc ?? "—"}. Closest profile match: \\textbf{${tex(m.race_name)}} (${tex(String(m.year))}, similarity ${tex(m.similarity_pct.toFixed(0))}\\%).`);
      } else if (goalDesc) {
        ln(`${tex(race.name)} is ${goalDesc}. No close profile match found in athlete's race history (${tex(String(em.races_compared))} race${em.races_compared !== 1 ? "s" : ""} compared).`);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTION 4 — Race Demands Profile
  ══════════════════════════════════════════════════════════════════ */
  ln("", renderSectionHeader("Race Demands Profile", "What the course requires: gradient distribution, effort multiplier, and demand summary."));

  /* Demand summary */
  const steepestClimb = [...secs].filter(s => s.section_type.includes("climb") && s.distance_km >= 1).sort((a, b) => b.avg_gradient_percent - a.avg_gradient_percent)[0] ?? null;
  const steepestDescent = [...secs].filter(s => s.section_type.includes("descent") && s.distance_km >= 1).sort((a, b) => a.avg_gradient_percent - b.avg_gradient_percent)[0] ?? null;
  const finalThirdStart = totalKm * (2 / 3);
  const finalThirdSecs = secs.filter(s => s.start_km >= finalThirdStart);
  const finalThirdAscent = finalThirdSecs.reduce((s, t) => s + t.ascent_m, 0);
  const finalThirdFlatEq = finalThirdSecs.reduce((s, t) => s + t.flat_equivalent_km, 0);
  const finalThirdLen = finalThirdSecs.reduce((s, t) => s + t.distance_km, 0);
  const finalThirdEffort = finalThirdLen > 0 ? finalThirdFlatEq / finalThirdLen : 1;
  const sectionRatios = secs.filter(s => s.distance_km > 0).map(s => s.flat_equivalent_km / s.distance_km);
  const meanRatio = sectionRatios.length > 0 ? sectionRatios.reduce((a, b) => a + b, 0) / sectionRatios.length : 1;
  const stdRatio = sectionRatios.length > 1 ? Math.sqrt(sectionRatios.reduce((s, r) => s + (r - meanRatio) ** 2, 0) / sectionRatios.length) : 0;
  const cvRatio = meanRatio > 0 ? stdRatio / meanRatio : 0;
  const complexityLabel = cvRatio > 0.45 ? "High" : cvRatio > 0.25 ? "Moderate" : "Low";

  ln("", renderSubsectionHeader("Key Demand Metrics"));
  {
    const demandMetricRows: string[][] = [
      ["Total climbing volume",   `${tex(Math.round(totalAscentM).toLocaleString())} m`],
      ["Total descending",        `${tex(Math.round(totalDescentM).toLocaleString())} m`],
      ["Runnable terrain",        `${tex(runnablePct)}\\%`],
      ["Average effort multiplier", `${tex(effortRatio.toFixed(2))}\\texttimes`],
    ];
    if (steepestClimb)   demandMetricRows.push(["Steepest climb",   `km ${tex(steepestClimb.start_km.toFixed(1))}--${tex(steepestClimb.end_km.toFixed(1))}, avg +${tex(steepestClimb.avg_gradient_percent.toFixed(1))}\\%, ${tex(steepestClimb.distance_km.toFixed(1))} km`]);
    if (steepestDescent) demandMetricRows.push(["Steepest descent", `km ${tex(steepestDescent.start_km.toFixed(1))}--${tex(steepestDescent.end_km.toFixed(1))}, avg ${tex(steepestDescent.avg_gradient_percent.toFixed(1))}\\%, ${tex(steepestDescent.distance_km.toFixed(1))} km`]);
    demandMetricRows.push(["Final third ascent",     `${tex(Math.round(finalThirdAscent))} m over ${tex(finalThirdLen.toFixed(1))} km`]);
    demandMetricRows.push(["Final third effort",      `${tex(finalThirdEffort.toFixed(2))}\\texttimes`]);
    demandMetricRows.push(["Pacing complexity",       `${tex(complexityLabel)} (CV~=~${tex(cvRatio.toFixed(2))})`]);
    ln(renderShortTable("ll", ["Metric", "Value"], demandMetricRows));
  }

  /* Late-race pattern */
  const halfway = splitAnalysis?.halfway_analysis ?? null;
  const late = splitAnalysis?.late_analysis ?? null;
  if (halfway || late) {
    ln("", renderSubsectionHeader("Late-Race Pattern"));
    const lateRows: string[][] = [];
    if (halfway) {
      lateRows.push(["Median halfway",       formatSecs(halfway.recommended_seconds)]);
      lateRows.push(["Positive split rate",  `${tex(Math.round(halfway.pct_positive_split * 100))}\\%`]);
    }
    if (late) {
      lateRows.push(["Final section avg",    `${tex(late.avg_final_section_minutes.toFixed(1))} min`]);
      lateRows.push(["Average fade",         `${tex(late.avg_fade_pct.toFixed(1))}\\%`]);
      lateRows.push(["Controlled finish",    `${tex(late.controlled_pct.toFixed(0))}\\%`]);
    }
    ln(renderShortTable("ll", ["Metric", "Value"], lateRows));
  }

  /* ══════════════════════════════════════════════════════════════════
     SECTION 5 — Readiness Narrative (athlete-dependent)
  ══════════════════════════════════════════════════════════════════ */
  if (reportAthlete) {
    const p = reportAthlete.profile;
    const athleteName = p.athlete_key;
    const lastYear = p.last_result_year ?? new Date().getFullYear();
    const recentRaces = filteredRaces.filter(r => r.result_year >= lastYear - 1).slice(0, 10);
    const longestDist = byDist[0]?.total_distance_km ?? 0;
    const highestAscent = byAscent[0]?.total_ascent_m ?? 0;

    const readinessScore = (() => {
      let s = 0;
      if (longestDist >= totalKm * 0.8) s += 2; else if (longestDist >= totalKm * 0.5) s += 1;
      if (highestAscent >= totalAscentM * 0.7 && totalAscentM > 0) s += 2; else if (highestAscent >= totalAscentM * 0.4 && totalAscentM > 0) s += 1;
      if (recentRaces.length >= 3) s += 1;
      if ((p.race_count ?? 0) >= 15) s += 1;
      const gn = summaryGapRows.filter(r => r.status === "none").length;
      if (gn === 0 && summaryGapRows.length > 0) s += 2; else if (gn <= 1) s += 1;
      return s;
    })();
    const verdictLabel = readinessScore >= 7 ? "Well-Prepared" : readinessScore >= 4 ? "Partially Prepared -- Targeted Gaps" : "Significant Preparation Required";

    const para1 = `${athleteName} has ${p.race_count ?? 0} races on record across ${p.career_span_years ?? "?"} year${(p.career_span_years ?? 0) !== 1 ? "s" : ""} of competition. ${longestDist > 0 ? `The longest race on record is ${longestDist.toFixed(0)} km${highestAscent > 0 ? ` with a career-best single-race ascent of ${Math.round(highestAscent).toLocaleString()} m` : ""}.` : ""} ${recentRaces.length > 0 ? `There are ${recentRaces.length} race${recentRaces.length !== 1 ? "s" : ""} on record from the last two years.` : "There are no races on record in the last two years."}`;

    const para2 = secs.length > 0
      ? `${race.name} is a ${totalKm.toFixed(0)} km course with ${Math.round(totalAscentM).toLocaleString()} m of ascent and ${Math.round(totalDescentM).toLocaleString()} m of descent. The average effort multiplier across the course is ${effortRatio.toFixed(2)}x. ${runnablePct < 30 ? `With only ${runnablePct}% of the course near-flat, this is not a race where pace targets are meaningful.` : runnablePct >= 50 ? `${runnablePct}% of the course is near-flat, giving extended opportunities for efficient running.` : ""}`
      : null;

    ln("", renderSectionHeader("Readiness Narrative", `Overall assessment: ${tex(verdictLabel)}`), tex(para1));
    if (para2) ln("", tex(para2));

    if (longestDist > 0 && longestDist < totalKm * 0.55 && highestAscent < totalAscentM * 0.4) {
      ln("", `The two most significant readiness gaps are distance and vertical. The goal race (${totalKm.toFixed(0)} km, ${Math.round(totalAscentM).toLocaleString()} m) substantially exceeds the athlete's recorded maximum in both dimensions.`);
    } else if (longestDist > 0 && longestDist < totalKm * 0.55) {
      ln("", `Distance is the primary readiness gap: the goal race (${totalKm.toFixed(0)} km) is well beyond the longest race on record (${longestDist.toFixed(0)} km).`);
    } else if (totalAscentM > 500 && highestAscent < totalAscentM * 0.4) {
      ln("", `Vertical experience is the primary gap: the goal race requires ${Math.round(totalAscentM).toLocaleString()} m of ascent, where the career best is ${Math.round(highestAscent).toLocaleString()} m.`);
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 6 — Athlete Overview
    ══════════════════════════════════════════════════════════════════ */
    ln("", renderSectionHeader("Athlete Overview", "Career profile and recent results."));

    /* Key stat cards */
    const athCards: MetricCard[] = [
      { label: "Races",   value: tex(String(p.race_count ?? 0)),  note: "Total on record",                              variant: "neutral" },
      { label: "Finishes", value: tex(String(p.finish_count)),     note: `${tex((p.dnf_rate != null ? (p.dnf_rate * 100).toFixed(1) : "?"))}\\% DNF rate`, variant: "neutral" },
    ];
    if (p.max_ascent_m)    athCards.push({ label: "Best Ascent",   value: `${tex(Math.round(p.max_ascent_m).toLocaleString())} m`, note: "Single-race best", variant: "neutral" });
    if (p.max_flat_equiv_km) athCards.push({ label: "Best Effort", value: `${tex(p.max_flat_equiv_km.toFixed(1))} km`,              note: "Flat-equiv best",  variant: "neutral" });
    ln(renderMetricGrid(athCards, athCards.length >= 4 ? 4 : 2));

    /* Profile detail table */
    const profileRows: string[][] = [];
    if (p.gender)         profileRows.push(["Gender",     tex(p.gender)]);
    if (p.age_group)      profileRows.push(["Age group",  tex(p.age_group)]);
    if (p.club)           profileRows.push(["Club",       tex(p.club)]);
    profileRows.push(["Career span", `${tex(String(p.first_result_year ?? "?"))}--${tex(String(p.last_result_year ?? "?"))}`]);
    if (p.avg_ascent_m)   profileRows.push(["Avg ascent/race", `${tex(Math.round(p.avg_ascent_m).toLocaleString())} m`]);
    if (p.avg_flat_equiv_km) profileRows.push(["Avg flat-equiv",  `${tex(p.avg_flat_equiv_km.toFixed(1))} km`]);
    if (p.cluster_label)  profileRows.push(["Athlete type", tex(p.cluster_label)]);
    if (profileRows.length > 0) ln(renderShortTable("ll", ["Field", "Value"], profileRows));

    /* Recent results */
    const recentFinished = filteredRaces.filter(r => r.result_year >= lastYear - 1).slice(0, 15);
    if (recentFinished.length > 0) {
      ln("", renderSubsectionHeader("Recent Results (Last 2 Years)"));
      ln(renderLongTable(
        "X[3,l] X[1,c] X[1.5,c] X[1.8,r] X[1,r]",
        ["Race", "Year", "Status", "Time", "Pos."],
        recentFinished.map(r => {
          const time = r.finish_seconds ? formatSecs(r.finish_seconds) : r.result_status === "FINISHED" ? "{--}" : tex(r.result_status);
          const pos  = r.position != null ? String(r.position) : "{--}";
          return [tex(r.race_name), tex(String(r.result_year)), tex(r.result_status), time, pos];
        }),
      ));
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 7 — Experience Gaps
    ══════════════════════════════════════════════════════════════════ */
    if (secs.length > 0 && gapRows.length > 0) {
      ln("", renderSectionHeader("Experience Gaps", "Terrain demand types required by the race vs what the athlete has covered in previous races."));

      /* Summary line */
      const coveredCount  = gapRows.filter(r => r.status === "met").length;
      const partialCount  = gapRows.filter(r => r.status === "partial" || r.status === "surface_gap").length;
      const noneCount     = gapRows.filter(r => r.status === "none").length;
      ln(renderCallout("insight", "Coverage Summary",
        `\\textbf{${coveredCount}} demand type${coveredCount !== 1 ? "s" : ""} covered \\quad ` +
        `\\textbf{${partialCount}} partial \\quad ` +
        `\\textbf{${noneCount}} with no experience`
      ));

      ln(renderLongTable(
        "X[2.2,l] X[1.5,l] X[1,r] X[1.2,r] X[1.6,c]",
        ["Demand type", "Surface", "Goal km", "Covered km", "Status"],
        gapRows.map(row => {
          const sLabel = row.section_type.includes("steep") && (row.avg_gradient >= 12 || row.avg_gradient <= -12)
            ? `Very ${stl(row.section_type).replace("Very ", "")}` : stl(row.section_type);
          const coveredStr = row.exactKm > 0 ? `${row.exactKm.toFixed(1)} km` : "{--}";
          const partialNote = row.status === "partial" ? ` (${row.pct}\\%)` : "";
          const statusKey = row.status === "partial" ? "partial" : row.status;
          return [
            tex(sLabel),
            tex(tl(row.terrain)),
            `${tex(row.km.toFixed(1))} km`,
            `${coveredStr}${partialNote}`,
            renderBadge(statusKey),
          ];
        }),
      ));
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 8 — Demands Built Up
    ══════════════════════════════════════════════════════════════════ */
    ln("", renderSectionHeader("Demands Built Up", "Athlete's peak single-race load vs what this race demands."));
    {
      const demandRows: string[][] = [];
      if (athDist > 0 && totalKm > 0)         demandRows.push(["Distance",               `${tex(athDist.toFixed(0))} km`,                         `${tex(totalKm.toFixed(0))} km`,                         `${tex((athDist / totalKm).toFixed(2))}\\texttimes`]);
      if (athAscent > 0 && totalAscentM > 0)  demandRows.push(["Ascent",                  `${tex(Math.round(athAscent).toLocaleString())} m`,       `${tex(Math.round(totalAscentM).toLocaleString())} m`,   `${tex((athAscent / totalAscentM).toFixed(2))}\\texttimes`]);
      if (athFlatEq > 0 && goalFlatEq > 0)    demandRows.push(["Flat-equivalent effort",  `${tex(athFlatEq.toFixed(1))} km`,                        `${tex(goalFlatEq.toFixed(1))} km`,                      `${tex((athFlatEq / goalFlatEq).toFixed(2))}\\texttimes`]);
      if (demandRows.length > 0) ln(renderShortTable("lrrr", ["Dimension", "Athlete best", "Goal race", "Ratio"], demandRows));
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 9 — Aid Station Analysis
    ══════════════════════════════════════════════════════════════════ */
    if (aidSorted.length > 0) {
      const hasDropBag = aidSorted.some(s => s.dropBags);
      const avgGap = aidGapValues.length > 0 ? aidGapValues.reduce((a, b) => a + b, 0) / aidGapValues.length : 0;

      ln("", renderSectionHeader("Aid Station Analysis", "Gap analysis, nutrition logistics, and drop bag strategy."));

      /* Summary metric cards */
      const aidGapVariant: MetricCard["variant"] = aidMaxGap <= 15 ? "positive" : aidMaxGap <= 25 ? "warning" : "risk";
      ln(renderMetricGrid([
        { label: "Stations",       value: tex(String(aidSorted.length)),    note: "Total aid stops",            variant: "neutral"  },
        { label: "Longest Gap",    value: `${tex(aidMaxGap.toFixed(1))} km`, note: "Unsupported stretch",       variant: aidGapVariant },
        { label: "Average Gap",    value: `${tex(avgGap.toFixed(1))} km`,    note: "Between stations",          variant: "neutral"  },
        { label: "Drop Bags",      value: hasDropBag ? "Yes" : "No",         note: "Available on course",       variant: hasDropBag ? "positive" : "neutral" },
      ], 4));

      /* Stations table */
      ln("", renderSubsectionHeader("Aid Stations"));
      ln(renderLongTable(
        "X[1,r] X[1.2,r] X[2.5,l] X[0.8,c] X[0.8,c] X[0.8,c] X[0.8,c] X[0.8,c]",
        ["km", "Gap", "Name", "Water", "Food", "Medic", "WC", "Bags"],
        aidSorted.map((s, i) => {
          const gapKm = i === 0 ? s.km : s.km - aidSorted[i - 1].km;
          const y = (v: boolean) => v ? "\\textcolor{TortoiseGreen}{\\textbullet}" : "{--}";
          return [
            tex(s.km.toFixed(1)),
            `${tex(gapKm.toFixed(1))} km`,
            tex(s.name ?? `Station ${i + 1}`),
            y(s.water), y(s.food), y(s.medic), y(s.toilets), y(s.dropBags),
          ];
        }),
      ));

      /* Athlete's historical aid gaps */
      const athleteRaceGaps: { raceName: string; maxGapKm: number }[] = [];
      for (const r of filteredRaces) {
        const aidData = athleteAidData[r.race_id];
        if (!aidData || aidData.length === 0) continue;
        const sorted = [...aidData].sort((a, b) => a.km - b.km);
        const raceKm = r.total_distance_km ?? 0;
        const stops = [0, ...sorted.map(s => s.km), raceKm];
        const gaps = stops.slice(1).map((km, i) => km - stops[i]);
        const maxG = Math.max(...gaps);
        if (maxG > 0) athleteRaceGaps.push({ raceName: r.race_name, maxGapKm: maxG });
      }
      if (athleteRaceGaps.length > 0) {
        const athleteMaxGap = Math.max(...athleteRaceGaps.map(g => g.maxGapKm));
        const gapCalloutType = aidMaxGap > athleteMaxGap * 1.2 ? "risk" : "positive";
        const gapBody = aidMaxGap > athleteMaxGap * 1.2
          ? `Largest gap previously managed: \\textbf{${tex(athleteMaxGap.toFixed(1))} km}. Goal race maximum: \\textbf{${tex(aidMaxGap.toFixed(1))} km}. The goal race includes a substantially larger unsupported stretch than previously experienced.`
          : `Largest gap previously managed: \\textbf{${tex(athleteMaxGap.toFixed(1))} km}. Goal race maximum: \\textbf{${tex(aidMaxGap.toFixed(1))} km}. Within historical experience.`;
        ln("", renderCallout(gapCalloutType, "Historical Aid Gap Experience", gapBody));
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 10 — Suggested Preparation Races
    ══════════════════════════════════════════════════════════════════ */
    if (prepRaces && prepRaces.suggestions.length > 0) {
      ln("", renderSectionHeader("Suggested Preparation Races", "Nearby races ranked by how effectively they close the athlete's experience gaps."));
      ln(renderLongTable(
        "X[3,l] X[1.2,r] X[1.5,r] X[2,c]",
        ["Race", "Dist.", "Ascent", "Next date"],
        prepRaces.suggestions.slice(0, 8).map(s => {
          const dist = s.total_distance_km ? `${s.total_distance_km.toFixed(0)} km` : `${s.distance_miles.toFixed(0)} mi`;
          const asc  = s.total_ascent_m ? `${Math.round(s.total_ascent_m).toLocaleString()} m` : "{--}";
          return [tex(s.race_name), tex(dist), tex(asc), tex(s.next_date ?? "{--}")];
        }),
      ));
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 11 — Experience Context
    ══════════════════════════════════════════════════════════════════ */
    if (expContext) {
      const ec = expContext;
      const scl = ec.scale;
      const te = ec.time_estimate;
      const bc = ec.biggest_climb;
      const om = ec.opening_match;

      ln("", renderSectionHeader("Experience Context", `How ${tex(firstName)}'s past races compare to the demands of ${tex(race.name)}.`));

      if (scl) {
        ln("", renderSubsectionHeader("Course Scale"));
        ln(renderShortTable("lrrr", ["Dimension", "Goal race", "Athlete best", "Ratio"], [
          ["Distance",          `${tex(scl.goal_distance_km.toFixed(0))} km`,                       `${tex(scl.athlete_max_dist    ? scl.athlete_max_dist.km.toFixed(0)                       : "{--}")} km`, `${tex(scl.distance_ratio)}\\texttimes`],
          ["Ascent",            `${tex(Math.round(scl.goal_ascent_m).toLocaleString())} m`,         `${tex(scl.athlete_max_ascent  ? Math.round(scl.athlete_max_ascent.m).toLocaleString()    : "{--}")} m`,  `${tex(scl.ascent_ratio)}\\texttimes`],
          ["Flat-equiv effort", `${tex(scl.goal_flat_equiv_km.toFixed(1))} km`,                     `${tex(scl.athlete_max_flat_equiv ? scl.athlete_max_flat_equiv.km.toFixed(1)             : "{--}")} km`, `${tex(scl.flat_equiv_ratio)}\\texttimes`],
        ]));
      }

      if (te) {
        ln("", renderSubsectionHeader("Time Estimate"),
          `Estimated finish time: \\textbf{${tex(te.estimated_min_hours.toFixed(1))}h -- ${tex(te.estimated_max_hours.toFixed(1))}h}`,
          `(based on ${tex(te.basis_race_name)}, finished in ${tex(te.basis_finish_hours.toFixed(1))}h).`,
          `Athlete's longest previous effort: ${tex(te.athlete_longest_race_name)} at ${tex(te.athlete_longest_hours.toFixed(1))}h.`,
        );
      }

      if (bc) {
        ln("", renderSubsectionHeader("Biggest Climb on Course"),
          `Goal race main climb: km ${tex(bc.goal.start_km.toFixed(1))}--${tex(bc.goal.end_km.toFixed(1))}, `,
          `${tex(Math.round(bc.goal.ascent_m).toLocaleString())} m over ${tex(bc.goal.km.toFixed(1))} km at avg ${tex(bc.goal.avg_grad.toFixed(1))}\\%.`,
        );
        if (bc.athlete_best) {
          ln(`Athlete's biggest recorded climb: ${tex(bc.athlete_best.km.toFixed(1))} km, ${tex(Math.round(bc.athlete_best.ascent_m).toLocaleString())} m`,
            `(${tex(bc.athlete_best.race_name)}, ${tex(String(bc.athlete_best.year))}).`,
            bc.ratio != null ? `Goal climb is \\textbf{${tex(bc.ratio.toFixed(1))}x} bigger than athlete's record.` : "",
          );
        } else {
          ln("No comparable climb found in athlete's race history.");
        }
      }

      if (om) {
        ln("", renderSubsectionHeader("Opening Profile Match"),
          om.matched_race_name
            ? `The opening ${tex(om.goal_opening_km.toFixed(0))} km (${tex(om.goal_climb_pct.toFixed(0))}\\% climbing, ${tex(tl(om.goal_dominant_terrain))} terrain) resembles the start of \\textbf{${tex(om.matched_race_name)}} (${tex(String(om.matched_race_year))}, similarity ${tex(Math.round(om.similarity * 100))}\\%).`
            : `The opening ${tex(om.goal_opening_km.toFixed(0))} km -- ${tex(stl(om.goal_dominant_type))} on ${tex(tl(om.goal_dominant_terrain))} terrain -- has no close match in the athlete's race history.`,
        );
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 12 — Self-Reflection
    ══════════════════════════════════════════════════════════════════ */
    const questions = [
      { q: "Have you been injured in the last few months?", why: "Recent injuries often leave residual weakness or altered movement patterns that can re-emerge under race-day load." },
      { q: "Have you slept enough and at sufficient quality?", why: "Sleep is when the body adapts to training stress. Chronic underslept athletes carry accumulated fatigue into race day." },
      { q: "Have you trained consistently for at least 16 weeks?", why: "Fitness built on a large base of consistent weeks is far more robust than the same volume crammed into a shorter window." },
      { q: "Is your footwear correct for the demands of this race?", why: "Terrain, drop, stack height, grip pattern, and fit under swelling all interact with the specific demands of your race." },
      { q: "Have you practised your race nutrition strategy?", why: "GI distress is one of the leading causes of DNF and dramatically slowed racing. Every product and quantity should have been tested at effort." },
      { q: "Are you carrying any pain or tightness you are hoping will be fine on the day?", why: "Race day magnifies small problems. Niggles rarely disappear under 10+ hours of sustained stress." },
      { q: "Is your goal time based on evidence or is it hopeful?", why: "An honest goal is built from comparable race times, this course's demands, and realistic adjustments for conditions." },
    ];
    ln("", renderSectionHeader("Self-Reflection", `Questions the data cannot answer -- ${tex(firstName)} should consider each one honestly before race day.`));
    ln("\\begin{enumerate}");
    for (const { q, why } of questions) {
      ln(`\\item \\textbf{${tex(q)}}`, `  \\\\\\small{\\textit{${tex(why)}}}`);
    }
    ln("\\end{enumerate}");

    /* ══════════════════════════════════════════════════════════════════
       SECTION 13 — Physical Self-Assessments
    ══════════════════════════════════════════════════════════════════ */
    if (assessmentTests.length > 0) {
      ln("", renderSectionHeader("Physical Self-Assessments", "Tests to identify strength gaps, imbalances, and flexibility limitations."));

      /* Priority assessments first (uphill/downhill rating ≥ 3) */
      const priorityTests = assessmentTests.filter(t => (t.rating_uphill ?? 0) >= 3 || (t.rating_downhill ?? 0) >= 3 || (t.rating_technical ?? 0) >= 3);
      const otherTests    = assessmentTests.filter(t => !priorityTests.includes(t));

      if (priorityTests.length > 0) {
        ln(renderCallout("priority", "Priority Assessments", "These tests are most relevant to the demands of this course."));
        for (const test of priorityTests) {
          ln(renderAssessmentCard({
            name: tex(test.name),
            category: test.category ?? undefined,
            aim: test.aim ? tex(test.aim) : undefined,
            description: test.description ? tex(test.description) : undefined,
            instructions: test.instructions.map(s => tex(s)),
            whatToRecord: test.what_to_record ? tex(test.what_to_record) : undefined,
            notes: test.notes ? tex(test.notes) : undefined,
          }));
        }
      }

      if (otherTests.length > 0) {
        if (priorityTests.length > 0) ln(renderCallout("insight", "For a Fuller Picture", "Additional assessments that provide valuable supplementary data."));
        for (const test of otherTests) {
          ln(renderAssessmentCard({
            name: tex(test.name),
            category: test.category ?? undefined,
            aim: test.aim ? tex(test.aim) : undefined,
            description: test.description ? tex(test.description) : undefined,
            instructions: test.instructions.map(s => tex(s)),
            whatToRecord: test.what_to_record ? tex(test.what_to_record) : undefined,
            notes: test.notes ? tex(test.notes) : undefined,
          }));
        }
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 14 — Suggested Next Steps
    ══════════════════════════════════════════════════════════════════ */
    ln("", renderSectionHeader("Suggested Next Steps", "Prioritised actions to improve race-specific readiness."));

    type NextStep = { category: string; action: string; why: string; priority: "Priority" | "Recommended" | "Optional" };
    const nextSteps: NextStep[] = [
      /* Strength & conditioning */
      { category: "Strength \\& Conditioning", action: "Complete the physical self-assessments in this report", why: "Identify specific weaknesses before programming targeted exercises.", priority: "Priority" },
      { category: "Strength \\& Conditioning", action: "Add eccentric downhill loading to your training", why: `${race.name} includes ${Math.round(totalDescentM).toLocaleString()} m of descent. Quads must absorb sustained braking force.`, priority: totalDescentM >= 2000 ? "Priority" : "Recommended" },
      { category: "Strength \\& Conditioning", action: "Single-leg strength work 2x per week", why: "Asymmetric failure under fatigue is the most common cause of late-race injury.", priority: "Recommended" },
      /* Terrain specificity */
      ...(trailDemandKm > 0 && trailCoveredKm < trailDemandKm * 0.6 ? [{
        category: "Terrain Specificity",
        action: "Increase time on technical off-road terrain",
        why: "Experience gap identified: trail/fell demand significantly exceeds covered kilometres.",
        priority: "Priority" as const,
      }] : []),
      ...(totalAscentM >= 1000 && athAscent < totalAscentM * 0.5 && athAscent > 0 ? [{
        category: "Terrain Specificity",
        action: "Add back-to-back climbing days in preparation blocks",
        why: `Goal race ascent (${Math.round(totalAscentM).toLocaleString()} m) exceeds athlete's best single-race ascent by more than 50\\%.`,
        priority: "Priority" as const,
      }] : []),
      { category: "Terrain Specificity", action: "Practice hiking poles on extended climbs if permitted", why: "Efficient pole use can save 5--10\\% effort on sustained climbs.", priority: "Optional" },
      /* Race preparation */
      ...(prepRaces && prepRaces.suggestions.length > 0 ? [{
        category: "Race Preparation",
        action: `Race at one of the ${Math.min(prepRaces.suggestions.length, 3)} suggested preparation races in this report`,
        why: "Preparation races close specific terrain experience gaps and provide race-day practice.",
        priority: "Recommended" as const,
      }] : []),
      { category: "Race Preparation", action: "Simulate the race distance in a 2-day back-to-back training weekend", why: "Back-to-back tired-legs training builds tolerance for the effort duration specific to this race.", priority: "Recommended" },
      { category: "Race Preparation", action: "Test all nutrition products at target race intensity", why: "GI failure during racing is one of the most common preventable causes of DNF.", priority: "Priority" },
      /* Equipment */
      { category: "Equipment", action: "Verify footwear grip is suitable for the dominant surface", why: `${tex(surfaceSummary.entries[0]?.[0] ? stl(surfaceSummary.entries[0][0]) : "Trail")} is the primary surface. Wrong grip costs both energy and confidence.`, priority: "Recommended" },
      ...(aidSorted.some(s => s.dropBags) ? [{
        category: "Equipment",
        action: "Plan drop bag contents and practice accessing them quickly",
        why: "Drop bags are available on course. Plan what you need and where, and rehearse transitions.",
        priority: "Recommended" as const,
      }] : []),
      /* Logistics */
      { category: "Logistics", action: "Recce the start, key climbs, and the finish", why: "Knowing what to expect removes cognitive load during the race.", priority: "Recommended" },
      { category: "Logistics", action: "Finalise crew / support plan if applicable", why: "Support crew uncertainty is a source of anxiety and wasted time on race day.", priority: "Optional" },
    ];

    /* Group by category */
    const categories = [...new Set(nextSteps.map(s => s.category))];
    for (const cat of categories) {
      const steps = nextSteps.filter(s => s.category === cat);
      ln("", renderSubsectionHeader(cat));
      ln("\\begin{itemize}[leftmargin=1.2em,itemsep=4pt,topsep=4pt]");
      for (const s of steps) {
        ln(`\\item \\PriorityBadge{${s.priority}}\\quad \\textbf{${s.action}}\\\\{\\small\\color{TortoiseDarkGrey}${s.why}}`);
      }
      ln("\\end{itemize}");
    }

    /* ══════════════════════════════════════════════════════════════════
       SECTION 15 — Appendix: Complete Race History
    ══════════════════════════════════════════════════════════════════ */
    const allRacesSorted = [...filteredRaces].sort((a, b) => b.result_year - a.result_year || a.race_name.localeCompare(b.race_name));
    if (allRacesSorted.length > 0) {
      ln("", renderSectionHeader("Appendix A -- Complete Race History"));
      ln(renderLongTable(
        "X[1,c] X[3,l] X[1.5,c] X[1.2,r] X[1.5,r] X[2,r]",
        ["Year", "Race", "Status", "Dist.", "Ascent", "Time / Pos."],
        allRacesSorted.map(r => {
          const dist = r.total_distance_km ? `${r.total_distance_km.toFixed(0)} km` : "{--}";
          const asc  = r.total_ascent_m    ? `${Math.round(r.total_ascent_m).toLocaleString()} m` : "{--}";
          const time = r.finish_seconds    ? formatSecs(r.finish_seconds) : r.result_status === "FINISHED" ? "{--}" : tex(r.result_status);
          const pos  = r.position != null  ? `P${r.position}` : "";
          const combined = [time, pos].filter(Boolean).join(" / ");
          return [tex(String(r.result_year)), tex(r.race_name), tex(r.result_status), dist, asc, combined];
        }),
      ));
    }
  }

  ln("", "\\end{document}");
  return lines.filter(l => l !== "").join("\n");
}

/* ══════════════════════════════════════════════════════════════════
   UI COMPONENTS (same comboboxes as race-readiness page)
══════════════════════════════════════════════════════════════════ */
function RaceSearchCombobox({ races, selectedId, onSelect }: { races: RaceOption[]; selectedId: string; onSelect: (id: string) => void }) {
  const selectedRace = races.find(r => r.race_id === selectedId);
  const [query, setQuery] = useState(selectedRace?.race_name ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectedRace && !query) setQuery(selectedRace.race_name); }, [selectedRace]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEffect(() => { if (races.length > 0 && inputRef.current && inputRef.current === document.activeElement) setOpen(true); }, [races.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return (q ? races.filter(r => r.race_name.toLowerCase().includes(q)) : races).slice(0, 30); }, [query, races]);
  function select(race: RaceOption) { setQuery(race.race_name); setOpen(false); onSelect(race.race_id); }
  const inS: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none", width: "280px" };
  const dropS: React.CSSProperties = { position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "320px", maxHeight: "320px", overflowY: "auto", marginTop: "4px" };
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input ref={inputRef} type="text" value={query} placeholder={races.length === 0 ? "Loading races…" : "Search races…"} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} style={inS} />
      {open && filtered.length > 0 && (
        <div style={dropS}>
          {filtered.map(r => (
            <button key={r.race_id} type="button" onClick={() => select(r)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#111" }}>{r.race_name}</div>
              {r.total_distance_km && <div style={{ fontSize: "11px", color: "#888" }}>{r.total_distance_km.toFixed(0)} km{r.total_ascent_m ? ` · ${Math.round(r.total_ascent_m).toLocaleString()} m ↑` : ""}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AthleteSearchCombobox({ athletes, onSelect, selectedKey }: { athletes: { athlete_key: string; race_count: number }[]; onSelect: (key: string) => void; selectedKey: string }) {
  const [query, setQuery] = useState(selectedKey);
  const [open, setOpen] = useState(false);
  const [apiHits, setApiHits] = useState<{ athlete_key: string; race_count: number }[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectedKey && !query) setQuery(selectedKey); }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEffect(() => { if (athletes.length > 0 && inputRef.current === document.activeElement) setOpen(true); }, [athletes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const localFiltered = useMemo(() => { const q = query.trim().toLowerCase(); return (!q ? athletes.slice(0, 30) : athletes.filter(a => a.athlete_key.toLowerCase().includes(q)).slice(0, 30)); }, [query, athletes]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setApiHits([]); return; }
    if (localFiltered.length >= 5) { setApiHits([]); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(q)}&limit=30`);
        if (res.ok) { const json = await res.json() as { athletes: { athlete_key: string; race_count: number }[] }; const localKeys = new Set(athletes.map(a => a.athlete_key)); setApiHits((json.athletes ?? []).filter(a => !localKeys.has(a.athlete_key))); }
      } catch { /* ignore */ }
    }, 300);
  }, [query, localFiltered.length, athletes]); // eslint-disable-line react-hooks/exhaustive-deps
  const displayed = useMemo(() => [...localFiltered, ...apiHits].slice(0, 30), [localFiltered, apiHits]);
  function select(a: { athlete_key: string }) { setQuery(a.athlete_key); setOpen(false); setApiHits([]); onSelect(a.athlete_key); }
  const inputS: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", outline: "none", width: "260px" };
  const dropS: React.CSSProperties = { position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "280px", maxHeight: "320px", overflowY: "auto", marginTop: "4px" };
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input ref={inputRef} type="text" value={query} placeholder="Search athletes…" onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} style={inputS} />
      {open && displayed.length > 0 && (
        <div style={dropS}>
          {displayed.map(a => (
            <button key={a.athlete_key} type="button" onClick={() => select(a)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#111" }}>{a.athlete_key}</div>
              <div style={{ fontSize: "11px", color: "#888" }}>{a.race_count} races</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════ */
export default function RaceReadinessLatexPage() {
  const supabase = createClient();

  const [races, setRaces] = useState<RaceOption[]>([]);
  const [athleteNames, setAthleteNames] = useState<{ athlete_key: string; race_count: number }[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [selectedAthleteKey, setSelectedAthleteKey] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [athlete, setAthlete] = useState<AthleteResponse | null>(null);
  const [athleteLoading, setAthleteLoading] = useState(false);
  const [athleteError, setAthleteError] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(100);
  const [includedRaceKeys, setIncludedRaceKeys] = useState<Set<string>>(new Set());
  const [assessmentTests, setAssessmentTests] = useState<AssessmentTest[]>([]);
  const [lastFilename, setLastFilename] = useState("");
  const [latexContent, setLatexContent] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  // Revoke the previous blob URL whenever a new PDF is produced
  useEffect(() => {
    return () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); };
  }, []);

  const fetchAthlete = useCallback(async (key: string) => {
    if (!key.trim()) return;
    setAthleteLoading(true); setAthleteError(""); setAthlete(null);
    try {
      const res = await fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(key.trim())}`);
      const json = await res.json() as AthleteResponse & { error?: string };
      if (!res.ok || json.error) { setAthleteError(json.error ?? "Failed to load athlete."); }
      else { setAthlete(json); setIncludedRaceKeys(new Set(json.races.map(r => `${r.race_id}|${r.result_year}`))); }
    } catch { setAthleteError("Network error loading athlete."); }
    setAthleteLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("races").select("id, name").order("name");
      if (data) setRaces(data.map(r => ({ race_id: r.id as string, race_name: r.name as string, total_distance_km: null, total_ascent_m: null })));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("als_athlete_profiles").select("athlete_key, race_count").order("race_count", { ascending: false }).range(0, 9999);
      if (data) setAthleteNames(data as { athlete_key: string; race_count: number }[]);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("assessment_tests").select("id, name, description, aim, instructions, target_muscles, notes, category, what_to_record, rating_uphill, rating_downhill, rating_technical, rating_gravel_stability, rating_general_asymmetry").order("category, name");
      if (data) setAssessmentTests(data as AssessmentTest[]);
    })();
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

  async function handleGenerateAndDownload() {
    if (!selectedRaceId) { setGenError("Please select a race."); return; }
    setGenerating(true); setGenError("");

    let effectiveResult: OverviewResponse;
    try {
      const res = await fetch("/api/race-readiness/overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ race_id: selectedRaceId }) });
      const json = await res.json() as OverviewResponse & { error?: string };
      if (res.status === 404 || (!res.ok && json.error?.includes("No race profile"))) {
        const raceName = races.find(r => r.race_id === selectedRaceId)?.race_name ?? "Unknown race";
        effectiveResult = { race: { id: selectedRaceId, name: raceName, slug: null, total_distance_km: 0, total_ascent_m: 0, total_descent_m: 0, race_date: null, weather_lat: null, weather_lon: null }, route: [], wind_sections: null, elevation_profile: null, sustained_segments: null, terrain_sections: [], aid_stations: null };
      } else if (!res.ok || json.error) { setGenError(json.error ?? "Failed to load race overview."); setGenerating(false); return; }
      else { effectiveResult = json; }
    } catch { setGenError("Network error loading race overview."); setGenerating(false); return; }

    const effectiveDate = effectiveResult.race.race_date;
    const hasWeather = effectiveDate && effectiveResult.race.weather_lat !== null && effectiveResult.race.weather_lon !== null;

    const weatherPromise: Promise<WeatherDayRecord[]> = hasWeather
      ? (() => { const [, mStr, dStr] = effectiveDate!.split("-"); return fetch("/api/race-analysis/weather-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: effectiveResult.race.weather_lat, lon: effectiveResult.race.weather_lon, month: parseInt(mStr, 10), day: parseInt(dStr, 10) }) }).then(r => r.ok ? (r.json() as Promise<{ data: WeatherDayRecord[] }>).then(d => d.data ?? []) : []).catch(() => []); })()
      : Promise.resolve([]);

    const resultsPromise = fetch("/api/race-strategy/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ race_id: selectedRaceId, target_minutes: 600 }) }).then(r => r.ok ? r.json() as Promise<ResultsResponse> : null).catch(() => null);

    const includeParam = [...includedRaceKeys].join(",");
    const reportAthletePromise = selectedAthleteKey.trim()
      ? fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(selectedAthleteKey.trim())}&include=${encodeURIComponent(includeParam)}`).then(r => r.ok ? r.json() as Promise<AthleteResponse> : null).catch(() => null)
      : Promise.resolve(null);

    const prepRacesPromise = (selectedAthleteKey.trim() && selectedRaceId)
      ? fetch(`/api/race-readiness/prep-races?key=${encodeURIComponent(selectedAthleteKey.trim())}&race_id=${encodeURIComponent(selectedRaceId)}&radius_miles=${radiusMiles}`).then(r => r.ok ? r.json() as Promise<PrepRacesResult> : null).catch(() => null)
      : Promise.resolve(null);

    const expContextPromise = (selectedAthleteKey.trim() && selectedRaceId)
      ? fetch(`/api/race-readiness/experience-context?key=${encodeURIComponent(selectedAthleteKey.trim())}&race_id=${encodeURIComponent(selectedRaceId)}`).then(r => r.ok ? r.json() as Promise<ExperienceContextResult> : null).catch(() => null)
      : Promise.resolve(null);

    const elevProfileMatchPromise = (selectedAthleteKey.trim() && selectedRaceId)
      ? fetch(`/api/race-readiness/elevation-profile-match?key=${encodeURIComponent(selectedAthleteKey.trim())}&race_id=${encodeURIComponent(selectedRaceId)}`).then(r => r.ok ? r.json() as Promise<ElevProfileMatchResult> : null).catch(() => null)
      : Promise.resolve(null);

    const [weatherData, resultsData, reportAthleteData, prepRacesData, expContextData, elevProfileMatchData] = await Promise.all([weatherPromise, resultsPromise, reportAthletePromise, prepRacesPromise, expContextPromise, elevProfileMatchPromise]);

    let splitData: ResultsResponse | null = null;
    if (resultsData?.has_data && resultsData.distribution?.length) {
      const dist = resultsData.distribution;
      const total = resultsData.total_finishers ?? 0;
      let cumulative = 0;
      let medianMin = dist[Math.floor(dist.length / 2)].min_min;
      for (const b of dist) { cumulative += b.count; if (cumulative >= total / 2) { medianMin = (b.min_min + b.max_min) / 2; break; } }
      try { const r = await fetch("/api/race-strategy/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ race_id: selectedRaceId, target_minutes: Math.round(medianMin) }) }); if (r.ok) splitData = await r.json() as ResultsResponse; } catch { /* optional */ }
    }

    let athleteAidData: Record<string, AidStation[]> = {};
    if (reportAthleteData) {
      const raceIds = reportAthleteData.races.map(r => r.race_id);
      if (raceIds.length > 0) {
        try {
          const r = await fetch("/api/race-readiness/aid-stations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ race_ids: raceIds }) });
          if (r.ok) athleteAidData = await r.json() as Record<string, AidStation[]>;
        } catch { /* optional */ }
      }
    }

    const elevProfile = parseElevProfile(effectiveResult.elevation_profile);
    const sustainedSegs = parseSustainedSegs(effectiveResult.sustained_segments);

    const latex = generateLatex({
      result: effectiveResult,
      reportAthlete: reportAthleteData,
      expContext: expContextData,
      prepRaces: prepRacesData,
      elevProfile,
      sustainedSegs,
      results: resultsData,
      splitAnalysis: splitData,
      elevProfileMatch: elevProfileMatchData,
      assessmentTests,
      athleteAidData,
      weather: weatherData,
    });

    const slugPart = (effectiveResult.race.slug ?? effectiveResult.race.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 40);
    const athletePart = selectedAthleteKey.trim() ? "-" + selectedAthleteKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30) : "";
    const filename = `race-readiness-${slugPart}${athletePart}.tex`;

    const blob = new Blob([latex], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setLastFilename(filename);

    // Store latex for the in-page viewer and clear any previous compiled PDF
    setLatexContent(latex);
    if (pdfUrlRef.current) { URL.revokeObjectURL(pdfUrlRef.current); pdfUrlRef.current = null; }
    setPdfUrl(null);
    setCompileError("");
    setGenerating(false);
  }

  async function handleCompile() {
    if (!latexContent) return;
    setCompiling(true);
    setCompileError("");
    if (pdfUrlRef.current) { URL.revokeObjectURL(pdfUrlRef.current); pdfUrlRef.current = null; }
    setPdfUrl(null);

    try {
      const res = await fetch("/api/race-readiness-latex/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: latexContent }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setCompileError(json.error ?? "Compilation failed.");
      } else {
        const pdfBlob = await res.blob();
        const objectUrl = URL.createObjectURL(pdfBlob);
        pdfUrlRef.current = objectUrl;
        setPdfUrl(objectUrl);
      }
    } catch {
      setCompileError("Network error during compilation.");
    }
    setCompiling(false);
  }

  function handleDownloadCurrentLatex() {
    if (!latexContent || !lastFilename) return;
    const blob = new Blob([latexContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = lastFilename; a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopyLatex() {
    if (!latexContent) return;
    void navigator.clipboard.writeText(latexContent);
  }

  const labelStyle: React.CSSProperties = { fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px" };
  const generateBtn: React.CSSProperties = { padding: "10px 24px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px" };
  const outlineBtn = (disabled: boolean): React.CSSProperties => ({ padding: "10px 20px", border: "1px solid #1e3a1e", borderRadius: "8px", background: disabled ? "#f5f5f5" : "#fff", color: disabled ? "#aaa" : "#1e3a1e", fontWeight: 600, cursor: disabled ? "default" : "pointer", fontSize: "14px" });
  const compileBtn = (disabled: boolean): React.CSSProperties => ({ padding: "10px 20px", border: "none", borderRadius: "8px", background: disabled ? "#ccc" : "#1565c0", color: "#fff", fontWeight: 700, cursor: disabled ? "default" : "pointer", fontSize: "14px" });

  return (
    <main style={{ minHeight: "100vh", background: "#f9f9f9" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "24px 32px", display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-end" }}>
        <div>
          <div style={labelStyle}>Race</div>
          <RaceSearchCombobox races={races} selectedId={selectedRaceId} onSelect={handleRaceSelect} />
        </div>
        <div>
          <div style={labelStyle}>Athlete (optional)</div>
          <AthleteSearchCombobox athletes={athleteNames} selectedKey={selectedAthleteKey} onSelect={key => { setSelectedAthleteKey(key); void fetchAthlete(key); }} />
          {athleteLoading && <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>Loading athlete…</div>}
          {athleteError && <div style={{ fontSize: "11px", color: "#b00020", marginTop: "4px" }}>{athleteError}</div>}
        </div>
        <div>
          <div style={labelStyle}>Prep race radius</div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input type="number" value={radiusMiles} min={10} max={500} step={10} onChange={e => setRadiusMiles(Math.max(10, Math.min(500, Number(e.target.value))))} style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", color: "#111", background: "#fff", width: "70px" }} />
            <span style={{ fontSize: "12px", color: "#888" }}>miles</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={() => void handleGenerateAndDownload()} disabled={generating} style={generateBtn}>
              {generating ? "Generating…" : "Generate & Download .tex"}
            </button>
            <button type="button" onClick={() => void handleCompile()} disabled={!latexContent || compiling || generating} style={compileBtn(!latexContent || compiling || generating)}>
              {compiling ? "Compiling…" : "Compile to PDF"}
            </button>
            {latexContent && (
              <button type="button" onClick={handleDownloadCurrentLatex} style={outlineBtn(false)}>
                Re-download .tex
              </button>
            )}
          </div>
          {genError && <span style={{ fontSize: "12px", color: "#b00020" }}>{genError}</span>}
          {lastFilename && !generating && <span style={{ fontSize: "11px", color: "#2e7d32" }}>Downloaded: {lastFilename}</span>}
          {compileError && <span style={{ fontSize: "12px", color: "#b00020", whiteSpace: "pre-wrap" }}>{compileError}</span>}
        </div>
      </div>

      {athlete && !athleteLoading && (
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e5e5", padding: "16px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
            <div style={labelStyle}>Races to include in analysis</div>
            <span style={{ fontSize: "12px", color: "#888" }}>{includedRaceKeys.size} of {athlete.races.length} selected</span>
            <button type="button" onClick={() => setIncludedRaceKeys(new Set(athlete.races.map(r => `${r.race_id}|${r.result_year}`)))} style={{ fontSize: "12px", color: "#1e3a1e", background: "none", border: "1px solid #1e3a1e", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}>Select all</button>
            <button type="button" onClick={() => setIncludedRaceKeys(new Set())} style={{ fontSize: "12px", color: "#888", background: "none", border: "1px solid #ccc", borderRadius: "6px", padding: "4px 10px", cursor: "pointer" }}>Clear all</button>
          </div>
          <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e5e5", borderRadius: "8px" }}>
            {athlete.races.map(r => {
              const key = `${r.race_id}|${r.result_year}`;
              const checked = includedRaceKeys.has(key);
              return (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 14px", borderBottom: "1px solid #f0f0f0", cursor: "pointer", background: checked ? "#f0f7f0" : "#fff" }}>
                  <input type="checkbox" checked={checked} onChange={() => {
                    setIncludedRaceKeys(prev => {
                      const next = new Set(prev);
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    });
                  }} />
                  <span style={{ fontSize: "13px", color: "#111" }}>{r.race_name}</span>
                  <span style={{ fontSize: "11px", color: "#888" }}>{r.result_year} · {r.result_status}</span>
                  {r.total_distance_km && <span style={{ fontSize: "11px", color: "#aaa" }}>{r.total_distance_km.toFixed(0)} km</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {!latexContent && (
        <div style={{ padding: "32px", maxWidth: "700px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1e3a1e", marginBottom: "12px" }}>Race Readiness — LaTeX Export</h2>
          <p style={{ fontSize: "13px", color: "#555", lineHeight: 1.6, marginBottom: "16px" }}>
            Select a race (and optionally an athlete) then click <strong>Generate &amp; Download .tex</strong> to produce a LaTeX document containing the same sections, tables, and analysis as the Race Readiness report.
            The source will appear below for review, and <strong>Compile to PDF</strong> will render it inline using <code>pdflatex</code> on the server.
          </p>
          <p style={{ fontSize: "12px", color: "#888", lineHeight: 1.6 }}>
            Compilation requires a LaTeX distribution (TeX Live or MiKTeX) installed on the server with packages:
            <code> booktabs, xcolor, longtable, pgfplots, tikz, geometry, parskip, titlesec, hyperref, microtype, tabularx, makecell</code>.
          </p>
        </div>
      )}

      {latexContent && (
        <div style={{ display: "flex", height: "calc(100vh - 180px)", minHeight: "600px", borderTop: "1px solid #e0e0e0" }}>

          {/* ── LaTeX source panel ── */}
          <div style={{ width: "40%", display: "flex", flexDirection: "column", borderRight: "1px solid #e0e0e0", background: "#fafafa" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "#fff", borderBottom: "1px solid #e0e0e0", flexShrink: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a1e", flex: 1 }}>LaTeX Source</span>
              <span style={{ fontSize: "11px", color: "#aaa" }}>{latexContent.split("\n").length} lines</span>
              <button
                type="button"
                onClick={handleCopyLatex}
                style={{ fontSize: "11px", padding: "3px 10px", border: "1px solid #ccc", borderRadius: "5px", background: "#fff", cursor: "pointer", color: "#555" }}
              >
                Copy
              </button>
            </div>
            <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: "14px 16px", fontSize: "10.5px", lineHeight: 1.55, color: "#222", fontFamily: "monospace", whiteSpace: "pre" }}>
              {latexContent}
            </pre>
          </div>

          {/* ── PDF viewer panel ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "#fff", borderBottom: "1px solid #e0e0e0", flexShrink: 0 }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e3a1e", flex: 1 }}>Compiled PDF</span>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  download="race-readiness.pdf"
                  style={{ fontSize: "11px", padding: "3px 10px", border: "1px solid #1e3a1e", borderRadius: "5px", background: "#fff", cursor: "pointer", color: "#1e3a1e", textDecoration: "none" }}
                >
                  Download PDF
                </a>
              )}
            </div>

            <div style={{ flex: 1, position: "relative" }}>
              {compiling && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", color: "#888" }}>
                  <div style={{ width: "32px", height: "32px", border: "3px solid #e0e0e0", borderTop: "3px solid #1565c0", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                  <span style={{ fontSize: "13px" }}>Compiling with pdflatex…</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              )}
              {!compiling && compileError && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
                  <div style={{ background: "#fff0f0", border: "1px solid #ffcdd2", borderRadius: "8px", padding: "20px 24px", maxWidth: "500px", width: "100%" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#c0392b", marginBottom: "8px" }}>Compilation Error</div>
                    <pre style={{ fontSize: "11px", color: "#555", whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{compileError}</pre>
                    <div style={{ marginTop: "12px", fontSize: "11px", color: "#888" }}>
                      Ensure <code>pdflatex</code> is installed (TeX Live or MiKTeX) and available on the server PATH, with all required packages.
                    </div>
                  </div>
                </div>
              )}
              {!compiling && !pdfUrl && !compileError && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", color: "#aaa" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  <span style={{ fontSize: "13px" }}>Click <strong style={{ color: "#1565c0" }}>Compile to PDF</strong> to preview here</span>
                </div>
              )}
              {pdfUrl && !compiling && (
                <iframe
                  src={pdfUrl}
                  style={{ width: "100%", height: "100%", border: "none" }}
                  title="Compiled Race Readiness PDF"
                />
              )}
            </div>
          </div>

        </div>
      )}
    </main>
  );
}

/**
 * Course profile computation.
 *
 * Builds elevation-aware sections from GPX points and applies the cost model
 * to produce a flat_equivalent_km — the key metric used for race comparison.
 *
 * Optionally applies wind multipliers from a wind_analysis CSV.
 */

import type { GpxPoint } from "./types";
import { haversineKm } from "./sections";
import {
  gradientCostMultiplier,
  terrainMultiplier,
  fatigueMultiplier,
  downhillDamagePenalty,
  classifyGradient,
} from "./cost-model";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CourseSection {
  section_id: number;
  start_distance_km: number;
  end_distance_km: number;
  distance_km: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  mid_lat: number;
  mid_lon: number;
  bearing_deg: number;
  // Elevation
  elevation_change_m: number;
  ascent_m: number;
  descent_m: number;
  avg_gradient_percent: number;
  section_type: string;
  terrain: string;
  // Cost model outputs
  gradient_cost_multiplier: number;
  terrain_multiplier: number;
  fatigue_multiplier: number;
  downhill_damage_units: number;
  flat_equivalent_km: number;
  // Wind (added when wind CSV is available)
  wind_multiplier?: number;
  wind_adjusted_flat_equivalent_km?: number;
}

export interface RaceProfileData {
  total_distance_km: number;
  total_ascent_m: number;
  total_descent_m: number;
  flat_equivalent_km: number;
  difficulty_ratio: number;
  wind_adjusted_flat_equivalent_km?: number;
  wind_adjusted_difficulty_ratio?: number;
  profile_source: "gpx" | "gpx_wind";
  sections: CourseSection[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function bearingDeg(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const x = Math.sin(dLon) * Math.cos(lat2r);
  const y =
    Math.cos(lat1r) * Math.sin(lat2r) -
    Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

function interpolate(
  lat1: number, lon1: number, ele1: number,
  lat2: number, lon2: number, ele2: number,
  fraction: number
): GpxPoint {
  return {
    lat: lat1 + (lat2 - lat1) * fraction,
    lon: lon1 + (lon2 - lon1) * fraction,
    ele: ele1 + (ele2 - ele1) * fraction,
  };
}

// ── Wind CSV parser ───────────────────────────────────────────────────────────

interface WindRow {
  start_distance_km: number;
  end_distance_km: number;
  median_headwind_ms: number;
  p80_headwind_ms: number;
  median_crosswind_ms: number;
  headwind_probability: number;
  strong_headwind_probability: number;
  wind_risk_label: string;
  wind_multiplier?: number; // pre-computed if present
}

function parseWindCsv(csvText: string): WindRow[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());

  const idx = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const get = (name: string) => cols[idx(name)]?.trim() ?? "";
    return {
      start_distance_km: parseFloat(get("start_distance_km")) || 0,
      end_distance_km: parseFloat(get("end_distance_km")) || 0,
      median_headwind_ms: parseFloat(get("median_headwind_ms")) || 0,
      p80_headwind_ms: parseFloat(get("p80_headwind_ms")) || 0,
      median_crosswind_ms: parseFloat(get("median_crosswind_ms")) || 0,
      headwind_probability: parseFloat(get("headwind_probability")) || 0,
      strong_headwind_probability: parseFloat(get("strong_headwind_probability")) || 0,
      wind_risk_label: get("wind_risk_label"),
    };
  }).filter((r) => r.end_distance_km > r.start_distance_km);
}

/**
 * Wind cost multiplier — mirrors wind_cost_multiplier_from_components() in Python.
 */
function windCostMultiplier(
  headwindMs: number,
  crosswindMs: number,
  headwindProbability: number,
  strongHeadwindProbability: number,
  windEffectScale = 1.0
): number {
  const probabilityFactor = 0.50 + 0.50 * Math.max(0, Math.min(1, headwindProbability));

  let multiplier: number;
  if (headwindMs > 0) {
    const basePenalty =
      (0.012 * headwindMs + 0.0012 * headwindMs ** 2) * probabilityFactor
      + 0.03 * Math.max(0, Math.min(1, strongHeadwindProbability));
    multiplier = 1.0 + basePenalty;
  } else {
    const benefit = Math.min(0.006 * Math.abs(headwindMs), 0.045);
    multiplier = 1.0 - benefit;
  }

  const crosswindPenalty = Math.min(0.025, 0.0035 * Math.abs(crosswindMs));
  multiplier += crosswindPenalty;
  multiplier = 1.0 + (multiplier - 1.0) * windEffectScale;

  return Math.max(0.955, Math.min(1.18, Math.round(multiplier * 10000) / 10000));
}

/**
 * Distance-weighted average wind multiplier for a course section,
 * matching the overlap logic from Python's wind_multiplier_for_section().
 */
function windMultiplierForSection(
  sectionStart: number,
  sectionEnd: number,
  windRows: WindRow[]
): number {
  const sectionDist = sectionEnd - sectionStart;
  if (sectionDist <= 0 || windRows.length === 0) return 1.0;

  let weightedSum = 0;
  let covered = 0;

  for (const w of windRows) {
    const overlap = Math.max(
      0,
      Math.min(sectionEnd, w.end_distance_km) - Math.max(sectionStart, w.start_distance_km)
    );
    if (overlap <= 0) continue;

    const wm = windCostMultiplier(
      w.median_headwind_ms,
      w.median_crosswind_ms,
      w.headwind_probability,
      w.strong_headwind_probability
    );
    weightedSum += overlap * wm;
    covered += overlap;
  }

  // Unaffected portion defaults to 1.0
  const unaffected = Math.max(sectionDist - covered, 0);
  return (weightedSum + unaffected) / sectionDist;
}

// ── Main course section builder ───────────────────────────────────────────────

/**
 * Splits GPX points into fixed-distance course sections and computes
 * gradient, ascent, descent, and cost model values for each.
 */
export function buildCourseSections(
  points: GpxPoint[],
  sectionKm: number,
  terrainLookup: (midpointKm: number) => string
): CourseSection[] {
  const totalDistanceKm = (() => {
    let d = 0;
    for (let i = 1; i < points.length; i++) {
      d += haversineKm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    }
    return d;
  })();

  const sections: CourseSection[] = [];
  let sectionId = 1;
  let totalDist = 0;

  // Current section start state
  let csLat = points[0].lat;
  let csLon = points[0].lon;
  let csEle = points[0].ele;

  // Points accumulated within the current section (for ascent/descent calc)
  let sectionPoints: GpxPoint[] = [{ lat: csLat, lon: csLon, ele: csEle }];

  let currentDist = 0;
  let lastLat = points[0].lat;
  let lastLon = points[0].lon;
  let lastEle = points[0].ele;

  for (let i = 1; i < points.length; i++) {
    const { lat: lat2, lon: lon2, ele: ele2 } = points[i];
    let lat1 = lastLat, lon1 = lastLon, ele1 = lastEle;
    let segDist = haversineKm(lat1, lon1, lat2, lon2);

    while (currentDist + segDist >= sectionKm) {
      const remaining = sectionKm - currentDist;
      const fraction = segDist > 0 ? remaining / segDist : 0;
      const ep = interpolate(lat1, lon1, ele1, lat2, lon2, ele2, fraction);
      sectionPoints.push(ep);

      // Compute ascent/descent from the section's accumulated points
      let ascent = 0, descent = 0;
      for (let k = 1; k < sectionPoints.length; k++) {
        const delta = sectionPoints[k].ele - sectionPoints[k - 1].ele;
        if (delta > 0) ascent += delta;
        else descent += Math.abs(delta);
      }

      const endLat = ep.lat, endLon = ep.lon, endEle = ep.ele;
      const elevChange = endEle - csEle;
      const dist = sectionKm;
      const gradient = (elevChange / (dist * 1000)) * 100;

      const midpoint = totalDist + dist / 2;
      const terrain = terrainLookup(midpoint);
      const gradCost = gradientCostMultiplier(gradient);
      const terrCost = terrainMultiplier(terrain);
      const fatigue = fatigueMultiplier(midpoint, totalDistanceKm);
      const downhill = downhillDamagePenalty(gradient, dist, terrain);
      const flatEquiv = (dist * gradCost * terrCost + downhill) * fatigue;

      sections.push({
        section_id: sectionId++,
        start_distance_km: r3(totalDist),
        end_distance_km: r3(totalDist + dist),
        distance_km: r3(dist),
        start_lat: csLat, start_lon: csLon,
        end_lat: endLat, end_lon: endLon,
        mid_lat: (csLat + endLat) / 2,
        mid_lon: (csLon + endLon) / 2,
        bearing_deg: r3(bearingDeg(csLat, csLon, endLat, endLon)),
        elevation_change_m: r3(elevChange),
        ascent_m: r3(ascent),
        descent_m: r3(descent),
        avg_gradient_percent: r3(gradient),
        section_type: classifyGradient(gradient),
        terrain,
        gradient_cost_multiplier: r3(gradCost),
        terrain_multiplier: r3(terrCost),
        fatigue_multiplier: r3(fatigue),
        downhill_damage_units: r3(downhill),
        flat_equivalent_km: r3(flatEquiv),
      });

      totalDist += sectionKm;
      csLat = endLat; csLon = endLon; csEle = endEle;
      sectionPoints = [ep];

      lat1 = ep.lat; lon1 = ep.lon; ele1 = ep.ele;
      segDist = haversineKm(lat1, lon1, lat2, lon2);
      currentDist = 0;
    }

    currentDist += segDist;
    sectionPoints.push({ lat: lat2, lon: lon2, ele: ele2 });
    lastLat = lat2; lastLon = lon2; lastEle = ele2;
  }

  // Final partial section (keep if > 200 m)
  if (currentDist > 0.2 && sectionPoints.length >= 2) {
    let ascent = 0, descent = 0;
    for (let k = 1; k < sectionPoints.length; k++) {
      const delta = sectionPoints[k].ele - sectionPoints[k - 1].ele;
      if (delta > 0) ascent += delta;
      else descent += Math.abs(delta);
    }
    const { lat: endLat, lon: endLon, ele: endEle } = points[points.length - 1];
    const elevChange = endEle - csEle;
    const dist = currentDist;
    const gradient = (elevChange / (dist * 1000)) * 100;
    const midpoint = totalDist + dist / 2;
    const terrain = terrainLookup(midpoint);
    const gradCost = gradientCostMultiplier(gradient);
    const terrCost = terrainMultiplier(terrain);
    const fatigue = fatigueMultiplier(midpoint, totalDistanceKm);
    const downhill = downhillDamagePenalty(gradient, dist, terrain);
    const flatEquiv = (dist * gradCost * terrCost + downhill) * fatigue;

    sections.push({
      section_id: sectionId,
      start_distance_km: r3(totalDist),
      end_distance_km: r3(totalDist + dist),
      distance_km: r3(dist),
      start_lat: csLat, start_lon: csLon,
      end_lat: endLat, end_lon: endLon,
      mid_lat: (csLat + endLat) / 2,
      mid_lon: (csLon + endLon) / 2,
      bearing_deg: r3(bearingDeg(csLat, csLon, endLat, endLon)),
      elevation_change_m: r3(elevChange),
      ascent_m: r3(ascent),
      descent_m: r3(descent),
      avg_gradient_percent: r3(gradient),
      section_type: classifyGradient(gradient),
      terrain,
      gradient_cost_multiplier: r3(gradCost),
      terrain_multiplier: r3(terrCost),
      fatigue_multiplier: r3(fatigue),
      downhill_damage_units: r3(downhill),
      flat_equivalent_km: r3(flatEquiv),
    });
  }

  return sections;
}

// ── Wind application ──────────────────────────────────────────────────────────

/**
 * Adds wind_multiplier and wind_adjusted_flat_equivalent_km to each section
 * and returns the total wind-adjusted flat equivalent km.
 */
export function applyWindAdjustment(
  sections: CourseSection[],
  windCsvText: string
): { sections: CourseSection[]; totalWindAdjustedKm: number } {
  const windRows = parseWindCsv(windCsvText);

  for (const s of sections) {
    const wm = windMultiplierForSection(s.start_distance_km, s.end_distance_km, windRows);
    s.wind_multiplier = r3(wm);
    s.wind_adjusted_flat_equivalent_km = r3(s.flat_equivalent_km * wm);
  }

  const total = sections.reduce(
    (sum, s) => sum + (s.wind_adjusted_flat_equivalent_km ?? s.flat_equivalent_km),
    0
  );

  return { sections, totalWindAdjustedKm: r3(total) };
}

// ── Full race profile ─────────────────────────────────────────────────────────

/**
 * Computes a full race profile from GPX text and optional wind CSV text.
 *
 * This is the primary entry point for the profile API route.
 */
export function computeRaceProfile(
  gpxPoints: GpxPoint[],
  terrainLookup: (midKm: number) => string,
  windCsvText?: string | null
): RaceProfileData {
  const sectionKm = 1.0; // match Python's CHUNK_KM default

  const sections = buildCourseSections(gpxPoints, sectionKm, terrainLookup);

  const totalDistanceKm = r3(
    sections.reduce((s, sec) => s + sec.distance_km, 0)
  );
  const totalAscent = r3(sections.reduce((s, sec) => s + sec.ascent_m, 0));
  const totalDescent = r3(sections.reduce((s, sec) => s + sec.descent_m, 0));
  const flatEquivKm = r3(
    sections.reduce((s, sec) => s + sec.flat_equivalent_km, 0)
  );
  const difficultyRatio = r3(
    totalDistanceKm > 0 ? flatEquivKm / totalDistanceKm : 1
  );

  if (windCsvText) {
    const { sections: windedSections, totalWindAdjustedKm } = applyWindAdjustment(
      sections,
      windCsvText
    );
    const windDiffRatio = r3(
      totalDistanceKm > 0 ? totalWindAdjustedKm / totalDistanceKm : 1
    );
    return {
      total_distance_km: totalDistanceKm,
      total_ascent_m: totalAscent,
      total_descent_m: totalDescent,
      flat_equivalent_km: flatEquivKm,
      difficulty_ratio: difficultyRatio,
      wind_adjusted_flat_equivalent_km: totalWindAdjustedKm,
      wind_adjusted_difficulty_ratio: windDiffRatio,
      profile_source: "gpx_wind",
      sections: windedSections,
    };
  }

  return {
    total_distance_km: totalDistanceKm,
    total_ascent_m: totalAscent,
    total_descent_m: totalDescent,
    flat_equivalent_km: flatEquivKm,
    difficulty_ratio: difficultyRatio,
    profile_source: "gpx",
    sections,
  };
}

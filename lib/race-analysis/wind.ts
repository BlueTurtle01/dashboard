/**
 * Wind analysis core logic.
 *
 * Direct TypeScript port of the wind_components() and analyse_wind()
 * functions from WindAnalysis.py.
 *
 * Key difference from the Python version:
 * - Python fetches u10/v10 directly from ERA5-Land NetCDF files.
 * - Here we receive wind_speed_10m (m/s) and wind_direction_10m (degrees,
 *   meteorological convention: the direction FROM which the wind blows).
 * - We convert to u/v components and the remaining maths is identical.
 */

import type { RouteSection, WindAnalysisSettings, WindSectionResult } from "./types";
import { fetchHistoricalWind } from "./open-meteo";

// ── Maths helpers ─────────────────────────────────────────────────────────────

/**
 * Convert (windSpeed, windDirection, routeBearing) to headwind and crosswind
 * components.
 *
 * windDirection: meteorological convention (direction FROM which wind blows),
 *                 0° = from North, 90° = from East, etc.
 * routeBearing:  compass bearing the runner is travelling, 0° = North.
 *
 * Positive headwind = wind opposing the runner.
 * Negative headwind = tailwind.
 */
function windComponents(
  windSpeed: number,
  windDirection: number,
  routeBearing: number
): { headwind: number; crosswind: number } {
  // Convert met convention to u (eastward) / v (northward) components.
  // Because the direction is where wind comes FROM, we negate to get where it GOES.
  const dirRad = (windDirection * Math.PI) / 180;
  const u = -windSpeed * Math.sin(dirRad); // eastward
  const v = -windSpeed * Math.cos(dirRad); // northward

  // Route direction unit vector
  const theta = (routeBearing * Math.PI) / 180;
  const routeEast = Math.sin(theta);
  const routeNorth = Math.cos(theta);

  // Tailwind = projection of wind vector onto route direction
  const tailwind = u * routeEast + v * routeNorth;
  const headwind = -tailwind;

  // Crosswind = orthogonal component
  const crosswindSq = Math.max(0, windSpeed * windSpeed - tailwind * tailwind);

  return { headwind, crosswind: Math.sqrt(crosswindSq) };
}

/**
 * Clamp race day to the last day of the given month (handles e.g. Feb 30 → Feb 28).
 */
function safeDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay)));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sortedCopy(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Per-section analysis ──────────────────────────────────────────────────────

export async function analyseSection(
  section: RouteSection,
  settings: WindAnalysisSettings
): Promise<WindSectionResult> {
  const {
    race_month,
    race_day,
    years_back,
    window_days,
    start_hour,
    end_hour,
    headwind_threshold_ms,
    strong_headwind_threshold_ms,
  } = settings;

  const currentYear = new Date().getFullYear();
  const rawHeadwinds: number[] = [];
  const rawCrosswinds: number[] = [];
  const rawSpeeds: number[] = [];

  // Fetch one date window per historical year
  for (let yr = currentYear - years_back; yr < currentYear; yr++) {
    const centre = safeDate(yr, race_month, race_day);

    const startDate = new Date(centre);
    startDate.setUTCDate(startDate.getUTCDate() - window_days);

    const endDate = new Date(centre);
    endDate.setUTCDate(endDate.getUTCDate() + window_days);

    try {
      const data = await fetchHistoricalWind(
        section.mid_lat,
        section.mid_lon,
        formatDate(startDate),
        formatDate(endDate)
      );

      const { time, wind_speed_10m, wind_direction_10m } = data.hourly;

      for (let i = 0; i < time.length; i++) {
        // Open-Meteo returns times as "YYYY-MM-DDTHH:00" in UTC
        const hourStr = time[i].slice(11, 13);
        const hour = parseInt(hourStr, 10);

        if (hour < start_hour || hour > end_hour) continue;

        const speed = wind_speed_10m[i];
        const dir = wind_direction_10m[i];
        if (speed == null || dir == null || isNaN(speed) || isNaN(dir)) continue;

        const { headwind, crosswind } = windComponents(
          speed,
          dir,
          section.bearing_deg
        );

        rawHeadwinds.push(headwind);
        rawCrosswinds.push(crosswind);
        rawSpeeds.push(speed);
      }
    } catch {
      // A single-year failure is non-fatal — skip and continue with other years
    }
  }

  if (rawHeadwinds.length === 0) {
    return {
      ...section,
      sample_hours: 0,
      headwind_probability: null,
      strong_headwind_probability: null,
      median_headwind_ms: null,
      p80_headwind_ms: null,
      median_crosswind_ms: null,
      median_wind_speed_ms: null,
      wind_risk_label: "insufficient_data",
    };
  }

  const headwinds = sortedCopy(rawHeadwinds);
  const crosswinds = sortedCopy(rawCrosswinds);
  const speeds = sortedCopy(rawSpeeds);

  const headwindProbability =
    headwinds.filter((h) => h >= headwind_threshold_ms).length /
    headwinds.length;

  const strongHeadwindProbability =
    headwinds.filter((h) => h >= strong_headwind_threshold_ms).length /
    headwinds.length;

  const medianHeadwind = percentile(headwinds, 50);
  const p80Headwind = percentile(headwinds, 80);
  const medianCrosswind = percentile(crosswinds, 50);
  const medianWindSpeed = percentile(speeds, 50);

  // Mirror the Python risk-labelling logic exactly
  let windRiskLabel: string;
  if (
    headwindProbability >= 0.6 &&
    p80Headwind >= strong_headwind_threshold_ms
  ) {
    windRiskLabel = "high_headwind_risk";
  } else if (headwindProbability >= 0.45) {
    windRiskLabel = "moderate_headwind_risk";
  } else if (medianCrosswind >= strong_headwind_threshold_ms) {
    windRiskLabel = "crosswind_exposed";
  } else {
    windRiskLabel = "low_wind_risk";
  }

  const r = (n: number) => Math.round(n * 1000) / 1000;

  return {
    ...section,
    sample_hours: rawHeadwinds.length,
    headwind_probability: r(headwindProbability),
    strong_headwind_probability: r(strongHeadwindProbability),
    median_headwind_ms: r(medianHeadwind),
    p80_headwind_ms: r(p80Headwind),
    median_crosswind_ms: r(medianCrosswind),
    median_wind_speed_ms: r(medianWindSpeed),
    wind_risk_label: windRiskLabel,
  };
}

// ── Full-route analysis ───────────────────────────────────────────────────────

/**
 * Analyse all sections in parallel.
 *
 * For a typical marathon (21 × 2 km sections, 1 year back) this fires
 * 21 concurrent Open-Meteo requests and completes in a few seconds.
 */
export async function analyseWindSections(
  sections: RouteSection[],
  settings: WindAnalysisSettings
): Promise<WindSectionResult[]> {
  return Promise.all(sections.map((s) => analyseSection(s, settings)));
}

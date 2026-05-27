/**
 * Formats wind analysis results as a CSV string.
 *
 * The output columns mirror the Python script's OUTPUT_CSV exactly so that
 * the existing race_pacing_model_fitness_goals.py can read the file without
 * modification.
 */

import type { WindSectionResult } from "./types";

const HEADERS = [
  "section_id",
  "start_distance_km",
  "end_distance_km",
  "start_lat",
  "start_lon",
  "end_lat",
  "end_lon",
  "mid_lat",
  "mid_lon",
  "bearing_deg",
  "sample_hours",
  "headwind_probability",
  "strong_headwind_probability",
  "median_headwind_ms",
  "p80_headwind_ms",
  "median_crosswind_ms",
  "median_wind_speed_ms",
  "wind_risk_label",
] as const;

function escapeCsv(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatWindCsv(results: WindSectionResult[]): string {
  const rows = results.map((r) =>
    HEADERS.map((h) => escapeCsv((r as Record<string, unknown>)[h])).join(",")
  );
  return [HEADERS.join(","), ...rows].join("\n");
}

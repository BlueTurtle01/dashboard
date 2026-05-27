// Types for the race wind analysis pipeline.
// This is a TypeScript port of WindAnalysis.py, using the Open-Meteo Archive
// API in place of the CDS/ERA5-Land download (same underlying ERA5 data, free
// REST API, no auth required).

export interface GpxPoint {
  lat: number;
  lon: number;
  ele: number;
}

export interface RouteSection {
  section_id: number;
  start_distance_km: number;
  end_distance_km: number;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  mid_lat: number;
  mid_lon: number;
  bearing_deg: number;
}

export interface WindAnalysisSettings {
  /** Race month (1-12). Used to centre the historical date window. */
  race_month: number;
  /** Race day (1-31). Used to centre the historical date window. */
  race_day: number;
  /** Split route into sections of this length in km. */
  section_km: number;
  /** Number of past years to analyse (each year contributes a date window). */
  years_back: number;
  /** Days either side of the race date to include per year. */
  window_days: number;
  /** Earliest race-time hour to include (UTC). */
  start_hour: number;
  /** Latest race-time hour to include (UTC). */
  end_hour: number;
  /** Headwind speed threshold for "headwind probability" calculation (m/s). */
  headwind_threshold_ms: number;
  /** Headwind speed threshold for "strong headwind probability" (m/s). */
  strong_headwind_threshold_ms: number;
}

export interface WindSectionResult extends RouteSection {
  sample_hours: number;
  headwind_probability: number | null;
  strong_headwind_probability: number | null;
  median_headwind_ms: number | null;
  p80_headwind_ms: number | null;
  median_crosswind_ms: number | null;
  median_wind_speed_ms: number | null;
  wind_risk_label: string;
}

export const DEFAULT_WIND_SETTINGS: WindAnalysisSettings = {
  race_month: 7,
  race_day: 1,
  section_km: 2,
  years_back: 1,
  window_days: 14,
  start_hour: 8,
  end_hour: 22,
  headwind_threshold_ms: 2.0,
  strong_headwind_threshold_ms: 5.0,
};

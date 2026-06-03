/**
 * Open-Meteo Historical Archive API client.
 *
 * Replaces the ERA5-Land CDS download from WindAnalysis.py.
 * Open-Meteo provides the same ERA5 reanalysis data as a free JSON REST API
 * with no authentication required.
 *
 * Docs: https://open-meteo.com/en/docs/historical-weather-api
 */

export interface OpenMeteoHourly {
  time: string[];
  wind_speed_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
}

export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  hourly: OpenMeteoHourly;
  error?: boolean;
  reason?: string;
}

export interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
}

export interface OpenMeteoDailyResponse {
  latitude: number;
  longitude: number;
  daily: OpenMeteoDaily;
  error?: boolean;
  reason?: string;
}

export interface WeatherDayRecord {
  year: number;
  date: string;
  temp_max_c: number | null;
  temp_min_c: number | null;
  precipitation_mm: number | null;
}

/**
 * Fetch ERA5 daily temperature and precipitation for a single location
 * across the last `years` occurrences of a specific calendar date (month/day).
 * Makes one API request covering the full date range, then filters to the
 * target month-day for each year.
 *
 * @param lat    Latitude
 * @param lon    Longitude
 * @param month  1-based month (e.g. 7 for July)
 * @param day    Day of month (e.g. 1)
 * @param years  Number of past years to return (default 10)
 */
export async function fetchHistoricalDailyWeather(
  lat: number,
  lon: number,
  month: number,
  day: number,
  years = 10
): Promise<WeatherDayRecord[]> {
  const now = new Date();
  // ERA5 data has a ~5-day lag; use last full year as the end year
  const endYear = now.getFullYear() - 1;
  const startYear = endYear - years + 1;

  const pad = (n: number) => String(n).padStart(2, "0");
  const startDate = `${startYear}-01-01`;
  const endDate   = `${endYear}-12-31`;

  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude",  lat.toFixed(6));
  url.searchParams.set("longitude", lon.toFixed(6));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date",   endDate);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Open-Meteo weather error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as OpenMeteoDailyResponse;
  if (json.error) throw new Error(`Open-Meteo: ${json.reason ?? "unknown error"}`);

  const { time, temperature_2m_max, temperature_2m_min, precipitation_sum } = json.daily;

  const suffix = `-${pad(month)}-${pad(day)}`;
  const records: WeatherDayRecord[] = [];

  for (let i = 0; i < time.length; i++) {
    if (!time[i].endsWith(suffix)) continue;
    records.push({
      year: parseInt(time[i].slice(0, 4), 10),
      date: time[i],
      temp_max_c:       temperature_2m_max[i]  ?? null,
      temp_min_c:       temperature_2m_min[i]  ?? null,
      precipitation_mm: precipitation_sum[i]   ?? null,
    });
  }

  return records.sort((a, b) => a.year - b.year);
}

/**
 * Fetch ERA5 hourly wind data for a single location and date range.
 *
 * @param lat        Latitude of the midpoint
 * @param lon        Longitude of the midpoint
 * @param startDate  "YYYY-MM-DD"
 * @param endDate    "YYYY-MM-DD"
 */
export async function fetchHistoricalWind(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<OpenMeteoResponse> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", lat.toFixed(6));
  url.searchParams.set("longitude", lon.toFixed(6));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "UTC");

  const res = await fetch(url.toString(), {
    // 30-second per-request timeout
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Open-Meteo API error ${res.status} for ${lat.toFixed(4)},${lon.toFixed(4)}: ${text}`
    );
  }

  const json = (await res.json()) as OpenMeteoResponse;

  if (json.error) {
    throw new Error(`Open-Meteo returned error: ${json.reason ?? "unknown"}`);
  }

  return json;
}

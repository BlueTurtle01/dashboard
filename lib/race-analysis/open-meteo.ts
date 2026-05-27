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

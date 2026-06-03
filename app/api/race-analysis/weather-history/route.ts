/**
 * POST /api/race-analysis/weather-history
 *
 * Returns ERA5 historical daily temperature and precipitation for a given
 * location and calendar date (month/day) across the last N years.
 *
 * Body: { lat, lon, month, day, years? }
 * Returns: { data: WeatherDayRecord[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { fetchHistoricalDailyWeather } from "@/lib/race-analysis/open-meteo";

export const maxDuration = 45;

export async function POST(req: NextRequest) {
  try {
    const roles = await getUserRoles();
    if (!roles.includes("admin")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = (await req.json()) as {
      lat?: number;
      lon?: number;
      month?: number;
      day?: number;
      years?: number;
    };

    const { lat, lon, month, day, years = 10 } = body;

    if (lat == null || lon == null || month == null || day == null) {
      return NextResponse.json(
        { error: "lat, lon, month, and day are required" },
        { status: 400 }
      );
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return NextResponse.json({ error: "Invalid month or day" }, { status: 400 });
    }

    const data = await fetchHistoricalDailyWeather(lat, lon, month, day, years);

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[weather-history]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

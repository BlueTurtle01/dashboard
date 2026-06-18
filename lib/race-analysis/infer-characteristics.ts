/**
 * Server-side race characteristics inference.
 *
 * Computes is_uk, hilliness, distance_band, climate, crowd_size, and
 * terrain_breakdown from derived data (GPX profile, OSM terrain, weather API,
 * entrant counts).  Only fills null fields — never overwrites manual values.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalDailyWeather } from "./open-meteo";
import type { TerrainSegment } from "./terrain-from-osm";

// ── Constants ─────────────────────────────────────────────────────────────────

const UK_LAT_MIN = 49.9, UK_LAT_MAX = 61.0;
const UK_LON_MIN = -8.2, UK_LON_MAX = 2.0;

const CROWD_SMALL_MAX  = 400;   // < 400  → Small (1)
const CROWD_MEDIUM_MAX = 2000;  // < 2000 → Medium (2), else Large (3)

const CLIMATE_COLD_MAX = 10;    // < 10°C → Cold (1)
const CLIMATE_MILD_MAX = 18;    // < 18°C → Mild (2)
const CLIMATE_WARM_MAX = 26;    // < 26°C → Warm (3), else Hot (4)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TerrainBreakdown {
  road:    number;  // 0–1 fraction
  trail:   number;
  mountain: number;
  coastal: number;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function inferIsUk(lat: number, lon: number): boolean {
  return lat >= UK_LAT_MIN && lat <= UK_LAT_MAX &&
         lon >= UK_LON_MIN && lon <= UK_LON_MAX;
}

function inferHilliness(totalAscentM: number, totalDistanceKm: number): 1 | 2 | 3 | 4 {
  const mPerKm = totalAscentM / totalDistanceKm;
  if (mPerKm <  5) return 1;
  if (mPerKm < 10) return 2;
  if (mPerKm < 20) return 3;
  return 4;
}

function inferDistanceBand(distanceKm: number): 1 | 2 | 3 | 4 {
  if (distanceKm <= 42.2) return 1;
  if (distanceKm <=  70)  return 2;
  if (distanceKm <= 120)  return 3;
  return 4;
}

function inferClimate(medianMaxTempC: number): 1 | 2 | 3 | 4 {
  if (medianMaxTempC < CLIMATE_COLD_MAX) return 1;
  if (medianMaxTempC < CLIMATE_MILD_MAX) return 2;
  if (medianMaxTempC < CLIMATE_WARM_MAX) return 3;
  return 4;
}

function inferCrowdSize(entrantCount: number): 1 | 2 | 3 {
  if (entrantCount <  CROWD_SMALL_MAX)  return 1;
  if (entrantCount <= CROWD_MEDIUM_MAX) return 2;
  return 3;
}

/**
 * Maps OSM cost-model terrain types to the four race-matcher categories.
 * cost-model types: "road" | "gravel" | "trail" | "technical_trail" | "sand"
 */
function segmentCategory(type: string): keyof Omit<TerrainBreakdown, "coastal"> {
  if (type === "road")            return "road";
  if (type === "technical_trail") return "mountain";
  return "trail"; // gravel, trail, sand → trail
}

function inferTerrainBreakdown(segments: TerrainSegment[]): TerrainBreakdown {
  const totalKm = segments.reduce((s, seg) => s + seg.distanceKm, 0);
  if (totalKm === 0) return { road: 0, trail: 1, mountain: 0, coastal: 0 };

  let road = 0, trail = 0, mountain = 0;
  for (const seg of segments) {
    const cat = segmentCategory(seg.type);
    if (cat === "road")     road     += seg.distanceKm;
    else if (cat === "mountain") mountain += seg.distanceKm;
    else                    trail    += seg.distanceKm;
  }

  const round = (n: number) => Math.round((n / totalKm) * 100) / 100;
  return { road: round(road), trail: round(trail), mountain: round(mountain), coastal: 0 };
}

/** Returns the dominant terrain category name for the legacy `terrain` column. */
function dominantTerrain(breakdown: TerrainBreakdown): "road" | "trail" | "mountain" | null {
  const { road, trail, mountain } = breakdown;
  const max = Math.max(road, trail, mountain);
  if (max === 0) return null;
  if (road     === max) return "road";
  if (mountain === max) return "mountain";
  return "trail";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Infer and save race characteristics from available derived data.
 *
 * Only writes fields that are currently null in the DB — existing manual
 * values are never overwritten.  Silently no-ops if nothing can be computed.
 */
export async function inferAndSaveCharacteristics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  raceId: string,
  coords: { lat: number; lon: number } | null,
  profile: { totalDistanceKm: number; totalAscentM: number } | null,
  /** Actual race date from races.race_end_date — NOT from GPX (GPX timestamps are unreliable). */
  raceDate: Date | null,
  terrainSegments: TerrainSegment[] | null,
  entrantCount: number | null,
): Promise<void> {
  // Fetch existing row so we can skip already-set fields
  const { data: existing } = await supabase
    .from("race_characteristics")
    .select("race_id, is_uk, hilliness, distance_band, climate, crowd_size, terrain, terrain_breakdown")
    .eq("race_id", raceId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { race_id: raceId };

  // is_uk — from start coords
  if (existing?.is_uk == null && coords) {
    updates.is_uk = inferIsUk(coords.lat, coords.lon);
  }

  // hilliness — from profile
  if (existing?.hilliness == null && profile && profile.totalDistanceKm > 0) {
    updates.hilliness = inferHilliness(profile.totalAscentM, profile.totalDistanceKm);
  }

  // distance_band — from profile
  if (existing?.distance_band == null && profile) {
    updates.distance_band = inferDistanceBand(profile.totalDistanceKm);
  }

  // climate — weather API (needs coords + race date)
  if (existing?.climate == null && coords && raceDate) {
    try {
      const records = await fetchHistoricalDailyWeather(
        coords.lat, coords.lon,
        raceDate.getMonth() + 1, raceDate.getDate(),
        10,
      );
      const temps = records.map((r) => r.temp_max_c).filter((t): t is number => t !== null);
      if (temps.length > 0) {
        const sorted = [...temps].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        updates.climate = inferClimate(median);
      }
    } catch (err) {
      console.warn(`[infer-char] Climate fetch failed for ${raceId}:`, err instanceof Error ? err.message : err);
    }
  }

  // crowd_size — from entrant count with absolute thresholds
  if (existing?.crowd_size == null && entrantCount !== null) {
    updates.crowd_size = inferCrowdSize(entrantCount);
  }

  // terrain_breakdown + terrain (dominant) — from OSM segments
  if (existing?.terrain_breakdown == null && terrainSegments && terrainSegments.length > 0) {
    const breakdown = inferTerrainBreakdown(terrainSegments);
    updates.terrain_breakdown = breakdown;
    // Only set the legacy terrain column if it's also unset
    if (existing?.terrain == null) {
      const dom = dominantTerrain(breakdown);
      if (dom) updates.terrain = dom;
    }
  }

  if (Object.keys(updates).length <= 1) return; // nothing to write

  const { error } = await supabase
    .from("race_characteristics")
    .upsert(updates, { onConflict: "race_id" });

  if (error) {
    console.error(`[infer-char] Upsert failed for ${raceId}:`, error.message);
  } else {
    const fields = Object.keys(updates).filter((k) => k !== "race_id");
    console.log(`[infer-char] Saved [${fields.join(", ")}] for race ${raceId}`);
  }
}

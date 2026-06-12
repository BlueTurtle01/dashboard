/**
 * OSM/Overpass terrain analysis — ported from the frontend's terrain pipeline.
 *
 * Queries Overpass API for OSM ways within the GPX bounding box, then classifies
 * each GPS point to the nearest OSM way within 100m.  Consecutive same-terrain
 * points are merged into variable-length segments stored in races_meta.terrain_segments.
 *
 * This is the canonical terrain analysis method used by both the Dashboard and
 * the frontend.  Both apps write/read races_meta.terrain_segments so athlete
 * experience pairings are derived from the same per-section data.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TerrainSegment {
  startKm:    number;
  endKm:      number;
  distanceKm: number;
  type:       string;
}

interface OsmNode { lat: number; lon: number }
interface OsmWay {
  tags: { highway?: string; surface?: string; natural?: string; landuse?: string };
  geometry: OsmNode[];
}

// ── Overpass mirrors ───────────────────────────────────────────────────────────

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// ── Overpass query ─────────────────────────────────────────────────────────────

function buildQuery(south: number, west: number, north: number, east: number): string {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:55];
(
  way[highway](${bbox});
  way[surface](${bbox});
  way["natural"="grassland"](${bbox});
  way["natural"="sand"](${bbox});
  way["natural"="beach"](${bbox});
  way["natural"="bare_rock"](${bbox});
  way["natural"="scree"](${bbox});
  way["natural"="heath"](${bbox});
  way["natural"="meadow"](${bbox});
  way["landuse"="grass"](${bbox});
  way["landuse"="meadow"](${bbox});
  way["landuse"="recreation_ground"](${bbox});
);
out geom;`;
}

async function tryFetch(url: string, query: string): Promise<OsmWay[]> {
  const res = await fetch(`${url}?data=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "CoachDashboard-TerrainAnalysis/1.0 (race training platform)",
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from ${url}${body ? ": " + body.slice(0, 200) : ""}`);
  }

  type OverpassElement = {
    type: string;
    tags?: Record<string, string>;
    geometry?: OsmNode[];
  };

  const data = (await res.json()) as { elements?: OverpassElement[] };
  if (!Array.isArray(data.elements)) {
    throw new Error(`Unexpected response from ${url}`);
  }

  return data.elements
    .filter(
      (el): el is OverpassElement & { geometry: OsmNode[]; tags: Record<string, string> } =>
        el.type === "way" &&
        Array.isArray(el.geometry) &&
        el.geometry.length >= 2 &&
        Boolean(el.tags)
    )
    .map((el) => ({
      tags: {
        highway: el.tags.highway,
        surface: el.tags.surface,
        natural: el.tags.natural,
        landuse: el.tags.landuse,
      },
      geometry: el.geometry,
    }));
}

async function fetchOsmWays(
  south: number, west: number, north: number, east: number
): Promise<OsmWay[] | null> {
  const query = buildQuery(south, west, north, east);

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const ways = await tryFetch(mirror, query);
      console.log(`[terrain-osm] mirror=${mirror} ways=${ways.length}`);
      return ways;
    } catch (err) {
      console.error(`[terrain-osm] ${mirror} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.error("[terrain-osm] All Overpass mirrors failed");
  return null;
}

// ── Tag classification ─────────────────────────────────────────────────────────

type OsmTerrainType = "road" | "gravel" | "trail" | "grass" | "rocky" | "sand" | "unknown";

function classifyTags(
  highway:  string | undefined,
  surface:  string | undefined,
  natural:  string | undefined,
  landuse:  string | undefined,
): OsmTerrainType {
  if (surface) {
    if (["asphalt","paved","concrete","concrete:plates","concrete:lanes","tarmac","paving_stones","asphalt;concrete"].includes(surface)) return "road";
    if (["sand","fine_gravel_sand"].includes(surface)) return "sand";
    if (["grass","lawn","turf"].includes(surface)) return "grass";
    if (["rock","stone","cobblestone","sett","pebblestone","rocky","bare_rock"].includes(surface)) return "rocky";
    if (["gravel","fine_gravel","compacted","crushed_limestone","pea_gravel","unpaved","chipseal"].includes(surface)) return "gravel";
    if (["dirt","ground","earth","mud","woodchips","bark","natural","clay"].includes(surface)) return "trail";
  }

  if (natural) {
    if (["sand","dune","beach"].includes(natural)) return "sand";
    if (["bare_rock","rock","scree","cliff","stone"].includes(natural)) return "rocky";
    if (["grassland","heath","meadow"].includes(natural)) return "grass";
    if (["wood","scrub","wetland"].includes(natural)) return "trail";
  }

  if (landuse) {
    if (["grass","meadow","recreation_ground","village_green"].includes(landuse)) return "grass";
  }

  if (highway) {
    if ([
      "motorway","trunk","primary","secondary","tertiary","residential",
      "living_street","service","motorway_link","trunk_link","primary_link",
      "secondary_link","tertiary_link",
    ].includes(highway)) return "road";
    if (["unclassified","road","track"].includes(highway)) return "gravel";
    if (["path","footway","bridleway","cycleway","steps"].includes(highway)) return "trail";
  }

  return "unknown";
}

// ── OSM type → cost model type ─────────────────────────────────────────────────

function toCostModelType(osmType: OsmTerrainType): string {
  switch (osmType) {
    case "road":    return "road";
    case "gravel":  return "gravel";
    case "trail":   return "trail";
    case "grass":   return "trail";
    case "rocky":   return "technical_trail";
    case "sand":    return "sand";
    case "unknown": return "trail";
  }
}

// ── Geometry helpers ───────────────────────────────────────────────────────────

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pointToSegmentM(
  plat: number, plon: number,
  alat: number, alon: number,
  blat: number, blon: number,
): number {
  const dLat = blat - alat;
  const dLon = blon - alon;
  const lenSq = dLat * dLat + dLon * dLon;
  if (lenSq === 0) return haversineM(plat, plon, alat, alon);
  const t = Math.max(0, Math.min(1, ((plat - alat) * dLat + (plon - alon) * dLon) / lenSq));
  return haversineM(plat, plon, alat + t * dLat, alon + t * dLon);
}

function findNearestWay(lat: number, lon: number, ways: OsmWay[]): OsmWay | null {
  let best: OsmWay | null = null;
  let bestDist = 100; // 100 m max

  for (const way of ways) {
    for (let i = 1; i < way.geometry.length; i++) {
      const dist = pointToSegmentM(
        lat, lon,
        way.geometry[i - 1].lat, way.geometry[i - 1].lon,
        way.geometry[i].lat,     way.geometry[i].lon,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = way;
      }
    }
  }

  return best;
}

// ── Segment builder ────────────────────────────────────────────────────────────

function buildSegments(
  points: { lat: number; lon: number }[],
  ways: OsmWay[]
): TerrainSegment[] {
  if (points.length < 2) return [];

  const segments: TerrainSegment[] = [];
  let cursorKm = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const distKm = haversineM(prev.lat, prev.lon, curr.lat, curr.lon) / 1000;
    const midLat = (prev.lat + curr.lat) / 2;
    const midLon = (prev.lon + curr.lon) / 2;

    const nearest = findNearestWay(midLat, midLon, ways);
    const osmType = nearest
      ? classifyTags(nearest.tags.highway, nearest.tags.surface, nearest.tags.natural, nearest.tags.landuse)
      : "unknown";
    const type = toCostModelType(osmType);

    const prior = segments[segments.length - 1];
    if (prior && prior.type === type) {
      prior.endKm      = Math.round((cursorKm + distKm) * 100) / 100;
      prior.distanceKm = Math.round((prior.distanceKm + distKm) * 100) / 100;
    } else {
      segments.push({
        startKm:    Math.round(cursorKm * 100) / 100,
        endKm:      Math.round((cursorKm + distKm) * 100) / 100,
        distanceKm: Math.round(distKm * 100) / 100,
        type,
      });
    }

    cursorKm += distKm;
  }

  return segments.filter((s) => s.distanceKm > 0);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Runs Overpass terrain analysis on a GPX route.
 * Returns per-section terrain segments using cost model types, or null on failure.
 *
 * Null means "Overpass unavailable" — callers should fall back to terrain_type.
 */
export async function analyzeTerrainFromGpx(
  points: { lat: number; lon: number }[]
): Promise<TerrainSegment[] | null> {
  if (points.length < 2) return null;

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const south = Math.min(...lats) - 0.002;
  const north = Math.max(...lats) + 0.002;
  const west  = Math.min(...lons) - 0.002;
  const east  = Math.max(...lons) + 0.002;

  const ways = await fetchOsmWays(south, west, north, east);
  if (!ways) return null;
  if (ways.length === 0) {
    console.warn("[terrain-osm] Overpass returned 0 ways — possible coverage gap");
    return null;
  }

  return buildSegments(points, ways);
}

/**
 * Builds a per-km terrain lookup function from stored terrain segments.
 * Falls back to `fallback` for any km not covered by a segment.
 */
export function buildTerrainLookup(
  segments: TerrainSegment[],
  fallback: string
): (midKm: number) => string {
  return (km) =>
    segments.find((s) => s.startKm <= km && km < s.endKm)?.type ?? fallback;
}

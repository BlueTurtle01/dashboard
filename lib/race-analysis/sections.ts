/**
 * Route section builder.
 *
 * Direct TypeScript port of build_sections_from_gpx() from WindAnalysis.py.
 * Splits a list of GPX points into fixed-distance sections, computing
 * bearing and midpoint for each.
 */

import type { GpxPoint, RouteSection } from "./types";

// ── Geometry helpers ──────────────────────────────────────────────────────────

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371.0088;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
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

function interpolatePoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  fraction: number
): [number, number] {
  return [lat1 + (lat2 - lat1) * fraction, lon1 + (lon2 - lon1) * fraction];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ── Section builder ───────────────────────────────────────────────────────────

export function buildSections(
  points: GpxPoint[],
  sectionKm: number
): RouteSection[] {
  const sections: RouteSection[] = [];
  let sectionId = 1;
  let totalDistance = 0;

  // Current section start (mutable as we advance through the route)
  let csLat = points[0].lat;
  let csLon = points[0].lon;

  let currentDistance = 0;
  let lastLat = points[0].lat;
  let lastLon = points[0].lon;

  for (let i = 1; i < points.length; i++) {
    const { lat: lat2, lon: lon2 } = points[i];
    let lat1 = lastLat;
    let lon1 = lastLon;
    let segDist = haversineKm(lat1, lon1, lat2, lon2);

    // Consume as many full sectionKm chunks as this segment provides
    while (currentDistance + segDist >= sectionKm) {
      const remaining = sectionKm - currentDistance;
      const fraction = segDist > 0 ? remaining / segDist : 0;
      const [endLat, endLon] = interpolatePoint(lat1, lon1, lat2, lon2, fraction);

      sections.push({
        section_id: sectionId++,
        start_distance_km: round3(totalDistance),
        end_distance_km: round3(totalDistance + sectionKm),
        start_lat: csLat,
        start_lon: csLon,
        end_lat: endLat,
        end_lon: endLon,
        mid_lat: (csLat + endLat) / 2,
        mid_lon: (csLon + endLon) / 2,
        bearing_deg: bearingDeg(csLat, csLon, endLat, endLon),
      });

      totalDistance += sectionKm;
      csLat = endLat;
      csLon = endLon;

      // Recalculate remaining segment from the new split point
      lat1 = endLat;
      lon1 = endLon;
      segDist = haversineKm(lat1, lon1, lat2, lon2);
      currentDistance = 0;
    }

    currentDistance += segDist;
    lastLat = lat2;
    lastLon = lon2;
  }

  // Final partial section (keep if it is more than 200 m)
  if (currentDistance > 0.2) {
    const { lat: endLat, lon: endLon } = points[points.length - 1];
    sections.push({
      section_id: sectionId,
      start_distance_km: round3(totalDistance),
      end_distance_km: round3(totalDistance + currentDistance),
      start_lat: csLat,
      start_lon: csLon,
      end_lat: endLat,
      end_lon: endLon,
      mid_lat: (csLat + endLat) / 2,
      mid_lon: (csLon + endLon) / 2,
      bearing_deg: bearingDeg(csLat, csLon, endLat, endLon),
    });
  }

  return sections;
}

/**
 * Minimal GPX parser — no third-party dependencies.
 *
 * Handles both track points (<trkpt>) and route points (<rtept>), which
 * covers all common GPX export formats.
 */

import type { GpxPoint } from "./types";

export function parseGpxPoints(gpxText: string): GpxPoint[] {
  const points: GpxPoint[] = [];

  // Match <trkpt> and <rtept> elements (both are common in GPX exports)
  // Handles attribute order variations and optional whitespace
  const ptRegex =
    /<(?:trkpt|rtept)\b([^>]+)>([\s\S]*?)<\/(?:trkpt|rtept)>/g;

  let match: RegExpExecArray | null;

  while ((match = ptRegex.exec(gpxText)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    const latMatch = /\blat="([^"]+)"/.exec(attrs);
    const lonMatch = /\blon="([^"]+)"/.exec(attrs);
    if (!latMatch || !lonMatch) continue;

    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);
    if (isNaN(lat) || isNaN(lon)) continue;

    const eleMatch = /<ele>([\d.+-]+)<\/ele>/.exec(inner);
    const ele = eleMatch ? parseFloat(eleMatch[1]) : 0;

    points.push({ lat, lon, ele: isNaN(ele) ? 0 : ele });
  }

  if (points.length < 2) {
    throw new Error(
      `GPX file contains too few track points (found ${points.length}). ` +
        "Make sure the file contains a <trk> or <rte> element."
    );
  }

  return points;
}

/**
 * GET /api/race-readiness/elevation-profile-match
 * ?race_id=<goal_race_id>&key=<athlete_key>
 *
 * Compares the goal race's cumulative-ascent curve against every past race
 * in the athlete's history that has elevation data, and returns the closest
 * profile match (full or partial).
 *
 * Algorithm:
 *   1. Compute a 10-point normalized cumulative-ascent curve for the goal race
 *      (each point = fraction of total ascent accumulated at 10%, 20%, … 100%
 *      of total distance).
 *   2. Repeat for every athlete past race that has an elevation_profile in
 *      races_meta.
 *   3. Score each past race using MAE between the two normalized curves.
 *   4. Flag the best-scoring race as the reference point.
 *      Also note when a past race is much shorter (it covers only a portion of
 *      the goal course length) so the UI can say "the first ~Xkm of this race".
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Types ──────────────────────────────────────────────────────────────────────

interface ElevPoint { distanceKm: number; elevationM: number; }

export type LoadingLabel = "front" | "even" | "back";

export interface ElevProfileMatch {
  race_name: string;
  year: number;
  race_km: number;
  loading_label: LoadingLabel;
  halfway_pct: number;
  /** 0–100, where 100 = identical curves */
  similarity_pct: number;
  /**
   * When the past race is notably shorter than the goal race this describes
   * which portion of the goal the past race covers.
   * e.g. "the first 42 km (first half)" or null when roughly same length.
   */
  partial_desc: string | null;
  /** Total ascent of the matched past race in metres */
  total_ascent_m: number;
}

export interface ElevProfileMatchResult {
  goal_loading_label: LoadingLabel | null;
  goal_halfway_pct: number | null;
  best_match: ElevProfileMatch | null;
  /**
   * 20-point normalized cumulative-ascent curve for the best match race.
   * Values are 0–1 representing fraction of total ascent at 5%, 10%, …, 100%
   * of course distance. Null when there is no match or no elevation data.
   */
  match_curve: number[] | null;
  races_compared: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseElevPoints(value: unknown): { points: ElevPoint[]; totalKm: number } | null {
  if (typeof value !== "string") return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(p.points) || typeof p.totalDistanceKm !== "number") return null;
    const points: ElevPoint[] = [];
    for (const pt of p.points as unknown[]) {
      if (!pt || typeof pt !== "object") continue;
      const r = pt as Record<string, unknown>;
      if (typeof r.distanceKm !== "number" || typeof r.elevationM !== "number") continue;
      points.push({ distanceKm: r.distanceKm, elevationM: r.elevationM });
    }
    if (points.length < 5) return null;
    return { points, totalKm: p.totalDistanceKm };
  } catch {
    return null;
  }
}

/**
 * Compute an N-point normalized cumulative-ascent curve (default N=20) plus
 * the race's total ascent in metres. Returns null when there is insufficient
 * ascent data (< 20m total).
 */
function computeElevData(points: ElevPoint[], totalKm: number, N = 20):
  { curve: number[]; totalAscent: number } | null {
  if (totalKm <= 0 || points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.distanceKm - b.distanceKm);

  const cumAscent: number[] = new Array(sorted.length).fill(0);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].elevationM - sorted[i - 1].elevationM;
    cumAscent[i] = cumAscent[i - 1] + (diff > 0 ? diff : 0);
  }
  const totalAscent = cumAscent[cumAscent.length - 1];
  if (totalAscent < 20) return null;

  const curve: number[] = [];
  for (let step = 1; step <= N; step++) {
    const targetKm = (step / N) * totalKm;
    let idx = sorted.length - 1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].distanceKm > targetKm) { idx = Math.max(0, i - 1); break; }
    }
    curve.push(cumAscent[idx] / totalAscent);
  }
  return { curve, totalAscent };
}

function halfwayPct(curve: number[]): number {
  // With N=20, index 9 = step 10 = 50% of distance
  const midIdx = Math.floor(curve.length / 2) - 1;
  return Math.round((curve[midIdx] ?? 0) * 100);
}

function loadingLabel(hwPct: number): LoadingLabel {
  if (hwPct > 55) return "front";
  if (hwPct < 45) return "back";
  return "even";
}

/**
 * Mean Absolute Error between two normalized curves.
 * Both must have length N.
 */
function curveMAE(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Convert MAE (0–1) to a 0–100 similarity percentage.
 * MAE of 0 → 100%, MAE of 0.5 → 0% (clamped at 0).
 */
function maeToPct(mae: number): number {
  return Math.max(0, Math.round((1 - mae * 2) * 100));
}

/**
 * Build a human-readable description of how much of the goal race a shorter
 * past race covers, e.g. "the first 42 km (first half)".
 */
function partialDesc(pastKm: number, goalKm: number): string | null {
  if (goalKm <= 0) return null;
  const ratio = pastKm / goalKm;
  if (ratio >= 0.85) return null; // close enough in length — not worth flagging
  const fraction = ratio < 0.35 ? "first third" : ratio < 0.6 ? "first half" : "first two-thirds";
  return `the first ~${Math.round(pastKm)} km (${fraction})`;
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetRaceId = req.nextUrl.searchParams.get("race_id")?.trim() ?? "";
  const athleteKey   = req.nextUrl.searchParams.get("key")?.trim()     ?? "";
  if (!targetRaceId || !athleteKey) {
    return NextResponse.json({ error: "race_id and key required" }, { status: 400 });
  }

  const supabase = await createClient();
  const empty: ElevProfileMatchResult = {
    goal_loading_label: null, goal_halfway_pct: null,
    best_match: null, match_curve: null, races_compared: 0,
  };

  // ── 1. Goal race elevation profile ────────────────────────────────────────
  const { data: goalMeta } = await supabase
    .from("races_meta")
    .select("meta_value")
    .eq("race_id", targetRaceId)
    .eq("meta_key", "elevation_profile")
    .maybeSingle();

  const goalParsed = parseElevPoints(goalMeta?.meta_value);
  if (!goalParsed) return NextResponse.json(empty);

  const goalElevData = computeElevData(goalParsed.points, goalParsed.totalKm);
  if (!goalElevData) return NextResponse.json(empty);

  const goalCurve = goalElevData.curve;
  const goalTotalAscent = goalElevData.totalAscent;
  const goalDensity = goalTotalAscent / goalParsed.totalKm; // m/km

  const goalHwPct = halfwayPct(goalCurve);
  const goalLabel = loadingLabel(goalHwPct);

  // ── 2. Athlete's finished races ────────────────────────────────────────────
  const { data: athleteResults } = await supabase
    .from("race_results")
    .select("race_id, result_year")
    .eq("full_name", athleteKey)
    .in("result_status", ["FINISHED", "UNKNOWN"])
    .neq("race_id", targetRaceId); // exclude the goal race itself

  const finishedRows = (athleteResults ?? []) as { race_id: string; result_year: number }[];
  if (finishedRows.length === 0) return NextResponse.json({ ...empty, goal_loading_label: goalLabel, goal_halfway_pct: goalHwPct, match_curve: null });

  // De-duplicate: keep most recent year per race
  const bestYearByRace: Record<string, number> = {};
  for (const r of finishedRows) {
    if (!bestYearByRace[r.race_id] || r.result_year > bestYearByRace[r.race_id]) {
      bestYearByRace[r.race_id] = r.result_year;
    }
  }
  const uniqueRaceIds = Object.keys(bestYearByRace);

  // ── 3. Race names ──────────────────────────────────────────────────────────
  const { data: raceNameRows } = await supabase
    .from("races")
    .select("id, name")
    .in("id", uniqueRaceIds);
  const nameMap: Record<string, string> = {};
  for (const r of raceNameRows ?? []) nameMap[r.id as string] = r.name as string;

  // ── 4. Elevation profiles for athlete's past races (batch) ─────────────────
  const { data: metaRows } = await supabase
    .from("races_meta")
    .select("race_id, meta_value")
    .in("race_id", uniqueRaceIds)
    .eq("meta_key", "elevation_profile");

  // ── 5. Compute similarity for each past race ───────────────────────────────
  let bestMatch: ElevProfileMatch | null = null;
  let bestMatchCurve: number[] | null = null;
  let bestMAE = 1;
  let racesCompared = 0;

  for (const row of metaRows ?? []) {
    const raceId  = row.race_id as string;
    const parsed  = parseElevPoints(row.meta_value);
    if (!parsed) continue;

    const elevData = computeElevData(parsed.points, parsed.totalKm);
    if (!elevData) continue;

    const { curve, totalAscent: compTotalAscent } = elevData;

    racesCompared++;

    // Shape similarity (pure distribution match)
    const mae      = curveMAE(goalCurve, curve);
    const shapeSim = 1 - mae * 2; // 0–1

    // Climbing-density penalty: penalises races with very different m/km
    const compDensity   = compTotalAscent / parsed.totalKm;
    const densityRatio  = Math.min(goalDensity, compDensity) / Math.max(goalDensity, compDensity);
    const adjustedSim   = shapeSim * Math.sqrt(densityRatio);
    const adjustedMAE   = (1 - adjustedSim) / 2;

    const simPct   = Math.max(0, Math.round(adjustedSim * 100));
    const hwPct    = halfwayPct(curve);
    const label    = loadingLabel(hwPct);
    const partial  = partialDesc(parsed.totalKm, goalParsed.totalKm);
    const raceName = nameMap[raceId] ?? "Unknown race";
    const year     = bestYearByRace[raceId] ?? 0;

    if (adjustedMAE < bestMAE) {
      bestMAE = adjustedMAE;
      bestMatchCurve = curve;
      bestMatch = {
        race_name:       raceName,
        year,
        race_km:         Math.round(parsed.totalKm * 10) / 10,
        loading_label:   label,
        halfway_pct:     hwPct,
        similarity_pct:  simPct,
        partial_desc:    partial,
        total_ascent_m:  Math.round(compTotalAscent),
      };
    }
  }

  // Only surface a match if similarity is meaningful (adjusted MAE < 0.20)
  const surfacedMatch = bestMAE < 0.20 ? bestMatch : null;

  return NextResponse.json({
    goal_loading_label: goalLabel,
    goal_halfway_pct:   goalHwPct,
    best_match:         surfacedMatch,
    match_curve:        surfacedMatch ? bestMatchCurve : null,
    races_compared:     racesCompared,
  } satisfies ElevProfileMatchResult);
}

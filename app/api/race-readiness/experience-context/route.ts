/**
 * GET /api/race-readiness/experience-context
 * ?key=<athlete_key>&race_id=<target_race_id>
 *
 * Computes four relatable comparison insights between the goal race and
 * the athlete's career race history:
 *
 *   scale         — distance / ascent / difficulty ratios vs athlete's max
 *   time_estimate — projected finish time based on athlete pace history
 *   biggest_climb — goal race's biggest sustained climb vs athlete's personal best
 *   opening_match — which past race the opening 20% of the goal race most resembles
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRoles } from "@/lib/auth/core";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Shared section type ──────────────────────────────────────────────────────
interface Sec {
  section_type: string;
  terrain: string;
  distance_km: number;
  ascent_m: number;
  descent_m: number;
  start_km: number;
  end_km: number;
}

// ── Response types ───────────────────────────────────────────────────────────
export interface ExpContextScale {
  goal_distance_km: number;
  goal_ascent_m: number;
  goal_flat_equiv_km: number;
  athlete_max_dist:       { km: number; race_name: string; year: number } | null;
  athlete_max_ascent:     { m: number;  race_name: string; year: number } | null;
  athlete_max_flat_equiv: { km: number; race_name: string; year: number } | null;
  distance_ratio: number;
  ascent_ratio: number;
  flat_equiv_ratio: number;
}

export interface ExpContextTimeEstimate {
  estimated_min_hours: number;
  estimated_max_hours: number;
  basis_race_name: string;
  basis_finish_hours: number;
  athlete_longest_hours: number;
  athlete_longest_race_name: string;
}

export interface ExpContextBiggestClimb {
  goal: { km: number; ascent_m: number; avg_grad: number; start_km: number; end_km: number };
  athlete_best: { km: number; ascent_m: number; race_name: string; year: number } | null;
  ratio: number | null;
}

export interface ExpContextBiggestDescent {
  goal: { km: number; descent_m: number; avg_grad: number; start_km: number; end_km: number };
  athlete_best: { km: number; descent_m: number; race_name: string; year: number } | null;
  ratio: number | null;
}

export interface ExpContextOpeningMatch {
  goal_opening_km: number;
  goal_dominant_type: string;
  goal_dominant_terrain: string;
  goal_climb_pct: number;
  matched_race_name: string | null;
  matched_race_year: number | null;
  similarity: number;
}

export interface ExperienceContextResult {
  scale: ExpContextScale | null;
  time_estimate: ExpContextTimeEstimate | null;
  biggest_climb: ExpContextBiggestClimb | null;
  biggest_descent: ExpContextBiggestDescent | null;
  opening_match: ExpContextOpeningMatch | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSections(json: unknown): Sec[] {
  if (!Array.isArray(json)) return [];
  const out: Sec[] = [];
  for (const s of json) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    if (
      typeof r.section_type   !== "string" ||
      typeof r.terrain        !== "string" ||
      typeof r.distance_km    !== "number" ||
      typeof r.ascent_m       !== "number"
    ) continue;
    out.push({
      section_type: r.section_type,
      terrain:      r.terrain,
      distance_km:  r.distance_km,
      ascent_m:     r.ascent_m,
      descent_m:    typeof r.descent_m === "number" ? r.descent_m : 0,
      start_km:     typeof r.start_distance_km === "number" ? r.start_distance_km : 0,
      end_km:       typeof r.end_distance_km   === "number" ? r.end_distance_km   : 0,
    });
  }
  return out;
}

/** Merge consecutive climb sections into sustained segments, return the biggest by ascent. */
function biggestClimb(sections: Sec[]): { km: number; ascent_m: number; avg_grad: number; start_km: number; end_km: number } | null {
  if (sections.length === 0) return null;

  type Seg = { km: number; ascent_m: number; start_km: number; end_km: number };
  const segments: Seg[] = [];
  let cur: Seg | null = null;

  for (const s of sections) {
    if (s.section_type.includes("climb")) {
      if (cur) {
        cur.km       += s.distance_km;
        cur.ascent_m += s.ascent_m;
        cur.end_km    = s.end_km;
      } else {
        cur = { km: s.distance_km, ascent_m: s.ascent_m, start_km: s.start_km, end_km: s.end_km };
      }
    } else {
      if (cur) { segments.push(cur); cur = null; }
    }
  }
  if (cur) segments.push(cur);
  if (segments.length === 0) return null;

  const best = segments.reduce((a, b) => b.ascent_m > a.ascent_m ? b : a);
  return {
    ...best,
    avg_grad: best.km > 0 ? Math.round((best.ascent_m / (best.km * 1000)) * 100 * 10) / 10 : 0,
  };
}

/** Merge consecutive descent sections into sustained segments, return the biggest by descent_m. */
function biggestDescent(sections: Sec[]): { km: number; descent_m: number; avg_grad: number; start_km: number; end_km: number } | null {
  if (sections.length === 0) return null;

  type Seg = { km: number; descent_m: number; start_km: number; end_km: number };
  const segments: Seg[] = [];
  let cur: Seg | null = null;

  for (const s of sections) {
    if (s.section_type.includes("descent")) {
      if (cur) {
        cur.km        += s.distance_km;
        cur.descent_m += s.descent_m;
        cur.end_km     = s.end_km;
      } else {
        cur = { km: s.distance_km, descent_m: s.descent_m, start_km: s.start_km, end_km: s.end_km };
      }
    } else {
      if (cur) { segments.push(cur); cur = null; }
    }
  }
  if (cur) segments.push(cur);
  if (segments.length === 0) return null;

  const best = segments.reduce((a, b) => b.descent_m > a.descent_m ? b : a);
  return {
    ...best,
    avg_grad: best.km > 0 ? Math.round((best.descent_m / (best.km * 1000)) * 100 * 10) / 10 : 0,
  };
}

/** Characterise the first `openingFraction` of a race by its section mix. */
function characteriseOpening(sections: Sec[], totalKm: number, openingFraction = 0.20) {
  const cutKm = totalKm * openingFraction;
  let km = 0;
  const opening: Sec[] = [];
  for (const s of sections) {
    if (km >= cutKm) break;
    const take = Math.min(s.distance_km, cutKm - km);
    opening.push({ ...s, distance_km: take });
    km += take;
  }

  const totalOpenKm  = opening.reduce((s, x) => s + x.distance_km, 0);
  if (totalOpenKm < 0.5) return null;

  const climbKm   = opening.filter(s => s.section_type.includes("climb"))  .reduce((s, x) => s + x.distance_km, 0);
  const descentKm = opening.filter(s => s.section_type.includes("descent")).reduce((s, x) => s + x.distance_km, 0);

  const typeKm: Record<string, number> = {};
  const terrainKm: Record<string, number> = {};
  for (const s of opening) {
    typeKm[s.section_type] = (typeKm[s.section_type] ?? 0) + s.distance_km;
    terrainKm[s.terrain]   = (terrainKm[s.terrain]   ?? 0) + s.distance_km;
  }
  const dominantType    = Object.entries(typeKm)   .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "flat_rolling";
  const dominantTerrain = Object.entries(terrainKm) .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "trail";

  return {
    km: totalOpenKm,
    climbPct:   climbKm   / totalOpenKm,
    descentPct: descentKm / totalOpenKm,
    dominantType,
    dominantTerrain,
  };
}

function openingSimilarity(
  goal: NonNullable<ReturnType<typeof characteriseOpening>>,
  cand: NonNullable<ReturnType<typeof characteriseOpening>>,
): number {
  const climbClose   = 1 - Math.min(1, Math.abs(goal.climbPct   - cand.climbPct));
  const descentClose = 1 - Math.min(1, Math.abs(goal.descentPct - cand.descentPct));
  const typeSim      = goal.dominantType    === cand.dominantType    ? 1 : 0.3;
  const terrainSim   = goal.dominantTerrain === cand.dominantTerrain ? 1 : 0.5;
  return climbClose * 0.35 + descentClose * 0.35 + typeSim * 0.20 + terrainSim * 0.10;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const roles = await getUserRoles();
  if (!roles.includes("admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const athleteKey   = req.nextUrl.searchParams.get("key")?.trim()     ?? "";
  const targetRaceId = req.nextUrl.searchParams.get("race_id")?.trim() ?? "";
  if (!athleteKey || !targetRaceId) {
    return NextResponse.json({ error: "key and race_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  // ── 1. Target race profile ───────────────────────────────────────────────
  const { data: targetProf } = await supabase
    .from("race_profiles")
    .select("total_distance_km, total_ascent_m, flat_equivalent_km, sections_json")
    .eq("race_id", targetRaceId)
    .maybeSingle();

  if (!targetProf) {
    return NextResponse.json({ scale: null, time_estimate: null, biggest_climb: null, opening_match: null } satisfies ExperienceContextResult);
  }

  const goalDistKm     = targetProf.total_distance_km    as number ?? 0;
  const goalAscentM    = targetProf.total_ascent_m       as number ?? 0;
  const goalFlatEquiv  = targetProf.flat_equivalent_km   as number ?? 0;
  const goalSections   = parseSections(targetProf.sections_json);

  // ── 2. Athlete finished races ────────────────────────────────────────────
  const { data: athleteResults } = await supabase
    .from("race_results")
    .select("race_id, result_year, finish_seconds")
    .eq("full_name", athleteKey)
    .in("result_status", ["FINISHED", "UNKNOWN"])
    .not("finish_seconds", "is", null);

  const finishedRows = (athleteResults ?? []) as { race_id: string; result_year: number; finish_seconds: number }[];

  // ── 3. Race names for athlete's races ────────────────────────────────────
  const uniqueRaceIds = [...new Set(finishedRows.map(r => r.race_id))];
  const { data: raceNameRows } = await supabase
    .from("races")
    .select("id, name")
    .in("id", uniqueRaceIds);
  const nameMap: Record<string, string> = {};
  for (const r of raceNameRows ?? []) nameMap[r.id as string] = r.name as string;

  // ── 4. Athlete race profiles (sections + totals) ─────────────────────────
  const { data: athProfiles } = await supabase
    .from("race_profiles")
    .select("race_id, total_distance_km, total_ascent_m, flat_equivalent_km, sections_json")
    .in("race_id", uniqueRaceIds);

  type AthRaceInfo = {
    race_id: string; race_name: string; year: number; finish_seconds: number;
    total_distance_km: number; total_ascent_m: number; flat_equivalent_km: number;
    sections: Sec[];
  };

  const athRaceMap: Record<string, { dist: number; ascent: number; flatEq: number; sections: Sec[] }> = {};
  for (const rp of athProfiles ?? []) {
    athRaceMap[rp.race_id as string] = {
      dist:     rp.total_distance_km  as number ?? 0,
      ascent:   rp.total_ascent_m     as number ?? 0,
      flatEq:   rp.flat_equivalent_km as number ?? 0,
      sections: parseSections(rp.sections_json),
    };
  }

  const athRaces: AthRaceInfo[] = finishedRows
    .map(r => {
      const prof = athRaceMap[r.race_id];
      if (!prof) return null;
      return {
        race_id: r.race_id, race_name: nameMap[r.race_id] ?? "Unknown race",
        year: r.result_year, finish_seconds: r.finish_seconds,
        total_distance_km: prof.dist, total_ascent_m: prof.ascent,
        flat_equivalent_km: prof.flatEq, sections: prof.sections,
      };
    })
    .filter((x): x is AthRaceInfo => x !== null);

  const empty: ExperienceContextResult = { scale: null, time_estimate: null, biggest_climb: null, opening_match: null };
  if (athRaces.length === 0) return NextResponse.json(empty);

  // ── 5. Scale insight ─────────────────────────────────────────────────────
  const maxDistRace    = athRaces.reduce((a, b) => b.total_distance_km  > a.total_distance_km  ? b : a);
  const maxAscentRace  = athRaces.reduce((a, b) => b.total_ascent_m     > a.total_ascent_m     ? b : a);
  const maxFlatEqRace  = athRaces.reduce((a, b) => b.flat_equivalent_km > a.flat_equivalent_km ? b : a);

  const scale: ExpContextScale = {
    goal_distance_km:    Math.round(goalDistKm  * 10) / 10,
    goal_ascent_m:       Math.round(goalAscentM),
    goal_flat_equiv_km:  Math.round(goalFlatEquiv * 10) / 10,
    athlete_max_dist:       maxDistRace.total_distance_km  > 0 ? { km: Math.round(maxDistRace.total_distance_km   * 10) / 10, race_name: maxDistRace.race_name,   year: maxDistRace.year   } : null,
    athlete_max_ascent:     maxAscentRace.total_ascent_m   > 0 ? { m:  Math.round(maxAscentRace.total_ascent_m),              race_name: maxAscentRace.race_name, year: maxAscentRace.year } : null,
    athlete_max_flat_equiv: maxFlatEqRace.flat_equivalent_km > 0 ? { km: Math.round(maxFlatEqRace.flat_equivalent_km * 10) / 10, race_name: maxFlatEqRace.race_name, year: maxFlatEqRace.year } : null,
    distance_ratio:    maxDistRace.total_distance_km   > 0 ? Math.round((goalDistKm    / maxDistRace.total_distance_km)   * 10) / 10 : 0,
    ascent_ratio:      maxAscentRace.total_ascent_m    > 0 ? Math.round((goalAscentM   / maxAscentRace.total_ascent_m)    * 10) / 10 : 0,
    flat_equiv_ratio:  maxFlatEqRace.flat_equivalent_km > 0 ? Math.round((goalFlatEquiv / maxFlatEqRace.flat_equivalent_km) * 10) / 10 : 0,
  };

  // ── 6. Time estimate ─────────────────────────────────────────────────────
  let time_estimate: ExpContextTimeEstimate | null = null;
  const pacedRaces = athRaces.filter(r => r.finish_seconds > 0 && r.flat_equivalent_km > 0);
  if (pacedRaces.length > 0 && goalFlatEquiv > 0) {
    const paces = pacedRaces.map(r => r.finish_seconds / r.flat_equivalent_km);
    const avgPace = paces.reduce((a, b) => a + b, 0) / paces.length;
    const estimatedSec = avgPace * goalFlatEquiv;

    const longestRace = pacedRaces.reduce((a, b) => b.finish_seconds > a.finish_seconds ? b : a);
    // Use the race most similar in flat_equiv for basis text
    const basisRace = pacedRaces.reduce((a, b) =>
      Math.abs(b.flat_equivalent_km - goalFlatEquiv) < Math.abs(a.flat_equivalent_km - goalFlatEquiv) ? b : a
    );

    time_estimate = {
      estimated_min_hours:      Math.round((estimatedSec / 3600) * 10) / 10,
      estimated_max_hours:      Math.round((estimatedSec * 1.25 / 3600) * 10) / 10,
      basis_race_name:          basisRace.race_name,
      basis_finish_hours:       Math.round((basisRace.finish_seconds / 3600) * 10) / 10,
      athlete_longest_hours:    Math.round((longestRace.finish_seconds / 3600) * 10) / 10,
      athlete_longest_race_name: longestRace.race_name,
    };
  }

  // ── 7. Biggest climb ─────────────────────────────────────────────────────
  let biggest_climb: ExpContextBiggestClimb | null = null;
  if (goalSections.length > 0) {
    const goalClimb = biggestClimb(goalSections);
    if (goalClimb) {
      let athleteBestClimb: { km: number; ascent_m: number; race_name: string; year: number } | null = null;
      for (const ar of athRaces) {
        const c = biggestClimb(ar.sections);
        if (c && (!athleteBestClimb || c.ascent_m > athleteBestClimb.ascent_m)) {
          athleteBestClimb = { km: Math.round(c.km * 10) / 10, ascent_m: Math.round(c.ascent_m), race_name: ar.race_name, year: ar.year };
        }
      }
      biggest_climb = {
        goal: { km: Math.round(goalClimb.km * 10) / 10, ascent_m: Math.round(goalClimb.ascent_m), avg_grad: goalClimb.avg_grad, start_km: Math.round(goalClimb.start_km * 10) / 10, end_km: Math.round(goalClimb.end_km * 10) / 10 },
        athlete_best: athleteBestClimb,
        ratio: athleteBestClimb && athleteBestClimb.ascent_m > 0
          ? Math.round((goalClimb.ascent_m / athleteBestClimb.ascent_m) * 10) / 10
          : null,
      };
    }
  }

  // ── 8. Biggest descent ───────────────────────────────────────────────────
  let biggest_descent: ExpContextBiggestDescent | null = null;
  if (goalSections.length > 0) {
    const goalDesc = biggestDescent(goalSections);
    if (goalDesc) {
      let athleteBestDesc: { km: number; descent_m: number; race_name: string; year: number } | null = null;
      for (const ar of athRaces) {
        const d = biggestDescent(ar.sections);
        if (d && (!athleteBestDesc || d.descent_m > athleteBestDesc.descent_m)) {
          athleteBestDesc = { km: Math.round(d.km * 10) / 10, descent_m: Math.round(d.descent_m), race_name: ar.race_name, year: ar.year };
        }
      }
      biggest_descent = {
        goal: { km: Math.round(goalDesc.km * 10) / 10, descent_m: Math.round(goalDesc.descent_m), avg_grad: goalDesc.avg_grad, start_km: Math.round(goalDesc.start_km * 10) / 10, end_km: Math.round(goalDesc.end_km * 10) / 10 },
        athlete_best: athleteBestDesc,
        ratio: athleteBestDesc && athleteBestDesc.descent_m > 0
          ? Math.round((goalDesc.descent_m / athleteBestDesc.descent_m) * 10) / 10
          : null,
      };
    }
  }

  // ── 9. Opening profile match ─────────────────────────────────────────────
  let opening_match: ExpContextOpeningMatch | null = null;
  const goalOpening = characteriseOpening(goalSections, goalDistKm);
  if (goalOpening) {
    let bestRace: AthRaceInfo | null = null;
    let bestSim = 0;
    for (const ar of athRaces) {
      const cand = characteriseOpening(ar.sections, ar.total_distance_km);
      if (!cand) continue;
      const sim = openingSimilarity(goalOpening, cand);
      if (sim > bestSim) { bestSim = sim; bestRace = ar; }
    }
    opening_match = {
      goal_opening_km:       Math.round(goalOpening.km * 10) / 10,
      goal_dominant_type:    goalOpening.dominantType,
      goal_dominant_terrain: goalOpening.dominantTerrain,
      goal_climb_pct:        Math.round(goalOpening.climbPct * 100),
      matched_race_name:  bestSim >= 0.6 && bestRace ? bestRace.race_name : null,
      matched_race_year:  bestSim >= 0.6 && bestRace ? bestRace.year      : null,
      similarity:         Math.round(bestSim * 100) / 100,
    };
  }

  return NextResponse.json({ scale, time_estimate, biggest_climb, biggest_descent, opening_match } satisfies ExperienceContextResult);
}

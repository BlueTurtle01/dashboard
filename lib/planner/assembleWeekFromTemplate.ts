import type { RaceConditions } from "./types";

// ─── Output types (planJson-ready) ────────────────────────────────────────────

export interface AssembledPlanExercise {
  id: string;
  exerciseId: string;
  name: string;
  sortOrder: number;
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  notes: string;
  originalSets: number | null;
  originalReps: number | null;
  originalDurationSeconds: number | null;
  equipment?: string[];
  equipmentConflict?: boolean;
  swappedFromExerciseId?: string;
  swappedFromName?: string;
}

export interface AssembledPlanSession {
  id: string;
  weekId: string;
  sortOrder: number;
  dayLabel: string;
  type: string;
  name: string;
  description: string;
  tags: string[];
  duration: string;
  distance: string;
  intensity: string;
  isKeySession: boolean;
  originalDuration: string;
  originalDistance: string;
  scalingMode: "endurance" | "intensity" | "none";
  scalingScalar: number;
  assembledFromWeekTemplate: true;
  sourceWeekTemplateId: string;
  exercises: AssembledPlanExercise[];
  // Extended session fields
  activity?: string;
  subtype?: string;
  terrain?: string;
  elevationGainMeters?: number;
  packWeightKg?: number;
  strides?: string;
  warmupMinutes?: number;
  cooldownMinutes?: number;
  intervalReps?: string | number;
  intervalDuration?: string;
  intervalRestSeconds?: number;
}

// ─── Day-assignment types and utilities ─────────────────────────────────────

export interface AthleteAvailability {
  preferred_long_session_day: string | null;
  available_gym_days: string[] | null;
  available_run_days: string[] | null;
}

const DAY_ALIASES: Record<string, string> = {
  mon: "Mon", monday: "Mon",
  tue: "Tue", tues: "Tue", tuesday: "Tue",
  wed: "Wed", weds: "Wed", wednesday: "Wed",
  thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
  fri: "Fri", friday: "Fri",
  sat: "Sat", saturday: "Sat",
  sun: "Sun", sunday: "Sun",
};

const CANONICAL_DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDisplayDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return DAY_ALIASES[raw.trim().toLowerCase()] ?? null;
}

function normaliseDisplayDayList(days: string[] | null | undefined): string[] {
  return (days ?? []).map(toDisplayDay).filter(Boolean) as string[];
}

function pickBestDay(preferred: string[], used: Set<string>, allowReuse = true): string {
  const unused = preferred.find((d) => !used.has(d));
  if (unused) return unused;
  if (allowReuse && preferred.length > 0) return preferred[0];
  return CANONICAL_DAY_ORDER.find((d) => !used.has(d)) ?? CANONICAL_DAY_ORDER[0];
}

/**
 * Given a flat list of sessions for one week plus athlete availability, assigns
 * a dayLabel to each session. Prioritizes spacing out sessions with rest days
 * between them where possible.
 *
 * Sessions that already have a real dayLabel are left unchanged.
 */
export function assignDayLabelsToSessions<T extends { type: string; dayLabel: string }>(
  sessions: T[],
  availability: AthleteAvailability | null,
  isLong: (session: T) => boolean,
): T[] {
  if (!availability) return sessions;

  const longDay = toDisplayDay(availability.preferred_long_session_day);
  const gymDays = normaliseDisplayDayList(availability.available_gym_days);
  const runDays = normaliseDisplayDayList(availability.available_run_days);

  const usedDays = new Set<string>();
  const assignment = new Map<T, string>();

  const longSessions = sessions.filter(isLong);
  const gymSessions = sessions.filter((s) => s.type === "Gym" && !isLong(s));
  const otherSessions = sessions.filter((s) => s.type !== "Gym" && !isLong(s));

  for (const session of longSessions) {
    const preferred = longDay ? [longDay] : runDays;
    const day = pickBestDay(preferred, usedDays);
    assignment.set(session, day);
    usedDays.add(day);
  }

  const allRemaining = [...gymSessions, ...otherSessions];
  if (allRemaining.length > 0) {
    const dayIndices = new Map<string, number>();
    for (let i = 0; i < CANONICAL_DAY_ORDER.length; i++) {
      dayIndices.set(CANONICAL_DAY_ORDER[i], i);
    }

    const toPlace = [...gymSessions, ...otherSessions];

    for (const session of toPlace) {
      const isGym = gymSessions.includes(session);
      const preferredList = isGym
        ? (gymDays.length ? gymDays : CANONICAL_DAY_ORDER)
        : (runDays.length ? runDays : CANONICAL_DAY_ORDER);

      let bestDay: string | null = null;
      let bestScore = -Infinity;

      for (const day of preferredList) {
        if (usedDays.has(day)) continue;

        let minDistance = 7;
        const dayIdx = dayIndices.get(day) ?? -1;
        for (const usedDay of usedDays) {
          const usedIdx = dayIndices.get(usedDay) ?? -1;
          const distance = Math.min(
            Math.abs(dayIdx - usedIdx),
            7 - Math.abs(dayIdx - usedIdx),
          );
          minDistance = Math.min(minDistance, distance);
        }

        if (bestDay === null || minDistance > bestScore) {
          bestDay = day;
          bestScore = minDistance;
        }
      }

      if (!bestDay) {
        bestDay = preferredList.find((d) => !usedDays.has(d)) ?? preferredList[0];
      }

      assignment.set(session, bestDay);
      usedDays.add(bestDay);
    }
  }

  return sessions.map((s) => {
    if (s.dayLabel && DAY_ALIASES[s.dayLabel.trim().toLowerCase()]) return s;
    const assigned = assignment.get(s);
    return assigned ? { ...s, dayLabel: assigned } : s;
  });
}

// ─── Condition key helpers ────────────────────────────────────────────────────

/**
 * Derives condition tag keys from an athlete's race conditions and equipment.
 */
export function buildConditionKeys(
  raceConditions: RaceConditions | null,
  gymAvailable: boolean,
): string[] {
  const keys: string[] = [];

  if (!gymAvailable) keys.push("no_gym");
  if (!raceConditions) return keys;

  const { temperature, altitude, specialConditions = [] } = raceConditions;

  if (temperature === "hot" || temperature === "extreme_heat") keys.push("heat");
  if (temperature === "cold" || temperature === "extreme_cold") keys.push("cold");
  if (altitude === "high" || altitude === "extreme") keys.push("altitude");
  if (specialConditions.includes("self_sufficiency")) keys.push("load_carriage");
  if (specialConditions.includes("night_stages")) keys.push("night_running");
  if (specialConditions.includes("sand")) keys.push("sand");
  if (specialConditions.includes("technical_terrain")) keys.push("technical_terrain");
  if (specialConditions.includes("multi_day")) keys.push("multi_day");

  return keys;
}

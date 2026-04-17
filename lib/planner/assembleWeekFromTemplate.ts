import type { SupabaseClient } from "@supabase/supabase-js";
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
  intervalReps?: number;
  intervalDuration?: string;
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
 * between them where possible:
 *
 * 1. Long sessions are placed first on preferred/available run days
 * 2. Remaining sessions (gym and other) are placed to maximize spacing
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

  // Priority order: long sessions first → gym sessions → everything else
  const longSessions = sessions.filter(isLong);
  const gymSessions = sessions.filter((s) => s.type === "Gym" && !isLong(s));
  const otherSessions = sessions.filter((s) => s.type !== "Gym" && !isLong(s));

  // 1. Place long sessions first (on preferred long day)
  for (const session of longSessions) {
    const preferred = longDay ? [longDay] : runDays;
    const day = pickBestDay(preferred, usedDays);
    assignment.set(session, day);
    usedDays.add(day);
  }

  // 2. Place gym sessions, trying to spread them out
  const allRemaining = [...gymSessions, ...otherSessions];
  if (allRemaining.length > 0) {
    const dayIndices = new Map<string, number>();
    for (let i = 0; i < CANONICAL_DAY_ORDER.length; i++) {
      dayIndices.set(CANONICAL_DAY_ORDER[i], i);
    }

    // Sort remaining sessions to place gym sessions first, then others
    const toPlace = [...gymSessions, ...otherSessions];

    // For each remaining session, find the best available day
    // that has at least 1 unused day between it and the previously used days
    for (const session of toPlace) {
      const isGym = gymSessions.includes(session);
      const preferredList = isGym
        ? (gymDays.length ? gymDays : CANONICAL_DAY_ORDER)
        : (runDays.length ? runDays : CANONICAL_DAY_ORDER);

      // Find best day from preferred list, preferring days with spacing
      let bestDay: string | null = null;
      let bestScore = -Infinity;

      for (const day of preferredList) {
        if (usedDays.has(day)) continue;

        // Score this day based on distance from used days (prefer spacing)
        let minDistance = 7; // Large default
        const dayIdx = dayIndices.get(day) ?? -1;
        for (const usedDay of usedDays) {
          const usedIdx = dayIndices.get(usedDay) ?? -1;
          const distance = Math.min(
            Math.abs(dayIdx - usedIdx),
            7 - Math.abs(dayIdx - usedIdx) // Account for week wraparound
          );
          minDistance = Math.min(minDistance, distance);
        }

        // Prefer days with more distance from other sessions
        if (bestDay === null || minDistance > bestScore) {
          bestDay = day;
          bestScore = minDistance;
        }
      }

      // Fallback to first available day if no spacing preference works
      if (!bestDay) {
        bestDay = preferredList.find((d) => !usedDays.has(d)) ?? preferredList[0];
      }

      assignment.set(session, bestDay);
      usedDays.add(bestDay);
    }
  }

  return sessions.map((s) => {
    // Respect any manually-set day label
    if (s.dayLabel && DAY_ALIASES[s.dayLabel.trim().toLowerCase()]) return s;
    const assigned = assignment.get(s);
    return assigned ? { ...s, dayLabel: assigned } : s;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


/**
 * Derives condition tag keys from an athlete's race conditions and equipment.
 * These keys are matched against week_templates.condition_tags.
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

/**
 * Scores a week template against the athlete's condition keys.
 * Each matching tag scores +2. Each non-matching tag on a conditioned template
 * scores -1 (penalises templates built for the wrong conditions).
 * Templates with no condition_tags score 0 — they are general-purpose fallbacks.
 */
export function scoreTemplate(conditionTags: string[], conditionKeys: string[]): number {
  if (!conditionTags.length) return 0;
  let score = 0;
  for (const tag of conditionTags) {
    if (conditionKeys.includes(tag)) score += 2;
    else score -= 1;
  }
  return score;
}

function scalingModeForType(type: string | null): "endurance" | "intensity" | "none" {
  const t = (type ?? "").toLowerCase();
  if (t === "gym") return "intensity";
  if (t === "rest" || t === "recovery") return "none";
  return "endurance";
}

// ─── Main assembly function ───────────────────────────────────────────────────

/**
 * For each week in `emptyWeeks`, finds the best matching week template from the
 * library based on focus type + race condition tags, then copies its sessions
 * (with scaling applied) into a planJson-ready format.
 *
 * Returns a Map of week.id → assembled sessions. Weeks with no matching
 * template are absent from the map.
 */
export async function assembleWeeksFromTemplates(
  emptyWeeks: Array<{ id: string; weekNumber: number; focus: string | null }>,
  conditionKeys: string[],
  enduranceScalar: number,
  intensityScalar: number,
  supabase: SupabaseClient,
  athleteAvailability: AthleteAvailability | null = null,
  unavailableEquipment?: string[],
): Promise<Map<string, AssembledPlanSession[]>> {
  const result = new Map<string, AssembledPlanSession[]>();

  if (!emptyWeeks.length) {
    console.log("[assembly] No empty weeks to fill.");
    return result;
  }
  console.log("[assembly] Empty weeks:", emptyWeeks.map(w => `${w.weekNumber}:${w.focus}`));
  console.log("[assembly] Condition keys:", conditionKeys);

  // 1. Resolve focus names → focus_type_ids
  const { data: focusTypes, error: focusError } = await supabase
    .from("week_focus_types")
    .select("id, name");

  if (focusError) {
    console.error("[assembly] week_focus_types query failed:", focusError.message);
    return result;
  }
  console.log("[assembly] Focus types found:", focusTypes?.map(f => f.name));

  const focusNameToId = new Map<string, string>();
  for (const ft of focusTypes ?? []) {
    focusNameToId.set(ft.name.toLowerCase(), ft.id);
  }

  const relevantFocusIds = [
    ...new Set(
      emptyWeeks
        .map((w) => w.focus ? focusNameToId.get(w.focus.toLowerCase()) : null)
        .filter(Boolean) as string[],
    ),
  ];
  console.log("[assembly] Relevant focus IDs:", relevantFocusIds);

  if (!relevantFocusIds.length) {
    console.warn("[assembly] No focus IDs matched — week focus names don't match week_focus_types table.");
    return result;
  }

  // 2. Fetch all active week templates for relevant focus types
  const { data: templates, error: templatesError } = await supabase
    .from("week_templates")
    .select("id, name, focus_type_id, condition_tags, is_active")
    .in("focus_type_id", relevantFocusIds);

  if (templatesError) {
    console.error("[assembly] week_templates query failed:", templatesError.message);
    return result;
  }
  console.log("[assembly] Templates found:", templates?.length, templates?.map(t => ({
    id: t.id,
    name: t.name,
    focus_type_id: t.focus_type_id,
    condition_tags: t.condition_tags,
    is_active: t.is_active,
  })));

  if (!templates?.length) {
    console.warn("[assembly] No week templates found for focus IDs:", relevantFocusIds);
    return result;
  }

  const activeTemplates = templates.filter(t => t.is_active);
  if (!activeTemplates.length) {
    console.warn("[assembly] Templates found but none are active:", templates.map(t => t.name));
    return result;
  }

  // 3. Pick the best template per focus type
  const candidatesByFocus = new Map<string, Array<{ id: string; score: number }>>();
  for (const t of activeTemplates) {
    if (!t.focus_type_id) continue;
    const score = scoreTemplate(t.condition_tags ?? [], conditionKeys);
    if (!candidatesByFocus.has(t.focus_type_id)) {
      candidatesByFocus.set(t.focus_type_id, []);
    }
    candidatesByFocus.get(t.focus_type_id)!.push({ id: t.id, score });
  }

  const bestTemplateByFocusId = new Map<string, string>();
  for (const [focusId, candidates] of candidatesByFocus.entries()) {
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    if (best) bestTemplateByFocusId.set(focusId, best.id);
  }

  // 4. Fetch slots + session data for all winning templates in one query
  const templateIdsToFetch = [...new Set(bestTemplateByFocusId.values())];
  console.log("[assembly] Fetching slots for template IDs:", templateIdsToFetch);

  const { data: slots, error: slotsError } = await supabase
    .from("week_template_slots")
    .select(`
      id,
      week_template_id,
      slot_name,
      sort_order,
      notes,
      category,
      activity,
      subtype,
      session_template_id,
      session_templates (
        id,
        name,
        type,
        description,
        duration_minutes,
        distance_km,
        target_intensity,
        is_key_session,
        session_template_exercises (
          id,
          exercise_id,
          exercise_order,
          sets,
          reps,
          duration,
          notes,
          exercises ( id, name, equipment )
        )
      )
    `)
    .in("week_template_id", templateIdsToFetch)
    .order("sort_order");

  if (slotsError) {
    console.error("[assembly] week_template_slots query failed:", slotsError.message);
    return result;
  }

  console.log("[assembly] Slots found:", slots?.length, slots?.map(s => ({
    id: s.id,
    slot_name: s.slot_name,
    session_template_id: s.session_template_id,
    has_session_template: !!s.session_templates,
  })));

  if (!slots?.length) {
    console.warn("[assembly] No slots found for template IDs:", templateIdsToFetch);
    return result;
  }

  // Group slots by template id
  const slotsByTemplate = new Map<string, typeof slots>();
  for (const slot of slots) {
    const tid = slot.week_template_id as string;
    if (!slotsByTemplate.has(tid)) slotsByTemplate.set(tid, []);
    slotsByTemplate.get(tid)!.push(slot);
  }

  // 5. Build planJson sessions for each empty week
  for (const week of emptyWeeks) {
    if (!week.focus) continue;

    const focusId = focusNameToId.get(week.focus.toLowerCase());
    if (!focusId) continue;

    const templateId = bestTemplateByFocusId.get(focusId);
    if (!templateId) continue;

    const weekSlots = slotsByTemplate.get(templateId) ?? [];
    console.log(`[assembly] Week ${week.weekNumber} (${week.focus}): ${weekSlots.length} slots`);

    // Build sessions with a temporary isLong marker for day assignment
    type WithIsLong = AssembledPlanSession & { _isLong: boolean };
    const assembled: WithIsLong[] = weekSlots
      .map((slot, index) => {
        // Prefer linked session template data; fall back to ad hoc slot data
        const st = slot.session_templates as unknown as Record<string, unknown> | null;

        const name = (st?.name as string | null)
          ?? (slot.slot_name as string)
          ?? "Session";

        // Derive type from session template or slot category
        const rawType = (st?.type as string | null)
          ?? (slot.category as string | null)
          ?? "Functional";
        const type = rawType;

        const scalingMode = scalingModeForType(type);
        const scalar =
          scalingMode === "intensity"
            ? intensityScalar
            : scalingMode === "endurance"
              ? enduranceScalar
              : 1;

        const durationMins = (st?.duration_minutes as number | null) ?? null;
        const distanceKm = (st?.distance_km as number | null) ?? null;
        const durationStr = durationMins
          ? `${Math.round(durationMins * scalar)} min`
          : "";
        const distanceStr = distanceKm
          ? `${(distanceKm * scalar).toFixed(1)} km`
          : "";

        const rawExercises = (
          (st?.session_template_exercises as Array<Record<string, unknown>> | null) ?? []
        );

        const exercises: AssembledPlanExercise[] = rawExercises
          .sort(
            (a, b) =>
              ((a.exercise_order as number) ?? 0) -
              ((b.exercise_order as number) ?? 0),
          )
          .map((ex, exIndex) => {
            const rawDurSec =
              typeof ex.duration === "number" ? (ex.duration as number) : null;
            const scaledSets =
              ex.sets != null ? Math.round((ex.sets as number) * scalar) : null;
            const scaledReps =
              ex.reps != null ? Math.round((ex.reps as number) * scalar) : null;
            const scaledDurSec =
              rawDurSec != null ? Math.round(rawDurSec * scalar) : null;
            const exerciseRecord = ex.exercises as Record<string, unknown> | null;

            return {
              id: `exercise-${ex.id as string}-${exIndex + 1}`,
              exerciseId: ex.exercise_id as string,
              name: (exerciseRecord?.name as string) ?? (ex.exercise_id as string),
              sortOrder: exIndex + 1,
              sets: scaledSets,
              reps: scaledReps,
              durationSeconds: scaledDurSec,
              notes: (ex.notes as string) ?? "",
              originalSets: (ex.sets as number | null) ?? null,
              originalReps: (ex.reps as number | null) ?? null,
              originalDurationSeconds: rawDurSec,
              equipment: (exerciseRecord?.equipment as string[] | undefined) ?? undefined,
            };
          });

        const subtype = (st?.subtype as string | null) ?? "";

        // Extract extended fields from slot data (if available - may be from program templates or week templates)
        const activity = (slot as any)?.activity ?? (st?.activity as string | null) ?? undefined;
        const terrain = (slot as any)?.terrain ?? undefined;
        const elevationGainMeters = (slot as any)?.elevation_gain_meters ?? undefined;
        const packWeightKg = (slot as any)?.pack_weight_kg ?? undefined;
        const strides = (slot as any)?.strides ?? undefined;
        const warmupMinutes = (slot as any)?.warmup_minutes ?? undefined;
        const cooldownMinutes = (slot as any)?.cooldown_minutes ?? undefined;
        const intervalReps = (slot as any)?.interval_reps ?? undefined;
        const intervalDuration = (slot as any)?.interval_duration ?? undefined;

        return {
          id: `session-${week.weekNumber}-${index + 1}-wt-${slot.id as string}`,
          weekId: `week-${week.weekNumber}`,
          sortOrder: index + 1,
          dayLabel: "",
          type,
          name,
          _isLong: subtype.toLowerCase() === "long",
          description: (st?.description as string | null) ?? (slot.notes as string | null) ?? "",
          tags: ["auto-assembled"],
          duration: durationStr,
          distance: distanceStr,
          intensity: (st?.target_intensity as string | null) ?? "",
          isKeySession: (st?.is_key_session as boolean | null) ?? false,
          originalDuration: durationMins ? `${durationMins} min` : "",
          originalDistance: distanceKm ? `${distanceKm} km` : "",
          scalingMode,
          scalingScalar: scalar,
          assembledFromWeekTemplate: true as const,
          sourceWeekTemplateId: templateId,
          exercises,
          // Extended fields
          activity,
          subtype: subtype || undefined,
          terrain,
          elevationGainMeters,
          packWeightKg,
          strides,
          warmupMinutes,
          cooldownMinutes,
          intervalReps,
          intervalDuration,
        };
      });

    // Assign days based on athlete availability, then strip the temporary marker
    const withDays = assignDayLabelsToSessions(
      assembled,
      athleteAvailability,
      (s) => s._isLong,
    ).map(({ _isLong: _drop, ...rest }) => rest as AssembledPlanSession);

    console.log(`[assembly] Week ${week.weekNumber} assembled ${withDays.length} sessions`);
    result.set(week.id, withDays);
  }

  // Detect equipment conflicts if unavailable equipment list is provided
  if (unavailableEquipment && unavailableEquipment.length > 0) {
    for (const [weekId, sessions] of result.entries()) {
      const conflictDetected = sessions.map((session) => ({
        ...session,
        exercises: session.exercises.map((exercise) => {
          const hasConflict = (exercise.equipment || []).some((eq) =>
            unavailableEquipment.includes(eq)
          );
          return {
            ...exercise,
            equipmentConflict: hasConflict ? true : undefined,
          };
        }),
      }));
      result.set(weekId, conflictDetected);
    }
  }

  return result;
}

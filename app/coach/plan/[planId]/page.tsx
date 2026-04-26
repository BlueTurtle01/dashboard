"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import WarningList from "@/components/WarningList";
import AdHocSessionForm from "@/components/AdHocSessionForm";
import { UnifiedSessionForm, type UnifiedSessionFormData } from "@/app/coach/components/UnifiedSessionForm";
import { calculateAllWarnings } from "@/lib/planner/warningRules";
import { GeneratedPlan, PlanExercise, PlanSession, PlanSessionType, TrainingPurpose, TRAINING_PURPOSES } from "@/lib/planner/types";
import { findAlternativesForPicker } from "@/lib/planner/exerciseSwap";

const canonicalDayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const canonicalDayToDisplayLabel: Record<(typeof canonicalDayOrder)[number], string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function deriveEquipmentAvoid(athleteContext: AthleteContextRow | null): string[] {
  if (!athleteContext) return [];
  // Equipment avoid is derived from athlete_equipment_unavailable junction table
  return (athleteContext.athlete_equipment_unavailable ?? [])
    .map((row) => row.equipment_options?.slug)
    .filter((s): s is string => Boolean(s));
}

// ---------------------------------------------------------------------------
// Date helpers — all comparisons use YYYY-MM-DD strings to avoid UTC/local
// timezone shifts. new Date("2025-04-09") is UTC midnight which becomes
// April 8 23:00 in BST, making Monday boundaries fall in the wrong week.
// ---------------------------------------------------------------------------
function isoDate(raw: string): string {
  // Normalise to YYYY-MM-DD regardless of whether the value has a time part.
  return raw.slice(0, 10);
}

function addDaysToIso(dateStr: string, days: number): string {
  // Parse at local noon to stay clear of DST boundaries, then format back.
  const d = new Date(`${isoDate(dateStr)}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getHolidaysForWeek(weekNumber: number, plan: GeneratedPlan | null, athleteEvents: Array<any> = []): Array<any> {
  if (!plan || !plan.startDate) return [];

  const weekStart = addDaysToIso(plan.startDate, (weekNumber - 1) * 7);
  const weekEnd = addDaysToIso(weekStart, 6);

  return athleteEvents.filter(event => {
    if (!event.start_date || !event.end_date) return false;
    const eventStart = isoDate(event.start_date);
    const eventEnd = isoDate(event.end_date);
    return eventStart <= weekEnd && eventEnd >= weekStart;
  });
}

function getPrepRacesForWeek(weekNumber: number, plan: GeneratedPlan | null, prepRaces: Array<{ date: string; race_name: string }> = []): Array<{ date: string; race_name: string }> {
  if (!plan || !plan.startDate) return [];

  const weekStart = addDaysToIso(plan.startDate, (weekNumber - 1) * 7);
  const weekEnd = addDaysToIso(weekStart, 6);

  return prepRaces.filter(race => {
    const raceDate = isoDate(race.date);
    return raceDate >= weekStart && raceDate <= weekEnd;
  });
}

function getCampsForWeek(weekNumber: number, plan: GeneratedPlan | null, camps: TrainingCamp[] = []): TrainingCamp[] {
  if (!plan || !plan.startDate) return [];

  const weekStart = addDaysToIso(plan.startDate, (weekNumber - 1) * 7);
  const weekEnd = addDaysToIso(weekStart, 6);

  return camps.filter(camp => {
    const campStart = isoDate(camp.start_date);
    const campEnd = isoDate(camp.end_date);
    return campStart <= weekEnd && campEnd >= weekStart;
  });
}

const dayAliases: Record<string, (typeof canonicalDayOrder)[number]> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  weds: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

type AthletePlanRow = {
  id: string;
  athlete_user_id: string;
  coach_user_id: string | null;
  source_program_template_id: string | null;
  event_id: string | null;
  name: string;
  plan_json: unknown;
  status: "draft" | "active" | "archived";
  created_at?: string | null;
  updated_at?: string | null;
};

type AthletePlanSnapshotRow = {
  id: string;
  athlete_user_id: string;
  athlete_plan_id: string | null;
  name: string;
  plan_json: GeneratedPlan;
  created_at: string;
};

type PendingSessionSlot = {
  weekId: string;
  dayLabel: string;
};

type SessionTemplateRow = {
  id: string;
  name: string | null;
  description: string | null;
  type: string | null;
  activity: string | null;
  subtype: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  target_intensity: string | null;
  session_data: Record<string, unknown> | null;
  is_key_session?: boolean | null;
  focus_area?: string | null;
  goal?: string | null;
};

type SessionTemplateAlternativeLinkRow = {
  session_template_id: string;
  alternative_session_template_id: string;
  replacement_reason?: string | null;
};

type SessionTemplateExerciseRow = {
  id: string;
  exercise_order: number | null;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  notes: string | null;
  exercises:
    | {
        id: string;
        name: string;
        description: string;
      }
    | {
        id: string;
        name: string;
        description: string;
      }[]
    | null;
};

type SavedCycleFocus = {
  name: string;
  color: string;
};

type SavedCycleWeek = {
  weekNumber: number;
  focus: SavedCycleFocus | string | null;
};

type SavedCycle = {
  cycleNumber: number;
  weeks: SavedCycleWeek[];
};

type CycleBuilderPlanJson = {
  totalWeeks?: number;
  cycleLength?: number;
  showAllCycles?: boolean;
  cycles?: SavedCycle[];
};

type WeekFocusTypeRow = {
  id: string;
  name: string;
  display_order: number | null;
  color: string | null;
};

type AthleteContextRow = {
  baseline_fitness: string | null;
  available_run_days: string[] | null;
  available_gym_days: string[] | null;
  preferred_long_session_day: string | null;
  event_profile: {
    heatAccess?: boolean;
    saunaAccess?: boolean;
    packTraining?: boolean;
    sandAccess?: boolean;
  } | null;
  athlete_equipment_unavailable?: Array<{
    equipment_options: { slug: string } | null;
  }> | null;
  holiday_equipment_unavailable?: Array<{
    start_date: string;
    end_date: string;
    unavailable_equipment: string[];
  }> | null;
};

type TrainingCamp = {
  id: string;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string;
  terrain_types: string[];
  climate_types: string[];
  has_pack_carry: boolean;
  back_to_back_sessions: boolean;
  daily_session_cap: number;
  notes: string | null;
  status: "pending" | "acknowledged";
  created_at: string;
};

type WeekTemplateSlotRow = {
  id: string;
  week_template_id: string;
  slot_name: string;
  session_template_id: string | null;
  is_required: boolean;
  sort_order: number;
  notes: string | null;
};

type AthleteAvailabilityRow = {
  preferred_long_session_day: string | null;
  available_gym_days: string[] | null;
  available_run_days: string[] | null;
};

type EditablePlanSession = PlanSession & {
  sourceSessionTemplateId?: string | null;
  sourceSessionTemplateType?: string | null;
  sourceSessionTemplateSubtype?: string | null;
  sourceSessionTemplateActivity?: string | null;
  sourceSessionTemplateDurationMinutes?: number | null;
  sourceSessionTemplateDistanceKm?: number | null;
  sourceSessionTemplateTargetIntensity?: string | null;
  sourceSessionTemplateIsKeySession?: boolean | null;
  sourceSessionTemplateFocusArea?: string | null;
  sourceSessionTemplateGoal?: string | null;
  alternativeSessionTemplateId?: string | null;
  alternativeSessionTemplateName?: string | null;
  alternativeSessionTemplateReason?: string | null;
  alternativeIncluded?: boolean;
  alternativeDismissed?: boolean;
  isInsertedAlternative?: boolean;
  parentSessionId?: string | null;
};
type PlanWeekWithTemplateMeta = GeneratedPlan["weeks"][number] & {
  sourceWeekTemplateId?: string | null;
  sourceWeekTemplateName?: string | null;
};

function normalizeDayLabel(dayLabel: string) {
  return dayAliases[dayLabel.trim().toLowerCase()] ?? dayLabel.trim().toLowerCase();
}


function normalizeCanonicalDayList(days: string[] | null | undefined) {
  return (days ?? [])
    .map((day) => dayAliases[(day ?? "").trim().toLowerCase()])
    .filter((day): day is (typeof canonicalDayOrder)[number] => Boolean(day));
}

function normalizeCanonicalDay(day: string | null | undefined) {
  return day ? dayAliases[day.trim().toLowerCase()] ?? null : null;
}

function isLongSessionTemplate(row: SessionTemplateRow | undefined | null) {
  if (!row) return false;
  const subtype = (row.subtype ?? "").trim().toLowerCase();
  return subtype === "long";
}

function isGymSessionTemplate(row: SessionTemplateRow | undefined | null) {
  if (!row) return false;
  return (row.type ?? "").trim().toLowerCase() === "gym";
}

function pickBestAvailableDay(
  preferredDays: (typeof canonicalDayOrder)[number][],
  usedDays: Set<(typeof canonicalDayOrder)[number]>,
  fallbackUsedOk = true,
) {
  const unusedPreferred = preferredDays.find((day) => !usedDays.has(day));
  if (unusedPreferred) return unusedPreferred;

  if (fallbackUsedOk && preferredDays.length > 0) {
    return preferredDays[0];
  }

  const unusedAnyDay = canonicalDayOrder.find((day) => !usedDays.has(day));
  if (unusedAnyDay) return unusedAnyDay;

  return canonicalDayOrder[0];
}

function assignDaysForWeekTemplateSlots(
  slots: WeekTemplateSlotRow[],
  templateById: Map<string, SessionTemplateRow>,
  athleteAvailability: AthleteAvailabilityRow | null,
) {
  const preferredLongDay = normalizeCanonicalDay(
    athleteAvailability?.preferred_long_session_day ?? null,
  );
  const runDays = normalizeCanonicalDayList(athleteAvailability?.available_run_days);
  const gymDays = normalizeCanonicalDayList(athleteAvailability?.available_gym_days);

  const assignedDays = new Map<string, (typeof canonicalDayOrder)[number]>();
  const usedDays = new Set<(typeof canonicalDayOrder)[number]>();

  // Separate slots by type
  const gymSlots = slots.filter((slot) =>
    slot.session_template_id ? isGymSessionTemplate(templateById.get(slot.session_template_id)) : false,
  );

  const runSlots = slots.filter((slot) => {
    const template = slot.session_template_id ? templateById.get(slot.session_template_id) : undefined;
    return !isGymSessionTemplate(template);
  });

  // Helper to extract duration from slot name (e.g., "Run - Easy - 45 min" → 45)
  function extractDurationFromName(name: string | null): number {
    if (!name) return 0;
    const match = name.match(/(\d+)\s*min/i);
    return match ? Number(match[1]) : 0;
  }

  // Find the longest run (by duration or distance) to assign to the preferred long day
  let longestRunSlot: { slot: WeekTemplateSlotRow; duration: number; distance: number } | null = null;
  for (const slot of runSlots) {
    let duration = 0;
    let distance = 0;

    if (slot.session_template_id) {
      const template = templateById.get(slot.session_template_id);
      if (template) {
        duration = Number(template.duration_minutes ?? 0);
        distance = Number(template.distance_km ?? 0);
      }
    } else {
      // Ad hoc slot: extract duration from slot name
      duration = extractDurationFromName(slot.slot_name);
    }

    // Prioritize duration, then distance as a tiebreaker
    if (!longestRunSlot ||
        duration > longestRunSlot.duration ||
        (duration === longestRunSlot.duration && distance > longestRunSlot.distance)) {
      longestRunSlot = { slot, duration, distance };
    }
  }

  // Assign the longest run to the preferred long day (or first available run day if not set)
  if (longestRunSlot) {
    let longDayChoices: (typeof canonicalDayOrder)[number][] = [];

    if (preferredLongDay) {
      // Use preferred day if set
      longDayChoices = [preferredLongDay];
    } else if (runDays.length > 0) {
      // Fall back to first available run day if no preferred day
      longDayChoices = [runDays[0]];
    } else {
      // Fall back to Saturday (common long run day) or first day
      longDayChoices = ["sat", "sun", "fri"];
    }

    const chosenDay = pickBestAvailableDay(longDayChoices, usedDays);
    assignedDays.set(longestRunSlot.slot.id, chosenDay);
    usedDays.add(chosenDay);
  }

  // Assign other runs to available run days
  for (const slot of runSlots) {
    if (assignedDays.has(slot.id)) continue;

    const chosenDay = runDays.length > 0
      ? pickBestAvailableDay(runDays, usedDays)
      : pickBestAvailableDay(canonicalDayOrder.slice(), usedDays, true);
    assignedDays.set(slot.id, chosenDay);
    usedDays.add(chosenDay);
  }

  // Assign gym sessions to available gym days
  for (const slot of gymSlots) {
    const chosenDay = pickBestAvailableDay(gymDays, usedDays);
    assignedDays.set(slot.id, chosenDay);
    usedDays.add(chosenDay);
  }

  // Assign any remaining unassigned slots to any available day
  for (const slot of slots) {
    if (assignedDays.has(slot.id)) continue;

    const chosenDay = pickBestAvailableDay(canonicalDayOrder.slice(), usedDays, true);
    assignedDays.set(slot.id, chosenDay);
    usedDays.add(chosenDay);
  }

  return assignedDays;
}

function getWeekBackgroundColor(
  focus: string | null | undefined,
  weekFocusTypes: WeekFocusTypeRow[],
) {
  if (!focus) return "#f9fafb";

  // Light color palette mapping
  const lightColorPalette: Record<string, string> = {
    "Early Base": "#dbeafe",
    "Late Base": "#fef3c7",
    "Early Build": "#d1fae5",
    "Late Build": "#ede9fe",
    "Peak": "#dbeafe",
    "Taper": "#fef3c7",
    "Race Week": "#ede9fe",
    "Recovery": "#d1fae5",
    "Recovery from Prep Race": "#d1fae5",
    "Post-Race": "#d1fae5",
    "Back-to-Back Block": "#fde68a",
  };

  // If we have a mapping for this focus type, use it
  const lightColor = lightColorPalette[focus];
  if (lightColor) {
    return lightColor;
  }

  // Default light gray for unmapped focus types
  return "#f9fafb";
}

function sortSessionsForWeek(sessions: PlanSession[]) {
  return [...sessions].sort((a, b) => {
    const dayA = normalizeDayLabel(a.dayLabel);
    const dayB = normalizeDayLabel(b.dayLabel);
    const idxA = canonicalDayOrder.indexOf(dayA as (typeof canonicalDayOrder)[number]);
    const idxB = canonicalDayOrder.indexOf(dayB as (typeof canonicalDayOrder)[number]);
    // Sessions with no recognised day sort to the end
    const ordA = idxA === -1 ? 999 : idxA;
    const ordB = idxB === -1 ? 999 : idxB;
    if (ordA !== ordB) return ordA - ordB;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

function normalisePlanSessionOrdering(plan: GeneratedPlan): GeneratedPlan {
  return {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: sortSessionsForWeek(week.sessions).map((session, index) => ({
        ...session,
        weekId: week.id,
        sortOrder: index + 1,
      })),
    })),
  };
}

function findExistingDayLabelForWeek(
  plan: GeneratedPlan,
  weekId: string,
  canonicalDay: (typeof canonicalDayOrder)[number],
) {
  const labelsForWeek =
    plan.weeks.find((week) => week.id === weekId)?.sessions.map((session) => session.dayLabel) ??
    [];

  const matchedExistingLabel = labelsForWeek.find(
    (label) => normalizeDayLabel(label) === canonicalDay,
  );

  return matchedExistingLabel ?? canonicalDayToDisplayLabel[canonicalDay];
}

function getPreviousDaySlot(plan: GeneratedPlan, weekId: string, dayLabel: string) {
  const normalizedDayLabel = normalizeDayLabel(dayLabel);
  const dayIndex = canonicalDayOrder.indexOf(
    normalizedDayLabel as (typeof canonicalDayOrder)[number],
  );

  if (!plan.weeks.some((week) => week.id === weekId) || dayIndex <= 0) {
    return null;
  }

  const previousCanonicalDay = canonicalDayOrder[dayIndex - 1];

  return {
    weekId,
    dayLabel: findExistingDayLabelForWeek(plan, weekId, previousCanonicalDay),
  };
}

function isMobilitySession(session: PlanSession) {
  const nameNormalized = (session.name ?? "").trim().toLowerCase();
  const nameIsMobility = nameNormalized === "mobility" || nameNormalized === "mobility & flexibility";
  const tagIsMobility = (session.tags ?? []).some(
    (tag) => tag.trim().toLowerCase() === "mobility",
  );

  return nameIsMobility || tagIsMobility;
}

function hasMobilitySession(plan: GeneratedPlan, weekId: string, dayLabel: string) {
  return plan.weeks.some((week) =>
    week.sessions.some((session) => {
      if (session.weekId !== weekId || session.dayLabel !== dayLabel) {
        return false;
      }

      return isMobilitySession(session);
    }),
  );
}

function buildClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildExercisesFromSupabaseTemplate(
  templateId: string,
  sessionId: string,
): Promise<PlanExercise[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("session_template_exercises")
    .select(
      `
        id,
        exercise_id,
        exercise_order,
        sets,
        reps,
        duration,
        notes,
        exercises (
          id,
          name,
          description,
          equipment
        )
      `,
    )
    .eq("session_template_id", templateId)
    .order("exercise_order", { ascending: true });

  if (error || !data) {
    return [];
  }

  return (data as SessionTemplateExerciseRow[]).map((row, index) => {
    const exercise = Array.isArray(row.exercises) ? row.exercises[0] : row.exercises;

    return {
      id: exercise?.id ?? `exercise-${sessionId}-${index + 1}`,
      sessionId,
      sortOrder: index + 1,
      name: exercise?.name ?? "Unnamed exercise",
      description: exercise?.description ?? "",
      sets: row.sets ? parseInt(row.sets, 10) : null,
      reps: row.reps ? parseInt(row.reps, 10) : null,
      durationSeconds: row.duration ? parseInt(row.duration, 10) : null,
      tags: [],
      equipment: (exercise as any)?.equipment ?? [],
      exerciseId: (row as any).exercise_id,
    };
  });
}

function formatOptionLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildFunctionalDescription(row: SessionTemplateRow) {
  const sessionData = row.session_data ?? {};
  const terrain = typeof sessionData["terrain"] === "string" ? sessionData["terrain"] : "";
  const elevation = typeof sessionData["elevation"] === "string" ? sessionData["elevation"] : "";
  const timeOfDay =
    typeof sessionData["time_of_day"] === "string" ? sessionData["time_of_day"] : "";
  const startTime =
    typeof sessionData["start_time"] === "string" ? sessionData["start_time"] : "";
  const packWeight =
    typeof sessionData["pack_weight_kg"] === "number"
      ? `${sessionData["pack_weight_kg"]}kg pack`
      : typeof sessionData["pack_weight_kg"] === "string" && sessionData["pack_weight_kg"]
        ? `${sessionData["pack_weight_kg"]}kg pack`
        : "";

  const detailParts = [
    row.activity ? formatOptionLabel(row.activity) : "",
    row.subtype ? formatOptionLabel(row.subtype) : "",
    row.duration_minutes != null ? `${row.duration_minutes} min` : "",
    row.distance_km != null ? `${row.distance_km} km` : "",
    terrain ? formatOptionLabel(terrain) : "",
    elevation ? formatOptionLabel(elevation) : "",
    timeOfDay ? formatOptionLabel(timeOfDay) : "",
    startTime || "",
    packWeight,
  ].filter(Boolean);

  const baseDescription = row.description?.trim() ?? "";
  const detailText = detailParts.length ? detailParts.join(" · ") : "";

  if (baseDescription && detailText) {
    return `${baseDescription}\n${detailText}`;
  }

  return baseDescription || detailText;
}

function mapTemplateToPlanSessionType(row: SessionTemplateRow): PlanSession["type"] {
  const rawType = (row.type ?? "").trim().toLowerCase();
  const subtype = (row.subtype ?? "").trim().toLowerCase();
  const activity = (row.activity ?? "").trim().toLowerCase();

  if (rawType === "gym") return "Gym";
  if (["long"].includes(subtype)) return "Long";
  if (["recovery"].includes(subtype)) return "Recovery";
  if (["rest"].includes(subtype)) return "Rest";
  if (["tempo", "interval", "threshold", "hill_reps"].includes(subtype)) return "Steady";
  if (rawType === "functional") return "Easy";

  // Loaded — check subtype, type, or activity
  // pack_carry is both a standalone activity and a subtype of run/hike
  const loadedSubtypes = ["loaded", "loaded_march", "load_carriage", "pack_carry", "pack carry", "weighted_hike", "weighted hike"];
  const loadedActivities = ["pack_carry", "pack carry", "loaded march", "loaded_march", "weighted hike", "weighted_hike", "load carriage"];
  if (loadedSubtypes.includes(subtype) || rawType === "loaded" || activity === "pack_carry" || loadedActivities.includes(activity)) return "Loaded";

  // Recce
  const recceActivities = ["recce", "reconnaissance", "course recce"];
  if (["recce", "reconnaissance"].includes(subtype) || rawType === "recce" || recceActivities.includes(activity)) return "Recce";

  // Navigation
  const navActivities = ["navigation", "nav", "orienteering"];
  if (["navigation", "nav"].includes(subtype) || rawType === "navigation" || navActivities.includes(activity)) return "Navigation";

  const normalizedType = (row.type ?? "").trim();
  if (
    normalizedType === "Easy" ||
    normalizedType === "Steady" ||
    normalizedType === "Long" ||
    normalizedType === "Recovery" ||
    normalizedType === "Rest" ||
    normalizedType === "Gym" ||
    normalizedType === "Loaded" ||
    normalizedType === "Recce" ||
    normalizedType === "Navigation"
  ) {
    return normalizedType as PlanSession["type"];
  }

  return "Easy";
}

function scoreAlternative(base: SessionTemplateRow, candidate: SessionTemplateRow) {
  let score = 0;

  if ((base.type ?? "") === (candidate.type ?? "")) score += 30;
  if ((base.subtype ?? "") && (base.subtype ?? "") === (candidate.subtype ?? "")) score += 40;
  if ((base.goal ?? "") && (base.goal ?? "") === (candidate.goal ?? "")) score += 20;
  if ((base.focus_area ?? "") && (base.focus_area ?? "") === (candidate.focus_area ?? "")) {
    score += 15;
  }
  if ((base.is_key_session ?? false) === (candidate.is_key_session ?? false)) score += 10;
  if ((base.target_intensity ?? "") && base.target_intensity === candidate.target_intensity) {
    score += 10;
  }

  if (base.duration_minutes && candidate.duration_minutes) {
    const diff = Math.abs(base.duration_minutes - candidate.duration_minutes) / base.duration_minutes;
    if (diff < 0.1) score += 20;
    else if (diff < 0.2) score += 15;
    else if (diff < 0.3) score += 8;
  }

  if (base.distance_km && candidate.distance_km) {
    const diff = Math.abs(base.distance_km - candidate.distance_km) / base.distance_km;
    if (diff < 0.1) score += 20;
    else if (diff < 0.2) score += 15;
    else if (diff < 0.3) score += 8;
  }

  return score;
}

async function findBestAlternativeForTemplate(
  templateId: string,
): Promise<{
  id: string;
  name: string | null;
  replacementReason?: string | null;
} | null> {
  const sb = createClient();
  const { data: baseTemplate, error: baseError } = await sb
    .from("session_templates")
    .select(
      "id, name, description, type, activity, subtype, duration_minutes, distance_km, target_intensity, session_data, is_key_session, focus_area, goal",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (baseError || !baseTemplate) {
    return null;
  }

  const { data: linkRows, error: linksError } = await sb
    .from("session_template_alternatives")
    .select("session_template_id, alternative_session_template_id, replacement_reason")
    .or(`session_template_id.eq.${templateId},alternative_session_template_id.eq.${templateId}`);

  if (linksError || !linkRows || linkRows.length === 0) {
    return null;
  }

  const typedLinks = linkRows as SessionTemplateAlternativeLinkRow[];

  const candidateMeta = new Map<
    string,
    {
      replacementReason?: string | null;
    }
  >();

  for (const row of typedLinks) {
    const candidateId =
      row.session_template_id === templateId
        ? row.alternative_session_template_id
        : row.session_template_id;

    if (!candidateId || candidateId === templateId) continue;

    candidateMeta.set(candidateId, {
      replacementReason: row.replacement_reason ?? null,
    });
  }

  const candidateIds = [...candidateMeta.keys()];
  if (candidateIds.length === 0) {
    return null;
  }

  const { data: candidates, error: candidatesError } = await sb
    .from("session_templates")
    .select(
      "id, name, description, type, activity, subtype, duration_minutes, distance_km, target_intensity, session_data, is_key_session, focus_area, goal",
    )
    .in("id", candidateIds);

  if (candidatesError || !candidates || candidates.length === 0) {
    return null;
  }

  const typedBase = baseTemplate as SessionTemplateRow;
  const typedCandidates = candidates as SessionTemplateRow[];

  const scoredCandidates = typedCandidates
    .map((candidate) => ({
      candidate,
      score: 100 + scoreAlternative(typedBase, candidate),
      replacementReason: candidateMeta.get(candidate.id)?.replacementReason ?? null,
    }))
    .sort((a, b) => b.score - a.score);

  const best = scoredCandidates[0];
  if (!best) {
    return null;
  }

  return {
    id: best.candidate.id,
    name: best.candidate.name ?? null,
    replacementReason: best.replacementReason ?? null,
  };
}

function parseAdHocSessionDetails(notes: string | null): {
  activity?: string;
  subtype?: string;
  duration?: string;
  distance?: string;
  intensity?: string;
  terrain?: string;
  strides?: string;
} {
  const details: any = {};

  if (!notes) return details;

  const lines = notes.split("\n");
  for (const line of lines) {
    if (line.includes("Activity:")) {
      const match = line.match(/Activity:\s*(.+)/);
      if (match) details.activity = match[1].trim();
    } else if (line.includes("Subtype:")) {
      const match = line.match(/Subtype:\s*(.+)/);
      if (match) details.subtype = match[1].trim();
    } else if (line.includes("Duration:")) {
      const match = line.match(/Duration:\s*(.+)/);
      if (match) details.duration = match[1].trim();
    } else if (line.includes("Distance:")) {
      const match = line.match(/Distance:\s*(.+)/);
      if (match) details.distance = match[1].trim();
    } else if (line.includes("Intensity:")) {
      const match = line.match(/Intensity:\s*(.+)/);
      if (match) details.intensity = match[1].trim();
    } else if (line.includes("Terrain:")) {
      const match = line.match(/Terrain:\s*(.+)/);
      if (match) details.terrain = match[1].trim();
    } else if (line.includes("Strides:")) {
      const match = line.match(/Strides:\s*(.+)/);
      if (match) details.strides = match[1].trim();
    }
  }

  return details;
}

function buildAdHocSession(
  slotName: string,
  notes: string | null,
  weekId: string,
  dayLabel: string,
): EditablePlanSession {
  const parsed = parseAdHocSessionDetails(notes);
  const sessionId = buildClientId("session");

  // Remove "Not specified" from display
  const displayActivity = parsed.activity && parsed.activity !== "Not specified" ? parsed.activity : "";
  const displaySubtype = parsed.subtype && parsed.subtype !== "Not specified" ? parsed.subtype : "";

  // Build name from activity/subtype
  const name = [displayActivity, displaySubtype].filter(Boolean).join(" · ") || slotName || "(Ad hoc session)";

  // Build description from distance, intensity, strides
  const descParts = [];
  if (parsed.distance && parsed.distance !== "0" && parsed.distance !== "0 km") {
    descParts.push(parsed.distance);
  }
  if (parsed.intensity) {
    descParts.push(`Intensity: ${parsed.intensity}`);
  }
  if (parsed.strides) {
    descParts.push(`Strides: ${parsed.strides}`);
  }
  if (parsed.terrain && parsed.terrain !== "any") {
    descParts.push(`Terrain: ${parsed.terrain}`);
  }
  const description = descParts.join(" · ");

  return {
    id: sessionId,
    weekId,
    sortOrder: 9999,
    dayLabel,
    type: "functional" as const,
    name,
    description,
    tags: [displayActivity, displaySubtype, parsed.intensity].filter((v): v is string => Boolean(v)),
    duration: parsed.duration || "",
    intensity: parsed.intensity || "",
    isKeySession: false,
    exercises: [],
    activity: displayActivity || undefined,
    subtype: displaySubtype || undefined,
    sourceSessionTemplateId: null,
    sourceSessionTemplateType: null,
    sourceSessionTemplateSubtype: displaySubtype || null,
    sourceSessionTemplateActivity: displayActivity || null,
    sourceSessionTemplateDurationMinutes: null,
    sourceSessionTemplateDistanceKm: null,
    sourceSessionTemplateTargetIntensity: parsed.intensity || null,
    sourceSessionTemplateIsKeySession: false,
    sourceSessionTemplateFocusArea: null,
    sourceSessionTemplateGoal: null,
    alternativeSessionTemplateId: null,
    alternativeSessionTemplateName: null,
    alternativeSessionTemplateReason: null,
    alternativeIncluded: false,
    alternativeDismissed: false,
  };
}

async function buildSessionFromSupabaseTemplate(
  templateId: string | null,
  weekId: string,
  dayLabel: string,
  slotName?: string,
  notes?: string | null,
): Promise<EditablePlanSession | null> {
  // Handle ad hoc sessions (null templateId)
  if (!templateId) {
    return buildAdHocSession(slotName || "", notes || null, weekId, dayLabel);
  }

  const sb = createClient();
  const { data, error } = await sb
    .from("session_templates")
    .select(
      "id, name, description, type, activity, subtype, duration_minutes, distance_km, target_intensity, session_data, is_key_session, focus_area, goal",
    )
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as SessionTemplateRow;
  const sessionId = buildClientId("session");

  return {
    id: sessionId,
    weekId,
    sortOrder: 9999,
    dayLabel,
    type: mapTemplateToPlanSessionType(row),
    name: row.name ?? formatOptionLabel(row.subtype) ?? "",
    description:
      row.type === "functional" ? buildFunctionalDescription(row) : row.description ?? "",
    tags: [
      ...(row.type ? [row.type] : []),
      ...(row.activity ? [formatOptionLabel(row.activity)] : []),
      ...(row.subtype ? [formatOptionLabel(row.subtype)] : []),
      ...((row.session_data as any)?.tags ?? []),
      ...((row.session_data as any)?.time_of_day ? [((row.session_data as any).time_of_day as string).toLowerCase()] : []),
    ],
    duration: row.duration_minutes != null ? `${row.duration_minutes} min` : "",
    intensity: row.target_intensity ?? "",
    isKeySession: !!row.is_key_session,
    exercises: await buildExercisesFromSupabaseTemplate(templateId, sessionId),
    activity: row.activity ?? undefined,
    subtype: row.subtype ?? undefined,
    sourceSessionTemplateId: row.id,
    sourceSessionTemplateType: row.type ?? null,
    sourceSessionTemplateSubtype: row.subtype ?? null,
    sourceSessionTemplateActivity: row.activity ?? null,
    sourceSessionTemplateDurationMinutes: row.duration_minutes ?? null,
    sourceSessionTemplateDistanceKm: row.distance_km ?? null,
    sourceSessionTemplateTargetIntensity: row.target_intensity ?? null,
    sourceSessionTemplateIsKeySession: row.is_key_session ?? false,
    sourceSessionTemplateFocusArea: row.focus_area ?? null,
    sourceSessionTemplateGoal: row.goal ?? null,
    alternativeSessionTemplateId: null,
    alternativeSessionTemplateName: null,
    alternativeSessionTemplateReason: null,
    alternativeIncluded: false,
    alternativeDismissed: false,
  };
}

function coerceSavedPlanJsonToGeneratedPlan(
  rawPlanJson: unknown,
  fallbackName: string,
): GeneratedPlan | null {
  if (!rawPlanJson || typeof rawPlanJson !== "object") {
    return null;
  }

  const maybePlan = rawPlanJson as Partial<GeneratedPlan>;
  if (Array.isArray(maybePlan.weeks)) {
    return {
      ...maybePlan,
      name: (maybePlan as any).name ?? fallbackName,
      warnings: maybePlan.warnings ?? [],
      weeks: (maybePlan.weeks ?? []).map((week) => ({
        ...week,
        sessions: week.sessions ?? [],
      })),
    } as GeneratedPlan;
  }

  const maybeCyclePlan = rawPlanJson as CycleBuilderPlanJson;
  if (!Array.isArray(maybeCyclePlan.cycles)) {
    return null;
  }

  const flattenedWeeks = maybeCyclePlan.cycles.flatMap((cycle) => cycle.weeks ?? []);
  const now = new Date().toISOString();

  return {
    id: buildClientId("plan"),
    eventName: fallbackName || "Plan in progress",
    eventDate: "",
    weeksAvailable: flattenedWeeks.length,
    trainingDaysPerWeek: 5,
    createdAt: now,
    updatedAt: now,
    warnings: [],
    weeks: flattenedWeeks.map((week, index) => {
      const focusValue =
        typeof week.focus === "string" ? week.focus : week.focus?.name ?? "";

      return {
        id: `week-${index + 1}`,
        weekNumber: week.weekNumber ?? index + 1,
        focus: focusValue,
        notes: "",
        sessions: [],
        planId: buildClientId("plan"),
        sortOrder: index + 1,
        phase: "Base",
        isHolidayWeek: false,
      };
    }),
  };
}

function buildNewBlankWeek(plan: GeneratedPlan) {
  const lastWeekNumber = Math.max(...plan.weeks.map((week) => week.weekNumber), 0);
  const nextWeekNumber = lastWeekNumber + 1;

  return {
    id: buildClientId(`week-${nextWeekNumber}`),
    weekNumber: nextWeekNumber,
    focus: "",
    notes: "",
    sessions: [] as PlanSession[],
    planId: plan.id,
    sortOrder: nextWeekNumber,
    phase: "Base" as const,
    isHolidayWeek: false,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asSingleWeekFocus(
  value:
    | { id: string; name: string; color: string | null }
    | { id: string; name: string; color: string | null }[]
    | null,
) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default function PlanEditorPage() {
  const supabase = createClient();
  const params = useParams();
  const rawPlanId = params?.planId;
  const planId =
    typeof rawPlanId === "string"
      ? rawPlanId
      : Array.isArray(rawPlanId)
        ? rawPlanId[0]
        : "";

  const [loading, setLoading] = useState(true);
  const [savingToAthlete, setSavingToAthlete] = useState(false);
  const [searchingTemplates, setSearchingTemplates] = useState(false);
  const [hydratingAlternatives, setHydratingAlternatives] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    const saved = localStorage.getItem("autoAddPostRunRecovery");
    if (saved === "true") {
      setAutoAddPostRunRecovery(true);
    }
  }, []);

  const [planRow, setPlanRow] = useState<AthletePlanRow | null>(null);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [history, setHistory] = useState<AthletePlanSnapshotRow[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [pendingSessionSlot, setPendingSessionSlot] = useState<PendingSessionSlot | null>(null);
  const [pendingSessionType, setPendingSessionType] = useState<"gym" | "functional" | "mobility" | null>(null);
  const [creatingBlankSessionWeekId, setCreatingBlankSessionWeekId] = useState<string | null>(null);
  const [autoAddPostRunRecovery, setAutoAddPostRunRecovery] = useState(false);
  const [sessionTemplateSearch, setSessionTemplateSearch] = useState("");
  const [sessionTemplateResults, setSessionTemplateResults] = useState<SessionTemplateRow[]>([]);
  const [adHocMode, setAdHocMode] = useState<"search" | "create">("search");
  const [snapshotName, setSnapshotName] = useState("");
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);
  const [weekFocusTypes, setWeekFocusTypes] = useState<WeekFocusTypeRow[]>([]);
  const [activeTab, setActiveTab] = useState<"plan" | "warnings" | "versions">("plan");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [athleteContext, setAthleteContext] = useState<AthleteContextRow | null>(null);
  const [trainingCamps, setTrainingCamps] = useState<TrainingCamp[]>([]);
  const [athleteEvents, setAthleteEvents] = useState<Array<any>>([]);
  const [prepRaces, setPrepRaces] = useState<Array<{ date: string; race_name: string }>>([]);
  const [equipmentConflictAlternatives, setEquipmentConflictAlternatives] = useState<Record<string, any[]>>({});
  const [pairedMobilitySessions, setPairedMobilitySessions] = useState<Array<any>>([]);
  const [allMobilitySessions, setAllMobilitySessions] = useState<Array<any>>([]);

  function toggleWeekExpanded(weekId: string) {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekId)) {
      newExpanded.delete(weekId);
    } else {
      newExpanded.add(weekId);
    }
    setExpandedWeeks(newExpanded);
  }

  function deriveConditionKeys(ctx: AthleteContextRow): string[] {
    const keys: string[] = [];
    if (!ctx.available_gym_days?.length) keys.push("no_gym");
    if (ctx.event_profile?.heatAccess || ctx.event_profile?.saunaAccess) keys.push("heat");
    if (ctx.event_profile?.packTraining) keys.push("load_carriage");
    if (ctx.event_profile?.sandAccess) keys.push("sand");
    return keys;
  }

  function deriveEquipmentUnavailable(ctx: AthleteContextRow | null): string[] {
    if (!ctx) return [];
    return (ctx.athlete_equipment_unavailable ?? [])
      .map((row) => row.equipment_options?.slug)
      .filter((s): s is string => Boolean(s));
  }

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
  }

  function getPrepRaceConflict(weekNumber: number, dayLabel: string | null | undefined): { race_name: string } | null {
    if (!dayLabel || !plan || !plan.startDate) return null;

    // Map day labels to offsets
    const dayMap: Record<string, number> = {
      "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
      "Friday": 4, "Saturday": 5, "Sunday": 6,
    };

    const dayOffset = dayMap[dayLabel.trim()];
    if (dayOffset === undefined) return null;

    // Calculate session date
    const weekStart = addDaysToIso(plan.startDate, (weekNumber - 1) * 7);
    const sessionDateStr = addDaysToIso(weekStart, dayOffset);

    // Check if any prep race is on this date
    const race = prepRaces.find((r) => r.date === sessionDateStr);
    return race ? { race_name: race.race_name } : null;
  }

  async function loadWeekFocusTypes() {
    const { data, error } = await supabase
      .from("week_focus_types")
      .select("id, name, display_order, color")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      showTemporaryStatus(`Could not load week focus types: ${error.message}`, 4000);
      return;
    }

    setWeekFocusTypes((data ?? []) as WeekFocusTypeRow[]);
  }

  async function loadPlanAndHistory() {
    const { data, error } = await supabase
      .from("athlete_plans")
      .select(
        "id, athlete_user_id, coach_user_id, source_program_template_id, event_id, name, plan_json, status, created_at, updated_at",
      )
      .eq("id", planId)
      .maybeSingle();

    if (error || !data) {
      showTemporaryStatus(`Could not load plan: ${error?.message || "Not found"}`, 4000);
      setLoading(false);
      return;
    }

    const typedPlan = data as AthletePlanRow;
    const parsedPlan = coerceSavedPlanJsonToGeneratedPlan(typedPlan.plan_json, typedPlan.name);

    if (!parsedPlan) {
      showTemporaryStatus("Saved plan format is not recognised.", 4000);
      setLoading(false);
      return;
    }

    setPlanRow(typedPlan);
    setPlan(parsedPlan);

    const { data: snapshotData, error: snapshotError } = await supabase
      .from("athlete_plan_snapshots")
      .select("id, athlete_user_id, athlete_plan_id, name, plan_json, created_at")
      .eq("athlete_plan_id", planId)
      .order("created_at", { ascending: false });

    if (!snapshotError) {
      setHistory((snapshotData ?? []) as AthletePlanSnapshotRow[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadWeekFocusTypes();
    void loadPlanAndHistory();
  }, [planId]);

  useEffect(() => {
    async function loadEquipmentConflictAlternatives() {
      if (!plan || !athleteContext) return;

      const unavailableEquipment = deriveEquipmentAvoid(athleteContext);
      if (unavailableEquipment.length === 0) {
        setEquipmentConflictAlternatives({});
        return;
      }

      const alternatives: Record<string, any[]> = {};

      // First, enrich exercises with equipment data if missing
      const exerciseIdsNeeded = new Set<string>();
      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          for (const exercise of session.exercises) {
            const ex = exercise as any;
            if (ex.exerciseId && !ex.equipment) {
              exerciseIdsNeeded.add(ex.exerciseId);
            }
          }
        }
      }

      // Batch-fetch equipment data for exercises that need it
      const equipmentByExerciseId = new Map<string, string[]>();
      if (exerciseIdsNeeded.size > 0) {
        try {
          const { data: exercises, error } = await supabase
            .from("exercises")
            .select("id, equipment")
            .in("id", Array.from(exerciseIdsNeeded));

          if (error) {
            console.error("Error fetching exercises:", error);
          } else if (exercises) {
            for (const ex of exercises) {
              equipmentByExerciseId.set(ex.id, ex.equipment || []);
            }
          }
        } catch (err) {
          console.error("Exception fetching exercises:", err);
        }
      }

      // Scan all sessions for exercises that conflict with unavailable equipment
      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          for (const exercise of session.exercises) {
            const ex = exercise as any;
            let equipment = ex.equipment || [];

            // Fill in equipment from database if not in plan
            if (equipment.length === 0 && ex.exerciseId && equipmentByExerciseId.has(ex.exerciseId)) {
              equipment = equipmentByExerciseId.get(ex.exerciseId) || [];
            }

            // Check if this exercise has unavailable equipment
            const hasConflict = equipment.some((eq: string) => unavailableEquipment.includes(eq));

            if (hasConflict && ex.exerciseId) {
              // Load alternatives for this exercise if we haven't already
              if (!alternatives[ex.exerciseId]) {
                try {
                  const alts = await findAlternativesForPicker(ex.exerciseId, {
                    unavailableEquipment,
                    avoidEquipment: [],
                  }, supabase);
                  alternatives[ex.exerciseId] = alts;
                } catch (err) {
                  console.error(`Failed to load alternatives for ${ex.exerciseId}:`, err);
                  alternatives[ex.exerciseId] = [];
                }
              }
            }
          }
        }
      }

      setEquipmentConflictAlternatives(alternatives);
    }

    void loadEquipmentConflictAlternatives();
  }, [plan, athleteContext]);

  useEffect(() => {
    async function loadAthleteContext() {
      if (!planRow) return;
      const { data, error } = await supabase
        .from("athlete_profiles")
        .select(`
          baseline_fitness,
          available_run_days,
          available_gym_days,
          preferred_long_session_day,
          event_profile,
          holiday_equipment_unavailable,
          athlete_equipment_unavailable(equipment_options(slug))
        `)
        .eq("user_id", planRow.athlete_user_id)
        .maybeSingle();

      if (!error && data) {
        setAthleteContext(data as unknown as AthleteContextRow);
      }
    }

    void loadAthleteContext();
  }, [planRow]);

  useEffect(() => {
    async function loadMobilitySessions() {
      const { data, error } = await supabase
        .from("mobility_sessions")
        .select("id, name, description, duration_minutes")
        .order("name");

      if (!error && data) {
        setAllMobilitySessions(data);
      }
    }

    void loadMobilitySessions();
  }, []);

  useEffect(() => {
    async function loadPairedMobilitySessions() {
      const { data, error } = await supabase
        .from("mobility_session_pairs")
        .select("id, session_template_id, auto_add_enabled, mobility_sessions(id, name, description, duration_minutes)");

      if (!error && data) {
        setPairedMobilitySessions(data);
      }
    }

    void loadPairedMobilitySessions();
  }, []);

  useEffect(() => {
    async function loadTrainingCampsAndEvents() {
      if (!planRow) return;
      const { data, error } = await supabase
        .from("training_camps")
        .select("*")
        .eq("athlete_user_id", planRow.athlete_user_id)
        .order("start_date", { ascending: true });

      if (!error && data) {
        setTrainingCamps((data || []) as TrainingCamp[]);
      }

      // Fetch athlete events (holidays)
      const { data: eventsData } = await supabase
        .from("athlete_events")
        .select("*")
        .eq("athlete_user_id", planRow.athlete_user_id)
        .eq("event_type", "holiday")
        .order("start_date", { ascending: true });

      if (eventsData) {
        setAthleteEvents(eventsData);
      }

      // Fetch prep races from athlete race history
      const { data: raceHistoryData } = await supabase
        .from("athlete_race_history")
        .select("preparation_races(race_event_date, race_name)")
        .eq("athlete_user_id", planRow.athlete_user_id);

      if (raceHistoryData && Array.isArray(raceHistoryData)) {
        const races = raceHistoryData
          .flatMap((row: any) => row.preparation_races || [])
          .filter((race: any) => race.race_event_date && race.race_name)
          .map((race: any) => ({
            date: race.race_event_date,
            race_name: race.race_name,
          }));
        setPrepRaces(races);
      }
    }

    void loadTrainingCampsAndEvents();
  }, [planRow]);

  useEffect(() => {
    // Calculate warnings when plan loads, content changes, or when athleteContext becomes available
    if (plan) {
      const athleteEquipmentAvoid = deriveEquipmentAvoid(athleteContext);
      const athleteEquipmentUnavailable = deriveEquipmentUnavailable(athleteContext);
      const newWarnings = calculateAllWarnings(plan, athleteEquipmentUnavailable, athleteEquipmentAvoid);

      // Transform warnings to add 'type' field for backward compatibility with warnings page
      const transformedWarnings = newWarnings.map((w: any) => ({
        ...w,
        type: w.severity, // Map severity to type for display compatibility
      })) as any[];

      // Only update if warnings actually changed to avoid unnecessary renders
      const warningsChanged = JSON.stringify(plan.warnings) !== JSON.stringify(transformedWarnings);
      if (warningsChanged) {
        setPlan({
          ...plan,
          warnings: transformedWarnings,
        });
      }
    }
    // Include week structure in dependencies to detect when weeks are modified
  }, [plan?.id, plan?.weeks?.length, plan?.weeks?.[0]?.phase, athleteContext, prepRaces]); // Recalculate when plan structure/phase changes or prep races updated

  useEffect(() => {
    if (!pendingSessionSlot) {
      setSessionTemplateResults([]);
      setSearchingTemplates(false);
      return;
    }

    const trimmed = sessionTemplateSearch.trim();
    if (!trimmed) {
      setSessionTemplateResults([]);
      setSearchingTemplates(false);
      return;
    }

    void searchSessionTemplates(trimmed);
  }, [sessionTemplateSearch, pendingSessionSlot]);

  useEffect(() => {
    async function hydrateMissingAlternatives() {
      if (!plan || hydratingAlternatives) return;

      const sessionsNeedingSuggestion: Array<{
        weekId: string;
        sessionId: string;
        templateId: string;
      }> = [];

      for (const week of plan.weeks) {
        for (const session of week.sessions) {
          const editableSession = session as EditablePlanSession;

          if (
            editableSession.sourceSessionTemplateId &&
            !editableSession.isInsertedAlternative &&
            !editableSession.alternativeSessionTemplateId &&
            !editableSession.alternativeIncluded &&
            !editableSession.alternativeDismissed
          ) {
            sessionsNeedingSuggestion.push({
              weekId: week.id,
              sessionId: session.id,
              templateId: editableSession.sourceSessionTemplateId,
            });
          }
        }
      }

      if (sessionsNeedingSuggestion.length === 0) return;

      setHydratingAlternatives(true);

      try {
        let nextPlan: GeneratedPlan = plan;
        let changed = false;

        for (const target of sessionsNeedingSuggestion) {
          const bestAlternative = await findBestAlternativeForTemplate(target.templateId);

          if (!bestAlternative) continue;

          changed = true;

          nextPlan = {
            ...nextPlan,
            weeks: nextPlan.weeks.map((week) => ({
              ...week,
              sessions: week.sessions.map((session) => {
                if (week.id !== target.weekId || session.id !== target.sessionId) {
                  return session;
                }

                const editableSession = session as EditablePlanSession;

                return {
                  ...editableSession,
                  alternativeSessionTemplateId: bestAlternative.id,
                  alternativeSessionTemplateName: bestAlternative.name ?? null,
                  alternativeSessionTemplateReason: bestAlternative.replacementReason ?? null,
                  alternativeIncluded: false,
                  alternativeDismissed: false,
                };
              }),
            })),
          };
        }

        if (changed) {
          setPlan(nextPlan);
        }
      } finally {
        setHydratingAlternatives(false);
      }
    }

    void hydrateMissingAlternatives();
  }, [plan, hydratingAlternatives]);

  async function searchSessionTemplates(searchTerm: string) {
    const trimmed = searchTerm.trim();

    if (!trimmed) {
      setSearchingTemplates(false);
      setSessionTemplateResults([]);
      return;
    }

    setSearchingTemplates(true);

    const escaped = trimmed.replace(/,/g, " ").replace(/%/g, "").replace(/\*/g, "").trim();

    const { data, error } = await supabase
      .from("session_templates")
      .select(
        "id, name, description, type, activity, subtype, duration_minutes, distance_km, target_intensity, session_data, is_key_session, focus_area, goal",
      )
      .or(
        `name.ilike.%${escaped}%,description.ilike.%${escaped}%,type.ilike.%${escaped}%,activity.ilike.%${escaped}%,subtype.ilike.%${escaped}%,target_intensity.ilike.%${escaped}%`,
      )
      .order("name", { ascending: true })
      .limit(10);

    setSearchingTemplates(false);

    if (error) {
      setSessionTemplateResults([]);
      showTemporaryStatus(`Could not search session templates: ${error.message}`, 4000);
      return;
    }

    setSessionTemplateResults((data ?? []) as SessionTemplateRow[]);
  }

  async function persistPlan(nextPlan: GeneratedPlan): Promise<void> {
    if (!planRow) return;

    setSavingToAthlete(true);

    const { data, error } = await supabase
      .from("athlete_plans")
      .update({
        name: planRow?.name || nextPlan.eventName,
        plan_json: nextPlan,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planRow.id)
      .select(
        "id, athlete_user_id, coach_user_id, source_program_template_id, event_id, name, plan_json, status, created_at, updated_at",
      )
      .maybeSingle();

    setSavingToAthlete(false);

    if (error) {
      showTemporaryStatus(`Failed to save plan: ${error.message}`, 4000);
      return;
    }

    if (data) {
      setPlanRow(data as AthletePlanRow);

      // Send notification to athlete if plan is active and has been modified
      if (data.status === "active" && plan) {
        const sessionCountChanged =
          plan.weeks.reduce((acc, w) => acc + w.sessions.length, 0) !==
          nextPlan.weeks.reduce((acc, w) => acc + w.sessions.length, 0);

        if (sessionCountChanged) {
          await supabase
            .from("notifications")
            .insert({
              athlete_user_id: planRow.athlete_user_id,
              coach_user_id: planRow.coach_user_id,
              type: "plan_update",
              title: "Your Training Plan Was Updated",
              message: `Coach has updated your active training plan "${planRow.name || nextPlan.eventName}". Please check the latest sessions.`,
              metadata: {
                plan_id: planRow.id,
                plan_name: planRow.name || nextPlan.eventName,
              },
            });
        }
      }
    }
  }

  async function updatePlan(nextPlan: GeneratedPlan) {
    const athleteEquipmentAvoid = deriveEquipmentAvoid(athleteContext);
    const athleteEquipmentUnavailable = deriveEquipmentUnavailable(athleteContext);
    const newWarnings = calculateAllWarnings(nextPlan, athleteEquipmentUnavailable, athleteEquipmentAvoid);

    // Transform warnings to add 'type' field for backward compatibility with warnings page
    const allWarnings = newWarnings.map((w: any) => ({
      ...w,
      type: w.severity, // Map severity to type for display compatibility
    })) as any[];

    const recalculated: GeneratedPlan = {
      ...nextPlan,
      warnings: allWarnings as any,
      updatedAt: new Date().toISOString(),
    };

    setPlan(recalculated);
    await persistPlan(recalculated);
  }

  function recalculateWarningsOnly() {
    if (!plan) return;
    void updatePlan(plan);
    showTemporaryStatus("Warnings recalculated.", 2000);
  }

  async function saveVersion() {
    if (!plan || !planRow) return;

    const trimmedSnapshotName = snapshotName.trim();
    if (!trimmedSnapshotName) {
      showTemporaryStatus("Please enter a version name before saving.", 2500);
      return;
    }

    const athleteEquipmentAvoid = deriveEquipmentAvoid(athleteContext);
    const athleteEquipmentUnavailable = deriveEquipmentUnavailable(athleteContext);
    const newWarnings = calculateAllWarnings(plan, athleteEquipmentUnavailable, athleteEquipmentAvoid);

    // Transform warnings to add 'type' field for backward compatibility with warnings page
    const allWarnings = newWarnings.map((w: any) => ({
      ...w,
      type: w.severity, // Map severity to type for display compatibility
    })) as any[];

    const recalculated: GeneratedPlan = {
      ...plan,
      warnings: allWarnings as any,
      updatedAt: new Date().toISOString(),
    };

    setPlan(recalculated);

    const { error } = await supabase.from("athlete_plan_snapshots").insert({
      athlete_user_id: planRow.athlete_user_id,
      athlete_plan_id: planRow.id,
      name: trimmedSnapshotName,
      plan_json: recalculated,
    });

    if (error) {
      showTemporaryStatus(`Could not save version: ${error.message}`, 4000);
      return;
    }

    setSnapshotName("");
    await loadPlanAndHistory();
    showTemporaryStatus("Version saved.", 2000);
  }

  function revertToLatestSaved() {
    if (!planRow?.plan_json) return;

    const parsedPlan = coerceSavedPlanJsonToGeneratedPlan(
      planRow.plan_json,
      planRow.name ?? "Plan in progress",
    );

    if (!parsedPlan) {
      showTemporaryStatus("Saved plan format is not recognised.", 3000);
      return;
    }

    setPlan(parsedPlan);
    setSnapshotName("");
    setPendingSessionSlot(null);
    setSessionTemplateSearch("");
    setSessionTemplateResults([]);
    showTemporaryStatus("Reverted to latest saved plan.", 2000);
  }

  async function loadHistoryItem(snapshotId: string) {
    const selected = history.find((item) => item.id === snapshotId);
    if (!selected) return;

    const parsedPlan = coerceSavedPlanJsonToGeneratedPlan(
      selected.plan_json,
      selected.name ?? "Saved version",
    );

    if (!parsedPlan) {
      showTemporaryStatus("Saved version format is not recognised.", 3000);
      return;
    }

    setPlan(parsedPlan);
    setSnapshotName(selected.name ?? "");
    await persistPlan(parsedPlan);
    showTemporaryStatus("Loaded saved version.", 2000);
  }

  async function deleteVersion(snapshotId: string) {
    const selected = history.find((item) => item.id === snapshotId);
    if (!selected) return;

    const confirmed = window.confirm(
      `Delete saved version "${selected.name || "Saved version"}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    const { error } = await supabase.from("athlete_plan_snapshots").delete().eq("id", snapshotId);

    if (error) {
      showTemporaryStatus(`Could not delete version: ${error.message}`, 4000);
      return;
    }

    setHistory((currentHistory) =>
      currentHistory.filter((snapshot) => snapshot.id !== snapshotId),
    );
    showTemporaryStatus("Saved version deleted.", 2500);
  }

  function addBlankWeekToEnd() {
    if (!plan) return;

    const newWeek = buildNewBlankWeek(plan);
    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: [...plan.weeks, newWeek],
    };

    void updatePlan(nextPlan);
    showTemporaryStatus(`Week ${newWeek.weekNumber} added.`, 2000);
  }

  function addBlankWeekAtStart() {
    if (!plan) return;

    const newWeek = {
      id: buildClientId("week-new"),
      weekNumber: 1,
      focus: "",
      notes: "",
      sessions: [] as PlanSession[],
      planId: plan.id,
      sortOrder: 1,
      phase: "Base" as const,
      isHolidayWeek: false,
    };

    const weeksWithNew = [newWeek, ...plan.weeks].map((w, i) => ({
      ...w,
      weekNumber: i + 1,
      sessions: w.sessions.map((s) => ({ ...s, weekId: w.id })),
    }));

    void updatePlan({ ...plan, weeks: weeksWithNew });
    showTemporaryStatus("Blank week added at start.", 2000);
  }

  function addBlankWeekAfter(afterWeekId: string) {
    if (!plan) return;

    const afterIndex = plan.weeks.findIndex((w) => w.id === afterWeekId);
    const insertIndex = afterIndex === -1 ? plan.weeks.length : afterIndex + 1;

    const newWeek = {
      id: buildClientId("week-new"),
      weekNumber: insertIndex + 1,
      focus: "",
      notes: "",
      sessions: [] as PlanSession[],
      planId: plan.id,
      sortOrder: insertIndex + 1,
      phase: "Base" as const,
      isHolidayWeek: false,
    };

    const weeksWithNew = [
      ...plan.weeks.slice(0, insertIndex),
      newWeek,
      ...plan.weeks.slice(insertIndex),
    ].map((w, i) => ({
      ...w,
      weekNumber: i + 1,
      sessions: w.sessions.map((s) => ({ ...s, weekId: w.id })),
    }));

    void updatePlan({ ...plan, weeks: weeksWithNew });
    showTemporaryStatus(`Blank week inserted after Week ${afterIndex + 1}.`, 2000);
  }

  function deleteWeek(weekId: string) {
    if (!plan) return;

    const weekToDelete = plan.weeks.find((week) => week.id === weekId);
    if (!weekToDelete) return;

    const confirmed = window.confirm(
      `Delete Week ${weekToDelete.weekNumber}? This will remove all sessions in that week.`,
    );

    if (!confirmed) return;

    const remainingWeeks = plan.weeks
      .filter((week) => week.id !== weekId)
      .map((week, index) => ({
        ...week,
        weekNumber: index + 1,
        sessions: week.sessions.map((session) => ({
          ...session,
          weekId: week.id,
        })),
      }));

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: remainingWeeks,
    };

    void updatePlan(nextPlan);
    showTemporaryStatus(`Week ${weekToDelete.weekNumber} deleted.`, 2000);
  }

  // Maps intake lowercase full-day names to the short labels used in plan sessions
  const dayNameToLabel: Record<string, string> = {
    monday: "Mon", tuesday: "Tue", wednesday: "Wed",
    thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
  };

  /**
   * Returns the athlete's available run days as short labels (e.g. ["Mon","Wed","Thu"]),
   * ordered with the preferred long session day first.
   * Falls back to a sensible default if the athlete context hasn't loaded yet.
   */
  function getAthleteRunDays(): string[] {
    const raw = athleteContext?.available_run_days ?? null;
    if (!raw || raw.length === 0) return ["Mon", "Wed", "Sat"];

    const labels = raw
      .map((d) => dayNameToLabel[d.toLowerCase()] ?? null)
      .filter((d): d is string => d !== null);

    // Put the preferred long day first if present
    const longDay = athleteContext?.preferred_long_session_day
      ? dayNameToLabel[athleteContext.preferred_long_session_day.toLowerCase()]
      : null;

    if (longDay && labels.includes(longDay)) {
      return [longDay, ...labels.filter((d) => d !== longDay)];
    }

    return labels;
  }

  /**
   * Pick the best available day for a new session in the given week.
   * Uses the athlete's intake run-day preferences; picks the first available day
   * not already occupied in this week. Wraps around if all days are taken.
   */
  function autoAssignDay(weekId: string): string {
    const preferred = getAthleteRunDays();
    if (!plan) return preferred[0] ?? "Mon";
    const week = plan.weeks.find((w) => w.id === weekId);
    const usedDays = new Set((week?.sessions ?? []).map((s) => s.dayLabel).filter(Boolean));
    return preferred.find((d) => !usedDays.has(d)) ?? preferred[0] ?? "Mon";
  }

  function createSession(weekId: string) {
    const dayLabel = autoAssignDay(weekId);
    setPendingSessionSlot({ weekId, dayLabel });
    setSessionTemplateSearch("");
    setSessionTemplateResults([]);
    setSearchingTemplates(false);
  }

  async function openTemplateSessionPicker(weekId: string, sessionType: "gym" | "functional" | "mobility") {
    const dayLabel = autoAssignDay(weekId);
    setPendingSessionSlot({ weekId, dayLabel });
    setPendingSessionType(sessionType);
    setSessionTemplateSearch("");
    setSessionTemplateResults([]);
    setSearchingTemplates(true);

    // Load session templates of the specified type when picker opens
    const { data, error } = await supabase
      .from("session_templates")
      .select("id, name, type, subtype, description, duration_minutes, distance_km, target_intensity, is_key_session")
      .eq("type", sessionType === "gym" ? "Gym" : "Functional")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setSessionTemplateResults(data as SessionTemplateRow[]);
    }
  }

  function cancelPendingSession() {
    setPendingSessionSlot(null);
    setPendingSessionType(null);
    setSessionTemplateSearch("");
    setSessionTemplateResults([]);
    setSearchingTemplates(false);
    setAdHocMode("search");
  }

  async function createAdHocSession(templateId: string) {
    if (!plan || !pendingSessionSlot) return;

    const nextSession = await buildSessionFromSupabaseTemplate(
      templateId,
      pendingSessionSlot.weekId,
      pendingSessionSlot.dayLabel,
    );

    if (!nextSession) {
      showTemporaryStatus("Session template saved but could not build plan session.", 3000);
      return;
    }

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) =>
        week.id === pendingSessionSlot.weekId
          ? { ...week, sessions: [...week.sessions, nextSession] }
          : week,
      ),
    };

    await updatePlan(nextPlan);
    cancelPendingSession();
    showTemporaryStatus(`"${nextSession.name}" added and saved as a session template.`, 2500);
  }

  async function createSessionFromTemplate(templateId: string) {
    if (!plan || !pendingSessionSlot) return;

    const nextSession = await buildSessionFromSupabaseTemplate(
      templateId,
      pendingSessionSlot.weekId,
      pendingSessionSlot.dayLabel,
    );

    if (!nextSession) {
      showTemporaryStatus("Could not load that session template.", 3000);
      return;
    }

    const bestAlternative = await findBestAlternativeForTemplate(templateId);

    const sessionWithAlternative: EditablePlanSession = {
      ...nextSession,
      alternativeSessionTemplateId: bestAlternative?.id ?? null,
      alternativeSessionTemplateName: bestAlternative?.name ?? null,
      alternativeSessionTemplateReason: bestAlternative?.replacementReason ?? null,
      alternativeIncluded: false,
      alternativeDismissed: false,
    };

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) =>
        week.id === pendingSessionSlot.weekId
          ? { ...week, sessions: [...week.sessions, sessionWithAlternative] }
          : week,
      ),
    };

    await updatePlan(nextPlan);
    cancelPendingSession();

    showTemporaryStatus(
      bestAlternative
        ? `${nextSession.name} added. Alternative suggested.`
        : `${nextSession.name} added.`,
      1800,
    );
  }

  function createBlankEasySession() {
    if (!plan || !pendingSessionSlot) return;

    const newSession: EditablePlanSession = {
      id: buildClientId("session"),
      weekId: pendingSessionSlot.weekId,
      sortOrder: 9999,
      dayLabel: pendingSessionSlot.dayLabel,
      type: "Easy",
      name: "",
      description: "",
      tags: [],
      duration: "",
      intensity: "",
      isKeySession: false,
      exercises: [],
      sourceSessionTemplateId: null,
      sourceSessionTemplateType: null,
      sourceSessionTemplateSubtype: null,
      sourceSessionTemplateActivity: null,
      sourceSessionTemplateDurationMinutes: null,
      sourceSessionTemplateDistanceKm: null,
      sourceSessionTemplateTargetIntensity: null,
      sourceSessionTemplateIsKeySession: false,
      sourceSessionTemplateFocusArea: null,
      sourceSessionTemplateGoal: null,
      alternativeSessionTemplateId: null,
      alternativeSessionTemplateName: null,
      alternativeSessionTemplateReason: null,
      alternativeIncluded: false,
      alternativeDismissed: false,
    };

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) =>
        week.id === pendingSessionSlot.weekId
          ? { ...week, sessions: [...week.sessions, newSession] }
          : week,
      ),
    };

    void updatePlan(nextPlan);
    cancelPendingSession();
    showTemporaryStatus("Blank session added.", 1500);
  }

  function deleteSession(sessionId: string) {
    if (!plan) return;

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.filter((session) => session.id !== sessionId),
      })),
    };

    void updatePlan(nextPlan);
    showTemporaryStatus("Session deleted.", 1500);
  }

  async function includeAlternative(sessionId: string) {
    if (!plan) return;

    let targetWeekId: string | null = null;
    let baseSession: EditablePlanSession | null = null;

    for (const week of plan.weeks) {
      const found = week.sessions.find((session) => session.id === sessionId);
      if (found) {
        targetWeekId = week.id;
        baseSession = found as EditablePlanSession;
        break;
      }
    }

    if (!targetWeekId || !baseSession) return;

    if (!baseSession.alternativeSessionTemplateId) {
      showTemporaryStatus("No linked alternative is configured for this session.", 3000);
      return;
    }

    const builtAlternativeSession = await buildSessionFromSupabaseTemplate(
      baseSession.alternativeSessionTemplateId,
      targetWeekId,
      baseSession.dayLabel,
    );

    if (!builtAlternativeSession) {
      showTemporaryStatus("Could not load the configured alternative session.", 3000);
      return;
    }

    const alternativeSession: EditablePlanSession = {
      ...builtAlternativeSession,
      sortOrder: baseSession.sortOrder + 0.5,
      alternativeSessionTemplateReason: baseSession.alternativeSessionTemplateReason ?? null,
      alternativeIncluded: false,
      alternativeDismissed: false,
      isInsertedAlternative: true,
      parentSessionId: baseSession.id,
      alternativeSessionTemplateId: null,
      alternativeSessionTemplateName: null,
    };

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) => {
        if (week.id !== targetWeekId) return week;

        const sessionIndex = week.sessions.findIndex((session) => session.id === sessionId);
        if (sessionIndex === -1) return week;

        const nextSessions = [...week.sessions];

        nextSessions[sessionIndex] = {
          ...(nextSessions[sessionIndex] as EditablePlanSession),
          alternativeIncluded: true,
        } as EditablePlanSession;

        nextSessions.splice(sessionIndex + 1, 0, alternativeSession);

        return {
          ...week,
          sessions: nextSessions,
        };
      }),
    };

    await updatePlan(nextPlan);
    showTemporaryStatus(
      `Added alternative session: ${alternativeSession.name || "Alternative session"}.`,
      2000,
    );
  }

  function swapExercise(weekId: string, sessionId: string, exerciseId: string, alternativeExercise: any) {
    if (!plan || !weekId) return;

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) => {
        if (week.id !== weekId) return week;

        return {
          ...week,
          sessions: week.sessions.map((session) => {
            if (session.id !== sessionId) return session;

            return {
              ...session,
              exercises: session.exercises.map((exercise) => {
                // Match by database exerciseId
                const ex = exercise as any;
                if (ex.exerciseId !== exerciseId) return exercise;

                return {
                  ...exercise,
                  id: `exercise-${alternativeExercise.id}`,
                  name: alternativeExercise.name,
                  equipment: alternativeExercise.equipment || [],
                  equipmentConflict: undefined,
                  swappedFromExerciseId: ex.exerciseId,
                  swappedFromName: exercise.name,
                  exerciseId: alternativeExercise.id,
                };
              }),
            };
          }),
        };
      }),
    };

    void updatePlan(nextPlan);
  }

  function dismissAlternative(sessionId: string) {
    if (!plan) return;

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) => ({
        ...week,
        sessions: week.sessions.map((session) => {
          if (session.id !== sessionId) return session;

          const editableSession = session as EditablePlanSession;
          return {
            ...editableSession,
            alternativeSessionTemplateId: null,
            alternativeSessionTemplateName: null,
            alternativeSessionTemplateReason: null,
            alternativeIncluded: false,
            alternativeDismissed: true,
          };
        }),
      })),
    };

    void updatePlan(nextPlan);
    showTemporaryStatus("Alternative dismissed.", 1500);
  }

  function addPairedMobilitySession(sessionId: string) {
    if (!plan) return;

    let baseSession: EditablePlanSession | null = null;
    let targetWeekId: string | null = null;

    for (const week of plan.weeks) {
      const found = week.sessions.find((s) => s.id === sessionId);
      if (found) {
        targetWeekId = week.id;
        baseSession = found as EditablePlanSession;
        break;
      }
    }

    if (!targetWeekId || !baseSession) return;

    // Find the paired mobility session for this gym session template
    const pairedSession = pairedMobilitySessions.find(
      (pair) => pair.session_template_id === baseSession?.sourceSessionTemplateId && pair.auto_add_enabled
    );

    if (!pairedSession?.mobility_sessions) {
      showTemporaryStatus("No paired mobility session configured for this template.", 3000);
      return;
    }

    const mobility = pairedSession.mobility_sessions;
    const mobilitySession: PlanSession = {
      id: `session-${Date.now()}-mobility`,
      weekId: targetWeekId,
      sortOrder: baseSession.sortOrder + 0.5,
      dayLabel: baseSession.dayLabel,
      type: "Recovery",
      name: mobility.name,
      description: mobility.description || "",
      tags: ["mobility", "recovery"],
      duration: mobility.duration_minutes ? `${mobility.duration_minutes} min` : "15 min",
      intensity: "low",
      isKeySession: false,
      exercises: [],
      mobilitySessionId: mobility.id,
    };

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((week) => {
        if (week.id !== targetWeekId) return week;

        const sessionIndex = week.sessions.findIndex((session) => session.id === sessionId);
        if (sessionIndex === -1) return week;

        const nextSessions = [...week.sessions];
        nextSessions.splice(sessionIndex + 1, 0, mobilitySession);

        return {
          ...week,
          sessions: nextSessions.map((s, i) => ({ ...s, sortOrder: i + 1 })),
        };
      }),
    };

    void updatePlan(nextPlan);
    showTemporaryStatus(`${mobility.name} added.`, 1500);
  }

  const buttonsDisabled = loading || !plan;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-[1600px] px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Plan Editor</h1>
            <p className="mt-3 max-w-3xl text-zinc-600">
              Edit the selected plan, add sessions, manage week focus, and save named versions.
            </p>
            {planRow ? (
              <div className="mt-3 text-sm text-zinc-600">
                <span className="font-semibold">{planRow.name}</span> ({planRow.status}) · Updated{" "}
                {formatDateTime(planRow.updated_at)}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium select-none hover:bg-zinc-50">
              <span
                role="switch"
                aria-checked={autoAddPostRunRecovery}
                onClick={() => {
                  const newValue = !autoAddPostRunRecovery;
                  setAutoAddPostRunRecovery(newValue);
                  localStorage.setItem("autoAddPostRunRecovery", newValue ? "true" : "false");
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${autoAddPostRunRecovery ? "bg-emerald-500" : "bg-zinc-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${autoAddPostRunRecovery ? "translate-x-4" : "translate-x-0"}`}
                />
              </span>
              Auto-add post-run recovery
            </label>

            <Link
              href={
                planRow ? `/coach?athleteId=${encodeURIComponent(planRow.athlete_user_id)}` : "/coach"
              }
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
            >
              Back to Plans
            </Link>

            {isHydrated && (
              <>
                <button
                  onClick={recalculateWarningsOnly}
                  disabled={buttonsDisabled}
                  className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50"
                >
                  Recalculate Warnings
                </button>

                <button
                  onClick={revertToLatestSaved}
                  disabled={loading || !planRow}
                  className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50"
                >
                  Revert
                </button>
              </>
            )}
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        {savingToAthlete ? (
          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-600">
            Saving to Supabase…
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border bg-white p-8">Loading…</div>
        ) : !plan ? (
          <div className="rounded-2xl border bg-white p-8">No plan found.</div>
        ) : (
          <>
            <div className="flex gap-8 items-start">
            {/* Left Panel — Week Templates */}
            <aside className="w-80 shrink-0 space-y-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Plan Actions</h2>
                <button
                  onClick={addBlankWeekAtStart}
                  disabled={buttonsDisabled}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50"
                >
                  Add Blank Week at Start
                </button>
                <button
                  onClick={addBlankWeekToEnd}
                  disabled={buttonsDisabled}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50"
                >
                  Add Blank Week at End
                </button>
              </div>
            </aside>

            {/* Right Panel — Tabbed Content */}
            <div className="min-w-0 flex-1">
              {/* Tab Bar */}
              <div className="mb-6 flex border-b border-zinc-200 gap-0">
                {["plan", "warnings", "versions"].map((tab) => {
                  const isActive = activeTab === (tab as typeof activeTab);
                  const warningCount = plan?.warnings?.length ?? 0;
                  let label = tab.charAt(0).toUpperCase() + tab.slice(1);
                  if (tab === "warnings" && warningCount > 0 && !isActive) {
                    label = `${label} (${warningCount})`;
                  }
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab as typeof activeTab)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                        isActive
                          ? "border-zinc-900 text-zinc-900"
                          : "border-transparent text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}

              {/* Plan Tab */}
              {activeTab === "plan" && (
                <div className="space-y-4">
                  {!plan?.weeks || plan.weeks.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500 shadow-sm">
                      No weeks added yet. Add a week from a template or create a blank week.
                    </div>
                  ) : null}

                  {/* Week cards */}
                {plan.weeks.map((week) => {
                  const typedWeek = week as PlanWeekWithTemplateMeta;
                  const sortedSessions = sortSessionsForWeek(typedWeek.sessions);
                  const isFocusLocked = !!typedWeek.sourceWeekTemplateId;

                  return (
                    <div
                      key={typedWeek.id}
                      className="rounded-xl border p-4"
                      style={{
                        backgroundColor: getWeekBackgroundColor(typedWeek.focus, weekFocusTypes),
                      }}
                    >
                      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold">Week {typedWeek.weekNumber}</div>
                          {plan.startDate && (
                            <div className="mt-1 text-sm text-zinc-500">
                              {(() => {
                                const start = new Date(plan.startDate);
                                start.setDate(start.getDate() + (typedWeek.weekNumber - 1) * 7);
                                const end = new Date(start);
                                end.setDate(end.getDate() + 6);
                                return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
                              })()}
                            </div>
                          )}
                          {plan.prepRaceMarkers?.filter((m) => m.weekNumber === typedWeek.weekNumber).map((m) => (
                            <div key={m.date} className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              Race: {m.name} — {new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </div>
                          ))}
                          {(() => {
                            const holidays = getHolidaysForWeek(typedWeek.weekNumber, plan, athleteEvents);
                            const camps = getCampsForWeek(typedWeek.weekNumber, plan, trainingCamps);
                            const prepRacesThisWeek = getPrepRacesForWeek(typedWeek.weekNumber, plan, prepRaces);
                            return (
                              <>
                                {holidays.map((holiday) => (
                                  <div key={`holiday-${holiday.id}`} className="mt-1 inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                                    Holiday: {holiday.title}
                                  </div>
                                ))}
                                {camps.map((camp) => (
                                  <div key={`camp-${camp.id}`} className="mt-1 inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
                                    Training Camp: {camp.title}
                                  </div>
                                ))}
                                {prepRacesThisWeek.map((race) => (
                                  <div key={`prep-race-${race.date}`} className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                                    ⚠️ Prep Race: {race.race_name}
                                  </div>
                                ))}
                              </>
                            );
                          })()}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleWeekExpanded(typedWeek.id)}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                          >
                            {expandedWeeks.has(typedWeek.id) ? "Collapse" : "Expand"}
                          </button>

                          <button
                            type="button"
                            onClick={() => addBlankWeekAfter(typedWeek.id)}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                          >
                            Insert After
                          </button>

                          <label className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition select-none ${typedWeek.isApproved ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"}`}>
                            <input
                              type="checkbox"
                              checked={!!typedWeek.isApproved}
                              onChange={(e) => {
                                const nextPlan: GeneratedPlan = {
                                  ...plan,
                                  weeks: plan.weeks.map((w) =>
                                    w.id === typedWeek.id ? { ...w, isApproved: e.target.checked } : w,
                                  ),
                                };
                                void updatePlan(nextPlan);
                                showTemporaryStatus(e.target.checked ? "Week approved." : "Week approval removed.", 1500);
                              }}
                              className="rounded accent-emerald-600"
                            />
                            {typedWeek.isApproved ? "Approved" : "Approve week"}
                          </label>
                        </div>
                      </div>

                      {expandedWeeks.has(typedWeek.id) && (
                        <>
                          <div className="mt-3 max-w-md">
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Focus
                            </label>
                            <select
                              value={typedWeek.focus ?? ""}
                              disabled={isFocusLocked}
                              onChange={(e) => {
                                const newFocus = e.target.value;

                                const nextPlan: GeneratedPlan = {
                                  ...plan,
                                  weeks: plan.weeks.map((existingWeek) =>
                                    existingWeek.id === typedWeek.id
                                      ? {
                                          ...existingWeek,
                                          focus: newFocus,
                                        }
                                      : existingWeek,
                                  ),
                                };

                                void updatePlan(nextPlan);
                                showTemporaryStatus("Week focus saved.", 1500);
                              }}
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                            >
                              <option value="">Select week focus</option>
                              {weekFocusTypes.map((focusType) => (
                                <option key={focusType.id} value={focusType.name}>
                                  {focusType.name}
                                </option>
                              ))}
                            </select>

                            {isFocusLocked ? (
                              <div className="mt-1 text-xs text-zinc-500">
                                Focus is locked because this week was added from template
                                {typedWeek.sourceWeekTemplateName
                                  ? `: ${typedWeek.sourceWeekTemplateName}.`
                                  : "."}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {creatingBlankSessionWeekId !== typedWeek.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setCreatingBlankSessionWeekId(typedWeek.id)}
                                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-100"
                                >
                                  Add Blank Session
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openTemplateSessionPicker(typedWeek.id, "gym")}
                                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                                    pendingSessionSlot?.weekId === typedWeek.id && pendingSessionType === "gym"
                                      ? "border-zinc-900 bg-zinc-900 text-white"
                                      : "border-zinc-300 bg-white hover:bg-zinc-100"
                                  }`}
                                >
                                  Add Gym Session
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openTemplateSessionPicker(typedWeek.id, "functional")}
                                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                                    pendingSessionSlot?.weekId === typedWeek.id && pendingSessionType === "functional"
                                      ? "border-zinc-900 bg-zinc-900 text-white"
                                      : "border-zinc-300 bg-white hover:bg-zinc-100"
                                  }`}
                                >
                                  Add Functional Session
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openTemplateSessionPicker(typedWeek.id, "mobility")}
                                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                                    pendingSessionSlot?.weekId === typedWeek.id && pendingSessionType === "mobility"
                                      ? "border-zinc-900 bg-zinc-900 text-white"
                                      : "border-zinc-300 bg-white hover:bg-zinc-100"
                                  }`}
                                >
                                  Add Mobility Session
                                </button>

                                <button
                                  type="button"
                                  onClick={() => deleteWeek(typedWeek.id)}
                                  className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                >
                                  Delete Week
                                </button>
                              </>
                            ) : null}

                            {creatingBlankSessionWeekId === typedWeek.id ? (
                              <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                <div className="mb-4">
                                  <h4 className="text-base font-semibold text-zinc-900">Create Blank Session</h4>
                                  <p className="mt-1 text-sm text-zinc-600">
                                    Fill in the session details below to create a new blank session.
                                  </p>
                                </div>

                                <UnifiedSessionForm
                                  onSave={(formData) => {
                                    if (!plan) return;
                                    const dayLabel = pendingSessionSlot?.dayLabel || autoAssignDay(typedWeek.id);
                                    // Map activity to a valid PlanSessionType
                                    const mapActivityToType = (activity: string): PlanSessionType => {
                                      const lower = (activity || "").toLowerCase();
                                      if (lower.includes("gym")) return "Gym";
                                      if (lower.includes("functional")) return "functional";
                                      if (lower.includes("long")) return "Long";
                                      if (lower.includes("recovery")) return "Recovery";
                                      if (lower.includes("steady")) return "Steady";
                                      if (lower.includes("rest")) return "Rest";
                                      if (lower.includes("loaded")) return "Loaded";
                                      if (lower.includes("recce")) return "Recce";
                                      if (lower.includes("navigation")) return "Navigation";
                                      return "Easy";
                                    };
                                    const nextSession: PlanSession = {
                                      id: `session-${Date.now()}`,
                                      weekId: typedWeek.id,
                                      sortOrder: typedWeek.sessions.length + 1,
                                      dayLabel,
                                      type: mapActivityToType(formData.activity),
                                      name: formData.activity && formData.subtype
                                        ? `${formData.activity} - ${formData.subtype}`
                                        : formData.activity || "Session",
                                      description: formData.description || "",
                                      tags: formData.tags || [],
                                      duration: formData.durationMinutes ? `${formData.durationMinutes} min` : "",
                                      intensity: formData.targetIntensity || "",
                                      isKeySession: false,
                                      exercises: [],
                                      activity: formData.activity,
                                      subtype: formData.subtype,
                                      terrain: formData.terrain,
                                      elevationGainMeters: formData.elevation ? parseInt(formData.elevation) : undefined,
                                      packWeightKg: formData.packWeightKg ? parseFloat(formData.packWeightKg) : undefined,
                                      strides: formData.strides,
                                      warmupMinutes: formData.warmUpMinutes ? parseInt(formData.warmUpMinutes) : undefined,
                                      cooldownMinutes: formData.coolDownMinutes ? parseInt(formData.coolDownMinutes) : undefined,
                                      intervalReps: formData.intervalReps ? parseInt(formData.intervalReps) : undefined,
                                      intervalDuration: formData.intervalDuration,
                                    };
                                    const isRunSession = ["Easy", "Long", "Recovery", "Steady"].includes(
                                      mapActivityToType(formData.activity),
                                    );
                                    const isGymSession = mapActivityToType(formData.activity) === "Gym";
                                    const sessionsToAdd: PlanSession[] = [nextSession];
                                    if (autoAddPostRunRecovery && isRunSession) {
                                      sessionsToAdd.push({
                                        id: `session-${Date.now()}-recovery`,
                                        weekId: typedWeek.id,
                                        sortOrder: nextSession.sortOrder + 1,
                                        dayLabel,
                                        type: "Recovery",
                                        name: "Post-Run Recovery",
                                        description: "Post-run mobility session to restore range of motion and aid recovery.",
                                        tags: ["mobility", "recovery"],
                                        duration: "15 min",
                                        intensity: "low",
                                        isKeySession: false,
                                        exercises: [],
                                        mobilitySessionId: "post_run_recovery",
                                      });
                                    }
                                    if (formData.selectedMobilitySessionId) {
                                      const mobilitySession = allMobilitySessions.find(
                                        (m) => m.id === formData.selectedMobilitySessionId
                                      );
                                      if (mobilitySession) {
                                        sessionsToAdd.push({
                                          id: `session-${Date.now()}-mobility`,
                                          weekId: typedWeek.id,
                                          sortOrder: nextSession.sortOrder + 1,
                                          dayLabel,
                                          type: "Recovery",
                                          name: mobilitySession.name,
                                          description: mobilitySession.description || "",
                                          tags: ["mobility", "recovery"],
                                          duration: mobilitySession.duration_minutes ? `${mobilitySession.duration_minutes} min` : "15 min",
                                          intensity: "low",
                                          isKeySession: false,
                                          exercises: [],
                                          mobilitySessionId: mobilitySession.id,
                                        });
                                      }
                                    }
                                    const nextPlan: GeneratedPlan = {
                                      ...plan,
                                      weeks: plan.weeks.map((week) =>
                                        week.id === typedWeek.id
                                          ? { ...week, sessions: [...week.sessions, ...sessionsToAdd] }
                                          : week,
                                      ),
                                    };
                                    void updatePlan(nextPlan);
                                    setCreatingBlankSessionWeekId(null);
                                    showTemporaryStatus(
                                      autoAddPostRunRecovery && isRunSession
                                        ? "Run session + post-run recovery added."
                                        : "Blank session added.",
                                      1500,
                                    );
                                  }}
                                  onCancel={() => setCreatingBlankSessionWeekId(null)}
                                  submitButtonLabel="Create Session"
                                />
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 space-y-2">
                        {sortedSessions.length === 0 && !pendingSessionSlot ? (
                          <div className="text-sm text-zinc-500">No sessions in this week yet.</div>
                        ) : null}

                        {sortedSessions.map((session) => {
                          const isGymSession = session.type === "Gym";
                          const editableSession = session as EditablePlanSession;
                          const hasAlternativeSuggestion =
                            !!editableSession.alternativeSessionTemplateId &&
                            !editableSession.alternativeIncluded &&
                            !editableSession.alternativeDismissed;
                          const assignedDay =
                            session.dayLabel &&
                            dayAliases[session.dayLabel.trim().toLowerCase()]
                              ? session.dayLabel
                              : null;
                          const prepRaceConflict = getPrepRaceConflict(typedWeek.weekNumber, session.dayLabel);

                          return (
                            <div
                              key={session.id}
                              className={`rounded-xl border p-4 ${prepRaceConflict ? "border-orange-300 bg-orange-50" : "border-zinc-200 bg-zinc-50"}`}
                            >
                              {prepRaceConflict ? (
                                <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-200 bg-white p-3">
                                  <span className="text-lg">⚠️</span>
                                  <div>
                                    <p className="text-xs font-semibold text-orange-900">Scheduled on prep race day</p>
                                    <p className="text-xs text-orange-700">{prepRaceConflict.race_name}</p>
                                  </div>
                                </div>
                              ) : null}
                              {assignedDay ? (
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                                  {assignedDay}
                                </div>
                              ) : null}

                              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-medium">
                                      {session.name || "(Untitled session)"}
                                    </div>
                                    {editableSession.isInsertedAlternative && (
                                      <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                        Alternative
                                      </span>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => deleteSession(session.id)}
                                    className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                                <div>Type: {session.type}</div>

                                {session.description ? (
                                  <div className="whitespace-pre-wrap">{session.description}</div>
                                ) : null}

                                {session.duration ? <div>Duration: {session.duration}</div> : null}

                                {session.intensity ? <div>Intensity: {session.intensity}</div> : null}

                                {session.tags?.length ? (
                                  <div>Tags: {session.tags.join(", ")}</div>
                                ) : null}

                                {editableSession.alternativeIncluded &&
                                editableSession.alternativeSessionTemplateName ? (
                                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">
                                    Alternative included:{" "}
                                    {editableSession.alternativeSessionTemplateName}
                                    {editableSession.alternativeSessionTemplateReason
                                      ? ` (${formatOptionLabel(editableSession.alternativeSessionTemplateReason)})`
                                      : ""}
                                  </div>
                                ) : null}

                                {hasAlternativeSuggestion ? (
                                  <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                                    <div className="font-semibold text-blue-900">
                                      Suggested alternative
                                    </div>
                                    <div className="mt-1 text-blue-800">
                                      {editableSession.alternativeSessionTemplateName ||
                                        "Alternative session"}
                                    </div>
                                    {editableSession.alternativeSessionTemplateReason ? (
                                      <div className="mt-1 text-[11px] text-blue-700">
                                        Reason:{" "}
                                        {formatOptionLabel(
                                          editableSession.alternativeSessionTemplateReason,
                                        )}
                                      </div>
                                    ) : null}

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void includeAlternative(session.id)}
                                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                      >
                                        Include Alternative
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => dismissAlternative(session.id)}
                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  </div>
                                ) : null}

                                {isGymSession && editableSession.sourceSessionTemplateId && (() => {
                                  const pairedMobility = pairedMobilitySessions.find(
                                    (pair) => pair.session_template_id === editableSession.sourceSessionTemplateId && pair.auto_add_enabled
                                  );
                                  const alreadyHasMobility = sortedSessions.some(
                                    (s) => s.dayLabel === editableSession.dayLabel && s.mobilitySessionId === pairedMobility?.mobility_sessions?.id
                                  );
                                  return pairedMobility?.mobility_sessions && !alreadyHasMobility ? (
                                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                                      <div className="font-semibold text-emerald-900">
                                        Suggested pairing
                                      </div>
                                      <div className="mt-1 text-emerald-800">
                                        {pairedMobility.mobility_sessions.name}
                                      </div>
                                      <div className="mt-3">
                                        <button
                                          type="button"
                                          onClick={() => addPairedMobilitySession(session.id)}
                                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                        >
                                          Add Mobility Session
                                        </button>
                                      </div>
                                    </div>
                                  ) : null;
                                })()}

                                {isGymSession && session.exercises?.length ? (
                                  <div className="pt-1">
                                    <div className="font-medium text-zinc-700">Exercises:</div>
                                    <ul className="ml-4 list-disc space-y-1">
                                      {session.exercises.map((exercise) => {
                                        const ex = exercise as PlanExercise & { duration?: string; notes?: string };
                                        const detailParts = [
                                          ex.sets ? `${ex.sets} sets` : "",
                                          ex.reps ? `${ex.reps} reps` : "",
                                          ex.durationSeconds ? `${ex.durationSeconds}s` : (ex.duration ?? ""),
                                        ].filter(Boolean);

                                        return (
                                          <li key={ex.id}>
                                            <span className="font-medium text-zinc-800">
                                              {ex.name}
                                            </span>
                                            {detailParts.length
                                              ? ` — ${detailParts.join(" · ")}`
                                              : ""}
                                            {ex.notes ? ` — ${ex.notes}` : ""}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                ) : null}

                                {/* Session Attributes */}
                                {!isGymSession && (
                                  <div className="pt-2 space-y-1 text-sm text-zinc-700">
                                    {(session as any).strides && (
                                      <div><strong>Strides:</strong> {(session as any).strides}</div>
                                    )}
                                    {(session as any).terrain && (
                                      <div><strong>Terrain:</strong> {(session as any).terrain}</div>
                                    )}
                                    {(session as any).elevationGainMeters && (
                                      <div><strong>Elevation Gain:</strong> {(session as any).elevationGainMeters}m</div>
                                    )}
                                    {(session as any).packWeightKg && (
                                      <div><strong>Pack Weight:</strong> {(session as any).packWeightKg}kg</div>
                                    )}
                                    {(session as any).warmupMinutes && (
                                      <div><strong>Warmup:</strong> {(session as any).warmupMinutes} min</div>
                                    )}
                                    {(session as any).cooldownMinutes && (
                                      <div><strong>Cooldown:</strong> {(session as any).cooldownMinutes} min</div>
                                    )}
                                    {(session as any).intervalReps && (
                                      <div><strong>Intervals:</strong> {(session as any).intervalReps} reps</div>
                                    )}
                                    {(session as any).intervalDuration && (
                                      <div><strong>Interval Duration:</strong> {(session as any).intervalDuration}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {pendingSessionSlot?.weekId === typedWeek.id ? (
                        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-4">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-base font-semibold">
                                Add {pendingSessionType === "gym" ? "Gym" : pendingSessionType === "functional" ? "Functional" : ""} Session
                              </h3>
                              <button
                                type="button"
                                onClick={() => cancelPendingSession()}
                                className="text-sm text-zinc-500 hover:text-zinc-700"
                              >
                                ✕
                              </button>
                            </div>

                            <div className="flex items-center gap-3 mb-4">
                              <span className="text-sm text-zinc-500">
                                Will be added to{" "}
                                <span className="font-semibold text-zinc-900">
                                  {pendingSessionSlot?.dayLabel || "—"}
                                </span>
                                {" "}based on your training pattern.
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                                  const current = pendingSessionSlot?.dayLabel ?? "Mon";
                                  const next = days[(days.indexOf(current) + 1) % days.length];
                                  setPendingSessionSlot((prev) => prev ? { ...prev, dayLabel: next } : prev);
                                }}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-zinc-100"
                              >
                                Change day
                              </button>
                            </div>

                            {adHocMode === "search" ? (
                              <>
                                <div>
                                  <input
                                    value={sessionTemplateSearch}
                                    onChange={(e) => setSessionTemplateSearch(e.target.value)}
                                    placeholder="Search by name, activity, subtype, intensity, or description"
                                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                                  />
                                </div>

                                {(() => {
                                  const activeCamps = getCampsForWeek(typedWeek.weekNumber, plan, trainingCamps);
                                  return activeCamps.length > 0 ? (
                                    <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 mt-4 text-sm text-violet-800">
                                      This week falls within <strong>{activeCamps.map((c) => c.title).join(", ")}</strong>.
                                      Sessions matching camp attributes are highlighted.
                                    </div>
                                  ) : null;
                                })()}

                                <div className="mt-4 space-y-3">
                                  {!sessionTemplateSearch.trim() ? (
                                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                      Start typing to search session templates.
                                    </div>
                                  ) : searchingTemplates ? (
                                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                      Searching session templates…
                                    </div>
                                  ) : sessionTemplateResults.length === 0 ? (
                                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                      No session templates matched that search.
                                    </div>
                                  ) : (
                                    sessionTemplateResults.map((template) => {
                                      const detailParts = [
                                        template.type ? formatOptionLabel(template.type) : "",
                                        template.activity ? formatOptionLabel(template.activity) : "",
                                        template.subtype ? formatOptionLabel(template.subtype) : "",
                                        template.duration_minutes != null
                                          ? `${template.duration_minutes} min`
                                          : "",
                                        template.target_intensity ?? "",
                                      ].filter(Boolean);

                                      return (
                                        <button
                                          key={template.id}
                                          type="button"
                                          onClick={() => void createSessionFromTemplate(template.id)}
                                          className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="font-medium text-zinc-900">
                                                {template.name || "Untitled template"}
                                              </div>
                                              <div className="mt-1 text-sm text-zinc-600">
                                                {template.description || "—"}
                                              </div>
                                              {detailParts.length ? (
                                                <div className="mt-2 text-xs text-zinc-500">
                                                  {detailParts.join(" · ")}
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })
                                  )}
                                </div>

                                <div className="mt-4 flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={cancelPendingSession}
                                    className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </>
                            ) : (
                              <AdHocSessionForm
                                onCreated={(templateId) => void createAdHocSession(templateId)}
                                onCancel={cancelPendingSession}
                              />
                            )}
                          </div>
                        </div>
                      ) : null}
                        </div>
                      </>
                      )}
                    </div>
                  );
                })}
                </div>
              )}

              {/* Warnings Tab */}
              {activeTab === "warnings" && (
                <div className="space-y-4">
                  {!plan?.warnings || plan.warnings.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                      <div className="flex items-start gap-4">
                        <div className="text-2xl">✓</div>
                        <div>
                          <h3 className="font-semibold text-emerald-900">No warnings</h3>
                          <p className="mt-2 text-sm text-emerald-800">
                            This plan looks good with no conflicts or issues detected.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {plan.warnings.map((warning: any, idx) => {
                        const isError = warning.type === "error";
                        const isWarning = warning.type === "warning";
                        const isEquipmentConflict = warning.message?.includes("requires") && warning.message?.includes("which the athlete");

                        // Extract exercise ID from equipment conflict warnings
                        let exerciseId: string | null = null;
                        let weekId: string | null = null;
                        let sessionId: string | null = null;

                        if (isEquipmentConflict && warning.weekNumber !== undefined && warning.sessionId && warning.exerciseId) {
                          // Find the actual week ID from the plan by week number
                          const weekForNumber = plan?.weeks.find(w => w.weekNumber === warning.weekNumber);
                          weekId = weekForNumber?.id || null;
                          sessionId = warning.sessionId;
                          exerciseId = warning.exerciseId;
                        }

                        const alternatives = exerciseId ? equipmentConflictAlternatives[exerciseId] : undefined;

                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border-l-4 p-4 ${
                              isError
                                ? "border-l-red-600 border-r border-b border-t border-red-200 bg-red-50"
                                : isWarning
                                  ? "border-l-amber-600 border-r border-b border-t border-amber-200 bg-amber-50"
                                  : "border-l-blue-600 border-r border-b border-t border-blue-200 bg-blue-50"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`text-lg leading-none mt-0.5 ${
                                  isError ? "text-red-600" : isWarning ? "text-amber-600" : "text-blue-600"
                                }`}
                              >
                                {isError && "🚨"}
                                {isWarning && "⚠️"}
                                {!isError && !isWarning && "ℹ️"}
                              </div>
                              <div className="flex-1">
                                <div
                                  className={`text-sm ${
                                    isError
                                      ? "text-red-900 font-semibold"
                                      : isWarning
                                        ? "text-amber-900 font-semibold"
                                        : "text-blue-900"
                                  }`}
                                >
                                  {warning.message}
                                </div>
                                {isEquipmentConflict && alternatives && alternatives.length > 0 && weekId && sessionId && exerciseId && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {alternatives.slice(0, 3).map((alt) => (
                                      <button
                                        key={alt.id}
                                        onClick={() => swapExercise(weekId!, sessionId!, exerciseId!, alt)}
                                        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
                                      >
                                        Swap to {alt.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* Versions Tab */}
              {activeTab === "versions" && (
                <div className="space-y-6">
                  {/* Save Version Card */}
                  <div className="rounded-2xl border bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-semibold">Save Version</h2>

                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-semibold text-zinc-900">
                        Version name
                      </label>
                      <input
                        type="text"
                        value={snapshotName}
                        onChange={(e) => setSnapshotName(e.target.value)}
                        placeholder="e.g. More aggressive build option"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => void saveVersion()}
                        disabled={loading || !plan || !planRow}
                        className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                      >
                        Save Version
                      </button>
                    </div>

                    <div className="mt-3 text-xs text-zinc-500">
                      Save named restore points for this plan.
                    </div>
                  </div>

                  {/* Version History Card */}
                  <div className="rounded-2xl border bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-semibold">Version History</h2>
                    <div className="mt-4 space-y-3">
                      {history.length === 0 ? (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                          No saved versions yet.
                        </div>
                      ) : (
                        <>
                          {(showAllSnapshots ? history : history.slice(0, 2)).map((snapshot) => (
                            <div
                              key={snapshot.id}
                              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                            >
                              <button
                                type="button"
                                onClick={() => void loadHistoryItem(snapshot.id)}
                                className="block w-full rounded-lg text-left transition hover:bg-zinc-100"
                              >
                                <div className="font-medium text-zinc-900">
                                  {snapshot.name || "Saved version"}
                                </div>
                                <div className="mt-1 text-xs text-zinc-500">
                                  {new Date(snapshot.created_at).toLocaleString()}
                                </div>
                              </button>

                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => void deleteVersion(snapshot.id)}
                                  className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}

                          {history.length > 2 ? (
                            <button
                              type="button"
                              onClick={() => setShowAllSnapshots((currentValue) => !currentValue)}
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                            >
                              {showAllSnapshots ? "Show Less" : `More (${history.length - 2})`}
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          </>
        )}
      </div>
    </main>
  );
}
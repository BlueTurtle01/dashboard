"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UnifiedSessionForm, type UnifiedSessionFormData } from "@/app/coach/components/UnifiedSessionForm";
import { CANONICAL_DAY_ORDER, DAY_ALIASES } from "@/lib/planner/dayLabels";

type ProgramTemplateRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  discipline: string;
  plan_length_weeks: number;
  training_days_per_week: number;
  starting_fitness: string;
  event_goal: string | null;
  distance: string | null;
  is_featured: boolean;
  is_personalised: boolean;
  is_active: boolean;
  min_weekly_training_hours: number | null;
  min_longest_recent_session_minutes: number | null;
  min_training_consistency_weeks: number | null;
  min_back_to_back_days: number | null;
  requires_hills: boolean;
  requires_gym: boolean;
  requires_load_carriage: boolean;
  requires_heat_acclimation: boolean;
  suitable_race_goals: string[] | null;
  race_id: string | null;
};

type RaceRow = {
  id: string;
  name: string;
  distance_km: number | null;
  terrain_type: string | null;
  climate_type: string | null;
};

type ProgramTemplateWeekRow = {
  id: string;
  program_template_id: string;
  week_number: number;
  focus: string | null;
  notes: string | null;
};

type ProgramTemplateSessionExerciseRow = {
  id: string;
  program_template_session_id: string;
  exercise_id: string;
  sort_order: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  notes: string | null;
};

type ProgramTemplateSessionRow = {
  id: string;
  program_template_week_id: string;
  day_label: string;
  sort_order: number;
  type: string;
  name: string;
  description: string | null;
  duration: string | null;
  duration_minutes: number | null;
  intensity: string | null;
  is_key_session: boolean;
  session_template_id: string | null;
  run_time_type: string | null;
  is_time_strict: boolean | null;
  week_number: number | null;
  day_number: number | null;
  num_sets: number | null;
  set_duration_minutes: number | null;
  activity: string | null;
  subtype: string | null;
  distance_km: number | null;
  terrain: string | null;
  elevation_gain_meters: number | null;
  pack_weight_kg: number | null;
  strides: string | null;
  warmup_minutes: number | null;
  cooldown_minutes: number | null;
  interval_reps: number | null;
  interval_duration: string | null;
  reason: string | null;
  tags: string[] | null;
  program_template_session_exercises: ProgramTemplateSessionExerciseRow[] | null;
};

type SessionTemplateExerciseRow = {
  id: string;
  session_template_id: string;
  exercise_id: string;
  exercise_order: number;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  notes: string | null;
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
  is_key_session: boolean | null;
  session_template_exercises: SessionTemplateExerciseRow[] | null;
};

type WeekTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  focus_type_id: string | null;
  is_active: boolean;
  is_custom: boolean;
};

type ExerciseRow = {
  id: string;
  name: string;
};

type EditableExercise = {
  localId: string;
  dbId: string | null;
  exerciseId: string;
  exerciseName: string;
  sortOrder: number;
  sets: string;
  reps: string;
  durationSeconds: string;
  notes: string;
};

type EditableSession = {
  localId: string;
  dbId: string | null;
  dayLabel: string;
  sortOrder: number;
  type: string;
  name: string;
  description: string;
  duration: string;
  intensity: string;
  isKeySession: boolean;
  sessionTemplateId: string;
  runTimeType: string;
  isTimeStrict: boolean;
  dayNumber: string;
  numSets: string;
  setDurationMinutes: string;
  exercises: EditableExercise[];
  // Extended fields from FunctionalSessionForm
  activity?: string;
  subtype?: string;
  distanceKm?: string;
  terrain?: string;
  elevation?: string;
  packWeightKg?: string;
  strides?: string;
  warmUpMinutes?: string;
  coolDownMinutes?: string;
  intervalReps?: string;
  intervalDuration?: string;
  reason?: string;
  tags?: string[];
};

type EditableWeek = {
  localId: string;
  dbId: string | null;
  weekNumber: number;
  focus: string;
  notes: string;
  sessions: EditableSession[];
};

type TemplateForm = {
  raceName: string;
  name: string;
  slug: string;
  description: string;
  discipline: string;
  planLengthWeeks: string;
  trainingDaysPerWeek: string;
  startingFitness: string;
  eventGoal: string;
  distance: string;
  isFeatured: boolean;
  isPersonalised: boolean;
  isActive: boolean;
  minWeeklyTrainingHours: string;
  minLongestRecentSessionMinutes: string;
  minTrainingConsistencyWeeks: string;
  minBackToBackDays: string;
  requiresHills: boolean;
  requiresLoadCarriage: boolean;
  requiresHeatAcclimation: boolean;
  suitableRaceGoals: string;
  weeks: EditableWeek[];
};

type SessionPanel =
  | { mode: "template-picker"; weekLocalId: string; sessionType: "gym" | "functional" | "mobility" }
  | null;

type EditingSessionSlot = {
  weekLocalId: string;
  sessionLocalId: string;
};

type WeekTemplateSlotRow = {
  id: string;
  slot_name: string;
  sort_order: number;
  notes: string | null;
  is_required: boolean;
  session_template_id: string | null;
  session_templates: SessionTemplateRow | null;
};

type DistanceUnit = "km" | "mi";

const KM_PER_MILE = 1.609344;

const weekdayQuickAddOptions = [
  { label: "Mon", dayNumber: 1 },
  { label: "Tue", dayNumber: 2 },
  { label: "Wed", dayNumber: 3 },
  { label: "Thu", dayNumber: 4 },
  { label: "Fri", dayNumber: 5 },
  { label: "Sat", dayNumber: 6 },
  { label: "Sun", dayNumber: 7 },
];

const sessionTypeOptions = [
  "General Run",
  "Long Run",
  "Tempo Run",
  "Interval Session",
  "Hill Reps",
  "Fartlek",
  "Track Session",
  "Race Specific",
  "Cross Training",
  "Gym",
  "Loaded March",
  "Recce",
  "Navigation",
  "Rest",
];

const MUSCLE_OPTIONS: { label: string; values: string[] }[] = [
  { label: "Glutes",      values: ["glutes"] },
  { label: "Hamstrings",  values: ["hamstrings"] },
  { label: "Quads",       values: ["quadriceps", "quads"] },
  { label: "Calves",      values: ["calves"] },
  { label: "Hip Flexors", values: ["hip_flexors", "hips"] },
  { label: "Core / Abs",  values: ["core", "abs", "obliques"] },
  { label: "Lats",        values: ["lats"] },
  { label: "Upper Back",  values: ["upper_back"] },
  { label: "Chest",       values: ["chest", "upper_chest"] },
  { label: "Shoulders",   values: ["shoulders"] },
  { label: "Biceps",      values: ["biceps"] },
  { label: "Triceps",     values: ["triceps"] },
  { label: "Forearms",    values: ["forearms", "grip"] },
  { label: "Full Body",   values: ["full_body", "legs"] },
];

const runTimeTypeOptions = ["any", "morning", "afternoon", "evening"];

const terrainOptions = ["road", "trail", "mixed", "sand", "treadmill", "stairs", "indoor", "water", "any"];

const elevationOptions = [
  { value: "", label: "— select elevation —" },
  { value: "0", label: "Flat / none" },
  { value: "100", label: "Rolling / light climb" },
  { value: "250", label: "Hilly" },
  { value: "500", label: "Steep" },
  { value: "1000", label: "Mountainous / very steep" },
];

const warmUpOptions = ["", "5", "10", "15", "20"];

const coolDownOptions = ["", "5", "10", "15", "20"];

const strideOptions = ["", "5x100m", "6x100m", "8x100m", "10x100m", "15x100m", "20x100m"];

const intervalRepsOptions = ["", "6", "8", "10", "12", "16", "20"];

const intervalDurationOptions = ["", "400m", "800m", "1km", "1600m", "1min", "2min", "3min", "5min", "10min"];

const weekFocusOptions = [
  "Base",
  "Build",
  "Recovery",
  "Deload",
  "Taper",
  "Peak",
  "Race",
  "Test",
  "Strength",
  "Specific",
  "Volume",
  "Intensity",
];

function parseSlotNotes(notes: string): { duration?: string; intensity?: string; description?: string; numSets?: string; setDurationMinutes?: string } {
  const result: ReturnType<typeof parseSlotNotes> = {};
  for (const line of notes.split("\n")) {
    const colonIdx = line.indexOf(": ");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 2).trim();
    if (!value) continue;
    if (key === "Duration") result.duration = value;
    else if (key === "Intensity") result.intensity = value;
    else if (key === "Description") result.description = value;
    else if (key === "Sets") result.numSets = value;
    else if (key === "Set Duration") result.setDurationMinutes = value;
  }
  return result;
}

function getDigitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function getDurationMinutesInput(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/\d+/);
  return match ? match[0] : "";
}

function parseDurationMinutesForSave(value: string) {
  const minutes = getDigitsOnly(value);
  return minutes ? Number(minutes) : null;
}

function getDistanceUnitSuffix(unit: DistanceUnit) {
  return unit === "mi" ? "mi" : "km";
}

function formatDistanceInput(value: number) {
  return Number(value.toFixed(2)).toString();
}

function convertDistanceInput(value: string | undefined, from: DistanceUnit, to: DistanceUnit) {
  if (!value || from === to) return value ?? "";
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value;
  const converted = from === "km" ? parsed / KM_PER_MILE : parsed * KM_PER_MILE;
  return formatDistanceInput(converted);
}

function convertKmToDisplayDistance(value: number | null | undefined, unit: DistanceUnit) {
  if (value == null) return "";
  return formatDistanceInput(unit === "km" ? value : value / KM_PER_MILE);
}

function parseDisplayDistanceToKm(value: string | undefined, unit: DistanceUnit) {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  const km = unit === "km" ? parsed : parsed * KM_PER_MILE;
  return Math.round(km * 1000) / 1000;
}

function formatDistanceLabelFromKm(value: number | null | undefined, unit: DistanceUnit) {
  if (value == null) return "";
  return `${convertKmToDisplayDistance(value, unit)} ${getDistanceUnitSuffix(unit)}`;
}

function convertFormDistances(form: TemplateForm, from: DistanceUnit, to: DistanceUnit): TemplateForm {
  if (from === to) return form;
  return {
    ...form,
    weeks: form.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.map((session) => ({
        ...session,
        distanceKm: convertDistanceInput(session.distanceKm, from, to),
      })),
    })),
  };
}

function buildSessionNameFromFormData(
  formData: UnifiedSessionFormData,
  fallbackName: string,
  distanceUnit: DistanceUnit = "km",
) {
  const parts: string[] = [];
  if (formData.activity) parts.push(formatOptionLabel(formData.activity));
  if (formData.targetIntensity) parts.push(formData.targetIntensity);
  if (formData.subtype) parts.push(formatOptionLabel(formData.subtype));
  if (formData.distanceKm) parts.push(`${formData.distanceKm}${getDistanceUnitSuffix(distanceUnit)}`);
  else if (formData.durationMinutes) parts.push(`${formData.durationMinutes}min`);
  return parts.join(" - ") || fallbackName;
}

function mapSessionToUnifiedFormData(session: EditableSession): Partial<UnifiedSessionFormData> {
  return {
    description: session.description,
    activity: session.activity ?? "",
    subtype: session.subtype ?? "",
    durationMinutes: getDigitsOnly(session.duration),
    distanceKm: session.distanceKm ?? "",
    targetIntensity: session.intensity,
    terrain: session.terrain || "any",
    elevation: session.elevation ?? "",
    packWeightKg: session.packWeightKg ?? "",
    strides: session.strides ?? "",
    warmUpMinutes: session.warmUpMinutes ?? "",
    coolDownMinutes: session.coolDownMinutes ?? "",
    intervalReps: session.intervalReps ?? "",
    intervalDuration: session.intervalDuration ?? "",
    timeOfDay: session.runTimeType || "any",
    sets: session.numSets,
    setDurationSeconds: session.setDurationMinutes && !Number.isNaN(Number.parseFloat(session.setDurationMinutes))
      ? String(Math.round(Number.parseFloat(session.setDurationMinutes) * 60))
      : "",
    reason: session.reason ?? "",
    tags: session.tags ?? [],
    sourceSessionTemplateId: session.sessionTemplateId || undefined,
  };
}

function applyUnifiedFormDataToSession(
  session: EditableSession,
  formData: UnifiedSessionFormData,
  distanceUnit: DistanceUnit = "km",
): EditableSession {
  const setDurationMinutes = formData.setDurationSeconds
    ? String(Number.parseInt(formData.setDurationSeconds, 10) / 60)
    : "";

  return {
    ...session,
    type: formData.subtype ? formatOptionLabel(formData.subtype) : session.type,
    name: buildSessionNameFromFormData(formData, session.name || `Session ${session.sortOrder}`, distanceUnit),
    description: formData.description,
    duration: formData.durationMinutes ? getDigitsOnly(formData.durationMinutes) : "",
    intensity: formData.targetIntensity,
    runTimeType: formData.timeOfDay || "any",
    numSets: formData.sets,
    setDurationMinutes,
    activity: formData.activity,
    subtype: formData.subtype,
    distanceKm: formData.distanceKm,
    terrain: formData.terrain,
    elevation: formData.elevation,
    packWeightKg: formData.packWeightKg,
    strides: formData.strides,
    warmUpMinutes: formData.warmUpMinutes,
    coolDownMinutes: formData.coolDownMinutes,
    intervalReps: formData.intervalReps,
    intervalDuration: formData.intervalDuration,
    reason: formData.reason,
    tags: formData.tags,
  };
}

function sessionRequiresHills(session: EditableSession) {
  const haystack = [
    session.type,
    session.name,
    session.description,
    session.activity,
    session.subtype,
    session.terrain,
    session.reason,
    ...(session.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("hill") ||
    haystack.includes("hilly") ||
    haystack.includes("mountain") ||
    haystack.includes("elevation") ||
    haystack.includes("vert") ||
    Number(session.elevation || 0) > 0
  );
}

function makeLocalId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

const RACE_GOAL_OPTIONS = [
  { value: "finish", label: "Finish" },
  { value: "finish_strong", label: "Finish Strong" },
  { value: "complete_comfortably", label: "Complete Comfortably" },
  { value: "experience", label: "Experience" },
  { value: "pb", label: "Personal Best" },
  { value: "place_highly", label: "Place Highly" },
  { value: "win_age_category", label: "Win Age Category" },
  { value: "win_overall", label: "Win Overall" },
];

const DISTANCE_OPTIONS = [
  { value: "", label: "— select distance —" },
  { value: "5K", label: "5K" },
  { value: "10K", label: "10K" },
  { value: "Half Marathon", label: "Half Marathon" },
  { value: "Marathon", label: "Marathon" },
  { value: "50K", label: "50K" },
  { value: "50 Miles", label: "50 Miles" },
  { value: "100K", label: "100K" },
  { value: "100 Miles", label: "100 Miles" },
  { value: "Multi-Day", label: "Multi-Day" },
  { value: "Sprint Triathlon", label: "Sprint Triathlon" },
  { value: "Olympic Triathlon", label: "Olympic Triathlon" },
  { value: "Half Ironman", label: "Half Ironman" },
  { value: "Ironman", label: "Ironman" },
  { value: "Other", label: "Other" },
];

const FITNESS_LABELS: Record<string, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function buildAutoName(
  raceName: string,
  startingFitness: string,
  distance: string,
  eventGoal: string,
  weeks: EditableWeek[],
): string {
  const parts: string[] = [];
  if (raceName.trim()) parts.push(raceName.trim());
  if (startingFitness) parts.push(FITNESS_LABELS[startingFitness] ?? startingFitness);
  if (distance) parts.push(distance);
  if (eventGoal) {
    const goal = RACE_GOAL_OPTIONS.find((o) => o.value === eventGoal);
    if (goal) parts.push(goal.label);
  }
  if (weeks.length > 0) {
    parts.push(`${weeks.length}wk`);
  }
  // Compute training days range across weeks
  if (weeks.length > 0) {
    const dayCounts = weeks.map((w) => w.sessions.filter((s) => s.type !== "Rest").length);
    const minDays = Math.min(...dayCounts);
    const maxDays = Math.max(...dayCounts);
    const daysLabel = minDays === maxDays ? `${minDays}d/wk` : `${minDays}-${maxDays}d/wk`;
    parts.push(daysLabel);
  }
  return parts.join(" · ");
}


function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeDayLabel(dayLabel: string) {
  return DAY_ALIASES[dayLabel.trim().toLowerCase()] ?? dayLabel.trim().toLowerCase();
}

function getDayOrderIndex(dayLabel: string) {
  return CANONICAL_DAY_ORDER.indexOf(
    normalizeDayLabel(dayLabel) as (typeof CANONICAL_DAY_ORDER)[number],
  );
}

function getWeekFocusTheme(focus: string) {
  const normalised = focus.trim().toLowerCase();

  if (["recovery", "deload"].includes(normalised)) {
    return {
      card: "border-emerald-300 bg-emerald-50",
      badge: "bg-emerald-600 text-white",
      accent: "text-emerald-900",
    };
  }

  if (["build", "specific", "strength"].includes(normalised)) {
    return {
      card: "border-sky-300 bg-sky-50",
      badge: "bg-sky-600 text-white",
      accent: "text-sky-900",
    };
  }

  if (["base", "volume"].includes(normalised)) {
    return {
      card: "border-zinc-300 bg-zinc-100",
      badge: "bg-zinc-700 text-white",
      accent: "text-zinc-900",
    };
  }

  if (["taper", "peak", "race", "test", "intensity"].includes(normalised)) {
    return {
      card: "border-violet-300 bg-violet-50",
      badge: "bg-violet-600 text-white",
      accent: "text-violet-900",
    };
  }

  return {
    card: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-black",
    accent: "text-amber-900",
  };
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
  const timeOfDay = typeof sessionData["time_of_day"] === "string" ? sessionData["time_of_day"] : "";
  const startTime = typeof sessionData["start_time"] === "string" ? sessionData["start_time"] : "";
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

function buildFunctionalDescriptionForDisplay(row: SessionTemplateRow, distanceUnit: DistanceUnit) {
  const description = buildFunctionalDescription(row);
  if (distanceUnit === "km" || row.distance_km == null) return description;
  return description.replace(
    `${row.distance_km} km`,
    `${convertKmToDisplayDistance(row.distance_km, distanceUnit)} ${getDistanceUnitSuffix(distanceUnit)}`,
  );
}

function mapTemplateToEditableSessionType(row: SessionTemplateRow): EditableSession["type"] {
  const rawType = (row.type ?? "").trim().toLowerCase();
  const subtype = (row.subtype ?? "").trim().toLowerCase();
  const activity = (row.activity ?? "").trim().toLowerCase();

  if (rawType === "gym") return "Gym";
  if (["long"].includes(subtype)) return "Long";
  if (["recovery"].includes(subtype)) return "Recovery";
  if (["rest"].includes(subtype)) return "Rest";
  if (["tempo", "interval", "threshold", "hill_reps"].includes(subtype)) return "Steady";
  if (rawType === "functional") return "Easy";

  const loadedSubtypes = ["loaded", "loaded_march", "load_carriage", "pack_carry", "pack carry", "weighted_hike", "weighted hike"];
  const loadedActivities = ["pack_carry", "pack carry", "loaded march", "loaded_march", "weighted hike", "weighted_hike", "load carriage"];
  if (loadedSubtypes.includes(subtype) || rawType === "loaded" || activity === "pack_carry" || loadedActivities.includes(activity)) return "Loaded March";

  const recceActivities = ["recce", "reconnaissance", "course recce"];
  if (["recce", "reconnaissance"].includes(subtype) || rawType === "recce" || recceActivities.includes(activity)) return "Recce";

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
    normalizedType === "Tempo" ||
    normalizedType === "Intervals" ||
    normalizedType === "Hill Reps" ||
    normalizedType === "Race Specific" ||
    normalizedType === "Loaded March" ||
    normalizedType === "Recce" ||
    normalizedType === "Navigation"
  ) {
    return normalizedType as EditableSession["type"];
  }

  return "Easy";
}

function buildEditableSessionFromTemplate(
  row: SessionTemplateRow | null,
  sortOrder: number,
  exerciseNameMap: Record<string, string>,
  distanceUnit: DistanceUnit = "km",
): EditableSession | null {
  if (!row) {
    return null;
  }

  const legacyDuration =
    typeof row.session_data?.legacy_duration === "string" ? row.session_data.legacy_duration : "";

  return {
    localId: makeLocalId("session"),
    dbId: null,
    dayLabel: "",
    sortOrder,
    type: mapTemplateToEditableSessionType(row),
    name: row.name ?? formatOptionLabel(row.subtype) ?? `Session ${sortOrder}`,
    description: row.type === "functional" ? buildFunctionalDescriptionForDisplay(row, distanceUnit) : row.description ?? "",
    duration: row.duration_minutes != null ? `${row.duration_minutes} min` : legacyDuration,
    intensity: row.target_intensity ?? "",
    isKeySession: Boolean(row.is_key_session),
    sessionTemplateId: row.id,
    runTimeType: "any",
    isTimeStrict: false,
    dayNumber: "",
    numSets: (row.session_data as any)?.num_sets?.toString() ?? "",
    setDurationMinutes: (row.session_data as any)?.set_duration_minutes?.toString() ?? "",
    activity: row.activity ?? "",
    subtype: row.subtype ?? "",
    distanceKm: convertKmToDisplayDistance(row.distance_km, distanceUnit),
    exercises: (row.session_template_exercises ?? [])
      .slice()
      .sort((a, b) => a.exercise_order - b.exercise_order)
      .map((exercise) => ({
        localId: makeLocalId("exercise"),
        dbId: null,
        exerciseId: exercise.exercise_id,
        exerciseName: exerciseNameMap[exercise.exercise_id] ?? exercise.exercise_id,
        sortOrder: exercise.exercise_order,
        sets: exercise.sets ?? "",
        reps: exercise.reps ?? "",
        durationSeconds: exercise.duration ?? "",
        notes: exercise.notes ?? "",
      })),
  };
}

function mapToForm(
  template: ProgramTemplateRow,
  weeks: ProgramTemplateWeekRow[],
  sessions: ProgramTemplateSessionRow[],
  exerciseNameMap: Record<string, string>,
): TemplateForm {
  const sessionsByWeek = new Map<string, ProgramTemplateSessionRow[]>();

  for (const session of sessions) {
    const existing = sessionsByWeek.get(session.program_template_week_id) ?? [];
    existing.push(session);
    sessionsByWeek.set(session.program_template_week_id, existing);
  }

  return {
    raceName: "",
    name: template.name,
    slug: template.slug,
    description: template.description ?? "",
    discipline: template.discipline,
    planLengthWeeks: String(template.plan_length_weeks ?? ""),
    trainingDaysPerWeek: String(template.training_days_per_week ?? ""),
    startingFitness: template.starting_fitness,
    eventGoal: template.event_goal ?? "",
    distance: template.distance ?? "",
    isFeatured: template.is_featured,
    isPersonalised: template.is_personalised,
    isActive: template.is_active,
    minWeeklyTrainingHours: template.min_weekly_training_hours?.toString() ?? "",
    minLongestRecentSessionMinutes: template.min_longest_recent_session_minutes?.toString() ?? "",
    minTrainingConsistencyWeeks: template.min_training_consistency_weeks?.toString() ?? "",
    minBackToBackDays: template.min_back_to_back_days?.toString() ?? "",
    requiresHills: template.requires_hills,
    requiresLoadCarriage: template.requires_load_carriage,
    requiresHeatAcclimation: template.requires_heat_acclimation,
    suitableRaceGoals: (template.suitable_race_goals ?? []).join(", "),
    weeks: weeks
      .slice()
      .sort((a, b) => a.week_number - b.week_number)
      .map((week) => ({
        localId: makeLocalId("week"),
        dbId: week.id,
        weekNumber: week.week_number,
        focus: week.focus ?? "",
        notes: week.notes ?? "",
        sessions: (sessionsByWeek.get(week.id) ?? [])
          .slice()
          .sort((a, b) => {
            const dayA = a.day_number ?? 0;
            const dayB = b.day_number ?? 0;
            if (dayA !== dayB) return dayA - dayB;
            return a.sort_order - b.sort_order;
          })
          .map((session) => ({
            localId: makeLocalId("session"),
            dbId: session.id,
            dayLabel: session.day_label,
            sortOrder: session.sort_order,
            type: session.type,
            name: session.name,
            description: session.description ?? "",
            duration: session.duration_minutes != null
              ? String(session.duration_minutes)
              : getDurationMinutesInput(session.duration),
            intensity: session.intensity ?? "",
            isKeySession: session.is_key_session,
            sessionTemplateId: session.session_template_id ?? "",
            runTimeType: session.run_time_type ?? "any",
            isTimeStrict: Boolean(session.is_time_strict),
            dayNumber: session.day_number?.toString() ?? "",
            numSets: session.num_sets?.toString() ?? "",
            setDurationMinutes: session.set_duration_minutes?.toString() ?? "",
            // Extended session fields
            activity: session.activity ?? "",
            subtype: session.subtype ?? "",
            distanceKm: session.distance_km?.toString() ?? "",
            terrain: session.terrain ?? "",
            elevation: session.elevation_gain_meters?.toString() ?? "",
            packWeightKg: session.pack_weight_kg?.toString() ?? "",
            strides: session.strides ?? "",
            warmUpMinutes: session.warmup_minutes?.toString() ?? "",
            coolDownMinutes: session.cooldown_minutes?.toString() ?? "",
            intervalReps: session.interval_reps?.toString() ?? "",
            intervalDuration: session.interval_duration ?? "",
            reason: session.reason ?? "",
            tags: session.tags ?? [],
            exercises: (session.program_template_session_exercises ?? [])
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((exercise) => ({
                localId: makeLocalId("exercise"),
                dbId: exercise.id,
                exerciseId: exercise.exercise_id,
                exerciseName: exerciseNameMap[exercise.exercise_id] ?? exercise.exercise_id,
                sortOrder: exercise.sort_order,
                sets: exercise.sets?.toString() ?? "",
                reps: exercise.reps?.toString() ?? "",
                durationSeconds: exercise.duration_seconds?.toString() ?? "",
                notes: exercise.notes ?? "",
              })),
          })),
      })),
  };
}

function renderWeekFocusChartFromTemplate(weeks: EditableWeek[]) {
  if (!weeks.length) return null;

  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  const getColor = (focus: string | null) => {
    const f = (focus || "").toLowerCase();
    if (f.includes("base")) return "#16a34a";
    if (f.includes("build")) return "#2563eb";
    if (f.includes("volume")) return "#22c55e";
    if (f.includes("intensity")) return "#dc2626";
    if (f.includes("taper") || f.includes("peak")) return "#7c3aed";
    return "#9ca3af";
  };

  const barWidth = 14;
  const gap = 4;
  const height = 80;
  const width = sorted.length * (barWidth + gap);

  return (
    <div className="mt-4">
      <svg width="100%" height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
        {sorted.map((week, i) => {
          const x = i * (barWidth + gap);
          const color = getColor(week.focus);

          return (
            <g key={week.localId}>
              <rect x={x} y={10} width={barWidth} height={height} fill={color} rx={2} />
              <text x={x + barWidth / 2} y={height + 18} fontSize="8" textAnchor="middle" fill="#555">
                {week.weekNumber}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getExerciseHeading(exercise: EditableExercise) {
  return exercise.exerciseName || exercise.exerciseId || `Exercise ${exercise.sortOrder}`;
}

/* ─────────────────────────────────────────────────────────────
   Race course profile types + helpers
   ───────────────────────────────────────────────────────────── */

type ElevationStats = {
  totalAscentM: number;
  totalDescentM: number;
  climbPerKm: number;
  totalDistanceKm: number;
  maxGradientPct: number;
};

type TerrainSegment = { type: string; label: string; percentage: number; distanceKm?: number };

type PositionedTerrainSegment = { startKm: number; endKm: number; type: string; label: string };

type SustainedSegment = {
  startKm: number;
  endKm: number;
  lengthKm: number;
  avgGradient: number;
  totalElevationM: number;
  type: "climb" | "descent" | "flat";
};

type SegmentNote = {
  start_km: number;
  end_km: number;
  note: string;
  trainingFocus?: string[];
};

type RaceProfile = {
  elevation: ElevationStats | null;
  terrain: TerrainSegment[] | null;
  positionedTerrain: PositionedTerrainSegment[] | null;
  sustainedSegments: SustainedSegment[] | null;
  segmentNotes: SegmentNote[] | null;
};

function parseElevationStats(value: string | null | undefined): ElevationStats | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (typeof p.totalAscentM !== "number" || typeof p.totalDistanceKm !== "number") return null;
    const dist = p.totalDistanceKm;
    return {
      totalAscentM: p.totalAscentM,
      totalDescentM: typeof p.totalDescentM === "number" ? p.totalDescentM : 0,
      climbPerKm: typeof p.climbPerKm === "number" ? p.climbPerKm : (dist > 0 ? p.totalAscentM / dist : 0),
      totalDistanceKm: dist,
      maxGradientPct: typeof p.maxGradientPct === "number" ? p.maxGradientPct : 0,
    };
  } catch { return null; }
}

function parseTerrainBreakdownData(value: string | null | undefined): TerrainSegment[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(p.segments)) return null;
    const segs = (p.segments as unknown[]).flatMap((s): TerrainSegment[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.type !== "string" || typeof r.label !== "string" || typeof r.percentage !== "number") return [];
      return [{ type: r.type, label: r.label, percentage: r.percentage,
                distanceKm: typeof r.distanceKm === "number" ? r.distanceKm : undefined }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function parseSustainedSegmentsData(value: string | null | undefined): SustainedSegment[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const segs = p.flatMap((s): SustainedSegment[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (
        typeof r.startKm !== "number" || typeof r.endKm !== "number" ||
        typeof r.lengthKm !== "number" || typeof r.avgGradient !== "number" ||
        typeof r.totalElevationM !== "number" ||
        (r.type !== "climb" && r.type !== "descent" && r.type !== "flat")
      ) return [];
      return [{ startKm: r.startKm, endKm: r.endKm, lengthKm: r.lengthKm,
                avgGradient: r.avgGradient, totalElevationM: r.totalElevationM,
                type: r.type as SustainedSegment["type"] }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function parsePositionedTerrainData(value: string | null | undefined): PositionedTerrainSegment[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const segs = p.flatMap((s): PositionedTerrainSegment[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.startKm !== "number" || typeof r.endKm !== "number" ||
          typeof r.type !== "string" || typeof r.label !== "string") return [];
      return [{ startKm: r.startKm, endKm: r.endKm, type: r.type, label: r.label }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function getTerrainLabelsForRange(
  positionedTerrain: PositionedTerrainSegment[] | null,
  startKm: number,
  endKm: number,
): string[] {
  if (!positionedTerrain) return [];
  // Find overlapping terrain segments, weighted by overlap length
  const weighted = new Map<string, number>();
  for (const seg of positionedTerrain) {
    const overlapStart = Math.max(seg.startKm, startKm);
    const overlapEnd = Math.min(seg.endKm, endKm);
    if (overlapEnd <= overlapStart) continue;
    const len = overlapEnd - overlapStart;
    weighted.set(seg.label, (weighted.get(seg.label) ?? 0) + len);
  }
  // Return labels sorted by coverage, descending
  return [...weighted.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);
}

function parseSegmentNotesData(value: string | null | undefined): SegmentNote[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const notes = p.flatMap((n): SegmentNote[] => {
      if (!n || typeof n !== "object") return [];
      const r = n as Record<string, unknown>;
      if (typeof r.start_km !== "number" || typeof r.end_km !== "number" || typeof r.note !== "string") return [];
      return [{
        start_km: r.start_km, end_km: r.end_km, note: r.note,
        trainingFocus: Array.isArray(r.trainingFocus)
          ? (r.trainingFocus as unknown[]).filter((v): v is string => typeof v === "string")
          : undefined,
      }];
    });
    return notes.length > 0 ? notes : null;
  } catch { return null; }
}

/* ─────────────────────────────────────────────────────────────
   SessionModal — centered dialog for editing a session
   ───────────────────────────────────────────────────────────── */

type SessionSlideOverProps = {
  session: EditableSession;
  distanceUnit: DistanceUnit;
  isPersonalised: boolean;
  onSaveFromForm: (formData: UnifiedSessionFormData) => void;
  onFieldChange: (updater: (s: EditableSession) => EditableSession) => void;
  onAddExercise: (exerciseId: string, exerciseName: string) => void;
  onRemoveExercise: (exerciseLocalId: string) => void;
  onUpdateExercise: (exerciseLocalId: string, updater: (e: EditableExercise) => EditableExercise) => void;
  onClose: () => void;
};

function SessionSlideOver({
  session,
  distanceUnit,
  isPersonalised,
  onSaveFromForm,
  onFieldChange,
  onAddExercise,
  onRemoveExercise,
  onUpdateExercise,
  onClose,
}: SessionSlideOverProps) {
  const isGym = session.type === "Gym";

  // Exercise picker state
  const [supabase] = useState(() => createClient());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"name" | "muscle">("name");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState<{ label: string; values: string[] } | null>(null);
  const [pickerResults, setPickerResults] = useState<{ id: string; name: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Name search — debounced
  useEffect(() => {
    if (pickerTab !== "name") return;
    const q = pickerSearch.trim();
    if (!q) { setPickerResults([]); return; }
    const id = window.setTimeout(async () => {
      setPickerLoading(true);
      const { data } = await supabase
        .from("exercises")
        .select("id, name")
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(20);
      setPickerResults((data ?? []) as { id: string; name: string }[]);
      setPickerLoading(false);
    }, 300);
    return () => window.clearTimeout(id);
  }, [pickerSearch, pickerTab, supabase]);

  // Muscle search — fires immediately on muscle selection
  useEffect(() => {
    if (pickerTab !== "muscle" || !selectedMuscle) {
      if (pickerTab === "muscle") setPickerResults([]);
      return;
    }
    setPickerLoading(true);
    const orParts = selectedMuscle.values.flatMap((v) => [
      `primary_muscles.cs.{${v}}`,
      `secondary_muscles.cs.{${v}}`,
    ]);
    supabase
      .from("exercises")
      .select("id, name")
      .or(orParts.join(","))
      .order("name")
      .limit(50)
      .then(({ data }) => {
        setPickerResults((data ?? []) as { id: string; name: string }[]);
        setPickerLoading(false);
      });
  }, [selectedMuscle, pickerTab, supabase]);

  function closePicker() {
    setShowPicker(false);
    setPickerSearch("");
    setPickerResults([]);
    setPickerTab("name");
    setSelectedMuscle(null);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Centered modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>

          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4">
            <div className="min-w-0 flex-1 pr-4">
              <input
                value={session.name}
                onChange={(e) => onFieldChange((s) => ({ ...s, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base font-semibold text-zinc-900 focus:border-zinc-500 focus:outline-none"
                placeholder="Session name"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
            >
              Close
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Meta row — type / day */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-zinc-700">
                Session type
                <select
                  value={session.type}
                  onChange={(e) => onFieldChange((s) => ({ ...s, type: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                >
                  {sessionTypeOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  {!sessionTypeOptions.includes(session.type) && (
                    <option value={session.type}>{session.type}</option>
                  )}
                </select>
              </label>

              {!isPersonalised && (
                <label className="text-sm font-medium text-zinc-700">
                  Day of week
                  <select
                    value={session.dayLabel}
                    onChange={(e) => onFieldChange((s) => ({ ...s, dayLabel: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                  >
                    <option value="">— Any day —</option>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {/* Why this session */}
            <label className="block text-sm font-medium text-zinc-700">
              Why this session?
              <textarea
                value={session.reason ?? ""}
                onChange={(e) => onFieldChange((s) => ({ ...s, reason: e.target.value }))}
                rows={3}
                placeholder="Explain why this session is included and how it relates to the goal race…"
                className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              />
            </label>

            {/* Activity details (non-gym) */}
            {!isGym && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <h5 className="mb-3 text-sm font-semibold text-zinc-900">Activity details</h5>
                <UnifiedSessionForm
                  key={`modal-${session.localId}-${distanceUnit}`}
                  distanceUnit={distanceUnit}
                  initialData={mapSessionToUnifiedFormData(session)}
                  onSave={onSaveFromForm}
                  onCancel={onClose}
                  submitButtonLabel="Save Session"
                  progressiveReveal
                  disableActivityAutoDefault={!session.activity}
                />
              </div>
            )}

            {/* Exercises (gym sessions) */}
            {isGym && (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-4">
                  <h5 className="text-sm font-semibold">Exercises</h5>
                  {!showPicker && (
                    <button
                      type="button"
                      onClick={() => setShowPicker(true)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                    >
                      Add Exercise
                    </button>
                  )}
                </div>

                {/* Exercise picker */}
                {showPicker && (
                  <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-3">
                    {/* Picker header */}
                    <div className="mb-3 flex items-center justify-between gap-2">
                      {/* Tabs */}
                      <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => { setPickerTab("name"); setPickerResults([]); setSelectedMuscle(null); }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${pickerTab === "name" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                          Search by name
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPickerTab("muscle"); setPickerSearch(""); setPickerResults([]); }}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${pickerTab === "muscle" ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}
                        >
                          Search by muscle
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={closePicker}
                        className="text-sm text-zinc-400 hover:text-zinc-600"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Name tab */}
                    {pickerTab === "name" && (
                      <input
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="e.g. Romanian deadlift, box jump…"
                        autoFocus
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                      />
                    )}

                    {/* Muscle tab */}
                    {pickerTab === "muscle" && (
                      <div className="flex flex-wrap gap-1.5">
                        {MUSCLE_OPTIONS.map((m) => (
                          <button
                            key={m.label}
                            type="button"
                            onClick={() => setSelectedMuscle(selectedMuscle?.label === m.label ? null : m)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                              selectedMuscle?.label === m.label
                                ? "border-zinc-800 bg-zinc-800 text-white"
                                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Results */}
                    {pickerLoading && (
                      <p className="mt-3 text-sm text-zinc-400">Searching…</p>
                    )}
                    {!pickerLoading && pickerResults.length > 0 && (
                      <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
                        {pickerResults.map((ex) => (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() => { onAddExercise(ex.id, ex.name); closePicker(); }}
                            className="block w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm hover:bg-zinc-100"
                          >
                            {ex.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {!pickerLoading && pickerTab === "name" && pickerSearch.trim() && pickerResults.length === 0 && (
                      <p className="mt-3 text-sm text-zinc-400">No exercises found.</p>
                    )}
                    {!pickerLoading && pickerTab === "muscle" && selectedMuscle && pickerResults.length === 0 && (
                      <p className="mt-3 text-sm text-zinc-400">No exercises found for {selectedMuscle.label}.</p>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  {session.exercises.map((exercise) => (
                    <div key={exercise.localId} className="rounded-xl border border-zinc-200 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <div className="text-sm font-medium text-zinc-700">
                          {getExerciseHeading(exercise)}
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveExercise(exercise.localId)}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-4">
                        <label className="text-sm font-medium text-zinc-700 sm:col-span-4">
                          Exercise name
                          <div className="mt-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                            {exercise.exerciseName || <span className="text-zinc-400 italic">No exercise selected</span>}
                          </div>
                        </label>
                        <label className="text-sm font-medium text-zinc-700">
                          Sets
                          <input
                            value={exercise.sets}
                            onChange={(e) => onUpdateExercise(exercise.localId, (ex) => ({ ...ex, sets: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-zinc-700">
                          Reps
                          <input
                            value={exercise.reps}
                            onChange={(e) => onUpdateExercise(exercise.localId, (ex) => ({ ...ex, reps: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-zinc-700">
                          Duration (s)
                          <input
                            value={exercise.durationSeconds}
                            onChange={(e) => onUpdateExercise(exercise.localId, (ex) => ({ ...ex, durationSeconds: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                          />
                        </label>
                        <label className="text-sm font-medium text-zinc-700 sm:col-span-4">
                          Notes
                          <input
                            value={exercise.notes}
                            onChange={(e) => onUpdateExercise(exercise.localId, (ex) => ({ ...ex, notes: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  {session.exercises.length === 0 && !showPicker && (
                    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-500">
                      No exercises yet. Click "Add Exercise" to search and add one.
                    </div>
                  )}
                </div>

                {/* Gym close button */}
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-emerald-700 bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function EditProgramTemplatePage() {
  const supabase = createClient();
  const params = useParams();
  const rawTemplateId = params?.templateId;
  const templateId =
    typeof rawTemplateId === "string"
      ? rawTemplateId
      : Array.isArray(rawTemplateId)
        ? rawTemplateId[0]
        : "";

  const [form, setForm] = useState<TemplateForm | null>(null);
  const [exerciseNameMap, setExerciseNameMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const [sessionPanel, setSessionPanel] = useState<SessionPanel>(null);
  const [sessionTemplateSearch, setSessionTemplateSearch] = useState("");
  const [sessionTemplateResults, setSessionTemplateResults] = useState<SessionTemplateRow[]>([]);
  const [pendingSessionReason, setPendingSessionReason] = useState("");
  const [searchingTemplates, setSearchingTemplates] = useState(false);
  const [races, setRaces] = useState<RaceRow[]>([]);
  const [raceSearchQuery, setRaceSearchQuery] = useState("");
  const [isLoadingRaces, setIsLoadingRaces] = useState(true);
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [raceProfile, setRaceProfile] = useState<RaceProfile | null>(null);
  const [loadingRaceProfile, setLoadingRaceProfile] = useState(false);

  const [collapsedWeekLocalIds, setCollapsedWeekLocalIds] = useState<Record<string, boolean>>({});
  const [editingSessionSlot, setEditingSessionSlot] = useState<EditingSessionSlot | null>(null);

  const filteredRaces = useMemo(() => {
    const query = raceSearchQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    return races
      .filter((race) =>
        [
          race.name,
          formatDistanceLabelFromKm(race.distance_km, distanceUnit),
          race.terrain_type,
          race.climate_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 8);
  }, [distanceUnit, raceSearchQuery, races]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      if (!templateId) {
        setLoadError("Program template not found.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");
      setStatusMessage("");

      const [{ data: exerciseData, error: exerciseError }, { data: templateData, error: templateError }] =
        await Promise.all([
          supabase.from("exercises").select("id, name"),
          supabase
            .from("program_templates")
            .select(`
              id,
              name,
              slug,
              description,
              discipline,
              plan_length_weeks,
              training_days_per_week,
              starting_fitness,
              event_goal,
              distance,
              is_featured,
              is_active,
              min_weekly_training_hours,
              min_longest_recent_session_minutes,
              min_training_consistency_weeks,
              min_back_to_back_days,
              requires_hills,
              requires_gym,
              requires_load_carriage,
              requires_heat_acclimation,
              suitable_race_goals,
              race_id
            `)
            .eq("id", templateId)
            .maybeSingle(),
        ]);

      if (cancelled) return;

      if (exerciseError) {
        setLoadError(exerciseError.message);
        setIsLoading(false);
        return;
      }

      const exerciseMap = Object.fromEntries(
        ((exerciseData ?? []) as ExerciseRow[]).map((row) => [row.id, row.name]),
      );
      setExerciseNameMap(exerciseMap);

      if (templateError) {
        setLoadError(templateError.message);
        setIsLoading(false);
        return;
      }

      if (!templateData) {
        setLoadError("Program template not found.");
        setIsLoading(false);
        return;
      }

      const { data: weekData, error: weekError } = await supabase
        .from("program_template_weeks")
        .select("id, program_template_id, week_number, focus, notes")
        .eq("program_template_id", templateId)
        .order("week_number", { ascending: true });

      if (cancelled) return;

      if (weekError) {
        setLoadError(weekError.message);
        setIsLoading(false);
        return;
      }

      const typedWeeks = (weekData ?? []) as ProgramTemplateWeekRow[];
      const weekIds = typedWeeks.map((week) => week.id);

      let sessionRows: ProgramTemplateSessionRow[] = [];

      if (weekIds.length > 0) {
        const { data: sessionData, error: sessionError } = await supabase
          .from("program_template_sessions")
          .select(`
            id,
            program_template_week_id,
            day_label,
            sort_order,
            type,
            name,
            description,
            duration,
            duration_minutes,
            intensity,
            is_key_session,
            session_template_id,
            run_time_type,
            is_time_strict,
            week_number,
            day_number,
            num_sets,
            set_duration_minutes,
            activity,
            subtype,
            distance_km,
            terrain,
            elevation_gain_meters,
            pack_weight_kg,
            strides,
            warmup_minutes,
            cooldown_minutes,
            interval_reps,
            interval_duration,
            reason,
            tags,
            program_template_session_exercises (
              id,
              program_template_session_id,
              exercise_id,
              sort_order,
              sets,
              reps,
              duration_seconds,
              notes
            )
          `)
          .in("program_template_week_id", weekIds)
          .order("week_number", { ascending: true })
          .order("day_number", { ascending: true })
          .order("sort_order", { ascending: true });

        if (cancelled) return;

        if (sessionError) {
          setLoadError(sessionError.message);
          setIsLoading(false);
          return;
        }

        sessionRows = (sessionData ?? []) as ProgramTemplateSessionRow[];
      }

      const tpl = templateData as ProgramTemplateRow;
      const nextForm = mapToForm(tpl, typedWeeks, sessionRows, exerciseMap);
      setForm(nextForm);
      setSelectedRaceId(tpl.race_id ?? null);
      setIsLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRaces() {
      setIsLoadingRaces(true);

      const { data, error } = await supabase
        .from("races")
        .select("id, name, distance_km, terrain_type, climate_type")
        .order("name");

      if (cancelled) return;

      if (error) {
        setStatusMessage(`Could not load races: ${error.message}`);
        setRaces([]);
      } else {
        setRaces((data ?? []) as RaceRow[]);
      }

      setIsLoadingRaces(false);
    }

    void loadRaces();

    return () => {
      cancelled = true;
    };
  }, []);

  // Once races load, resolve the display name and search query from selectedRaceId
  useEffect(() => {
    if (!selectedRaceId || races.length === 0) return;
    const match = races.find((r) => r.id === selectedRaceId);
    if (match) {
      updateForm("raceName", match.name);
      setRaceSearchQuery(match.name);
    }
  }, [selectedRaceId, races]);

  // Fetch course profile from races_meta when a race is selected
  useEffect(() => {
    let cancelled = false;
    if (!selectedRaceId) { setRaceProfile(null); return; }
    setLoadingRaceProfile(true);
    void supabase
      .from("races_meta")
      .select("meta_key, meta_value")
      .eq("race_id", selectedRaceId)
      .in("meta_key", ["elevation_profile", "terrain_breakdown", "terrain_segments", "sustained_segments", "segment_training_notes"])
      .then(({ data }) => {
        if (cancelled) return;
        const meta: Record<string, string> = {};
        for (const row of (data ?? [])) {
          const r = row as { meta_key: string; meta_value: string };
          meta[r.meta_key] = r.meta_value;
        }
        setRaceProfile({
          elevation: parseElevationStats(meta.elevation_profile),
          terrain: parseTerrainBreakdownData(meta.terrain_breakdown),
          positionedTerrain: parsePositionedTerrainData(meta.terrain_segments),
          sustainedSegments: parseSustainedSegmentsData(meta.sustained_segments),
          segmentNotes: parseSegmentNotesData(meta.segment_training_notes),
        });
        setLoadingRaceProfile(false);
      });
    return () => { cancelled = true; };
  }, [selectedRaceId]);

  useEffect(() => {
    if (sessionPanel?.mode !== "template-picker") {
      setSessionTemplateSearch("");
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

    const timeoutId = window.setTimeout(() => {
      void searchSessionTemplates(trimmed);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [sessionTemplateSearch, sessionPanel]);

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
  }

  function handleDistanceUnitChange(nextUnit: DistanceUnit) {
    if (nextUnit === distanceUnit) return;
    setForm((current) => (current ? convertFormDistances(current, distanceUnit, nextUnit) : current));
    setDistanceUnit(nextUnit);
  }

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
        `
        id,
        name,
        description,
        type,
        activity,
        subtype,
        duration_minutes,
        distance_km,
        target_intensity,
        session_data,
        is_key_session,
        session_template_exercises (
          id,
          session_template_id,
          exercise_id,
          exercise_order,
          sets,
          reps,
          duration,
          notes
        )
      `,
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

  const sortedWeeks = useMemo(() => {
    return form?.weeks.slice().sort((a, b) => a.weekNumber - b.weekNumber) ?? [];
  }, [form]);

  function toggleWeekCollapsed(weekLocalId: string) {
    setCollapsedWeekLocalIds((current) => ({
      ...current,
      [weekLocalId]: !current[weekLocalId],
    }));
  }

  function updateForm<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateWeek(localId: string, updater: (week: EditableWeek) => EditableWeek) {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        weeks: current.weeks.map((week) => (week.localId === localId ? updater(week) : week)),
      };
    });
  }

  function addWeek() {
    setForm((current) => {
      if (!current) return current;
      const nextWeekNumber = Math.max(0, ...current.weeks.map((week) => week.weekNumber)) + 1;
      return {
        ...current,
        planLengthWeeks: String(nextWeekNumber),
        weeks: [
          ...current.weeks,
          {
            localId: makeLocalId("week"),
            dbId: null,
            weekNumber: nextWeekNumber,
            focus: "Base",
            notes: "",
            sessions: [],
          },
        ],
      };
    });
  }

  function removeWeek(weekLocalId: string) {
    setForm((current) => {
      if (!current) return current;
      const remainingWeeks = current.weeks
        .filter((week) => week.localId !== weekLocalId)
        .sort((a, b) => a.weekNumber - b.weekNumber)
        .map((week, index) => ({ ...week, weekNumber: index + 1 }));

      return {
        ...current,
        planLengthWeeks: String(remainingWeeks.length),
        weeks: remainingWeeks,
      };
    });
  }

  function updateSession(
    weekLocalId: string,
    sessionLocalId: string,
    updater: (session: EditableSession) => EditableSession,
  ) {
    updateWeek(weekLocalId, (week) => ({
      ...week,
      sessions: week.sessions.map((session) =>
        session.localId === sessionLocalId ? updater(session) : session,
      ),
    }));
  }

  function addBlankSessionAndEdit(weekLocalId: string) {
    const newLocalId = makeLocalId("session");
    updateWeek(weekLocalId, (week) => {
      const nextSortOrder = Math.max(0, ...week.sessions.map((s) => s.sortOrder)) + 1;
      return {
        ...week,
        sessions: [
          ...week.sessions,
          {
            localId: newLocalId,
            dbId: null,
            dayLabel: "",
            sortOrder: nextSortOrder,
            type: "Easy",
            name: `Session ${nextSortOrder}`,
            description: "",
            duration: "",
            intensity: "",
            isKeySession: false,
            sessionTemplateId: "",
            runTimeType: "any",
            isTimeStrict: false,
            dayNumber: "",
            numSets: "",
            setDurationMinutes: "",
            exercises: [],
            activity: "",
            subtype: "",
            distanceKm: "",
            terrain: "",
            elevation: "",
            packWeightKg: "",
            strides: "",
            warmUpMinutes: "",
            coolDownMinutes: "",
            intervalReps: "",
            intervalDuration: "",
            reason: "",
            tags: [],
          },
        ],
      };
    });
    setSessionPanel(null);
    setEditingSessionSlot({ weekLocalId, sessionLocalId: newLocalId });
  }

  function handleUpdateSessionFromForm(
    weekLocalId: string,
    sessionLocalId: string,
    formData: UnifiedSessionFormData,
  ) {
    updateSession(weekLocalId, sessionLocalId, (session) =>
      applyUnifiedFormDataToSession(session, formData, distanceUnit),
    );
    setEditingSessionSlot(null);
    showTemporaryStatus("Session updated.", 1500);
  }

  async function openTemplateSessionPicker(weekLocalId: string, sessionType: "gym" | "functional" | "mobility") {
    setSessionPanel({ mode: "template-picker", weekLocalId, sessionType });
    setSessionTemplateSearch("");
    setSearchingTemplates(true);

    // Load session templates of the specified type when picker opens
    const { data, error } = await supabase
      .from("session_templates")
      .select(
        `
        id,
        name,
        description,
        type,
        activity,
        subtype,
        duration_minutes,
        distance_km,
        target_intensity,
        session_data,
        is_key_session,
        session_template_exercises (
          id,
          session_template_id,
          exercise_id,
          exercise_order,
          sets,
          reps,
          duration,
          notes
        )
      `,
      )
      .eq("type", sessionType)
      .order("name", { ascending: true });

    setSearchingTemplates(false);

    if (!error && data) {
      setSessionTemplateResults((data ?? []) as SessionTemplateRow[]);
    } else {
      setSessionTemplateResults([]);
    }
  }

  function cancelPendingTemplateSession() {
    setSessionPanel(null);
    setSessionTemplateSearch("");
    setSessionTemplateResults([]);
    setSearchingTemplates(false);
    setPendingSessionReason("");
  }


  function createSessionFromTemplateRow(template: SessionTemplateRow, reason?: string) {
    if (sessionPanel?.mode !== "template-picker") return;

    updateWeek(sessionPanel.weekLocalId, (week) => {
      const nextSortOrder = Math.max(0, ...week.sessions.map((session) => session.sortOrder)) + 1;
      const builtSession = buildEditableSessionFromTemplate(
        template,
        nextSortOrder,
        exerciseNameMap,
        distanceUnit,
      );

      if (!builtSession) {
        return week;
      }

      return {
        ...week,
        sessions: [...week.sessions, { ...builtSession, reason: reason || "" }],
      };
    });

    cancelPendingTemplateSession();
    setPendingSessionReason("");
    showTemporaryStatus(`${template.name || "Template session"} added.`, 1500);
  }

  function removeSession(weekLocalId: string, sessionLocalId: string) {
    updateWeek(weekLocalId, (week) => ({
      ...week,
      sessions: week.sessions
        .filter((session) => session.localId !== sessionLocalId)
        .map((session, index) => ({ ...session, sortOrder: index + 1 })),
    }));
  }

  function updateExercise(
    weekLocalId: string,
    sessionLocalId: string,
    exerciseLocalId: string,
    updater: (exercise: EditableExercise) => EditableExercise,
  ) {
    updateSession(weekLocalId, sessionLocalId, (session) => ({
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.localId === exerciseLocalId ? updater(exercise) : exercise,
      ),
    }));
  }

  function addExercise(weekLocalId: string, sessionLocalId: string, exerciseId = "", exerciseName = "") {
    updateSession(weekLocalId, sessionLocalId, (session) => ({
      ...session,
      exercises: [
        ...session.exercises,
        {
          localId: makeLocalId("exercise"),
          dbId: null,
          exerciseId,
          exerciseName,
          sortOrder: session.exercises.length + 1,
          sets: "",
          reps: "",
          durationSeconds: "",
          notes: "",
        },
      ],
    }));
  }

  function removeExercise(weekLocalId: string, sessionLocalId: string, exerciseLocalId: string) {
    updateSession(weekLocalId, sessionLocalId, (session) => ({
      ...session,
      exercises: session.exercises
        .filter((exercise) => exercise.localId !== exerciseLocalId)
        .map((exercise, index) => ({ ...exercise, sortOrder: index + 1 })),
    }));
  }

  function validateTemplate(): string | null {
    if (!form) return "No template loaded.";
    if (form.weeks.length === 0) return "Add at least one week before saving.";

    for (const week of form.weeks) {
      if (week.sessions.length === 0) {
        return `Week ${week.weekNumber} has no sessions. Add at least one session or remove the week.`;
      }
      for (const session of week.sessions) {
        if (!session.name.trim()) {
          return `A session in Week ${week.weekNumber} has no name. Please give every session a name.`;
        }
        if (session.type === "Gym" && session.exercises.length === 0 && !session.sessionTemplateId) {
          return `The gym session "${session.name}" in Week ${week.weekNumber} has no exercises. Add at least one exercise or link it to a session template.`;
        }
      }
    }

    return null;
  }

  async function saveTemplate() {
    if (!form || !templateId) return;

    const validationError = validateTemplate();
    if (validationError) {
      setStatusMessage(validationError);
      return;
    }

    setIsSaving(true);
    setStatusMessage("");

    const derivedName = buildAutoName(form.raceName, form.startingFitness, form.distance, form.eventGoal, form.weeks);
    const finalName = derivedName || form.name.trim() || "Untitled Template";

    // Derive plan length from actual week count (min 1 to satisfy check constraint)
    const derivedPlanLength = Math.max(1, form.weeks.length);

    // Derive training days per week as max non-rest sessions across weeks (min 1 to satisfy check constraint)
    const dayCounts = form.weeks.map((w) => w.sessions.filter((s) => s.type !== "Rest").length);
    const derivedTrainingDays = dayCounts.length > 0 ? Math.max(1, Math.max(...dayCounts)) : 1;

    const templatePayload = {
      name: finalName,
      slug: slugify(finalName),
      description: form.description || null,
      discipline: form.discipline.trim() || "general",
      plan_length_weeks: derivedPlanLength,
      training_days_per_week: derivedTrainingDays,
      starting_fitness: form.startingFitness.trim() || "",
      event_goal: form.eventGoal.trim() || null,
      distance: form.distance || null,
      is_featured: form.isFeatured,
      is_personalised: form.isPersonalised,
      is_active: form.isActive,
      min_weekly_training_hours: form.minWeeklyTrainingHours.trim() ? Number(form.minWeeklyTrainingHours) : null,
      min_longest_recent_session_minutes: form.minLongestRecentSessionMinutes.trim() ? Number(form.minLongestRecentSessionMinutes) : null,
      min_training_consistency_weeks: form.minTrainingConsistencyWeeks.trim() ? Number(form.minTrainingConsistencyWeeks) : null,
      min_back_to_back_days: form.minBackToBackDays.trim() ? Number(form.minBackToBackDays) : null,
      requires_hills: form.weeks.some((w) => w.sessions.some(sessionRequiresHills)),
      requires_gym: form.weeks.some((w) => w.sessions.some((s) => s.type === "Gym")),
      requires_load_carriage: form.requiresLoadCarriage,
      requires_heat_acclimation: form.requiresHeatAcclimation,
      suitable_race_goals: form.suitableRaceGoals
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      race_id: selectedRaceId ?? null,
    };

    const { error: templateError } = await supabase
      .from("program_templates")
      .update(templatePayload)
      .eq("id", templateId);

    if (templateError) {
      setIsSaving(false);
      setStatusMessage(`Could not save template: ${templateError.message}`);
      return;
    }

    const existingWeekIds = form.weeks.map((week) => week.dbId).filter(Boolean) as string[];

    const { data: currentWeekRows, error: currentWeekError } = await supabase
      .from("program_template_weeks")
      .select("id")
      .eq("program_template_id", templateId);

    if (currentWeekError) {
      setIsSaving(false);
      setStatusMessage(`Could not load existing weeks: ${currentWeekError.message}`);
      return;
    }

    const currentWeekIds = (currentWeekRows ?? []).map((row) => row.id as string);
    const weekIdsToDelete = currentWeekIds.filter((id) => !existingWeekIds.includes(id));

    if (weekIdsToDelete.length > 0) {
      const { error: deleteWeeksError } = await supabase
        .from("program_template_weeks")
        .delete()
        .in("id", weekIdsToDelete);

      if (deleteWeeksError) {
        setIsSaving(false);
        setStatusMessage(`Could not delete removed weeks: ${deleteWeeksError.message}`);
        return;
      }
    }

    const weekIdMap = new Map<string, string>();

    for (const week of [...form.weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
      if (week.dbId) {
        const { error: updateWeekError } = await supabase
          .from("program_template_weeks")
          .update({
            week_number: week.weekNumber,
            focus: week.focus || null,
            notes: week.notes || null,
          })
          .eq("id", week.dbId);

        if (updateWeekError) {
          setIsSaving(false);
          setStatusMessage(`Could not save week ${week.weekNumber}: ${updateWeekError.message}`);
          return;
        }

        weekIdMap.set(week.localId, week.dbId);
      } else {
        const { data: insertedWeek, error: insertWeekError } = await supabase
          .from("program_template_weeks")
          .insert({
            program_template_id: templateId,
            week_number: week.weekNumber,
            focus: week.focus || null,
            notes: week.notes || null,
          })
          .select("id")
          .single();

        if (insertWeekError || !insertedWeek) {
          setIsSaving(false);
          setStatusMessage(
            `Could not create week ${week.weekNumber}: ${insertWeekError?.message || "Unknown error"}`,
          );
          return;
        }

        weekIdMap.set(week.localId, insertedWeek.id as string);
      }
    }

    for (const week of form.weeks) {
      const persistedWeekId = weekIdMap.get(week.localId);
      if (!persistedWeekId) continue;

      const { data: currentSessionRows, error: currentSessionError } = await supabase
        .from("program_template_sessions")
        .select("id")
        .eq("program_template_week_id", persistedWeekId);

      if (currentSessionError) {
        setIsSaving(false);
        setStatusMessage(
          `Could not load sessions for week ${week.weekNumber}: ${currentSessionError.message}`,
        );
        return;
      }

      const existingSessionIds = week.sessions.map((session) => session.dbId).filter(Boolean) as string[];
      const currentSessionIds = (currentSessionRows ?? []).map((row) => row.id as string);
      const sessionIdsToDelete = currentSessionIds.filter((id) => !existingSessionIds.includes(id));

      if (sessionIdsToDelete.length > 0) {
        const { error: deleteSessionsError } = await supabase
          .from("program_template_sessions")
          .delete()
          .in("id", sessionIdsToDelete);

        if (deleteSessionsError) {
          setIsSaving(false);
          setStatusMessage(`Could not delete removed sessions: ${deleteSessionsError.message}`);
          return;
        }
      }

      for (const [sessionIndex, session] of week.sessions
        .slice()
        .sort((a, b) => {
          const dayA = Number.parseInt(a.dayNumber || "0", 10) || 0;
          const dayB = Number.parseInt(b.dayNumber || "0", 10) || 0;
          if (dayA !== dayB) return dayA - dayB;
          return a.sortOrder - b.sortOrder;
        })
        .entries()) {
        const sessionPayload = {
          program_template_week_id: persistedWeekId,
          day_label: session.dayLabel,
          sort_order: sessionIndex + 1,
          type: session.type,
          name: session.name || `Week ${week.weekNumber} Session ${sessionIndex + 1}`,
          description: session.description || null,
          duration: null,
          duration_minutes: parseDurationMinutesForSave(session.duration),
          intensity: session.intensity || null,
          is_key_session: session.isKeySession,
          session_template_id: session.sessionTemplateId.trim() || null,
          run_time_type: session.runTimeType || null,
          is_time_strict: session.isTimeStrict,
          week_number: week.weekNumber,
          day_number: Number.parseInt(session.dayNumber || "0", 10) || null,
          num_sets: session.numSets ? Number.parseInt(session.numSets, 10) || null : null,
          set_duration_minutes: session.setDurationMinutes ? parseFloat(session.setDurationMinutes) || null : null,
          // Extended session fields
          activity: session.activity || null,
          subtype: session.subtype || null,
          distance_km: parseDisplayDistanceToKm(session.distanceKm, distanceUnit),
          terrain: session.terrain || null,
          elevation_gain_meters: session.elevation ? parseInt(session.elevation, 10) || null : null,
          pack_weight_kg: session.packWeightKg ? parseFloat(session.packWeightKg) || null : null,
          strides: session.strides || null,
          warmup_minutes: session.warmUpMinutes ? parseInt(session.warmUpMinutes, 10) || null : null,
          cooldown_minutes: session.coolDownMinutes ? parseInt(session.coolDownMinutes, 10) || null : null,
          interval_reps: session.intervalReps ? parseInt(session.intervalReps, 10) || null : null,
          interval_duration: session.intervalDuration || null,
          reason: session.reason || null,
          tags: (session.tags && session.tags.length > 0) ? session.tags : null,
        };

        let persistedSessionId = session.dbId;

        if (session.dbId) {
          const { error: updateSessionError } = await supabase
            .from("program_template_sessions")
            .update(sessionPayload)
            .eq("id", session.dbId);

          if (updateSessionError) {
            setIsSaving(false);
            setStatusMessage(`Could not save session "${session.name}": ${updateSessionError.message}`);
            return;
          }
        } else {
          const { data: insertedSession, error: insertSessionError } = await supabase
            .from("program_template_sessions")
            .insert(sessionPayload)
            .select("id")
            .single();

          if (insertSessionError || !insertedSession) {
            setIsSaving(false);
            setStatusMessage(
              `Could not create session "${session.name}": ${insertSessionError?.message || "Unknown error"}`,
            );
            return;
          }

          persistedSessionId = insertedSession.id as string;
        }

        if (!persistedSessionId) continue;

        const { data: currentExerciseRows, error: currentExerciseError } = await supabase
          .from("program_template_session_exercises")
          .select("id")
          .eq("program_template_session_id", persistedSessionId);

        if (currentExerciseError) {
          setIsSaving(false);
          setStatusMessage(
            `Could not load exercises for session "${session.name}": ${currentExerciseError.message}`,
          );
          return;
        }

        const existingExerciseIds = session.exercises.map((exercise) => exercise.dbId).filter(Boolean) as string[];
        const currentExerciseIds = (currentExerciseRows ?? []).map((row) => row.id as string);
        const exerciseIdsToDelete = currentExerciseIds.filter((id) => !existingExerciseIds.includes(id));

        if (exerciseIdsToDelete.length > 0) {
          const { error: deleteExercisesError } = await supabase
            .from("program_template_session_exercises")
            .delete()
            .in("id", exerciseIdsToDelete);

          if (deleteExercisesError) {
            setIsSaving(false);
            setStatusMessage(`Could not delete removed exercises: ${deleteExercisesError.message}`);
            return;
          }
        }

        for (const [exerciseIndex, exercise] of session.exercises
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .entries()) {
          const exercisePayload = {
            program_template_session_id: persistedSessionId,
            exercise_id: exercise.exerciseId,
            sort_order: exerciseIndex + 1,
            sets: exercise.sets.trim() ? Number(exercise.sets) : null,
            reps: exercise.reps.trim() ? Number(exercise.reps) : null,
            duration_seconds: exercise.durationSeconds.trim() ? Number(exercise.durationSeconds) : null,
            notes: exercise.notes || null,
          };

          if (!exercisePayload.exercise_id) {
            continue;
          }

          if (exercise.dbId) {
            const { error: updateExerciseError } = await supabase
              .from("program_template_session_exercises")
              .update(exercisePayload)
              .eq("id", exercise.dbId);

            if (updateExerciseError) {
              setIsSaving(false);
              setStatusMessage(
                `Could not save an exercise in "${session.name}": ${updateExerciseError.message}`,
              );
              return;
            }
          } else {
            const { error: insertExerciseError } = await supabase
              .from("program_template_session_exercises")
              .insert(exercisePayload);

            if (insertExerciseError) {
              setIsSaving(false);
              setStatusMessage(
                `Could not create an exercise in "${session.name}": ${insertExerciseError.message}`,
              );
              return;
            }
          }
        }
      }
    }

    setIsSaving(false);
    setStatusMessage("Template saved.");
    window.setTimeout(() => window.location.reload(), 500);
  }

  if (isLoading) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            Loading template…
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !form) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not load template: {loadError || "Unknown error"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Edit Program Template</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Load the template from the URL, edit anything, and save the changes directly.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-lg border border-zinc-300 bg-white p-1" aria-label="Distance units">
              {(["km", "mi"] as DistanceUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => handleDistanceUnitChange(unit)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    distanceUnit === unit
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {unit === "km" ? "km" : "mi"}
                </button>
              ))}
            </div>
            <Link
              href="/coach/program-templates"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Back to Templates
            </Link>
            <Link
              href={`/coach/program-templates/${templateId}`}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              View Template
            </Link>
            <button
              type="button"
              onClick={() => void saveTemplate()}
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Template"}
            </button>
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {/* Auto-generated name preview */}
          <div className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Template name (auto-generated)</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">
              {buildAutoName(form.raceName, form.startingFitness, form.distance, form.eventGoal, form.weeks) ||
                <span className="font-normal italic text-zinc-400">Will be generated from settings and weeks</span>}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Updates automatically when you change settings or add/remove weeks. Saved on each Save.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-zinc-700 md:col-span-2">
              Race
              <input
                type="text"
                value={raceSearchQuery}
                onChange={(e) => setRaceSearchQuery(e.target.value)}
                placeholder={isLoadingRaces ? "Loading races..." : "Search races by name, terrain, or climate"}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              />
              {form.raceName ? (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <span className="font-medium">Selected: {form.raceName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      updateForm("raceName", "");
                      setRaceSearchQuery("");
                      setSelectedRaceId(null);
                    }}
                    className="text-xs font-semibold text-emerald-800 underline"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              {raceSearchQuery.trim().length >= 2 && filteredRaces.length > 0 ? (
                <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  {filteredRaces.map((race) => {
                    const details = [
                      formatDistanceLabelFromKm(race.distance_km, distanceUnit),
                      race.terrain_type,
                      race.climate_type,
                    ].filter(Boolean);

                    return (
                      <button
                        key={race.id}
                        type="button"
                        onClick={() => {
                          updateForm("raceName", race.name);
                          setRaceSearchQuery(race.name);
                          setSelectedRaceId(race.id);
                        }}
                        className="block w-full border-b border-zinc-100 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-zinc-50"
                      >
                        <span className="block font-semibold text-zinc-900">{race.name}</span>
                        {details.length > 0 ? (
                          <span className="mt-1 block text-xs text-zinc-500">{details.join(" · ")}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {raceSearchQuery.trim().length >= 2 && !isLoadingRaces && filteredRaces.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500">No matching races found.</p>
              ) : null}
            </label>

            {/* Course Profile panel */}
            {selectedRaceId && (
              <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h3 className="mb-3 text-sm font-semibold text-amber-900 uppercase tracking-wide">Course Profile</h3>
                {loadingRaceProfile ? (
                  <p className="text-sm text-amber-700">Loading course data…</p>
                ) : !raceProfile || (!raceProfile.elevation && !raceProfile.terrain && !raceProfile.sustainedSegments && !raceProfile.segmentNotes) ? (
                  <p className="text-sm italic text-amber-700">No course data available for this race yet.</p>
                ) : (
                  <div className="space-y-5">

                    {/* Key elevation stats */}
                    {raceProfile.elevation && (
                      <div className="flex flex-wrap gap-3">
                        {[
                          { label: "Distance", value: `${raceProfile.elevation.totalDistanceKm.toFixed(1)} km` },
                          { label: "Total ascent", value: `${Math.round(raceProfile.elevation.totalAscentM).toLocaleString()} m` },
                          { label: "Total descent", value: `${Math.round(raceProfile.elevation.totalDescentM).toLocaleString()} m` },
                          { label: "Climb / km", value: `${raceProfile.elevation.climbPerKm.toFixed(1)} m/km` },
                          ...(raceProfile.elevation.maxGradientPct > 0
                            ? [{ label: "Max gradient", value: `${raceProfile.elevation.maxGradientPct.toFixed(0)}%` }]
                            : []),
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs">
                            <span className="block text-zinc-500">{label}</span>
                            <span className="block font-semibold text-zinc-900">{value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Terrain surface breakdown */}
                    {raceProfile.terrain && raceProfile.terrain.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-800">Terrain surface</p>
                        <div className="flex flex-wrap gap-2">
                          {raceProfile.terrain.map((seg) => (
                            <span key={seg.type} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                              {seg.label} — {Math.round(seg.percentage)}%
                              {seg.distanceKm != null ? ` (${seg.distanceKm.toFixed(1)} km)` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sustained climbs / descents */}
                    {raceProfile.sustainedSegments && raceProfile.sustainedSegments.filter((s) => s.type !== "flat").length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-800">Major climbs &amp; descents</p>
                        <div className="space-y-1">
                          {raceProfile.sustainedSegments
                            .filter((s) => s.type !== "flat")
                            .sort((a, b) => Math.abs(b.avgGradient) - Math.abs(a.avgGradient))
                            .slice(0, 8)
                            .map((seg, i) => {
                              const isClimb = seg.type === "climb";
                              const terrainLabels = getTerrainLabelsForRange(raceProfile.positionedTerrain, seg.startKm, seg.endKm);
                              return (
                                <div key={i} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs">
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${isClimb ? "bg-orange-100 text-orange-800" : "bg-sky-100 text-sky-800"}`}>
                                    {isClimb ? "↑ Climb" : "↓ Descent"}
                                  </span>
                                  <span className="text-zinc-700">
                                    km {seg.startKm.toFixed(1)}–{seg.endKm.toFixed(1)}
                                    {" · "}{seg.lengthKm.toFixed(1)} km
                                    {" · "}{Math.abs(seg.avgGradient).toFixed(1)}% avg
                                    {" · "}{Math.abs(Math.round(seg.totalElevationM))} m
                                    {terrainLabels.length > 0 && (
                                      <span className="ml-2 text-zinc-500">— {terrainLabels.join(", ")}</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Segment training notes */}
                    {raceProfile.segmentNotes && raceProfile.segmentNotes.length > 0 && (
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-800">Training focus notes</p>
                        <div className="space-y-2">
                          {raceProfile.segmentNotes.map((n, i) => (
                            <div key={i} className="rounded-lg bg-white px-3 py-2 text-xs">
                              <span className="font-medium text-zinc-600">km {n.start_km.toFixed(1)}–{n.end_km.toFixed(1)}: </span>
                              <span className="text-zinc-700">{n.note}</span>
                              {n.trainingFocus && n.trainingFocus.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {n.trainingFocus.map((tag) => (
                                    <span key={tag} className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800">{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            <label className="text-sm font-medium text-zinc-700 md:col-span-2">
              Description
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              />
            </label>

            <label className="text-sm font-medium text-zinc-700">
              Starting fitness
              <select
                value={form.startingFitness}
                onChange={(e) => updateForm("startingFitness", e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              >
                <option value="beginner">Beginner</option>
                <option value="novice">Novice</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>

            <label className="text-sm font-medium text-zinc-700">
              Distance
              <select
                value={form.distance}
                onChange={(e) => updateForm("distance", e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              >
                {DISTANCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium text-zinc-700">
              Event goal
              <select
                value={form.eventGoal}
                onChange={(e) => updateForm("eventGoal", e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              >
                <option value="">— select —</option>
                {RACE_GOAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ["Featured", form.isFeatured, (value: boolean) => updateForm("isFeatured", value)],
              ["Personalised", form.isPersonalised, (value: boolean) => updateForm("isPersonalised", value)],
              ["Active", form.isActive, (value: boolean) => updateForm("isActive", value)],
              ["Requires load carriage", form.requiresLoadCarriage, (value: boolean) => updateForm("requiresLoadCarriage", value)],
              ["Requires heat acclimation", form.requiresHeatAcclimation, (value: boolean) => updateForm("requiresHeatAcclimation", value)],
            ].map(([label, checked, onChange]) => (
              <label
                key={label as string}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={checked as boolean}
                  onChange={(e) => (onChange as (value: boolean) => void)(e.target.checked)}
                  className="h-4 w-4"
                />
                <span>{label as string}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Weeks and Sessions</h2>
              {renderWeekFocusChartFromTemplate(sortedWeeks)}
              <p className="mt-1 text-sm text-zinc-600">
                Use the weekday quick-add buttons to search session templates or add sessions from scratch.
              </p>
            </div>

            <button
              type="button"
              onClick={addWeek}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Add Week
            </button>
          </div>

          <div className="space-y-6">
            {sortedWeeks.map((week) => {
              const theme = getWeekFocusTheme(week.focus);
              const isCollapsed = collapsedWeekLocalIds[week.localId] !== false;
              const sortedSessions = week.sessions
                .slice()
                .sort((a, b) => {
                  const dayDiff = getDayOrderIndex(a.dayLabel) - getDayOrderIndex(b.dayLabel);
                  if (dayDiff !== 0) return dayDiff;
                  return a.sortOrder - b.sortOrder;
                });

              return (
                <div key={week.localId} className={`rounded-2xl border p-4 ${theme.card}`}>
                  <button
                    type="button"
                    onClick={() => toggleWeekCollapsed(week.localId)}
                    className="mb-4 flex w-full items-center justify-between gap-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className={`text-lg font-semibold ${theme.accent}`}>Week {week.weekNumber}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badge}`}>
                        {week.focus || "Unspecified"}
                      </span>
                      <span className="text-xs font-medium text-zinc-500">
                        {isCollapsed ? "Show details" : "Hide details"}
                      </span>
                    </div>

                    <span className={`text-lg font-semibold ${theme.accent}`}>{isCollapsed ? "+" : "−"}</span>
                  </button>

                  {!isCollapsed ? (
                    <Fragment>
                      <div className="mb-4 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => addBlankSessionAndEdit(week.localId)}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                        >
                          Add Blank Session
                        </button>

                        <button
                          type="button"
                          onClick={() => openTemplateSessionPicker(week.localId, "gym")}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                            sessionPanel?.mode === "template-picker" && sessionPanel.weekLocalId === week.localId && sessionPanel.sessionType === "gym"
                              ? "border-zinc-900 bg-indigo-600 text-white"
                              : "border-zinc-300 bg-white hover:bg-zinc-100"
                          }`}
                        >
                          Add Gym Session
                        </button>

                        <button
                          type="button"
                          onClick={() => openTemplateSessionPicker(week.localId, "functional")}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                            sessionPanel?.mode === "template-picker" && sessionPanel.weekLocalId === week.localId && sessionPanel.sessionType === "functional"
                              ? "border-zinc-900 bg-indigo-600 text-white"
                              : "border-zinc-300 bg-white hover:bg-zinc-100"
                          }`}
                        >
                          Add Functional Session
                        </button>

                        <button
                          type="button"
                          onClick={() => openTemplateSessionPicker(week.localId, "mobility")}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                            sessionPanel?.mode === "template-picker" && sessionPanel.weekLocalId === week.localId && sessionPanel.sessionType === "mobility"
                              ? "border-zinc-900 bg-indigo-600 text-white"
                              : "border-zinc-300 bg-white hover:bg-zinc-100"
                          }`}
                        >
                          Add Mobility Session
                        </button>

                        <button
                          type="button"
                          onClick={() => removeWeek(week.localId)}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Remove Week
                        </button>
                      </div>

                      <div className="mb-4 grid gap-4 md:grid-cols-2">
                        <label className="text-sm font-medium text-zinc-700">
                          Focus
                          <select
                            value={week.focus}
                            onChange={(e) => updateWeek(week.localId, (current) => ({ ...current, focus: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                          >
                            {weekFocusOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                            {!weekFocusOptions.includes(week.focus) && week.focus ? (
                              <option value={week.focus}>{week.focus}</option>
                            ) : null}
                          </select>
                        </label>

                        <label className="text-sm font-medium text-zinc-700">
                          Notes
                          <input
                            value={week.notes}
                            onChange={(e) => updateWeek(week.localId, (current) => ({ ...current, notes: e.target.value }))}
                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                          />
                        </label>
                      </div>

                      {sessionPanel?.mode === "template-picker" && sessionPanel.weekLocalId === week.localId ? (
                        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-zinc-900">
                                Add {sessionPanel.sessionType === "gym" ? "Gym" : sessionPanel.sessionType === "mobility" ? "Mobility" : "Functional"} Session
                              </h4>
                              <p className="mt-1 text-sm text-zinc-600">
                                Select from existing {sessionPanel.sessionType} session templates below.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={cancelPendingTemplateSession}
                              className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                            >
                              Cancel
                            </button>
                          </div>

                          <div className="mt-4 space-y-4">
                            <input
                              value={sessionTemplateSearch}
                              onChange={(e) => setSessionTemplateSearch(e.target.value)}
                              placeholder={`Filter templates (type to search)…`}
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                            />

                            <label className="block">
                              <span className="mb-1 block text-sm font-medium text-zinc-700">Reason (optional)</span>
                              <textarea
                                value={pendingSessionReason}
                                onChange={(e) => setPendingSessionReason(e.target.value)}
                                placeholder="Why you've inserted this session (for the athlete)"
                                className="min-h-15 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                              />
                            </label>
                          </div>

                          <div className="mt-4 space-y-3">
                            {searchingTemplates ? (
                              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                Loading session templates…
                              </div>
                            ) : sessionTemplateResults.length === 0 ? (
                              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                {sessionTemplateSearch.trim() ? "No session templates matched that search." : "No session templates available."}
                              </div>
                            ) : (
                              sessionTemplateResults.map((template) => {
                                const detailParts = [
                                  template.type ? formatOptionLabel(template.type) : "",
                                  template.activity ? formatOptionLabel(template.activity) : "",
                                  template.subtype ? formatOptionLabel(template.subtype) : "",
                                  template.duration_minutes != null ? `${template.duration_minutes} min` : "",
                                  formatDistanceLabelFromKm(template.distance_km, distanceUnit),
                                  template.target_intensity ?? "",
                                ].filter(Boolean);

                                return (
                                  <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => createSessionFromTemplateRow(template, pendingSessionReason)}
                                    className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                                  >
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
                                  </button>
                                );
                              })
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                addBlankSessionAndEdit(sessionPanel?.mode === "template-picker" ? sessionPanel.weekLocalId : "")
                              }
                              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                            >
                              Add Blank Session
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-4">
                        {sortedSessions.map((session) => (
                          <div key={session.localId} className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-base font-semibold">{session.name || "Untitled Session"}</h4>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                                  <span>{session.type}</span>
                                  {session.dayLabel && <span>{session.dayLabel}</span>}
                                  {session.duration && <span>{session.duration} min</span>}
                                  {session.type === "Gym" && (
                                    <span>{session.exercises.length} exercise{session.exercises.length !== 1 ? "s" : ""}</span>
                                  )}
                                </div>
                                {session.description && (
                                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{session.description}</p>
                                )}
                                {session.reason && (
                                  <p className="mt-1 line-clamp-1 text-xs italic text-zinc-400">{session.reason}</p>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingSessionSlot({ weekLocalId: week.localId, sessionLocalId: session.localId })}
                                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeSession(week.localId, session.localId)}
                                  className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}

                        {sortedSessions.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-500">
                            No sessions in this week yet.
                          </div>
                        ) : null}
                      </div>
                    </Fragment>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Session slide-over panel — rendered at page root so it's not clipped by overflow */}
      {editingSessionSlot && (() => {
        const slideWeek = form.weeks.find((w) => w.localId === editingSessionSlot.weekLocalId);
        const slideSession = slideWeek?.sessions.find((s) => s.localId === editingSessionSlot.sessionLocalId);
        if (!slideSession) return null;
        return (
          <SessionSlideOver
            session={slideSession}
            distanceUnit={distanceUnit}
            isPersonalised={form.isPersonalised}
            onSaveFromForm={(formData) =>
              handleUpdateSessionFromForm(editingSessionSlot.weekLocalId, editingSessionSlot.sessionLocalId, formData)
            }
            onFieldChange={(updater) =>
              updateSession(editingSessionSlot.weekLocalId, editingSessionSlot.sessionLocalId, updater)
            }
            onAddExercise={(exerciseId, exerciseName) => addExercise(editingSessionSlot.weekLocalId, editingSessionSlot.sessionLocalId, exerciseId, exerciseName)}
            onRemoveExercise={(exerciseLocalId) =>
              removeExercise(editingSessionSlot.weekLocalId, editingSessionSlot.sessionLocalId, exerciseLocalId)
            }
            onUpdateExercise={(exerciseLocalId, updater) =>
              updateExercise(editingSessionSlot.weekLocalId, editingSessionSlot.sessionLocalId, exerciseLocalId, updater)
            }
            onClose={() => setEditingSessionSlot(null)}
          />
        );
      })()}
    </main>
  );
}

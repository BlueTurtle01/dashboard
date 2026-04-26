"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UnifiedSessionForm, type UnifiedSessionFormData } from "@/app/coach/components/UnifiedSessionForm";

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
  intensity: string | null;
  is_key_session: boolean;
  session_template_id: string | null;
  run_time_type: string | null;
  run_start_time: string | null;
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
  runStartTime: string;
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
  isActive: boolean;
  minWeeklyTrainingHours: string;
  minLongestRecentSessionMinutes: string;
  minTrainingConsistencyWeeks: string;
  minBackToBackDays: string;
  requiresHills: boolean;
  requiresGym: boolean;
  requiresLoadCarriage: boolean;
  requiresHeatAcclimation: boolean;
  suitableRaceGoals: string;
  weeks: EditableWeek[];
};

type PendingTemplateSessionSlot = {
  weekLocalId: string;
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

const canonicalDayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

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
  "Easy",
  "Steady",
  "Long",
  "Recovery",
  "Rest",
  "Gym",
  "Tempo",
  "Intervals",
  "Hill Reps",
  "Race Specific",
  "Loaded March",
  "Recce",
  "Navigation",
];

const runTimeTypeOptions = ["any", "morning", "afternoon", "evening"];

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
  startingFitness: string,
  distance: string,
  eventGoal: string,
  weeks: EditableWeek[],
): string {
  const parts: string[] = [];
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
  return dayAliases[dayLabel.trim().toLowerCase()] ?? dayLabel.trim().toLowerCase();
}

function getDayOrderIndex(dayLabel: string) {
  return canonicalDayOrder.indexOf(
    normalizeDayLabel(dayLabel) as (typeof canonicalDayOrder)[number],
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
  weekNumber: number,
  sortOrder: number,
  exerciseNameMap: Record<string, string>,
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
    description: row.type === "functional" ? buildFunctionalDescription(row) : row.description ?? "",
    duration: row.duration_minutes != null ? `${row.duration_minutes} min` : legacyDuration,
    intensity: row.target_intensity ?? "",
    isKeySession: Boolean(row.is_key_session),
    sessionTemplateId: row.id,
    runTimeType: "any",
    runStartTime: "",
    isTimeStrict: false,
    dayNumber: "",
    numSets: (row.session_data as any)?.num_sets?.toString() ?? "",
    setDurationMinutes: (row.session_data as any)?.set_duration_minutes?.toString() ?? "",
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
    isActive: template.is_active,
    minWeeklyTrainingHours: template.min_weekly_training_hours?.toString() ?? "",
    minLongestRecentSessionMinutes: template.min_longest_recent_session_minutes?.toString() ?? "",
    minTrainingConsistencyWeeks: template.min_training_consistency_weeks?.toString() ?? "",
    minBackToBackDays: template.min_back_to_back_days?.toString() ?? "",
    requiresHills: template.requires_hills,
    requiresGym: template.requires_gym,
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
            duration: session.duration ?? "",
            intensity: session.intensity ?? "",
            isKeySession: session.is_key_session,
            sessionTemplateId: session.session_template_id ?? "",
            runTimeType: session.run_time_type ?? "any",
            runStartTime: session.run_start_time ?? "",
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
  const [pendingSessionSlot, setPendingSessionSlot] = useState<PendingTemplateSessionSlot | null>(null);
  const [pendingSessionType, setPendingSessionType] = useState<"gym" | "functional" | "mobility" | null>(null);
  const [sessionTemplateSearch, setSessionTemplateSearch] = useState("");
  const [sessionTemplateResults, setSessionTemplateResults] = useState<SessionTemplateRow[]>([]);
  const [searchingTemplates, setSearchingTemplates] = useState(false);

  const [collapsedWeekLocalIds, setCollapsedWeekLocalIds] = useState<Record<string, boolean>>({});
  const [creatingBlankSessionWeekId, setCreatingBlankSessionWeekId] = useState<string | null>(null);

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
              suitable_race_goals
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
            intensity,
            is_key_session,
            session_template_id,
            run_time_type,
            run_start_time,
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

      setForm(mapToForm(templateData as ProgramTemplateRow, typedWeeks, sessionRows, exerciseMap));
      setIsLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    if (!pendingSessionSlot) {
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
  }, [sessionTemplateSearch, pendingSessionSlot]);

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
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

  function addBlankSession(weekLocalId: string, formData?: UnifiedSessionFormData) {
    updateWeek(weekLocalId, (week) => {
      const nextSortOrder = Math.max(0, ...week.sessions.map((session) => session.sortOrder)) + 1;

      return {
        ...week,
        sessions: [
          ...week.sessions,
          {
            localId: makeLocalId("session"),
            dbId: null,
            dayLabel: "",
            sortOrder: nextSortOrder,
            type: formData?.subtype ? formatOptionLabel(formData.subtype) : "Easy",
            name: (() => {
              const parts: string[] = [];
              if (formData?.targetIntensity) parts.push(formData.targetIntensity);
              if (formData?.subtype) parts.push(formatOptionLabel(formData.subtype));
              if (formData?.distanceKm) parts.push(`${formData.distanceKm}km`);
              else if (formData?.durationMinutes) parts.push(`${formData.durationMinutes}min`);
              return parts.join(" ") || `Session ${nextSortOrder}`;
            })(),
            description: formData?.description ?? "",
            duration: formData?.durationMinutes ? `${formData.durationMinutes} min` : "",
            intensity: formData?.targetIntensity ?? "",
            isKeySession: false,
            sessionTemplateId: "",
            runTimeType: formData?.timeOfDay ?? "any",
            runStartTime: "",
            isTimeStrict: false,
            dayNumber: "",
            numSets: formData?.sets ?? "",
            setDurationMinutes: formData?.setDurationSeconds ? String(parseInt(formData.setDurationSeconds) / 60) : "",
            exercises: [],
            // Store all extended fields
            activity: formData?.activity ?? "",
            subtype: formData?.subtype ?? "",
            distanceKm: formData?.distanceKm ?? "",
            terrain: formData?.terrain ?? "",
            elevation: formData?.elevation ?? "",
            packWeightKg: formData?.packWeightKg ?? "",
            strides: formData?.strides ?? "",
            warmUpMinutes: formData?.warmUpMinutes ?? "",
            coolDownMinutes: formData?.coolDownMinutes ?? "",
            intervalReps: formData?.intervalReps ?? "",
            intervalDuration: formData?.intervalDuration ?? "",
            tags: formData?.tags ?? [],
          },
        ],
      };
    });

    showTemporaryStatus("Blank session added.", 1500);
  }

  function handleCreateBlankSessionFromForm(weekLocalId: string, formData: UnifiedSessionFormData) {
    addBlankSession(weekLocalId, formData);
    setCreatingBlankSessionWeekId(null);
  }

  async function openTemplateSessionPicker(weekLocalId: string, sessionType: "gym" | "functional" | "mobility") {
    setPendingSessionSlot({ weekLocalId });
    setPendingSessionType(sessionType);
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
    setPendingSessionSlot(null);
    setPendingSessionType(null);
    setSessionTemplateSearch("");
    setSessionTemplateResults([]);
    setSearchingTemplates(false);
  }


  function createSessionFromTemplateRow(template: SessionTemplateRow) {
    if (!pendingSessionSlot) return;

    updateWeek(pendingSessionSlot.weekLocalId, (week) => {
      const nextSortOrder = Math.max(0, ...week.sessions.map((session) => session.sortOrder)) + 1;
      const builtSession = buildEditableSessionFromTemplate(
        template,
        week.weekNumber,
        nextSortOrder,
        exerciseNameMap,
      );

      if (!builtSession) {
        return week;
      }

      return {
        ...week,
        sessions: [...week.sessions, builtSession],
      };
    });

    cancelPendingTemplateSession();
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

  function addExercise(weekLocalId: string, sessionLocalId: string) {
    updateSession(weekLocalId, sessionLocalId, (session) => ({
      ...session,
      exercises: [
        ...session.exercises,
        {
          localId: makeLocalId("exercise"),
          dbId: null,
          exerciseId: "",
          exerciseName: "",
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

  async function saveTemplate() {
    if (!form || !templateId) return;

    setIsSaving(true);
    setStatusMessage("");

    const derivedName = buildAutoName(form.startingFitness, form.distance, form.eventGoal, form.weeks);
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
      is_active: form.isActive,
      min_weekly_training_hours: form.minWeeklyTrainingHours.trim() ? Number(form.minWeeklyTrainingHours) : null,
      min_longest_recent_session_minutes: form.minLongestRecentSessionMinutes.trim() ? Number(form.minLongestRecentSessionMinutes) : null,
      min_training_consistency_weeks: form.minTrainingConsistencyWeeks.trim() ? Number(form.minTrainingConsistencyWeeks) : null,
      min_back_to_back_days: form.minBackToBackDays.trim() ? Number(form.minBackToBackDays) : null,
      requires_hills: form.requiresHills,
      requires_gym: form.requiresGym,
      requires_load_carriage: form.requiresLoadCarriage,
      requires_heat_acclimation: form.requiresHeatAcclimation,
      suitable_race_goals: form.suitableRaceGoals
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
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
          duration: session.duration || null,
          intensity: session.intensity || null,
          is_key_session: session.isKeySession,
          session_template_id: session.sessionTemplateId.trim() || null,
          run_time_type: session.runTimeType || null,
          run_start_time: session.runStartTime || null,
          is_time_strict: session.isTimeStrict,
          week_number: week.weekNumber,
          day_number: Number.parseInt(session.dayNumber || "0", 10) || null,
          num_sets: session.numSets ? Number.parseInt(session.numSets, 10) || null : null,
          set_duration_minutes: session.setDurationMinutes ? parseFloat(session.setDurationMinutes) || null : null,
          // Extended session fields
          activity: session.activity || null,
          subtype: session.subtype || null,
          distance_km: session.distanceKm ? parseFloat(session.distanceKm) || null : null,
          terrain: session.terrain || null,
          elevation_gain_meters: session.elevation ? parseInt(session.elevation, 10) || null : null,
          pack_weight_kg: session.packWeightKg ? parseFloat(session.packWeightKg) || null : null,
          strides: session.strides || null,
          warmup_minutes: session.warmUpMinutes ? parseInt(session.warmUpMinutes, 10) || null : null,
          cooldown_minutes: session.coolDownMinutes ? parseInt(session.coolDownMinutes, 10) || null : null,
          interval_reps: session.intervalReps ? parseInt(session.intervalReps, 10) || null : null,
          interval_duration: session.intervalDuration || null,
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
      <main className="min-h-screen bg-zinc-50 text-zinc-900">
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
      <main className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not load template: {loadError || "Unknown error"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Edit Program Template</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Load the template from the URL, edit anything, and save the changes directly.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/coach/program-templates"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Back to Templates
            </Link>
            <button
              type="button"
              onClick={() => void saveTemplate()}
              disabled={isSaving}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
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
              {buildAutoName(form.startingFitness, form.distance, form.eventGoal, form.weeks) ||
                <span className="font-normal italic text-zinc-400">Will be generated from settings and weeks</span>}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Updates automatically when you change settings or add/remove weeks. Saved on each Save.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
              ["Active", form.isActive, (value: boolean) => updateForm("isActive", value)],
              ["Requires hills", form.requiresHills, (value: boolean) => updateForm("requiresHills", value)],
              ["Requires gym", form.requiresGym, (value: boolean) => updateForm("requiresGym", value)],
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
              const isCollapsed = Boolean(collapsedWeekLocalIds[week.localId]);
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
                          {creatingBlankSessionWeekId !== week.localId ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setCreatingBlankSessionWeekId(week.localId)}
                                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                              >
                                Add Blank Session
                              </button>

                              <button
                                type="button"
                                onClick={() => openTemplateSessionPicker(week.localId, "gym")}
                                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                                  pendingSessionSlot?.weekLocalId === week.localId && pendingSessionType === "gym"
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-zinc-300 bg-white hover:bg-zinc-100"
                                }`}
                              >
                                Add Gym Session
                              </button>

                              <button
                                type="button"
                                onClick={() => openTemplateSessionPicker(week.localId, "functional")}
                                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                                  pendingSessionSlot?.weekLocalId === week.localId && pendingSessionType === "functional"
                                    ? "border-zinc-900 bg-zinc-900 text-white"
                                    : "border-zinc-300 bg-white hover:bg-zinc-100"
                                }`}
                              >
                                Add Functional Session
                              </button>

                              <button
                                type="button"
                                onClick={() => openTemplateSessionPicker(week.localId, "mobility")}
                                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                                  pendingSessionSlot?.weekLocalId === week.localId && pendingSessionType === "mobility"
                                    ? "border-zinc-900 bg-zinc-900 text-white"
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
                            </>
                          ) : null}

                        {creatingBlankSessionWeekId === week.localId ? (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <div className="mb-4">
                              <h4 className="text-base font-semibold text-zinc-900">Create Blank Session</h4>
                              <p className="mt-1 text-sm text-zinc-600">
                                Fill in the session details below to create a new blank session.
                              </p>
                            </div>

                            <UnifiedSessionForm
                              onSave={(formData) =>
                                handleCreateBlankSessionFromForm(week.localId, formData)
                              }
                              onCancel={() => setCreatingBlankSessionWeekId(null)}
                              submitButtonLabel="Create Session"
                            />
                          </div>
                        ) : null}
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

                      {pendingSessionSlot?.weekLocalId === week.localId ? (
                        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <div>
                              <h4 className="text-base font-semibold text-zinc-900">
                                Add {pendingSessionType === "gym" ? "Gym" : "Functional"} Session
                              </h4>
                              <p className="mt-1 text-sm text-zinc-600">
                                Select from existing {pendingSessionType} session templates below.
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

                          <div className="mt-4">
                            <input
                              value={sessionTemplateSearch}
                              onChange={(e) => setSessionTemplateSearch(e.target.value)}
                              placeholder={`Filter templates (type to search)…`}
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                            />
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
                                  template.target_intensity ?? "",
                                ].filter(Boolean);

                                return (
                                  <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => createSessionFromTemplateRow(template)}
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
                                addBlankSession(pendingSessionSlot.weekLocalId)
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
                            <div className="mb-4 flex items-center justify-between gap-4">
                              <h4 className="text-base font-semibold">{session.name || "Untitled Session"}</h4>
                              <button
                                type="button"
                                onClick={() => removeSession(week.localId, session.localId)}
                                className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                              >
                                Remove Session
                              </button>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <label className="text-sm font-medium text-zinc-700">
                                Session type
                                <select
                                  value={session.type}
                                  onChange={(e) =>
                                    updateSession(week.localId, session.localId, (current) => ({
                                      ...current,
                                      type: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                >
                                  {sessionTypeOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                  {!sessionTypeOptions.includes(session.type) ? (
                                    <option value={session.type}>{session.type}</option>
                                  ) : null}
                                </select>
                              </label>

                              <label className="text-sm font-medium text-zinc-700 md:col-span-2">
                                Session name
                                <input
                                  value={session.name}
                                  onChange={(e) =>
                                    updateSession(week.localId, session.localId, (current) => ({
                                      ...current,
                                      name: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                />
                              </label>

                              {session.type !== "Intervals" && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Duration
                                  <input
                                    value={session.duration}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        duration: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 45 min"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.type === "Intervals" && (
                                <>
                                  <label className="text-sm font-medium text-zinc-700">
                                    Sets
                                    <input
                                      type="number"
                                      min="1"
                                      value={session.numSets}
                                      onChange={(e) =>
                                        updateSession(week.localId, session.localId, (current) => ({
                                          ...current,
                                          numSets: e.target.value,
                                        }))
                                      }
                                      placeholder="e.g. 8"
                                      className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                    />
                                  </label>
                                  <label className="text-sm font-medium text-zinc-700">
                                    Set Duration (min)
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={session.setDurationMinutes}
                                      onChange={(e) =>
                                        updateSession(week.localId, session.localId, (current) => ({
                                          ...current,
                                          setDurationMinutes: e.target.value,
                                        }))
                                      }
                                      placeholder="e.g. 3"
                                      className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                    />
                                  </label>
                                </>
                              )}

                              <label className="text-sm font-medium text-zinc-700">
                                Intensity
                                <input
                                  value={session.intensity}
                                  onChange={(e) =>
                                    updateSession(week.localId, session.localId, (current) => ({
                                      ...current,
                                      intensity: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                />
                              </label>

                              <label className="text-sm font-medium text-zinc-700 md:col-span-2">
                                Description
                                <textarea
                                  value={session.description}
                                  onChange={(e) =>
                                    updateSession(week.localId, session.localId, (current) => ({
                                      ...current,
                                      description: e.target.value,
                                    }))
                                  }
                                  rows={3}
                                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                />
                              </label>

                              {/* Extended session fields */}
                              {session.subtype && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Subtype
                                  <input
                                    value={session.subtype}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        subtype: e.target.value,
                                      }))
                                    }
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.distanceKm && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Distance (km)
                                  <input
                                    value={session.distanceKm}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        distanceKm: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 10"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.terrain && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Terrain
                                  <input
                                    value={session.terrain}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        terrain: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. road, trail, mixed"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.elevation && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Elevation Gain (m)
                                  <input
                                    value={session.elevation}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        elevation: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 500"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.packWeightKg && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Pack Weight (kg)
                                  <input
                                    value={session.packWeightKg}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        packWeightKg: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 15"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.strides && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Strides
                                  <input
                                    value={session.strides}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        strides: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 10x100m"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.warmUpMinutes && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Warm-up (min)
                                  <input
                                    value={session.warmUpMinutes}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        warmUpMinutes: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 10"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.coolDownMinutes && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Cool-down (min)
                                  <input
                                    value={session.coolDownMinutes}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        coolDownMinutes: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 10"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.intervalReps && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Interval Reps
                                  <input
                                    value={session.intervalReps}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        intervalReps: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 8"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              {session.intervalDuration && (
                                <label className="text-sm font-medium text-zinc-700">
                                  Interval Duration
                                  <input
                                    value={session.intervalDuration}
                                    onChange={(e) =>
                                      updateSession(week.localId, session.localId, (current) => ({
                                        ...current,
                                        intervalDuration: e.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 400m or 3min"
                                    className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                  />
                                </label>
                              )}

                              <label className="text-sm font-medium text-zinc-700">
                                Run time type
                                <select
                                  value={session.runTimeType}
                                  onChange={(e) =>
                                    updateSession(week.localId, session.localId, (current) => ({
                                      ...current,
                                      runTimeType: e.target.value,
                                    }))
                                  }
                                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                >
                                  {runTimeTypeOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </label>

                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                                <input
                                  type="checkbox"
                                  checked={session.isTimeStrict}
                                  onChange={(e) =>
                                    updateSession(week.localId, session.localId, (current) => ({
                                      ...current,
                                      isTimeStrict: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4"
                                />
                                <span>Time strict</span>
                              </label>
                            </div>

                            {!session.sessionTemplateId && !session.activity ? (
                              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                                <div className="mb-4 flex items-center justify-between gap-4">
                                  <h5 className="text-sm font-semibold">Exercises</h5>
                                  <button
                                    type="button"
                                    onClick={() => addExercise(week.localId, session.localId)}
                                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-100"
                                  >
                                    Add Exercise
                                  </button>
                                </div>

                                <div className="space-y-3">
                                  {session.exercises.map((exercise) => (
                                    <div key={exercise.localId} className="rounded-xl border border-zinc-200 bg-white p-4">
                                      <div className="mb-3 flex items-center justify-between gap-4">
                                        <div className="text-sm font-medium text-zinc-700">
                                          {getExerciseHeading(exercise)}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeExercise(week.localId, session.localId, exercise.localId)
                                          }
                                          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                                        >
                                          Remove
                                        </button>
                                      </div>

                                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                                        <label className="text-sm font-medium text-zinc-700 xl:col-span-2">
                                          Exercise id
                                          <input
                                            value={exercise.exerciseId}
                                            onChange={(e) =>
                                              updateExercise(
                                                week.localId,
                                                session.localId,
                                                exercise.localId,
                                                (current) => ({
                                                  ...current,
                                                  exerciseId: e.target.value,
                                                  exerciseName: exerciseNameMap[e.target.value] ?? e.target.value,
                                                }),
                                              )
                                            }
                                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                          />
                                        </label>

                                        <label className="text-sm font-medium text-zinc-700">
                                          Sets
                                          <input
                                            value={exercise.sets}
                                            onChange={(e) =>
                                              updateExercise(
                                                week.localId,
                                                session.localId,
                                                exercise.localId,
                                                (current) => ({ ...current, sets: e.target.value }),
                                              )
                                            }
                                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                          />
                                        </label>

                                        <label className="text-sm font-medium text-zinc-700">
                                          Reps
                                          <input
                                            value={exercise.reps}
                                            onChange={(e) =>
                                              updateExercise(
                                                week.localId,
                                                session.localId,
                                                exercise.localId,
                                                (current) => ({ ...current, reps: e.target.value }),
                                              )
                                            }
                                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                          />
                                        </label>

                                        <label className="text-sm font-medium text-zinc-700">
                                          Duration (seconds)
                                          <input
                                            value={exercise.durationSeconds}
                                            onChange={(e) =>
                                              updateExercise(
                                                week.localId,
                                                session.localId,
                                                exercise.localId,
                                                (current) => ({
                                                  ...current,
                                                  durationSeconds: e.target.value,
                                                }),
                                              )
                                            }
                                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                          />
                                        </label>

                                        <label className="text-sm font-medium text-zinc-700 xl:col-span-5">
                                          Notes
                                          <input
                                            value={exercise.notes}
                                            onChange={(e) =>
                                              updateExercise(
                                                week.localId,
                                                session.localId,
                                                exercise.localId,
                                                (current) => ({ ...current, notes: e.target.value }),
                                              )
                                            }
                                            className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  ))}

                                  {session.exercises.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-500">
                                      No exercises added yet.
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
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
    </main>
  );
}
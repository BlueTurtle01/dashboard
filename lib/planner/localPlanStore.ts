import {
  DehydratedPlan,
  GeneratedPlan,
  PlanExercise,
  PlanExerciseRecord,
  PlanRecord,
  PlanSession,
  PlanSessionRecord,
  PlanWeek,
  PlanWeekRecord,
} from "./types";
import { dehydratePlan, hydratePlan } from "./planMappers";

const STORAGE_KEY = "coach_dashboard_active_plan_v2";
const HISTORY_KEY = "coach_dashboard_plan_history_v2";
const LEGACY_STORAGE_KEY = "coach_dashboard_active_plan";
const LEGACY_HISTORY_KEY = "coach_dashboard_plan_history";

function normaliseExercise(exercise: Partial<PlanExercise>, index: number, sessionId: string): PlanExercise {
  return {
    id: exercise.id ?? `${sessionId}-exercise-${index + 1}`,
    sessionId: exercise.sessionId ?? sessionId,
    sortOrder: exercise.sortOrder ?? index + 1,
    name: exercise.name ?? "",
    description: exercise.description ?? "",
    tags: exercise.tags ?? [],
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
  };
}

function normaliseSession(session: Partial<PlanSession>, index: number, weekId: string): PlanSession {
  const sessionId = session.id ?? `${weekId}-session-${index + 1}`;

  return {
    id: sessionId,
    weekId: session.weekId ?? weekId,
    sortOrder: session.sortOrder ?? index + 1,
    dayLabel: session.dayLabel ?? "",
    type: session.type ?? "Easy",
    name: session.name ?? "",
    description: session.description ?? "",
    tags: session.tags ?? [],
    duration: session.duration ?? "",
    intensity: session.intensity ?? "",
    isKeySession: session.isKeySession ?? false,
    exercises: (session.exercises ?? []).map((exercise, exerciseIndex) =>
      normaliseExercise(exercise, exerciseIndex, sessionId)
    ),
  };
}

function normaliseLegacyPlan(raw: any): GeneratedPlan {
  const planId = raw?.id ?? `plan-${Date.now()}`;

  const weeks: PlanWeek[] = (raw?.weeks ?? []).map((week: any, weekIndex: number) => {
    const weekId = week?.id ?? `${planId}-week-${weekIndex + 1}`;

    return {
      id: weekId,
      planId,
      weekNumber: week?.weekNumber ?? weekIndex + 1,
      sortOrder: week?.sortOrder ?? weekIndex + 1,
      phase: week?.phase ?? "Base",
      focus: week?.focus ?? "",
      notes: week?.notes ?? "",
      isHolidayWeek: week?.isHolidayWeek ?? false,
      sessions: (week?.sessions ?? []).map((session: any, sessionIndex: number) =>
        normaliseSession(session, sessionIndex, weekId)
      ),
    };
  });

  return {
    id: planId,
    eventName: raw?.eventName ?? raw?.summary?.eventName ?? "",
    eventDate: raw?.eventDate ?? raw?.summary?.eventDate ?? "",
    weeksAvailable: raw?.weeksAvailable ?? raw?.summary?.weeksAvailable ?? weeks.length,
    trainingDaysPerWeek:
      raw?.trainingDaysPerWeek ?? raw?.summary?.trainingDaysPerWeek ?? 0,
    createdAt: raw?.createdAt ?? new Date().toISOString(),
    updatedAt: raw?.updatedAt ?? new Date().toISOString(),
    weeks,
    warnings: raw?.warnings ?? [],
  };
}

function isDehydratedPlan(raw: any): raw is DehydratedPlan {
  return Boolean(raw?.plan && Array.isArray(raw?.weeks) && Array.isArray(raw?.sessions) && Array.isArray(raw?.exercises));
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function saveActivePlan(plan: GeneratedPlan) {
  writeJson(STORAGE_KEY, dehydratePlan(plan));
}

export function loadActivePlan(): GeneratedPlan | null {
  const current = readJson<DehydratedPlan>(STORAGE_KEY);

  if (current && isDehydratedPlan(current)) {
    return hydratePlan(current);
  }

  const legacy = readJson<any>(LEGACY_STORAGE_KEY);
  if (legacy) {
    const migrated = normaliseLegacyPlan(legacy);
    saveActivePlan(migrated);
    return migrated;
  }

  return null;
}

export function clearActivePlan() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function savePlanSnapshot(plan: GeneratedPlan) {
  const history = loadPlanHistory();
  const next = [plan, ...history].slice(0, 10);
  writeJson(HISTORY_KEY, next.map(dehydratePlan));
}

export function loadPlanHistory(): GeneratedPlan[] {
  const current = readJson<DehydratedPlan[]>(HISTORY_KEY);
  if (Array.isArray(current)) {
    return current.filter(isDehydratedPlan).map((item) => hydratePlan(item));
  }

  const legacy = readJson<any[]>(LEGACY_HISTORY_KEY);
  if (Array.isArray(legacy)) {
    const migrated = legacy.map(normaliseLegacyPlan);
    writeJson(HISTORY_KEY, migrated.map(dehydratePlan));
    return migrated;
  }

  return [];
}

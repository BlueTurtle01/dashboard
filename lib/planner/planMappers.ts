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

function bySortOrder<T extends { sort_order: number }>(a: T, b: T) {
  return a.sort_order - b.sort_order;
}

function byDomainSortOrder<T extends { sortOrder: number }>(a: T, b: T) {
  return a.sortOrder - b.sortOrder;
}

export function dehydratePlan(plan: GeneratedPlan): DehydratedPlan {
  const planRecord: PlanRecord = {
    id: plan.id,
    event_name: plan.eventName,
    event_date: plan.eventDate,
    weeks_available: plan.weeksAvailable,
    training_days_per_week: plan.trainingDaysPerWeek,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  };

  const weeks: PlanWeekRecord[] = [];
  const sessions: PlanSessionRecord[] = [];
  const exercises: PlanExerciseRecord[] = [];

  for (const week of plan.weeks) {
    weeks.push({
      id: week.id,
      plan_id: week.planId,
      week_number: week.weekNumber,
      sort_order: week.sortOrder,
      phase: week.phase,
      focus: week.focus,
      notes: week.notes,
      is_holiday_week: week.isHolidayWeek,
    });

    for (const session of week.sessions) {
      sessions.push({
        id: session.id,
        week_id: session.weekId,
        sort_order: session.sortOrder,
        day_label: session.dayLabel,
        type: session.type,
        name: session.name,
        description: session.description,
        tags: session.tags,
        duration: session.duration,
        intensity: session.intensity,
        is_key_session: session.isKeySession,
      });

      for (const exercise of session.exercises) {
exercises.push({
  id: exercise.id,
  session_id: exercise.sessionId,
  sort_order: exercise.sortOrder,
  name: exercise.name,
  description: exercise.description,
  tags: exercise.tags,
  sets: exercise.sets,
  reps: exercise.reps,
  duration_seconds: exercise.durationSeconds ?? null,
});
      }
    }
  }

  return { plan: planRecord, weeks, sessions, exercises };
}

export function hydratePlan(data: DehydratedPlan, warnings: GeneratedPlan["warnings"] = []): GeneratedPlan {
  const exercisesBySession = new Map<string, PlanExercise[]>();

  for (const exercise of [...data.exercises].sort(bySortOrder)) {
const item: PlanExercise = {
  id: exercise.id,
  sessionId: exercise.session_id,
  sortOrder: exercise.sort_order,
  name: exercise.name,
  description: exercise.description,
  tags: exercise.tags ?? [],
  sets: exercise.sets ?? null,
  reps: exercise.reps ?? null,
  durationSeconds: exercise.duration_seconds ?? null,
};

    const list = exercisesBySession.get(exercise.session_id) ?? [];
    list.push(item);
    exercisesBySession.set(exercise.session_id, list);
  }

  const sessionsByWeek = new Map<string, PlanSession[]>();

  for (const session of [...data.sessions].sort(bySortOrder)) {
    const item: PlanSession = {
      id: session.id,
      weekId: session.week_id,
      sortOrder: session.sort_order,
      dayLabel: session.day_label,
      type: session.type,
      name: session.name,
      description: session.description,
      tags: session.tags ?? [],
      duration: session.duration,
      intensity: session.intensity,
      isKeySession: session.is_key_session,
      exercises: (exercisesBySession.get(session.id) ?? []).sort(byDomainSortOrder),
    };

    const list = sessionsByWeek.get(session.week_id) ?? [];
    list.push(item);
    sessionsByWeek.set(session.week_id, list);
  }

  const weeks: PlanWeek[] = [...data.weeks]
    .sort(bySortOrder)
    .map((week) => ({
      id: week.id,
      planId: week.plan_id,
      weekNumber: week.week_number,
      sortOrder: week.sort_order,
      phase: week.phase,
      focus: week.focus,
      notes: week.notes,
      isHolidayWeek: week.is_holiday_week,
      sessions: (sessionsByWeek.get(week.id) ?? []).sort(byDomainSortOrder),
    }));

  return {
    id: data.plan.id,
    eventName: data.plan.event_name,
    eventDate: data.plan.event_date,
    weeksAvailable: data.plan.weeks_available,
    trainingDaysPerWeek: data.plan.training_days_per_week,
    createdAt: data.plan.created_at,
    updatedAt: data.plan.updated_at,
    weeks,
    warnings,
  };
}

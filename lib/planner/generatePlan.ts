import { getPlanWarnings } from "./warnings";
import {
  GeneratedPlan,
  PlanExercise,
  PlanInput,
  PlanPhase,
  PlanSession,
  PlanSessionType,
  PlanWeek,
} from "./types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeExercise(
  sessionId: string,
  sortOrder: number,
  name: string,
  description: string,
  tags: string[],
  reps: string
): PlanExercise {
  return {
    id: `${sessionId}-exercise-${sortOrder}`,
    sessionId,
    sortOrder,
    name,
    description,
    tags,
    reps: null,
    sets: null,
    durationSeconds: null,
  };
}

function makeSession(
  id: string,
  weekId: string,
  dayLabel: string,
  sortOrder: number,
  type: PlanSessionType,
  name: string,
  description: string,
  tags: string[],
  duration: string,
  intensity: string,
  isKeySession: boolean,
  exercises: PlanExercise[] = []
): PlanSession {
  return {
    id,
    weekId,
    sortOrder,
    dayLabel,
    type,
    name,
    description,
    tags,
    duration,
    intensity,
    isKeySession,
    exercises,
  };
}

function getPhaseForWeek(weekNumber: number, weeksAvailable: number): PlanPhase {
  if (weeksAvailable <= 4) {
    if (weekNumber >= weeksAvailable) return "Taper";
    if (weekNumber === weeksAvailable - 1) return "Peak";
    return "Build";
  }

  const taperStart = weeksAvailable - 1;
  const peakStart = Math.max(weeksAvailable - 3, 1);
  const buildStart = Math.max(Math.ceil(weeksAvailable * 0.45), 2);

  if (weekNumber >= taperStart) return "Taper";
  if (weekNumber >= peakStart) return "Peak";
  if (weekNumber >= buildStart) return "Build";
  return "Base";
}

function getFocusForPhase(phase: PlanPhase, weekNumber: number): string {
  switch (phase) {
    case "Base":
      return weekNumber % 4 === 0 ? "Consolidate routine" : "Build consistency";
    case "Build":
      return weekNumber % 3 === 0 ? "Controlled progression" : "Increase load gradually";
    case "Peak":
      return "Event-specific preparation";
    case "Taper":
      return "Freshen up and reduce fatigue";
    default:
      return "General training";
  }
}

function getNotesForWeek(phase: PlanPhase, isHolidayWeek: boolean): string {
  if (isHolidayWeek) {
    return "Reduced week due to holiday. Keep frequency light and avoid trying to catch up afterwards.";
  }

  switch (phase) {
    case "Base":
      return "Prioritise routine, easy aerobic work, and finishing weeks feeling in control.";
    case "Build":
      return "Nudge duration or intensity up slightly, but keep the week sustainable.";
    case "Peak":
      return "This is one of the more event-specific weeks. Keep key sessions purposeful.";
    case "Taper":
      return "Reduce fatigue, keep some sharpness, and avoid adding extra work.";
    default:
      return "Steady week.";
  }
}

function buildSessions(
  weekId: string,
  weekNumber: number,
  trainingDaysPerWeek: number,
  phase: PlanPhase,
  isHolidayWeek: boolean,
): PlanSession[] {
  const clampedDays = clamp(trainingDaysPerWeek, 2, 6);
  const sessions: PlanSession[] = [];

  function pushSession(
    sortOrder: number,
    type: PlanSessionType,
    name: string,
    description: string,
    tags: string[],
    duration: string,
    intensity: string,
    isKeySession: boolean,
    exercises: PlanExercise[] = []
  ) {
    const sessionId = `${weekId}-session-${sortOrder}`;
    sessions.push(
      makeSession(
        sessionId,
        weekId,
        DAY_LABELS[((sortOrder - 1) * 2) % DAY_LABELS.length],
        sortOrder,
        type,
        name,
        description,
        tags,
        duration,
        intensity,
        isKeySession,
        exercises
      )
    );
  }

  if (isHolidayWeek) {
    for (let i = 1; i <= clampedDays; i += 1) {
      pushSession(
        i,
        "Easy",
        i === clampedDays ? "Short Holiday Session" : "Holiday Easy Session",
        i === clampedDays
          ? "Final session of the holiday week. Keep it short and relaxed to ease back into normal training."
          : "Holiday week session. Maintain fitness and freshness while accommodating travel or limited access to training facilities. Keep relaxed and easy.",
        ["holiday", "easy"],
        i === clampedDays ? "30 min" : "40 min",
        "Easy",
        false
      );
    }
    return sessions;
  }

  if (clampedDays >= 1) {
    pushSession(
      1,
      "Easy",
      phase === "Taper" ? "Short Easy Session" : "Easy Aerobic Session",
      phase === "Taper"
        ? "Keeps your aerobic system engaged during the taper without adding fatigue. Keeps you feeling fresh and loose."
        : "Build aerobic base and develop efficient movement at conversational pace. Develops steady-state endurance capacity.",
      ["aerobic", "easy"],
      phase === "Taper" ? "35 min" : "45 min",
      "Easy",
      false
    );
  }

  if (clampedDays >= 2) {
    pushSession(
      2,
      "Steady",
      phase === "Taper" ? "Taper Sharpener" : "Steady Session",
      phase === "Taper"
        ? "Sharpening effort just before race to maintain leg turnover and power while staying fresh."
        : "Develops threshold fitness at controlled intensity. Teaches pacing and builds mental resilience at race-relevant efforts.",
      phase === "Taper" ? ["taper", "sharpener"] : ["steady"],
      phase === "Taper" ? "40 min" : "50 min",
      "Moderate",
      false
    );
  }

  if (clampedDays >= 3) {
    pushSession(
      3,
      "Easy",
      "Support Easy Session",
      "Active recovery in mid-week. Supports adaptation from previous efforts while maintaining training consistency without adding fatigue.",
      ["easy", "support"],
      "45 min",
      "Easy",
      false
    );
  }

  if (clampedDays >= 4) {
    pushSession(
      4,
      "Long",
      phase === "Peak" ? "Peak Long Specific Session" : "Long Endurance Session",
      phase === "Peak"
        ? "Critical session at event-specific intensity and duration. Builds confidence and demonstrates fitness capacity close to race demands."
        : "Builds aerobic capacity and mental toughness. Comfortable duration increases endurance without excessive fatigue.",
      phase === "Peak" ? ["long", "specific", "key"] : ["long", "endurance"],
      phase === "Peak" ? "150 min" : "90 min",
      phase === "Peak" ? "Steady" : "Easy",
      true
    );
  }

  if (clampedDays >= 5) {
    pushSession(
      5,
      "Recovery",
      "Recovery Session",
      "Active recovery to promote blood flow and adaptation. Very easy effort aids recovery from harder sessions without adding training stress.",
      ["recovery"],
      "30 min",
      "Very Easy",
      false
    );
  }

  if (clampedDays >= 6) {
    const sessionId = `${weekId}-session-6`;
    pushSession(
      6,
      "Gym",
      "Gym Strength Session",
      "Strength training develops power and injury resilience. Single-leg and compound movements build functional strength specific to running demands while improving imbalances.",
      ["gym", "strength"],
      "45 min",
      "Moderate",
      false,
      [
        makeExercise(sessionId, 1, "Split Squat", "Single-leg strength exercise for hips and quads. Corrects imbalances and builds unilateral power.", ["legs", "strength", "unilateral"], "3 x 8 / side"),
        makeExercise(sessionId, 2, "Romanian Deadlift", "Posterior chain strength. Strengthens hamstrings and glutes essential for running power.", ["posterior-chain", "strength"], "3 x 8"),
      ]
    );
  }

  return sessions;
}

export function generatePlan(input: PlanInput): GeneratedPlan {
  const planId = crypto.randomUUID();
  const now = new Date().toISOString();
  const holidayWeeks = new Set(input.holidayWeeks ?? []);
  const weeks: PlanWeek[] = [];

  for (let index = 0; index < input.weeksAvailable; index += 1) {
    const weekNumber = index + 1;
    const weekId = `${planId}-week-${weekNumber}`;
    const phase = getPhaseForWeek(weekNumber, input.weeksAvailable);
    const isHolidayWeek = holidayWeeks.has(weekNumber);

    weeks.push({
      id: weekId,
      planId,
      weekNumber,
      sortOrder: weekNumber,
      phase,
      focus: getFocusForPhase(phase, weekNumber),
      notes: getNotesForWeek(phase, isHolidayWeek),
      sessions: buildSessions(weekId, weekNumber, input.trainingDaysPerWeek, phase, isHolidayWeek),
      isHolidayWeek,
    });
  }

  const plan: GeneratedPlan = {
    id: planId,
    eventName: input.eventName,
    eventDate: input.eventDate,
    weeksAvailable: input.weeksAvailable,
    trainingDaysPerWeek: input.trainingDaysPerWeek,
    createdAt: now,
    updatedAt: now,
    weeks,
    warnings: [],
  };

  return {
    ...plan,
    warnings: getPlanWarnings(plan),
  };
}

import { GeneratedPlan } from "./types";

export type WarningCategory = "plan_conflicts" | "preparation" | "equipment" | "duration";

export type PlanWarning = {
  category: WarningCategory;
  severity: "error" | "warning"; // error = red 🚨, warning = amber ⚠️
  message: string;
  weekNumber?: number;
  sessionId?: string;
  exerciseId?: string;
};

/**
 * Simple, straightforward warning rules.
 * Each rule is a separate function that returns warnings if conditions are met.
 */

export function checkPrepRaceConflicts(plan: GeneratedPlan): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (!plan.startDate || !plan.prepRaceMarkers || plan.prepRaceMarkers.length === 0) {
    return [];
  }

  // Build a map of races by date
  const racesByDate = new Map<string, any>();
  for (const race of plan.prepRaceMarkers) {
    const dateStr = formatDate(race.date);
    if (dateStr) {
      racesByDate.set(dateStr, race);
    }
  }

  if (racesByDate.size === 0) {
    return [];
  }

  // Check each session
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (!session.dayLabel) continue;

      const sessionDate = getSessionDate(plan.startDate, week.weekNumber, session.dayLabel);
      if (sessionDate) {
        const race = racesByDate.get(sessionDate);
        if (race) {
          warnings.push({
            category: "plan_conflicts",
            severity: "error",
            message: `Week ${week.weekNumber}: "${session.name}" scheduled on same day as prep race "${race.name}". Delete or move this session.`,
            weekNumber: week.weekNumber,
          });
        }
      }
    }
  }

  return warnings;
}

export function checkEquipmentConflicts(
  plan: GeneratedPlan,
  unavailableEquipment: string[],
  avoidedEquipment: string[]
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  const activityEquipmentMap: Record<string, string> = {
    cycling: "bicycle",
    cycle: "bicycle",
    swimming: "swimming_pool",
    swim: "swimming_pool",
    rowing: "rower",
    row: "rower",
  };

  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      const sessionEquipment = new Set<string>();

      // Check activity-based equipment
      if (session.activity) {
        const mapped = activityEquipmentMap[session.activity.toLowerCase().trim()];
        if (mapped) {
          sessionEquipment.add(mapped);
        }
      }

      // Check exercise equipment and build a map for later reference
      const exerciseEquipmentMap = new Map<string, { equipment: Set<string>; planExerciseId: string; dbExerciseId?: string }>();
      if (session.exercises && Array.isArray(session.exercises)) {
        for (const exercise of session.exercises) {
          const planExerciseId = (exercise as any).id;
          const dbExerciseId = (exercise as any).exerciseId;
          if ((exercise as any).equipment && Array.isArray((exercise as any).equipment)) {
            const equipSet = new Set<string>();
            for (const equip of (exercise as any).equipment) {
              if (equip) {
                equipSet.add(equip);
                sessionEquipment.add(equip);
              }
            }
            if (planExerciseId && equipSet.size > 0) {
              exerciseEquipmentMap.set(planExerciseId, { equipment: equipSet, planExerciseId, dbExerciseId });
            }
          }
        }
      }

      // Check unavailable equipment
      for (const equip of sessionEquipment) {
        if (unavailableEquipment.includes(equip)) {
          // Find which exercise(s) have this equipment
          let exerciseId: string | undefined;
          for (const [planExId, { equipment, dbExerciseId }] of exerciseEquipmentMap) {
            if (equipment.has(equip)) {
              // Use the DB exercise ID for alternatives lookup
              exerciseId = dbExerciseId || planExId;
              break;
            }
          }

          warnings.push({
            category: "equipment",
            severity: "error",
            message: `Week ${week.weekNumber}: "${session.name}" requires ${equip.replace(/_/g, " ")}, which the athlete doesn't have.`,
            weekNumber: week.weekNumber,
            sessionId: session.id,
            exerciseId: exerciseId,
          });
        }
      }

      // Check avoided equipment
      for (const equip of sessionEquipment) {
        if (avoidedEquipment.includes(equip)) {
          // Find which exercise(s) have this equipment
          let exerciseId: string | undefined;
          for (const [planExId, { equipment, dbExerciseId }] of exerciseEquipmentMap) {
            if (equipment.has(equip)) {
              // Use the DB exercise ID for alternatives lookup
              exerciseId = dbExerciseId || planExId;
              break;
            }
          }

          warnings.push({
            category: "equipment",
            severity: "warning",
            message: `Week ${week.weekNumber}: "${session.name}" uses ${equip.replace(/_/g, " ")}, which the athlete prefers to avoid.`,
            weekNumber: week.weekNumber,
            sessionId: session.id,
            exerciseId: exerciseId,
          });
        }
      }
    }
  }

  return warnings;
}

export function checkPlanDuration(plan: GeneratedPlan): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (!plan.startDate || !plan.eventDate || plan.weeks.length === 0) {
    return [];
  }

  try {
    const startDate = new Date(plan.startDate);
    const eventDate = new Date(plan.eventDate);

    if (isNaN(startDate.getTime()) || isNaN(eventDate.getTime())) {
      return [];
    }

    const daysAvailable = (eventDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const weeksAvailable = Math.floor(daysAvailable / 7);
    const planWeeks = plan.weeks.length;

    // If plan is less than 50% of available time AND there's more than 4 weeks gap
    if (planWeeks < weeksAvailable * 0.5 && weeksAvailable - planWeeks > 4) {
      warnings.push({
        category: "duration",
        severity: "warning",
        message: `Plan is ${planWeeks} weeks but ${weeksAvailable} weeks available until event. Consider adding more content or deload phases.`,
      });
    }

    return warnings;
  } catch {
    return [];
  }
}

export function checkLoadedTraining(plan: GeneratedPlan): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  const requiresLoadCarriage = (plan as any).requiresLoadCarriage === true ||
    (plan as any).requires_load_carriage === true;

  if (!requiresLoadCarriage) {
    return [];
  }

  const hasLoaded = plan.weeks.some((w) =>
    w.sessions.some((s) => s.type === "Loaded")
  );

  if (!hasLoaded) {
    warnings.push({
      category: "preparation",
      severity: "warning",
      message: "Plan targets load carriage event but has no Loaded March sessions. Add weighted training.",
    });
  }

  return warnings;
}

export function checkTechnicalTraining(plan: GeneratedPlan): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  const specialConditions: string[] = (plan as any).raceConditions?.specialConditions ?? [];
  const needsFieldcraft =
    specialConditions.includes("technical_terrain") ||
    specialConditions.includes("self_sufficiency") ||
    specialConditions.includes("navigation");

  if (!needsFieldcraft) {
    return [];
  }

  const hasRecce = plan.weeks.some((w) =>
    w.sessions.some((s) => s.type === "Recce")
  );
  const hasNavigation = plan.weeks.some((w) =>
    w.sessions.some((s) => s.type === "Navigation")
  );

  if (!hasRecce && !hasNavigation) {
    warnings.push({
      category: "preparation",
      severity: "warning",
      message: "Plan requires technical terrain/navigation skills but has no Recce or Navigation sessions.",
    });
  }

  return warnings;
}

export function checkMissingTaper(plan: GeneratedPlan): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (!plan.weeks || plan.weeks.length === 0) {
    return [];
  }

  // Check the last 2 weeks to see if there's a Taper phase
  const lastTwoWeeks = plan.weeks.slice(-2);
  const hasTaper = lastTwoWeeks.some((week) => week.phase === "Taper");

  if (!hasTaper) {
    warnings.push({
      category: "preparation",
      severity: "warning",
      message: "Plan is missing a Taper phase in the final weeks before the event. Consider adding a taper week for peak performance.",
    });
  }

  return warnings;
}

/**
 * Calculate all warnings for a plan
 */
export function calculateAllWarnings(
  plan: GeneratedPlan,
  unavailableEquipment: string[] = [],
  avoidedEquipment: string[] = []
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (!plan) {
    return warnings;
  }

  // Run all warning checks
  warnings.push(...checkPrepRaceConflicts(plan));
  warnings.push(...checkEquipmentConflicts(plan, unavailableEquipment, avoidedEquipment));
  warnings.push(...checkPlanDuration(plan));
  warnings.push(...checkLoadedTraining(plan));
  warnings.push(...checkTechnicalTraining(plan));
  warnings.push(...checkMissingTaper(plan));

  return warnings;
}

// Helper functions

function formatDate(dateInput: string | Date): string | null {
  try {
    let date: Date;

    if (typeof dateInput === "string") {
      date = new Date(dateInput);
    } else {
      date = dateInput;
    }

    if (isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString().substring(0, 10);
  } catch {
    return null;
  }
}

function getSessionDate(
  startDateStr: string,
  weekNumber: number,
  dayLabel: string
): string | null {
  try {
    const daysMap: Record<string, number> = {
      mon: 0, monday: 0,
      tue: 1, tuesday: 1,
      wed: 2, wednesday: 2,
      thu: 3, thursday: 3,
      fri: 4, friday: 4,
      sat: 5, saturday: 5,
      sun: 6, sunday: 6,
    };

    const dayKey = dayLabel.toLowerCase().trim();
    const dayOffset = daysMap[dayKey];

    if (dayOffset === undefined) return null;

    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);

    const sessionDate = new Date(startDate);
    sessionDate.setDate(sessionDate.getDate() + (weekNumber - 1) * 7 + dayOffset);

    return formatDate(sessionDate.toISOString());
  } catch {
    return null;
  }
}

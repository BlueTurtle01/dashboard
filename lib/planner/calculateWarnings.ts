import { GeneratedPlan } from "./types";

export type PlanWarning = {
  type: "error" | "warning" | "info";
  message: string;
  weekNumber?: number;
};

/**
 * MVP Warning System - Simple if/else rules
 *
 * Checks for:
 * 1. Sessions scheduled on the same day as prep races
 * 2. Sessions requiring equipment the athlete doesn't have
 * 3. Sessions scheduled during holidays but requiring unavailable equipment
 * 4. Plan duration much shorter than time available until event
 * 5. Load carriage event with no loaded training
 * 6. Technical terrain event with no Recce/Navigation sessions
 */
export function calculateAllWarnings(
  plan: GeneratedPlan,
  athleteEquipmentAvoid: string[] = [],
  athleteEquipmentUnavailable: string[] = [],
  holidayEquipmentUnavailable: any[] = [],
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (!plan || !plan.weeks) {
    return warnings;
  }

  // RULE 0: Check for sessions scheduled on same day as prep races
  if (plan.startDate && plan.prepRaceMarkers && plan.prepRaceMarkers.length > 0) {
    const racesByDate = new Map<string, any>();

    // Build map of races by date
    for (const race of plan.prepRaceMarkers) {
      const dateStr = normalizeDate(race.date);
      if (dateStr) {
        racesByDate.set(dateStr, race);
      }
    }

    // Check each session
    for (const week of plan.weeks) {
      for (const session of week.sessions) {
        if (!session.dayLabel) continue;

        const sessionDate = calculateSessionDate(plan.startDate, week.weekNumber, session.dayLabel);
        if (sessionDate) {
          const race = racesByDate.get(sessionDate);
          if (race) {
            warnings.push({
              type: "error",
              message: `Week ${week.weekNumber}: "${session.name}" scheduled on same day as prep race "${race.name}". Delete or move the session.`,
              weekNumber: week.weekNumber,
            });
          }
        }
      }
    }
  }

  // RULE 1: Check for sessions with unavailable equipment
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (athleteEquipmentUnavailable.length > 0) {
        const hasUnavailableEquipment = checkSessionHasEquipment(
          session,
          athleteEquipmentUnavailable
        );
        if (hasUnavailableEquipment) {
          warnings.push({
            type: "error",
            message: `Week ${week.weekNumber}: "${session.name}" requires equipment the athlete doesn't have access to.`,
            weekNumber: week.weekNumber,
          });
        }
      }

      // RULE 2: Check for sessions with avoided equipment
      if (athleteEquipmentAvoid.length > 0) {
        const hasAvoidedEquipment = checkSessionHasEquipment(
          session,
          athleteEquipmentAvoid
        );
        if (hasAvoidedEquipment) {
          warnings.push({
            type: "warning",
            message: `Week ${week.weekNumber}: "${session.name}" uses equipment the athlete prefers to avoid.`,
            weekNumber: week.weekNumber,
          });
        }
      }
    }
  }

  // RULE 3: Check for significantly short plan duration
  if (plan.startDate && plan.eventDate) {
    const startDate = new Date(plan.startDate);
    const eventDate = new Date(plan.eventDate);
    if (!isNaN(startDate.getTime()) && !isNaN(eventDate.getTime())) {
      const daysAvailable = (eventDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const weeksAvailable = Math.floor(daysAvailable / 7);
      const planWeeks = plan.weeks.length;

      // If plan is less than 50% of available time AND there's more than 4 weeks of gap
      if (planWeeks < weeksAvailable * 0.5 && weeksAvailable - planWeeks > 4) {
        warnings.push({
          type: "warning",
          message: `Plan is ${planWeeks} weeks but ${weeksAvailable} weeks available until the event.`,
        });
      }
    }
  }

  // RULE 4: Load carriage event with no loaded training
  const requiresLoadCarriage = (plan as any).requiresLoadCarriage === true ||
    (plan as any).requires_load_carriage === true;
  const hasLoaded = plan.weeks.some((w) =>
    w.sessions.some((s) => s.type === "Loaded")
  );
  if (requiresLoadCarriage && !hasLoaded) {
    warnings.push({
      type: "warning",
      message: "Plan targets load carriage event but has no Loaded sessions.",
    });
  }

  // RULE 5: Technical terrain event with no Recce or Navigation sessions
  const specialConditions: string[] = (plan as any).raceConditions?.specialConditions ?? [];
  const needsFieldcraft =
    specialConditions.includes("technical_terrain") ||
    specialConditions.includes("self_sufficiency") ||
    specialConditions.includes("navigation");
  const hasRecce = plan.weeks.some((w) =>
    w.sessions.some((s) => s.type === "Recce")
  );
  const hasNavigation = plan.weeks.some((w) =>
    w.sessions.some((s) => s.type === "Navigation")
  );
  if (needsFieldcraft && !hasRecce && !hasNavigation) {
    warnings.push({
      type: "warning",
      message: "Plan requires technical training but has no Recce or Navigation sessions.",
    });
  }

  return warnings;
}

/**
 * Check if a session requires any of the specified equipment
 */
function checkSessionHasEquipment(session: any, equipmentList: string[]): boolean {
  if (!session) return false;

  // Map activity to equipment
  const activityEquipmentMap: Record<string, string> = {
    cycling: "bicycle",
    cycle: "bicycle",
    biking: "bicycle",
    bike: "bicycle",
    swimming: "swimming_pool",
    swim: "swimming_pool",
    rowing: "rower",
    row: "rower",
  };

  // Check activity-based equipment
  if (session.activity) {
    const activityLower = session.activity.toLowerCase().trim();
    const mappedEquipment = activityEquipmentMap[activityLower];
    if (mappedEquipment && equipmentList.includes(mappedEquipment)) {
      return true;
    }
  }

  // Check exercise equipment
  if (session.exercises && Array.isArray(session.exercises)) {
    for (const exercise of session.exercises) {
      if (exercise.equipment && Array.isArray(exercise.equipment)) {
        for (const equip of exercise.equipment) {
          if (equipmentList.includes(equip)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Calculate the date of a session based on plan start date, week number, and day label
 */
function calculateSessionDate(startDateStr: string, weekNumber: number, dayLabel: string): string | null {
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

    return normalizeDate(sessionDate.toISOString());
  } catch {
    return null;
  }
}

/**
 * Normalize a date string to YYYY-MM-DD format
 */
function normalizeDate(dateInput: string | Date): string | null {
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

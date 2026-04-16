import { GeneratedPlan } from "./types";

export type PlanWarning = {
  type: "prep_race_conflict" | "equipment_unavailable" | "equipment_avoidance" | "expedition" | "plan_duration" | "other";
  message: string;
  weekNumber?: number;
  dayLabel?: string;
  sessionName?: string;
  raceName?: string;
};

export type HolidayEquipmentUnavailable = {
  start_date: string;
  end_date: string;
  unavailable_equipment: string[];
};

/**
 * Calculate all warnings for a plan, including:
 * - Prep race / session collisions
 * - Plan duration vs time available
 * - Sessions with unavailable or avoided equipment
 * - Sessions with equipment unavailable during holidays
 * - Other plan validation issues
 */
export function calculateAllWarnings(
  plan: GeneratedPlan,
  athleteEquipmentAvoid: string[] = [],
  athleteEquipmentUnavailable: string[] = [],
  holidayEquipmentUnavailable: HolidayEquipmentUnavailable[] = [],
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  // Check for prep race conflicts
  warnings.push(...calculatePrepRaceConflicts(plan));

  // Check if plan is significantly shorter than time available
  warnings.push(...calculatePlanDurationWarning(plan));

  // Check for sessions with avoided equipment
  warnings.push(...calculateEquipmentAvoidanceWarning(plan, athleteEquipmentAvoid, false));

  // Check for sessions with unavailable equipment
  warnings.push(...calculateEquipmentAvoidanceWarning(plan, athleteEquipmentUnavailable, true));

  // Check for sessions requiring equipment unavailable during holidays
  warnings.push(...calculateHolidayEquipmentUnavailableWarning(plan, holidayEquipmentUnavailable));

  // Check for expedition-specific preparation gaps
  warnings.push(...calculateExpeditionWarnings(plan));

  return warnings;
}

/**
 * Detect sessions scheduled on the same day as prep races
 */
function calculatePrepRaceConflicts(plan: GeneratedPlan): PlanWarning[] {
  if (!plan.startDate || !plan.prepRaceMarkers || plan.prepRaceMarkers.length === 0) {
    return [];
  }

  const warnings: PlanWarning[] = [];
  const racesByDate = new Map<string, (typeof plan.prepRaceMarkers)[0]>();

  // Build a map of race dates for quick lookup
  plan.prepRaceMarkers.forEach((race) => {
    const dateStr = normalizeDate(race.date);
    if (dateStr) {
      racesByDate.set(dateStr, race);
    }
  });

  if (racesByDate.size === 0) {
    return [];
  }

  // Check each session for conflicts
  const daysMap: Record<string, number> = {
    mon: 0,
    monday: 0,
    tue: 1,
    tuesday: 1,
    wed: 2,
    wednesday: 2,
    thu: 3,
    thursday: 3,
    fri: 4,
    friday: 4,
    sat: 5,
    saturday: 5,
    sun: 6,
    sunday: 6,
  };

  plan.weeks.forEach((week) => {
    week.sessions.forEach((session) => {
      if (!session.dayLabel) return;

      // Calculate the session date
      const dayKey = session.dayLabel.toLowerCase().trim();
      const dayOffset = daysMap[dayKey];

      if (dayOffset === undefined) {
        console.warn(`Unknown day label: ${session.dayLabel}`);
        return;
      }

      try {
        const startDate = new Date(plan.startDate!);
        // Reset time to midnight
        startDate.setHours(0, 0, 0, 0);

        const sessionDate = new Date(startDate);
        sessionDate.setDate(sessionDate.getDate() + (week.weekNumber - 1) * 7 + dayOffset);
        const sessionDateStr = normalizeDate(sessionDate.toISOString());

        if (!sessionDateStr) return;

        // Check if there's a race on this date
        const race = racesByDate.get(sessionDateStr);
        if (race) {
          warnings.push({
            type: "prep_race_conflict",
            message: `⚠️ ${session.name || "Session"} scheduled on same day as ${race.name}`,
            weekNumber: week.weekNumber,
            dayLabel: session.dayLabel,
            sessionName: session.name,
            raceName: race.name,
          });
        }
      } catch (err) {
        console.error(`Error calculating session date for week ${week.weekNumber}:`, err);
      }
    });
  });

  return warnings;
}

/**
 * Check for sessions that use equipment the athlete wants to avoid or doesn't have.
 * Equipment is sourced from two places:
 * 1. The session's activity field (cycling → bicycle, swimming → swimming_pool)
 * 2. The equipment[] field on each PlanExercise (populated from the exercises DB table)
 */
function calculateEquipmentAvoidanceWarning(
  plan: GeneratedPlan,
  equipment: string[],
  isUnavailable: boolean = false,
): PlanWarning[] {
  if (!equipment || equipment.length === 0) {
    return [];
  }

  const warnings: PlanWarning[] = [];

  // Map activity names to equipment_options slugs
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

  plan.weeks.forEach((week) => {
    week.sessions.forEach((session) => {
      const requiredEquipment = new Set<string>();

      // 1. Check activity-based equipment
      if (session.activity) {
        const mapped = activityEquipmentMap[session.activity.toLowerCase().trim()];
        if (mapped) requiredEquipment.add(mapped);
      }

      // 2. Check equipment on each exercise (from exercises DB table)
      session.exercises?.forEach((exercise) => {
        ((exercise as any).equipment ?? []).forEach((slug: string) => {
          if (slug) requiredEquipment.add(slug);
        });
      });

      // Warn for each blocked equipment item found in this session
      requiredEquipment.forEach((equipmentSlug) => {
        if (equipment.includes(equipmentSlug)) {
          const equipmentLabel = equipmentSlug.replace(/_/g, " ");
          const messageType = isUnavailable ? "does not have access to" : "prefers to avoid";

          warnings.push({
            type: isUnavailable ? "equipment_unavailable" : "equipment_avoidance",
            message: `⚠️ Week ${week.weekNumber}: "${session.name}" requires ${equipmentLabel}, which the athlete ${messageType}.`,
            weekNumber: week.weekNumber,
            sessionName: session.name,
          });
        }
      });
    });
  });

  return warnings;
}

/**
 * Check if plan duration is significantly shorter than time available until event
 */
function calculatePlanDurationWarning(plan: GeneratedPlan): PlanWarning[] {
  if (!plan.eventDate || !plan.startDate || plan.weeks.length === 0) {
    return [];
  }

  try {
    const eventDate = new Date(plan.eventDate);
    const startDate = new Date(plan.startDate);

    if (isNaN(eventDate.getTime()) || isNaN(startDate.getTime())) {
      return [];
    }

    // Calculate weeks available
    const diffMs = eventDate.getTime() - startDate.getTime();
    const weeksAvailable = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));

    const planWeeks = plan.weeks.length;

    // Warn if plan is less than 50% of available time (with some tolerance)
    if (planWeeks < weeksAvailable * 0.5 && weeksAvailable - planWeeks > 4) {
      const weeksOfGap = weeksAvailable - planWeeks;
      return [
        {
          type: "plan_duration",
          message: `⚠️ Plan is only ${planWeeks} weeks, but ${weeksAvailable} weeks available until the event. Consider if you need time for other phases or if this is intentional.`,
        },
      ];
    }

    return [];
  } catch (err) {
    console.error("Error calculating plan duration warning:", err);
    return [];
  }
}

/**
 * Check for sessions scheduled during holidays that require equipment
 * the athlete won't have access to.
 */
function calculateHolidayEquipmentUnavailableWarning(
  plan: GeneratedPlan,
  holidayEquipmentUnavailable: HolidayEquipmentUnavailable[],
): PlanWarning[] {
  if (!holidayEquipmentUnavailable || holidayEquipmentUnavailable.length === 0) {
    return [];
  }

  if (!plan.startDate) {
    return [];
  }

  const warnings: PlanWarning[] = [];

  // Activity to equipment mapping
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

  const daysMap: Record<string, number> = {
    mon: 0,
    monday: 0,
    tue: 1,
    tuesday: 1,
    wed: 2,
    wednesday: 2,
    thu: 3,
    thursday: 3,
    fri: 4,
    friday: 4,
    sat: 5,
    saturday: 5,
    sun: 6,
    sunday: 6,
  };

  plan.weeks.forEach((week) => {
    week.sessions.forEach((session) => {
      if (!session.dayLabel) return;

      // Calculate the session date
      const dayKey = session.dayLabel.toLowerCase().trim();
      const dayOffset = daysMap[dayKey];

      if (dayOffset === undefined) {
        return;
      }

      try {
        const startDate = new Date(plan.startDate!);
        startDate.setHours(0, 0, 0, 0);

        const sessionDate = new Date(startDate);
        sessionDate.setDate(sessionDate.getDate() + (week.weekNumber - 1) * 7 + dayOffset);
        const sessionDateStr = normalizeDate(sessionDate.toISOString());

        if (!sessionDateStr) return;

        // Check if this session date falls within any holiday with equipment restrictions
        const relevantHoliday = holidayEquipmentUnavailable.find((holiday) =>
          isDateInRange(sessionDateStr, holiday.start_date, holiday.end_date)
        );

        if (!relevantHoliday) return;

        // Collect required equipment for this session
        const requiredEquipment = new Set<string>();

        // 1. Check activity-based equipment
        if (session.activity) {
          const mapped = activityEquipmentMap[session.activity.toLowerCase().trim()];
          if (mapped) requiredEquipment.add(mapped);
        }

        // 2. Check equipment on each exercise
        session.exercises?.forEach((exercise) => {
          ((exercise as any).equipment ?? []).forEach((slug: string) => {
            if (slug) requiredEquipment.add(slug);
          });
        });

        // Check for conflicts with holiday equipment restrictions
        requiredEquipment.forEach((equipmentSlug) => {
          if (relevantHoliday.unavailable_equipment.includes(equipmentSlug)) {
            const equipmentLabel = equipmentSlug.replace(/_/g, " ");
            warnings.push({
              type: "equipment_unavailable",
              message: `⚠️ Week ${week.weekNumber}: "${session.name}" requires ${equipmentLabel}, which won't be available during the holiday (${relevantHoliday.start_date} to ${relevantHoliday.end_date}).`,
              weekNumber: week.weekNumber,
              sessionName: session.name,
            });
          }
        });
      } catch (err) {
        console.error(`Error calculating session date for holiday equipment check:`, err);
      }
    });
  });

  return warnings;
}

function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  try {
    const d = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    d.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return d >= start && d <= end;
  } catch {
    return false;
  }
}

/**
 * Check for expedition-specific preparation gaps:
 * 1. Plan requires load carriage but has no Loaded sessions
 * 2. Plan has technical terrain / self-sufficiency conditions but no Recce or Navigation sessions
 */
function calculateExpeditionWarnings(plan: GeneratedPlan): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const allSessions = plan.weeks.flatMap((w) => w.sessions);

  const hasLoaded = allSessions.some((s) => s.type === "Loaded");
  const hasRecce = allSessions.some((s) => s.type === "Recce");
  const hasNavigation = allSessions.some((s) => s.type === "Navigation");

  // Warning 1: load carriage event with no loaded training
  const requiresLoadCarriage = (plan as any).requiresLoadCarriage === true ||
    (plan as any).requires_load_carriage === true;
  if (requiresLoadCarriage && !hasLoaded) {
    warnings.push({
      type: "other",
      message: "⚠️ This plan targets a load carriage event but contains no Loaded March sessions. Consider adding weighted training.",
    });
  }

  // Warning 2: technical or self-sufficient event with no recce or navigation
  const specialConditions: string[] = (plan as any).raceConditions?.specialConditions ?? [];
  const needsFieldcraft =
    specialConditions.includes("technical_terrain") ||
    specialConditions.includes("self_sufficiency") ||
    specialConditions.includes("navigation");

  if (needsFieldcraft && !hasRecce && !hasNavigation) {
    warnings.push({
      type: "other",
      message: "⚠️ The event has technical terrain or self-sufficiency requirements but the plan has no Recce or Navigation sessions.",
    });
  }

  return warnings;
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

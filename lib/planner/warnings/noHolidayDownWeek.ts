import { GeneratedPlan, PlanWarning } from "../types";

export function noHolidayDownWeekWarning(plan: GeneratedPlan): PlanWarning | null {
  const demandingHolidayWeeks = plan.weeks.filter((week) => {
    if (!week.isHolidayWeek) {
      return false;
    }

    const hardSessionCount = week.sessions.filter(
      (session) => session.type === "Long" || session.type === "Steady"
    ).length;

    return hardSessionCount >= 2;
  });

  if (demandingHolidayWeeks.length > 0) {
    const weekList = demandingHolidayWeeks.map((week) => week.weekNumber).join(", ");

    return {
      id: "holiday_week_still_too_hard",
      code: "holiday_week_still_too_hard",
      title: "Holiday week still looks demanding",
      message: `Holiday week${demandingHolidayWeeks.length > 1 ? "s" : ""} ${weekList} still contain multiple sessions that may be harder to complete around travel or reduced availability.`,
      severity: "info",
      suggestion: "Consider simplifying those holiday weeks further.",
    };
  }

  return null;
}

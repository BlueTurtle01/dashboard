import { GeneratedPlan, PlanWarning } from "../types";

export function holidayCloseToEventWarning(plan: GeneratedPlan): PlanWarning | null {
  const holidayWeeks = plan.weeks.filter((week) => week.isHolidayWeek);

  if (holidayWeeks.length === 0) {
    return null;
  }

  const closestHoliday = holidayWeeks.reduce((closest, current) => {
    const currentWeeksBeforeEvent = plan.weeksAvailable - current.weekNumber;
    const closestWeeksBeforeEvent = plan.weeksAvailable - closest.weekNumber;
    return currentWeeksBeforeEvent < closestWeeksBeforeEvent ? current : closest;
  });

  const weeksBeforeEvent = plan.weeksAvailable - closestHoliday.weekNumber;

  if (weeksBeforeEvent <= 2) {
    return {
      id: "holiday_close_to_event",
      code: "holiday_close_to_event",
      title: "Holiday close to event",
      message: "At least one holiday week falls very close to the event, which may disrupt peak or taper timing.",
      severity: "warning",
      suggestion: "Consider moving the late holiday earlier or reducing the demands of the final build weeks.",
    };
  }

  return null;
}

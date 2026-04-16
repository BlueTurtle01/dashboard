import { GeneratedPlan } from "./planner/types";

/**
 * Returns the current month number (1-based) based on revealed_through_week.
 * Month 1 = weeks 1-4, Month 2 = weeks 5-8, etc.
 */
export function getCurrentMonthNumber(revealedThroughWeek: number): number {
  return Math.ceil(revealedThroughWeek / 4);
}

/**
 * Returns true if the questionnaire window is open.
 * Window is open during the last 7 days of the current revealed period.
 */
export function isQuestionnaireWindowOpen(
  plan: GeneratedPlan,
  revealedThroughWeek: number
): boolean {
  // If no startDate, we can't compute calendar dates, so always open it in the last week
  if (!plan.startDate) {
    // Simple heuristic: open in week number 4, 8, 12, etc (last week of month)
    const currentMonthNumber = getCurrentMonthNumber(revealedThroughWeek);
    const lastWeekOfMonth = currentMonthNumber * 4;
    return revealedThroughWeek === lastWeekOfMonth;
  }

  // Compute the end date of the current revealed period
  // Formula: startDate + (revealedThroughWeek - 1) * 7 days = end of revealed period
  const startDate = new Date(plan.startDate);
  const revealEndDate = new Date(startDate);
  revealEndDate.setDate(revealEndDate.getDate() + (revealedThroughWeek - 1) * 7);

  // Compute the window: last 7 days of the revealed period
  const windowStart = new Date(revealEndDate);
  windowStart.setDate(windowStart.getDate() - 6); // 7 days ago

  const now = new Date();

  // Check if today is in the window
  return now >= windowStart && now <= revealEndDate;
}

/**
 * Returns a filtered copy of the plan with only visible weeks.
 * Weeks are visible if their weekNumber <= revealedThroughWeek.
 */
export function getVisiblePlan(
  plan: GeneratedPlan,
  revealedThroughWeek: number
): GeneratedPlan {
  return {
    ...plan,
    weeks: plan.weeks.filter((week) => week.weekNumber <= revealedThroughWeek),
  };
}

/**
 * Computes the next month number that should be revealed after the athlete completes feedback.
 */
export function getNextRevealedThroughWeek(
  currentRevealedThroughWeek: number
): number {
  return currentRevealedThroughWeek + 4;
}

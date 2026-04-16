import { GeneratedPlan, PlanWarning } from "../types";

export function shortTaperWarning(plan: GeneratedPlan): PlanWarning | null {
  const taperWeeks = plan.weeks.filter(
    (week) => week.phase === "Taper" || week.trainingPurpose === "Taper",
  ).length;

  if (taperWeeks < 2) {
    return {
      id: "short_taper",
      code: "short_taper",
      title: "Short taper",
      message: "This plan currently has fewer than two taper weeks.",
      severity: "warning",
      suggestion: "Consider adding another taper week or pulling peak work slightly earlier.",
    };
  }

  return null;
}

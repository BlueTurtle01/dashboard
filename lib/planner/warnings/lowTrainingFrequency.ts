import { GeneratedPlan, PlanWarning } from "../types";

export function lowTrainingFrequencyWarning(plan: GeneratedPlan): PlanWarning | null {
  if (plan.trainingDaysPerWeek <= 2) {
    return {
      id: "low_training_frequency",
      code: "low_training_frequency",
      title: "Low weekly training frequency",
      message: "Two training days per week can work, but it leaves less room for progression and recovery balance.",
      severity: "info",
      suggestion: "If the athlete can handle it, consider adding a third day or keeping progression more conservative.",
    };
  }

  return null;
}

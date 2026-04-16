import { getPlanWarnings } from "./warnings";
import { GeneratedPlan } from "./types";

export function recalculatePlanWarnings(plan: GeneratedPlan): GeneratedPlan {
  return {
    ...plan,
    warnings: getPlanWarnings(plan),
  };
}

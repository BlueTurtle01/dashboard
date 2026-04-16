import { GeneratedPlan, PlanWarning } from "../types";
import { holidayCloseToEventWarning } from "./holidayCloseToEvent";
import { lowTrainingFrequencyWarning } from "./lowTrainingFrequency";
import { noHolidayDownWeekWarning } from "./noHolidayDownWeek";
import { shortTaperWarning } from "./shortTaper";

export function getPlanWarnings(plan: GeneratedPlan): PlanWarning[] {
  const warnings = [
    holidayCloseToEventWarning(plan),
    lowTrainingFrequencyWarning(plan),
    shortTaperWarning(plan),
    noHolidayDownWeekWarning(plan),
  ];

  return warnings.filter((warning): warning is PlanWarning => warning !== null);
}

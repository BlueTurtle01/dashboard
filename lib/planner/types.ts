
export type PlanPhase = "Base" | "Build" | "Peak" | "Taper";

export type TrainingPurpose =
  | "Early Base"
  | "Late Base"
  | "Early Build"
  | "Late Build"
  | "Peak"
  | "Taper"
  | "Recovery"
  | "Recovery from Prep Race"
  | "Race Week"
  | "Post-Race"
  | "Back-to-Back Block";

export const TRAINING_PURPOSES: TrainingPurpose[] = [
  "Early Base",
  "Late Base",
  "Early Build",
  "Late Build",
  "Peak",
  "Taper",
  "Recovery",
  "Recovery from Prep Race",
  "Race Week",
  "Post-Race",
  "Back-to-Back Block",
];

export type PlanSessionType =
  | "Easy"
  | "Long"
  | "Recovery"
  | "Steady"
  | "Rest"
  | "Gym"
  | "Loaded"
  | "Recce"
  | "Navigation"
  | "functional";

export type PlanWarningSeverity = "info" | "warning" | "critical";

export interface PlanWarning {
  id: string;
  code: string;
  title: string;
  message: string;
  severity: PlanWarningSeverity;
  suggestion?: string;
}

export interface RaceConditions {
  temperature: "extreme_cold" | "cold" | "moderate" | "hot" | "extreme_heat" | null;
  altitude: "sea_level" | "moderate" | "high" | "extreme" | null;
  humidity: "dry" | "moderate" | "humid" | null;
  /** e.g. "sand", "snow_ice", "night_stages", "self_sufficiency", "technical_terrain", "multi_day", "high_winds" */
  specialConditions: string[];
  notes: string | null;
}

export interface PlanInput {
  eventName: string;
  eventDate: string;
  weeksAvailable: number;
  trainingDaysPerWeek: number;
  holidayWeeks?: number[];
  raceConditions?: RaceConditions | null;
}

export type AthleteProfile = {
  equipmentUnavailable: string[];

  injuries: {
    area: string;
    severity: "low" | "moderate" | "high";
    notes?: string;
  }[];

  imbalances: {
    area: string;
    side: "left" | "right" | "both";
    type: "tightness" | "weakness";
  }[];
};

export interface PlanExercise {
  id: string;
  sessionId: string;
  sortOrder: number;
  name: string;
  description: string;
  tags: string[];
  sets: number | null;
  reps: number | null;
  durationSeconds?: number | null;
  equipment?: string[];
  exerciseId?: string;              // DB id of the exercises row; carried for swap lookups
  equipmentConflict?: boolean;      // set when exercise equipment conflicts with athlete unavailable list
  swappedFromExerciseId?: string;   // set when this exercise replaced another
  swappedFromName?: string;         // display name of the original exercise
}

export interface PlanSession {
  id: string;
  weekId: string;
  sortOrder: number;
  dayLabel: string;
  type: PlanSessionType;
  name: string;
  description: string;
  tags: string[];
  duration: string;
  intensity: string;
  isKeySession: boolean;
  exercises: PlanExercise[];
  activity?: string;
  subtype?: string;
  terrain?: string;
  elevationGainMeters?: number;
  packWeightKg?: number;
  strides?: string;
  warmupMinutes?: number;
  cooldownMinutes?: number;
  intervalReps?: number;
  intervalDuration?: string;
  isInsertedAlternative?: boolean;
}

export interface PlanWeek {
  id: string;
  planId: string;
  weekNumber: number;
  sortOrder: number;
  phase: PlanPhase;
  focus: string;
  notes: string;
  sessions: PlanSession[];
  isHolidayWeek: boolean;
  trainingPurpose?: TrainingPurpose;
  isApproved?: boolean;
}

export interface GeneratedPlan {
  id: string;
  eventName: string;
  eventDate: string;
  weeksAvailable: number;
  trainingDaysPerWeek: number;
  createdAt: string;
  updatedAt: string;
  weeks: PlanWeek[];
  warnings: PlanWarning[];
  startDate?: string;
  prepRaceMarkers?: Array<{ weekNumber: number; name: string; date: string }>;
}

export interface PlanRecord {
  id: string;
  event_name: string;
  event_date: string;
  weeks_available: number;
  training_days_per_week: number;
  created_at: string;
  updated_at: string;
}

export interface PlanWeekRecord {
  id: string;
  plan_id: string;
  week_number: number;
  sort_order: number;
  phase: PlanPhase;
  focus: string;
  notes: string;
  is_holiday_week: boolean;
}

export interface PlanSessionRecord {
  id: string;
  week_id: string;
  sort_order: number;
  day_label: string;
  type: PlanSessionType;
  name: string;
  description: string;
  tags: string[];
  duration: string;
  intensity: string;
  is_key_session: boolean;
}

export interface PlanExerciseRecord {
  id: string;
  session_id: string;
  sort_order: number;
  name: string;
  description: string;
  tags: string[];
  sets: number | null;
  reps: number | null;
  duration_seconds?: number | null;
  equipment?: string[];
  exercise_id?: string;
  equipment_conflict?: boolean;
  swapped_from_exercise_id?: string;
  swapped_from_name?: string;
}

export interface DehydratedPlan {
  plan: PlanRecord;
  weeks: PlanWeekRecord[];
  sessions: PlanSessionRecord[];
  exercises: PlanExerciseRecord[];
}

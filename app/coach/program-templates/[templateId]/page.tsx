"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { assignDayLabelsToSessions } from "@/lib/planner/assembleWeekFromTemplate";

type TemplateTag = {
  id: string;
  name: string;
  slug: string;
  tag_group: string;
  sort_order: number;
};

type ProgramTemplateRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  discipline: string;
  plan_length_weeks: number;
  training_days_per_week: number;
  starting_fitness: string;
  event_goal: string | null;
  is_featured: boolean;
  is_active: boolean;
  min_weekly_training_hours: number | null;
  min_longest_recent_session_minutes: number | null;
  min_training_consistency_weeks: number | null;
  min_back_to_back_days: number | null;
  requires_hills: boolean;
  requires_gym: boolean;
  requires_load_carriage: boolean;
  requires_heat_acclimation: boolean;
  suitable_race_goals: string[] | null;
  program_template_tag_links:
    | {
        program_template_tags: TemplateTag | TemplateTag[] | null;
      }[]
    | null;
};

type ProgramTemplateWeekRow = {
  id: string;
  program_template_id: string;
  week_number: number;
  focus: string | null;
  notes: string | null;
};

type ProgramTemplateSessionExerciseRow = {
  id: string;
  program_template_session_id: string;
  exercise_id: string;
  sort_order: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  notes: string | null;
  exercise?: {
    id: string;
    name: string;
  } | null;
};

type SessionTemplateRelation =
  | {
      distance_km: number | null;
      type: string | null;
      activity: string | null;
      subtype: string | null;
    }
  | {
      distance_km: number | null;
      type: string | null;
      activity: string | null;
      subtype: string | null;
    }[]
  | null;

type ProgramTemplateSessionRow = {
  id: string;
  program_template_week_id: string;
  day_label: string;
  sort_order: number;
  type: string;
  name: string;
  description: string | null;
  duration: string | null;
  intensity: string | null;
  is_key_session: boolean;
  session_template_id: string | null;
  run_time_type: string | null;
  run_start_time: string | null;
  is_time_strict: boolean | null;
  week_number: number | null;
  day_number: number | null;
  session_templates: SessionTemplateRelation;
  program_template_session_exercises: ProgramTemplateSessionExerciseRow[] | null;
  // Extended fields
  activity: string | null;
  subtype: string | null;
  distance_km: number | null;
  terrain: string | null;
  elevation_gain_meters: number | null;
  pack_weight_kg: number | null;
  strides: string | null;
  warmup_minutes: number | null;
  cooldown_minutes: number | null;
  interval_reps: number | null;
  interval_duration: string | null;
  tags: string[] | null;
};

type TemplateCard = {
  id: string;
  name: string;
  slug: string;
  description: string;
  discipline: string;
  planLengthWeeks: number;
  trainingDaysPerWeek: number;
  startingFitness: string;
  eventGoal: string;
  isFeatured: boolean;
  isActive: boolean;
  minWeeklyTrainingHours: number | null;
  minLongestRecentSessionMinutes: number | null;
  minTrainingConsistencyWeeks: number | null;
  minBackToBackDays: number | null;
  requiresHills: boolean;
  requiresGym: boolean;
  requiresLoadCarriage: boolean;
  requiresHeatAcclimation: boolean;
  suitableRaceGoals: string[];
  tags: TemplateTag[];
};

type AthleteEventSummary = {
  selectedEventId: string | null;
  eventName: string;
  climateType: string;
  terrainType: string;
  raceConditions: import("@/lib/planner/types").RaceConditions | null;
};

type AthleteProfileSummary = {
  athleteName: string;
  availableTrainingDaysPerWeek: number | null;
  weeklyTrainingHours: number | null;
  longestRecentSessionMinutes: number | null;
  trainingConsistencyWeeks: number | null;
  maxBackToBackDays: number | null;
  loadCarriageExperience: boolean | null;
  raceGoal: string | null;
  enduranceScalar: number;
  intensityScalar: number;
};

type BaselineStatus = "meets" | "close" | "below" | "unknown";

type TemplateMatchBreakdown = {
  overallScore: number;
  timeFitScore: number;
  eventFitScore: number;
  baselineScore: number;
  baselineStatus: BaselineStatus;
  isGoodMatch: boolean;
  strengths: string[];
  baselineIssues: string[];
  tweakNotes: string[];
};

type SessionScalingMode = "endurance" | "intensity" | "none";

const TEST_COACH_USER_ID = "bff5270a-cdc6-4bc4-a008-3530259d57e6";

function normaliseTagRelation(value: TemplateTag | TemplateTag[] | null | undefined) {
  if (!value) return [] as TemplateTag[];
  return Array.isArray(value) ? value : [value];
}

function getSingleSessionTemplateRelation(value: SessionTemplateRelation) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function getSessionDistanceKm(session: ProgramTemplateSessionRow): number | null {
  return getSingleSessionTemplateRelation(session.session_templates)?.distance_km ?? session.distance_km ?? null;
}

function getSessionTemplateType(session: ProgramTemplateSessionRow): string {
  return (getSingleSessionTemplateRelation(session.session_templates)?.type ?? "")
    .trim()
    .toLowerCase();
}

function titleCase(value: string | null | undefined) {
  if (!value) return "—";

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getNumericFitScore(required: number | null, actual: number | null) {
  if (required == null || required <= 0) {
    return { score: 100, status: "meets" as const };
  }

  if (actual == null || actual <= 0) {
    return { score: 0, status: "below" as const };
  }

  const ratio = actual / required;

  if (ratio >= 1) {
    return { score: 100, status: "meets" as const };
  }

  if (ratio >= 0.9) {
    return { score: clampScore(70 + ratio * 20), status: "close" as const };
  }

  if (ratio >= 0.75) {
    return { score: clampScore(45 + ratio * 25), status: "close" as const };
  }

  return { score: clampScore(ratio * 45), status: "below" as const };
}

function buildEventHaystack(template: TemplateCard) {
  const tagSlugs = template.tags.map((tag) => tag.slug.toLowerCase());
  const tagNames = template.tags.map((tag) => tag.name.toLowerCase());

  return [
    template.name,
    template.description,
    template.discipline,
    template.eventGoal,
    ...template.suitableRaceGoals,
    ...tagSlugs,
    ...tagNames,
  ]
    .join(" ")
    .toLowerCase();
}

function getEventFit(template: TemplateCard, athleteEvent: AthleteEventSummary | null) {
  if (!athleteEvent) {
    return {
      score: 50,
      strengths: [] as string[],
    };
  }

  const haystack = buildEventHaystack(template);
  const strengths: string[] = [];
  let score = 35;

  const climate = athleteEvent.climateType.toLowerCase();
  const terrain = athleteEvent.terrainType.toLowerCase();
  const conditions = athleteEvent.raceConditions;
  const temp = conditions?.temperature ?? null;
  const specialConditions = conditions?.specialConditions ?? [];

  // Heat-related matching
  const isHot = temp === "hot" || temp === "extreme_heat" || climate === "hot desert";
  const isCold = temp === "cold" || temp === "extreme_cold";

  if (isHot) {
    const hotDesertSignals = ["desert", "mds", "heat", "hot"];
    const matchedSignals = hotDesertSignals.filter((signal) => haystack.includes(signal));
    if (matchedSignals.length > 0 || template.requiresHeatAcclimation || template.requiresLoadCarriage) {
      score += 35;
      strengths.push("Event characteristics align with hot / desert racing");
    }
  }

  if (isCold) {
    const coldSignals = ["cold", "arctic", "winter", "snow", "ice"];
    const matchedSignals = coldSignals.filter((signal) => haystack.includes(signal));
    if (matchedSignals.length > 0) {
      score += 30;
      strengths.push("Matches cold-weather race characteristics");
    }
    // Heat acclimation is counterproductive for cold races
    if (template.requiresHeatAcclimation) {
      score -= 20;
    }
  }

  // Terrain matching
  if (
    terrain.includes("trail") ||
    terrain.includes("mountain") ||
    terrain.includes("hilly") ||
    specialConditions.includes("technical_terrain")
  ) {
    const trailSignals = ["trail", "mountain", "hills", "vert", "elevation"];
    const matchedSignals = trailSignals.filter((signal) => haystack.includes(signal));
    if (matchedSignals.length > 0 || template.requiresHills) {
      score += 30;
      strengths.push("Matches trail / elevation characteristics");
    }
  }

  if (
    !terrain.includes("trail") &&
    !terrain.includes("mountain") &&
    !terrain.includes("hilly") &&
    !specialConditions.includes("technical_terrain")
  ) {
    if (["road", "general"].includes(template.discipline)) {
      score += 20;
      strengths.push("General / non-trail discipline fits the event terrain");
    }
  }

  // Self-sufficiency (e.g. multi-day carrying pack)
  if (specialConditions.includes("self_sufficiency") && template.requiresLoadCarriage) {
    score += 15;
    strengths.push("Includes load carriage preparation for self-sufficiency event");
  }

  // Altitude
  if (conditions?.altitude === "high" || conditions?.altitude === "extreme") {
    const altitudeSignals = ["altitude", "elevation", "hypoxic"];
    const matched = altitudeSignals.filter((signal) => haystack.includes(signal));
    if (matched.length > 0) {
      score += 15;
      strengths.push("Includes altitude / elevation preparation");
    }
  }

  // Discipline bonus
  if (template.discipline === "desert" && (isHot || climate === "hot desert")) {
    score += 15;
  }

  if (
    template.discipline === "trail" &&
    (terrain.includes("trail") || terrain.includes("mountain"))
  ) {
    score += 15;
  }

  return {
    score: clampScore(score),
    strengths,
  };
}

function getTemplateMatch(
  template: TemplateCard,
  athleteEvent: AthleteEventSummary | null,
  athleteProfile: AthleteProfileSummary | null,
): TemplateMatchBreakdown {
  const strengths: string[] = [];
  const baselineIssues: string[] = [];
  const tweakNotes: string[] = [];

  const eventFit = getEventFit(template, athleteEvent);
  strengths.push(...eventFit.strengths);

  const availableDaysFit = getNumericFitScore(
    template.trainingDaysPerWeek,
    athleteProfile?.availableTrainingDaysPerWeek ?? null,
  );
  const weeklyHoursFit = getNumericFitScore(
    template.minWeeklyTrainingHours,
    athleteProfile?.weeklyTrainingHours ?? null,
  );

  const timeFitScore = clampScore(
    availableDaysFit.score * 0.55 + weeklyHoursFit.score * 0.45,
  );

  if (availableDaysFit.status === "meets") {
    strengths.push("Fits the athlete’s available training days");
  } else if (availableDaysFit.status === "close") {
    tweakNotes.push(
      "Training days are close to requirement and may only need a small coach adjustment",
    );
  } else if (template.trainingDaysPerWeek > 0) {
    baselineIssues.push(`Needs ${template.trainingDaysPerWeek} training days/week`);
  }

  if (weeklyHoursFit.status === "meets" && template.minWeeklyTrainingHours != null) {
    strengths.push("Weekly training hours meet the plan baseline");
  } else if (
    weeklyHoursFit.status === "close" &&
    template.minWeeklyTrainingHours != null
  ) {
    tweakNotes.push("Weekly training hours are close to the plan baseline");
  } else if (template.minWeeklyTrainingHours != null) {
    baselineIssues.push(
      `Needs about ${template.minWeeklyTrainingHours} training hours/week`,
    );
  }

  const longestFit = getNumericFitScore(
    template.minLongestRecentSessionMinutes,
    athleteProfile?.longestRecentSessionMinutes ?? null,
  );
  const consistencyFit = getNumericFitScore(
    template.minTrainingConsistencyWeeks,
    athleteProfile?.trainingConsistencyWeeks ?? null,
  );
  const backToBackFit = getNumericFitScore(
    template.minBackToBackDays,
    athleteProfile?.maxBackToBackDays ?? null,
  );

  const baselineScores = [longestFit.score, consistencyFit.score, backToBackFit.score];
  const baselineStatuses: BaselineStatus[] = [
    longestFit.status,
    consistencyFit.status,
    backToBackFit.status,
  ];

  if (template.minLongestRecentSessionMinutes != null) {
    if (longestFit.status === "meets") {
      strengths.push("Longest recent session meets the baseline");
    } else if (longestFit.status === "close") {
      tweakNotes.push("Longest recent session is close to the plan requirement");
    } else {
      baselineIssues.push(
        `Needs ${template.minLongestRecentSessionMinutes} min longest recent session`,
      );
    }
  }

  if (template.minTrainingConsistencyWeeks != null) {
    if (consistencyFit.status === "meets") {
      strengths.push("Training consistency meets the baseline");
    } else if (consistencyFit.status === "close") {
      tweakNotes.push("Training consistency is close to the plan requirement");
    } else {
      baselineIssues.push(
        `Needs ${template.minTrainingConsistencyWeeks} weeks of consistent training`,
      );
    }
  }

  if (template.minBackToBackDays != null && template.minBackToBackDays > 0) {
    if (backToBackFit.status === "meets") {
      strengths.push("Back-to-back tolerance meets the baseline");
    } else if (backToBackFit.status === "close") {
      tweakNotes.push("Back-to-back tolerance is close to the plan requirement");
    } else {
      baselineIssues.push(
        `Needs ${template.minBackToBackDays} back-to-back days tolerance`,
      );
    }
  }

  if (template.requiresLoadCarriage) {
    if (athleteProfile?.loadCarriageExperience === true) {
      strengths.push("Athlete already has load carriage experience");
      baselineScores.push(100);
      baselineStatuses.push("meets");
    } else if (athleteProfile?.loadCarriageExperience === false) {
      baselineScores.push(45);
      baselineStatuses.push("close");
      tweakNotes.push(
        "Plan requires load carriage; coach may need to add a short adaptation block",
      );
    } else {
      baselineScores.push(30);
      baselineStatuses.push("unknown");
      tweakNotes.push(
        "Load carriage experience is unknown for a plan that requires it",
      );
    }
  }

  if (template.requiresHeatAcclimation) {
    tweakNotes.push(
      "Plan includes heat demands; coach should confirm heat acclimation strategy",
    );
  }

  if (template.requiresGym) {
    strengths.push("Includes gym work where relevant");
  }

  if (template.suitableRaceGoals.length > 0 && athleteProfile?.raceGoal) {
    if (template.suitableRaceGoals.includes(athleteProfile.raceGoal)) {
      strengths.push("Plan supports the athlete’s stated race goal");
    } else {
      tweakNotes.push("Race goal is not explicitly listed for this plan");
    }
  }

  const baselineScore = clampScore(
    baselineScores.reduce((sum, score) => sum + score, 0) / baselineScores.length,
  );

  let baselineStatus: BaselineStatus = "unknown";
  if (baselineStatuses.some((status) => status === "below")) {
    baselineStatus = "below";
  } else if (baselineStatuses.some((status) => status === "close")) {
    baselineStatus = "close";
  } else if (baselineStatuses.some((status) => status === "meets")) {
    baselineStatus = "meets";
  }

  let overallScore = clampScore(
    eventFit.score * 0.4 + timeFitScore * 0.35 + baselineScore * 0.25,
  );

  if (baselineStatus === "below") {
    overallScore = Math.min(overallScore, 59);
  }

  const isGoodMatch = overallScore >= 70 && baselineStatus !== "below";

  return {
    overallScore,
    timeFitScore,
    eventFitScore: eventFit.score,
    baselineScore,
    baselineStatus,
    isGoodMatch,
    strengths: Array.from(new Set(strengths)).slice(0, 4),
    baselineIssues: Array.from(new Set(baselineIssues)).slice(0, 4),
    tweakNotes: Array.from(new Set(tweakNotes)).slice(0, 4),
  };
}

function getBaselineBadgeClass(status: BaselineStatus) {
  if (status === "meets") return "bg-emerald-600 text-white";
  if (status === "close") return "bg-amber-400 text-black";
  if (status === "below") return "bg-rose-600 text-white";
  return "bg-zinc-200 text-zinc-800";
}

function formatBaselineStatus(status: BaselineStatus) {
  if (status === "meets") return "Baseline Meets";
  if (status === "close") return "Baseline Close";
  if (status === "below") return "Baseline Below";
  return "Baseline Unknown";
}

function getWeekFocusTheme(focus: string) {
  const normalised = focus.trim().toLowerCase();

  if (["recovery", "deload"].includes(normalised)) {
    return {
      card: "border-emerald-300 bg-emerald-50",
      badge: "bg-emerald-600 text-white",
      accent: "text-emerald-900",
    };
  }

  if (["build", "specific", "strength"].includes(normalised)) {
    return {
      card: "border-sky-300 bg-sky-50",
      badge: "bg-sky-600 text-white",
      accent: "text-sky-900",
    };
  }

  if (["base"].includes(normalised)) {
    return {
      card: "border-zinc-300 bg-zinc-100",
      badge: "bg-zinc-700 text-white",
      accent: "text-zinc-900",
    };
  }

  if (["taper", "peak", "race", "test"].includes(normalised)) {
    return {
      card: "border-violet-300 bg-violet-50",
      badge: "bg-violet-600 text-white",
      accent: "text-violet-900",
    };
  }

  return {
    card: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-black",
    accent: "text-amber-900",
  };
}

function buildClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderWeekFocusChartFromTemplate(weeks: ProgramTemplateWeekRow[]) {
  if (!weeks.length) return null;

  const sorted = [...weeks].sort((a, b) => a.week_number - b.week_number);

  const getColor = (focus: string | null) => {
    const f = (focus || "").toLowerCase();

    if (f.includes("base")) return "#16a34a";
    if (f.includes("build")) return "#2563eb";
    if (f.includes("volume")) return "#22c55e";
    if (f.includes("intensity")) return "#dc2626";
    if (f.includes("taper") || f.includes("peak")) return "#7c3aed";

    return "#9ca3af";
  };

  const barWidth = 14;
  const gap = 4;
  const height = 80;
  const width = sorted.length * (barWidth + gap);

  return (
    <div className="mt-4">
      <svg width="100%" height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
        {sorted.map((week, i) => {
          const x = i * (barWidth + gap);
          const color = getColor(week.focus);

          return (
            <g key={week.id}>
              <rect x={x} y={10} width={barWidth} height={height} fill={color} rx={2} />
              <text
                x={x + barWidth / 2}
                y={height + 18}
                fontSize="8"
                textAnchor="middle"
                fill="#555"
              >
                {week.week_number}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function roundToNearestFive(value: number) {
  return Math.max(5, Math.round(value / 5) * 5);
}

function roundToNearestInteger(value: number) {
  return Math.max(1, Math.round(value));
}

function formatMinutes(value: number | null) {
  if (value == null || value <= 0) return "—";

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function formatSeconds(value: number | null) {
  if (value == null || value <= 0) return "—";

  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatKm(value: number | null) {
  if (value == null || value <= 0) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} km`;
}

function parseDurationToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;

  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hours = Number.parseInt(hhmmMatch[1], 10);
    const minutes = Number.parseInt(hhmmMatch[2], 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  const hoursMatch = raw.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutesMatch = raw.match(/(\d+(?:\.\d+)?)\s*m/);
  const minWordMatch = raw.match(/(\d+(?:\.\d+)?)\s*min/);

  if (hoursMatch || minutesMatch || minWordMatch) {
    const hours = hoursMatch ? Number.parseFloat(hoursMatch[1]) : 0;
    const minutesFromM = minutesMatch ? Number.parseFloat(minutesMatch[1]) : 0;
    const minutesFromMin = !minutesMatch && minWordMatch ? Number.parseFloat(minWordMatch[1]) : 0;
    const total = hours * 60 + minutesFromM + minutesFromMin;
    return total > 0 ? total : null;
  }

  const plainNumber = Number.parseFloat(raw);
  if (!Number.isNaN(plainNumber) && plainNumber > 0) {
    return plainNumber;
  }

  return null;
}

function getSessionScalingMode(session: ProgramTemplateSessionRow): SessionScalingMode {
  const sessionType = (session.type || "").trim().toLowerCase();
  const templateType = getSessionTemplateType(session);
  const name = (session.name || "").trim().toLowerCase();
  const intensity = (session.intensity || "").trim().toLowerCase();

  const isGymSession =
    sessionType === "gym" ||
    templateType === "gym" ||
    name.includes("gym") ||
    name.includes("strength") ||
    name.includes("hypertrophy");

  if (isGymSession) {
    return "none";
  }

  if (sessionType === "rest" || name.includes("rest")) {
    return "none";
  }

  const intensityKeywords = [
    "tempo",
    "fartlek",
    "interval",
    "threshold",
    "hill",
    "steady",
    "speed",
    "vo2",
    "race",
    "test",
  ];

  const isIntensitySession =
    sessionType === "steady" ||
    intensityKeywords.some(
      (keyword) =>
        name.includes(keyword) ||
        sessionType.includes(keyword) ||
        intensity.includes(keyword),
    );

  if (isIntensitySession) {
    return "intensity";
  }

  return "endurance";
}

function getScalarForSession(
  session: ProgramTemplateSessionRow,
  athleteProfile: AthleteProfileSummary | null,
) {
  const mode = getSessionScalingMode(session);

  if (!athleteProfile) {
    return {
      scalar: 1,
      mode,
    };
  }

  if (mode === "intensity") {
    return {
      scalar: athleteProfile.intensityScalar ?? 1,
      mode,
    };
  }

  if (mode === "endurance") {
    return {
      scalar: athleteProfile.enduranceScalar ?? 1,
      mode,
    };
  }

  return {
    scalar: 1,
    mode,
  };
}

function scaleMinutes(value: string | null | undefined, scalar: number) {
  const baseMinutes = parseDurationToMinutes(value);
  if (baseMinutes == null) {
    return {
      originalMinutes: null as number | null,
      scaledMinutes: null as number | null,
      scaledDisplay: value ?? "",
    };
  }

  const scaledMinutes = roundToNearestFive(baseMinutes * scalar);

  return {
    originalMinutes: baseMinutes,
    scaledMinutes,
    scaledDisplay: formatMinutes(scaledMinutes),
  };
}

function scaleKm(value: number | null | undefined, scalar: number) {
  if (value == null) {
    return {
      originalKm: null as number | null,
      scaledKm: null as number | null,
      scaledDisplay: "",
    };
  }

  const scaledKm = Math.max(0.5, Math.round(value * scalar * 10) / 10);

  return {
    originalKm: value,
    scaledKm,
    scaledDisplay: formatKm(scaledKm),
  };
}

function scaleSeconds(value: number | null | undefined, scalar: number) {
  if (value == null) {
    return {
      originalSeconds: null as number | null,
      scaledSeconds: null as number | null,
    };
  }

  return {
    originalSeconds: value,
    scaledSeconds: roundToNearestInteger(value * scalar),
  };
}

function scaleInteger(value: number | null | undefined, scalar: number) {
  if (value == null) {
    return {
      originalValue: null as number | null,
      scaledValue: null as number | null,
    };
  }

  return {
    originalValue: value,
    scaledValue: roundToNearestInteger(value * scalar),
  };
}

function formatScalar(value: number) {
  return value.toFixed(2).replace(/\.00$/, "");
}

export default function ViewProgramTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTemplateId = params?.templateId;
  const templateId =
    typeof rawTemplateId === "string"
      ? rawTemplateId
      : Array.isArray(rawTemplateId)
        ? rawTemplateId[0]
        : "";

  const athleteId = searchParams.get("athleteId") || null;

  const [template, setTemplate] = useState<TemplateCard | null>(null);
  const [weeks, setWeeks] = useState<ProgramTemplateWeekRow[]>([]);
  const [sessions, setSessions] = useState<ProgramTemplateSessionRow[]>([]);
  const [athleteEvent, setAthleteEvent] = useState<AthleteEventSummary | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSavingCopy, setIsSavingCopy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const [activeTab, setActiveTab] = useState<"structure" | "summary">("structure");
  const [collapsedWeekIds, setCollapsedWeekIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      const supabase = createClient();

      if (!templateId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");
      setStatusMessage("");

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        setIsAdmin(roles?.some((r) => r.role === "admin") ?? false);
      }

      const { data: templateData, error: templateError } = await supabase
        .from("program_templates")
        .select(`
          id,
          name,
          slug,
          description,
          discipline,
          plan_length_weeks,
          training_days_per_week,
          starting_fitness,
          event_goal,
          is_featured,
          is_active,
          min_weekly_training_hours,
          min_longest_recent_session_minutes,
          min_training_consistency_weeks,
          min_back_to_back_days,
          requires_hills,
          requires_gym,
          requires_load_carriage,
          requires_heat_acclimation,
          suitable_race_goals,
          program_template_tag_links (
            program_template_tags (
              id,
              name,
              slug,
              tag_group,
              sort_order
            )
          )
        `)
        .eq("id", templateId)
        .maybeSingle();

      if (cancelled) return;

      if (templateError) {
        setLoadError(templateError.message);
        setIsLoading(false);
        return;
      }

      if (!templateData) {
        setIsLoading(false);
        return;
      }

      const typedTemplate = templateData as ProgramTemplateRow;
      const tags = (typedTemplate.program_template_tag_links ?? [])
        .flatMap((link) => normaliseTagRelation(link.program_template_tags))
        .sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        });

      setTemplate({
        id: typedTemplate.id,
        name: typedTemplate.name,
        slug: typedTemplate.slug,
        description: typedTemplate.description ?? "",
        discipline: typedTemplate.discipline,
        planLengthWeeks: typedTemplate.plan_length_weeks,
        trainingDaysPerWeek: typedTemplate.training_days_per_week,
        startingFitness: typedTemplate.starting_fitness,
        eventGoal: typedTemplate.event_goal ?? "",
        isFeatured: typedTemplate.is_featured,
        isActive: typedTemplate.is_active,
        minWeeklyTrainingHours: typedTemplate.min_weekly_training_hours ?? null,
        minLongestRecentSessionMinutes: typedTemplate.min_longest_recent_session_minutes ?? null,
        minTrainingConsistencyWeeks: typedTemplate.min_training_consistency_weeks ?? null,
        minBackToBackDays: typedTemplate.min_back_to_back_days ?? null,
        requiresHills: typedTemplate.requires_hills ?? false,
        requiresGym: typedTemplate.requires_gym ?? false,
        requiresLoadCarriage: typedTemplate.requires_load_carriage ?? false,
        requiresHeatAcclimation: typedTemplate.requires_heat_acclimation ?? false,
        suitableRaceGoals: typedTemplate.suitable_race_goals ?? [],
        tags,
      });

      const { data: weekData, error: weekError } = await supabase
        .from("program_template_weeks")
        .select("id, program_template_id, week_number, focus, notes")
        .eq("program_template_id", templateId)
        .order("week_number", { ascending: true });

      if (cancelled) return;

      if (weekError) {
        setLoadError(weekError.message);
        setIsLoading(false);
        return;
      }

      const typedWeeks = (weekData ?? []) as ProgramTemplateWeekRow[];
      setWeeks(typedWeeks);

      const weekIds = typedWeeks.map((week) => week.id);

      if (weekIds.length > 0) {
        const { data: sessionData, error: sessionError } = await supabase
          .from("program_template_sessions")
          .select(`
            id,
            program_template_week_id,
            day_label,
            sort_order,
            type,
            name,
            description,
            duration,
            intensity,
            is_key_session,
            session_template_id,
            run_time_type,
            run_start_time,
            is_time_strict,
            week_number,
            day_number,
            activity,
            subtype,
            distance_km,
            terrain,
            elevation_gain_meters,
            pack_weight_kg,
            strides,
            warmup_minutes,
            cooldown_minutes,
            interval_reps,
            interval_duration,
            tags,
            session_templates:session_templates!program_template_sessions_session_template_id_fkey (
              distance_km,
              type,
              activity,
              subtype
            ),
            program_template_session_exercises (
              id,
              program_template_session_id,
              exercise_id,
              sort_order,
              sets,
              reps,
              duration_seconds,
              notes
            )
          `)
          .in("program_template_week_id", weekIds)
          .order("week_number", { ascending: true })
          .order("day_number", { ascending: true })
          .order("sort_order", { ascending: true });

        if (cancelled) return;

        if (sessionError) {
          setLoadError(sessionError.message);
          setIsLoading(false);
          return;
        }

        setSessions((sessionData ?? []) as ProgramTemplateSessionRow[]);
      } else {
        setSessions([]);
      }

      if (athleteId) {
        const { data: athleteData, error: athleteError } = await supabase
          .from("athlete_profiles")
          .select(`
            full_name,
            selected_event_id,
            available_training_days_per_week,
            weekly_training_hours,
            longest_recent_session_minutes,
            training_consistency_weeks,
            max_back_to_back_days,
            load_carriage_experience,
            race_goal,
            endurance_scalar,
            intensity_scalar
          `)
          .or(`id.eq.${athleteId},user_id.eq.${athleteId}`)
          .maybeSingle();

        if (cancelled) return;

        if (athleteError) {
          setLoadError(athleteError.message);
          setIsLoading(false);
          return;
        }

        const typedAthlete = athleteData as {
          full_name?: string | null;
          selected_event_id?: string | null;
          available_training_days_per_week?: number | null;
          weekly_training_hours?: number | null;
          longest_recent_session_minutes?: number | null;
          training_consistency_weeks?: number | null;
          max_back_to_back_days?: number | null;
          load_carriage_experience?: boolean | null;
          race_goal?: string | null;
          endurance_scalar?: number | null;
          intensity_scalar?: number | null;
        } | null;

        setAthleteProfile(
          typedAthlete
            ? {
                athleteName: typedAthlete.full_name ?? "",
                availableTrainingDaysPerWeek:
                  typedAthlete.available_training_days_per_week ?? null,
                weeklyTrainingHours: typedAthlete.weekly_training_hours ?? null,
                longestRecentSessionMinutes:
                  typedAthlete.longest_recent_session_minutes ?? null,
                trainingConsistencyWeeks:
                  typedAthlete.training_consistency_weeks ?? null,
                maxBackToBackDays: typedAthlete.max_back_to_back_days ?? null,
                loadCarriageExperience:
                  typedAthlete.load_carriage_experience ?? null,
                raceGoal: typedAthlete.race_goal ?? null,
                enduranceScalar: typedAthlete.endurance_scalar ?? 1,
                intensityScalar: typedAthlete.intensity_scalar ?? 1,
              }
            : null,
        );

        if (typedAthlete?.selected_event_id) {
          const { data: eventData, error: eventError } = await supabase
            .from("events")
            .select("id, name, climate_type, terrain_type, race_conditions")
            .eq("id", typedAthlete.selected_event_id)
            .maybeSingle();

          if (cancelled) return;

          if (eventError) {
            setLoadError(eventError.message);
            setIsLoading(false);
            return;
          }

          setAthleteEvent(
            eventData
              ? {
                  selectedEventId: eventData.id,
                  eventName: eventData.name ?? "",
                  climateType: eventData.climate_type ?? "",
                  terrainType: eventData.terrain_type ?? "",
                  raceConditions: (eventData as { race_conditions?: import("@/lib/planner/types").RaceConditions | null }).race_conditions ?? null,
                }
              : null,
          );
        } else {
          setAthleteEvent(null);
        }
      } else {
        setAthleteProfile(null);
        setAthleteEvent(null);
      }

      setIsLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [templateId, athleteId]);

  const match = useMemo(() => {
    if (!template) return null;
    return getTemplateMatch(template, athleteEvent, athleteProfile);
  }, [template, athleteEvent, athleteProfile]);

  const sessionsByWeek = useMemo(() => {
    const map = new Map<string, ProgramTemplateSessionRow[]>();

    for (const session of sessions) {
      const existing = map.get(session.program_template_week_id) ?? [];
      existing.push(session);
      map.set(session.program_template_week_id, existing);
    }

    for (const [key, value] of map.entries()) {
      value.sort((a, b) => {
        const dayA = a.day_number ?? 0;
        const dayB = b.day_number ?? 0;
        if (dayA !== dayB) return dayA - dayB;
        return a.sort_order - b.sort_order;
      });
      map.set(key, value);
    }

    return map;
  }, [sessions]);

  function calculateDeloadWeeks(
    startDate: Date,
    goalRaceDate: Date | null,
    prepRaces: Array<{ id: string; event_date: string | null }>,
    totalWeeks: number,
  ): {
    deloadWeekNums: Set<number>;
    warnings: Array<{ code: string; title: string; message: string; severity: string; suggestion?: string; id: string }>;
    computedWeeks: number;
  } {
    const MS_PER_WEEK = 7 * 86400 * 1000;

    // Calculate computed weeks based on goal race
    let computedWeeks = totalWeeks;
    if (goalRaceDate) {
      computedWeeks = Math.ceil((goalRaceDate.getTime() - startDate.getTime()) / MS_PER_WEEK);
    }

    // Cap computed weeks at template length
    const cappedWeeks = Math.min(computedWeeks, totalWeeks);

    // Filter to valid prep races (with event_date)
    const validPrepRaces = prepRaces
      .filter((r) => r.event_date)
      .map((r) => ({ raceDate: new Date(r.event_date!), originalId: r.id }));

    const deloadWeekNums = new Set<number>();
    const warnings: Array<{ code: string; title: string; message: string; severity: string; suggestion?: string; id: string }> = [];

    // Process each prep race for deload week assignment
    const raceWeekNumbers: number[] = [];
    for (const { raceDate } of validPrepRaces) {
      const raceWeekNum = Math.ceil((raceDate.getTime() - startDate.getTime()) / MS_PER_WEEK);
      if (raceWeekNum > 0 && raceWeekNum <= cappedWeeks) {
        raceWeekNumbers.push(raceWeekNum);
        const deloadWeekNum = raceWeekNum - 1;
        if (deloadWeekNum > 0 && deloadWeekNum <= cappedWeeks) {
          deloadWeekNums.add(deloadWeekNum);
        }
      }
    }

    // PREP_RACE_NEAR_GOAL: prep race within 3 weeks of goal race
    if (goalRaceDate && validPrepRaces.length > 0) {
      for (const { raceDate } of validPrepRaces) {
        const weeksBeforeGoal = Math.ceil((goalRaceDate.getTime() - raceDate.getTime()) / MS_PER_WEEK);
        if (weeksBeforeGoal > 0 && weeksBeforeGoal <= 3) {
          warnings.push({
            id: buildClientId("warning-prep-near-goal"),
            code: "PREP_RACE_NEAR_GOAL",
            title: "Prep race close to goal race",
            message: `A preparation race is only ${weeksBeforeGoal} week${weeksBeforeGoal === 1 ? "" : "s"} before the goal race, which may not allow adequate recovery.`,
            severity: "warning",
            suggestion: "Consider rescheduling or treating this as a tune-up race during taper.",
          });
          break;
        }
      }
    }

    // PREP_RACES_TOO_CLOSE: any two prep races < 3 weeks apart
    if (validPrepRaces.length > 1) {
      for (let i = 0; i < validPrepRaces.length; i++) {
        for (let j = i + 1; j < validPrepRaces.length; j++) {
          const gap = Math.abs(
            Math.ceil((validPrepRaces[i].raceDate.getTime() - validPrepRaces[j].raceDate.getTime()) / MS_PER_WEEK)
          );
          if (gap > 0 && gap < 3) {
            warnings.push({
              id: buildClientId("warning-prep-too-close"),
              code: "PREP_RACES_TOO_CLOSE",
              title: "Prep races too close together",
              message: `Two preparation races are only ${gap} week${gap === 1 ? "" : "s"} apart, limiting recovery time.`,
              severity: "warning",
              suggestion: "Ensure adequate recovery between back-to-back races or consolidate focus.",
            });
            break;
          }
        }
        if (warnings.some((w) => w.code === "PREP_RACES_TOO_CLOSE")) break;
      }
    }

    // MANY_DELOAD_WEEKS: deload weeks > 35% of total weeks
    const deloadPercentage = cappedWeeks > 0 ? (deloadWeekNums.size / cappedWeeks) * 100 : 0;
    if (deloadPercentage > 35) {
      warnings.push({
        id: buildClientId("warning-many-deloads"),
        code: "MANY_DELOAD_WEEKS",
        title: "Excessive deload weeks",
        message: `${deloadWeekNums.size} deload weeks (${deloadPercentage.toFixed(1)}%) exceeds 35% of the plan, which may reduce training stimulus.`,
        severity: "warning",
        suggestion: "Consider adjusting prep race dates or consolidating races to reduce deload frequency.",
      });
    }

    // PLAN_COMPRESSED: computed weeks < template weeks
    if (computedWeeks < totalWeeks) {
      warnings.push({
        id: buildClientId("warning-compressed"),
        code: "PLAN_COMPRESSED",
        title: "Plan compressed within template",
        message: `Only ${cappedWeeks} of ${totalWeeks} template weeks will be used based on the goal race date.`,
        severity: "info",
        suggestion: "Consider earlier races or extended preparation timeline.",
      });
    }

    return {
      deloadWeekNums,
      warnings,
      computedWeeks: cappedWeeks,
    };
  }

  async function handleDeleteTemplate() {
    if (!template) return;
    if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;

    setIsDeletingTemplate(true);
    try {
      const supabase = createClient();

      // Delete child records first (sessions → weeks → template)
      const { data: weekRows } = await supabase
        .from("program_template_weeks")
        .select("id")
        .eq("program_template_id", template.id);

      const weekIds = (weekRows ?? []).map((w) => w.id);

      if (weekIds.length > 0) {
        const { data: sessionRows } = await supabase
          .from("program_template_sessions")
          .select("id")
          .in("program_template_week_id", weekIds);

        const sessionIds = (sessionRows ?? []).map((s) => s.id);

        if (sessionIds.length > 0) {
          const { error: exErr } = await supabase
            .from("program_template_session_exercises")
            .delete()
            .in("program_template_session_id", sessionIds);
          if (exErr) throw new Error(exErr.message);
        }

        const { error: sessErr } = await supabase
          .from("program_template_sessions")
          .delete()
          .in("program_template_week_id", weekIds);
        if (sessErr) throw new Error(sessErr.message);

        const { error: weekErr } = await supabase
          .from("program_template_weeks")
          .delete()
          .in("id", weekIds);
        if (weekErr) throw new Error(weekErr.message);
      }

      const { error: tagErr } = await supabase
        .from("program_template_tag_links")
        .delete()
        .eq("program_template_id", template.id);
      if (tagErr) throw new Error(tagErr.message);

      const { error: tmplErr } = await supabase
        .from("program_templates")
        .delete()
        .eq("id", template.id);
      if (tmplErr) throw new Error(tmplErr.message);

      router.push("/coach/program-templates");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusMessage(`Failed to delete template: ${message}`);
      setIsDeletingTemplate(false);
    }
  }

  async function handleSaveCopyToAthlete() {
    const supabase = createClient();

    if (!template || !athleteId) {
      return;
    }

    setIsSavingCopy(true);
    setStatusMessage("");

    try {
      let coachUserId: string | null = TEST_COACH_USER_ID;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        coachUserId = user.id;
      }

      const { data: athleteProfileRow, error: athleteError } = await supabase
        .from("athlete_profiles")
        .select("selected_event_id, selected_preparation_race_ids, preferred_long_session_day, available_gym_days, available_run_days, athlete_equipment_unavailable(equipment_options(slug))")
        .eq("user_id", athleteId)
        .maybeSingle();

      if (athleteError) {
        throw new Error(`athlete_profiles query failed: ${athleteError.message}`);
      }

      // Fetch race conditions and event date from the selected event
      let raceConditions = null;
      let eventData = null;
      if (athleteProfileRow?.selected_event_id) {
        const eventResult = await supabase
          .from("events")
          .select("race_conditions, event_date")
          .eq("id", athleteProfileRow.selected_event_id)
          .maybeSingle();
        eventData = eventResult.data;
        raceConditions = eventData?.race_conditions ?? null;
      }

      // Load preparation races for deload week calculations
      let prepRaces: Array<{ id: string; name: string; event_date: string | null }> = [];
      const prepRaceIds = (athleteProfileRow?.selected_preparation_race_ids as string[] | null | undefined) ?? [];
      if (prepRaceIds.length > 0) {
        const { data: prepRaceData } = await supabase
          .from("preparation_races")
          .select("id, name, event_date")
          .in("id", prepRaceIds);
        prepRaces = (prepRaceData ?? []) as typeof prepRaces;
      }

      const now = new Date().toISOString();

      // Calculate start date (today at 00:00:00 UTC)
      const startDate = new Date();
      startDate.setUTCHours(0, 0, 0, 0);

      // Extract goal race date from events row
      let goalRaceDate: Date | null = null;
      if (eventData?.event_date) {
        const parsed = new Date(eventData.event_date);
        if (!isNaN(parsed.getTime())) {
          goalRaceDate = parsed;
        }
      }

      // Calculate deload weeks and generate warnings
      const { deloadWeekNums, warnings: raceWarnings, computedWeeks } = calculateDeloadWeeks(
        startDate,
        goalRaceDate,
        prepRaces,
        weeks.length,
      );

      // Build prep race markers (which week each prep race falls in)
      const MS_PER_WEEK = 7 * 86400 * 1000;
      const prepRaceMarkers = prepRaces
        .filter((r) => r.event_date)
        .map((r) => ({
          weekNumber: Math.ceil((new Date(r.event_date!).getTime() - startDate.getTime()) / MS_PER_WEEK),
          name: r.name,
          date: r.event_date as string,
        }))
        .filter((m) => m.weekNumber > 0 && m.weekNumber <= computedWeeks);

      const athleteAvailability = athleteProfileRow ? {
        preferred_long_session_day: (athleteProfileRow as Record<string, unknown>).preferred_long_session_day as string | null ?? null,
        available_gym_days: (athleteProfileRow as Record<string, unknown>).available_gym_days as string[] | null ?? null,
        available_run_days: (athleteProfileRow as Record<string, unknown>).available_run_days as string[] | null ?? null,
      } : null;

      const planJson = {
        id: buildClientId("plan"),
        name: template.name,
        athleteName: athleteProfile?.athleteName ?? "",
        eventName: athleteEvent?.eventName ?? template.name,
        eventDate: goalRaceDate ? goalRaceDate.toISOString().split("T")[0] : "",
        startDate: startDate.toISOString().split("T")[0],
        createdAt: now,
        updatedAt: now,
        warnings: raceWarnings,
        prepRaceMarkers,
        athleteScalars: {
          enduranceScalar: athleteProfile?.enduranceScalar ?? 1,
          intensityScalar: athleteProfile?.intensityScalar ?? 1,
        },
        weeks: weeks
          .slice()
          .sort((a, b) => a.week_number - b.week_number)
          .slice(0, computedWeeks)
          .map((week) => {
            const weekSessions = sessionsByWeek.get(week.id) ?? [];

            return {
              id: `week-${week.week_number}`,
              weekNumber: week.week_number,
              focus: deloadWeekNums.has(week.week_number) ? "Deload" : (week.focus ?? ""),
              notes: week.notes ?? "",
              assembledFromTemplates: false,
              sessions: (() => {
                if (weekSessions.length === 0) return [];
                // Build sessions with a temporary _isLong marker for day assignment
                const built = weekSessions.map((session, index) => {
                  const { scalar, mode } = getScalarForSession(session, athleteProfile);
                  const scaledDuration = scaleMinutes(session.duration, scalar);
                  const scaledDistance = scaleKm(getSessionDistanceKm(session), scalar);
                  const effectiveScalar = mode === "none" ? 1 : scalar;
                  const st = Array.isArray(session.session_templates)
                    ? session.session_templates[0]
                    : session.session_templates;
                  return {
                    id: `session-${week.week_number}-${index + 1}-${session.id}`,
                    weekId: `week-${week.week_number}`,
                    sortOrder: index + 1,
                    dayLabel: "",
                    type: session.type,
                    _isLong: (st?.subtype ?? "").toLowerCase() === "long",
                    name: session.name,
                    description: session.description ?? "",
                    tags: [],
                    duration: session.duration
                      ? scaledDuration.scaledDisplay || session.duration
                      : "",
                    distance: scaledDistance.scaledDisplay || "",
                    intensity: session.intensity ?? "",
                    isKeySession: session.is_key_session,
                    originalDuration: session.duration ?? "",
                    originalDistance: scaledDistance.originalKm != null
                      ? formatKm(scaledDistance.originalKm)
                      : "",
                    scalingMode: mode,
                    scalingScalar: scalar,
                    exercises: (session.program_template_session_exercises ?? [])
                      .slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((exercise, exerciseIndex) => {
                        const scaledSets = scaleInteger(exercise.sets, effectiveScalar);
                        const scaledReps = scaleInteger(exercise.reps, effectiveScalar);
                        const scaledDurationSeconds = scaleSeconds(exercise.duration_seconds, effectiveScalar);
                        return {
                          id: `exercise-${exercise.id}-${exerciseIndex + 1}`,
                          exerciseId: exercise.exercise_id,
                          name: exercise.exercise?.name ?? exercise.exercise_id,
                          sortOrder: exercise.sort_order,
                          sets: scaledSets.scaledValue,
                          reps: scaledReps.scaledValue,
                          durationSeconds: scaledDurationSeconds.scaledSeconds,
                          notes: exercise.notes ?? "",
                          originalSets: exercise.sets ?? null,
                          originalReps: exercise.reps ?? null,
                          originalDurationSeconds: exercise.duration_seconds ?? null,
                        };
                      }),
                  };
                });
                return assignDayLabelsToSessions(built, athleteAvailability, (s) => s._isLong)
                  .map(({ _isLong: _drop, ...rest }) => rest);
              })(),
            };
          }),
      };

      const { error: insertError } = await supabase.from("athlete_plans").insert({
        athlete_user_id: athleteId,
        coach_user_id: coachUserId,
        event_id: athleteProfileRow?.selected_event_id ?? null,
        source_program_template_id: template.id,
        name: `${template.name} - Draft`,
        plan_json: planJson,
        is_active: true,
      });

      if (insertError) {
        throw insertError;
      }

      router.push(`/coach?athleteId=${encodeURIComponent(athleteId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      console.error("handleSaveCopyToAthlete failed:", message);
      setStatusMessage(`Failed to save template copy: ${message}`);
    } finally {
      setIsSavingCopy(false);
    }
  }

  function toggleWeekCollapsed(weekId: string) {
    setCollapsedWeekIds((current) => ({ ...current, [weekId]: current[weekId] !== false }));
  }

  if (isLoading) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            Loading template…
          </div>
        </div>
      </main>
    );
  }

  if (loadError || !template) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            Could not load template: {loadError || "Unknown error"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">View Template</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Review the template before copying it onto the current athlete.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href={
                athleteId
                  ? `/coach/program-templates?athleteId=${encodeURIComponent(athleteId)}`
                  : "/coach/program-templates"
              }
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Back to Templates
            </Link>

            <Link
              href={
                athleteId
                  ? `/coach/program-templates/${encodeURIComponent(
                      template.id,
                    )}/edit?athleteId=${encodeURIComponent(athleteId)}`
                  : `/coach/program-templates/${encodeURIComponent(template.id)}/edit`
              }
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Edit Template
            </Link>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => void handleDeleteTemplate()}
                disabled={isDeletingTemplate}
                className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {isDeletingTemplate ? "Deleting…" : "Delete Template"}
              </button>
            ) : null}
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-900">
            {statusMessage}
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold text-zinc-900">{template.name}</h2>
                {template.isFeatured ? (
                  <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white">
                    Featured
                  </span>
                ) : null}
                {!template.isActive ? (
                  <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">
                    Inactive
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm text-zinc-600">{template.description || "—"}</p>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                <span>{template.planLengthWeeks} weeks</span>
                <span>{template.trainingDaysPerWeek} days/week</span>
                <span>{titleCase(template.discipline)}</span>
                <span>{titleCase(template.startingFitness)}</span>
                <span>{template.eventGoal || "No goal specified"}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {template.tags.length > 0 ? (
                  template.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-700"
                    >
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-zinc-500">No tags</span>
                )}
              </div>
            </div>

            {athleteId ? (
              <div className="flex shrink-0 flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveCopyToAthlete()}
                  disabled={isSavingCopy}
                  className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSavingCopy ? "Saving…" : "Save Copy To Current Athlete"}
                </button>

                {athleteProfile?.athleteName ? (
                  <div className="text-xs text-zinc-500">
                    Current athlete: {athleteProfile.athleteName}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        {match ? (
          <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Athlete Fit Summary</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Review fit before saving a copy to the athlete.
                </p>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${getBaselineBadgeClass(
                  match.baselineStatus,
                )}`}
              >
                {formatBaselineStatus(match.baselineStatus)}
              </span>
            </div>

            {athleteEvent ? (
              <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Athlete event:{" "}
                <span className="font-semibold">{athleteEvent.eventName || "Unnamed event"}</span>
                {" · "}
                Climate: <span className="font-semibold">{athleteEvent.climateType || "—"}</span>
                {" · "}
                Terrain: <span className="font-semibold">{athleteEvent.terrainType || "—"}</span>
              </div>
            ) : null}

            {athleteProfile ? (
              <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                Scalars in use:{" "}
                <span className="font-semibold">
                  Endurance {formatScalar(athleteProfile.enduranceScalar)}×
                </span>
                {" · "}
                <span className="font-semibold">
                  Intensity {formatScalar(athleteProfile.intensityScalar)}×
                </span>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Overall Fit
                </div>
                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.overallScore}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Time Fit
                </div>
                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.timeFitScore}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Baseline Fit
                </div>
                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.baselineScore}</div>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Event Fit
                </div>
                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.eventFitScore}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Strengths
                </div>
                <div className="mt-2 space-y-1 text-sm text-emerald-900">
                  {match.strengths.length > 0 ? (
                    match.strengths.map((item) => <div key={item}>• {item}</div>)
                  ) : (
                    <div>• No major strengths identified yet</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Baseline Gaps
                </div>
                <div className="mt-2 space-y-1 text-sm text-rose-900">
                  {match.baselineIssues.length > 0 ? (
                    match.baselineIssues.map((item) => <div key={item}>• {item}</div>)
                  ) : (
                    <div>• No baseline gaps flagged</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Coach Tweaks
                </div>
                <div className="mt-2 space-y-1 text-sm text-amber-900">
                  {match.tweakNotes.length > 0 ? (
                    match.tweakNotes.map((item) => <div key={item}>• {item}</div>)
                  ) : (
                    <div>• No obvious tweaks needed</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* Tabs */}
        <div className="mb-4 flex gap-1 rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm">
          {(["structure", "summary"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {tab === "structure" ? "Template Structure" : "Plan Summary"}
            </button>
          ))}
        </div>

        {activeTab === "summary" ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-xl font-semibold">Plan Summary</h2>

            {/* Weekly mileage chart */}
            {(() => {
              const sortedWeeks = weeks.slice().sort((a, b) => a.week_number - b.week_number);
              const weekMiles = sortedWeeks.map((week) => {
                const weekSessions = sessionsByWeek.get(week.id) ?? [];
                const totalKm = weekSessions.reduce((sum, s) => sum + (getSessionDistanceKm(s) ?? 0), 0);
                return { weekNumber: week.week_number, focus: week.focus ?? "", miles: totalKm * 0.621371 };
              });
              const maxMiles = Math.max(...weekMiles.map((w) => w.miles), 1);
              const chartH = 160;
              const barW = 28;
              const gap = 6;
              const totalW = weekMiles.length * (barW + gap);
              const yAxisW = 36;

              const yTicks = (() => {
                const niceMax = Math.ceil(maxMiles / 5) * 5;
                const step = niceMax <= 20 ? 5 : niceMax <= 50 ? 10 : 20;
                const ticks: number[] = [];
                for (let v = 0; v <= niceMax; v += step) ticks.push(v);
                return { ticks, niceMax };
              })();

              return (
                <div className="mb-8">
                  <h3 className="mb-3 text-sm font-semibold text-zinc-700">Weekly mileage (miles)</h3>
                  <div className="overflow-x-auto">
                    <svg
                      width={yAxisW + totalW}
                      height={chartH + 36}
                      className="block"
                    >
                      {/* Y-axis grid lines + labels */}
                      {yTicks.ticks.map((tick) => {
                        const y = chartH - (tick / yTicks.niceMax) * chartH;
                        return (
                          <g key={tick}>
                            <line
                              x1={yAxisW}
                              x2={yAxisW + totalW}
                              y1={y}
                              y2={y}
                              stroke="#e4e4e7"
                              strokeWidth={1}
                            />
                            <text
                              x={yAxisW - 4}
                              y={y + 4}
                              fontSize={9}
                              textAnchor="end"
                              fill="#71717a"
                            >
                              {tick}
                            </text>
                          </g>
                        );
                      })}

                      {/* Bars */}
                      {weekMiles.map((w, i) => {
                        const barH = Math.max(2, (w.miles / yTicks.niceMax) * chartH);
                        const x = yAxisW + i * (barW + gap);
                        const y = chartH - barH;
                        const focus = w.focus.toLowerCase();
                        const fill =
                          focus.includes("recovery") || focus.includes("deload")
                            ? "#10b981"
                            : focus.includes("build") || focus.includes("specific")
                              ? "#3b82f6"
                              : focus.includes("taper") || focus.includes("peak")
                                ? "#8b5cf6"
                                : "#71717a";

                        return (
                          <g key={w.weekNumber}>
                            <rect x={x} y={y} width={barW} height={barH} fill={fill} rx={3} />
                            {w.miles > 0 && (
                              <text x={x + barW / 2} y={y - 4} fontSize={8} textAnchor="middle" fill="#52525b">
                                {w.miles.toFixed(1)}
                              </text>
                            )}
                            <text x={x + barW / 2} y={chartH + 14} fontSize={8} textAnchor="middle" fill="#71717a">
                              W{w.weekNumber}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  {weekMiles.every((w) => w.miles === 0) && (
                    <p className="mt-2 text-sm text-zinc-400 italic">No distance data on sessions yet — add distance (km) to sessions to see the chart.</p>
                  )}
                </div>
              );
            })()}
          </section>
        ) : null}

        {activeTab === "structure" ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Template Structure</h2>
            {renderWeekFocusChartFromTemplate(weeks)}
            <p className="mt-1 text-sm text-zinc-600">
              Review week focus, sessions, and exercises before using this template.
            </p>
          </div>

          <div className="space-y-6">
            {weeks
              .slice()
              .sort((a, b) => a.week_number - b.week_number)
              .map((week) => {
                const theme = getWeekFocusTheme(week.focus ?? "");
                const weekSessions = sessionsByWeek.get(week.id) ?? [];
                const isCollapsed = collapsedWeekIds[week.id] !== false;

                return (
                  <div key={week.id} className={`rounded-2xl border p-4 ${theme.card}`}>
                    <button
                      type="button"
                      onClick={() => toggleWeekCollapsed(week.id)}
                      className="mb-2 flex w-full items-center justify-between gap-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <h3 className={`text-lg font-semibold ${theme.accent}`}>
                          Week {week.week_number}
                        </h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.badge}`}>
                          {week.focus || "Unspecified"}
                        </span>
                        <span className="text-xs font-medium text-zinc-500">
                          {weekSessions.length} session{weekSessions.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <span className={`text-lg font-semibold ${theme.accent}`}>{isCollapsed ? "+" : "−"}</span>
                    </button>

                    {!isCollapsed && week.notes ? (
                      <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                        {week.notes}
                      </div>
                    ) : null}

                    {!isCollapsed && <div className="space-y-4">
                      {weekSessions.map((session) => {
                        const { scalar, mode } = getScalarForSession(session, athleteProfile);
                        const scaledDuration = scaleMinutes(session.duration, scalar);
                        const scaledDistance = scaleKm(getSessionDistanceKm(session), scalar);
                        const effectiveScalar = mode === "none" ? 1 : scalar;
                        const distanceKm = getSessionDistanceKm(session);
                        const isGymSession = mode === "none";

                        return (
                          <div
                            key={session.id}
                            className="rounded-2xl border border-zinc-200 bg-white p-4"
                          >
                            {/* Header: name + type badge */}
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-semibold text-zinc-900">
                                {session.name}
                              </h4>
                              {session.subtype ? (
                                <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                                  {titleCase(session.subtype)}
                                </span>
                              ) : session.type ? (
                                <span className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700">
                                  {session.type}
                                </span>
                              ) : null}
                              {athleteProfile ? (
                                <span className="rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs text-sky-800">
                                  {mode === "intensity"
                                    ? `Intensity ${formatScalar(scalar)}×`
                                    : mode === "endurance"
                                      ? `Endurance ${formatScalar(scalar)}×`
                                      : "Gym"}
                                </span>
                              ) : null}
                            </div>

                            {/* Compact stat strip */}
                            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-zinc-700">
                              {session.duration ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Duration</span>
                                  {isGymSession || !athleteProfile
                                    ? session.duration
                                    : scaledDuration.scaledDisplay || session.duration}
                                  {!isGymSession && athleteProfile && scaledDuration.scaledDisplay && scaledDuration.scaledDisplay !== session.duration
                                    ? <span className="ml-1 text-xs text-zinc-400">(was {session.duration})</span>
                                    : null}
                                </span>
                              ) : null}
                              {distanceKm != null ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Distance</span>
                                  {isGymSession || !athleteProfile
                                    ? formatKm(distanceKm)
                                    : scaledDistance.scaledDisplay || formatKm(distanceKm)}
                                  {!isGymSession && athleteProfile && scaledDistance.scaledDisplay && scaledDistance.scaledDisplay !== formatKm(distanceKm)
                                    ? <span className="ml-1 text-xs text-zinc-400">(was {formatKm(distanceKm)})</span>
                                    : null}
                                </span>
                              ) : null}
                              {session.intensity ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Intensity</span>
                                  {session.intensity}
                                </span>
                              ) : null}
                              {session.terrain && session.terrain !== "any" ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Terrain</span>
                                  {titleCase(session.terrain)}
                                </span>
                              ) : null}
                              {session.elevation_gain_meters ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Elevation</span>
                                  {session.elevation_gain_meters}m
                                </span>
                              ) : null}
                              {session.pack_weight_kg ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Pack</span>
                                  {session.pack_weight_kg}kg
                                </span>
                              ) : null}
                              {session.warmup_minutes ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Warm-up</span>
                                  {session.warmup_minutes}min
                                </span>
                              ) : null}
                              {session.cooldown_minutes ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Cool-down</span>
                                  {session.cooldown_minutes}min
                                </span>
                              ) : null}
                              {session.interval_reps ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Intervals</span>
                                  {session.interval_reps}×{session.interval_duration ? ` ${session.interval_duration}` : ""}
                                </span>
                              ) : null}
                              {session.strides ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Strides</span>
                                  {session.strides}
                                </span>
                              ) : null}
                              {session.run_time_type && session.run_time_type !== "any" ? (
                                <span>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mr-1">Time</span>
                                  {titleCase(session.run_time_type)}
                                </span>
                              ) : null}
                            </div>

                            {session.description ? (
                              <div className="mb-3 whitespace-pre-wrap text-sm text-zinc-600">
                                {session.description}
                              </div>
                            ) : null}

                            {session.tags && session.tags.length > 0 ? (
                              <div className="mb-3 flex flex-wrap gap-1">
                                {session.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            {(session.program_template_session_exercises ?? []).length > 0 ? (
                              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                                <div className="mb-3 text-sm font-semibold text-zinc-900">
                                  Exercises
                                </div>

                                <div className="space-y-2">
                                  {(session.program_template_session_exercises ?? [])
                                    .slice()
                                    .sort((a, b) => a.sort_order - b.sort_order)
                                    .map((exercise) => {
                                      const scaledSets = scaleInteger(exercise.sets, effectiveScalar);
                                      const scaledReps = scaleInteger(exercise.reps, effectiveScalar);
                                      const scaledDurationSeconds = scaleSeconds(
                                        exercise.duration_seconds,
                                        effectiveScalar,
                                      );

                                      return (
                                        <div
                                          key={exercise.id}
                                          className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700"
                                        >
                                          <div className="font-medium text-zinc-900">
                                            {exercise.exercise?.name || exercise.exercise_id}
                                          </div>

                                          {isGymSession ? (
                                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                                  Sets
                                                </div>
                                                <div className="mt-1 text-sm font-medium text-zinc-900">
                                                  {exercise.sets ?? "—"}
                                                </div>
                                              </div>

                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                                  Reps
                                                </div>
                                                <div className="mt-1 text-sm font-medium text-zinc-900">
                                                  {exercise.reps ?? "—"}
                                                </div>
                                              </div>

                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                                  Duration
                                                </div>
                                                <div className="mt-1 text-sm font-medium text-zinc-900">
                                                  {formatSeconds(exercise.duration_seconds)}
                                                </div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                                  Sets
                                                </div>
                                                <div className="mt-1 text-xs text-zinc-600">
                                                  Original: {scaledSets.originalValue ?? "—"}
                                                </div>
                                                <div className="text-sm font-medium text-sky-900">
                                                  Scaled: {scaledSets.scaledValue ?? "—"}
                                                </div>
                                              </div>

                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                                  Reps
                                                </div>
                                                <div className="mt-1 text-xs text-zinc-600">
                                                  Original: {scaledReps.originalValue ?? "—"}
                                                </div>
                                                <div className="text-sm font-medium text-sky-900">
                                                  Scaled: {scaledReps.scaledValue ?? "—"}
                                                </div>
                                              </div>

                                              <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                                                  Duration
                                                </div>
                                                <div className="mt-1 text-xs text-zinc-600">
                                                  Original: {formatSeconds(scaledDurationSeconds.originalSeconds)}
                                                </div>
                                                <div className="text-sm font-medium text-sky-900">
                                                  Scaled: {formatSeconds(scaledDurationSeconds.scaledSeconds)}
                                                </div>
                                              </div>
                                            </div>
                                          )}

                                          {exercise.notes ? (
                                            <div className="mt-3 text-xs text-zinc-600">
                                              {exercise.notes}
                                            </div>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

                      {weekSessions.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-5 text-sm text-zinc-500">
                          No sessions in this week.
                        </div>
                      ) : null}
                    </div>}
                  </div>
                );
              })}
          </div>
        </section>
        ) : null}
      </div>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TutorialProvider } from "@/lib/context/TutorialContext";
import TutorialInfoBox from "@/components/tutorial/TutorialInfoBox";

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
  week_number: number;
  focus: string | null;
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
  availableTrainingDaysPerWeek: number | null;
  weeklyTrainingHours: number | null;
  longestRecentSessionMinutes: number | null;
  trainingConsistencyWeeks: number | null;
  maxBackToBackDays: number | null;
  loadCarriageExperience: boolean | null;
  hasAccessToHills: boolean | null;
  raceGoal: string | null;
};

type AthleteRaceExperience = {
  hasSand: boolean;
  hasMultiDay: boolean;
  multiDayCount: number;
  hasTechnicalTerrain: boolean;
  hasHeatRacing: boolean;
  hasColdRacing: boolean;
  hasAltitude: boolean;
  hasSelfSufficiency: boolean;
  hasNavigation: boolean;
  maxDistanceKm: number;
  raceCount: number;
};

type BaselineStatus = "meets" | "close" | "below" | "unknown";

type TemplateMatchBreakdown = {
  overallScore: number;
  timeFitScore: number;
  eventFitScore: number;
  baselineScore: number;
  experienceFitScore: number | null;
  baselineStatus: BaselineStatus;
  isGoodMatch: boolean;
  strengths: string[];
  baselineIssues: string[];
  experienceSignals: string[];
  tweakNotes: string[];
};

const TEST_COACH_USER_ID = "bff5270a-cdc6-4bc4-a008-3530259d57e6";

function normaliseTagRelation(value: TemplateTag | TemplateTag[] | null | undefined) {
  if (!value) return [] as TemplateTag[];
  return Array.isArray(value) ? value : [value];
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
    if (template.requiresHeatAcclimation) {
      score -= 20;
    }
  }

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

  if (specialConditions.includes("self_sufficiency") && template.requiresLoadCarriage) {
    score += 15;
    strengths.push("Includes load carriage preparation for self-sufficiency event");
  }

  if (conditions?.altitude === "high" || conditions?.altitude === "extreme") {
    const altitudeSignals = ["altitude", "elevation", "hypoxic"];
    const matched = altitudeSignals.filter((signal) => haystack.includes(signal));
    if (matched.length > 0) {
      score += 15;
      strengths.push("Includes altitude / elevation preparation");
    }
  }

  if (template.discipline === "desert" && (isHot || climate === "hot desert")) {
    score += 15;
  }

  if (template.discipline === "trail" && (terrain.includes("trail") || terrain.includes("mountain"))) {
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
  raceExperience: AthleteRaceExperience | null = null,
): TemplateMatchBreakdown {
  const strengths: string[] = [];
  const baselineIssues: string[] = [];
  const tweakNotes: string[] = [];
  let experienceSignals: string[] = [];

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

  const timeFitScore = clampScore((availableDaysFit.score * 0.55) + (weeklyHoursFit.score * 0.45));

  if (availableDaysFit.status === "meets") {
    strengths.push("Fits the athlete’s available training days");
  } else if (availableDaysFit.status === "close") {
    tweakNotes.push("Training days are close to requirement and may only need a small coach adjustment");
  } else if (template.trainingDaysPerWeek > 0) {
    baselineIssues.push(`Needs ${template.trainingDaysPerWeek} training days/week`);
  }

  if (weeklyHoursFit.status === "meets" && template.minWeeklyTrainingHours != null) {
    strengths.push("Weekly training hours meet the plan baseline");
  } else if (weeklyHoursFit.status === "close" && template.minWeeklyTrainingHours != null) {
    tweakNotes.push("Weekly training hours are close to the plan baseline");
  } else if (template.minWeeklyTrainingHours != null) {
    baselineIssues.push(`Needs about ${template.minWeeklyTrainingHours} training hours/week`);
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
  const baselineStatuses: BaselineStatus[] = [longestFit.status, consistencyFit.status, backToBackFit.status];

  if (template.minLongestRecentSessionMinutes != null) {
    if (longestFit.status === "meets") {
      strengths.push("Longest recent session meets the baseline");
    } else if (longestFit.status === "close") {
      tweakNotes.push("Longest recent session is close to the plan requirement");
    } else {
      baselineIssues.push(`Needs ${template.minLongestRecentSessionMinutes} min longest recent session`);
    }
  }

  if (template.minTrainingConsistencyWeeks != null) {
    if (consistencyFit.status === "meets") {
      strengths.push("Training consistency meets the baseline");
    } else if (consistencyFit.status === "close") {
      tweakNotes.push("Training consistency is close to the plan requirement");
    } else {
      baselineIssues.push(`Needs ${template.minTrainingConsistencyWeeks} weeks of consistent training`);
    }
  }

  if (template.minBackToBackDays != null && template.minBackToBackDays > 0) {
    if (backToBackFit.status === "meets") {
      strengths.push("Back-to-back tolerance meets the baseline");
    } else if (backToBackFit.status === "close") {
      tweakNotes.push("Back-to-back tolerance is close to the plan requirement");
    } else {
      baselineIssues.push(`Needs ${template.minBackToBackDays} back-to-back days tolerance`);
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
      tweakNotes.push("Plan requires load carriage; coach may need to add a short adaptation block");
    } else {
      baselineScores.push(30);
      baselineStatuses.push("unknown");
      tweakNotes.push("Load carriage experience is unknown for a plan that requires it");
    }
  }

  if (template.requiresHills) {
    if (athleteProfile?.hasAccessToHills === true) {
      strengths.push("Athlete has access to hills required by the plan");
      baselineScores.push(100);
      baselineStatuses.push("meets");
    } else if (athleteProfile?.hasAccessToHills === false) {
      baselineScores.push(0);
      baselineStatuses.push("below");
      baselineIssues.push("Plan requires hills but the athlete does not have access to hills");
    } else {
      baselineScores.push(30);
      baselineStatuses.push("unknown");
      tweakNotes.push("Hill access is unknown for a plan that requires hills");
    }
  }

  if (template.requiresHeatAcclimation) {
    tweakNotes.push("Plan includes heat demands; coach should confirm heat acclimation strategy");
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

  // Race experience fit
  let experienceFitScore: number | null = null;
  if (raceExperience && raceExperience.raceCount > 0) {
    const raceFit = getRaceExperienceFit(template, raceExperience);
    experienceFitScore = raceFit.score;
    experienceSignals = raceFit.signals;
    strengths.push(...raceFit.signals.filter((s) => !s.includes("No")));
    baselineIssues.push(...raceFit.signals.filter((s) => s.includes("No")));
  }

  let overallScore = clampScore(
    experienceFitScore !== null
      ? (eventFit.score * 0.35) + (timeFitScore * 0.3) + (baselineScore * 0.2) + (experienceFitScore * 0.15)
      : (eventFit.score * 0.4) + (timeFitScore * 0.35) + (baselineScore * 0.25)
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
    experienceFitScore,
    baselineStatus,
    isGoodMatch,
    strengths: Array.from(new Set(strengths)).slice(0, 4),
    baselineIssues: Array.from(new Set(baselineIssues)).slice(0, 4),
    tweakNotes: Array.from(new Set(tweakNotes)).slice(0, 4),
    experienceSignals,
  };
}

function extractRaceExperience(rawRows: any[]): AthleteRaceExperience {
  if (!rawRows || rawRows.length === 0) {
    return {
      hasSand: false,
      hasMultiDay: false,
      multiDayCount: 0,
      hasTechnicalTerrain: false,
      hasHeatRacing: false,
      hasColdRacing: false,
      hasAltitude: false,
      hasSelfSufficiency: false,
      hasNavigation: false,
      maxDistanceKm: 0,
      raceCount: 0,
    };
  }

  let hasSand = false;
  let hasMultiDay = false;
  let multiDayCount = 0;
  let hasTechnicalTerrain = false;
  let hasHeatRacing = false;
  let hasColdRacing = false;
  let hasAltitude = false;
  let hasSelfSufficiency = false;
  let hasNavigation = false;
  let maxDistanceKm = 0;

  for (const row of rawRows) {
    const race = row.preparation_races || row;
    const specialConditions = race.race_conditions?.specialConditions || [];
    const terrain = (race.terrain_type || "").toLowerCase();
    const climate = (race.climate_type || "").toLowerCase();
    const temp = race.race_conditions?.temperature || "";
    const altitude = race.race_conditions?.altitude || "";

    if (specialConditions.includes("sand") || terrain.includes("sand") || terrain.includes("desert")) {
      hasSand = true;
    }
    if (specialConditions.includes("multi_day")) {
      hasMultiDay = true;
      multiDayCount++;
    }
    if (specialConditions.includes("technical_terrain")) {
      hasTechnicalTerrain = true;
    }
    if (climate.includes("hot") || climate.includes("desert") || temp.includes("hot") || temp.includes("extreme_heat")) {
      hasHeatRacing = true;
    }
    if (climate.includes("cold") || climate.includes("arctic") || temp.includes("cold") || temp.includes("extreme_cold")) {
      hasColdRacing = true;
    }
    if (altitude === "high" || altitude === "extreme") {
      hasAltitude = true;
    }
    if (specialConditions.includes("self_sufficiency")) {
      hasSelfSufficiency = true;
    }
    if (specialConditions.includes("navigation")) {
      hasNavigation = true;
    }

    if (race.distance_km && race.distance_km > maxDistanceKm) {
      maxDistanceKm = race.distance_km;
    }
  }

  return {
    hasSand,
    hasMultiDay,
    multiDayCount,
    hasTechnicalTerrain,
    hasHeatRacing,
    hasColdRacing,
    hasAltitude,
    hasSelfSufficiency,
    hasNavigation,
    maxDistanceKm,
    raceCount: rawRows.length,
  };
}

function getRaceExperienceFit(
  template: TemplateCard,
  raceExp: AthleteRaceExperience | null
): { score: number; signals: string[] } {
  if (!raceExp || raceExp.raceCount === 0) {
    return { score: 50, signals: [] };
  }

  let score = 50;
  const signals: string[] = [];

  // Positive matches
  if (template.discipline === "desert" && raceExp.hasSand) {
    score += 25;
    signals.push("Desert/sand experience");
  }
  if (template.requiresHeatAcclimation && raceExp.hasHeatRacing) {
    score += 20;
    signals.push("Proven heat tolerance");
  }
  if (template.requiresLoadCarriage && (raceExp.hasSelfSufficiency || raceExp.hasMultiDay)) {
    score += 15;
    signals.push("Load-carrying race experience");
  }
  if (template.discipline === "trail" && raceExp.hasTechnicalTerrain) {
    score += 15;
    signals.push("Technical terrain experience");
  }
  if (template.requiresLoadCarriage && raceExp.maxDistanceKm >= 100) {
    score += 10;
    signals.push("Long-distance background");
  }
  if (template.discipline === "desert" && raceExp.hasMultiDay) {
    score += 15;
    signals.push("Multi-day desert background");
  }
  if (template.discipline === "trail" && raceExp.hasAltitude) {
    score += 10;
    signals.push("Altitude experience");
  }

  // Penalties (only apply when has race history)
  if (template.requiresHeatAcclimation && !raceExp.hasHeatRacing) {
    score -= 15;
    signals.push("No heat race experience");
  }
  if (template.discipline === "desert" && !raceExp.hasSand) {
    score -= 10;
    signals.push("No sand/desert race history");
  }
  if (template.requiresLoadCarriage && !raceExp.hasSelfSufficiency && !raceExp.hasMultiDay) {
    score -= 10;
    signals.push("No self-sufficient race history");
  }

  return { score: Math.max(0, Math.min(100, score)), signals: Array.from(new Set(signals)) };
}

function getCardClass(isGoodMatch: boolean) {
  if (isGoodMatch) {
    return "rounded-2xl border border-emerald-300 bg-emerald-50 p-5";
  }

  return "rounded-2xl border border-zinc-200 bg-white p-5";
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

function TemplatesPageContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("athleteId") || null;
  const tutorial = searchParams.get("tutorial");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [athleteEvent, setAthleteEvent] = useState<AthleteEventSummary | null>(null);
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfileSummary | null>(null);
  const [athleteRaceExperience, setAthleteRaceExperience] = useState<AthleteRaceExperience | null>(null);
  const [availableDays, setAvailableDays] = useState<number | null>(null);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setIsLoading(true);
      setLoadError("");

      const templatesPromise = supabase
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
        .eq("is_active", true)
        .order("is_featured", { ascending: false })
        .order("name", { ascending: true });

      const athletePromise = athleteId
        ? supabase
            .from("athlete_profiles")
            .select(`
              selected_event_id,
              available_training_days_per_week,
              weekly_training_hours,
              longest_recent_session_minutes,
              training_consistency_weeks,
              max_back_to_back_days,
              load_carriage_experience,
              has_access_to_hills,
              race_goal
            `)
            .or(`id.eq.${athleteId},user_id.eq.${athleteId}`)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null });

      const raceHistoryPromise = athleteId
        ? supabase
            .from("athlete_race_history")
            .select("preparation_races(terrain_type, climate_type, distance_km, race_conditions)")
            .eq("athlete_user_id", athleteId)
        : Promise.resolve({ data: [], error: null });

      const [{ data, error }, athleteProfileResponse, raceHistoryResponse] = await Promise.all([
        templatesPromise,
        athletePromise,
        raceHistoryPromise,
      ]);

      if (cancelled) return;

      if (error) {
        setTemplates([]);
        setLoadError(error.message);
        setIsLoading(false);
        return;
      }

      if (athleteProfileResponse.error) {
        setTemplates([]);
        setLoadError(athleteProfileResponse.error.message);
        setIsLoading(false);
        return;
      }

      const athleteData = athleteProfileResponse.data as {
        selected_event_id?: string | null;
        available_training_days_per_week?: number | null;
        weekly_training_hours?: number | null;
        longest_recent_session_minutes?: number | null;
        training_consistency_weeks?: number | null;
        max_back_to_back_days?: number | null;
        load_carriage_experience?: boolean | null;
        has_access_to_hills?: boolean | null;
        race_goal?: string | null;
      } | null;

      const selectedEventId = athleteData?.selected_event_id ?? null;
      setAvailableDays(athleteData?.available_training_days_per_week ?? null);
      setAthleteProfile(
        athleteData
          ? {
              availableTrainingDaysPerWeek: athleteData.available_training_days_per_week ?? null,
              weeklyTrainingHours: athleteData.weekly_training_hours ?? null,
              longestRecentSessionMinutes: athleteData.longest_recent_session_minutes ?? null,
              trainingConsistencyWeeks: athleteData.training_consistency_weeks ?? null,
              maxBackToBackDays: athleteData.max_back_to_back_days ?? null,
              loadCarriageExperience: athleteData.load_carriage_experience ?? null,
              hasAccessToHills: athleteData.has_access_to_hills ?? null,
              raceGoal: athleteData.race_goal ?? null,
            }
          : null,
      );

      if (selectedEventId) {
        const { data: eventData, error: eventError } = await supabase
          .from("events")
          .select("id, name, climate_type, terrain_type, race_conditions")
          .eq("id", selectedEventId)
          .maybeSingle();

        if (cancelled) return;

        if (eventError) {
          setTemplates([]);
          setLoadError(eventError.message);
          setIsLoading(false);
          return;
        }

        if (eventData) {
          setAthleteEvent({
            selectedEventId: eventData.id,
            eventName: eventData.name ?? "",
            climateType: eventData.climate_type ?? "",
            terrainType: eventData.terrain_type ?? "",
            raceConditions: (eventData as { race_conditions?: import("@/lib/planner/types").RaceConditions | null }).race_conditions ?? null,
          });
        } else {
          setAthleteEvent(null);
        }
      } else {
        setAthleteEvent(null);
      }

      // Extract race experience from history
      if (raceHistoryResponse.error) {
        setAthleteRaceExperience(null);
      } else {
        const raceHistory = (raceHistoryResponse.data ?? []) as any[];
        setAthleteRaceExperience(extractRaceExperience(raceHistory));
      }

      const mapped: TemplateCard[] = ((data ?? []) as ProgramTemplateRow[]).map((row) => {
        const tags = (row.program_template_tag_links ?? [])
          .flatMap((link) => normaliseTagRelation(link.program_template_tags))
          .sort((a, b) => {
            if (a.sort_order !== b.sort_order) {
              return a.sort_order - b.sort_order;
            }
            return a.name.localeCompare(b.name);
          });

        return {
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description ?? "",
          discipline: row.discipline,
          planLengthWeeks: row.plan_length_weeks,
          trainingDaysPerWeek: row.training_days_per_week,
          startingFitness: row.starting_fitness,
          eventGoal: row.event_goal ?? "",
          isFeatured: row.is_featured,
          minWeeklyTrainingHours: row.min_weekly_training_hours ?? null,
          minLongestRecentSessionMinutes: row.min_longest_recent_session_minutes ?? null,
          minTrainingConsistencyWeeks: row.min_training_consistency_weeks ?? null,
          minBackToBackDays: row.min_back_to_back_days ?? null,
          requiresHills: row.requires_hills ?? false,
          requiresGym: row.requires_gym ?? false,
          requiresLoadCarriage: row.requires_load_carriage ?? false,
          requiresHeatAcclimation: row.requires_heat_acclimation ?? false,
          suitableRaceGoals: row.suitable_race_goals ?? [],
          tags,
        };
      });

      setTemplates(mapped);
      setIsLoading(false);
    }

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (availableDays && availableDays > 0) {
      result = result.filter((template) => template.trainingDaysPerWeek <= availableDays);
    }

    const query = searchQuery.trim().toLowerCase();
    const scoredTemplates = result.map((template) => ({
      template,
      match: getTemplateMatch(template, athleteEvent, athleteProfile, athleteRaceExperience),
    }));

    const filtered = !query
      ? scoredTemplates
      : scoredTemplates.filter(({ template }) =>
          [
            template.name,
            template.description,
            template.discipline,
            template.startingFitness,
            template.eventGoal,
            template.planLengthWeeks.toString(),
            template.trainingDaysPerWeek.toString(),
            ...(template.minWeeklyTrainingHours != null ? [template.minWeeklyTrainingHours.toString()] : []),
            ...template.suitableRaceGoals,
            ...template.tags.map((tag) => tag.name),
            ...template.tags.map((tag) => tag.slug),
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        );

    return filtered
      .sort((a, b) => {
        if (b.match.overallScore !== a.match.overallScore) {
          return b.match.overallScore - a.match.overallScore;
        }
        return a.template.name.localeCompare(b.template.name);
      })
      .map(({ template }) => template);
  }, [templates, searchQuery, availableDays, athleteEvent, athleteProfile, athleteRaceExperience]);

  async function handleUseTemplate(template: TemplateCard) {
    if (!athleteId) {
      alert("No athlete selected");
      return;
    }

    setLoadingTemplateId(template.id);
    setStatusMessage("");

    try {
      const { data: templateWeeks, error: weeksError } = await supabase
        .from("program_template_weeks")
        .select("week_number, focus")
        .eq("program_template_id", template.id)
        .order("week_number", { ascending: true });

      if (weeksError) throw weeksError;

      let coachUserId: string | null = TEST_COACH_USER_ID;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        coachUserId = user.id;
      }

      const { data: athleteProfileRow, error: athleteError } = await supabase
        .from("athlete_profiles")
        .select("selected_event_id")
        .eq("user_id", athleteId)
        .maybeSingle();

      if (athleteError) throw athleteError;

      const now = new Date().toISOString();

      const planJson = {
        id: `plan-${template.id}-${Date.now()}`,
        name: template.name,
        athleteName: "",
        eventName: template.name,
        eventDate: "",
        startDate: "",
        createdAt: now,
        updatedAt: now,
        warnings: [],
        weeks: (templateWeeks || []).map((week: ProgramTemplateWeekRow) => ({
          id: `week-${week.week_number}`,
          weekNumber: week.week_number,
          focus: week.focus ?? "",
          notes: "",
          sessions: [],
        })),
      };

      const { error: insertError } = await supabase.from("athlete_plans").insert({
        athlete_user_id: athleteId,
        coach_user_id: coachUserId,
        event_id: athleteProfileRow?.selected_event_id ?? null,
        source_program_template_id: template.id,
        name: template.name,
        plan_json: planJson,
        is_active: true,
      });

      if (insertError) throw insertError;

      router.push(`/coach?athleteId=${encodeURIComponent(athleteId)}`);
    } catch (error) {
      console.error(error);
      setStatusMessage("Failed to create plan from template.");
    } finally {
      setLoadingTemplateId(null);
    }
  }

  function getEditHref(template: TemplateCard) {
    return athleteId
      ? `/coach/program-templates/${encodeURIComponent(template.id)}/edit?athleteId=${encodeURIComponent(athleteId)}`
      : `/coach/program-templates/${encodeURIComponent(template.id)}/edit`;
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Program Templates</h1>
            <p className="mt-2 text-sm text-zinc-600">
              {athleteId
                ? "Browse program templates for the selected athlete. Scores show time fit, baseline fit, and event fit so the coach can judge whether a plan is ready to use or only needs a small tweak."
                : "Browse program templates by discipline, duration, starting fitness, and tags."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/coach/program-templates/create"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Create Public Template
            </Link>

            <Link
              href={athleteId ? `/coach?athleteId=${athleteId}` : "/coach"}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Back to Coach
            </Link>
          </div>
        </div>

        {tutorial === 'programs' && (
          <div className="mb-6">
            <TutorialInfoBox
              title="Browse and Create Program Templates"
              description="Browse our library of pre-built training plans or create your own templates. Once created, new templates go through admin approval before becoming visible to other coaches. Click 'Create Public Template' to add your own, or browse existing templates to apply them to athletes."
              step={1}
              totalSteps={2}
            />
          </div>
        )}

        {athleteEvent ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
            Athlete event: <span className="font-semibold">{athleteEvent.eventName || "Unnamed event"}</span>
            {" · "}
            Climate: <span className="font-semibold">{athleteEvent.climateType || "—"}</span>
            {" · "}
            Terrain: <span className="font-semibold">{athleteEvent.terrainType || "—"}</span>
          </div>
        ) : null}

        {availableDays ? (
          <div className="mb-4 text-sm text-zinc-600">
            Filtering to ≤ {availableDays} training days per week
          </div>
        ) : null}

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-900">
            {statusMessage}
          </div>
        ) : null}

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Find Program Templates</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Search by name, discipline, goal, fitness level, or tag.
              </p>
            </div>

            <div className="w-full md:max-w-md">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-500">
              Loading templates…
            </div>
          ) : loadError ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              Could not load program templates: {loadError}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-500">
              No program templates matched that search.
            </div>
          ) : (
            <>
              {tutorial === 'programs' && (
                <div className="mt-6 mb-6">
                  <TutorialInfoBox
                    title="Understanding Template Fit Scores"
                    description="Each template shows fit scores based on your athlete's profile and event. Green cards indicate a good match. Click 'Use Template' to create a plan, or 'Edit' to customize it before applying."
                    step={2}
                    totalSteps={2}
                    showNext={false}
                  />
                </div>
              )}
              <div className="mt-6 space-y-4">
                {filteredTemplates.map((template) => {
                const match = getTemplateMatch(template, athleteEvent, athleteProfile, athleteRaceExperience);

                return (
                  <div key={template.id} className={getCardClass(match.isGoodMatch)}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-zinc-900">{template.name}</h3>
                          {template.isFeatured ? (
                            <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-semibold text-white">
                              Featured
                            </span>
                          ) : null}
                          {match.isGoodMatch ? (
                            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                              Good Match
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getBaselineBadgeClass(
                              match.baselineStatus,
                            )}`}
                          >
                            {formatBaselineStatus(match.baselineStatus)}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-zinc-600">{template.description || "—"}</p>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                          <span>{template.planLengthWeeks} weeks</span>
                          <span>{template.trainingDaysPerWeek} days/week</span>
                          <span>{titleCase(template.discipline)}</span>
                          <span>{titleCase(template.startingFitness)}</span>
                          <span>{template.eventGoal || "No goal specified"}</span>
                        </div>

                        {athleteId && (
                          <>
                            <div className="mt-4 grid gap-3 md:grid-cols-4">
                              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Overall Fit</div>
                                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.overallScore}</div>
                              </div>
                              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Time Fit</div>
                                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.timeFitScore}</div>
                              </div>
                              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Baseline Fit</div>
                                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.baselineScore}</div>
                              </div>
                              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Event Fit</div>
                                <div className="mt-1 text-2xl font-bold text-zinc-900">{match.eventFitScore}</div>
                              </div>
                              {match.experienceFitScore !== null && (
                                <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Experience Fit</div>
                                  <div className="mt-1 text-2xl font-bold text-zinc-900">{match.experienceFitScore}</div>
                                </div>
                              )}
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-3">
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Strengths</div>
                                <div className="mt-2 space-y-1 text-sm text-emerald-900">
                                  {match.strengths.length > 0 ? match.strengths.map((item) => <div key={item}>• {item}</div>) : <div>• No major strengths identified yet</div>}
                                </div>
                              </div>

                              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Baseline Gaps</div>
                                <div className="mt-2 space-y-1 text-sm text-rose-900">
                                  {match.baselineIssues.length > 0 ? match.baselineIssues.map((item) => <div key={item}>• {item}</div>) : <div>• No baseline gaps flagged</div>}
                                </div>
                              </div>

                              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Coach Tweaks</div>
                                <div className="mt-2 space-y-1 text-sm text-amber-900">
                                  {match.tweakNotes.length > 0 ? match.tweakNotes.map((item) => <div key={item}>• {item}</div>) : <div>• No obvious tweaks needed</div>}
                                </div>
                              </div>
                            </div>
                          </>
                        )}

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

                      <div className="flex shrink-0 gap-2">
<Link
  href={
    athleteId
      ? `/coach/program-templates/${encodeURIComponent(template.id)}?athleteId=${encodeURIComponent(athleteId)}`
      : `/coach/program-templates/${encodeURIComponent(template.id)}`
  }
  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100"
>
  View Template
</Link>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function TemplatesPage() {
  const searchParams = useSearchParams();
  const tutorial = searchParams.get("tutorial");
  const isInTutorial = tutorial === "programs";

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="programs">
      <TemplatesPageContent />
    </TutorialProvider>
  );
}
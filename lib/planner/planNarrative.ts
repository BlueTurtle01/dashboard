import { GeneratedPlan, PlanWeek } from "./types";

export type WeekEntry = {
  weekNumber: number;
  phase: string;
  sessionCount: number;
  sessionTypes: string[];
  milestone: {
    label: string;
    commentary: string;
  } | null;
  isPrepRace: boolean;
  prepRaceName?: string;
};

type MilestoneState = {
  seenLoaded: boolean;
  seenRecce: boolean;
  seenNavigation: boolean;
  seenBuild: boolean;
  seenPeak: boolean;
  seenTaper: boolean;
  seenBackToBack: boolean;
  seenHeatBlock: boolean;
  seenNightSessions: boolean;
  seenSandTerrain: boolean;
  seenLongestSession: boolean;
  seenMobilityFocusWeek: boolean;
  seenMultiActivityWeek: boolean;
  seenSelfSufficiencyTraining: boolean;
  seenRaceNutrition: boolean;
  seenBasePhaseComplete: boolean;
  seenVolumePeak: boolean;
  maxSessionDuration: number;
};

function getPhaseLabel(week: PlanWeek): string {
  if (week.trainingPurpose) return week.trainingPurpose;
  if (week.phase) return week.phase;
  return "Training";
}

function getSessionTypes(week: PlanWeek): string[] {
  return [...new Set(week.sessions.map((s) => s.type))];
}

function hasTags(week: PlanWeek, tag: string): number {
  return week.sessions.filter((s) =>
    s.tags?.some((t) => t.toLowerCase().includes(tag))
  ).length;
}

function detectMilestone(
  week: PlanWeek,
  state: MilestoneState,
  prepRace: { name: string } | undefined,
): { label: string; commentary: string } | null {
  const purpose = week.trainingPurpose ?? "";
  const sessionTypes = getSessionTypes(week);

  // Race week — always show regardless of "first"
  if (purpose === "Race Week") {
    return {
      label: "Race Week",
      commentary:
        "Everything you've done leads here. Trust your preparation, stick to your race plan, and don't do anything new on race day.",
    };
  }

  // Prep race — always show
  if (prepRace) {
    return {
      label: `Prep race: ${prepRace.name}`,
      commentary:
        "A race within your training. Don't taper for it — treat it as a hard training day and recover normally afterwards. Use it to practise your race-day nutrition and pacing strategy.",
    };
  }

  // Holiday / down week
  if (week.isHolidayWeek) {
    return {
      label: "Recovery week",
      commentary:
        "Planned rest. Do less than you think you need to. Recovery is where the fitness gains are actually made — your body adapts during rest, not during the work.",
    };
  }

  // Back-to-back block — first occurrence only
  if (purpose === "Back-to-Back Block" && !state.seenBackToBack) {
    return {
      label: "Back-to-back block",
      commentary:
        "Consecutive hard days are the hallmark of multi-day events. This block teaches your body to perform when it's already tired — exactly what race day demands.",
    };
  }

  // Taper begins — first occurrence only
  if (purpose === "Taper" && !state.seenTaper) {
    return {
      label: "Taper begins",
      commentary:
        "Volume drops but intensity stays sharp. Your body is banking fitness now — resist the urge to do more. Most athletes feel sluggish during taper; this is normal.",
    };
  }

  // Peak phase — first occurrence only
  if (purpose === "Peak" && !state.seenPeak) {
    return {
      label: "Peak training",
      commentary:
        "This is the hardest part of the plan. Fatigue is expected and normal. If something feels wrong rather than just hard, back off immediately — protecting the body now is more important than one session.",
    };
  }

  // Loaded sessions — first occurrence only (Loaded type, or pack_carry activity)
  const hasPackCarry =
    sessionTypes.includes("Loaded") ||
    week.sessions.some((s) => (s as any).activity === "pack_carry" || s.tags?.includes("pack-carry"));
  if (hasPackCarry && !state.seenLoaded) {
    return {
      label: "Pack carrying begins",
      commentary:
        "Your first sessions with weight on your back. Start conservative — the goal is time on feet and posture, not how much you can carry. Increase load gradually over the coming weeks.",
    };
  }

  // Recce sessions — first occurrence only
  if (sessionTypes.includes("Recce") && !state.seenRecce) {
    return {
      label: "Terrain recce",
      commentary:
        "Getting familiar with the type of terrain you'll face on race day. Notice what demands more effort than expected — technical ground, elevation changes, loose surface. This information shapes how you pace the event.",
    };
  }

  // Navigation sessions — first occurrence only
  if (sessionTypes.includes("Navigation") && !state.seenNavigation) {
    return {
      label: "Navigation training",
      commentary:
        "Map and compass work alongside physical training. The event will test your head as much as your legs. Navigation errors on race day cost far more time than fitness.",
    };
  }

  // Heat acclimation — first week with ≥2 heat-tagged sessions
  if (hasTags(week, "heat") >= 2 && !state.seenHeatBlock) {
    return {
      label: "Heat acclimation block",
      commentary:
        "Start moving your runs to the hottest part of the day. Your body adapts to heat — but only if you expose it consistently. Expect performance to dip initially before it improves.",
    };
  }

  // Build phase — first occurrence only
  if (
    (purpose === "Early Build" || purpose === "Late Build") &&
    !state.seenBuild
  ) {
    return {
      label: "Build phase",
      commentary:
        "Base fitness is established. Sessions get more demanding from here — quality matters as much as volume. Recovery between hard sessions becomes increasingly important.",
    };
  }

  // Night sessions — first week with night training
  if (week.sessions.some((s) => s.tags?.some((t) => t.toLowerCase().includes("night"))) && !state.seenNightSessions) {
    return {
      label: "Night sessions begin",
      commentary:
        "Start training in darkness to adapt your circadian rhythm and practice nocturnal pacing. Use headlamps, test battery life, and learn how your body performs at night.",
    };
  }

  // Sand/soft terrain — first week with sand or soft ground
  if (week.sessions.some((s) => s.tags?.some((t) => {
    const tag = t.toLowerCase();
    return tag.includes("sand") || tag.includes("soft") || tag.includes("trail");
  })) && !state.seenSandTerrain) {
    return {
      label: "Sand and soft terrain training",
      commentary:
        "Soft surfaces demand more energy and place different stress on joints. Your running economy will change; don't expect the same pace as firm ground.",
    };
  }

  // Longest session — first session that exceeds previous max
  const sessionDuration = week.sessions.reduce((max, s) => {
    const mins = s.duration ? parseInt(s.duration) : 0;
    return Math.max(max, mins);
  }, 0);
  if (sessionDuration > state.maxSessionDuration && !state.seenLongestSession) {
    return {
      label: "Peak training duration",
      commentary:
        "This is the longest session in your plan. Mental toughness matters as much as fitness here. Break it into segments, manage fueling carefully, and trust your preparation.",
    };
  }

  // Mobility & strength focus week
  const gymCount = week.sessions.filter((s) => s.type === "Gym").length;
  if (gymCount >= 2 && !state.seenMobilityFocusWeek) {
    return {
      label: "Strength and mobility week",
      commentary:
        "Multiple strength sessions this week. These complement your endurance work and build resilience. Prioritize form over intensity; injury prevention matters more than extra load.",
    };
  }

  // Multi-activity week
  const uniqueActivities = new Set(week.sessions.map((s) => s.type).filter(Boolean));
  if (uniqueActivities.size >= 3 && !state.seenMultiActivityWeek) {
    return {
      label: "Multi-activity training week",
      commentary:
        "This week mixes different training modalities. Your body learns to perform across running, strength, and other domains — exactly what multi-day expeditions demand.",
    };
  }

  // Self-sufficiency training (Navigation + Loaded together)
  const hasNav = sessionTypes.includes("Navigation");
  const hasLoaded = sessionTypes.includes("Loaded") ||
    week.sessions.some((s) => (s as any).activity === "pack_carry" || s.tags?.includes("pack-carry"));
  const hasSelfSufficiency = week.sessions.some((s) => s.tags?.some((t) => t.toLowerCase().includes("self-sufficiency")));
  if ((hasNav && hasLoaded || hasSelfSufficiency) && !state.seenSelfSufficiencyTraining) {
    return {
      label: "Self-sufficiency training",
      commentary:
        "Practicing navigation while carrying weight simulates expedition reality. This is where strategy and logistics matter as much as fitness.",
    };
  }

  // Race nutrition
  if (week.sessions.some((s) => s.tags?.some((t) => {
    const tag = t.toLowerCase();
    return tag.includes("nutrition") || tag.includes("fueling") || tag.includes("fuel");
  })) && !state.seenRaceNutrition) {
    return {
      label: "Race nutrition practice",
      commentary:
        "Test your fueling strategy during hard efforts. Race day is not the time to experiment. Find what your stomach tolerates and dial in your intake rhythm.",
    };
  }

  // Base phase complete (transitioning to Build)
  if (purpose === "Early Build" && week.sessions.length > 0) {
    // Check if previous week was in Early/Late Base
    const prevWeek = week.weekNumber > 1 ? week : null;
    if (prevWeek) {
      return {
        label: "Base phase complete",
        commentary:
          "You've built a solid foundation. From here, quality and intensity increase. Trust the base work you've done.",
      };
    }
  }

  return null;
}

function updateState(state: MilestoneState, week: PlanWeek): void {
  const purpose = week.trainingPurpose ?? "";
  const sessionTypes = getSessionTypes(week);

  if (purpose === "Back-to-Back Block") state.seenBackToBack = true;
  if (purpose === "Taper") state.seenTaper = true;
  if (purpose === "Peak") state.seenPeak = true;
  if (purpose === "Early Build" || purpose === "Late Build") state.seenBuild = true;
  if (sessionTypes.includes("Loaded") || week.sessions.some((s) => (s as any).activity === "pack_carry" || s.tags?.includes("pack-carry"))) state.seenLoaded = true;
  if (sessionTypes.includes("Recce")) state.seenRecce = true;
  if (sessionTypes.includes("Navigation")) state.seenNavigation = true;
  if (hasTags(week, "heat") >= 2) state.seenHeatBlock = true;

  if (week.sessions.some((s) => s.tags?.some((t) => t.toLowerCase().includes("night")))) state.seenNightSessions = true;
  if (week.sessions.some((s) => s.tags?.some((t) => {
    const tag = t.toLowerCase();
    return tag.includes("sand") || tag.includes("soft") || tag.includes("trail");
  }))) state.seenSandTerrain = true;

  const sessionDuration = week.sessions.reduce((max, s) => {
    const mins = s.duration ? parseInt(s.duration) : 0;
    return Math.max(max, mins);
  }, 0);
  if (sessionDuration > state.maxSessionDuration) state.maxSessionDuration = sessionDuration;
  if (sessionDuration > state.maxSessionDuration * 0.9) state.seenLongestSession = true;

  if (week.sessions.filter((s) => s.type === "Gym").length >= 2) state.seenMobilityFocusWeek = true;

  const uniqueActivities = new Set(week.sessions.map((s) => s.type).filter(Boolean));
  if (uniqueActivities.size >= 3) state.seenMultiActivityWeek = true;

  const hasNav = sessionTypes.includes("Navigation");
  const hasLoaded = sessionTypes.includes("Loaded") || week.sessions.some((s) => (s as any).activity === "pack_carry");
  if ((hasNav && hasLoaded) || week.sessions.some((s) => s.tags?.some((t) => t.toLowerCase().includes("self-sufficiency")))) {
    state.seenSelfSufficiencyTraining = true;
  }

  if (week.sessions.some((s) => s.tags?.some((t) => {
    const tag = t.toLowerCase();
    return tag.includes("nutrition") || tag.includes("fueling");
  }))) state.seenRaceNutrition = true;

  if (purpose === "Early Build" || purpose === "Late Build") state.seenBasePhaseComplete = true;
}

export function generatePlanNarrative(plan: GeneratedPlan): WeekEntry[] {
  const sortedWeeks = [...plan.weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const prepRacesByWeek = new Map<number, { name: string }>();

  (plan.prepRaceMarkers ?? []).forEach((marker) => {
    prepRacesByWeek.set(marker.weekNumber, { name: marker.name });
  });

  const state: MilestoneState = {
    seenLoaded: false,
    seenRecce: false,
    seenNavigation: false,
    seenBuild: false,
    seenPeak: false,
    seenTaper: false,
    seenBackToBack: false,
    seenHeatBlock: false,
    seenNightSessions: false,
    seenSandTerrain: false,
    seenLongestSession: false,
    seenMobilityFocusWeek: false,
    seenMultiActivityWeek: false,
    seenSelfSufficiencyTraining: false,
    seenRaceNutrition: false,
    seenBasePhaseComplete: false,
    seenVolumePeak: false,
    maxSessionDuration: 0,
  };

  const entries: WeekEntry[] = sortedWeeks.map((week) => {
    const prepRace = prepRacesByWeek.get(week.weekNumber);
    const milestone = detectMilestone(week, state, prepRace);

    // Update state after detection so "first occurrence" logic works
    updateState(state, week);

    return {
      weekNumber: week.weekNumber,
      phase: getPhaseLabel(week),
      sessionCount: week.sessions.length,
      sessionTypes: getSessionTypes(week),
      milestone,
      isPrepRace: Boolean(prepRace),
      prepRaceName: prepRace?.name,
    };
  });

  return entries;
}

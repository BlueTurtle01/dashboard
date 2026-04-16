type CompletedRace = {
  name: string;
  distance_km: number | null;
  terrain_type: string | null;
  climate_type: string | null;
  race_conditions: any | null;
};

export type GoalEvent = {
  name: string;
  event_type: string | null;
  terrain_type: string | null;
  climate_type: string | null;
  race_conditions: { specialConditions?: string[]; temperature?: string; altitude?: string } | null;
};

export function buildRaceHistorySummary(races: CompletedRace[]): string {
  if (!races || races.length === 0) {
    return "No race history recorded.";
  }

  const sentences: string[] = [];

  // Race count and distance range
  if (races.length === 1) {
    const race = races[0];
    const distance = race.distance_km ? `${race.distance_km}km` : "unknown distance";
    sentences.push(`Has completed 1 race: ${race.name} (${distance}).`);
  } else {
    const distances = races
      .map((r) => r.distance_km)
      .filter((d): d is number => d !== null && d !== undefined);

    if (distances.length > 0) {
      const minDist = Math.min(...distances);
      const maxDist = Math.max(...distances);

      if (minDist === maxDist) {
        sentences.push(`Has completed ${races.length} races, all around ${minDist}km.`);
      } else {
        sentences.push(`Has completed ${races.length} races ranging from ${minDist}km to ${maxDist}km.`);
      }
    } else {
      sentences.push(`Has completed ${races.length} races.`);
    }
  }

  // Terrain experience
  const terrainTypes = [...new Set(races.map((r) => r.terrain_type).filter(Boolean))];
  if (terrainTypes.length > 0) {
    sentences.push(`Terrain experience: ${terrainTypes.join(", ")}.`);
  }

  // Climate experience
  const climateTypes = [...new Set(races.map((r) => r.climate_type).filter(Boolean))];
  if (climateTypes.length > 0) {
    const climateStr = climateTypes.join(" and ");
    sentences.push(`Has raced in ${climateStr} conditions.`);
  }

  // Multi-day experience (separate sentence)
  const multiDayRaces = races.filter(
    (r) => r.race_conditions?.specialConditions?.includes("multi_day")
  );
  if (multiDayRaces.length > 0) {
    if (multiDayRaces.length === 1) {
      sentences.push(`Has completed 1 multi-day event.`);
    } else {
      sentences.push(`Has completed ${multiDayRaces.length} multi-day events.`);
    }
  }

  // Special conditions (excluding multi_day)
  const allSpecialConditions = races
    .flatMap((r) => (r.race_conditions?.specialConditions || []) as string[])
    .filter((c) => c !== "multi_day");
  const uniqueSpecialConditions = [...new Set(allSpecialConditions)];

  const conditionSentences: string[] = [];

  if (uniqueSpecialConditions.includes("sand")) {
    conditionSentences.push("Has prior sand racing experience.");
  }
  if (uniqueSpecialConditions.includes("navigation")) {
    conditionSentences.push("Has navigated in competition.");
  }
  if (uniqueSpecialConditions.includes("self_sufficiency")) {
    conditionSentences.push("Has experience of self-sufficient racing.");
  }
  if (uniqueSpecialConditions.includes("technical_terrain")) {
    conditionSentences.push("Has raced on technical terrain.");
  }

  if (conditionSentences.length > 0) {
    sentences.push(conditionSentences.join(" "));
  }

  // Altitude experience
  const hasHighAltitude = races.some((r) => r.race_conditions?.altitude === "high");
  const hasExtremeAltitude = races.some((r) => r.race_conditions?.altitude === "extreme");

  if (hasExtremeAltitude) {
    sentences.push("Has raced at extreme altitude.");
  } else if (hasHighAltitude) {
    sentences.push("Has raced at high altitude.");
  }

  return sentences.join(" ");
}

/**
 * Identifies experience gaps: what the goal race requires that the athlete hasn't done
 */
export function buildExperienceGaps(races: CompletedRace[], goalEvent: GoalEvent | null): string[] {
  if (!races || races.length === 0 || !goalEvent) {
    return [];
  }

  // Derive what the goal event requires from its attributes
  const requires = new Set<string>();

  // Terrain-based requirements
  const terrainLower = (goalEvent.terrain_type || "").toLowerCase();
  if (terrainLower.includes("sand") || terrainLower.includes("desert")) {
    requires.add("sand");
  }
  if (
    terrainLower.includes("mountain") ||
    terrainLower.includes("trail") ||
    (goalEvent.event_type || "").toLowerCase().includes("sky")
  ) {
    requires.add("technical_terrain");
  }

  // Climate-based requirements
  const climateLower = (goalEvent.climate_type || "").toLowerCase();
  if (climateLower.includes("hot") || climateLower.includes("desert")) {
    requires.add("hot");
  }
  if (climateLower.includes("alpine") || climateLower.includes("arctic") || climateLower.includes("cold")) {
    requires.add("cold");
  }

  // Event type-based requirements
  const eventLower = (goalEvent.event_type || "").toLowerCase();
  const nameLower = (goalEvent.name || "").toLowerCase();

  if (
    eventLower.includes("desert") ||
    nameLower.includes("stage") ||
    nameLower.includes("crossing") ||
    nameLower.includes("sables") ||
    nameLower.includes("arc")
  ) {
    requires.add("multi_day");
    requires.add("self_sufficiency");
  }

  // From race_conditions if set
  if (goalEvent.race_conditions?.specialConditions) {
    for (const cond of goalEvent.race_conditions.specialConditions) {
      if (cond === "altitude" || cond === "high_altitude") {
        requires.add("altitude");
      } else if (cond === "sand") {
        requires.add("sand");
      } else if (cond === "multi_day") {
        requires.add("multi_day");
      } else if (cond === "self_sufficiency") {
        requires.add("self_sufficiency");
      } else if (cond === "navigation") {
        requires.add("navigation");
      } else if (cond === "technical_terrain") {
        requires.add("technical_terrain");
      }
    }
  }

  if (goalEvent.race_conditions?.altitude === "high" || goalEvent.race_conditions?.altitude === "extreme") {
    requires.add("altitude");
  }

  // Check what athlete has
  const athleteHas = new Set<string>();

  for (const race of races) {
    if (race.race_conditions?.specialConditions) {
      for (const cond of race.race_conditions.specialConditions) {
        athleteHas.add(cond);
      }
    }

    if (race.race_conditions?.altitude === "high" || race.race_conditions?.altitude === "extreme") {
      athleteHas.add("altitude");
    }

    if ((race.climate_type || "").toLowerCase().includes("hot")) {
      athleteHas.add("hot");
    }
    if ((race.climate_type || "").toLowerCase().includes("cold")) {
      athleteHas.add("cold");
    }
  }

  // Generate gap statements
  const gaps: string[] = [];

  if (requires.has("sand") && !athleteHas.has("sand")) {
    gaps.push(`No sand racing experience — ${goalEvent.name} involves sand.`);
  }
  if (requires.has("technical_terrain") && !athleteHas.has("technical_terrain")) {
    gaps.push(`No technical terrain experience — ${goalEvent.name} requires it.`);
  }
  if (requires.has("multi_day") && !athleteHas.has("multi_day")) {
    gaps.push(`No multi-day race experience — ${goalEvent.name} is a multi-stage event.`);
  }
  if (requires.has("self_sufficiency") && !athleteHas.has("self_sufficiency")) {
    gaps.push(`No self-sufficient racing experience — ${goalEvent.name} requires self-sufficiency.`);
  }
  if (requires.has("navigation") && !athleteHas.has("navigation")) {
    gaps.push(`No competitive navigation experience — ${goalEvent.name} requires navigation.`);
  }
  if (requires.has("hot") && !athleteHas.has("hot")) {
    gaps.push(`No hot-weather racing experience — ${goalEvent.name} is in a hot climate.`);
  }
  if (requires.has("cold") && !athleteHas.has("cold")) {
    gaps.push(`No cold-weather racing experience — ${goalEvent.name} is in a cold climate.`);
  }
  if (requires.has("altitude") && !athleteHas.has("altitude")) {
    gaps.push(`No high-altitude racing experience — ${goalEvent.name} involves altitude.`);
  }

  return gaps;
}

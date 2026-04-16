// =========================================================
// Explanation Generator
// Produces human-readable explanations for each recommendation.
// Template-based but designed to feel specific and personal.
// =========================================================

import type { DerivedProfile, FunnelRace, RaceExplanation, RaceScore } from './types';

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function formatCost(race: FunnelRace): string {
  if (!race.estimated_total_cost_gbp) return 'costs vary';
  return `~£${race.estimated_total_cost_gbp.toLocaleString()} all-in`;
}

function raceDistanceLabel(race: FunnelRace): string {
  if (!race.total_distance_km) return 'a multi-day event';
  if (race.is_stage_race && race.stage_count) {
    return `${race.total_distance_km}km across ${race.stage_count} stages`;
  }
  return `${race.total_distance_km}km`;
}

// ---------------------------------------------------------
// Why this race fits the athlete
// ---------------------------------------------------------
function buildWhyFits(race: FunnelRace, profile: DerivedProfile): string[] {
  const reasons: string[] = [];

  // Desert relevance
  if (race.is_desert_race) {
    reasons.push(
      `It\'s a genuine desert race — you\'ll experience sand, heat, and the specific demands that define MDS.`
    );
  }

  // Stage race relevance
  if (race.is_stage_race && race.stage_count) {
    if (profile.has_multi_stage) {
      reasons.push(
        `You already have multi-stage experience. ${race.name} will build on that in a more demanding environment.`
      );
    } else {
      reasons.push(
        `Completing ${race.stage_count} consecutive race days will give you your first real taste of stage-racing and multi-day fatigue — one of the most important skills for MDS.`
      );
    }
  }

  // Pack carrying
  if (race.pack_requirement_level >= 4) {
    if (profile.has_pack_experience) {
      reasons.push(
        `The self-supported format matches your pack-carry background and will sharpen your kit management and nutrition strategy.`
      );
    } else {
      reasons.push(
        `Carrying your own kit across multiple days will prepare you directly for the demands of MDS — this experience is hard to replicate in training alone.`
      );
    }
  }

  // Heat relevance
  if (race.heat_level >= 4) {
    if (profile.heat_readiness_level >= 3) {
      reasons.push(
        `You have some heat experience already. Racing in genuine desert heat at ${race.name} will test and deepen that adaptation.`
      );
    } else {
      reasons.push(
        `Racing in serious heat for the first time in a supported race environment is a controlled way to develop the heat tolerance that MDS demands.`
      );
    }
  }

  // Endurance match
  if (race.total_distance_km) {
    if (profile.endurance_level >= 3) {
      reasons.push(
        `At ${raceDistanceLabel(race)}, this race is well-matched to your endurance background — challenging enough to count as real progress without being reckless.`
      );
    } else {
      reasons.push(
        `At ${raceDistanceLabel(race)}, it represents a meaningful step up from your current background — enough to stretch you without overwhelming you.`
      );
    }
  }

  // MDS connection
  if (race.suitable_as_final_step_before_mds_level >= 4) {
    reasons.push(
      `This race is specifically rated as one of the strongest preparation races available for MDS, covering most of the skills you\'ll need on race day.`
    );
  } else if (race.suitable_after_marathon_level >= 4) {
    reasons.push(
      `It\'s an accessible next step from marathon-distance running — achievable with your current background and meaningful for your progression.`
    );
  }

  return reasons.slice(0, 4); // Cap at 4 points
}

// ---------------------------------------------------------
// Why it\'s realistic for this person\'s life and situation
// ---------------------------------------------------------
function buildWhyRealistic(race: FunnelRace, profile: DerivedProfile): string[] {
  const reasons: string[] = [];

  // Budget
  if (
    race.estimated_total_cost_gbp &&
    race.estimated_total_cost_gbp <= profile.budget_gbp_estimate * 1.1
  ) {
    reasons.push(
      `It fits your budget — ${formatCost(race)} is within reach for most people in your situation.`
    );
  }

  // Travel
  if (race.travel_difficulty_level <= 2) {
    reasons.push(
      `${race.country} is relatively straightforward to get to — short flights, familiar infrastructure, and well-run race logistics.`
    );
  } else if (race.travel_difficulty_level <= 3) {
    reasons.push(
      `Travel to ${race.country} is manageable — a direct or short-connection flight and a well-organised event.`
    );
  }

  // Life constraints
  if (profile.life_constraint_level <= 2 && race.is_single_stage) {
    reasons.push(
      `As a single-stage race, it keeps your time away from work and family to a minimum — typically 4–6 days total.`
    );
  } else if (profile.life_constraint_level <= 3 && race.is_stage_race) {
    reasons.push(
      `The race requires around 10–14 days away from home. Planning ahead for this is manageable with some notice.`
    );
  }

  // Low logistics complexity
  if (race.logistics_complexity_level <= 2) {
    reasons.push(
      `${race.name} has a straightforward logistics structure — no complex kit lists or remote access points, just a well-supported race.`
    );
  }

  // Training requirement
  if (profile.can_train_4_plus_days) {
    reasons.push(
      `With your current training availability, you have enough time to build a proper preparation block before this race.`
    );
  }

  return reasons.slice(0, 3);
}

// ---------------------------------------------------------
// What skills this develops for MDS
// ---------------------------------------------------------
function buildWhatItDevelops(race: FunnelRace, profile: DerivedProfile): string[] {
  const develops: string[] = [];

  if (race.is_desert_race) {
    develops.push('Desert navigation, sand running technique, and mental adaptation to extreme heat');
  }
  if (race.is_stage_race) {
    develops.push('Multi-day fatigue management and racing-day-to-day recovery strategies');
  }
  if (race.self_sufficiency_level >= 4) {
    develops.push('Self-sufficiency skills — kit selection, food planning, blister management in a real race environment');
  }
  if (race.heat_level >= 4) {
    develops.push('Heat tolerance and practical hydration/nutrition strategies for desert conditions');
  }
  if (race.pack_requirement_level >= 4) {
    develops.push('Racing with a loaded pack — how to pace with weight, prevent chafing, and manage kit across multiple days');
  }
  if (race.total_distance_km && race.total_distance_km >= 150) {
    develops.push('Ultra-endurance capacity and the ability to keep moving on depleted energy reserves');
  }
  if (race.terrain_tags.includes('technical') || race.technicality_level >= 4) {
    develops.push('Technical terrain confidence — the ability to move efficiently on difficult ground');
  }
  if (!race.is_desert_race && race.is_stage_race) {
    develops.push('Stage-racing skills that transfer directly to MDS — routine, mental resilience, and foot care over multiple days');
  }

  return develops.slice(0, 4);
}

// ---------------------------------------------------------
// Gaps still to address before MDS (from primary recommendation)
// ---------------------------------------------------------
function buildGapsToAddress(race: FunnelRace, profile: DerivedProfile): string[] {
  const gaps: string[] = [];

  // If they\'re doing a non-desert race, heat is still a gap
  if (!race.is_desert_race || race.heat_level < 5) {
    if (profile.heat_readiness_level <= 3) {
      gaps.push(
        'Heat training will still be needed — even after this race, structured sauna sessions and hot-condition running are important MDS preparation.'
      );
    }
  }

  // If they\'re doing a single stage, multi-stage readiness is still a gap
  if (race.is_single_stage && !profile.has_multi_stage) {
    gaps.push(
      'Multi-stage experience — a single-stage race develops endurance but doesn\'t replicate racing on tired legs day after day. A multi-stage feeder race should follow this.'
    );
  }

  // Pack carrying if not in this race
  if (race.pack_requirement_level <= 2 && !profile.has_pack_experience) {
    gaps.push(
      'Pack training — MDS requires carrying 8–14kg. Incorporate regular pack-carry runs into your training before you line up for MDS.'
    );
  }

  // Endurance gap
  if (profile.endurance_level <= 2) {
    gaps.push(
      'Building your ultra base — completing this race is a great start, but you\'ll want to add longer races and more training volume before MDS.'
    );
  }

  return gaps.slice(0, 3);
}

// ---------------------------------------------------------
// Short alternative summary
// ---------------------------------------------------------
function buildAlternativeSummary(race: FunnelRace, profile: DerivedProfile): string {
  const parts: string[] = [];

  if (race.is_desert_race) parts.push('desert terrain and heat exposure');
  if (race.is_stage_race) parts.push('multi-stage format');
  if (race.self_sufficiency_level >= 4) parts.push('self-supported pack carry');
  if (race.heat_level <= 2) parts.push('minimal heat — good for building endurance without the climate challenge');
  if (race.is_single_stage) parts.push('single-stage format — less time away');

  const emphasis = parts.length > 0 ? parts.slice(0, 2).join(' and ') : 'different trade-offs';

  if (race.estimated_total_cost_gbp) {
    return `A strong alternative if ${emphasis} appeals to you. ${formatCost(race)}.`;
  }
  return `A strong alternative if ${emphasis} appeals to you.`;
}

// ---------------------------------------------------------
// Main export: generateExplanations
// Mutates the explanation field in-place for each score
// ---------------------------------------------------------
export function generateExplanations(
  scores: RaceScore[],
  profile: DerivedProfile
): void {
  for (const score of scores) {
    if (score.is_hard_filtered) continue;

    score.explanation = {
      why_fits: buildWhyFits(score.race, profile),
      why_realistic: buildWhyRealistic(score.race, profile),
      what_it_develops: buildWhatItDevelops(score.race, profile),
      gaps_to_address: buildGapsToAddress(score.race, profile),
    };
  }
}

export { buildAlternativeSummary };

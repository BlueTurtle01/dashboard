// =========================================================
// Recommendation Selector
// Picks primary, alternatives, lower-risk, and stretch races
// from a scored list. Selection is not just "top 4 scores" —
// each slot has a specific intended meaning.
// =========================================================

import type { AssessmentResult, DerivedProfile, RaceScore, ResultSummary } from './types';

// ---------------------------------------------------------
// Primary recommendation
// Best overall realistic match: highest total score
// among non-hard-filtered races that suit their risk appetite
// ---------------------------------------------------------
function selectPrimary(scores: RaceScore[], profile: DerivedProfile): RaceScore | null {
  const eligible = scores.filter((s) => !s.is_hard_filtered);
  if (eligible.length === 0) return null;

  // For low-risk seekers, prioritise accessible races
  if (profile.risk_appetite_level === 1) {
    const safeOptions = eligible.filter(
      (s) => s.race.min_background_level <= profile.endurance_level
    );
    if (safeOptions.length > 0) return safeOptions[0];
  }

  return eligible[0];
}

// ---------------------------------------------------------
// Alternatives (up to 2)
// Strong nearby matches with different trade-offs from primary
// ---------------------------------------------------------
function selectAlternatives(
  scores: RaceScore[],
  primary: RaceScore,
  profile: DerivedProfile
): RaceScore[] {
  const eligible = scores.filter(
    (s) => !s.is_hard_filtered && s.race.id !== primary.race.id
  );

  // Aim for variety: pick one that differs meaningfully from primary
  const alternatives: RaceScore[] = [];

  for (const candidate of eligible) {
    if (alternatives.length >= 2) break;

    // Avoid picking very similar races (same slug family)
    const tooSimilar = alternatives.some(
      (a) =>
        a.race.country === candidate.race.country &&
        a.race.is_stage_race === candidate.race.is_stage_race
    );
    if (tooSimilar && alternatives.length >= 1) continue;

    // Also avoid picking same as primary in country + stage format
    if (
      candidate.race.country === primary.race.country &&
      candidate.race.is_stage_race === primary.race.is_stage_race &&
      alternatives.length === 0
    ) {
      continue;
    }

    alternatives.push(candidate);
  }

  // If we couldn't find diverse picks, fall back to top 2
  if (alternatives.length === 0 && eligible.length > 0) {
    return eligible.slice(0, 2);
  }

  return alternatives;
}

// ---------------------------------------------------------
// Lower-risk option
// A safer, more achievable step — below primary in challenge level
// Must be different from primary and alternatives
// ---------------------------------------------------------
function selectLowerRisk(
  scores: RaceScore[],
  primary: RaceScore,
  alternatives: RaceScore[],
  profile: DerivedProfile
): RaceScore | null {
  const excludeIds = new Set([
    primary.race.id,
    ...alternatives.map((a) => a.race.id),
  ]);

  const candidates = scores.filter(
    (s) =>
      !s.is_hard_filtered &&
      !excludeIds.has(s.race.id) &&
      // Lower minimum background than primary
      s.race.min_background_level <= primary.race.min_background_level &&
      // Not more heat, stage complexity, or self-sufficiency than primary
      s.race.heat_level <= primary.race.heat_level + 1 &&
      s.race.self_sufficiency_level <= primary.race.self_sufficiency_level
  );

  if (candidates.length === 0) return null;

  // Prefer single-stage options as the "lower risk" entry
  const singleStage = candidates.filter((s) => s.race.is_single_stage);
  if (singleStage.length > 0) return singleStage[0];

  return candidates[0];
}

// ---------------------------------------------------------
// Stretch option
// More ambitious — higher challenge level than primary
// Only suggested if user is not explicitly seeking "safest"
// ---------------------------------------------------------
function selectStretch(
  scores: RaceScore[],
  primary: RaceScore,
  alternatives: RaceScore[],
  profile: DerivedProfile
): RaceScore | null {
  if (profile.risk_appetite_level === 1) return null; // Not for "safest" seekers

  const excludeIds = new Set([
    primary.race.id,
    ...alternatives.map((a) => a.race.id),
  ]);

  const candidates = scores.filter(
    (s) =>
      !s.is_hard_filtered &&
      !excludeIds.has(s.race.id) &&
      // More demanding than primary
      (s.race.min_background_level > primary.race.min_background_level ||
        s.race.heat_level > primary.race.heat_level ||
        s.race.self_sufficiency_level > primary.race.self_sufficiency_level)
  );

  if (candidates.length === 0) return null;

  // Sort by total score descending — best stretch option
  return candidates.sort((a, b) => b.total_score - a.total_score)[0];
}

// ---------------------------------------------------------
// Main development gaps for MDS
// ---------------------------------------------------------
function deriveMainGaps(profile: DerivedProfile): string[] {
  const gaps: string[] = [];

  if (profile.heat_readiness_level <= 2) {
    gaps.push(
      'Heat adaptation — MDS takes place in 40–55°C. Structured heat training is essential before you arrive.'
    );
  }

  if (!profile.has_pack_experience) {
    gaps.push(
      'Pack carrying — MDS requires carrying all your food, sleeping kit, and gear (typically 8–14kg). Training and racing with a loaded pack is a non-negotiable preparation step.'
    );
  }

  if (!profile.has_multi_stage && profile.stage_race_readiness_level <= 2) {
    gaps.push(
      'Multi-day fatigue management — running on tired legs across consecutive days is a specific skill that needs to be developed before MDS.'
    );
  }

  if (profile.endurance_level <= 2) {
    gaps.push(
      'Ultra-endurance base — MDS involves covering ~250km over 6 days. A robust ultra-endurance foundation (regular 50k+ efforts) is needed before you\'re ready to race at that level.'
    );
  }

  if (profile.terrain_readiness_level <= 2) {
    gaps.push(
      'Off-road terrain confidence — MDS crosses sand, gravel, rock, and dune. Regular trail and technical running will make the terrain much more manageable.'
    );
  }

  if (!profile.can_train_4_plus_days) {
    gaps.push(
      'Training volume — preparing for MDS typically requires 4–6 days of training per week. If you\'re currently at fewer days, building that consistency will be important.'
    );
  }

  return gaps;
}

// ---------------------------------------------------------
// Result summary
// ---------------------------------------------------------
function buildResultSummary(
  profile: DerivedProfile,
  primary: RaceScore
): ResultSummary {
  const timelineLabels: Record<string, string> = {
    within_12m: 'within 12 months',
    '12_24m': 'in the next 1–2 years',
    '2_plus_years': 'within 2–3 years',
    exploring: 'at some point in the future',
  };

  const enduranceSummary =
    profile.endurance_level <= 2
      ? 'You\'re in the early stages of your ultra journey — there\'s a clear and exciting path ahead.'
      : profile.endurance_level === 3
      ? 'You have a solid marathon or ultra base to build on.'
      : 'Your endurance background is strong — you\'re at the right level to take on serious feeder races.';

  const timelineSummary = profile.is_targeting_mds
    ? `You\'re working toward MDS ${timelineLabels[profile.mds_goal_timeline] ?? 'in the future'}.`
    : 'You\'re exploring the world of desert stage racing.';

  const strengthMap: Record<number, string> = {
    5: 'strong endurance base',
    4: 'good ultra-running foundation',
    3: 'solid marathon or ultra experience',
    2: 'determination and a clear starting point',
    1: 'ambition and the right mindset to start building',
  };

  return {
    endurance_summary: enduranceSummary,
    timeline_summary: timelineSummary,
    biggest_strength: strengthMap[profile.endurance_level] ?? 'a clear starting point',
    biggest_gap:
      profile.heat_readiness_level <= 2
        ? 'heat preparation'
        : !profile.has_pack_experience
        ? 'pack-carrying experience'
        : !profile.has_multi_stage
        ? 'multi-stage race experience'
        : 'building consistent training volume',
    personalised_intro: `Based on your background and goals, your best next step before MDS is ${primary.race.name}. Here\'s why it fits your situation right now.`,
  };
}

// ---------------------------------------------------------
// Main export: selectRecommendations
// ---------------------------------------------------------
export function selectRecommendations(
  scores: RaceScore[],
  profile: DerivedProfile
): AssessmentResult {
  const primary = selectPrimary(scores, profile);

  if (!primary) {
    // Fallback: no eligible race found — return the highest scored anyway
    const fallback = scores.find((s) => s.race.slug !== 'marathon-des-sables');
    if (!fallback) throw new Error('No races available for scoring.');

    return {
      primary_race: fallback,
      alternatives: [],
      lower_risk_race: null,
      stretch_race: null,
      all_scores: scores,
      main_gaps: deriveMainGaps(profile),
      summary: buildResultSummary(profile, fallback),
    };
  }

  const alternatives = selectAlternatives(scores, primary, profile);
  const lower_risk_race = selectLowerRisk(scores, primary, alternatives, profile);
  const stretch_race = selectStretch(scores, primary, alternatives, profile);

  return {
    primary_race: primary,
    alternatives,
    lower_risk_race,
    stretch_race,
    all_scores: scores,
    main_gaps: deriveMainGaps(profile),
    summary: buildResultSummary(profile, primary),
  };
}

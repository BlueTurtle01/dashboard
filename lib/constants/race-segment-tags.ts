/**
 * Canonical training focus tags for race elevation segments.
 * These are the authoritative tags used across the system.
 * All variations should be normalized to these tags.
 */
export const SEGMENT_TRAINING_FOCUS_TAGS = [
  "hill-climbing",
  "descent-control",
  "heat-tolerance",
  "pack-carrying",
  "sand-running",
  "technical-terrain",
  "multi-stage-fatigue",
  "self-sufficiency",
  "mental-resilience",
  "altitude",
  "navigation",
  "strength-endurance",
  "flat-speed",
  "consistent-pacing",
] as const;

/**
 * Maps tag variations/aliases to canonical tags.
 * Used to normalize tags from different sources (Pace Strategy, manually tagged segments).
 */
export const TAG_ALIASES: Record<string, typeof SEGMENT_TRAINING_FOCUS_TAGS[number]> = {
  // Climbing variations
  "climbing": "hill-climbing",
  "climb": "hill-climbing",
  "uphill": "hill-climbing",
  "hill": "hill-climbing",

  // Descent variations
  "descent": "descent-control",
  "downhill": "descent-control",
  "down": "descent-control",

  // Technical variations
  "technical": "technical-terrain",
  "terrain": "technical-terrain",
  "rocky": "technical-terrain",
  "uneven": "technical-terrain",

  // Flat/pacing variations
  "flat": "flat-speed",
  "speed": "flat-speed",
  "pace": "consistent-pacing",
  "pacing": "consistent-pacing",

  // Self-sufficiency variations
  "self-sufficient": "self-sufficiency",
  "unsupported": "self-sufficiency",

  // Navigation variations
  "navigate": "navigation",
  "route-finding": "navigation",
  "orienteering": "navigation",
};

/**
 * Normalizes a tag to its canonical form.
 * Handles aliases and case variations.
 */
export function normalizeTag(
  tag: string
): typeof SEGMENT_TRAINING_FOCUS_TAGS[number] | null {
  const normalized = tag.toLowerCase().trim();

  // Check if it's already canonical
  if (SEGMENT_TRAINING_FOCUS_TAGS.includes(normalized as any)) {
    return normalized as typeof SEGMENT_TRAINING_FOCUS_TAGS[number];
  }

  // Check aliases
  return TAG_ALIASES[normalized] || null;
}

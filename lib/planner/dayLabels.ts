export const CANONICAL_DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type CanonicalDay = (typeof CANONICAL_DAY_ORDER)[number];

export const CANONICAL_DAY_TO_DISPLAY: Record<CanonicalDay, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export const DAY_ALIASES: Record<string, CanonicalDay> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  weds: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

export function normalizeDayLabel(dayLabel: string): CanonicalDay | string {
  return DAY_ALIASES[dayLabel.trim().toLowerCase()] ?? dayLabel.trim().toLowerCase();
}

export function getDayOrderIndex(dayLabel: string): number {
  const normalized = normalizeDayLabel(dayLabel);
  return CANONICAL_DAY_ORDER.indexOf(normalized as CanonicalDay);
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Per-race split configuration.
 *
 * Add a new entry here whenever results data with split times is added for a race.
 * The `key` must match the exact key used in race_results.additional_data.
 * The `timeFormat` handles cases where splits use MM:SS encoding rather than HH:MM:SS
 * (e.g. Marathon Eryri's pen_y split is stored as "26:54:00" meaning 26 min 54 sec).
 */

export type SplitRole = "early" | "halfway" | "late";
export type TimeFormat = "HH:MM:SS" | "MM:SS";

export interface SplitInfo {
  key: string;             // key in additional_data, e.g. "13_miles"
  label: string;           // human-readable checkpoint name, e.g. "Pen y Pass"
  distance_km?: number;    // approximate distance from start
  role: SplitRole;         // early = first major point, halfway = ~50%, late = ~75%+
  timeFormat?: TimeFormat; // defaults to HH:MM:SS; use MM:SS for sub-hour splits stored without hours
}

export interface RaceSplitConfig {
  splits: SplitInfo[];
}

export const RACE_SPLIT_CONFIGS: Record<string, RaceSplitConfig> = {

  // Marathon Eryri (Snowdonia Marathon)
  "3ce63ca2-6224-432a-b51f-2fa2ae76d565": {
    splits: [
      { key: "pen_y",    label: "Pen y Pass",  distance_km: 7.2,  role: "early",   timeFormat: "MM:SS" },
      { key: "13_miles", label: "13 miles",    distance_km: 20.9, role: "halfway" },
      { key: "23_miles", label: "23 miles",    distance_km: 37.0, role: "late" },
    ],
  },

  // Loch Ness Marathon
  "0083d093-a011-46ad-814c-ad8906ed04e0": {
    splits: [
      { key: "Half Time", label: "Halfway",   distance_km: 21.1, role: "halfway" },
    ],
  },

};

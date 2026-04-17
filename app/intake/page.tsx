"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { createHolidayNotification, createBlockedDateNotification } from "@/lib/actions/createNotification";
import {
  saveAthleteProfile,
  loadAthleteProfile,
  type AthleteProfile as StoredAthleteProfile,
} from "@/lib/data/athleteProfileStore";
import { buildRaceHistorySummary, buildExperienceGaps } from "@/lib/planner/raceHistorySummary";

const supabase = createClient();

type EventOption = {
  id: string;
  name: string;
  event_type: string;
  event_date: string | null;
  terrain_type: string | null;
  climate_type: string | null;
  location: string | null;
  race_conditions: import("@/lib/planner/types").RaceConditions | null;
};

type LookupOption = {
  id: string;
  name: string;
  slug: string;
};


type PrepRaceOption = {
  id: string;
  name: string;
  event_date: string | null;
  distance_km: number | null;
  event_type: string | null;
  location: string | null;
  terrain_type: string | null;
  climate_type: string | null;
  elevation_gain_m: number | null;
  race_conditions: any | null;
};

type RaceHistoryEntry = {
  id?: string;
  preparation_race_id: string;
  finish_time: string;
  finish_time_days?: number;
  finish_time_hours?: number;
  finish_time_minutes?: number;
  finish_time_seconds?: number;
  notes: string;
  race?: {
    name: string;
    event_date: string | null;
    distance_km: number | null;
    event_type: string | null;
    location: string | null;
    terrain_type: string | null;
    climate_type: string | null;
    elevation_gain_m: number | null;
    race_conditions: any | null;
  };
};

type AthleteProfile = StoredAthleteProfile & {
  selectedPreparationRaceIds?: string[];
  hasAccessToHills?: boolean | "";
};

const raceGoalOptions = [
  { value: "finish", label: "Finish" },
  { value: "finish_strong", label: "Finish Strong" },
  { value: "complete_comfortably", label: "Complete Comfortably" },
  { value: "experience", label: "Experience The Event" },
  { value: "pb", label: "Personal Best" },
  { value: "place_highly", label: "Place Highly" },
  { value: "win_age_category", label: "Win Age Category" },
  { value: "win_overall", label: "Win Overall" },
] as const;

const baselineFitnessOptions = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "beginner", label: "Beginner" },
  { value: "novice", label: "Novice" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

const sessionPreferenceOptions = [
  { value: "easy_run", label: "Easy Run" },
  { value: "long_run", label: "Long Run" },
  { value: "intervals", label: "Intervals" },
  { value: "tempo", label: "Tempo" },
  { value: "hill_reps", label: "Hill Reps" },
  { value: "hiking", label: "Hiking" },
  { value: "gym", label: "Gym" },
  { value: "mobility", label: "Mobility" },
  { value: "back_to_back", label: "Back To Back" },
] as const;

const repetitionToleranceOptions = [
  { value: "repetition", label: "Prefer Repetition" },
  { value: "balanced", label: "Balanced" },
  { value: "variety", label: "Prefer Variety" },
] as const;

const pacingStyleOptions = [
  { value: "unknown", label: "Not Sure" },
  { value: "run_walk", label: "Run / Walk Strategy" },
  { value: "steady", label: "Steady Continuous" },
  { value: "aggressive", label: "Aggressive / Race Pace" },
] as const;

const DAYS_OF_WEEK = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
] as const;

const ATHLETE_AVAILABLE_TAGS = [
  // Injury History
  { value: "knee_pain", label: "Knee pain", category: "Injury History" },
  { value: "back_pain", label: "Back pain", category: "Injury History" },
  { value: "ankle_issues", label: "Ankle issues", category: "Injury History" },
  { value: "it_band_syndrome", label: "IT band syndrome", category: "Injury History" },
  { value: "plantar_fasciitis", label: "Plantar fasciitis", category: "Injury History" },
  { value: "shin_splints", label: "Shin splints", category: "Injury History" },
  { value: "stress_fracture", label: "Stress fracture history", category: "Injury History" },
  { value: "tendinitis", label: "Tendinitis", category: "Injury History" },

  // Medical Conditions
  { value: "asthma", label: "Asthma", category: "Medical Conditions" },
  { value: "diabetes", label: "Diabetes", category: "Medical Conditions" },
  { value: "heart_condition", label: "Heart condition", category: "Medical Conditions" },
  { value: "hypertension", label: "Hypertension", category: "Medical Conditions" },
  { value: "thyroid_condition", label: "Thyroid condition", category: "Medical Conditions" },

  // Experience & Background
  { value: "ultramarathoner", label: "Ultramarathoner", category: "Experience" },
  { value: "trail_runner", label: "Trail runner", category: "Experience" },
  { value: "road_runner", label: "Road runner", category: "Experience" },
  { value: "desert_racing", label: "Desert racing", category: "Experience" },
  { value: "high_altitude", label: "High altitude experience", category: "Experience" },
  { value: "multi_day_racing", label: "Multi-day racing", category: "Experience" },

  // Psychology & Mindset
  { value: "anxiety_management", label: "Anxiety management experience", category: "Psychology" },
  { value: "fear_of_water", label: "Fear of water", category: "Psychology" },
  { value: "perfectionist", label: "Perfectionist tendencies", category: "Psychology" },
  { value: "mental_toughness", label: "Building mental toughness", category: "Psychology" },

  // Special Circumstances
  { value: "first_time_racer", label: "First-time racer", category: "Specialties" },
  { value: "comeback_from_injury", label: "Comeback from injury", category: "Specialties" },
  { value: "female_athlete", label: "Female athlete", category: "Specialties" },
  { value: "masters_athlete", label: "Masters athlete", category: "Specialties" },
  { value: "athlete_with_family", label: "Busy/parent athlete", category: "Specialties" },
];

const defaultProfile: AthleteProfile = {
  tempUserKey: "test-user-1",
  equipmentUnavailable: [],
  equipmentAvoid: [],
  blockedDates: [],
  eventType: "",
  selectedEventId: "",
  raceGoal: "finish",
  baselineFitness: "beginner",
  currentTrainingDaysPerWeek: 0,
  availableTrainingDaysPerWeek: 0,
  weeklyTrainingHours: 0,
  longestRecentSessionMinutes: 0,
  trainingConsistencyWeeks: 0,
  recentBreakWeeks: 0,
  backToBackSessionsCompleted: false,
  maxBackToBackDays: 0,
  loadCarriageExperience: false,
  hasAccessToHills: "",
  sessionsEnjoy: [],
  sessionsAvoid: [],
  trainingStylePreference: "balanced",
  pacingStyle: "unknown",
  selectedPreparationRaceIds: [],
  availableGymDays: [],
  availableRunDays: [],
  preferredLongSessionDay: "",
  selectedTags: [],
  eventProfile: {
    heatAccess: "none",
    saunaAccess: false,
    packTraining: false,
    backToBack: "none",
    sandAccess: false,
  },
};



function parseNumberInput(value: string, allowDecimal = false) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parsed = allowDecimal ? Number(trimmed) : parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSessionPreferenceLabel(value: string) {
  return sessionPreferenceOptions.find((option) => option.value === value)?.label ?? value;
}

function parseFinishTime(timeStr: string): { days: number; hours: number; minutes: number; seconds: number } {
  const defaults = { days: 0, hours: 0, minutes: 0, seconds: 0 };

  if (!timeStr) return defaults;

  // Try to parse format like "2d 14h 32m 15s"
  const dayMatch = timeStr.match(/(\d+)\s*d/);
  const hourMatch = timeStr.match(/(\d+)\s*h/);
  const minMatch = timeStr.match(/(\d+)\s*m/);
  const secMatch = timeStr.match(/(\d+)\s*s/);

  return {
    days: dayMatch ? parseInt(dayMatch[1], 10) : 0,
    hours: hourMatch ? parseInt(hourMatch[1], 10) : 0,
    minutes: minMatch ? parseInt(minMatch[1], 10) : 0,
    seconds: secMatch ? parseInt(secMatch[1], 10) : 0,
  };
}

function formatFinishTime(days: number, hours: number, minutes: number, seconds: number): string {
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

export default function IntakePage() {
  const [profile, setProfile] = useState<AthleteProfile>(defaultProfile);
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"event" | "training" | "preferences" | "constraints" | "schedule" | "races" | "history">("event");

  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [preparationRaceOptions, setPreparationRaceOptions] = useState<PrepRaceOption[]>([]);
  const [prepRaceSearchQuery, setPrepRaceSearchQuery] = useState("");
  const [prepRaceSearchResults, setPrepRaceSearchResults] = useState<PrepRaceOption[]>([]);
  const [holidayEvents, setHolidayEvents] = useState<Array<{ id?: string; start_date: string; end_date: string }>>([]);
  const [originalHolidayEvents, setOriginalHolidayEvents] = useState<Array<{ id?: string; start_date: string; end_date: string }>>([]);
  const [raceHistory, setRaceHistory] = useState<RaceHistoryEntry[]>([]);
  const [raceHistorySearchQuery, setRaceHistorySearchQuery] = useState("");
  const [raceHistorySearchResults, setRaceHistorySearchResults] = useState<PrepRaceOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      setIsLoading(true);

      try {
        const supabaseAuth = await supabase.auth.getUser();
        const currentUserId = supabaseAuth.data?.user?.id;

        const [
          existingProfile,
          equipmentResponse,
          eventsResponse,
          preparationRacesResponse,
          holidayEventsResponse,
          raceHistoryResponse,
        ] = await Promise.all([
          loadAthleteProfile(),
          supabase
            .from("equipment_options")
            .select("slug")
            .eq("is_active", true)
            .order("sort_order"),
          supabase
            .from("events")
            .select("id, name, event_type, event_date, terrain_type, climate_type, location, race_conditions")
            .eq("is_active", true)
            .order("name"),
          supabase
            .from("preparation_races")
            .select("id, name, event_date, distance_km, event_type, location, terrain_type, climate_type, elevation_gain_m, race_conditions")
            .eq("is_active", true)
            .order("event_date"),
          currentUserId
            ? supabase
                .from("athlete_events")
                .select("id, start_date, end_date")
                .eq("athlete_user_id", currentUserId)
                .eq("event_type", "holiday")
            : Promise.resolve({ data: [] }),
          currentUserId
            ? supabase
                .from("athlete_race_history")
                .select("id, preparation_race_id, finish_time, notes, preparation_races(id, name, event_date, distance_km, event_type, location, terrain_type, climate_type, elevation_gain_m, race_conditions)")
                .eq("athlete_user_id", currentUserId)
                .order("preparation_races(event_date)", { ascending: false })
            : Promise.resolve({ data: [] }),
        ]);

        if (equipmentResponse.error) {
          throw new Error(`Failed to load equipment options: ${equipmentResponse.error.message}`);
        }

        if (eventsResponse.error) {
          throw new Error(`Failed to load events: ${eventsResponse.error.message}`);
        }

        if (preparationRacesResponse.error) {
          throw new Error(`Failed to load preparation races: ${preparationRacesResponse.error.message}`);
        }

        if (cancelled) return;

        const loadedEvents = (eventsResponse.data ?? []) as EventOption[];
        const loadedPrepRaces = (preparationRacesResponse.data ?? []) as PrepRaceOption[];

        setEquipmentOptions(
          (equipmentResponse.data ?? [])
            .map((row: { slug: string | null }) => row.slug)
            .filter((slug): slug is string => Boolean(slug) && slug !== "bodyweight"),
        );

        setEventOptions(loadedEvents);
        setPreparationRaceOptions(loadedPrepRaces);
        const loadedHolidayEvents = (holidayEventsResponse.data ?? []) as any;
        setHolidayEvents(loadedHolidayEvents);
        setOriginalHolidayEvents(loadedHolidayEvents);

        // Transform race history data to include joined race details
        const loadedRaceHistory = ((raceHistoryResponse.data ?? []) as any[]).map((entry: any) => {
          const finishTime = entry.finish_time || "";
          const parsed = parseFinishTime(finishTime);
          return {
            id: entry.id,
            preparation_race_id: entry.preparation_race_id,
            finish_time: finishTime,
            finish_time_days: parsed.days,
            finish_time_hours: parsed.hours,
            finish_time_minutes: parsed.minutes,
            finish_time_seconds: parsed.seconds,
            notes: entry.notes || "",
            race: Array.isArray(entry.preparation_races) ? entry.preparation_races[0] : entry.preparation_races,
          };
        });
        setRaceHistory(loadedRaceHistory);

        if (existingProfile) {
          const selectedEventId =
            existingProfile.selectedEventId ??
            existingProfile.eventType ??
            "";

          const matchedEvent =
            loadedEvents.find((event) => event.id === selectedEventId) ?? null;

          setProfile({
            ...defaultProfile,
            ...existingProfile,
            tempUserKey: existingProfile.tempUserKey ?? defaultProfile.tempUserKey,
            equipmentUnavailable: existingProfile.equipmentUnavailable ?? [],
            equipmentAvoid: existingProfile.equipmentAvoid ?? [],
            blockedDates: existingProfile.blockedDates ?? [],
            selectedEventId,
            raceGoal: existingProfile.raceGoal ?? defaultProfile.raceGoal,
            baselineFitness: existingProfile.baselineFitness ?? defaultProfile.baselineFitness,
            currentTrainingDaysPerWeek:
              existingProfile.currentTrainingDaysPerWeek ?? defaultProfile.currentTrainingDaysPerWeek,
            availableTrainingDaysPerWeek:
              existingProfile.availableTrainingDaysPerWeek ?? defaultProfile.availableTrainingDaysPerWeek,
            weeklyTrainingHours:
              existingProfile.weeklyTrainingHours ?? defaultProfile.weeklyTrainingHours,
            longestRecentSessionMinutes:
              existingProfile.longestRecentSessionMinutes ?? defaultProfile.longestRecentSessionMinutes,
            trainingConsistencyWeeks:
              existingProfile.trainingConsistencyWeeks ?? defaultProfile.trainingConsistencyWeeks,
            recentBreakWeeks:
              existingProfile.recentBreakWeeks ?? defaultProfile.recentBreakWeeks,
            backToBackSessionsCompleted:
              existingProfile.backToBackSessionsCompleted ?? defaultProfile.backToBackSessionsCompleted,
            maxBackToBackDays:
              existingProfile.maxBackToBackDays ?? defaultProfile.maxBackToBackDays,
            loadCarriageExperience:
              existingProfile.loadCarriageExperience ?? defaultProfile.loadCarriageExperience,
            hasAccessToHills:
              existingProfile.hasAccessToHills ?? defaultProfile.hasAccessToHills,
            sessionsEnjoy: existingProfile.sessionsEnjoy ?? defaultProfile.sessionsEnjoy,
            sessionsAvoid: existingProfile.sessionsAvoid ?? defaultProfile.sessionsAvoid,
            trainingStylePreference:
              existingProfile.trainingStylePreference ?? defaultProfile.trainingStylePreference,
            pacingStyle: existingProfile.pacingStyle ?? defaultProfile.pacingStyle,
            availableGymDays: existingProfile.availableGymDays ?? defaultProfile.availableGymDays,
            availableRunDays: existingProfile.availableRunDays ?? defaultProfile.availableRunDays,
            preferredLongSessionDay:
              existingProfile.preferredLongSessionDay ?? defaultProfile.preferredLongSessionDay,
            selectedPreparationRaceIds:
              existingProfile.selectedPreparationRaceIds ?? defaultProfile.selectedPreparationRaceIds,
            eventType: matchedEvent?.event_type ?? existingProfile.eventType ?? "",
            eventProfile: {
              ...defaultProfile.eventProfile,
              ...(existingProfile.eventProfile ?? {}),
            },
          });
        }
      } catch (error) {
        console.error("Failed to load intake page data", error);
        if (!cancelled) {
          setStatusMessage("Failed to load saved intake data.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEvent = useMemo(
    () => eventOptions.find((event) => event.id === profile.selectedEventId) ?? null,
    [eventOptions, profile.selectedEventId],
  );

  const isDesertRace = selectedEvent?.event_type === "Desert Race";

  function handleEventChange(eventId: string) {
    const matchedEvent = eventOptions.find((event) => event.id === eventId) ?? null;

    setProfile((p) => ({
      ...p,
      selectedEventId: eventId,
      eventType: matchedEvent?.event_type ?? "",
    }));
  }

  function updateRaceGoal(value: string) {
    setProfile((p) => ({
      ...p,
      raceGoal: value,
    }));
  }

  function updateBaselineFitness(value: string) {
    setProfile((p) => ({
      ...p,
      baselineFitness: value,
    }));
  }

  function updateTrainingMetric(
    field:
      | "currentTrainingDaysPerWeek"
      | "availableTrainingDaysPerWeek"
      | "weeklyTrainingHours"
      | "longestRecentSessionMinutes"
      | "trainingConsistencyWeeks"
      | "recentBreakWeeks"
      | "maxBackToBackDays",
    value: string,
  ) {
    setProfile((p) => ({
      ...p,
      [field]:
        field === "weeklyTrainingHours"
          ? parseNumberInput(value, true)
          : parseNumberInput(value, false),
    }));
  }

  function updateTrainingPreference(
    field: "trainingStylePreference" | "pacingStyle",
    value: string,
  ) {
    setProfile((p) => ({
      ...p,
      [field]: value,
    }));
  }

  function toggleSessionPreference(key: "sessionsEnjoy" | "sessionsAvoid", value: string) {
    setProfile((p) => ({
      ...p,
      [key]: (p[key] ?? []).includes(value)
        ? (p[key] ?? []).filter((x) => x !== value)
        : [...(p[key] ?? []), value],
    }));
  }

  function toggleListItem(
    key: "equipmentUnavailable" | "equipmentAvoid" | "selectedPreparationRaceIds",
    value: string,
  ) {
    setProfile((p) => {
      const current = (p[key] as string[]) ?? [];
      return {
        ...p,
        [key]: current.includes(value)
          ? current.filter((x) => x !== value)
          : [...current, value],
      };
    });
  }

  function toggleDaySelection(key: "availableGymDays" | "availableRunDays", value: string) {
    setProfile((p) => {
      const current = (p[key] as string[]) ?? [];
      return {
        ...p,
        [key]: current.includes(value)
          ? current.filter((x) => x !== value)
          : [...current, value],
      };
    });
  }

  function addHolidayRange() {
    setHolidayEvents((prev) => [...prev, { start_date: "", end_date: "" }]);
  }

  function updateHolidayRange(index: number, field: "start_date" | "end_date", value: string) {
    setHolidayEvents((prev) =>
      prev.map((event, i) =>
        i === index ? { ...event, [field]: value } : event,
      ),
    );
  }

  function removeHolidayRange(index: number) {
    const deletedRange = holidayEvents[index];
    if (deletedRange?.start_date && deletedRange?.end_date) {
      // Notify coach of deletion
      createHolidayNotification("holiday_deleted", deletedRange.start_date, deletedRange.end_date)
        .then((result) => console.log("Holiday deleted notification result:", result))
        .catch((err) => console.error("Error creating holiday deleted notification:", err));

      // Delete from database if it has an ID
      if (deletedRange.id) {
        void supabase.from("athlete_events").delete().eq("id", deletedRange.id);
      }
    }

    setHolidayEvents((prev) => prev.filter((_, i) => i !== index));
  }

  async function searchRaceHistory(query: string) {
    if (!query.trim()) {
      setRaceHistorySearchResults([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("preparation_races")
        .select("id, name, event_date, distance_km, event_type, location, terrain_type, climate_type, elevation_gain_m, race_conditions")
        .ilike("name", `%${query}%`)
        .eq("is_active", true)
        .order("event_date")
        .limit(10);

      if (error) {
        console.error("Failed to search races:", error);
        setRaceHistorySearchResults([]);
      } else {
        setRaceHistorySearchResults((data ?? []) as PrepRaceOption[]);
      }
    } catch (err) {
      console.error("Error searching races:", err);
      setRaceHistorySearchResults([]);
    }
  }

  function selectHistoryRace(race: PrepRaceOption) {
    // Only add if not already in list
    if (!raceHistory.some((e) => e.preparation_race_id === race.id)) {
      setRaceHistory((prev) => [
        ...prev,
        {
          preparation_race_id: race.id,
          finish_time: "",
          finish_time_days: 0,
          finish_time_hours: 0,
          finish_time_minutes: 0,
          finish_time_seconds: 0,
          notes: "",
          race,
        },
      ]);
    }
    setRaceHistorySearchQuery("");
    setRaceHistorySearchResults([]);
  }

  function updateRaceHistoryEntry(
    index: number,
    field: "finish_time_days" | "finish_time_hours" | "finish_time_minutes" | "finish_time_seconds" | "notes",
    value: string
  ) {
    setRaceHistory((prev) =>
      prev.map((entry, i) => {
        if (i !== index) return entry;

        const numValue = field === "notes" ? value : Math.max(0, parseInt(value, 10) || 0);

        if (field === "notes") {
          return { ...entry, notes: value };
        }

        const updated = { ...entry, [field]: numValue };
        // Recompute finish_time string from components
        const days = field === "finish_time_days" ? (numValue as number) : entry.finish_time_days || 0;
        const hours = field === "finish_time_hours" ? (numValue as number) : entry.finish_time_hours || 0;
        const minutes = field === "finish_time_minutes" ? (numValue as number) : entry.finish_time_minutes || 0;
        const seconds = field === "finish_time_seconds" ? (numValue as number) : entry.finish_time_seconds || 0;

        updated.finish_time = formatFinishTime(days, hours, minutes, seconds);
        return updated;
      })
    );
  }

  function removeRaceHistoryEntry(index: number) {
    const entry = raceHistory[index];
    if (entry?.id) {
      void supabase.from("athlete_race_history").delete().eq("id", entry.id);
    }
    setRaceHistory((prev) => prev.filter((_, i) => i !== index));
  }

  function addBlockedDate() {
    setProfile((p) => ({
      ...p,
      blockedDates: [...p.blockedDates, ""],
    }));
  }

  function updateBlockedDate(index: number, value: string) {
    setProfile((p) => ({
      ...p,
      blockedDates: p.blockedDates.map((d, i) => (i === index ? value : d)),
    }));
  }

  function removeBlockedDate(index: number) {
    const deletedDate = profile.blockedDates[index];
    if (deletedDate) {
      // Notify coach of deletion
      void createBlockedDateNotification("blocked_date_deleted", deletedDate);
    }

    setProfile((p) => ({
      ...p,
      blockedDates: p.blockedDates.filter((_, i) => i !== index),
    }));
  }

  async function searchPrepRaces(query: string) {
    if (!query.trim()) {
      setPrepRaceSearchResults([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("preparation_races")
        .select("id, name, event_date, distance_km, event_type, location")
        .ilike("name", `%${query}%`)
        .eq("is_active", true)
        .order("event_date")
        .limit(10);

      if (error) {
        console.error("Failed to search prep races:", error);
        setPrepRaceSearchResults([]);
      } else {
        setPrepRaceSearchResults((data ?? []) as PrepRaceOption[]);
      }
    } catch (err) {
      console.error("Error searching prep races:", err);
      setPrepRaceSearchResults([]);
    }
  }

  function selectPrepRace(race: PrepRaceOption) {
    if (!profile.selectedPreparationRaceIds?.includes(race.id)) {
      toggleListItem("selectedPreparationRaceIds", race.id);
    }
    setPrepRaceSearchQuery("");
    setPrepRaceSearchResults([]);
  }

  function updateEventProfile(
    field: keyof typeof defaultProfile.eventProfile,
    value: string | boolean,
  ) {
    setProfile((p) => ({
      ...p,
      eventProfile: {
        ...p.eventProfile,
        [field]: value,
      },
    }));
  }

  async function handleSave() {
    if (profile.hasAccessToHills === "") {
      setStatusMessage("Please select whether the athlete has access to hills.");
      return;
    }

    setIsSaving(true);

    try {
      const supabaseAuth = await supabase.auth.getUser();
      const userId = supabaseAuth.data?.user?.id;

      await saveAthleteProfile({
        ...profile,
        eventType: profile.eventType,
        selectedEventId: profile.selectedEventId || "",
        raceGoal: profile.raceGoal,
        baselineFitness: profile.baselineFitness,
        currentTrainingDaysPerWeek: profile.currentTrainingDaysPerWeek,
        availableTrainingDaysPerWeek: profile.availableTrainingDaysPerWeek,
        weeklyTrainingHours: profile.weeklyTrainingHours,
        longestRecentSessionMinutes: profile.longestRecentSessionMinutes,
        trainingConsistencyWeeks: profile.trainingConsistencyWeeks,
        recentBreakWeeks: profile.recentBreakWeeks,
        backToBackSessionsCompleted: profile.backToBackSessionsCompleted,
        maxBackToBackDays: profile.maxBackToBackDays,
        loadCarriageExperience: profile.loadCarriageExperience,
        hasAccessToHills: profile.hasAccessToHills,
        sessionsEnjoy: profile.sessionsEnjoy,
        sessionsAvoid: profile.sessionsAvoid,
        trainingStylePreference: profile.trainingStylePreference,
        pacingStyle: profile.pacingStyle,
        availableGymDays: profile.availableGymDays ?? [],
        availableRunDays: profile.availableRunDays ?? [],
        preferredLongSessionDay: profile.preferredLongSessionDay ?? "",
        selectedPreparationRaceIds: profile.selectedPreparationRaceIds ?? [],
        selectedTags: profile.selectedTags ?? [],
        blockedDates: profile.blockedDates,
      });

      // Save holidays to athlete_events
      if (userId) {
        // Find new holidays (not in original list)
        const newHolidays = holidayEvents.filter(
          (h) =>
            h.start_date &&
            h.end_date &&
            !h.id &&
            !originalHolidayEvents.some(
              (orig) =>
                orig.start_date === h.start_date && orig.end_date === h.end_date,
            ),
        );

        // Find modified holidays (have an ID and dates changed)
        const modifiedHolidays = holidayEvents.filter(
          (h) =>
            h.id &&
            h.start_date &&
            h.end_date &&
            originalHolidayEvents.some(
              (orig) =>
                orig.id === h.id &&
                (orig.start_date !== h.start_date || orig.end_date !== h.end_date),
            ),
        );

        // Insert new holidays
        for (const holiday of newHolidays) {
          await supabase.from("athlete_events").insert({
            athlete_user_id: userId,
            event_type: "holiday",
            title: "Holiday",
            start_date: holiday.start_date,
            end_date: holiday.end_date,
            status: "acknowledged",
          });

          // Notify coach of new holiday
          try {
            const result = await createHolidayNotification("holiday_created", holiday.start_date, holiday.end_date);
            console.log("Holiday created notification result:", result);
          } catch (err) {
            console.error("Error creating holiday notification:", err);
          }
        }

        // Update modified holidays
        for (const holiday of modifiedHolidays) {
          await supabase
            .from("athlete_events")
            .update({
              start_date: holiday.start_date,
              end_date: holiday.end_date,
            })
            .eq("id", holiday.id);

          // Notify coach of edited holiday
          try {
            const result = await createHolidayNotification("holiday_edited", holiday.start_date, holiday.end_date);
            console.log("Holiday edited notification result:", result);
          } catch (err) {
            console.error("Error creating holiday edited notification:", err);
          }
        }

        // Save race history to athlete_race_history using upsert
        for (const entry of raceHistory) {
          const { error } = await supabase.from("athlete_race_history").upsert(
            {
              id: entry.id,
              athlete_user_id: userId,
              preparation_race_id: entry.preparation_race_id,
              finish_time: entry.finish_time || null,
              notes: entry.notes || null,
            },
            { onConflict: "athlete_user_id,preparation_race_id" }
          );

          if (error) {
            console.error("Error upserting race history entry:", error);
          }
        }
      }

      setStatusMessage("Profile saved.");
      window.setTimeout(() => setStatusMessage(""), 2000);
    } catch (error) {
      console.error("Failed to save athlete profile", error);
      setStatusMessage("Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="mx-auto max-w-5xl space-y-8 px-6 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight">Athlete Intake</h1>
            <p className="mt-2 text-zinc-600">Loading intake data...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-12">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Athlete Intake</h1>
            <p className="mt-2 text-zinc-600">
              Define constraints so plans are realistic.
            </p>
          </div>

          <Link
            href="/create-plan"
            className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
          >
            Back
          </Link>
        </div>

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        {/* Tab Navigation */}
        <div className="flex gap-1 border-b border-zinc-200">
          <button
            onClick={() => setActiveTab("event")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "event"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Event
          </button>
          <button
            onClick={() => setActiveTab("training")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "training"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Training
          </button>
          <button
            onClick={() => setActiveTab("preferences")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "preferences"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Preferences
          </button>
          <button
            onClick={() => setActiveTab("constraints")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "constraints"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Constraints
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "schedule"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Schedule
          </button>
          <button
            onClick={() => setActiveTab("races")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "races"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Prep Races
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "history"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Race History
          </button>
        </div>

        {/* Event Tab */}
        {activeTab === "event" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Event</h2>

          <select
            className="mt-4 w-full rounded-xl border border-zinc-300 px-4 py-3"
            value={profile.selectedEventId}
            onChange={(e) => handleEventChange(e.target.value)}
          >
            <option value="">Select event</option>
            {eventOptions.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>

          {selectedEvent ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 space-y-1">
              <div><span className="font-medium">Type:</span> {selectedEvent.event_type}</div>
              <div><span className="font-medium">Date:</span> {selectedEvent.event_date || "TBC"}</div>
              <div><span className="font-medium">Terrain:</span> {selectedEvent.terrain_type || "—"}</div>
              <div><span className="font-medium">Climate:</span> {selectedEvent.climate_type || "—"}</div>
              <div><span className="font-medium">Location:</span> {selectedEvent.location || "—"}</div>
              {selectedEvent.race_conditions && (
                <>
                  {selectedEvent.race_conditions.temperature && (
                    <div><span className="font-medium">Temperature:</span> {selectedEvent.race_conditions.temperature.replace(/_/g, " ")}</div>
                  )}
                  {selectedEvent.race_conditions.altitude && (
                    <div><span className="font-medium">Altitude:</span> {selectedEvent.race_conditions.altitude.replace(/_/g, " ")}</div>
                  )}
                  {selectedEvent.race_conditions.humidity && (
                    <div><span className="font-medium">Humidity:</span> {selectedEvent.race_conditions.humidity}</div>
                  )}
                  {selectedEvent.race_conditions.specialConditions?.length > 0 && (
                    <div><span className="font-medium">Conditions:</span> {selectedEvent.race_conditions.specialConditions.map(c => c.replace(/_/g, " ")).join(", ")}</div>
                  )}
                  {selectedEvent.race_conditions.notes && (
                    <div><span className="font-medium">Notes:</span> {selectedEvent.race_conditions.notes}</div>
                  )}
                </>
              )}
            </div>
          ) : null}

          <div className="mt-4 max-w-md">
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              Event Goal
            </label>
            <select
              className="w-full rounded-xl border border-zinc-300 px-4 py-3"
              value={profile.raceGoal ?? defaultProfile.raceGoal}
              onChange={(e) => updateRaceGoal(e.target.value)}
            >
              {raceGoalOptions.map((goal) => (
                <option key={goal.value} value={goal.value}>
                  {goal.label}
                </option>
              ))}
            </select>
          </div>
        </section>
        )}

        {/* Training Tab */}
        {activeTab === "training" && (
        <>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Current Training Baseline</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Baseline Fitness
              </span>
              <select
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.baselineFitness ?? defaultProfile.baselineFitness}
                onChange={(e) => updateBaselineFitness(e.target.value)}
              >
                {baselineFitnessOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Current Training Days Per Week
              </span>
              <input
                type="number"
                min="0"
                max="14"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.currentTrainingDaysPerWeek ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("currentTrainingDaysPerWeek", e.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Available Training Days Per Week
              </span>
              <input
                type="number"
                min="0"
                max="14"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.availableTrainingDaysPerWeek ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("availableTrainingDaysPerWeek", e.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Weekly Training Hours
              </span>
              <input
                type="number"
                min="0"
                step="0.5"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.weeklyTrainingHours ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("weeklyTrainingHours", e.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Longest Recent Session (minutes)
              </span>
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.longestRecentSessionMinutes ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("longestRecentSessionMinutes", e.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Training Consistency (weeks)
              </span>
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.trainingConsistencyWeeks ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("trainingConsistencyWeeks", e.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Recent Break From Training (weeks)
              </span>
              <input
                type="number"
                min="0"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.recentBreakWeeks ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("recentBreakWeeks", e.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Maximum Back-To-Back Days Completed
              </span>
              <input
                type="number"
                min="0"
                max="14"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.maxBackToBackDays ?? 0}
                onChange={(e) =>
                  updateTrainingMetric("maxBackToBackDays", e.target.value)
                }
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 md:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(profile.backToBackSessionsCompleted)}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    backToBackSessionsCompleted: e.target.checked,
                  }))
                }
              />
              <span className="text-sm font-medium text-zinc-800">
                Has completed back-to-back training sessions before
              </span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 md:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(profile.loadCarriageExperience)}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    loadCarriageExperience: e.target.checked,
                  }))
                }
              />
              <span className="text-sm font-medium text-zinc-800">
                Has load carriage experience
              </span>
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Access to Hills for Training
              </span>
              <select
                required
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.hasAccessToHills === "" ? "" : profile.hasAccessToHills ? "yes" : "no"}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    hasAccessToHills:
                      e.target.value === "" ? "" : e.target.value === "yes",
                  }))
                }
              >
                <option value="">Select yes or no</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Training Preferences</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Tolerance For Repetition vs Variety
              </span>
              <select
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.trainingStylePreference ?? defaultProfile.trainingStylePreference}
                onChange={(e) =>
                  updateTrainingPreference("trainingStylePreference", e.target.value)
                }
              >
                {repetitionToleranceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-700">
                Expected Pacing Style
              </span>
              <select
                className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                value={profile.pacingStyle ?? defaultProfile.pacingStyle}
                onChange={(e) =>
                  updateTrainingPreference("pacingStyle", e.target.value)
                }
              >
                {pacingStyleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-zinc-900">Sessions They Enjoy</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {sessionPreferenceOptions.map((sessionOption) => (
                <button
                  key={sessionOption.value}
                  type="button"
                  onClick={() => toggleSessionPreference("sessionsEnjoy", sessionOption.value)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${
                    (profile.sessionsEnjoy ?? []).includes(sessionOption.value)
                      ? "bg-emerald-600 text-white"
                      : "border border-zinc-300 bg-white hover:bg-zinc-100"
                  }`}
                >
                  {sessionOption.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-zinc-900">Sessions They Prefer To Avoid</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {sessionPreferenceOptions.map((sessionOption) => (
                <button
                  key={sessionOption.value}
                  type="button"
                  onClick={() => toggleSessionPreference("sessionsAvoid", sessionOption.value)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium ${
                    (profile.sessionsAvoid ?? []).includes(sessionOption.value)
                      ? "bg-amber-500 text-black"
                      : "border border-zinc-300 bg-white hover:bg-zinc-100"
                  }`}
                >
                  {sessionOption.label}
                </button>
              ))}
            </div>
          </div>

          {((profile.sessionsEnjoy ?? []).length > 0 || (profile.sessionsAvoid ?? []).length > 0) ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              {(profile.sessionsEnjoy ?? []).length > 0 ? (
                <div>
                  <span className="font-medium">Enjoys:</span>{" "}
                  {(profile.sessionsEnjoy ?? []).map(formatSessionPreferenceLabel).join(", ")}
                </div>
              ) : null}
              {(profile.sessionsAvoid ?? []).length > 0 ? (
                <div className={(profile.sessionsEnjoy ?? []).length > 0 ? "mt-2" : ""}>
                  <span className="font-medium">Avoids:</span>{" "}
                  {(profile.sessionsAvoid ?? []).map(formatSessionPreferenceLabel).join(", ")}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 space-y-6 border-t border-zinc-100 pt-6">
            <h3 className="text-sm font-semibold text-zinc-900">Available Days By Session Type</h3>

            {/* Gym days */}
            <div>
              <p className="mb-3 text-sm font-medium text-zinc-700">Gym Days</p>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const selected = ((profile.availableGymDays as string[]) ?? []).includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDaySelection("availableGymDays", day.value)}
                      className={`min-w-[52px] rounded-xl px-4 py-2 text-sm font-medium ${
                        selected
                          ? "bg-zinc-900 text-white"
                          : "border border-zinc-300 bg-white hover:bg-zinc-100"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Long run day */}
            <div>
              <p className="mb-3 text-sm font-medium text-zinc-700">Preferred Long Run Day</p>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const selected = profile.preferredLongSessionDay === day.value;
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        setProfile((p) => ({
                          ...p,
                          preferredLongSessionDay: selected ? "" : day.value,
                        }))
                      }
                      className={`min-w-[52px] rounded-xl px-4 py-2 text-sm font-medium ${
                        selected
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-300 bg-white hover:bg-zinc-100"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-500">Select one preferred day for your longest weekly session.</p>
            </div>

            {/* Normal run days */}
            <div>
              <p className="mb-3 text-sm font-medium text-zinc-700">Normal Run Days</p>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const selected = ((profile.availableRunDays as string[]) ?? []).includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDaySelection("availableRunDays", day.value)}
                      className={`min-w-[52px] rounded-xl px-4 py-2 text-sm font-medium ${
                        selected
                          ? "bg-blue-600 text-white"
                          : "border border-zinc-300 bg-white hover:bg-zinc-100"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        </>
        )}

        {/* Preferences Tab */}
        {activeTab === "preferences" && (
        <>
        {isDesertRace ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Desert Race Preparation</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">
                  Heat access
                </span>
                <select
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                  value={profile.eventProfile.heatAccess}
                  onChange={(e) => updateEventProfile("heatAccess", e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="limited">Limited</option>
                  <option value="good">Good</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">
                  Back-to-back experience
                </span>
                <select
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                  value={profile.eventProfile.backToBack}
                  onChange={(e) => updateEventProfile("backToBack", e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="some">Some</option>
                  <option value="good">Good</option>
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={profile.eventProfile.saunaAccess}
                  onChange={(e) => updateEventProfile("saunaAccess", e.target.checked)}
                />
                <span className="text-sm font-medium text-zinc-800">Sauna access</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={profile.eventProfile.packTraining}
                  onChange={(e) => updateEventProfile("packTraining", e.target.checked)}
                />
                <span className="text-sm font-medium text-zinc-800">Can train with pack</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={profile.eventProfile.sandAccess}
                  onChange={(e) => updateEventProfile("sandAccess", e.target.checked)}
                />
                <span className="text-sm font-medium text-zinc-800">Access to sand terrain</span>
              </label>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-1">Your Experience & Challenges</h2>
          <p className="text-sm text-zinc-500 mb-4">
            Select any tags that describe your experience, challenges, or special circumstances. This helps your coach understand you better.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
            {ATHLETE_AVAILABLE_TAGS.map((tag) => (
              <label
                key={tag.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 12px",
                  border: profile.selectedTags?.includes(tag.value) ? "2px solid #111" : "1px solid #ddd",
                  borderRadius: "8px",
                  background: profile.selectedTags?.includes(tag.value) ? "#f0f0f0" : "#fff",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={profile.selectedTags?.includes(tag.value) ?? false}
                  onChange={(e) => {
                    const newTags = e.target.checked
                      ? [...(profile.selectedTags ?? []), tag.value]
                      : (profile.selectedTags ?? []).filter((t) => t !== tag.value);
                    setProfile({ ...profile, selectedTags: newTags });
                  }}
                  style={{ cursor: "pointer" }}
                />
                <span style={{ fontSize: "14px" }}>{tag.label}</span>
              </label>
            ))}
          </div>
        </section>
        </>
        )}

        {/* Races Tab */}
        {activeTab === "races" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Preparation Races</h2>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-3 block text-sm font-medium text-zinc-700">Search for races</label>
              <input
                type="text"
                placeholder="Search by race name..."
                value={prepRaceSearchQuery}
                onChange={(e) => searchPrepRaces(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>
            {prepRaceSearchResults.length > 0 && (
              <div className="rounded-xl border border-zinc-300 max-h-48 overflow-y-auto">
                {prepRaceSearchResults.map((race) => (
                  <button
                    key={race.id}
                    type="button"
                    onClick={() => selectPrepRace(race)}
                    className="w-full text-left px-4 py-2 hover:bg-zinc-100 border-b border-zinc-200 last:border-b-0 text-sm"
                  >
                    <div className="font-medium">{race.name}</div>
                    <div className="text-xs text-zinc-500">
                      {race.event_date
                        ? new Date(race.event_date).toLocaleDateString("en-GB")
                        : "Date TBC"}{" "}
                      • {race.distance_km}km
                    </div>
                  </button>
                ))}
              </div>
            )}
            {profile.selectedPreparationRaceIds && profile.selectedPreparationRaceIds.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-zinc-700">Selected races:</p>
                {preparationRaceOptions
                  .filter((race) => profile.selectedPreparationRaceIds?.includes(race.id))
                  .map((race) => (
                    <div key={race.id} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                      <div>
                        <div className="font-medium">{race.name}</div>
                        <div className="text-xs text-zinc-500">
                          {race.event_date
                            ? new Date(race.event_date).toLocaleDateString("en-GB")
                            : "Date TBC"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleListItem("selectedPreparationRaceIds", race.id)}
                        className="ml-2 px-3 py-1 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
        )}

        {/* Race History Tab */}
        {activeTab === "history" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Race History</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Previous races you have completed. Helps your coach understand your experience.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-3 block text-sm font-medium text-zinc-700">Search for races</label>
              <input
                type="text"
                placeholder="Search by race name..."
                value={raceHistorySearchQuery}
                onChange={(e) => {
                  setRaceHistorySearchQuery(e.target.value);
                  searchRaceHistory(e.target.value);
                }}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>
            {raceHistorySearchResults.length > 0 && (
              <div className="rounded-xl border border-zinc-300 max-h-48 overflow-y-auto">
                {raceHistorySearchResults.map((race) => (
                  <button
                    key={race.id}
                    type="button"
                    onClick={() => selectHistoryRace(race)}
                    className="w-full text-left px-4 py-2 hover:bg-zinc-100 border-b border-zinc-200 last:border-b-0 text-sm"
                  >
                    <div className="font-medium">{race.name}</div>
                    <div className="text-xs text-zinc-500">
                      {race.event_date
                        ? new Date(race.event_date).toLocaleDateString("en-GB")
                        : "Date TBC"}{" "}
                      • {race.distance_km ? `${race.distance_km}km` : "Distance TBC"}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {raceHistory.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-zinc-700">Your race history:</p>
                {raceHistory.map((entry, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-zinc-900">{entry.race?.name}</div>
                        <div className="mt-1 text-xs text-zinc-600">
                          {entry.race?.event_date
                            ? new Date(entry.race.event_date).toLocaleDateString("en-GB")
                            : "Date TBC"}{" "}
                          • {entry.race?.distance_km ? `${entry.race.distance_km}km` : "Distance TBC"}
                          {entry.race?.location && ` • ${entry.race.location}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRaceHistoryEntry(i)}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 flex-shrink-0"
                      >
                        Remove
                      </button>
                    </div>

                    {/* Attribute pills */}
                    {(entry.race?.terrain_type || entry.race?.climate_type || entry.race?.race_conditions?.specialConditions?.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {entry.race?.terrain_type && (
                          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700">
                            {entry.race.terrain_type}
                          </span>
                        )}
                        {entry.race?.climate_type && (
                          <span className="inline-block rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-700">
                            {entry.race.climate_type}
                          </span>
                        )}
                        {entry.race?.race_conditions?.specialConditions?.map((cond: string) => (
                          <span key={cond} className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs text-green-700">
                            {cond.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-zinc-600">Finish Time</label>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="mb-1 block text-xs text-zinc-500">Days</label>
                            <input
                              type="number"
                              min="0"
                              max="999"
                              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm text-center"
                              value={entry.finish_time_days || 0}
                              onChange={(e) => updateRaceHistoryEntry(i, "finish_time_days", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-500">Hours</label>
                            <input
                              type="number"
                              min="0"
                              max="23"
                              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm text-center"
                              value={entry.finish_time_hours || 0}
                              onChange={(e) => updateRaceHistoryEntry(i, "finish_time_hours", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-500">Minutes</label>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm text-center"
                              value={entry.finish_time_minutes || 0}
                              onChange={(e) => updateRaceHistoryEntry(i, "finish_time_minutes", e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-500">Seconds</label>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm text-center"
                              value={entry.finish_time_seconds || 0}
                              onChange={(e) => updateRaceHistoryEntry(i, "finish_time_seconds", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                      <textarea
                        className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm resize-none"
                        rows={2}
                        placeholder="Notes (e.g. conditions, how it went...)"
                        value={entry.notes}
                        onChange={(e) => updateRaceHistoryEntry(i, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Experience Summary */}
          {raceHistory.length > 0 && (
            <div className="mt-6 rounded-xl border border-zinc-300 bg-zinc-50 p-4">
              <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">Experience Summary</p>
              <p className="mt-2 text-sm text-zinc-700 leading-relaxed">
                {buildRaceHistorySummary(
                  raceHistory.map((e) => ({
                    name: e.race?.name || "",
                    distance_km: e.race?.distance_km ?? null,
                    terrain_type: e.race?.terrain_type ?? null,
                    climate_type: e.race?.climate_type ?? null,
                    race_conditions: e.race?.race_conditions ?? null,
                  }))
                )}
              </p>
            </div>
          )}

          {/* Experience Gaps */}
          {raceHistory.length > 0 && selectedEvent && (() => {
            const goalEvent = {
              name: selectedEvent.name,
              event_type: (selectedEvent.event_type || null) as string | null,
              terrain_type: selectedEvent.terrain_type,
              climate_type: selectedEvent.climate_type,
              race_conditions: selectedEvent.race_conditions ? {
                specialConditions: selectedEvent.race_conditions.specialConditions,
                temperature: selectedEvent.race_conditions.temperature || undefined,
                altitude: selectedEvent.race_conditions.altitude || undefined,
              } : null,
            };
            const gaps = buildExperienceGaps(
              raceHistory.map((e) => ({
                name: e.race?.name || "",
                distance_km: e.race?.distance_km ?? null,
                terrain_type: e.race?.terrain_type ?? null,
                climate_type: e.race?.climate_type ?? null,
                race_conditions: e.race?.race_conditions ?? null,
              })),
              goalEvent
            );
            if (gaps.length === 0) return null;
            return (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Experience Gaps</p>
                <ul className="mt-2 space-y-1">
                  {gaps.map((gap, i) => (
                    <li key={i} className="text-sm text-amber-800">
                      ⚠ {gap}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </section>
        )}

        {/* Constraints Tab */}
        {activeTab === "constraints" && (
        <>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Unavailable Equipment</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {equipmentOptions.map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => toggleListItem("equipmentUnavailable", eq)}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  profile.equipmentUnavailable.includes(eq)
                    ? "bg-red-600 text-white"
                    : "border border-zinc-300 bg-white hover:bg-zinc-100"
                }`}
              >
                {eq}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Prefer Not To Use</h2>

          <div className="mt-4 flex flex-wrap gap-2">
            {equipmentOptions.map((eq) => (
              <button
                key={eq}
                type="button"
                onClick={() => toggleListItem("equipmentAvoid", eq)}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  profile.equipmentAvoid.includes(eq)
                    ? "bg-amber-400 text-black"
                    : "border border-zinc-300 bg-white hover:bg-zinc-100"
                }`}
              >
                {eq}
              </button>
            ))}
          </div>
        </section>

        </>
        )}

        {/* Schedule Tab */}
        {activeTab === "schedule" && (
        <>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Holiday Dates</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Add a start and end date for each holiday period.
              </p>
            </div>

            <button
              type="button"
              onClick={addHolidayRange}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100"
            >
              + Add Holiday Range
            </button>
          </div>

          {holidayEvents.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-zinc-700">Your Holiday Periods</h3>
              <div className="space-y-2">
                {holidayEvents
                  .filter((event) => event.start_date && event.end_date)
                  .map((event, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-zinc-200 bg-blue-50 px-4 py-3"
                    >
                      <div className="text-sm">
                        <span className="font-semibold text-zinc-900">
                          {new Date(event.start_date).toLocaleDateString("en-GB", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="mx-2 text-zinc-500">—</span>
                        <span className="font-semibold text-zinc-900">
                          {new Date(event.end_date).toLocaleDateString("en-GB", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="ml-2 text-xs text-zinc-600">
                          ({Math.ceil((new Date(event.end_date).getTime() - new Date(event.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1} days)
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <p className="text-sm font-medium text-zinc-700">Edit or add new holidays:</p>
            {holidayEvents.length === 0 ? (
              <p className="text-sm text-zinc-500">No holiday ranges added yet.</p>
            ) : (
              holidayEvents.map((event, i) => (
                <div
                  key={i}
                  className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-[1fr_1fr_100px]"
                >
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Start date
                    </label>
                    <input
                      type="date"
                      value={event.start_date}
                      onChange={(e) => updateHolidayRange(i, "start_date", e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      End date
                    </label>
                    <input
                      type="date"
                      value={event.end_date}
                      onChange={(e) => updateHolidayRange(i, "end_date", e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeHolidayRange(i)}
                      className="w-full rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">No Training Days</h2>

          <div className="mt-4 space-y-3">
            {profile.blockedDates.map((date, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => updateBlockedDate(i, e.target.value)}
                  className="rounded-xl border border-zinc-300 px-4 py-2"
                />
                <button
                  type="button"
                  onClick={() => removeBlockedDate(i)}
                  className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addBlockedDate}
            className="mt-4 text-sm text-blue-600"
          >
            + Add Blocked Date
          </button>
        </section>
        </>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Profile"}
          </button>

          <Link
            href="/create-plan"
            className="rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold hover:bg-zinc-100"
          >
            Continue to Plan
          </Link>
        </div>
      </div>
    </main>
  );
}

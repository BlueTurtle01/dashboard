"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { createHolidayNotification } from "@/lib/actions/createNotification";
import {
  saveAthleteProfile,
  loadAthleteProfile,
  type AthleteProfile as StoredAthleteProfile,
} from "@/lib/data/athleteProfileStore";
import { buildRaceHistorySummary, buildExperienceGaps } from "@/lib/planner/raceHistorySummary";

// Event Option Type
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

// Prep Race Option Type
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

// Race History Entry Type
type RaceHistoryEntry = {
  id?: string;
  preparation_race_id: string;
  finish_time: string;
  finish_time_days?: number;
  finish_time_hours?: number;
  finish_time_minutes?: number;
  finish_time_seconds?: number;
  did_finish?: boolean;
  muscles_hurt?: string[];
  breathing_feedback?: string;
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

// Athlete Profile Type
type AthleteProfile = StoredAthleteProfile & {
  selectedPreparationRaceIds?: string[];
  hasAccessToHills?: boolean | "";
};

// Constants - Options
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

const MUSCLE_GROUPS = [
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Shins",
  "Feet",
  "Lower back",
  "Upper back",
  "Shoulders",
  "Neck",
  "Hip flexors",
  "Knees",
  "Ankles",
] as const;

const BREATHING_OPTIONS = [
  "Comfortable",
  "Slightly challenged",
  "Very challenging",
  "Had to walk/slow down",
] as const;

const ATHLETE_AVAILABLE_TAGS = [
  { value: "knee_pain", label: "Knee pain", category: "Injury History" },
  { value: "back_pain", label: "Back pain", category: "Injury History" },
  { value: "ankle_issues", label: "Ankle issues", category: "Injury History" },
  { value: "it_band_syndrome", label: "IT band syndrome", category: "Injury History" },
  { value: "plantar_fasciitis", label: "Plantar fasciitis", category: "Injury History" },
  { value: "shin_splints", label: "Shin splints", category: "Injury History" },
  { value: "stress_fracture", label: "Stress fracture history", category: "Injury History" },
  { value: "tendinitis", label: "Tendinitis", category: "Injury History" },
  { value: "asthma", label: "Asthma", category: "Medical Conditions" },
  { value: "diabetes", label: "Diabetes", category: "Medical Conditions" },
  { value: "heart_condition", label: "Heart condition", category: "Medical Conditions" },
  { value: "hypertension", label: "Hypertension", category: "Medical Conditions" },
  { value: "thyroid_condition", label: "Thyroid condition", category: "Medical Conditions" },
  { value: "ultramarathoner", label: "Ultramarathoner", category: "Experience" },
  { value: "trail_runner", label: "Trail runner", category: "Experience" },
  { value: "road_runner", label: "Road runner", category: "Experience" },
  { value: "desert_racing", label: "Desert racing", category: "Experience" },
  { value: "high_altitude", label: "High altitude experience", category: "Experience" },
  { value: "multi_day_racing", label: "Multi-day racing", category: "Experience" },
  { value: "anxiety_management", label: "Anxiety management experience", category: "Psychology" },
  { value: "fear_of_water", label: "Fear of water", category: "Psychology" },
  { value: "perfectionist", label: "Perfectionist tendencies", category: "Psychology" },
  { value: "mental_toughness", label: "Building mental toughness", category: "Psychology" },
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

// Helper Functions
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

export default function AthleteProfilePage() {
  const [profile, setProfile] = useState<AthleteProfile>(defaultProfile);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [preparationRaceOptions, setPreparationRaceOptions] = useState<PrepRaceOption[]>([]);
  const [prepRaceSearchQuery, setPrepRaceSearchQuery] = useState("");
  const [prepRaceSearchResults, setPrepRaceSearchResults] = useState<PrepRaceOption[]>([]);
  const [holidayEvents, setHolidayEvents] = useState<Array<{ id?: string; start_date: string; end_date: string }>>([]);
  const [originalHolidayEvents, setOriginalHolidayEvents] = useState<Array<{ id?: string; start_date: string; end_date: string }>>([]);
  const [medicalClearanceDate, setMedicalClearanceDate] = useState<string>("");
  const [medicalClearanceId, setMedicalClearanceId] = useState<string>("");
  const [raceHistory, setRaceHistory] = useState<RaceHistoryEntry[]>([]);
  const [raceHistorySearchQuery, setRaceHistorySearchQuery] = useState("");
  const [raceHistorySearchResults, setRaceHistorySearchResults] = useState<PrepRaceOption[]>([]);
  const [activeTab, setActiveTab] = useState<"event" | "training" | "preferences" | "constraints" | "schedule" | "races" | "history" | "health">("event");

  // Load all profile data
  useEffect(() => {
    let cancelled = false;

    const fetchAllData = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setLoading(false);
          return;
        }

        const userId = user.id;

        // Load athlete profile
        const existingProfile = await loadAthleteProfile();

        // Fetch events
        const [eventsData, racesData, holidaysData, medicalData, historyData] = await Promise.all([
          supabase.from("events").select("id, name, event_type, event_date, terrain_type, climate_type, location, race_conditions"),
          supabase.from("preparation_races").select("id, name, event_date, distance_km, event_type, location, terrain_type, climate_type, elevation_gain_m, race_conditions").order("event_date"),
          supabase.from("athlete_events").select("id, start_date, end_date, title").eq("athlete_user_id", userId).eq("event_type", "holiday"),
          supabase.from("athlete_events").select("id, start_date").eq("athlete_user_id", userId).eq("event_type", "medical_clearance"),
          supabase.from("athlete_race_history").select("id, preparation_race_id, finish_time, notes, preparation_races(id, name, event_date, distance_km, event_type, location, terrain_type, climate_type, elevation_gain_m, race_conditions)").eq("athlete_user_id", userId).order("preparation_races(event_date)", { ascending: false }),
        ]);

        if (eventsData.data) setEventOptions(eventsData.data as EventOption[]);
        if (racesData.data) setPreparationRaceOptions(racesData.data as PrepRaceOption[]);

        if (holidaysData.data) {
          setHolidayEvents(holidaysData.data.map((h: any) => ({ id: h.id, start_date: h.start_date, end_date: h.end_date })));
          setOriginalHolidayEvents(holidaysData.data.map((h: any) => ({ id: h.id, start_date: h.start_date, end_date: h.end_date })));
        }

        if (medicalData.data && medicalData.data.length > 0) {
          setMedicalClearanceDate(medicalData.data[0].start_date || "");
          setMedicalClearanceId(medicalData.data[0].id);
        }

        if (historyData.data) {
          const history = historyData.data.map((entry: any) => ({
            id: entry.id,
            preparation_race_id: entry.preparation_race_id,
            finish_time: entry.finish_time,
            notes: entry.notes,
            race: Array.isArray(entry.preparation_races) ? entry.preparation_races[0] : entry.preparation_races,
          }));
          setRaceHistory(history);
        }

        if (existingProfile) {
          setProfile(existingProfile);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error loading profile data:", err);
        setLoading(false);
      }
    };

    fetchAllData();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEvent = eventOptions.find((event) => event.id === profile.selectedEventId) ?? null;
  const isDesertRace = selectedEvent?.event_type === "Desert Race";

  function updateRaceGoal(value: string) {
    setProfile((prev) => ({ ...prev, raceGoal: value }));
  }

  function updateBaselineFitness(value: string) {
    setProfile((prev) => ({ ...prev, baselineFitness: value }));
  }

  function updateTrainingMetric(field: keyof typeof defaultProfile, value: string) {
    setProfile((prev) => ({
      ...prev,
      [field]: parseNumberInput(value),
    }));
  }

  function toggleListItem(field: "sessionsEnjoy" | "sessionsAvoid" | "selectedTags" | "selectedPreparationRaceIds" | "availableGymDays" | "availableRunDays", item: string) {
    setProfile((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).includes(item) ? (prev[field] as string[]).filter((i) => i !== item) : [...(prev[field] as string[]), item],
    }));
  }

  function updateHolidayEvent(index: number, field: "start_date" | "end_date", value: string) {
    setHolidayEvents((prev) =>
      prev.map((event, i) =>
        i === index ? { ...event, [field]: value } : event,
      )
    );
  }

  async function searchPreparationRaces(query: string) {
    if (!query.trim()) {
      setPrepRaceSearchResults([]);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("preparation_races")
        .select("id, name, event_date, distance_km, event_type, location, terrain_type, climate_type, elevation_gain_m, race_conditions")
        .ilike("name", `%${query}%`)
        .order("event_date");

      if (error) {
        console.error("Failed to search races:", error);
        return;
      }

      setPrepRaceSearchResults(data || []);
    } catch (err) {
      console.error("Error searching races:", err);
    }
  }

  function selectPrepRace(race: PrepRaceOption) {
    if (!profile.selectedPreparationRaceIds?.includes(race.id)) {
      toggleListItem("selectedPreparationRaceIds", race.id);
    }
    setPrepRaceSearchQuery("");
    setPrepRaceSearchResults([]);
  }

  function updateEventProfile(field: keyof typeof defaultProfile.eventProfile, value: string | boolean) {
    setProfile((p) => ({
      ...p,
      eventProfile: {
        ...p.eventProfile,
        [field]: value,
      },
    }));
  }

  function handleEventChange(eventId: string) {
    const matchedEvent = eventOptions.find((event) => event.id === eventId) ?? null;
    setProfile((prev) => ({
      ...prev,
      selectedEventId: eventId,
      eventType: matchedEvent?.event_type ?? "",
    }));
  }

  function updateTrainingPreference(field: "trainingStylePreference" | "pacingStyle", value: string) {
    setProfile((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSave() {
    if (profile.hasAccessToHills === "") {
      setStatusMessage("Please select whether the athlete has access to hills.");
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
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

      if (userId) {
        // Handle holidays
        const newHolidays = holidayEvents.filter((h) => h.start_date && h.end_date && !h.id && !originalHolidayEvents.some((orig) => orig.start_date === h.start_date && orig.end_date === h.end_date));

        for (const holiday of newHolidays) {
          await supabase.from("athlete_events").insert({
            athlete_user_id: userId,
            event_type: "holiday",
            title: "Holiday",
            start_date: holiday.start_date,
            end_date: holiday.end_date,
            status: "acknowledged",
          });

          try {
            await createHolidayNotification("holiday_created", holiday.start_date, holiday.end_date);
          } catch (err) {
            console.error("Error creating holiday notification:", err);
          }
        }

        // Handle race history
        for (const entry of raceHistory) {
          const { error } = await supabase.from("athlete_race_history").upsert({
            id: entry.id,
            athlete_user_id: userId,
            preparation_race_id: entry.preparation_race_id,
            finish_time: entry.finish_time || null,
            did_finish: entry.did_finish ?? true,
            muscles_hurt: entry.muscles_hurt || [],
            breathing_feedback: entry.breathing_feedback || null,
            notes: entry.notes || null,
          });

          if (error) {
            console.error("Error upserting race history entry:", error);
          }
        }

        // Handle medical clearance
        if (medicalClearanceDate) {
          if (medicalClearanceId) {
            await supabase.from("athlete_events").update({ start_date: medicalClearanceDate }).eq("id", medicalClearanceId);
          } else {
            await supabase.from("athlete_events").insert({
              athlete_user_id: userId,
              event_type: "medical_clearance",
              title: "Medical Clearance",
              start_date: medicalClearanceDate,
              status: "acknowledged",
            });
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

  if (loading) {
    return (
      <main className="min-h-screen bg-linear-to-b from-zinc-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-center text-zinc-600">Loading profile...</p>
        </div>
      </main>
    );
  }

  const tabLabels: Record<string, string> = {
    event: "Event",
    training: "Training",
    preferences: "Preferences",
    constraints: "Constraints",
    schedule: "Schedule",
    races: "Prep Races",
    history: "Race History",
    health: "Health",
  };

  return (
    <main className="min-h-screen bg-linear-to-b from-zinc-50 to-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold">Athlete Profile</h1>
          <div className="mt-4 flex gap-3">
            <Link href="/athlete" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100">
              Back to Training Calendar
            </Link>
          </div>
        </div>

        {statusMessage && (
          <div className={`rounded-xl p-4 text-sm font-semibold ${statusMessage.includes("Failed") ? "border border-red-200 bg-red-50 text-red-900" : "border border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            {statusMessage}
          </div>
        )}

        <div className="border-b border-zinc-200">
          <div className="flex gap-4">
            {(Object.keys(tabLabels) as Array<keyof typeof tabLabels>).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-600 hover:text-zinc-900"}`}>
                {tabLabels[tab]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Event */}
        {activeTab === "event" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Event</h2>
            <select className="mt-4 w-full rounded-xl border border-zinc-300 px-4 py-3" value={profile.selectedEventId} onChange={(e) => handleEventChange(e.target.value)}>
              <option value="">Select event</option>
              {eventOptions.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
            {selectedEvent && (
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-1 text-sm text-zinc-700">
                <div>
                  <span className="font-medium">Type:</span> {selectedEvent.event_type}
                </div>
                <div>
                  <span className="font-medium">Date:</span> {selectedEvent.event_date || "TBC"}
                </div>
                <div>
                  <span className="font-medium">Terrain:</span> {selectedEvent.terrain_type || "—"}
                </div>
                <div>
                  <span className="font-medium">Climate:</span> {selectedEvent.climate_type || "—"}
                </div>
                <div>
                  <span className="font-medium">Location:</span> {selectedEvent.location || "—"}
                </div>
              </div>
            )}
            <div className="mt-4 max-w-md">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Event Goal</label>
              <select className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={profile.raceGoal ?? defaultProfile.raceGoal} onChange={(e) => updateRaceGoal(e.target.value)}>
                {raceGoalOptions.map((goal) => (
                  <option key={goal.value} value={goal.value}>
                    {goal.label}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* Tab 2: Training */}
        {activeTab === "training" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Training Baseline</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">Baseline Fitness</span>
                <select className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={profile.baselineFitness ?? defaultProfile.baselineFitness} onChange={(e) => updateBaselineFitness(e.target.value)}>
                  {baselineFitnessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">Current Training Days Per Week</span>
                <input type="number" min="0" max="14" className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={profile.currentTrainingDaysPerWeek ?? 0} onChange={(e) => updateTrainingMetric("currentTrainingDaysPerWeek", e.target.value)} />
              </label>
            </div>
          </section>
        )}

        {/* Tab 3: Preferences */}
        {activeTab === "preferences" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Training Preferences</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-700">Training Style</span>
                <select className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={profile.trainingStylePreference ?? defaultProfile.trainingStylePreference} onChange={(e) => updateTrainingPreference("trainingStylePreference", e.target.value)}>
                  {repetitionToleranceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        )}

        {/* Tab 4: Constraints */}
        {activeTab === "constraints" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Training Constraints</h2>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" className="rounded border-zinc-300" checked={profile.hasAccessToHills === true} onChange={(e) => setProfile((p) => ({ ...p, hasAccessToHills: e.target.checked }))} />
                <span className="text-sm font-medium text-zinc-700">Has access to hills</span>
              </label>
            </div>
          </section>
        )}

        {/* Tab 5: Schedule */}
        {activeTab === "schedule" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Holiday Schedule</h2>
            <div className="mt-4 space-y-4">
              {holidayEvents.map((event, i) => (
                <div key={i} className="flex gap-3 rounded-xl border border-zinc-200 p-4">
                  <div className="flex-1 space-y-2">
                    <label className="block text-sm font-medium text-zinc-700">Start Date</label>
                    <input type="date" className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={event.start_date} onChange={(e) => updateHolidayEvent(i, "start_date", e.target.value)} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="block text-sm font-medium text-zinc-700">End Date</label>
                    <input type="date" className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={event.end_date} onChange={(e) => updateHolidayEvent(i, "end_date", e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tab 6: Prep Races */}
        {activeTab === "races" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Preparation Races</h2>
            <div className="mt-4 space-y-4">
              <input type="text" placeholder="Search races..." className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={prepRaceSearchQuery} onChange={(e) => { setPrepRaceSearchQuery(e.target.value); searchPreparationRaces(e.target.value); }} />
              {prepRaceSearchResults.map((race) => (
                <button key={race.id} onClick={() => selectPrepRace(race)} className="w-full text-left rounded-xl border border-zinc-200 p-4 hover:bg-zinc-50">
                  {race.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Tab 7: Race History */}
        {activeTab === "history" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Race History</h2>
            <p className="mt-2 text-sm text-zinc-600">Track your past race performances</p>
          </section>
        )}

        {/* Tab 8: Health */}
        {activeTab === "health" && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Medical Clearance</h2>
            <div className="mt-4 max-w-md">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Medical Clearance Date</label>
              <input type="date" className="w-full rounded-xl border border-zinc-300 px-4 py-3" value={medicalClearanceDate} onChange={(e) => setMedicalClearanceDate(e.target.value)} />
              {medicalClearanceDate && <p className="mt-2 text-sm text-emerald-700">✓ Cleared on {new Date(medicalClearanceDate).toLocaleDateString()}</p>}
            </div>
          </section>
        )}

        {/* Save Button */}
        <div className="flex gap-3">
          <button onClick={() => void handleSave()} disabled={isSaving} className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
          <Link href="/create-plan" className="rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold hover:bg-zinc-100">
            Continue to Plan
          </Link>
        </div>
      </div>
    </main>
  );
}

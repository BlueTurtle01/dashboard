import { createClient } from "@/lib/supabase/client";

function getSupabase() {
  return createClient();
}

export type AthleteEventProfile = {
  heatAccess: string;
  saunaAccess: boolean;
  packTraining: boolean;
  backToBack: string;
  sandAccess: boolean;
};

export type PreparationRace = {
  name: string;
  eventDate: string;
};

export type AthleteProfile = {
  tempUserKey?: string;
  equipmentUnavailable: string[];
  equipmentAvoid: string[];
  blockedDates: string[];
  eventType?: string;
  selectedEventId: string;
  eventLocked?: boolean;
  raceGoal?: string;
  baselineFitness?: string;
  currentTrainingDaysPerWeek?: number;
  availableTrainingDaysPerWeek?: number;
  weeklyTrainingHours?: number;
  longestRecentSessionMinutes?: number;
  trainingConsistencyWeeks?: number;
  recentBreakWeeks?: number;
  backToBackSessionsCompleted?: boolean;
  maxBackToBackDays?: number;
  loadCarriageExperience?: boolean;
  hasAccessToHills?: boolean | "";
  preparationRacesEntered?: PreparationRace[];
  selectedPreparationRaceIds?: string[];
  sessionsEnjoy?: string[];
  sessionsAvoid?: string[];
  trainingStylePreference?: string;
  pacingStyle?: string;
  preferredLongSessionDay?: string;
  availableGymDays?: string[];
  availableRunDays?: string[];
  selectedTags?: string[];
  eventProfile: AthleteEventProfile;
  completedTabs?: string[];
  profileSubmittedAt?: string | null;
};

type AthleteProfileRow = {
  id: string;
  user_id: string;
  temp_user_key: string | null;
  blocked_dates: string[] | null;
  selected_event_id: string | null;
  event_locked: boolean | null;
  race_goal: string | null;
  baseline_fitness: string | null;
  current_training_days_per_week: number | null;
  available_training_days_per_week: number | null;
  weekly_training_hours: number | null;
  longest_recent_session_minutes: number | null;
  training_consistency_weeks: number | null;
  recent_break_weeks: number | null;
  back_to_back_sessions_completed: boolean | null;
  max_back_to_back_days: number | null;
  load_carriage_experience: boolean | null;
  has_access_to_hills: boolean | null;
  preparation_races_entered: PreparationRace[] | null;
  selected_preparation_race_ids: string[] | null;
  sessions_enjoy: string[] | null;
  sessions_avoid: string[] | null;
  training_style_preference: string | null;
  pacing_style: string | null;
  preferred_long_session_day: string | null;
  available_gym_days: string[] | null;
  available_run_days: string[] | null;
  tags: string[] | null;
  event_profile: AthleteEventProfile | null;
  completed_tabs: string[] | null;
  profile_submitted_at: string | null;
};

type EquipmentJoinRow = {
  equipment_options: { slug: string } | { slug: string }[] | null;
};

const DEFAULT_TEMP_USER_KEY = "test-user-1";

function normalisePreparationRaces(value: unknown): PreparationRace[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "object" && item !== null && "name" in item && "eventDate" in item) {
      const typed = item as PreparationRace;
      return [{ name: typed.name ?? "", eventDate: typed.eventDate ?? "" }];
    }

    if (typeof item === "string") {
      return [{ name: item, eventDate: "" }];
    }

    return [];
  });
}

function mapRowToProfile(
  row: AthleteProfileRow,
  equipmentUnavailable: string[],
  equipmentAvoid: string[],
): AthleteProfile {
  return {
    tempUserKey: row.temp_user_key ?? DEFAULT_TEMP_USER_KEY,
    equipmentUnavailable,
    equipmentAvoid,
    blockedDates: row.blocked_dates ?? [],
    selectedEventId: row.selected_event_id ?? "",
    eventLocked: row.event_locked ?? false,
    raceGoal: row.race_goal ?? "finish",
    baselineFitness: row.baseline_fitness ?? "beginner",
    currentTrainingDaysPerWeek: row.current_training_days_per_week ?? 0,
    availableTrainingDaysPerWeek: row.available_training_days_per_week ?? 0,
    weeklyTrainingHours: row.weekly_training_hours ?? 0,
    longestRecentSessionMinutes: row.longest_recent_session_minutes ?? 0,
    trainingConsistencyWeeks: row.training_consistency_weeks ?? 0,
    recentBreakWeeks: row.recent_break_weeks ?? 0,
    backToBackSessionsCompleted: row.back_to_back_sessions_completed ?? false,
    maxBackToBackDays: row.max_back_to_back_days ?? 0,
    loadCarriageExperience: row.load_carriage_experience ?? false,
    hasAccessToHills: row.has_access_to_hills ?? "",
    preparationRacesEntered: normalisePreparationRaces(row.preparation_races_entered),
    selectedPreparationRaceIds: row.selected_preparation_race_ids ?? [],
    sessionsEnjoy: row.sessions_enjoy ?? [],
    sessionsAvoid: row.sessions_avoid ?? [],
    trainingStylePreference: row.training_style_preference ?? "balanced",
    pacingStyle: row.pacing_style ?? "unknown",
    preferredLongSessionDay: row.preferred_long_session_day ?? "",
    availableGymDays: row.available_gym_days ?? [],
    availableRunDays: row.available_run_days ?? [],
    selectedTags: row.tags ?? [],
    eventProfile: {
      heatAccess: row.event_profile?.heatAccess ?? "none",
      saunaAccess: row.event_profile?.saunaAccess ?? false,
      packTraining: row.event_profile?.packTraining ?? false,
      backToBack: row.event_profile?.backToBack ?? "none",
      sandAccess: row.event_profile?.sandAccess ?? false,
    },
    completedTabs: row.completed_tabs ?? [],
    profileSubmittedAt: row.profile_submitted_at ?? null,
  };
}

function mapEquipmentRows(rows: EquipmentJoinRow[] | null | undefined): string[] {
  return (rows ?? [])
    .map((row) => {
      const option = Array.isArray(row.equipment_options)
        ? row.equipment_options[0] ?? null
        : row.equipment_options;

      return option?.slug ?? null;
    })
    .filter((value): value is string => Boolean(value));
}

async function getCurrentUserId(): Promise<string> {
  const supabase = getSupabase();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Failed to read auth session: ${sessionError.message}`);
  }

  const userId = session?.user?.id ?? null;

  if (!userId) {
    throw new Error("You must be signed in to load or save the athlete intake form.");
  }

  return userId;
}

export async function loadAthleteProfile(): Promise<AthleteProfile | null> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  const { data: profileData, error: profileError } = await supabase
    .from("athlete_profiles")
    .select(`
      id,
      user_id,
      temp_user_key,
      blocked_dates,
      selected_event_id,
      event_locked,
      race_goal,
      baseline_fitness,
      current_training_days_per_week,
      available_training_days_per_week,
      weekly_training_hours,
      longest_recent_session_minutes,
      training_consistency_weeks,
      recent_break_weeks,
      back_to_back_sessions_completed,
      max_back_to_back_days,
      load_carriage_experience,
      has_access_to_hills,
      preparation_races_entered,
      selected_preparation_race_ids,
      sessions_enjoy,
      sessions_avoid,
      training_style_preference,
      pacing_style,
      preferred_long_session_day,
      available_gym_days,
      available_run_days,
      tags,
      event_profile,
      completed_tabs,
      profile_submitted_at
    `)
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to load athlete profile: ${profileError.message}`);
  }

  if (!profileData) {
    return null;
  }

  const athleteId = (profileData as AthleteProfileRow).id;

  const [
    { data: unavailableData, error: unavailableError },
    { data: avoidData, error: avoidError },
  ] = await Promise.all([
    supabase
      .from("athlete_equipment_unavailable")
      .select(`equipment_options ( slug )`)
      .eq("athlete_profile_id", athleteId),
    supabase
      .from("athlete_equipment_avoid")
      .select(`equipment_options ( slug )`)
      .eq("athlete_profile_id", athleteId),
  ]);

  if (unavailableError) {
    throw new Error(`Failed to load unavailable equipment: ${unavailableError.message}`);
  }
  if (avoidError) {
    throw new Error(`Failed to load avoided equipment: ${avoidError.message}`);
  }

  return mapRowToProfile(
    profileData as AthleteProfileRow,
    mapEquipmentRows(unavailableData as EquipmentJoinRow[]),
    mapEquipmentRows(avoidData as EquipmentJoinRow[]),
  );
}

export async function saveAthleteProfile(profile: AthleteProfile): Promise<AthleteProfile> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();

  const profileRow = {
    user_id: userId,
    temp_user_key: profile.tempUserKey || null,
    blocked_dates: profile.blockedDates ?? [],
    selected_event_id: profile.selectedEventId || null,
    race_goal: profile.raceGoal ?? "finish",
    baseline_fitness: profile.baselineFitness ?? "beginner",
    current_training_days_per_week: profile.currentTrainingDaysPerWeek ?? 0,
    available_training_days_per_week: profile.availableTrainingDaysPerWeek ?? 0,
    weekly_training_hours: profile.weeklyTrainingHours ?? 0,
    longest_recent_session_minutes: profile.longestRecentSessionMinutes ?? 0,
    training_consistency_weeks: profile.trainingConsistencyWeeks ?? 0,
    recent_break_weeks: profile.recentBreakWeeks ?? 0,
    back_to_back_sessions_completed: profile.backToBackSessionsCompleted ?? false,
    max_back_to_back_days: profile.maxBackToBackDays ?? 0,
    load_carriage_experience: profile.loadCarriageExperience ?? false,
    has_access_to_hills:
      profile.hasAccessToHills === "" ? null : (profile.hasAccessToHills ?? null),
    preparation_races_entered: profile.preparationRacesEntered ?? [],
    selected_preparation_race_ids: profile.selectedPreparationRaceIds ?? [],
    sessions_enjoy: profile.sessionsEnjoy ?? [],
    sessions_avoid: profile.sessionsAvoid ?? [],
    training_style_preference: profile.trainingStylePreference ?? "balanced",
    pacing_style: profile.pacingStyle ?? "unknown",
    preferred_long_session_day: profile.preferredLongSessionDay || null,
    available_gym_days: profile.availableGymDays ?? [],
    available_run_days: profile.availableRunDays ?? [],
    tags: profile.selectedTags ?? [],
    event_profile: {
      heatAccess: profile.eventProfile?.heatAccess ?? "none",
      saunaAccess: profile.eventProfile?.saunaAccess ?? false,
      packTraining: profile.eventProfile?.packTraining ?? false,
      backToBack: profile.eventProfile?.backToBack ?? "none",
      sandAccess: profile.eventProfile?.sandAccess ?? false,
    },
    completed_tabs: profile.completedTabs ?? [],
    profile_submitted_at: profile.profileSubmittedAt ?? null,
  };

  const { data: upsertedProfile, error: profileError } = await supabase
    .from("athlete_profiles")
    .upsert(profileRow, { onConflict: "user_id" })
    .select(`
      id,
      user_id,
      temp_user_key,
      blocked_dates,
      selected_event_id,
      race_goal,
      baseline_fitness,
      current_training_days_per_week,
      available_training_days_per_week,
      weekly_training_hours,
      longest_recent_session_minutes,
      training_consistency_weeks,
      recent_break_weeks,
      back_to_back_sessions_completed,
      max_back_to_back_days,
      load_carriage_experience,
      has_access_to_hills,
      preparation_races_entered,
      selected_preparation_race_ids,
      sessions_enjoy,
      sessions_avoid,
      training_style_preference,
      pacing_style,
      preferred_long_session_day,
      available_gym_days,
      available_run_days,
      tags,
      event_profile,
      completed_tabs,
      profile_submitted_at
    `)
    .single();

  if (profileError) {
    throw new Error(`Failed to save athlete profile: ${profileError.message}`);
  }

  const athleteId = (upsertedProfile as AthleteProfileRow).id;

  const uniqueEquipmentSlugs = [
    ...new Set([...(profile.equipmentUnavailable ?? []), ...(profile.equipmentAvoid ?? [])]),
  ];

  const equipmentResponse =
    uniqueEquipmentSlugs.length > 0
      ? await supabase.from("equipment_options").select("id, slug").in("slug", uniqueEquipmentSlugs)
      : { data: [], error: null };

  if (equipmentResponse.error) {
    throw new Error(`Failed to load equipment options for save: ${equipmentResponse.error.message}`);
  }

  const equipmentIdBySlug = new Map(
    (equipmentResponse.data ?? []).map((row: { id: string; slug: string }) => [row.slug, row.id]),
  );

  const unavailableRows = (profile.equipmentUnavailable ?? [])
    .map((slug) => equipmentIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id))
    .map((equipmentId) => ({ athlete_profile_id: athleteId, equipment_option_id: equipmentId }));

  const avoidRows = (profile.equipmentAvoid ?? [])
    .map((slug) => equipmentIdBySlug.get(slug))
    .filter((id): id is string => Boolean(id))
    .map((equipmentId) => ({ athlete_profile_id: athleteId, equipment_option_id: equipmentId }));

  const [
    { error: deleteUnavailableError },
    { error: deleteAvoidError },
  ] = await Promise.all([
    supabase.from("athlete_equipment_unavailable").delete().eq("athlete_profile_id", athleteId),
    supabase.from("athlete_equipment_avoid").delete().eq("athlete_profile_id", athleteId),
  ]);

  if (deleteUnavailableError) {
    throw new Error(`Failed to clear unavailable equipment: ${deleteUnavailableError.message}`);
  }
  if (deleteAvoidError) {
    throw new Error(`Failed to clear avoided equipment: ${deleteAvoidError.message}`);
  }

  if (unavailableRows.length > 0) {
    const { error } = await supabase.from("athlete_equipment_unavailable").insert(unavailableRows);
    if (error) throw new Error(`Failed to save unavailable equipment: ${error.message}`);
  }

  if (avoidRows.length > 0) {
    const { error } = await supabase.from("athlete_equipment_avoid").insert(avoidRows);
    if (error) throw new Error(`Failed to save avoided equipment: ${error.message}`);
  }

  return mapRowToProfile(
    upsertedProfile as AthleteProfileRow,
    unavailableRows.length > 0 ? profile.equipmentUnavailable ?? [] : [],
    avoidRows.length > 0 ? profile.equipmentAvoid ?? [] : [],
  );
}

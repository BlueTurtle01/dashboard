type EnrollmentRow = {
  status: string;
  coaching_level: "none" | "limited" | "full";
  coach_user_id: string | null;
  chat_starts_at: string | null;
  chat_ends_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

function dateWindowIsActive(startsAt?: string | null, endsAt?: string | null) {
  const now = Date.now();
  if (startsAt && Date.parse(startsAt) > now) return false;
  if (endsAt && Date.parse(endsAt) < now) return false;
  return true;
}

export async function hasActiveCoachAthleteLink(
  supabase: any,
  coachUserId: string,
  athleteUserId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("coach_athlete_links")
    .select("coach_user_id")
    .eq("coach_user_id", coachUserId)
    .eq("athlete_user_id", athleteUserId)
    .eq("status", "active")
    .maybeSingle();

  return !error && Boolean(data);
}

export async function canUseCoachChat(
  supabase: any,
  coachUserId: string,
  athleteUserId: string
): Promise<boolean> {
  if (await hasActiveCoachAthleteLink(supabase, coachUserId, athleteUserId)) {
    return true;
  }

  const { data, error } = await supabase
    .from("plan_enrollments")
    .select("status, coaching_level, coach_user_id, chat_starts_at, chat_ends_at, starts_at, ends_at")
    .eq("user_id", athleteUserId)
    .in("coaching_level", ["limited", "full"]);

  if (error || !data) return false;

  return (data as EnrollmentRow[]).some((enrollment) => {
    if (enrollment.status !== "active") return false;
    if (enrollment.coach_user_id && enrollment.coach_user_id !== coachUserId) return false;

    if (enrollment.coaching_level === "full") {
      return dateWindowIsActive(enrollment.starts_at, enrollment.ends_at);
    }

    return dateWindowIsActive(enrollment.chat_starts_at, enrollment.chat_ends_at);
  });
}

export async function canAccessConversation(
  supabase: any,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("coach_user_id, athlete_user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return false;

  const isCoach = data.coach_user_id === userId;
  const isAthlete = data.athlete_user_id === userId;
  if (!isCoach && !isAthlete) return false;

  return canUseCoachChat(supabase, data.coach_user_id, data.athlete_user_id);
}

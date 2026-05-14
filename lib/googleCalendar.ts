import { createClient } from "@/lib/supabase/server";
import { getDayOrderIndex } from "@/lib/planner/dayLabels";
import type { GeneratedPlan, PlanSession, PlanWeek } from "@/lib/planner/types";

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
  id_token?: string;
};

export type GoogleUserInfo = {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
};

type AthleteIntegration = {
  id: string;
  user_id: string;
  provider: string;
  provider_account_id: string | null;
  provider_username: string | null;
  provider_firstname: string | null;
  provider_lastname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[] | null;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

export function getGoogleCalendarAuthorizeUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/google-calendar/callback`,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: userId,
    include_granted_scopes: "true",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCodeForToken(code: string): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/google-calendar/callback`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange Google code: ${await response.text()}`);
  }

  return response.json();
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Google token: ${await response.text()}`);
  }

  return response.json();
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google profile: ${await response.text()}`);
  }

  return response.json();
}

export async function getValidGoogleCalendarAccessToken(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: integration, error } = await supabase
    .from("athlete_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "google_calendar")
    .eq("is_active", true)
    .single();

  if (error || !integration) {
    throw new Error("No active Google Calendar integration found");
  }

  const typedIntegration = integration as AthleteIntegration;
  const expiresAt = new Date(typedIntegration.expires_at).getTime();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt > Date.now() + bufferMs) {
    return typedIntegration.access_token;
  }

  const refreshed = await refreshGoogleAccessToken(typedIntegration.refresh_token);
  const nextRefreshToken = refreshed.refresh_token ?? typedIntegration.refresh_token;

  const { error: updateError } = await supabase
    .from("athlete_integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: nextRefreshToken,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      scopes: refreshed.scope ? refreshed.scope.split(" ") : typedIntegration.scopes ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", typedIntegration.id);

  if (updateError) {
    console.error("Failed to update Google Calendar token:", updateError);
  }

  return refreshed.access_token;
}

export function findSessionInPlan(
  plan: GeneratedPlan,
  sessionId: string,
): { week: PlanWeek; session: PlanSession } | null {
  for (const week of plan.weeks) {
    const session = week.sessions.find((item) => item.id === sessionId);
    if (session) return { week, session };
  }
  return null;
}

export function getSessionDate(plan: GeneratedPlan, week: PlanWeek, session: PlanSession): string | null {
  if (!plan.startDate) return null;
  const dayIndex = getDayOrderIndex(session.dayLabel);
  if (dayIndex < 0) return null;

  const start = new Date(`${plan.startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;

  start.setUTCDate(start.getUTCDate() + (week.weekNumber - 1) * 7 + dayIndex);
  return start.toISOString().slice(0, 10);
}

function addOneDay(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function formatSessionDescription(plan: GeneratedPlan, week: PlanWeek, session: PlanSession) {
  const lines = [
    plan.eventName ? `Plan: ${plan.eventName}` : "",
    `Week ${week.weekNumber}${week.focus ? `: ${week.focus}` : ""}`,
    session.duration ? `Duration: ${session.duration}` : "",
    session.intensity ? `Intensity: ${session.intensity}` : "",
    session.description ? `\n${session.description}` : "",
    session.reason ? `\nWhy: ${session.reason}` : "",
    session.terrain ? `Terrain: ${session.terrain}` : "",
    session.elevationGainMeters ? `Elevation: ${session.elevationGainMeters}m` : "",
    session.packWeightKg ? `Pack weight: ${session.packWeightKg}kg` : "",
    session.strides ? `Strides: ${session.strides}` : "",
    session.warmupMinutes ? `Warm-up: ${session.warmupMinutes} min` : "",
    session.cooldownMinutes ? `Cool-down: ${session.cooldownMinutes} min` : "",
    session.intervalReps ? `Intervals: ${session.intervalReps} x ${session.intervalDuration || "set"}` : "",
    session.exercises?.length
      ? `\nExercises:\n${session.exercises
          .map((exercise, index) => {
            const parts = [
              `${index + 1}. ${exercise.name}`,
              exercise.sets ? `${exercise.sets} sets` : "",
              exercise.reps ? `${exercise.reps} reps` : "",
              exercise.durationSeconds ? `${exercise.durationSeconds}s` : "",
            ].filter(Boolean);
            return parts.join(" - ");
          })
          .join("\n")}`
      : "",
    "\nCreated from Endurance Planner.",
  ];

  return lines.filter(Boolean).join("\n");
}

export function buildGoogleCalendarEvent(plan: GeneratedPlan, week: PlanWeek, session: PlanSession) {
  const sessionDate = getSessionDate(plan, week, session);
  if (!sessionDate) {
    throw new Error("This session does not have a calendar date. Check the plan start date and session day.");
  }

  return {
    summary: session.name || "Training session",
    description: formatSessionDescription(plan, week, session),
    start: { date: sessionDate },
    end: { date: addOneDay(sessionDate) },
    transparency: "transparent",
    extendedProperties: {
      private: {
        endurancePlannerSessionId: session.id,
        endurancePlannerWeekId: week.id,
      },
    },
  };
}

export async function insertGoogleCalendarEvent(accessToken: string, event: Record<string, unknown>) {
  const response = await fetch(`${GOOGLE_CALENDAR_API_BASE}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Google Calendar event: ${await response.text()}`);
  }

  return response.json();
}

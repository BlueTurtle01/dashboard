"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

type SessionStretch = {
  id: string;
  name: string;
  description: string;
  holdDurationSeconds: number | null;
  notes: string;
  sortOrder: number;
};

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [session, setSession] = useState<PlanSession | null>(null);
  const [stretches, setStretches] = useState<SessionStretch[]>([]);
  const [exerciseMedia, setExerciseMedia] = useState<Map<string, { photoUrl: string | null; videoUrl: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarSending, setCalendarSending] = useState(false);

  useEffect(() => {
    const fetchSessionDetails = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }

        const { data: planData, error: queryError } = await supabase
          .from("athlete_plans")
          .select("plan_json")
          .eq("athlete_user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queryError || !planData?.plan_json) {
          setError("Failed to load plan");
          setLoading(false);
          return;
        }

        const loadedPlan = planData.plan_json as GeneratedPlan;
        setPlan(loadedPlan);

        // Find the session in the plan
        let foundSession: PlanSession | null = null;
        for (const week of loadedPlan.weeks) {
          const s = week.sessions.find((sess) => sess.id === sessionId);
          if (s) {
            foundSession = s;
            break;
          }
        }

        if (!foundSession) {
          setError("Session not found in your plan");
          setLoading(false);
          return;
        }

        setSession(foundSession);

        // Fetch media for exercises that have an exerciseId
        const exerciseIds = foundSession.exercises
          .map((ex) => ex.exerciseId)
          .filter((id): id is string => !!id);

        if (exerciseIds.length > 0) {
          const { data: mediaRows } = await supabase
            .from("exercises")
            .select("id, photo_url, video_url")
            .in("id", exerciseIds);

          if (mediaRows) {
            const mediaMap = new Map<string, { photoUrl: string | null; videoUrl: string | null }>();
            for (const row of mediaRows as { id: string; photo_url: string | null; video_url: string | null }[]) {
              mediaMap.set(row.id, { photoUrl: row.photo_url, videoUrl: row.video_url });
            }
            setExerciseMedia(mediaMap);
          }
        }

        // Fetch stretches if this session has a mobilitySessionId
        const mobilitySessionId = (foundSession as any).mobilitySessionId;
        if (mobilitySessionId) {
          const { data: stretchData } = await supabase
            .from("mobility_session_stretches")
            .select("id, sort_order, hold_duration_seconds, notes, stretches(id, name, description)")
            .eq("mobility_session_id", mobilitySessionId)
            .order("sort_order");

          if (stretchData) {
            setStretches(stretchData.map((row: any) => ({
              id: row.id,
              name: row.stretches?.name ?? "Unknown stretch",
              description: row.stretches?.description ?? "",
              holdDurationSeconds: row.hold_duration_seconds ?? null,
              notes: row.notes ?? "",
              sortOrder: row.sort_order,
            })));
          }
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred while loading session details");
        setLoading(false);
      }
    };

    fetchSessionDetails();
  }, [sessionId]);

  const getSessionColor = (type: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      Long: { bg: "bg-blue-100", text: "text-blue-900" },
      Steady: { bg: "bg-amber-100", text: "text-amber-900" },
      Easy: { bg: "bg-white", text: "text-zinc-700" },
      Recovery: { bg: "bg-emerald-100", text: "text-emerald-900" },
      Gym: { bg: "bg-violet-100", text: "text-violet-900" },
      Rest: { bg: "bg-zinc-100", text: "text-zinc-900" },
      Loaded: { bg: "bg-amber-200", text: "text-amber-900" },
      Recce: { bg: "bg-green-200", text: "text-green-900" },
      Navigation: { bg: "bg-blue-200", text: "text-blue-900" },
    };
    return colors[type] || { bg: "bg-zinc-100", text: "text-zinc-700" };
  };

  async function sendToGoogleCalendar() {
    try {
      setCalendarSending(true);
      setError(null);

      const response = await fetch("/api/google-calendar/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "single", sessionId }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Could not send session to Google Calendar");

      alert("Session sent to Google Calendar.");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setCalendarSending(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading session details…</p>
        </div>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-2xl space-y-4">
          <Link
            href="/plan"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
          >
            ← Back to plan
          </Link>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h1 className="text-xl font-bold text-red-900">Error</h1>
            <p className="mt-2 text-red-700">{error || "Session not found"}</p>
          </div>
        </div>
      </main>
    );
  }

  const color = getSessionColor(session.type);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/plan"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
        >
          ← Back to plan
        </Link>

        <div className={`rounded-3xl border-2 ${color.bg} p-8 shadow-sm`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900">{session.name}</h1>
              <p className="mt-2 text-zinc-600">{session.dayLabel}</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className={`px-4 py-2 rounded-xl font-semibold ${color.bg} ${color.text}`}>
                {session.type}
              </div>
              <button
                type="button"
                onClick={() => void sendToGoogleCalendar()}
                disabled={calendarSending}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {calendarSending ? "Sending..." : "Send to Google Calendar"}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Duration
            </p>
            <p className="mt-3 text-2xl font-bold text-zinc-900">{session.duration}</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Intensity
            </p>
            <p className="mt-3 text-2xl font-bold text-zinc-900">{session.intensity}</p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Type
            </p>
            <p className="mt-3 text-lg font-semibold text-zinc-900">{session.type}</p>
            {session.isKeySession && (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                ⭐ Key session
              </p>
            )}
          </div>
        </div>

        {session.description && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-zinc-900">Description</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">
              {session.description}
            </p>
          </div>
        )}

        {(session as any).reason && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h2 className="font-semibold text-emerald-900">Why This Session</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-emerald-700">
              {(session as any).reason}
            </p>
          </div>
        )}

        {session.tags && session.tags.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-zinc-900">Tags</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {session.tags.map((tag, idx) => (
                <span
                  key={`session-tag-${idx}`}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Session Attributes */}
        {(() => {
          const s = session as any;
          const details = [
            { label: "Activity", value: s.activity, format: (v: any) => v },
            { label: "Session Type", value: s.subtype, format: (v: any) => v },
            { label: "Terrain", value: s.terrain, format: (v: any) => v },
            { label: "Distance", value: s.distance, format: (v: any) => `${v} km` },
            { label: "Elevation Gain", value: s.elevationGainMeters, format: (v: any) => `${v}m` },
            { label: "Pack Weight", value: s.packWeightKg, format: (v: any) => `${v}kg` },
            { label: "Strides", value: s.strides, format: (v: any) => v },
            { label: "Warm-up", value: s.warmupMinutes, format: (v: any) => `${v} min` },
            { label: "Cool-down", value: s.cooldownMinutes, format: (v: any) => `${v} min` },
            { label: "Intervals", value: s.intervalReps, format: (v: any) => `${v} sets` },
            { label: "Interval Duration", value: s.intervalDuration, format: (v: any) => v },
            { label: "Rest Between Sets", value: s.intervalRestSeconds, format: (v: any) => `${v}s` },
            { label: "Time Up", value: s.timeUpSeconds, format: (v: any) => `${v}s` },
            { label: "Time Down", value: s.timeDownSeconds, format: (v: any) => `${v}s` },
          ].filter(({ value }) => value);

          if (details.length === 0) return null;

          return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-zinc-900">Session Details</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {details.map(({ label, value, format }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
                    <p className="mt-1 text-sm font-medium text-zinc-900 capitalize">{format(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {stretches.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-zinc-900">Stretches</h2>
            <div className="mt-4 space-y-3">
              {stretches.map((stretch, idx) => (
                <div key={stretch.id} className="flex items-start gap-4 border-l-4 border-emerald-300 pl-4 py-1">
                  <div className="flex-1">
                    <p className="font-semibold text-zinc-900">{idx + 1}. {stretch.name}</p>
                    {stretch.description && (
                      <p className="mt-1 text-sm text-zinc-600">{stretch.description}</p>
                    )}
                    {stretch.holdDurationSeconds && (
                      <p className="mt-0.5 text-xs text-zinc-500">Hold: {stretch.holdDurationSeconds}s</p>
                    )}
                    {stretch.notes && (
                      <p className="mt-0.5 text-xs text-zinc-500">{stretch.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {session.exercises && session.exercises.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-zinc-900">Exercises</h2>
            <div className="mt-4 space-y-4">
              {session.exercises.map((exercise, idx) => (
                <div
                  key={exercise.id}
                  className="border-l-4 border-zinc-300 pl-4 py-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {idx + 1}. {exercise.name}
                      </p>
                      {exercise.description && (
                        <p className="mt-1 text-sm text-zinc-600">
                          {exercise.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-zinc-500">
                    {exercise.sets && (
                      <p>
                        <span className="font-semibold">Sets:</span> {exercise.sets}
                      </p>
                    )}
                    {exercise.reps && (
                      <p>
                        <span className="font-semibold">Reps:</span> {exercise.reps}
                      </p>
                    )}
                    {exercise.durationSeconds && (
                      <p>
                        <span className="font-semibold">Duration:</span>{" "}
                        {Math.round(exercise.durationSeconds / 60)} min
                      </p>
                    )}
                  </div>

                  {exercise.equipment && exercise.equipment.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {exercise.equipment.map((eq, eqIdx) => (
                        <span
                          key={`${exercise.id}-equipment-${eqIdx}`}
                          className="text-xs rounded-full bg-blue-100 px-2 py-0.5 text-blue-700"
                        >
                          {eq}
                        </span>
                      ))}
                    </div>
                  )}

                  {exercise.tags && exercise.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {exercise.tags.map((tag, tagIdx) => (
                        <span
                          key={`${exercise.id}-tag-${tagIdx}`}
                          className="text-xs rounded bg-zinc-100 px-2 py-0.5 text-zinc-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {exercise.exerciseId && exerciseMedia.get(exercise.exerciseId)?.videoUrl && (
                    <div className="mt-3">
                      {isDirectVideoUrl(exerciseMedia.get(exercise.exerciseId)!.videoUrl!) ? (
                        <video
                          src={exerciseMedia.get(exercise.exerciseId)!.videoUrl!}
                          controls
                          className="w-full rounded-xl border border-zinc-200"
                          style={{ maxHeight: "280px" }}
                        />
                      ) : (
                        <a
                          href={exerciseMedia.get(exercise.exerciseId)!.videoUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                        >
                          Watch video ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function isDirectVideoUrl(url: string) {
  return url.includes("supabase.co") || /\.(mp4|webm|mov|avi)(\?|$)/i.test(url);
}

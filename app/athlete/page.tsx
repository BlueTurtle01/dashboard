"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_FULL_NAMES: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

interface SessionCompletion {
  id: string;
  session_id: string;
  week_number: number;
  perceived_effort: number | null;
  notes: string | null;
  completed_at: string;
}

function getMondayOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const jsDay = copy.getDay(); // Sun=0
  const diff = jsDay === 0 ? -6 : 1 - jsDay; // Monday start
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getPlanWeekStartDates(plan: GeneratedPlan) {
  try {
    if (!plan.eventDate) {
      console.warn("Plan has no eventDate");
      return [];
    }

    let eventDate = new Date(plan.eventDate);
    if (isNaN(eventDate.getTime()) && plan.eventDate.includes("T")) {
      const dateOnly = plan.eventDate.split("T")[0];
      eventDate = new Date(dateOnly);
    }

    if (isNaN(eventDate.getTime())) {
      console.error("Invalid eventDate format:", plan.eventDate);
      return [];
    }

    const eventWeekMonday = getMondayOfWeek(eventDate);
    const weeksAvailable = typeof plan.weeksAvailable === "number" ? plan.weeksAvailable : plan.weeks?.length ?? 0;
    const firstWeekMonday = addDays(eventWeekMonday, -(Math.max(weeksAvailable - 1, 0) * 7));

    return plan.weeks
      .slice()
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((week, index) => {
        const monday = addDays(firstWeekMonday, index * 7);
        return {
          weekId: week.id,
          weekNumber: week.weekNumber,
          monday: isNaN(monday.getTime()) ? new Date() : monday,
        };
      })
      .filter((w) => !isNaN(w.monday.getTime()));
  } catch (error) {
    console.error("Error computing plan week start dates:", error);
    return [];
  }
}

function getSessionColorClass(type: string): string {
  const colors: Record<string, string> = {
    Long: "bg-blue-100 text-blue-900",
    Steady: "bg-amber-100 text-amber-900",
    Easy: "bg-white text-zinc-700 border border-zinc-300",
    Recovery: "bg-emerald-100 text-emerald-900",
    Gym: "bg-violet-100 text-violet-900",
    Rest: "bg-zinc-100 text-zinc-900",
    Loaded: "bg-amber-200 text-amber-900",
    Recce: "bg-green-200 text-green-900",
    Navigation: "bg-blue-200 text-blue-900",
  };
  return colors[type] || "bg-zinc-100 text-zinc-700";
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isDateInHolidayRange(date: Date, ranges: Array<{ start: string; end: string }>): boolean {
  const dateStr = date.toISOString().split("T")[0];
  return ranges.some((range) => dateStr >= range.start && dateStr <= range.end);
}

export default function AthletePage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [displayWeekIndex, setDisplayWeekIndex] = useState(0);
  const [completions, setCompletions] = useState<Map<string, SessionCompletion>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holidayDateRanges, setHolidayDateRanges] = useState<Array<{ start: string; end: string }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [calendarSubmitting, setCalendarSubmitting] = useState<string | null>(null);
  const [perceivedEffort, setPerceivedEffort] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }

        const { data: planData, error: planError } = await supabase
          .from("athlete_plans")
          .select("id, plan_json")
          .eq("athlete_user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planError) {
          setError("Failed to load plan");
          setLoading(false);
          return;
        }

        if (!planData?.plan_json) {
          setPlan(null);
          setLoading(false);
          return;
        }

        const loadedPlan = planData.plan_json as GeneratedPlan;
        setPlan(loadedPlan);
        setPlanId(planData.id);

        // Jump to current week by finding which week contains today
        const weekStarts = getPlanWeekStartDates(loadedPlan);
        let currentWeekIdx = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < weekStarts.length; i++) {
          const weekStart = weekStarts[i].monday;
          const weekEnd = addDays(weekStart, 6);
          if (today >= weekStart && today <= weekEnd) {
            currentWeekIdx = i;
            break;
          }
          // If today is before the week start, use the first week
          if (today < weekStart) {
            currentWeekIdx = 0;
            break;
          }
          // If we're past this week, update currentWeekIdx
          currentWeekIdx = i;
        }

        setDisplayWeekIndex(Math.min(currentWeekIdx, loadedPlan.weeks.length - 1));

        const { data: completionsData } = await supabase
          .from("session_completions")
          .select("*")
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planData.id);

        if (completionsData) {
          const completionMap = new Map<string, SessionCompletion>();
          completionsData.forEach((completion) => {
            completionMap.set(completion.session_id, completion as SessionCompletion);
          });
          setCompletions(completionMap);
        }

        // Fetch holidays
        const { data: eventsData } = await supabase
          .from("athlete_events")
          .select("id, start_date, end_date, title")
          .eq("athlete_user_id", user.id)
          .eq("event_type", "holiday");

        if (eventsData) {
          const ranges = eventsData
            .filter((e) => e.start_date && e.end_date)
            .map((e) => ({ start: e.start_date, end: e.end_date }));
          setHolidayDateRanges(ranges);
        }

        setLoading(false);
      } catch {
        setError("An error occurred while loading");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogCompletion = async (sessionId: string, alternativeSessionId?: string) => {
    if (perceivedEffort === null) {
      setError("Please select an effort level");
      return;
    }

    if (!plan || !planId) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const displayWeek = plan.weeks[displayWeekIndex];

      if (!user || !displayWeek) return;

      if (alternativeSessionId && completions.has(alternativeSessionId)) {
        const { error: deleteError } = await supabase
          .from("session_completions")
          .delete()
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planId)
          .eq("session_id", alternativeSessionId);

        if (deleteError) {
          setError("Failed to update completion");
          return;
        }
      }

      const completedAt = new Date().toISOString();
      const { error: upsertError } = await supabase
        .from("session_completions")
        .upsert(
          {
            athlete_user_id: user.id,
            plan_id: planId,
            session_id: sessionId,
            week_number: displayWeek.weekNumber,
            perceived_effort: perceivedEffort,
            notes: notes || null,
            completed_at: completedAt,
          },
          { onConflict: "athlete_user_id,session_id" }
        );

      if (upsertError) {
        setError("Failed to log session");
        return;
      }

      setCompletions((current) => {
        const next = new Map(current);
        if (alternativeSessionId) next.delete(alternativeSessionId);
        next.set(sessionId, {
          id: sessionId,
          session_id: sessionId,
          week_number: displayWeek.weekNumber,
          perceived_effort: perceivedEffort,
          notes: notes || null,
          completed_at: completedAt,
        });
        return next;
      });

      setSelectedSessionId(null);
      setPerceivedEffort(null);
      setNotes("");
      setError(null);
    } catch {
      setError("An error occurred while saving");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveCompletion = async (sessionId: string) => {
    if (!planId) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const { error: deleteError } = await supabase
        .from("session_completions")
        .delete()
        .eq("athlete_user_id", user.id)
        .eq("plan_id", planId)
        .eq("session_id", sessionId);

      if (deleteError) {
        setError("Failed to unlog session");
        return;
      }

      setCompletions((current) => {
        const next = new Map(current);
        next.delete(sessionId);
        return next;
      });

      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }

      setError(null);
    } catch {
      setError("An error occurred while updating the session");
    } finally {
      setSubmitting(false);
    }
  };

  const sendSessionsToCalendar = async (input: { sessionId?: string; mode?: "single" | "all" }) => {
    try {
      setCalendarSubmitting(input.mode === "all" ? "all" : input.sessionId ?? null);
      setError(null);

      const response = await fetch("/api/google-calendar/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Could not send to Google Calendar");

      const failedText = data.failedCount ? ` (${data.failedCount} failed)` : "";
      alert(`Sent ${data.createdCount} session${data.createdCount === 1 ? "" : "s"} to Google Calendar${failedText}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setCalendarSubmitting(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading plan…</p>
        </div>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-red-700">{error || "No plan found. Ask your coach to create one."}</p>
        </div>
      </main>
    );
  }

  const displayWeek = plan.weeks[displayWeekIndex];
  if (!displayWeek) return null;

  const totalCount = displayWeek.sessions.filter((session) => session.type !== "Rest").length;
  const completedCount = displayWeek.sessions.filter(
    (session) => session.type !== "Rest" && completions.has(session.id)
  ).length;

  // Get week start date from computed week starts
  const weekStarts = getPlanWeekStartDates(plan);
  const weekStartMonday = weekStarts[displayWeekIndex]?.monday;
  let weekRangeLabel = "";
  if (weekStartMonday) {
    const sunday = addDays(weekStartMonday, 6);
    weekRangeLabel = `${formatDate(weekStartMonday)} – ${formatDate(sunday)}`;
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Week header + navigation */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold">{plan.eventName ?? "Training Plan"}</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Week {displayWeek.weekNumber} · {displayWeek.phase}
                {weekRangeLabel && <> · {weekRangeLabel}</>}
                <> · {completedCount} of {totalCount} sessions complete</>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => void sendSessionsToCalendar({ mode: "all" })}
                disabled={calendarSubmitting !== null}
                className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {calendarSubmitting === "all" ? "Sending..." : "Send All"}
              </button>
              <button
                onClick={() => setDisplayWeekIndex(Math.max(0, displayWeekIndex - 1))}
                disabled={displayWeekIndex === 0}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setDisplayWeekIndex(Math.min(plan.weeks.length - 1, displayWeekIndex + 1))}
                disabled={displayWeekIndex === plan.weeks.length - 1}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
          {displayWeek.focus && (
            <p className="mt-3 text-sm text-zinc-600">{displayWeek.focus}</p>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Day-by-day list */}
        <div className="space-y-6">
          {DAY_LABELS.map((dayLabel, dayIndex) => {
            const daySessions = displayWeek.sessions.filter(
              (s) => s.dayLabel === dayLabel && s.type !== "Rest"
            );
            const hasRest = displayWeek.sessions.some(
              (s) => s.dayLabel === dayLabel && s.type === "Rest"
            );

            let dayDate: Date | null = null;
            if (weekStartMonday) {
              dayDate = addDays(weekStartMonday, dayIndex);
            }

            const dateLabel = dayDate ? formatDate(dayDate) : "";
            const isHoliday = dayDate && isDateInHolidayRange(dayDate, holidayDateRanges);

            return (
              <div key={dayLabel}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="min-w-0">
                    <span className={`font-semibold ${isHoliday ? "text-orange-600" : "text-zinc-900"}`}>
                      {DAY_FULL_NAMES[dayLabel]}
                    </span>
                    {dateLabel && (
                      <span className={`ml-2 text-sm ${isHoliday ? "text-orange-500" : "text-zinc-500"}`}>
                        {dateLabel}
                        {isHoliday && <span className="ml-2 inline-block px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-900">Holiday</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 border-t border-zinc-200" />
                </div>

                {/* Sessions */}
                {daySessions.length > 0 ? (
                  <div className="space-y-3">
                    {daySessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        isCompleted={completions.has(session.id)}
                        completion={completions.get(session.id)}
                        isSelected={selectedSessionId === session.id}
                        onSelectToggle={() =>
                          completions.has(session.id)
                            ? void handleRemoveCompletion(session.id)
                            : setSelectedSessionId(selectedSessionId === session.id ? null : session.id)
                        }
                        isSubmitting={submitting}
                        perceivedEffort={perceivedEffort}
                        setPerceivedEffort={setPerceivedEffort}
                        notes={notes}
                        setNotes={setNotes}
                        onLogCompletion={() => {
                          const alternativeSession = displayWeek.sessions.find((candidate) => {
                            if (candidate.id === session.id) return false;
                            if (candidate.dayLabel !== session.dayLabel) return false;
                            const sessionIsAlternative = session.isInsertedAlternative === true;
                            const candidateIsAlternative = candidate.isInsertedAlternative === true;
                            return sessionIsAlternative !== candidateIsAlternative;
                          });
                          void handleLogCompletion(session.id, alternativeSession?.id);
                        }}
                        onSendToCalendar={() => sendSessionsToCalendar({ mode: "single", sessionId: session.id })}
                        isSendingToCalendar={calendarSubmitting === session.id}
                      />
                    ))}
                  </div>
                ) : hasRest ? (
                  <p className="text-sm text-zinc-400 pl-1">Rest</p>
                ) : (
                  <p className="text-sm text-zinc-400 pl-1">Rest</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

interface SessionCardProps {
  session: PlanSession;
  isCompleted: boolean;
  completion: SessionCompletion | undefined;
  isSelected: boolean;
  onSelectToggle: () => void;
  isSubmitting: boolean;
  perceivedEffort: number | null;
  setPerceivedEffort: (value: number) => void;
  notes: string;
  setNotes: (value: string) => void;
  onLogCompletion: () => void;
  onSendToCalendar: () => void;
  isSendingToCalendar: boolean;
}

function SessionCard({
  session,
  isCompleted,
  completion,
  isSelected,
  onSelectToggle,
  isSubmitting,
  perceivedEffort,
  setPerceivedEffort,
  notes,
  setNotes,
  onLogCompletion,
  onSendToCalendar,
  isSendingToCalendar,
}: SessionCardProps) {
  return (
    <div className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        {/* Completion indicator */}
        <button
          type="button"
          onClick={onSelectToggle}
          disabled={isSubmitting}
          aria-label={isCompleted ? "Remove session completion" : "Log session completion"}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            isCompleted
              ? "border-emerald-500 bg-emerald-100 hover:bg-emerald-50"
              : "border-zinc-300 hover:border-zinc-400"
          }`}
        >
          {isCompleted && <span className="text-emerald-600 text-xs font-bold">✓</span>}
        </button>

        <div className="flex-1 min-w-0">
          {/* Badges + name row */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${getSessionColorClass(session.type)}`}
            >
              {session.type}
            </span>
            {session.isKeySession && (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-900">
                Key
              </span>
            )}
            {session.isInsertedAlternative && (
              <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-900">
                Alternative
              </span>
            )}
            <span className="font-semibold text-zinc-900">{session.name}</span>
          </div>

          {/* Meta line */}
          <p className="mt-1 text-sm text-zinc-500">
            {session.duration}
            {session.intensity ? ` · ${session.intensity}` : ""}
            {session.activity ? ` · ${session.activity}` : ""}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSendToCalendar}
              disabled={isSendingToCalendar}
              className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingToCalendar ? "Sending..." : "Send to Google Calendar"}
            </button>
            <Link
              href={`/athlete/session/${encodeURIComponent(session.id)}`}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              View details
            </Link>
          </div>

          {isCompleted && completion && (
            <div className="mt-2 text-xs text-zinc-500">
              <p>Effort: {completion.perceived_effort}/10</p>
              {completion.notes && <p className="mt-1">Notes: {completion.notes}</p>}
            </div>
          )}

          {/* Description */}
          {session.description && (
            <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
              {session.description}
            </p>
          )}

          {/* Session Details */}
          {(() => {
            const details = [
              { label: "Session Type", value: session.subtype },
              { label: "Terrain", value: session.terrain },
              { label: "Elevation Gain", value: session.elevationGainMeters, format: (value: unknown) => `${value}m` },
              { label: "Pack Weight", value: session.packWeightKg, format: (value: unknown) => `${value}kg` },
              { label: "Strides", value: session.strides },
              { label: "Warm-up", value: session.warmupMinutes, format: (value: unknown) => `${value} min` },
              { label: "Cool-down", value: session.cooldownMinutes, format: (value: unknown) => `${value} min` },
              { label: "Intervals", value: session.intervalReps, format: (value: unknown) => `${value} sets` },
              { label: "Interval Duration", value: session.intervalDuration },
              { label: "Rest Between Sets", value: session.intervalRestSeconds, format: (value: unknown) => `${value}s` },
              { label: "Time Up", value: session.timeUpSeconds, format: (value: unknown) => `${value}s` },
              { label: "Time Down", value: session.timeDownSeconds, format: (value: unknown) => `${value}s` },
            ].filter(({ value }) => value);

            if (details.length === 0) return null;

            return (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-zinc-100 pt-3">
                {details.map(({ label, value, format }) => (
                  <div key={label} className="text-xs">
                    <p className="font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
                    <p className="text-zinc-700 capitalize">{format && value !== undefined ? format(value) : value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Reason */}
          {session.reason && (
            <p className="mt-2 text-sm text-zinc-600 italic border-l-2 border-emerald-200 pl-3 leading-relaxed">
              {session.reason}
            </p>
          )}

          {isSelected && (
            <div className="mt-4 space-y-3 border-t border-zinc-200 pt-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700">Perceived Effort (1-10)</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setPerceivedEffort(num)}
                      className={`h-8 w-8 rounded text-xs font-semibold transition-colors ${
                        perceivedEffort === num
                          ? "bg-indigo-600 text-white"
                          : "border border-zinc-300 hover:border-zinc-400"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-700">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="How did it go?"
                />
              </div>

              <button
                type="button"
                onClick={onLogCompletion}
                disabled={isSubmitting}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Log Session"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

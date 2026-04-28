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

export default function AthleteListPage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [displayWeekIndex, setDisplayWeekIndex] = useState(0);
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holidayDateRanges, setHolidayDateRanges] = useState<Array<{ start: string; end: string }>>([]);

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
          .select("session_id")
          .eq("athlete_user_id", user.id);

        if (completionsData) {
          setCompletedSessionIds(new Set(completionsData.map((c: any) => c.session_id)));
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
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
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
                        isCompleted={completedSessionIds.has(session.id)}
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

function SessionCard({ session, isCompleted }: { session: PlanSession; isCompleted: boolean }) {
  return (
    <Link
      href={`/athlete/session/${encodeURIComponent(session.id)}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Completion indicator */}
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            isCompleted
              ? "border-emerald-500 bg-emerald-100"
              : "border-zinc-300"
          }`}
        >
          {isCompleted && <span className="text-emerald-600 text-xs font-bold">✓</span>}
        </div>

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
            {(session as any).isInsertedAlternative && (
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

          {/* Description */}
          {session.description && (
            <p className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
              {session.description}
            </p>
          )}

          {/* Session Details */}
          {(() => {
            const s = session as any;
            const details = [
              { label: "Session Type", value: s.subtype },
              { label: "Terrain", value: s.terrain },
              { label: "Elevation Gain", value: s.elevationGainMeters, format: (v: any) => `${v}m` },
              { label: "Pack Weight", value: s.packWeightKg, format: (v: any) => `${v}kg` },
              { label: "Strides", value: s.strides },
              { label: "Warm-up", value: s.warmupMinutes, format: (v: any) => `${v} min` },
              { label: "Cool-down", value: s.cooldownMinutes, format: (v: any) => `${v} min` },
              { label: "Intervals", value: s.intervalReps, format: (v: any) => `${v} sets` },
              { label: "Interval Duration", value: s.intervalDuration },
              { label: "Rest Between Sets", value: s.intervalRestSeconds, format: (v: any) => `${v}s` },
            ].filter(({ value }) => value);

            if (details.length === 0) return null;

            return (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-zinc-100 pt-3">
                {details.map(({ label, value, format }) => (
                  <div key={label} className="text-xs">
                    <p className="font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
                    <p className="text-zinc-700 capitalize">{format ? format(value) : value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Reason */}
          {(session as any).reason && (
            <p className="mt-2 text-sm text-zinc-600 italic border-l-2 border-emerald-200 pl-3 leading-relaxed">
              {(session as any).reason}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

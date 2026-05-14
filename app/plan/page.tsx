"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanExercise, PlanSession } from "@/lib/planner/types";

interface SessionWithDate extends PlanSession {
  weekNumber: number;
  sessionDate: Date;
}

type Completion = {
  perceived_effort: number | null;
  notes: string | null;
};

type PlanDay = {
  key: string;
  date: Date;
  weekNumber: number;
  sessions: SessionWithDate[];
};

type DetailItem = {
  label: string;
  value: string;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMondayOfWeek(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const jsDay = copy.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parsePlanDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;

  let parsed = new Date(value);
  if (isNaN(parsed.getTime()) && value.includes("T")) {
    parsed = new Date(value.split("T")[0]);
  }

  if (isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPlanWeekStartDates(plan: GeneratedPlan, planCreatedAt?: string | null) {
  try {
    const scheduledStartDate =
      parsePlanDate((plan as unknown as { startDate?: string }).startDate) ??
      parsePlanDate(planCreatedAt) ??
      null;

    if (scheduledStartDate) {
      const firstWeekMonday = getMondayOfWeek(scheduledStartDate);

      return plan.weeks
        .slice()
        .sort((a, b) => a.weekNumber - b.weekNumber)
        .map((week, index) => ({
          weekId: week.id,
          weekNumber: week.weekNumber,
          monday: addDays(firstWeekMonday, index * 7),
        }));
    }

    if (!plan.eventDate) return [];

    const eventDate = parsePlanDate(plan.eventDate);
    if (!eventDate) return [];

    const eventWeekMonday = getMondayOfWeek(eventDate);
    const weeksAvailable = typeof plan.weeksAvailable === "number" ? plan.weeksAvailable : plan.weeks?.length ?? 0;
    const firstWeekMonday = addDays(eventWeekMonday, -(Math.max(weeksAvailable - 1, 0) * 7));

    return plan.weeks
      .slice()
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((week, index) => ({
        weekId: week.id,
        weekNumber: week.weekNumber,
        monday: addDays(firstWeekMonday, index * 7),
      }));
  } catch {
    return [];
  }
}

function isToday(date: Date): boolean {
  return getDateKey(date) === getDateKey(new Date());
}

function formatDayHeading(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function formatWeekRange(monday: Date) {
  const sunday = addDays(monday, 6);
  const start = monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const end = sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${start} - ${end}`;
}

function formatCompactDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function getSessionAccent(type: string): { bg: string; text: string; dot: string; border: string } {
  const colors: Record<string, { bg: string; text: string; dot: string; border: string }> = {
    Long: { bg: "bg-blue-50", text: "text-blue-900", dot: "bg-blue-500", border: "border-blue-200" },
    Steady: { bg: "bg-amber-50", text: "text-amber-900", dot: "bg-amber-500", border: "border-amber-200" },
    Easy: { bg: "bg-zinc-50", text: "text-zinc-800", dot: "bg-zinc-500", border: "border-zinc-200" },
    Recovery: { bg: "bg-emerald-50", text: "text-emerald-900", dot: "bg-emerald-500", border: "border-emerald-200" },
    Gym: { bg: "bg-violet-50", text: "text-violet-900", dot: "bg-violet-500", border: "border-violet-200" },
    Rest: { bg: "bg-zinc-50", text: "text-zinc-700", dot: "bg-zinc-300", border: "border-zinc-200" },
    Loaded: { bg: "bg-orange-50", text: "text-orange-900", dot: "bg-orange-500", border: "border-orange-200" },
    Recce: { bg: "bg-green-50", text: "text-green-900", dot: "bg-green-500", border: "border-green-200" },
    Navigation: { bg: "bg-cyan-50", text: "text-cyan-900", dot: "bg-cyan-500", border: "border-cyan-200" },
    functional: { bg: "bg-indigo-50", text: "text-indigo-900", dot: "bg-indigo-500", border: "border-indigo-200" },
  };

  return colors[type] ?? { bg: "bg-zinc-50", text: "text-zinc-800", dot: "bg-zinc-500", border: "border-zinc-200" };
}

function formatValue(value: unknown, suffix = "") {
  if (value === null || value === undefined || value === "") return null;
  return `${value}${suffix}`;
}

function getSessionDetails(session: PlanSession): DetailItem[] {
  const distance = formatValue((session as PlanSession & { distance_km?: number; distance?: number }).distance_km ?? (session as PlanSession & { distance?: number }).distance, " km");

  return [
    { label: "Activity", value: formatValue(session.activity) ?? "" },
    { label: "Session type", value: formatValue(session.subtype) ?? "" },
    { label: "Terrain", value: formatValue(session.terrain) ?? "" },
    { label: "Distance", value: distance ?? "" },
    { label: "Elevation", value: formatValue(session.elevationGainMeters, "m") ?? "" },
    { label: "Pack", value: formatValue(session.packWeightKg, "kg") ?? "" },
    { label: "Strides", value: formatValue(session.strides) ?? "" },
    { label: "Warm-up", value: formatValue(session.warmupMinutes, " min") ?? "" },
    { label: "Cool-down", value: formatValue(session.cooldownMinutes, " min") ?? "" },
    { label: "Intervals", value: formatValue(session.intervalReps, " sets") ?? "" },
    { label: "Interval duration", value: formatValue(session.intervalDuration) ?? "" },
    { label: "Rest", value: formatValue(session.intervalRestSeconds, "s") ?? "" },
    { label: "Time up", value: formatValue(session.timeUpSeconds, "s") ?? "" },
    { label: "Time down", value: formatValue(session.timeDownSeconds, "s") ?? "" },
  ].filter((item) => item.value);
}

function buildPlanDays(plan: GeneratedPlan, planCreatedAt?: string | null): PlanDay[] {
  const weekStarts = getPlanWeekStartDates(plan, planCreatedAt);
  const sessionsByDate = new Map<string, SessionWithDate[]>();

  for (const week of plan.weeks) {
    const weekStart = weekStarts.find((w) => w.weekId === week.id);
    if (!weekStart) continue;

    for (const session of week.sessions) {
      const dayIndex = DAY_LABELS.indexOf(session.dayLabel);
      if (dayIndex === -1) continue;

      const sessionDate = addDays(weekStart.monday, dayIndex);
      const key = getDateKey(sessionDate);
      const datedSession = {
        ...session,
        weekNumber: week.weekNumber,
        sessionDate,
      };

      sessionsByDate.set(key, [...(sessionsByDate.get(key) ?? []), datedSession]);
    }
  }

  return weekStarts.flatMap((weekStart) =>
    DAY_LABELS.map((_, dayIndex) => {
      const date = addDays(weekStart.monday, dayIndex);
      const key = getDateKey(date);
      const daySessions = (sessionsByDate.get(key) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        key,
        date,
        weekNumber: weekStart.weekNumber,
        sessions: daySessions,
      };
    })
  );
}

function getInitialDayIndex(days: PlanDay[]) {
  if (days.length === 0) return 0;

  const todayKey = getDateKey(new Date());
  const todayIndex = days.findIndex((day) => day.key === todayKey);
  if (todayIndex >= 0) return todayIndex;

  const upcomingSessionIndex = days.findIndex((day) => day.date > new Date() && day.sessions.length > 0);
  if (upcomingSessionIndex >= 0) return upcomingSessionIndex;

  return Math.max(days.findIndex((day) => day.sessions.length > 0), 0);
}

export default function PlanPage() {
  const [days, setDays] = useState<PlanDay[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [completions, setCompletions] = useState<Map<string, Completion>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }

        const { data: planData, error: planError } = await supabase
          .from("athlete_plans")
          .select("id, plan_json, created_at")
          .eq("athlete_user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (planError || !planData?.plan_json) {
          setLoading(false);
          return;
        }

        const plan = planData.plan_json as GeneratedPlan;
        const planDays = buildPlanDays(plan, planData.created_at);
        setDays(planDays);
        setSelectedDayIndex(getInitialDayIndex(planDays));

        const { data: completionsData } = await supabase
          .from("session_completions")
          .select("session_id, perceived_effort, notes")
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planData.id);

        if (completionsData) {
          setCompletions(
            new Map(
              completionsData.map((completion) => [
                completion.session_id,
                {
                  perceived_effort: completion.perceived_effort,
                  notes: completion.notes,
                },
              ])
            )
          );
        }

        setLoading(false);
      } catch {
        setError("An error occurred while loading");
        setLoading(false);
      }
    };

    void fetchData();
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    scroller.scrollTo({
      left: selectedDayIndex * scroller.clientWidth,
      behavior: "smooth",
    });
  }, [selectedDayIndex]);

  const selectedDay = days[selectedDayIndex];
  const selectedWeekStart = selectedDay ? getMondayOfWeek(selectedDay.date) : null;
  const selectedWeekDays = useMemo(() => {
    if (!selectedWeekStart) return [];
    const weekKeys = new Set(DAY_LABELS.map((_, index) => getDateKey(addDays(selectedWeekStart, index))));
    return days.filter((day) => weekKeys.has(day.key));
  }, [days, selectedWeekStart]);

  function handleDayScroll() {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth === 0) return;

    const nextIndex = Math.round(scroller.scrollLeft / scroller.clientWidth);
    if (nextIndex !== selectedDayIndex && days[nextIndex]) {
      setSelectedDayIndex(nextIndex);
    }
  }

  function selectDayByKey(key: string) {
    const index = days.findIndex((day) => day.key === key);
    if (index >= 0) setSelectedDayIndex(index);
  }

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <p className="text-sm text-zinc-600">Loading your sessions...</p>
      </div>
    );
  }

  if (error || days.length === 0) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error || "No sessions found."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 min-h-full bg-zinc-50">
      <section className="sticky top-[var(--pwa-topbar-height)] z-20 border-b border-zinc-200 bg-white px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Week {selectedDay?.weekNumber}
            </p>
            {selectedWeekStart && (
              <h1 className="mt-1 text-lg font-bold text-zinc-950">{formatWeekRange(selectedWeekStart)}</h1>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedDayIndex((index) => Math.max(index - 1, 0))}
              disabled={selectedDayIndex === 0}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 disabled:opacity-30"
              aria-label="Previous day"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={() => setSelectedDayIndex((index) => Math.min(index + 1, days.length - 1))}
              disabled={selectedDayIndex === days.length - 1}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 disabled:opacity-30"
              aria-label="Next day"
            >
              &rsaquo;
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1">
          {selectedWeekDays.map((day) => {
            const selected = day.key === selectedDay?.key;
            const firstSession = day.sessions[0];
            const accent = firstSession ? getSessionAccent(firstSession.type) : null;
            const completed = day.sessions.length > 0 && day.sessions.every((session) => completions.has(session.id));

            return (
              <button
                key={day.key}
                type="button"
                onClick={() => selectDayByKey(day.key)}
                className={`flex min-h-16 flex-col items-center justify-between rounded-lg px-1.5 py-2 text-center transition ${
                  selected ? "bg-zinc-950 text-white" : "bg-zinc-50 text-zinc-700"
                }`}
              >
                <span className={`text-xs font-bold ${selected ? "text-white" : "text-zinc-800"}`}>
                  {day.date.toLocaleDateString("en-GB", { weekday: "short" })}
                </span>
                <span className={`text-[11px] font-medium ${selected ? "text-zinc-300" : "text-zinc-500"}`}>
                  {day.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    accent ? accent.dot : selected ? "bg-white/20" : "bg-transparent"
                  } ${completed ? "ring-2 ring-emerald-400" : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </section>

      <div
        ref={scrollerRef}
        onScroll={handleDayScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {days.map((day) => (
          <div key={day.key} className="w-full shrink-0 snap-start px-4 py-5">
            <DayPanel day={day} completions={completions} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayPanel({ day, completions }: { day: PlanDay; completions: Map<string, Completion> }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {isToday(day.date) ? "Today" : formatCompactDate(day.date)}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-950">{formatDayHeading(day.date)}</h2>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right">
          <p className="text-lg font-bold text-zinc-950">{day.sessions.length}</p>
          <p className="text-xs font-medium text-zinc-500">session{day.sessions.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {day.sessions.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-base font-semibold text-zinc-950">No planned session</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Keep the day easy, recover well, and check the next training day when you are ready.
          </p>
        </div>
      ) : (
        day.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            completion={completions.get(session.id)}
            isCompleted={completions.has(session.id)}
          />
        ))
      )}
    </div>
  );
}

function SessionCard({
  session,
  completion,
  isCompleted,
}: {
  session: SessionWithDate;
  completion?: Completion;
  isCompleted: boolean;
}) {
  const accent = getSessionAccent(session.type);
  const details = getSessionDetails(session);

  return (
    <article className={`overflow-hidden rounded-xl border bg-white shadow-sm ${accent.border}`}>
      <div className={`border-b ${accent.border} ${accent.bg} px-4 py-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} aria-hidden="true" />
              <span className={`text-xs font-bold uppercase tracking-wide ${accent.text}`}>{session.type}</span>
              {session.isKeySession && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  Key
                </span>
              )}
              {isCompleted && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Done
                </span>
              )}
            </div>
            <h3 className="mt-3 text-xl font-bold leading-snug text-zinc-950">{session.name}</h3>
          </div>
          <Link
            href={`/plan/session/${encodeURIComponent(session.id)}`}
            className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800"
          >
            Open
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {session.duration && <CompactStat label="Duration" value={session.duration} />}
          {session.intensity && <CompactStat label="Intensity" value={session.intensity} />}
        </div>
      </div>

      <div className="space-y-5 px-4 py-5">
        {session.description && (
          <section>
            <h4 className="text-sm font-semibold text-zinc-950">Session brief</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{session.description}</p>
          </section>
        )}

        {session.reason && (
          <section className="border-l-2 border-emerald-500 pl-4">
            <h4 className="text-sm font-semibold text-zinc-950">Why this session</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{session.reason}</p>
          </section>
        )}

        {details.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold text-zinc-950">Details</h4>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {details.map((detail) => (
                <div key={detail.label} className="min-w-0 border-t border-zinc-100 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{detail.label}</p>
                  <p className="mt-1 truncate text-sm font-medium text-zinc-900">{detail.value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {session.tags?.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold text-zinc-950">Focus tags</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {session.tags.map((tag, index) => (
                <span key={`${session.id}-tag-${index}`} className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}

        {session.exercises?.length > 0 && (
          <section>
            <h4 className="text-sm font-semibold text-zinc-950">Exercises</h4>
            <div className="mt-3 divide-y divide-zinc-100 border-y border-zinc-100">
              {session.exercises.map((exercise, index) => (
                <ExerciseRow key={exercise.id} exercise={exercise} index={index} />
              ))}
            </div>
          </section>
        )}

        {isCompleted && completion && (
          <section className="rounded-xl bg-emerald-50 p-4">
            <h4 className="text-sm font-semibold text-emerald-950">Completed</h4>
            <p className="mt-2 text-sm text-emerald-800">
              Effort: {completion.perceived_effort ?? "not logged"}/10
              {completion.notes ? ` - ${completion.notes}` : ""}
            </p>
          </section>
        )}
      </div>
    </article>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/80 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-zinc-950">{value}</p>
    </div>
  );
}

function ExerciseRow({ exercise, index }: { exercise: PlanExercise; index: number }) {
  const prescription = [
    exercise.sets ? `${exercise.sets} sets` : null,
    exercise.reps ? `${exercise.reps} reps` : null,
    exercise.durationSeconds ? `${Math.round(exercise.durationSeconds / 60)} min` : null,
  ].filter(Boolean);

  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-bold text-zinc-600">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-sm font-semibold text-zinc-950">{exercise.name}</h5>
            {exercise.equipmentConflict && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                Equipment issue
              </span>
            )}
          </div>
          {prescription.length > 0 && (
            <p className="mt-1 text-xs font-medium text-zinc-500">{prescription.join(" / ")}</p>
          )}
          {exercise.description && <p className="mt-2 text-sm leading-6 text-zinc-600">{exercise.description}</p>}
          {exercise.equipment?.length ? (
            <p className="mt-2 text-xs text-zinc-500">Equipment: {exercise.equipment.join(", ")}</p>
          ) : null}
          {exercise.swappedFromName && (
            <p className="mt-2 text-xs text-zinc-500">Swapped from {exercise.swappedFromName}</p>
          )}
        </div>
      </div>
    </div>
  );
}

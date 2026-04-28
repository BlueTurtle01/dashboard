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

export default function AthleteListPage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [displayWeekIndex, setDisplayWeekIndex] = useState(0);
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Jump to current week
        if (loadedPlan.startDate) {
          const elapsed = Math.floor(
            (Date.now() - new Date(loadedPlan.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)
          );
          setDisplayWeekIndex(Math.max(0, Math.min(elapsed, loadedPlan.weeks.length - 1)));
        }

        const { data: completionsData } = await supabase
          .from("session_completions")
          .select("session_id")
          .eq("athlete_user_id", user.id);

        if (completionsData) {
          setCompletedSessionIds(new Set(completionsData.map((c: any) => c.session_id)));
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

  // Week date range label
  let weekRangeLabel = "";
  if (plan.startDate) {
    const weekStartMs = new Date(plan.startDate).getTime() + displayWeekIndex * 7 * 86400000;
    const monday = new Date(weekStartMs);
    const sunday = new Date(weekStartMs + 6 * 86400000);
    weekRangeLabel = `${formatDate(monday)} – ${formatDate(sunday)}`;
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
            if (plan.startDate) {
              const weekStartMs = new Date(plan.startDate).getTime() + displayWeekIndex * 7 * 86400000;
              dayDate = new Date(weekStartMs + dayIndex * 86400000);
            }

            const dateLabel = dayDate ? formatDate(dayDate) : "";

            return (
              <div key={dayLabel}>
                {/* Day header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-zinc-900">{DAY_FULL_NAMES[dayLabel]}</span>
                    {dateLabel && (
                      <span className="ml-2 text-sm text-zinc-500">{dateLabel}</span>
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
        </div>
      </div>
    </Link>
  );
}

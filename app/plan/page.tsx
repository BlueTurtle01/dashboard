"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

interface SessionWithDate extends PlanSession {
  weekNumber: number;
  sessionDate: Date;
}

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
  return copy;
}

function parsePlanDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;

  let parsed = new Date(value);
  if (isNaN(parsed.getTime()) && value.includes("T")) {
    parsed = new Date(value.split("T")[0]);
  }

  return isNaN(parsed.getTime()) ? null : parsed;
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
        .map((week, index) => {
          const monday = addDays(firstWeekMonday, index * 7);
          return {
            weekId: week.id,
            weekNumber: week.weekNumber,
            monday: isNaN(monday.getTime()) ? new Date() : monday,
          };
        })
        .filter((w) => !isNaN(w.monday.getTime()));
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
      .map((week, index) => {
        const monday = addDays(firstWeekMonday, index * 7);
        return {
          weekId: week.id,
          weekNumber: week.weekNumber,
          monday: isNaN(monday.getTime()) ? new Date() : monday,
        };
      })
      .filter((w) => !isNaN(w.monday.getTime()));
  } catch {
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
  return date.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" });
}

function isToday(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sessionDate = new Date(date);
  sessionDate.setHours(0, 0, 0, 0);
  return sessionDate.getTime() === today.getTime();
}

export default function PlanPage() {
  const [sessions, setSessions] = useState<SessionWithDate[]>([]);
  const [completions, setCompletions] = useState<Map<string, { perceived_effort: number | null; notes: string | null }>>(
    new Map()
  );
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
          .select("id, plan_json, created_at")
          .eq("athlete_user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (planError || !planData?.plan_json) {
          setLoading(false);
          return;
        }

        const plan = planData.plan_json as GeneratedPlan;
        const weekStarts = getPlanWeekStartDates(plan, planData.created_at);

        // Flatten sessions with dates
        const flatSessions: SessionWithDate[] = [];
        for (const week of plan.weeks) {
          const weekStart = weekStarts.find((w) => w.weekId === week.id);
          if (!weekStart) continue;

          for (const session of week.sessions) {
            const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(session.dayLabel);
            if (dayIndex === -1) continue;

            const sessionDate = addDays(weekStart.monday, dayIndex);
            flatSessions.push({
              ...session,
              weekNumber: week.weekNumber,
              sessionDate,
            });
          }
        }

        // Sort by date
        flatSessions.sort((a, b) => a.sessionDate.getTime() - b.sessionDate.getTime());
        setSessions(flatSessions);

        // Fetch completions
        const { data: completionsData } = await supabase
          .from("session_completions")
          .select("*")
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planData.id);

        if (completionsData) {
          const completionMap = new Map(
            completionsData.map((c) => [
              c.session_id,
              { perceived_effort: c.perceived_effort, notes: c.notes },
            ])
          );
          setCompletions(completionMap);
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
      <div className="flex items-center justify-center min-h-96">
        <p className="text-zinc-600">Loading your sessions…</p>
      </div>
    );
  }

  if (error || sessions.length === 0) {
    return (
      <div className="py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error || "No sessions found."}</p>
        </div>
      </div>
    );
  }

  // Group sessions by whether they're before, today, or after today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const pastSessions = sessions.filter((s) => s.sessionDate < today);
  const todaySessions = sessions.filter((s) => isToday(s.sessionDate));
  const futureSessions = sessions.filter((s) => s.sessionDate > today);

  return (
    <div className="pb-4">
      {/* Past sessions */}
      {pastSessions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 px-4">
            Past Sessions
          </h2>
          <div className="space-y-2 px-4">
            {pastSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isCompleted={completions.has(session.id)}
                completion={completions.get(session.id)}
                isPast={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Today's sessions */}
      {todaySessions.length > 0 && (
        <div className="mb-6">
          <div className="sticky top-14 z-10 mb-3">
            <div className="bg-gradient-to-b from-fafafa to-transparent pt-2 pb-2">
              <span className="inline-block px-3 py-1 bg-zinc-900 text-white text-xs font-semibold rounded-full">
                Today
              </span>
            </div>
          </div>
          <div className="space-y-2 px-4">
            {todaySessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isCompleted={completions.has(session.id)}
                completion={completions.get(session.id)}
                isPast={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Future sessions */}
      {futureSessions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3 px-4">
            Upcoming
          </h2>
          <div className="space-y-2 px-4">
            {futureSessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isCompleted={completions.has(session.id)}
                completion={completions.get(session.id)}
                isPast={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SessionRowProps {
  session: SessionWithDate;
  isCompleted: boolean;
  completion?: { perceived_effort: number | null; notes: string | null };
  isPast: boolean;
}

function SessionRow({ session, isCompleted, completion, isPast }: SessionRowProps) {
  return (
    <Link
      href={`/plan/session/${encodeURIComponent(session.id)}`}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        isPast
          ? "bg-white border-zinc-100 opacity-60 hover:opacity-75"
          : "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      {/* Completion indicator */}
      <div
        className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          isCompleted
            ? "border-emerald-500 bg-emerald-100"
            : "border-zinc-300 bg-white"
        }`}
      >
        {isCompleted && <span className="text-emerald-600 text-xs font-bold">✓</span>}
      </div>

      {/* Session info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${getSessionColorClass(session.type)}`}>
            {session.type}
          </span>
          <span className="font-medium text-sm text-zinc-900 truncate">{session.name}</span>
        </div>
        <p className="text-xs text-zinc-500">
          {formatDate(session.sessionDate)}
          {session.duration && ` · ${session.duration}`}
          {session.activity && ` · ${session.activity}`}
        </p>
        {isCompleted && completion && (
          <p className="text-xs text-zinc-400 mt-1">
            Effort: {completion.perceived_effort}/10
            {completion.notes && ` · "${completion.notes}"`}
          </p>
        )}
      </div>

      {/* Arrow */}
      <div className="text-zinc-400">→</div>
    </Link>
  );
}

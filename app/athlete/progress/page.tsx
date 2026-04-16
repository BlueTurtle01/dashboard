"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

interface SessionCompletion {
  session_id: string;
  week_number: number;
  actual_duration_minutes: number | null;
}

interface WeekStats {
  weekNumber: number;
  weekLabel: string;
  totalSessions: number;
  completed: number;
  completionPct: number;
  totalMinutes: number;
}

export default function ProgressPage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [weekStats, setWeekStats] = useState<WeekStats[]>([]);
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

        // Fetch active plan
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

        if (!planData || !planData.plan_json) {
          setError(null);
          setPlan(null);
          setLoading(false);
          return;
        }

        const loadedPlan = planData.plan_json as GeneratedPlan;
        setPlan(loadedPlan);

        // Fetch all completions for this plan
        const { data: completionData, error: completionError } = await supabase
          .from("session_completions")
          .select("session_id, week_number, actual_duration_minutes")
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planData.id);

        if (completionError) {
          console.error("Failed to fetch completions:", completionError);
        }

        // Compute per-week stats
        const completions: SessionCompletion[] = (completionData || []) as SessionCompletion[];
        const completionsByWeek = new Map<number, Set<string>>();
        const minutesByWeek = new Map<number, number>();

        completions.forEach((c) => {
          if (!completionsByWeek.has(c.week_number)) {
            completionsByWeek.set(c.week_number, new Set());
          }
          completionsByWeek.get(c.week_number)!.add(c.session_id);

          if (!minutesByWeek.has(c.week_number)) {
            minutesByWeek.set(c.week_number, 0);
          }
          if (c.actual_duration_minutes) {
            minutesByWeek.set(c.week_number, minutesByWeek.get(c.week_number)! + c.actual_duration_minutes);
          }
        });

        // Build stats for each week (show last 4 weeks or all if fewer)
        const stats: WeekStats[] = [];
        const startIdx = Math.max(0, loadedPlan.weeks.length - 4);

        for (let i = startIdx; i < loadedPlan.weeks.length; i++) {
          const week = loadedPlan.weeks[i];
          const totalSessions = week.sessions.filter((s) => s.type !== "Rest").length;
          const completed = completionsByWeek.get(i)?.size || 0;
          const totalMinutes = minutesByWeek.get(i) || 0;
          const completionPct = totalSessions > 0 ? Math.round((completed / totalSessions) * 100) : 0;

          stats.push({
            weekNumber: week.weekNumber,
            weekLabel: `Wk ${week.weekNumber}`,
            totalSessions,
            completed,
            completionPct,
            totalMinutes,
          });
        }

        setWeekStats(stats);
        setLoading(false);
      } catch (err) {
        setError("An error occurred while loading progress");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading progress…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-red-900">Error</h1>
          <p className="mt-3 text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">No plan available</h1>
          <p className="mt-3 text-zinc-600">Ask your coach to create a plan first.</p>
        </div>
      </main>
    );
  }

  // Calculate summary stats
  const weeksTracked = weekStats.length;
  const overallCompletionPct = weekStats.length > 0
    ? Math.round(
        (weekStats.reduce((sum, w) => sum + w.completed, 0) /
          weekStats.reduce((sum, w) => sum + w.totalSessions, 0)) *
          100
      )
    : 0;
  const totalMinutesLogged = weekStats.reduce((sum, w) => sum + w.totalMinutes, 0);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Your Progress</h1>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-zinc-600">Weeks Tracked</p>
            <p className="mt-2 text-3xl font-bold text-zinc-900">{weeksTracked}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-zinc-600">Overall Completion</p>
            <p className="mt-2 text-3xl font-bold text-zinc-900">{overallCompletionPct}%</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-zinc-600">Total Minutes</p>
            <p className="mt-2 text-3xl font-bold text-zinc-900">{totalMinutesLogged}</p>
          </div>
        </div>

        {/* Charts */}
        {weekStats.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Completion % Chart */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-zinc-900">Weekly Completion %</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekStats} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="weekLabel" stroke="#a1a1aa" />
                  <YAxis stroke="#a1a1aa" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e4e4e7",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <ReferenceLine y={100} stroke="#d4d4d8" strokeDasharray="5 5" />
                  <Bar dataKey="completionPct" fill="#18181b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Minutes Chart */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="font-semibold text-zinc-900">Total Minutes Per Week</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekStats} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="weekLabel" stroke="#a1a1aa" />
                  <YAxis stroke="#a1a1aa" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e4e4e7",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <Bar dataKey="totalMinutes" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-600">No completion data yet. Start logging sessions to see your progress!</p>
          </div>
        )}
      </div>
    </main>
  );
}

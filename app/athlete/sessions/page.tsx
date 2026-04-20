"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

interface SessionCompletion {
  id: string;
  session_id: string;
  week_number: number;
  perceived_effort: number | null;
  notes: string | null;
  completed_at: string;
}

export default function SessionsPage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
  const [displayWeekIndex, setDisplayWeekIndex] = useState(0);
  const [completions, setCompletions] = useState<Map<string, SessionCompletion>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state for selected session
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

        // Compute current week
        let currentWeek = 0;
        if (loadedPlan.startDate) {
          const startDate = new Date(loadedPlan.startDate).getTime();
          const now = Date.now();
          currentWeek = Math.floor((now - startDate) / (7 * 24 * 60 * 60 * 1000));
          currentWeek = Math.max(0, Math.min(currentWeek, loadedPlan.weeks.length - 1));
        }
        setCurrentWeekIndex(currentWeek);
        setDisplayWeekIndex(currentWeek);

        // Fetch all completions for the entire plan
        const { data: completionData, error: completionError } = await supabase
          .from("session_completions")
          .select("*")
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planData.id);

        if (completionError) {
          console.error("Failed to fetch completions:", completionError);
        }

        const completionMap = new Map<string, SessionCompletion>();
        if (completionData) {
          completionData.forEach((c) => {
            completionMap.set(c.session_id, c);
          });
        }
        setCompletions(completionMap);
        setLoading(false);
      } catch (err) {
        setError("An error occurred while loading sessions");
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

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      const planDataResult = await supabase
        .from("athlete_plans")
        .select("id, plan_json")
        .eq("athlete_user_id", user.id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!planDataResult.data) return;

      const activePlan = planDataResult.data.plan_json as GeneratedPlan;
      const activePlanId = planDataResult.data.id;
      const displayedWeek = activePlan.weeks[displayWeekIndex];
      if (!displayedWeek) return;

      // If this is an alternative session and there's a main session already completed,
      // we need to first remove the main session's completion
      // Conversely, if this is a main session and an alternative is completed, remove the alternative
      if (alternativeSessionId && completions.has(alternativeSessionId)) {
        // Remove the alternative session's completion
        const { error: deleteError } = await supabase
          .from("session_completions")
          .delete()
          .eq("athlete_user_id", user.id)
          .eq("session_id", alternativeSessionId);

        if (deleteError) {
          setError("Failed to update completion");
          return;
        }

        // Remove from local state
        const newCompletions = new Map(completions);
        newCompletions.delete(alternativeSessionId);
        setCompletions(newCompletions);
      }

      const { error: upsertError } = await supabase
        .from("session_completions")
        .upsert(
          {
            athlete_user_id: user.id,
            plan_id: activePlanId,
            session_id: sessionId,
            week_number: displayedWeek.weekNumber,
            perceived_effort: perceivedEffort,
            notes: notes || null,
            completed_at: new Date().toISOString(),
          },
          {
            onConflict: "athlete_user_id,session_id",
          }
        );

      if (upsertError) {
        setError("Failed to log session");
        return;
      }

      // Update local state
      const completion: SessionCompletion = {
        id: sessionId,
        session_id: sessionId,
        week_number: displayedWeek.weekNumber,
        perceived_effort: perceivedEffort,
        notes: notes || null,
        completed_at: new Date().toISOString(),
      };
      setCompletions(new Map(completions).set(sessionId, completion));

      // Reset form
      setSelectedSessionId(null);
      setPerceivedEffort(null);
      setNotes("");
      setError(null);
    } catch (err) {
      setError("An error occurred while saving");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading sessions…</p>
        </div>
      </main>
    );
  }

  if (error && !plan) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-red-900">Error</h1>
          <p className="mt-3 text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!plan || !plan.weeks[displayWeekIndex]) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">No plan available</h1>
          <p className="mt-3 text-zinc-600">Ask your coach to create a plan first.</p>
        </div>
      </main>
    );
  }

  const displayWeek = plan.weeks[displayWeekIndex];
  const completedCount = displayWeek.sessions.filter((s) => s.type !== "Rest" && completions.has(s.id)).length;
  const totalCount = displayWeek.sessions.filter((s) => s.type !== "Rest").length;

  // Compute week start date for display
  let weekStartDate = "";
  if (plan.startDate) {
    const startDate = new Date(plan.startDate);
    const weekStartMs = startDate.getTime() + displayWeekIndex * 7 * 24 * 60 * 60 * 1000;
    const weekStart = new Date(weekStartMs);
    const month = weekStart.toLocaleDateString("en-US", { month: "short" });
    const day = weekStart.getDate();
    weekStartDate = `${day} ${month}`;
  }

  // Group sessions: find main sessions and their alternatives
  const sessionGroups: Array<{ mainSession: PlanSession; alternativeSession: PlanSession | null }> = [];
  const processedSessionIds = new Set<string>();

  displayWeek.sessions.forEach((session) => {
    if (processedSessionIds.has(session.id)) return;

    const isAlternative = (session as any).isInsertedAlternative === true;

    if (isAlternative) {
      // Skip alternatives here - they'll be paired with their main session
      return;
    }

    processedSessionIds.add(session.id);

    // Find alternative session (same day, not same session)
    const alternativeSession = displayWeek.sessions.find((s) => {
      if (s.id === session.id) return false;
      if ((s as any).isInsertedAlternative !== true) return false;
      if (s.dayLabel !== session.dayLabel) return false;
      return true;
    }) || null;

    if (alternativeSession) {
      processedSessionIds.add(alternativeSession.id);
    }

    sessionGroups.push({
      mainSession: session,
      alternativeSession: alternativeSession as PlanSession | null,
    });
  });

  const getSessionColor = (type: string) => {
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
  };

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Sessions</h1>
              <p className="mt-2 text-sm text-zinc-600">
                Week {displayWeek.weekNumber} — {displayWeek.phase} — {weekStartDate} — {completedCount} of {totalCount} sessions complete
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDisplayWeekIndex(Math.max(0, displayWeekIndex - 1))}
                disabled={displayWeekIndex === 0}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <button
                onClick={() => setDisplayWeekIndex(Math.min(plan.weeks.length - 1, displayWeekIndex + 1))}
                disabled={displayWeekIndex === plan.weeks.length - 1}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {sessionGroups.map((group) => {
            const mainSession = group.mainSession;
            const alternativeSession = group.alternativeSession;

            return (
              <div key={mainSession.id} className="space-y-2">
                {/* Main session card */}
                <SessionCard
                  session={mainSession}
                  isCompleted={completions.has(mainSession.id)}
                  completion={completions.get(mainSession.id)}
                  isSelected={selectedSessionId === mainSession.id}
                  onSelectToggle={() => setSelectedSessionId(selectedSessionId === mainSession.id ? null : mainSession.id)}
                  getSessionColor={getSessionColor}
                  isSubmitting={submitting}
                  perceivedEffort={perceivedEffort}
                  setPerceivedEffort={setPerceivedEffort}
                  notes={notes}
                  setNotes={setNotes}
                  onLogCompletion={() => handleLogCompletion(mainSession.id, alternativeSession?.id)}
                  alternativeSessionId={alternativeSession?.id}
                />

                {/* Alternative session card */}
                {alternativeSession && (
                  <SessionCard
                    session={alternativeSession}
                    isCompleted={completions.has(alternativeSession.id)}
                    completion={completions.get(alternativeSession.id)}
                    isSelected={selectedSessionId === alternativeSession.id}
                    onSelectToggle={() => setSelectedSessionId(selectedSessionId === alternativeSession.id ? null : alternativeSession.id)}
                    getSessionColor={getSessionColor}
                    isSubmitting={submitting}
                    perceivedEffort={perceivedEffort}
                    setPerceivedEffort={setPerceivedEffort}
                    notes={notes}
                    setNotes={setNotes}
                    onLogCompletion={() => handleLogCompletion(alternativeSession.id, mainSession.id)}
                    alternativeSessionId={mainSession.id}
                    isAlternative={true}
                  />
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
  getSessionColor: (type: string) => string;
  isSubmitting: boolean;
  perceivedEffort: number | null;
  setPerceivedEffort: (value: number) => void;
  notes: string;
  setNotes: (value: string) => void;
  onLogCompletion: () => void;
  alternativeSessionId?: string;
  isAlternative?: boolean;
}

function SessionCard({
  session,
  isCompleted,
  completion,
  isSelected,
  onSelectToggle,
  getSessionColor,
  isSubmitting,
  perceivedEffort,
  setPerceivedEffort,
  notes,
  setNotes,
  onLogCompletion,
  alternativeSessionId,
  isAlternative = false,
}: SessionCardProps) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm hover:border-zinc-300 transition-colors ${
        isAlternative ? "border-blue-100 bg-blue-50" : "border-zinc-200"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="pt-1">
          <button
            onClick={onSelectToggle}
            className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors ${
              isCompleted
                ? "bg-emerald-100 border-emerald-600"
                : "border-zinc-300 hover:border-zinc-400"
            }`}
          >
            {isCompleted && <span className="text-emerald-600 text-sm font-bold">✓</span>}
          </button>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{session.name}</h3>
            <span className={`text-xs font-semibold px-2 py-1 rounded ${getSessionColor(session.type)}`}>
              {session.type}
            </span>
            {session.isKeySession && <span className="text-xs font-semibold px-2 py-1 rounded bg-amber-100 text-amber-900">Key</span>}
            {isAlternative && <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-900">Alternative</span>}
          </div>

          <p className="text-sm text-zinc-600 mt-1">
            {session.dayLabel} • {session.duration} • {session.intensity}
          </p>

          {isCompleted && completion && (
            <div className="mt-2 text-xs text-zinc-500">
              <p>Effort: {completion.perceived_effort}/10</p>
              {completion.notes && <p className="mt-1">Notes: {completion.notes}</p>}
            </div>
          )}

          {session.description && (
            <div className="mt-3 p-3 bg-zinc-50 rounded-lg text-sm text-zinc-700 whitespace-pre-wrap">
              {session.description}
            </div>
          )}

          {/* Extended session details */}
          {(session.activity || session.terrain || session.elevationGainMeters || session.packWeightKg || session.strides || session.warmupMinutes || session.cooldownMinutes || session.intervalReps) && (
            <div className="mt-3 space-y-2 text-sm">
              {session.activity && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Activity:</span>
                  <span className="text-zinc-900">{session.activity}{session.subtype ? ` - ${session.subtype}` : ""}</span>
                </div>
              )}
              {session.terrain && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Terrain:</span>
                  <span className="text-zinc-900">{session.terrain}</span>
                </div>
              )}
              {session.elevationGainMeters && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Elevation:</span>
                  <span className="text-zinc-900">{session.elevationGainMeters}m</span>
                </div>
              )}
              {session.packWeightKg && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Pack Weight:</span>
                  <span className="text-zinc-900">{session.packWeightKg}kg</span>
                </div>
              )}
              {session.strides && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Strides:</span>
                  <span className="text-zinc-900">{session.strides}</span>
                </div>
              )}
              {session.warmupMinutes && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Warm-up:</span>
                  <span className="text-zinc-900">{session.warmupMinutes} min</span>
                </div>
              )}
              {session.cooldownMinutes && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Cool-down:</span>
                  <span className="text-zinc-900">{session.cooldownMinutes} min</span>
                </div>
              )}
              {session.intervalReps && (
                <div className="flex gap-2">
                  <span className="font-semibold text-zinc-600 min-w-20">Intervals:</span>
                  <span className="text-zinc-900">{session.intervalReps} x {session.intervalDuration || "?"}</span>
                </div>
              )}
            </div>
          )}

          {isSelected && (
            <div className="mt-4 space-y-3 pt-3 border-t border-zinc-200">
              <div>
                <label className="text-xs font-semibold text-zinc-700">Perceived Effort (1-10)</label>
                <div className="flex gap-2 mt-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      onClick={() => setPerceivedEffort(num)}
                      className={`w-8 h-8 rounded text-xs font-semibold transition-colors ${
                        perceivedEffort === num
                          ? "bg-zinc-900 text-white"
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
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="How did it go?"
                />
              </div>

              <button
                onClick={onLogCompletion}
                disabled={isSubmitting}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Saving…" : "Log Session"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

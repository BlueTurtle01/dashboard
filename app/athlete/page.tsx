"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CoachSessionGrid from "@/components/CoachSessionGrid";
import PlanNarrativeView from "@/components/PlanNarrativeView";
import { GeneratedPlan } from "@/lib/planner/types";
import { generatePlanNarrative } from "@/lib/planner/planNarrative";
import { createClient } from "@/lib/supabase/client";

// Training Camp Type
interface TrainingCamp {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  terrain_types: string[];
}

export default function AthletePage() {
  // Plan-related state
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [holidayDateRanges, setHolidayDateRanges] = useState<Array<{ start: string; end: string }>>([]);
  const [holidays, setHolidays] = useState<Array<{ id: string; title: string; start: string; end: string; equipmentUnavailable: string[] }>>([]);
  const [trainingCampDateRanges, setTrainingCampDateRanges] = useState<Array<{ start: string; end: string }>>([]);
  const [trainingCamps, setTrainingCamps] = useState<Array<{ id: string; title: string; start: string; end: string }>>([]);
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Tab state - only calendar and journey
  const [activeTab, setActiveTab] = useState<"calendar" | "journey">("calendar");

  // Load plan data
  useEffect(() => {
    let cancelled = false;

    const fetchAllData = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }

        const userId = user.id;

        // Load plan data
        const { data: planData, error: planError } = await supabase
          .from("athlete_plans")
          .select("id, plan_json")
          .eq("athlete_user_id", userId);

        if (planError) {
          throw new Error(`Failed to load plan: ${planError.message}`);
        }

        if (!planData || planData.length === 0) {
          setError("No plan found. Please create a plan first.");
          setLoading(false);
          return;
        }

        const planRecord = planData[0];
        const planDataObj = typeof planRecord.plan_json === "string"
          ? JSON.parse(planRecord.plan_json || "{}")
          : planRecord.plan_json;

        if (!planDataObj.eventDate || !planDataObj.eventName || !Array.isArray(planDataObj.weeks)) {
          setError("Plan is missing required fields (eventDate, eventName, or weeks)");
          setLoading(false);
          return;
        }

        const testDate = new Date(planDataObj.eventDate);
        if (isNaN(testDate.getTime())) {
          setError(`Invalid event date format: ${planDataObj.eventDate}`);
          setLoading(false);
          return;
        }

        setPlanId(planRecord.id);
        setPlan(planDataObj);

        // Fetch holiday events
        const { data: eventsData } = await supabase
          .from("athlete_events")
          .select("id, start_date, end_date, title")
          .eq("athlete_user_id", userId)
          .eq("event_type", "holiday");

        if (eventsData) {
          const blockedDatesList: string[] = [];
          const holidaysList: Array<{ id: string; title: string; start: string; end: string; equipmentUnavailable: string[] }> = [];

          for (const event of eventsData) {
            if (event.start_date && event.end_date) {
              const start = new Date(event.start_date);
              const end = new Date(event.end_date);

              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                blockedDatesList.push(d.toISOString().split("T")[0]);
              }

              holidaysList.push({
                id: event.id,
                title: event.title || "Holiday",
                start: event.start_date,
                end: event.end_date,
                equipmentUnavailable: [],
              });
            }
          }

          const ranges = eventsData
            .filter((e) => e.start_date && e.end_date)
            .map((e) => ({ start: e.start_date, end: e.end_date }));

          setBlockedDates(blockedDatesList);
          setHolidays(holidaysList);
          setHolidayDateRanges(ranges);
        }

        // Fetch training camps
        const { data: trainingCampData } = await supabase
          .from("training_camps")
          .select("id, title, start_date, end_date, terrain_types")
          .eq("athlete_user_id", userId);

        if (trainingCampData) {
          const camps = trainingCampData.map((camp: any) => ({
            id: camp.id,
            title: camp.title,
            start: camp.start_date,
            end: camp.end_date,
          }));

          const ranges = trainingCampData
            .filter((c: any) => c.start_date && c.end_date)
            .map((c: any) => ({ start: c.start_date, end: c.end_date }));

          setTrainingCamps(camps);
          setTrainingCampDateRanges(ranges);
        }

        // Fetch completed session IDs
        const { data: sessionsData } = await supabase
          .from("athlete_session_completion")
          .select("session_id")
          .eq("athlete_user_id", userId);

        if (sessionsData) {
          setCompletedSessionIds(new Set(sessionsData.map((s: any) => s.session_id)));
        }

        setLoading(false);
      } catch (err) {
        console.error("Error loading data:", err);
        setError(err instanceof Error ? err.message : "Failed to load data");
        setLoading(false);
      }
    };

    fetchAllData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleMoveSession(sessionId: string, newDate: string) {
    if (!planId) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      await supabase.from("athlete_plans").update({
        plan_json: JSON.stringify(plan),
      }).eq("id", planId);
    } catch (err) {
      console.error("Error moving session:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-center text-zinc-600">Loading plan...</p>
        </div>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-900">Unable to load plan</h1>
            <p className="mt-2 text-red-800">{error || "No plan found"}</p>
            <Link
              href="/create-plan"
              className="mt-4 inline-block rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Create Plan
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{plan.eventName}</h1>
          <p className="mt-1 text-zinc-600">{plan.eventDate}</p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/athlete/profile"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Go to Profile
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 border-b border-zinc-200">
          <div className="flex gap-4">
            {(["calendar", "journey"] as const).map((tab) => {
              const tabLabels = {
                calendar: "Calendar",
                journey: "Your Journey",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-zinc-900 text-zinc-900"
                      : "border-transparent text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {tabLabels[tab]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab 1: Calendar */}
        {activeTab === "calendar" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <CoachSessionGrid
              plan={plan}
              editable={!saving}
              sessionLinkPrefix="/athlete/session/"
              onMoveSession={handleMoveSession}
              prepRaceMarkers={plan.prepRaceMarkers}
              showRestDays
              blockedDates={blockedDates}
              holidayDateRanges={holidayDateRanges}
              trainingCampDateRanges={trainingCampDateRanges}
              completedSessionIds={completedSessionIds}
            />
          </div>
        )}

        {/* Tab 2: Journey */}
        {activeTab === "journey" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900 mb-6">Your Journey</h2>
            <PlanNarrativeView weeks={generatePlanNarrative(plan)} holidays={holidays} trainingCamps={trainingCamps} />
          </div>
        )}
      </div>
    </main>
  );
}

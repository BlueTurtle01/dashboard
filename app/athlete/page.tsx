
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CoachSessionGrid from "@/components/CoachSessionGrid";
import PlanNarrativeView from "@/components/PlanNarrativeView";
import { GeneratedPlan } from "@/lib/planner/types";
import { generatePlanNarrative } from "@/lib/planner/planNarrative";
import { createClient } from "@/lib/supabase/client";

interface AthleteEvent {
  id: string;
  event_type: "injury" | "holiday";
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "pending" | "acknowledged";
  created_at: string;
}

interface TrainingCamp {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  terrain_types: string[];
}

export default function AthletePage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"calendar" | "journey">("calendar");
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [holidayDateRanges, setHolidayDateRanges] = useState<Array<{ start: string; end: string }>>([]);
  const [holidays, setHolidays] = useState<Array<{ id: string; title: string; start: string; end: string; equipmentUnavailable: string[] }>>([]);
  const [trainingCampDateRanges, setTrainingCampDateRanges] = useState<Array<{ start: string; end: string }>>([]);
  const [trainingCamps, setTrainingCamps] = useState<Array<{ id: string; title: string; start: string; end: string }>>([]);
  const [completedSessionIds, setCompletedSessionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }


        const { data, error: queryError } = await supabase
          .from("athlete_plans")
          .select("id, plan_json")
          .eq("athlete_user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queryError) {
          setError("Failed to load plan");
          setLoading(false);
          return;
        }

        if (data && data.plan_json) {
          const planData = data.plan_json as GeneratedPlan;
          const fetchedPlanId = data.id;

          // Validate the plan has required fields
          if (!planData.eventDate || !planData.eventName || !Array.isArray(planData.weeks)) {
            setError("Plan is missing required fields (eventDate, eventName, or weeks)");
            setPlan(null);
            setPlanId(null);
          } else {
            // Validate eventDate is parseable
            const testDate = new Date(planData.eventDate);
            if (isNaN(testDate.getTime())) {
              setError(`Invalid event date format: ${planData.eventDate}`);
              setPlan(null);
              setPlanId(null);
            } else {
              setPlan(planData);
              setPlanId(fetchedPlanId);
            }
          }
        } else {
          setError(null);
          setPlan(null);
          setPlanId(null);
        }

        // Fetch athlete's blocked dates, holidays, and equipment unavailability
        const { data: profileData } = await supabase
          .from("athlete_profiles")
          .select("blocked_dates, holiday_equipment_unavailable")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileData?.blocked_dates) {
          setBlockedDates(profileData.blocked_dates as string[]);
        }

        const { data: eventsData } = await supabase
          .from("athlete_events")
          .select("id, title, start_date, end_date")
          .eq("athlete_user_id", user.id)
          .eq("event_type", "holiday");

        if (eventsData) {
          const holidayEquipmentMap = new Map<string, string[]>();

          // Build a map of start_date->end_date to equipment unavailable
          if (profileData?.holiday_equipment_unavailable) {
            const equipList = profileData.holiday_equipment_unavailable as Array<{ start_date: string; end_date: string; unavailable_equipment: string[] }>;
            equipList.forEach(entry => {
              const key = `${entry.start_date}|${entry.end_date}`;
              holidayEquipmentMap.set(key, entry.unavailable_equipment);
            });
          }

          const holidaysList = eventsData
            .filter(e => e.start_date && e.end_date)
            .map(e => {
              const key = `${e.start_date}|${e.end_date}`;
              return {
                id: e.id,
                title: e.title,
                start: e.start_date!,
                end: e.end_date!,
                equipmentUnavailable: holidayEquipmentMap.get(key) || []
              };
            });

          const ranges = eventsData
            .filter(e => e.start_date && e.end_date)
            .map(e => ({ start: e.start_date!, end: e.end_date! }));

          setHolidays(holidaysList);
          setHolidayDateRanges(ranges);
        }

        // Fetch training camps
        const { data: campsData } = await supabase
          .from("training_camps")
          .select("id, title, start_date, end_date, terrain_types")
          .eq("athlete_user_id", user.id);

        if (campsData) {
          const campsList = campsData
            .filter(c => c.start_date && c.end_date)
            .map(c => ({
              id: c.id,
              title: c.title,
              start: c.start_date,
              end: c.end_date,
            }));

          const campRanges = campsData
            .filter(c => c.start_date && c.end_date)
            .map(c => ({ start: c.start_date, end: c.end_date }));

          setTrainingCamps(campsList);
          setTrainingCampDateRanges(campRanges);
        }

        // Fetch session completions
        if (planId) {
          const { data: completionData } = await supabase
            .from("session_completions")
            .select("session_id")
            .eq("athlete_user_id", user.id)
            .eq("plan_id", planId);

          if (completionData) {
            const completedIds = new Set(completionData.map((c) => c.session_id));
            setCompletedSessionIds(completedIds);
          }
        }
      } catch (err) {
        setError("An error occurred while loading your plan");
      } finally {
        setLoading(false);
      }
    };

    fetchPlan();
  }, [planId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading your plan…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-red-900">Error</h1>
          <p className="mt-3 text-red-700">{error}</p>
        </div>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">No active plan</h1>
          <p className="mt-3 text-zinc-600">Ask your coach to generate or load a plan first.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{plan?.eventName}</h1>
              <p className="mt-1 text-zinc-600">{plan?.eventDate}</p>
            </div>
            <Link
              href="/athlete/feedback"
              className="shrink-0 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 transition-colors"
            >
              Monthly Check-in
            </Link>
          </div>

          <div className="mt-4 flex gap-1 border-b border-zinc-200">
            {(["calendar", "journey"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "border-zinc-900 text-zinc-900"
                    : "border-transparent text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {tab === "journey" ? "Your Journey" : "Calendar"}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "calendar" && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <CoachSessionGrid
              plan={plan}
              editable={false}
              sessionLinkPrefix="/athlete/session/"
              prepRaceMarkers={plan.prepRaceMarkers}
              showRestDays
              blockedDates={blockedDates}
              holidayDateRanges={holidayDateRanges}
              trainingCampDateRanges={trainingCampDateRanges}
              completedSessionIds={completedSessionIds}
            />
          </div>
        )}

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

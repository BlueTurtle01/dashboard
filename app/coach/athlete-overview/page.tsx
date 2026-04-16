"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AthleteOption = {
  user_id: string;
  full_name: string | null;
  tags?: string[];
};

type AthleteProfile = {
  user_id: string;
  full_name: string | null;
  date_of_birth: string | null;
  created_at: string;
  id: string;
  temp_user_key: string | null;
  injuries: unknown;
  imbalances: unknown;
  holidays: string[];
  blocked_dates: string[];
  event_type: string;
  event_profile: unknown;
  selected_event_id: string | null;
  tags?: string[];
  event: {
    id: string;
    name: string;
    event_date: string | null;
  } | null;
};

type AthletePlanSummary = {
  id: string;
  name: string;
  is_active: boolean;
  updated_at: string;
  created_at: string;
  plan_json?: unknown;
};

type CompletionStat = {
  weekNumber: number;
  weekLabel: string;
  totalSessions: number;
  completed: number;
  completionPct: number;
};

type AthleteEvent = {
  id: string;
  event_type: "injury" | "holiday";
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "pending" | "acknowledged";
  created_at: string;
};

type TrainingCamp = {
  id: string;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string;
  terrain_types: string[];
  climate_types: string[];
  has_pack_carry: boolean;
  back_to_back_sessions: boolean;
  daily_session_cap: number;
  notes: string | null;
  status: "pending" | "acknowledged";
  created_at: string;
};

const TEST_COACH_USER_ID = "bff5270a-cdc6-4bc4-a008-3530259d57e6";
const STORAGE_KEY = "selectedCoachAthleteId";

const TERRAIN_OPTIONS = [
  { value: "sand", label: "Sand / Desert" },
  { value: "mountain", label: "Mountain / Alpine" },
  { value: "trail", label: "Technical Trail" },
  { value: "road", label: "Road / Flat" },
];

const CLIMATE_OPTIONS = [
  { value: "heat", label: "Heat" },
  { value: "altitude", label: "High Altitude" },
  { value: "cold", label: "Cold / Arctic" },
];

function needsDeloadWarning(campStartDate: string, plan: AthletePlanSummary | null): boolean {
  if (!plan) return false;
  const planData = plan.plan_json as any;
  if (!planData?.weeks || !Array.isArray(planData.weeks)) return false;

  const campStart = new Date(campStartDate);
  campStart.setHours(0, 0, 0, 0);

  // Look for the week that contains the day 7 days before camp starts
  const weekBefore = new Date(campStart);
  weekBefore.setDate(weekBefore.getDate() - 7);

  // Find weeks that could be the week before the camp
  const potentialDeloadWeeks = planData.weeks.filter((week: any) => {
    const phase = week.phase?.toLowerCase();
    // This is a rough check - ideally we'd calculate exact dates
    return phase && phase !== "build" && phase !== "peak";
  });

  // If we don't find a clear deload week (Base or Taper phase) before the camp, warn
  return potentialDeloadWeeks.length === 0 || planData.weeks[planData.weeks.length - 2]?.phase?.toLowerCase() === "peak";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getWeeksFromToday(value: string | null | undefined) {
  if (!value) return "—";

  const eventDate = new Date(value);
  if (Number.isNaN(eventDate.getTime())) {
    return "—";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);

  const diffMs = eventDate.getTime() - today.getTime();
  const diffWeeks = diffMs / (1000 * 60 * 60 * 24 * 7);

  if (diffWeeks >= 0) {
    return `${Math.ceil(diffWeeks)} week${Math.ceil(diffWeeks) === 1 ? "" : "s"}`;
  }

  const pastWeeks = Math.abs(Math.floor(diffWeeks));
  return `${pastWeeks} week${pastWeeks === 1 ? "" : "s"} ago`;
}

function formatJson(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normaliseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        return Object.entries(item as Record<string, unknown>)
          .filter(([, entryValue]) => entryValue != null && entryValue !== "")
          .map(([key, entryValue]) => `${key}: ${String(entryValue)}`)
          .join(" · ");
      }

      return String(item);
    })
    .filter(Boolean);
}

export default function CoachAthleteOverviewPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [coachUserId, setCoachUserId] = useState<string>(TEST_COACH_USER_ID);
  const [usingFallbackAuth, setUsingFallbackAuth] = useState(false);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState("");
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [latestPlan, setLatestPlan] = useState<AthletePlanSummary | null>(null);
  const [completionStats, setCompletionStats] = useState<CompletionStat[]>([]);
  const [athleteEvents, setAthleteEvents] = useState<AthleteEvent[]>([]);
  const [trainingCamps, setTrainingCamps] = useState<TrainingCamp[]>([]);
  const [pendingFeedback, setPendingFeedback] = useState<any[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPlanSummary, setLoadingPlanSummary] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingCamps, setLoadingCamps] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [athletesError, setAthletesError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [planError, setPlanError] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "health" | "dates" | "plans" | "warnings">("profile");
  const [planWarnings, setPlanWarnings] = useState<any[]>([]);

  const athleteIdFromUrl = searchParams.get("athleteId") ?? "";

  const selectedAthleteName = useMemo(() => {
    return athletes.find((athlete) => athlete.user_id === selectedAthleteId)?.full_name ?? null;
  }, [athletes, selectedAthleteId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCoachAndAthletes() {
      setLoadingAthletes(true);
      setAthletesError("");

      let resolvedCoachId = TEST_COACH_USER_ID;
      let fallbackUsed = false;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        resolvedCoachId = user.id;
      } else {
        fallbackUsed = true;
      }

      if (cancelled) return;

      setCoachUserId(resolvedCoachId);
      setUsingFallbackAuth(fallbackUsed);

      const { data, error } = await supabase
        .from("coach_athlete_links")
        .select(`
          athlete_user_id,
          athlete_profiles!coach_athlete_links_athlete_user_id_fkey (
            user_id,
            full_name
          )
        `)
        .eq("coach_user_id", resolvedCoachId)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setAthletes([]);
        setAthletesError(error.message);
        setLoadingAthletes(false);
        return;
      }

      const mappedAthletes = (data ?? [])
        .map((row: any) => {
          const athlete = Array.isArray(row.athlete_profiles)
            ? row.athlete_profiles[0]
            : row.athlete_profiles;

          if (!athlete?.user_id) return null;

          // Generate summary from tags
          const generateSummary = (tags: string[] | undefined): string => {
            if (!tags || tags.length === 0) return "";
            const experience = tags.filter(t =>
              ["ultramarathoner", "trail_runner", "road_runner", "desert_racing", "multi_day_racing"].includes(t)
            );
            const injuries = tags.filter(t =>
              t.includes("pain") || t.includes("issue") || t.includes("syndrome") || t.includes("fasciitis") ||
              t.includes("splint") || t.includes("fracture") || t.includes("tendinitis")
            );
            const parts: string[] = [];
            if (experience.length > 0) {
              const expLabels = experience.map(t =>
                t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
              );
              parts.push(expLabels.slice(0, 2).join(", "));
            }
            if (injuries.length > 0) {
              parts.push(`${injuries.length} injury concern${injuries.length > 1 ? "s" : ""}`);
            }
            return parts.slice(0, 2).join(". ");
          };

          return {
            user_id: athlete.user_id,
            full_name: athlete.full_name ?? null,
            tags: athlete.tags,
          };
        })
        .filter((athlete: AthleteOption | null): athlete is AthleteOption => athlete !== null) as AthleteOption[];

      setAthletes(mappedAthletes);
      setLoadingAthletes(false);

      const storedAthleteId =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY) ?? ""
          : "";

      const initialAthleteId =
        athleteIdFromUrl || storedAthleteId || mappedAthletes[0]?.user_id || "";

      const validAthleteId = mappedAthletes.some(
        (athlete) => athlete.user_id === initialAthleteId
      )
        ? initialAthleteId
        : mappedAthletes[0]?.user_id || "";

      setSelectedAthleteId(validAthleteId);
    }

    void loadCoachAndAthletes();

    return () => {
      cancelled = true;
    };
  }, [athleteIdFromUrl]);

  useEffect(() => {
    if (!selectedAthleteId) return;

    window.localStorage.setItem(STORAGE_KEY, selectedAthleteId);

    if (athleteIdFromUrl === selectedAthleteId) return;

    router.replace(`?athleteId=${selectedAthleteId}`);
  }, [router, selectedAthleteId, athleteIdFromUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!selectedAthleteId) {
        setProfile(null);
        return;
      }

      setLoadingProfile(true);
      setProfileError("");

      const isLinkedAthlete = athletes.some(
        (athlete) => athlete.user_id === selectedAthleteId
      );

      if (!isLinkedAthlete) {
        setProfile(null);
        setProfileError("That athlete is not linked to this coach.");
        setLoadingProfile(false);
        return;
      }

      const { data, error } = await supabase
        .from("athlete_profiles")
        .select(`
          *,
          event:events!athlete_profiles_selected_event_id_fkey (
            id,
            name,
            event_date
          )
        `)
        .eq("user_id", selectedAthleteId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setProfile(null);
        setProfileError(error.message);
        setLoadingProfile(false);
        return;
      }

      setProfile((data as AthleteProfile | null) ?? null);
      setLoadingProfile(false);
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [athletes, selectedAthleteId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestPlan() {
      if (!selectedAthleteId) {
        setLatestPlan(null);
        return;
      }

      setLoadingPlanSummary(true);
      setPlanError("");

      const { data, error } = await supabase
        .from("athlete_plans")
        .select("id, name, is_active, updated_at, created_at, plan_json")
        .eq("athlete_user_id", selectedAthleteId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setLatestPlan(null);
        setPlanError(error.message);
        setLoadingPlanSummary(false);
        return;
      }

      setLatestPlan((data as AthletePlanSummary | null) ?? null);
      setLoadingPlanSummary(false);
    }

    void loadLatestPlan();

    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompletionStats() {
      if (!selectedAthleteId || !latestPlan?.plan_json) {
        setCompletionStats([]);
        return;
      }

      setLoadingStats(true);

      try {
        const { data: completionData, error: completionError } = await supabase
          .from("session_completions")
          .select("*")
          .eq("athlete_user_id", selectedAthleteId)
          .eq("plan_id", latestPlan.id);

        if (cancelled) return;

        if (completionError) {
          console.error("Failed to fetch completion stats:", completionError);
          setCompletionStats([]);
          setLoadingStats(false);
          return;
        }

        const plan = latestPlan.plan_json as any;
        if (!plan?.weeks) {
          setCompletionStats([]);
          setLoadingStats(false);
          return;
        }

        const completionsByWeek = new Map<number, Set<string>>();
        (completionData || []).forEach((c: any) => {
          // Handle both old (0-indexed) and new (1-indexed) week_number formats
          // If week_number is 0 and we're looking at a real week, it's likely old data
          let weekNumber = c.week_number;
          if (weekNumber === 0 && plan.weeks.some((w: any) => w.weekNumber === 1)) {
            weekNumber = 1; // Adjust old 0-indexed data
          }
          if (!completionsByWeek.has(weekNumber)) {
            completionsByWeek.set(weekNumber, new Set());
          }
          completionsByWeek.get(weekNumber)!.add(c.session_id);
        });

        const stats: CompletionStat[] = [];
        const startIdx = Math.max(0, plan.weeks.length - 4);

        for (let i = startIdx; i < plan.weeks.length; i++) {
          const week = plan.weeks[i];
          const totalSessions = (week.sessions || []).filter((s: any) => s.type !== "Rest").length;
          const completed = completionsByWeek.get(week.weekNumber)?.size || 0;
          const completionPct = totalSessions > 0 ? Math.round((completed / totalSessions) * 100) : 0;

          stats.push({
            weekNumber: week.weekNumber,
            weekLabel: `Wk ${week.weekNumber}`,
            totalSessions,
            completed,
            completionPct,
          });
        }

        setCompletionStats(stats);
        setLoadingStats(false);
      } catch (err) {
        console.error("Error loading completion stats:", err);
        setCompletionStats([]);
        setLoadingStats(false);
      }
    }

    void loadCompletionStats();

    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId, latestPlan]);

  useEffect(() => {
    let cancelled = false;

    async function loadAthleteEvents() {
      if (!selectedAthleteId) {
        setAthleteEvents([]);
        return;
      }

      setLoadingEvents(true);

      try {
        const { data, error } = await supabase
          .from("athlete_events")
          .select("*")
          .eq("athlete_user_id", selectedAthleteId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (cancelled) return;

        if (error) {
          console.error("Failed to fetch athlete events:", error);
          setAthleteEvents([]);
          setLoadingEvents(false);
          return;
        }

        setAthleteEvents((data || []) as AthleteEvent[]);
        setLoadingEvents(false);
      } catch (err) {
        console.error("Error loading athlete events:", err);
        setAthleteEvents([]);
        setLoadingEvents(false);
      }
    }

    void loadAthleteEvents();

    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainingCamps() {
      if (!selectedAthleteId) {
        setTrainingCamps([]);
        return;
      }

      setLoadingCamps(true);

      try {
        const { data, error } = await supabase
          .from("training_camps")
          .select("*")
          .eq("athlete_user_id", selectedAthleteId)
          .order("start_date", { ascending: true })
          .limit(20);

        if (cancelled) return;

        if (error) {
          console.error("Failed to fetch training camps:", error);
          setTrainingCamps([]);
          setLoadingCamps(false);
          return;
        }

        setTrainingCamps((data || []) as TrainingCamp[]);
        setLoadingCamps(false);
      } catch (err) {
        console.error("Error loading training camps:", err);
        setTrainingCamps([]);
        setLoadingCamps(false);
      }
    }

    void loadTrainingCamps();

    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId]);

  useEffect(() => {
    let cancelled = false;

    async function loadPendingFeedback() {
      if (!selectedAthleteId || !latestPlan?.id) {
        setPendingFeedback([]);
        return;
      }

      setLoadingFeedback(true);

      try {
        // First, check if ANY feedback exists for this athlete
        const { data: allFeedback, error: allFeedbackError } = await supabase
          .from("athlete_feedback")
          .select("*")
          .eq("athlete_user_id", selectedAthleteId);

        const { data, error } = await supabase
          .from("athlete_feedback")
          .select("*")
          .eq("athlete_user_id", selectedAthleteId)
          .eq("plan_id", latestPlan.id)
          .is("coach_reviewed_at", null)
          .order("submitted_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          console.error("Failed to fetch pending feedback:", error);
          setPendingFeedback([]);
          setLoadingFeedback(false);
          return;
        }

        setPendingFeedback(data || []);
        setLoadingFeedback(false);
      } catch (err) {
        console.error("Error loading pending feedback:", err);
        setPendingFeedback([]);
        setLoadingFeedback(false);
      }
    }

    void loadPendingFeedback();

    return () => {
      cancelled = true;
    };
  }, [selectedAthleteId, latestPlan?.id]);

  const handleReviewFeedback = async (feedbackId: string) => {
    try {
      const { error } = await supabase
        .from("athlete_feedback")
        .update({
          coach_reviewed_at: new Date().toISOString(),
        })
        .eq("id", feedbackId);

      if (error) {
        console.error("Failed to review feedback:", error);
        return;
      }

      // Update local state
      setPendingFeedback(pendingFeedback.filter((f) => f.id !== feedbackId));
    } catch (err) {
      console.error("Error reviewing feedback:", err);
    }
  };

  const handleAcknowledgeEvent = async (eventId: string) => {
    try {
      const { error } = await supabase
        .from("athlete_events")
        .update({
          status: "acknowledged",
          acknowledged_by: coachUserId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", eventId);

      if (error) {
        console.error("Failed to acknowledge event:", error);
        return;
      }

      // Update local state optimistically
      setAthleteEvents(
        athleteEvents.map((e) =>
          e.id === eventId
            ? {
                ...e,
                status: "acknowledged" as const,
              }
            : e
        )
      );
    } catch (err) {
      console.error("Error acknowledging event:", err);
    }
  };

  const handleAcknowledgeTrainingCamp = async (campId: string) => {
    try {
      const { error } = await supabase
        .from("training_camps")
        .update({
          status: "acknowledged",
        })
        .eq("id", campId);

      if (error) {
        console.error("Failed to acknowledge training camp:", error);
        return;
      }

      // Update local state optimistically
      setTrainingCamps(
        trainingCamps.map((c) =>
          c.id === campId
            ? {
                ...c,
                status: "acknowledged" as const,
              }
            : c
        )
      );
    } catch (err) {
      console.error("Error acknowledging training camp:", err);
    }
  };

  function calculatePlanWarnings(plan: AthletePlanSummary | null) {
    if (!plan || typeof plan.plan_json !== "object" || !plan.plan_json) {
      setPlanWarnings([]);
      return;
    }

    const planData = plan.plan_json as any;
    setPlanWarnings(planData.warnings ?? []);
  }

  useEffect(() => {
    calculatePlanWarnings(latestPlan);
  }, [latestPlan]);

  const injuries = normaliseStringArray(profile?.injuries);
  const imbalances = normaliseStringArray(profile?.imbalances);
  const holidays = normaliseStringArray(profile?.holidays);
  const blockedDates = normaliseStringArray(profile?.blocked_dates);

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Coach Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              Athlete Overview
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Use this page as the launch point for planning work for a single athlete.
            </p>
          </div>
        </div>

        {usingFallbackAuth ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Using fallback coach auth: {coachUserId}
          </div>
        ) : null}

        {athletesError ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load athletes: {athletesError}
          </div>
        ) : null}

        {loadingAthletes ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-zinc-600">Loading linked athletes…</p>
          </div>
        ) : null}

        {!loadingAthletes && !selectedAthleteId ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-zinc-600">No athlete selected.</p>
          </div>
        ) : null}

        {selectedAthleteId ? (
          <>
            <div className="mb-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-900">
                    Planning actions for {selectedAthleteName || profile?.full_name || "this athlete"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                    Start a brand new athlete plan, begin from a reusable template, or resume the latest saved athlete plan.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Link
                    href={`/create-plan?athleteId=${selectedAthleteId}&source=scratch`}
                    className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
                  >
                    New Blank Plan
                  </Link>

                  <Link
                    href={`/coach/program-templates?athleteId=${selectedAthleteId}&mode=apply`}
                    className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                  >
                    Use Template
                  </Link>

                  <Link
                    href={`/coach?athleteId=${selectedAthleteId}`}
                    className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                  >
                    Open Current Plan
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Athlete
                  </div>
                  <div className="mt-2 text-sm text-zinc-900">
                    <div className="font-semibold">{selectedAthleteName || profile?.full_name || "—"}</div>
                    {profile?.tags && profile.tags.length > 0 && (
                      <div className="mt-2 text-xs text-zinc-600">
                        {(() => {
                          const experience = profile.tags.filter((t: string) =>
                            ["ultramarathoner", "trail_runner", "road_runner", "desert_racing", "multi_day_racing"].includes(t)
                          );
                          const injuries = profile.tags.filter((t: string) =>
                            t.includes("pain") || t.includes("issue") || t.includes("syndrome") || t.includes("fasciitis") ||
                            t.includes("splint") || t.includes("fracture") || t.includes("tendinitis")
                          );
                          const parts: string[] = [];
                          if (experience.length > 0) {
                            const expLabels = experience.map((t: string) =>
                              t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
                            );
                            parts.push(expLabels.slice(0, 2).join(", "));
                          }
                          if (injuries.length > 0) {
                            parts.push(`${injuries.length} injury concern${injuries.length > 1 ? "s" : ""}`);
                          }
                          return parts.slice(0, 2).join(" • ");
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Latest plan
                  </div>
                  <div className="mt-2 text-sm text-zinc-900">
                    {loadingPlanSummary
                      ? "Loading…"
                      : latestPlan?.name || "No saved plan yet"}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Last updated
                  </div>
                  <div className="mt-2 text-sm text-zinc-900">
                    {loadingPlanSummary
                      ? "Loading…"
                      : latestPlan
                        ? formatDateTime(latestPlan.updated_at)
                        : "—"}
                  </div>
                </div>
              </div>

              {planError ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Could not load latest plan summary: {planError}
                </div>
              ) : null}
            </div>

            {/* Tabs */}
            <div className="mb-6 flex border-b border-zinc-200 gap-0 overflow-x-auto">
              {(["profile", "health", "dates", "plans", "warnings"] as const).map((tab) => {
                const isActive = activeTab === tab;
                const warningCount = planWarnings.length;
                const tabLabels: Record<typeof tab, string> = {
                  profile: "Profile",
                  health: "Health",
                  dates: "Important Dates",
                  plans: "Plans",
                  warnings: "Warnings",
                };
                let label = tabLabels[tab];
                if (tab === "warnings" && warningCount > 0 && !isActive) {
                  label = `${label} (${warningCount})`;
                }
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition ${
                      isActive
                        ? "border-zinc-900 text-zinc-900"
                        : "border-transparent text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Profile Tab */}
            {activeTab === "profile" && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-zinc-900">
                  {selectedAthleteName || profile?.full_name || "Unnamed athlete"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">Basic information</p>

                {loadingProfile ? (
                  <p className="mt-4 text-sm text-zinc-600">Loading athlete profile…</p>
                ) : profileError ? (
                  <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {profileError}
                  </p>
                ) : !profile ? (
                  <p className="mt-4 text-sm text-zinc-600">No athlete profile found.</p>
                ) : (
                  <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Full name</dt>
                      <dd className="mt-2 text-sm text-zinc-900">{profile.full_name || "—"}</dd>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Date of birth</dt>
                      <dd className="mt-2 text-sm text-zinc-900">{formatDate(profile.date_of_birth)}</dd>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Member since</dt>
                      <dd className="mt-2 text-sm text-zinc-900">{formatDate(profile.created_at)}</dd>
                    </div>
                  </dl>
                )}
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">Event Details</h2>
                <dl className="mt-5 space-y-4">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Selected event</dt>
                    <dd className="mt-1 break-all text-sm text-zinc-900">{profile?.event?.name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Event date</dt>
                    <dd className="mt-1 text-sm text-zinc-900">{formatDate(profile?.event?.event_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Weeks from today</dt>
                    <dd className="mt-1 text-sm text-zinc-900">{getWeeksFromToday(profile?.event?.event_date)}</dd>
                  </div>
                  {profile && profile.event_profile != null && (
                    <div className="col-span-full">
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700">
                          Event profile (details)
                        </summary>
                        <div className="mt-2">
                          <pre className="overflow-x-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">
                            {formatJson(profile.event_profile)}
                          </pre>
                        </div>
                      </details>
                    </div>
                  )}
                </dl>
              </div>
            </div>
            )}

            {/* Health Tab */}
            {activeTab === "health" && (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-900 mb-6">Health & Constraints</h2>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Injuries</h3>
                  {injuries.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {injuries.map((injury) => (
                        <li key={injury} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                          {injury}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500">No injuries recorded.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Imbalances</h3>
                  {imbalances.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {imbalances.map((imbalance) => (
                        <li key={imbalance} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                          {imbalance}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500">No imbalances recorded.</p>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Dates Tab */}
            {activeTab === "dates" && (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-900 mb-6">Important Dates</h2>

              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Holidays</h3>
                  {athleteEvents.filter(e => e.event_type === 'holiday').length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {athleteEvents
                        .filter(e => e.event_type === 'holiday' && e.start_date && e.end_date)
                        .map((holiday) => {
                          const startDate = new Date(holiday.start_date!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                          const endDate = new Date(holiday.end_date!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                          return (
                            <li key={holiday.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                              <div className="font-medium text-zinc-900">{holiday.title}</div>
                              <div className="text-xs text-zinc-500 mt-1">{startDate} – {endDate}</div>
                            </li>
                          );
                        })}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500">No holidays recorded.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Blocked Dates</h3>
                  {blockedDates.length > 0 ? (
                    <ul className="mt-4 space-y-2">
                      {blockedDates.map((date) => {
                        const formatted = new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                        return (
                          <li key={date} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                            {formatted}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500">No blocked dates recorded.</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">Training Camps</h3>
                  {trainingCamps.length > 0 ? (
                    <ul className="mt-4 space-y-3">
                      {trainingCamps.map((camp) => (
                        <li
                          key={camp.id}
                          className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-zinc-900 text-sm">{camp.title}</div>
                              {camp.location && (
                                <div className="text-xs text-zinc-600 mt-1">{camp.location}</div>
                              )}
                              <div className="text-xs text-zinc-500 mt-1">
                                {new Date(camp.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {new Date(camp.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </div>

                              {/* Terrain pills */}
                              {camp.terrain_types.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {camp.terrain_types.map((terrain) => {
                                    const label = TERRAIN_OPTIONS.find((t) => t.value === terrain)?.label || terrain;
                                    return (
                                      <span key={terrain} className="inline-block bg-violet-100 text-violet-800 text-xs px-2 py-1 rounded">
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Climate pills */}
                              {camp.climate_types.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {camp.climate_types.map((climate) => {
                                    const label = CLIMATE_OPTIONS.find((c) => c.value === climate)?.label || climate;
                                    return (
                                      <span key={climate} className="inline-block bg-violet-100 text-violet-800 text-xs px-2 py-1 rounded">
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Pack carry & back-to-back icons */}
                              {(camp.has_pack_carry || camp.back_to_back_sessions) && (
                                <div className="flex gap-2 mt-2">
                                  {camp.has_pack_carry && (
                                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded">
                                      🎒 Pack
                                    </span>
                                  )}
                                  {camp.back_to_back_sessions && (
                                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded">
                                      📅 B2B
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Status or Acknowledge Button */}
                            {camp.status === "pending" ? (
                              <button
                                onClick={() => void handleAcknowledgeTrainingCamp(camp.id)}
                                className="text-xs font-semibold px-3 py-1 rounded whitespace-nowrap mt-1 bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                              >
                                Acknowledge
                              </button>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-1 rounded whitespace-nowrap mt-1 bg-green-100 text-green-900">
                                Acknowledged
                              </span>
                            )}
                          </div>

                          {/* Deload Warning */}
                          {needsDeloadWarning(camp.start_date, latestPlan) && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                              No deload week detected before this camp. Consider reducing load the week prior.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500">No training camps logged.</p>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Plans Tab */}
            {activeTab === "plans" && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">Latest Plan</h2>
                <p className="mt-1 text-sm text-zinc-500">Overview of the active training plan</p>

                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Plan name</dt>
                    <dd className="mt-2 text-sm text-zinc-900">
                      {loadingPlanSummary ? "Loading…" : latestPlan?.name || "No saved plan yet"}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Last updated</dt>
                    <dd className="mt-2 text-sm text-zinc-900">
                      {loadingPlanSummary ? "Loading…" : latestPlan ? formatDateTime(latestPlan.updated_at) : "—"}
                    </dd>
                  </div>
                </dl>

                {planError && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    Could not load latest plan summary: {planError}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Training completion
                  </h2>
                  {loadingStats ? (
                    <p className="mt-4 text-sm text-zinc-600">Loading stats…</p>
                  ) : completionStats.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-600">No completion data yet.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {completionStats.map((stat) => (
                        <div key={stat.weekNumber} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-zinc-900">{stat.weekLabel}</span>
                            <span className="text-zinc-600">
                              {stat.completed}/{stat.totalSessions} ({stat.completionPct}%)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-zinc-100">
                            <div
                              className="h-2 rounded-full bg-zinc-900 transition-all"
                              style={{ width: `${stat.completionPct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Athlete reports
                  </h2>
                  {loadingEvents ? (
                    <p className="mt-4 text-sm text-zinc-600">Loading reports…</p>
                  ) : athleteEvents.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-600">No reports yet.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {athleteEvents.map((event) => {
                        const isPending = event.status === "pending";
                        const isInjury = event.event_type === "injury";

                        return (
                          <div
                            key={event.id}
                            className={`rounded-2xl p-3 ${
                              isPending
                                ? "border border-amber-200 bg-amber-50"
                                : "border border-zinc-200 bg-zinc-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-semibold text-zinc-900 truncate">
                                    {event.title}
                                  </h3>
                                  <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap ${
                                      isInjury
                                        ? "bg-red-100 text-red-900"
                                        : "bg-blue-100 text-blue-900"
                                    }`}
                                  >
                                    {isInjury ? "Injury" : "Holiday"}
                                  </span>
                                </div>
                                {event.description && (
                                  <p className="mt-1 text-xs text-zinc-600 line-clamp-2">
                                    {event.description}
                                  </p>
                                )}
                                <p className="mt-1 text-xs text-zinc-500">
                                  {new Date(event.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              {isPending && (
                                <button
                                  onClick={() => handleAcknowledgeEvent(event.id)}
                                  className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 transition-colors"
                                >
                                  Ack
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Monthly Feedback
                  </h2>
                  {loadingFeedback ? (
                    <p className="mt-4 text-sm text-zinc-600">Loading feedback…</p>
                  ) : pendingFeedback.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-600">No pending feedback.</p>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {pendingFeedback.map((feedback) => (
                        <div
                          key={feedback.id}
                          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                        >
                          <div className="mb-3">
                            <h3 className="font-semibold text-amber-900">
                              Month {feedback.month_number} Feedback
                            </h3>
                            <p className="text-xs text-amber-700 mt-1">
                              Submitted {new Date(feedback.submitted_at).toLocaleDateString()}
                            </p>
                          </div>

                          <div className="space-y-2 text-sm text-amber-900 mb-4 bg-white bg-opacity-50 p-3 rounded">
                            {feedback.what_went_well && (
                              <div>
                                <p className="font-semibold text-xs text-amber-800">Went well:</p>
                                <p className="text-xs line-clamp-2">
                                  {feedback.what_went_well}
                                </p>
                              </div>
                            )}
                            {feedback.overall_feeling && (
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-xs text-amber-800">
                                  Overall feeling:
                                </p>
                                <p className="text-sm font-bold">
                                  {feedback.overall_feeling}/10
                                </p>
                              </div>
                            )}
                            {feedback.new_injuries && (
                              <div>
                                <p className="font-semibold text-xs text-red-800">
                                  ⚠ Injuries:
                                </p>
                                <p className="text-xs line-clamp-2">
                                  {feedback.new_injuries}
                                </p>
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleReviewFeedback(feedback.id)}
                            className="w-full rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 transition-colors"
                          >
                            Mark as Reviewed
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
            </div>
            )}

            {/* Warnings Tab */}
            {activeTab === "warnings" && (
              <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-zinc-900">Plan Warnings</h2>
                {planWarnings.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-600">No warnings. Plan looks good!</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {planWarnings.map((warning, i) => (
                      <div key={i} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-lg">⚠️</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-amber-900">
                              {warning.message || warning.type}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
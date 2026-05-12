"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";
import { SEGMENT_EXPLANATIONS } from "@/lib/constants/segment-explanations";

type RaceData = {
  id: string;
  name: string;
  location: string | null;
  distance_km: number | null;
};

type SegmentTag = {
  tag: string;
  start_km: number;
  end_km: number;
};

type MatchedSession = {
  sessionName: string;
  sessionType: string;
  weeks: number[];
  isKeySession: boolean;
  terrain?: string;
  elevationGainMeters?: number;
  packWeightKg?: number;
  trainingPhases: string[];
};

type SegmentStrategy = SegmentTag & {
  matchingSessionsWithWeeks: MatchedSession[];
};

type TemplateWithAimTags = {
  id: string;
  name: string;
  aim_tags: string[];
};

export default function RaceSummaryPage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [raceData, setRaceData] = useState<RaceData | null>(null);
  const [raceSegments, setRaceSegments] = useState<SegmentStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templateMap, setTemplateMap] = useState<Map<string, TemplateWithAimTags>>(new Map());

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

        // Fetch athlete's active plan and profile
        const [planResult, profileResult] = await Promise.all([
          supabase
            .from("athlete_plans")
            .select("id, plan_json, event_id")
            .eq("athlete_user_id", user.id)
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("athlete_profiles")
            .select("selected_event_id")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const { data: planData, error: planError } = planResult;
        const { data: profileData, error: profileError } = profileResult;

        if (planError) {
          setError("Failed to load plan");
          setLoading(false);
          return;
        }

        if (profileError) {
          setError("Failed to load profile");
          setLoading(false);
          return;
        }

        if (!planData?.plan_json) {
          setError("No active plan found");
          setLoading(false);
          return;
        }

        const loadedPlan = planData.plan_json as GeneratedPlan;
        setPlan(loadedPlan);

        // Extract all session template IDs from plan
        const templateIds = new Set<string>();
        loadedPlan.weeks.forEach((week) => {
          week.sessions.forEach((session) => {
            const templateId = (session as any).sourceSessionTemplateId;
            if (templateId) {
              templateIds.add(templateId);
            }
          });
        });

        // Fetch session templates with aim_tags
        const templates = new Map<string, TemplateWithAimTags>();
        if (templateIds.size > 0) {
          const { data: templatesData, error: templatesError } = await supabase
            .from("session_templates")
            .select("id, name, session_data")
            .in("id", Array.from(templateIds));

          if (!templatesError && templatesData) {
            templatesData.forEach((template: any) => {
              const sessionData = template.session_data ?? {};
              const aimTags = sessionData.aim_tags || [];
              templates.set(template.id, {
                id: template.id,
                name: template.name,
                aim_tags: aimTags,
              });
            });
          }
        }
        setTemplateMap(templates);

        // Get race ID from athlete's selected_event_id (current goal) or fallback to plan's event_id
        const raceId = profileData?.selected_event_id || planData.event_id;

        if (!raceId) {
          setError("No race assigned");
          setLoading(false);
          return;
        }

        // Sync athlete_plans.event_id to match the current selected_event_id
        if (profileData?.selected_event_id && planData.event_id !== profileData.selected_event_id) {
          await supabase
            .from("athlete_plans")
            .update({ event_id: profileData.selected_event_id })
            .eq("id", planData.id);
        }

        // Fetch race details
        const { data: races, error: raceError } = await supabase
          .from("races")
          .select("*")
          .match({ id: raceId });

        if (raceError) {
          console.error("Race fetch error:", raceError);
          setError(`Failed to load race details: ${raceError.message}`);
          setLoading(false);
          return;
        }

        const raceRecord = Array.isArray(races) ? races[0] : races;
        if (!raceRecord) {
          console.error("No race found with id:", raceId);
          setError(`Race with ID ${raceId} not found. The plan may reference a race that has been deleted.`);
          setLoading(false);
          return;
        }

        setRaceData({
          id: raceRecord.id,
          name: raceRecord.name,
          location: raceRecord.location,
          distance_km: raceRecord.distance_km,
        });

        // Fetch race segment tags
        const { data: segmentTags, error: segmentsError } = await supabase
          .from("race_segment_tags")
          .select("tag, start_km, end_km")
          .eq("race_id", raceId)
          .order("start_km", { ascending: true });

        if (segmentsError) {
          setError("Failed to load race segments");
          setLoading(false);
          return;
        }

        // Match sessions to segments
        const strategies = (segmentTags || []).map((segment) => {
          const matchingSessionsWithWeeks = findMatchingSessionsForSegment(
            loadedPlan,
            segment.tag,
            templates
          );
          return {
            ...segment,
            matchingSessionsWithWeeks,
          };
        });

        setRaceSegments(strategies);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const findMatchingSessionsForSegment = (
    plan: GeneratedPlan,
    segmentTag: string,
    templates: Map<string, TemplateWithAimTags>
  ) => {
    const matchingByName = new Map<
      string,
      {
        sessionType: string;
        weeks: number[];
        isKeySession: boolean;
        terrain?: string;
        elevationGainMeters?: number;
        packWeightKg?: number;
        trainingPhases: string[];
      }
    >();

    plan.weeks.forEach((week) => {
      week.sessions.forEach((session) => {
        const sessionType = (session as any).type;
        const templateId = (session as any).sourceSessionTemplateId;
        const isKeySession = (session as any).isKeySession ?? false;
        const terrain = (session as any).terrain;
        const elevationGainMeters = (session as any).elevationGainMeters;
        const packWeightKg = (session as any).packWeightKg;

        let sessionAimTags: string[] = [];

        // First try to get aim_tags from the template
        if (templateId && templates.has(templateId)) {
          sessionAimTags = templates.get(templateId)!.aim_tags;
        }

        // Fallback to checking embedded aimTags in plan
        if (sessionAimTags.length === 0) {
          sessionAimTags = (session as any).aimTags || [];
        }

        if (sessionAimTags.includes(segmentTag)) {
          const key = session.name;
          if (!matchingByName.has(key)) {
            matchingByName.set(key, {
              sessionType,
              weeks: [],
              isKeySession,
              terrain,
              elevationGainMeters,
              packWeightKg,
              trainingPhases: [],
            });
          }
          const entry = matchingByName.get(key)!;
          entry.weeks.push(week.weekNumber);

          const phase = week.trainingPurpose || week.phase;
          if (phase && !entry.trainingPhases.includes(phase)) {
            entry.trainingPhases.push(phase);
          }
        }
      });
    });

    return Array.from(matchingByName.entries()).map(([sessionName, data]) => ({
      sessionName,
      sessionType: data.sessionType,
      weeks: Array.from(new Set(data.weeks)).sort((a, b) => a - b),
      isKeySession: data.isKeySession,
      terrain: data.terrain,
      elevationGainMeters: data.elevationGainMeters,
      packWeightKg: data.packWeightKg,
      trainingPhases: data.trainingPhases,
    }));
  };

  const getSegmentExplanation = (tag: string) => {
    return SEGMENT_EXPLANATIONS[tag];
  };

  const getPhaseLabel = (phase: string): string => {
    if (phase.toLowerCase().includes("base")) return "Base";
    if (phase.toLowerCase().includes("build")) return "Build";
    if (phase.toLowerCase().includes("peak")) return "Peak";
    if (phase.toLowerCase().includes("taper")) return "Taper";
    if (phase.toLowerCase().includes("recovery")) return "Recovery";
    if (phase.toLowerCase().includes("race")) return "Race Week";
    return phase;
  };

  const getPhaseColor = (phase: string): string => {
    const normalized = phase.toLowerCase();
    if (normalized.includes("base")) return "bg-blue-100 text-blue-700";
    if (normalized.includes("build")) return "bg-orange-100 text-orange-700";
    if (normalized.includes("peak")) return "bg-red-100 text-red-700";
    if (normalized.includes("taper")) return "bg-purple-100 text-purple-700";
    if (normalized.includes("recovery")) return "bg-emerald-100 text-emerald-700";
    if (normalized.includes("race")) return "bg-rose-100 text-rose-700";
    return "bg-zinc-100 text-zinc-700";
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-600">Loading race summary…</p>
          </div>
        </div>
      </main>
    );
  }

  if (error || !plan || !raceData) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="text-red-700">{error || "Failed to load race summary"}</p>
          </div>
        </div>
      </main>
    );
  }

  const uniqueSegmentTags = raceSegments.map((s) => s.tag);
  const hasSegments = raceSegments.length > 0;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Race Header */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">{raceData.name}</h1>
          {raceData.location && <p className="mt-1 text-sm text-zinc-600">{raceData.location}</p>}

          {raceData.distance_km && (
            <div className="mt-6">
              <p className="text-xs text-zinc-500">Distance</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{raceData.distance_km} km</p>
            </div>
          )}
        </div>

        {/* Race Segments and Coach Strategy */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Your Training Strategy</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Your coach has designed your plan to address the specific demands of each section of the race.
          </p>

          {!hasSegments ? (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm text-zinc-600">
                No race segments with training focuses have been assigned yet.
              </p>
            </div>
          ) : (
            <>
              {/* Race Overview Summary */}
              <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-900">
                  <span className="font-semibold">Race overview:</span> Your plan addresses{" "}
                  <span className="font-semibold">{uniqueSegmentTags.length} training focus{uniqueSegmentTags.length !== 1 ? "es" : ""}</span>
                  {uniqueSegmentTags.length > 0 && (
                    <>
                      {" "}
                      —{" "}
                      {uniqueSegmentTags
                        .map((tag) => getSegmentExplanation(tag)?.displayName || tag)
                        .join(", ")}
                    </>
                  )}
                </p>
              </div>

              {/* Segment Cards */}
              <div className="mt-6 space-y-5">
                {raceSegments.map((segment, index) => {
                  const explanation = getSegmentExplanation(segment.tag);
                  return (
                    <div key={index} className="rounded-xl border border-zinc-200 bg-white p-5">
                      {/* Segment Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-zinc-600">
                            {segment.start_km}–{segment.end_km} km
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-zinc-900">
                            {explanation?.displayName || segment.tag}
                          </h3>
                        </div>
                      </div>

                      {/* Course Context */}
                      {explanation && (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                              What this means for the race
                            </p>
                            <p className="mt-2 text-sm text-zinc-700">{explanation.courseContext}</p>
                          </div>

                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                              How your coach is preparing you
                            </p>
                            <p className="mt-2 text-sm text-zinc-700">{explanation.trainingRationale}</p>
                          </div>
                        </div>
                      )}

                      {/* Sessions */}
                      {segment.matchingSessionsWithWeeks.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                            Sessions for this section
                          </p>
                          <div className="mt-3 space-y-2">
                            {segment.matchingSessionsWithWeeks.map((session, sIdx) => (
                              <div
                                key={sIdx}
                                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                              >
                                <div className="flex items-start gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-zinc-900">
                                        {session.sessionName}
                                      </span>
                                      {session.isKeySession && (
                                        <span className="text-lg">★</span>
                                      )}
                                    </div>

                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <span className="inline-block rounded-full bg-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-900">
                                        {session.sessionType}
                                      </span>

                                      {session.trainingPhases.length > 0 && (
                                        <>
                                          {session.trainingPhases.map((phase, pIdx) => (
                                            <span
                                              key={pIdx}
                                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getPhaseColor(phase)}`}
                                            >
                                              {getPhaseLabel(phase)}
                                            </span>
                                          ))}
                                        </>
                                      )}
                                    </div>

                                    {/* Session Details */}
                                    <div className="mt-2 space-y-1 text-xs text-zinc-600">
                                      {session.weeks.length > 0 && (
                                        <p>
                                          <span className="font-medium">Weeks:</span> {session.weeks.join(", ")}
                                        </p>
                                      )}
                                      {session.terrain && (
                                        <p>
                                          <span className="font-medium">Terrain:</span>{" "}
                                          {session.terrain.charAt(0).toUpperCase() + session.terrain.slice(1)}
                                        </p>
                                      )}
                                      {session.elevationGainMeters && (
                                        <p>
                                          <span className="font-medium">Elevation:</span> +{session.elevationGainMeters}m
                                        </p>
                                      )}
                                      {session.packWeightKg && (
                                        <p>
                                          <span className="font-medium">Pack weight:</span> {session.packWeightKg}kg
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <p className="text-sm text-zinc-600">
                            No specific training sessions have been assigned to this segment. Your coach may address
                            this through other training elements.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

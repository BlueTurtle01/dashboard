"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan, PlanSession } from "@/lib/planner/types";

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

type SegmentStrategy = SegmentTag & {
  matchingSessionsWithWeeks: {
    sessionName: string;
    sessionType: string;
    weeks: number[];
  }[];
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

        // Fetch athlete's active plan
        const { data: planData, error: planError } = await supabase
          .from("athlete_plans")
          .select("id, plan_json, event_id")
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

        // Get race ID from athlete_plans event_id column
        const raceId = planData.event_id;

        if (!raceId) {
          setError("Plan does not have a race assigned");
          setLoading(false);
          return;
        }

        // Fetch race details - try without eq filter first to debug
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
          const matchingSessionsWithWeeks = findMatchingSessionsForSegment(loadedPlan, segment.tag, templates);
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
    const matchingByName = new Map<string, { sessionType: string; weeks: number[] }>();

    plan.weeks.forEach((week) => {
      week.sessions.forEach((session) => {
        const sessionType = (session as any).type;
        const templateId = (session as any).sourceSessionTemplateId;

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
            matchingByName.set(key, { sessionType, weeks: [] });
          }
          matchingByName.get(key)!.weeks.push(week.weekNumber);
        }
      });
    });

    return Array.from(matchingByName.entries()).map(([sessionName, data]) => ({
      sessionName,
      sessionType: data.sessionType,
      weeks: Array.from(new Set(data.weeks)).sort((a, b) => a - b),
    }));
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-3xl">
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
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="text-red-700">{error || "Failed to load race summary"}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Race Header */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">{raceData.name}</h1>
          {raceData.location && (
            <p className="mt-1 text-sm text-zinc-600">{raceData.location}</p>
          )}

          {raceData.distance_km && (
            <div className="mt-6">
              <p className="text-xs text-zinc-500">Distance</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{raceData.distance_km} km</p>
            </div>
          )}
        </div>

        {/* Race Segments and Coach Strategy */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Race Segments & Training Strategy</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Here's how your coach is preparing you for each segment of the race:
          </p>

          {raceSegments.length === 0 ? (
            <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm text-zinc-600">No race segments with training focuses have been assigned yet.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {raceSegments.map((segment, index) => (
                <div key={index} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  {/* Segment Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {segment.start_km}–{segment.end_km} km
                      </p>
                      <span className="mt-2 inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-900">
                        {segment.tag}
                      </span>
                    </div>
                  </div>

                  {/* Coach's Strategy */}
                  {segment.matchingSessionsWithWeeks.length > 0 ? (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
                      <p className="text-sm text-zinc-700">
                        The coach has included{" "}
                        <strong>
                          {segment.matchingSessionsWithWeeks
                            .map(
                              (s) =>
                                `${s.sessionType.toLowerCase()} sessions`
                            )
                            .join(" and ")}
                        </strong>{" "}
                        on weeks{" "}
                        <strong>
                          {segment.matchingSessionsWithWeeks
                            .flatMap((s) => s.weeks)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .sort((a, b) => a - b)
                            .join(", ")}
                        </strong>{" "}
                        to train you for the {segment.tag.replace(/-/g, " ")} section.
                      </p>

                      {segment.matchingSessionsWithWeeks.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {segment.matchingSessionsWithWeeks.map((session, sIdx) => (
                            <div key={sIdx} className="text-xs text-zinc-600">
                              <span className="font-semibold">{session.sessionName}</span>
                              {session.weeks.length > 0 && (
                                <span className="text-zinc-500"> — weeks {session.weeks.join(", ")}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
                      <p className="text-sm text-zinc-500">
                        No specific training sessions have been assigned to this segment yet. Your coach may address this through run training.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

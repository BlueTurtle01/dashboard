"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import GymExerciseEditor from "@/components/GymExerciseEditor";
import { planRepository } from "@/lib/data/planRepository";
import { recalculatePlanWarnings } from "@/lib/planner/recalculatePlanWarnings";
import { GymSessionTemplate, getGymSessionTemplateById, searchGymSessionTemplates } from "@/lib/planner/gymSessionTemplates";
import { SessionLibraryItem, getSessionLibraryItemById, searchSessionLibrary } from "@/lib/planner/sessionLibrary";
import {
  GeneratedPlan,
  PlanExercise,
  PlanSession,
  PlanWeek,
} from "@/lib/planner/types";
import { CANONICAL_DAY_ORDER, CANONICAL_DAY_TO_DISPLAY, DAY_ALIASES, normalizeDayLabel } from "@/lib/planner/dayLabels";

function findExistingDayLabelForWeek(
  plan: GeneratedPlan,
  weekId: string,
  canonicalDay: (typeof CANONICAL_DAY_ORDER)[number]
) {
  const labelsForWeek = plan.weeks
    .find((week) => week.id === weekId)
    ?.sessions.map((session) => session.dayLabel) ?? [];

  const matchedExistingLabel = labelsForWeek.find(
    (label) => normalizeDayLabel(label) === canonicalDay
  );

  if (matchedExistingLabel) {
    return matchedExistingLabel;
  }

  return CANONICAL_DAY_TO_DISPLAY[canonicalDay];
}

function getDayOrderIndex(dayLabel: string) {
  return CANONICAL_DAY_ORDER.indexOf(
    normalizeDayLabel(dayLabel) as (typeof CANONICAL_DAY_ORDER)[number]
  );
}

function getPreviousDaySlot(plan: GeneratedPlan, weekId: string, dayLabel: string) {
  const normalizedDayLabel = normalizeDayLabel(dayLabel) as (typeof CANONICAL_DAY_ORDER)[number];
  const dayIndex = CANONICAL_DAY_ORDER.indexOf(normalizedDayLabel);

  if (!plan.weeks.some((week) => week.id === weekId) || dayIndex <= 0) {
    return null;
  }

  const previousCanonicalDay = CANONICAL_DAY_ORDER[dayIndex - 1];

  return {
    weekId,
    dayLabel: findExistingDayLabelForWeek(plan, weekId, previousCanonicalDay),
  };
}

function sortSessionsForWeek(sessions: PlanSession[]) {
  return [...sessions].sort((a, b) => {
    const dayDiff = getDayOrderIndex(a.dayLabel) - getDayOrderIndex(b.dayLabel);
    if (dayDiff !== 0) return dayDiff;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

function normalisePlanSessionOrdering(plan: GeneratedPlan): GeneratedPlan {
  return {
    ...plan,
    weeks: plan.weeks.map((week) => {
      const sortedSessions = sortSessionsForWeek(week.sessions).map((session, index) => ({
        ...session,
        weekId: week.id,
        sortOrder: index + 1,
      }));

      return {
        ...week,
        sessions: sortedSessions,
      };
    }),
  };
}

const AUTO_MOBILITY_DESCRIPTION = "Auto-added mobility session before gym work.";

function isMobilitySession(session: PlanSession) {
  const nameNormalized = (session.name ?? "").trim().toLowerCase();
  const nameIsMobility = nameNormalized === "mobility" || nameNormalized === "mobility & flexibility";
  const tagIsMobility = (session.tags ?? []).some(
    (tag) => tag.trim().toLowerCase() === "mobility"
  );

  return nameIsMobility || tagIsMobility;
}

function isAutoMobilitySession(session: PlanSession) {
  return (
    session.type === "Recovery" &&
    isMobilitySession(session) &&
    (session.description ?? "").trim() === AUTO_MOBILITY_DESCRIPTION
  );
}

function hasMobilitySession(plan: GeneratedPlan, weekId: string, dayLabel: string) {
  return plan.weeks.some((week) =>
    week.sessions.some((session) => {
      if (session.weekId !== weekId || session.dayLabel !== dayLabel) {
        return false;
      }

      return isMobilitySession(session);
    })
  );
}

function reconcileMobilitySessionsBeforeGym(plan: GeneratedPlan) {
  const planWithoutAutoMobility: GeneratedPlan = {
    ...plan,
    weeks: plan.weeks.map((week) => ({
      ...week,
      sessions: week.sessions.filter((session) => !isAutoMobilitySession(session)),
    })),
  };

  const requiredSlots = new Map<string, { weekId: string; dayLabel: string }>();

  for (const week of planWithoutAutoMobility.weeks) {
    for (const session of week.sessions) {
      if (session.type !== "Gym") {
        continue;
      }

      const previousDaySlot = getPreviousDaySlot(
        planWithoutAutoMobility,
        session.weekId,
        session.dayLabel
      );

      if (!previousDaySlot) {
        continue;
      }

      requiredSlots.set(
        `${previousDaySlot.weekId}::${previousDaySlot.dayLabel}`,
        previousDaySlot
      );
    }
  }

  let nextPlan = planWithoutAutoMobility;

  for (const { weekId, dayLabel } of requiredSlots.values()) {
    if (hasMobilitySession(nextPlan, weekId, dayLabel)) {
      continue;
    }

    const targetWeek = nextPlan.weeks.find((week) => week.id === weekId);
    const dayIndex = CANONICAL_DAY_ORDER.indexOf(
      normalizeDayLabel(dayLabel) as (typeof CANONICAL_DAY_ORDER)[number]
    );
    const existingSortOrdersForDay =
      targetWeek?.sessions
        .filter((existingSession) => existingSession.dayLabel === dayLabel)
        .map((existingSession) => existingSession.sortOrder) ?? [];

    const mobilitySession: PlanSession = {
      id: `session-${Date.now()}-mobility-${Math.random().toString(36).slice(2, 8)}`,
      weekId,
      sortOrder:
        existingSortOrdersForDay.length > 0
          ? Math.min(...existingSortOrdersForDay) - 0.1
          : dayIndex >= 0
          ? dayIndex + 1
          : 0,
      dayLabel,
      type: "Recovery",
      name: "Mobility",
      description: AUTO_MOBILITY_DESCRIPTION,
      tags: ["Mobility"],
      duration: "20 min",
      intensity: "Very Easy",
      isKeySession: false,
      exercises: [],
    };

    nextPlan = {
      ...nextPlan,
      weeks: nextPlan.weeks.map((week) =>
        week.id === weekId
          ? {
              ...week,
              sessions: [...week.sessions, mobilitySession].sort(
                (a, b) => a.sortOrder - b.sortOrder
              ),
            }
          : week
      ),
    };
  }

  return normalisePlanSessionOrdering(nextPlan);
}

function findSessionInPlan(plan: GeneratedPlan, targetSessionId: string) {
  for (const currentWeek of plan.weeks) {
    const matchedSession = currentWeek.sessions.find(
      (currentSession) => currentSession.id === targetSessionId
    );

    if (matchedSession) {
      return {
        session: matchedSession,
        week: currentWeek,
      };
    }
  }

  return null;
}

async function buildExercisesFromGymTemplate(templateId: string, sessionId: string): Promise<PlanExercise[]> {
  const template = await getGymSessionTemplateById(templateId);
  if (!template) return [];

  return template.exercises.map((exercise, index) => ({
    id: `${sessionId}-exercise-${index + 1}`,
    sessionId,
    sortOrder: index + 1,
    name: exercise.name,
    description: exercise.description,
    tags: exercise.tags,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
  }));
}


async function buildExercisesFromSessionTemplate(templateId: string, sessionId: string): Promise<PlanExercise[]> {
  const template = await getSessionLibraryItemById(templateId);
  if (!template) return [];

  return (template.exercises ?? []).map((exercise, index) => ({
    id: `${sessionId}-exercise-${index + 1}`,
    sessionId,
    sortOrder: index + 1,
    name: exercise.name,
    description: exercise.description,
    tags: exercise.tags ?? [],
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
  }));
}


export default function SessionEditPage() {
  const params = useParams();
  const rawSessionId = params?.sessionId;
  const sessionId =
    typeof rawSessionId === "string"
      ? rawSessionId
      : Array.isArray(rawSessionId)
      ? rawSessionId[0]
      : undefined;

  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [session, setSession] = useState<PlanSession | null>(null);
  const [week, setWeek] = useState<PlanWeek | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedGymTemplateId, setSelectedGymTemplateId] = useState("");
  const [gymTemplateSearch, setGymTemplateSearch] = useState("");
  const [sessionTemplateSearch, setSessionTemplateSearch] = useState("");
  const [showGymTemplatePrompt, setShowGymTemplatePrompt] = useState(false);

  const [filteredGymTemplates, setFilteredGymTemplates] = useState<GymSessionTemplate[]>([]);
  const [filteredSessionTemplates, setFilteredSessionTemplates] = useState<SessionLibraryItem[]>([]);

  useEffect(() => {
    searchGymSessionTemplates(gymTemplateSearch).then(setFilteredGymTemplates);
  }, [gymTemplateSearch]);

  useEffect(() => {
    searchSessionLibrary(sessionTemplateSearch).then(setFilteredSessionTemplates);
  }, [sessionTemplateSearch]);

  useEffect(() => {
    if (!sessionId) return;

    const activePlan = planRepository.getActivePlan();
    if (!activePlan) return;

    const match = findSessionInPlan(activePlan, sessionId);
    if (!match) {
      setPlan(activePlan);
      setSession(null);
      setWeek(null);
      return;
    }

    setPlan(activePlan);
    setSession(match.session);
    setWeek(match.week);
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;

    if (session.type !== "Gym") {
      setShowGymTemplatePrompt(false);
      return;
    }

    if ((session.exercises ?? []).length === 0) {
      setShowGymTemplatePrompt(true);
    }
  }, [session]);

  function saveAndRefresh(nextPlan: GeneratedPlan, message = "Session updated.") {
    if (!sessionId) return;

    const adjustedPlan = reconcileMobilitySessionsBeforeGym(nextPlan);
    const recalculated = recalculatePlanWarnings(adjustedPlan);
    planRepository.saveActivePlan(recalculated);

    const match = findSessionInPlan(recalculated, sessionId);

    setPlan(recalculated);
    setSession(match?.session ?? null);
    setWeek(match?.week ?? null);
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), 1200);
  }

  function applyUpdate(
    updater: (current: PlanSession) => PlanSession,
    message = "Session updated."
  ) {
    if (!plan || !sessionId || !session) return;

    let updated = false;

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((planWeek) => ({
        ...planWeek,
        sessions: planWeek.sessions.map((planSession) => {
          if (planSession.id !== sessionId) {
            return planSession;
          }

          updated = true;
          return updater(planSession);
        }),
      })),
    };

    if (!updated) return;

    saveAndRefresh(nextPlan, message);
  }

  function applyUpdateEnsuringMobility(
    updater: (current: PlanSession) => PlanSession,
    message = "Session updated."
  ) {
    if (!plan || !sessionId || !session) return;

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((planWeek) => ({
        ...planWeek,
        sessions: planWeek.sessions.map((planSession) => {
          if (planSession.id !== sessionId) {
            return planSession;
          }

          return updater(planSession);
        }),
      })),
    };

    const adjustedPlan = reconcileMobilitySessionsBeforeGym(nextPlan);
    saveAndRefresh(adjustedPlan, message);
  }


  async function applyGymTemplate(templateId: string) {
    if (!templateId || !session) return;

    const template = await getGymSessionTemplateById(templateId);
    if (!template) return;

    const exercises = await buildExercisesFromGymTemplate(template.id, session.id);

    setSelectedGymTemplateId(templateId);
    setShowGymTemplatePrompt(false);

    applyUpdateEnsuringMobility(
      (current) => ({
        ...current,
        type: "Gym",
        name: template.name,
        description: template.description,
        tags: template.tags,
        duration: template.duration,
        intensity: template.intensity,
        isKeySession: template.isKeySession,
        exercises,
      }),
      `${template.name} template applied.`
    );
  }


  async function applySessionTemplate(templateId: string) {
    if (!templateId) return;

    const template = await getSessionLibraryItemById(templateId);
    if (!template) return;

    const exercises =
      template.type === "Gym"
        ? await buildExercisesFromSessionTemplate(template.id, session?.id ?? "")
        : [];

    applyUpdateEnsuringMobility(
      (current) => ({
        ...current,
        type: template.type,
        name: template.name,
        description: template.description,
        tags: template.tags,
        duration: template.duration,
        intensity: template.intensity,
        isKeySession: template.isKeySession,
        exercises,
      }),
      `${template.name} template applied.`
    );

    if (template.type === "Gym") {
      setShowGymTemplatePrompt((template.exercises ?? []).length === 0);
    } else {
      setSelectedGymTemplateId("");
      setGymTemplateSearch("");
      setShowGymTemplatePrompt(false);
    }
  }

  function updateGymExercises(exercises: PlanExercise[]) {
    if (!plan || !sessionId) return;

    let updated = false;

    const nextPlan: GeneratedPlan = {
      ...plan,
      weeks: plan.weeks.map((planWeek) => ({
        ...planWeek,
        sessions: planWeek.sessions.map((planSession) => {
          if (planSession.id !== sessionId) {
            return planSession;
          }

          updated = true;
          return {
            ...planSession,
            exercises,
          };
        }),
      })),
    };

    if (!updated) return;

    saveAndRefresh(nextPlan, "Exercises updated.");
  }

  function handleSaveSnapshot() {
    if (!plan) return;
    planRepository.saveSnapshot(plan);
    setStatusMessage("Snapshot saved.");
    window.setTimeout(() => setStatusMessage(""), 2000);
  }

  if (!session) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold">Session not found</h1>
            <p className="mt-3 text-zinc-600">
              The selected session could not be found in the active plan.
            </p>
            <Link
              href="/coach"
              className="mt-6 inline-flex rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              Back to Coach Calendar
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Session</h1>
            <p className="mt-3 max-w-3xl text-zinc-600">
              Make focused edits to this session without scanning the whole plan.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/coach"
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            >
              Back to Coach Calendar
            </Link>
            <button
              onClick={handleSaveSnapshot}
              className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              Save Snapshot
            </button>
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="space-y-8">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Session Summary</h2>
              <div className="mt-4 space-y-4">
                <SummaryItem label="Session ID" value={session.id} />
                <SummaryItem label="Week" value={week ? `Week ${week.weekNumber}` : "—"} />
                <SummaryItem label="Day" value={session.dayLabel} />
                <SummaryItem label="Type" value={session.type} />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Meta</h2>
              <div className="mt-4 space-y-4">
                <SummaryItem label="Duration" value={session.duration || "—"} />
                <SummaryItem label="Intensity" value={session.intensity || "—"} />
                <SummaryItem label="Key Session" value={session.isKeySession ? "Yes" : "No"} />
                <SummaryItem label="Tags" value={(session.tags ?? []).join(", ") || "—"} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Edit Session</h2>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-900">
                        Session Template
                      </div>
                      <p className="mt-1 text-sm text-zinc-600">
                        Choose a run or general session template to prefill duration, terrain, steepness, tempo, and intensity in one click.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end">
                    <div className="min-w-0">
                      <label className="block">
                        <span className="mb-2 block text-sm font-medium text-zinc-700">
                          Search Session Templates
                        </span>
                        <input
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                          value={sessionTemplateSearch}
                          onChange={(e) => setSessionTemplateSearch(e.target.value)}
                          placeholder="e.g. trail hilly 90, tempo road 45, gym"
                        />
                      </label>
                    </div>

                    <div className="min-w-0">
                      <Field label="Current Type">
                        <input
                          className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-4 py-3 text-zinc-700"
                          value={session.type}
                          readOnly
                        />
                      </Field>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSessionTemplateSearch(session.name ?? "")}
                        className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                      >
                        Match Current Name
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Matching Session Templates
                    </div>

                    <div className="mt-3 space-y-3">
                      {filteredSessionTemplates.length === 0 ? (
                        <div className="text-sm text-zinc-500">
                          No session templates matched that search.
                        </div>
                      ) : (
                        filteredSessionTemplates.slice(0, 8).map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applySessionTemplate(template.id)}
                            className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-zinc-900">{template.name}</div>
                                <div className="mt-1 text-sm text-zinc-600">
                                  {template.description || "—"}
                                </div>
                                <div className="mt-2 text-xs text-zinc-500">
                                  {(template.tags ?? []).join(", ") || "—"}
                                </div>
                              </div>
                              <div className="text-right text-xs text-zinc-500">
                                <div>{template.type}</div>
                                <div className="mt-1">{template.duration || "—"}</div>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Field label="Name">
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                  value={session.name ?? ""}
                  onChange={(e) =>
                    applyUpdate((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Duration">
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                  value={session.duration ?? ""}
                  onChange={(e) =>
                    applyUpdate((current) => ({
                      ...current,
                      duration: e.target.value,
                    }))
                  }
                />
              </Field>

              <Field label="Intensity">
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                  value={session.intensity ?? ""}
                  onChange={(e) =>
                    applyUpdate((current) => ({
                      ...current,
                      intensity: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Description">
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                  value={session.description ?? ""}
                  onChange={(e) =>
                    applyUpdate((current) => ({
                      ...current,
                      description: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <div className="mt-6">
              {session.type === "Gym" ? (
                <div className="space-y-6">
                  <div
                    className={`rounded-2xl border p-4 ${
                      showGymTemplatePrompt
                        ? "border-violet-300 bg-violet-50"
                        : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-zinc-900">
                            Gym Session Template
                          </div>
                          <p className="mt-1 text-sm text-zinc-600">
                            Search gym session templates by name or by tags like Injured Hip, Low Mobility, Shoulders, Pulling, or Post-Race.
                          </p>
                        </div>

                        <Link
                          href="/coach/gym-session-templates"
                          className="inline-flex rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                        >
                          Manage Gym Session Templates
                        </Link>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px_auto] md:items-end">
                        <div className="min-w-0">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-zinc-700">
                              Search Gym Session Templates
                            </span>
                            <input
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                              value={gymTemplateSearch}
                              onChange={(e) => setGymTemplateSearch(e.target.value)}
                              placeholder="e.g. Leg Day, injured hip, low mobility"
                            />
                          </label>
                        </div>

                        <div className="min-w-0">
                          <label className="block">
                            <span className="mb-2 block text-sm font-medium text-zinc-700">
                              Matching Template
                            </span>
                            <select
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                              value={selectedGymTemplateId}
                              onChange={(e) => setSelectedGymTemplateId(e.target.value)}
                            >
                              <option value="">Select a template</option>
                              {filteredGymTemplates.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => applyGymTemplate(selectedGymTemplateId)}
                            disabled={!selectedGymTemplateId}
                            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Apply Template
                          </button>

                          {showGymTemplatePrompt ? (
                            <button
                              type="button"
                              onClick={() => setShowGymTemplatePrompt(false)}
                              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                            >
                              Skip
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Matching Gym Session Templates
                        </div>

                        <div className="mt-3 space-y-3">
                          {filteredGymTemplates.length === 0 ? (
                            <div className="text-sm text-zinc-500">
                              No templates matched that search.
                            </div>
                          ) : (
                            filteredGymTemplates.slice(0, 6).map((template) => (
                              <button
                                key={template.id}
                                type="button"
                                onClick={() => setSelectedGymTemplateId(template.id)}
                                className={`block w-full rounded-xl border px-4 py-3 text-left transition ${
                                  selectedGymTemplateId === template.id
                                    ? "border-zinc-900 bg-zinc-100"
                                    : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-medium text-zinc-900">{template.name}</div>
                                    <div className="mt-1 text-sm text-zinc-600">
                                      {template.description || "—"}
                                    </div>
                                    <div className="mt-2 text-xs text-zinc-500">
                                      {(template.tags ?? []).join(", ") || "—"}
                                    </div>
                                  </div>
                                  <div className="text-xs text-zinc-500">
                                    {(template.exercises ?? []).length} exercises
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <Field label="Gym Exercises">
                    <GymExerciseEditor
                      exercises={session.exercises ?? []}
                      onChange={updateGymExercises}
                    />
                  </Field>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  Use the session template search above to swap this session to any run or general template, then fine-tune the fields below if needed.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 break-all text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

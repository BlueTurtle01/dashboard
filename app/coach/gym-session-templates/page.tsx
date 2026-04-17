"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ExerciseLookupRow = {
  id: string;
  name: string;
  description: string | null;
  pattern: string | null;
};

type SessionTemplateExerciseRow = {
  id: string;
  session_template_id: string;
  exercise_order: number;
  sets: string | null;
  reps: string | null;
  duration: string | null;
  notes: string | null;
  exercise_id: string;
};

type SessionTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  subtype: string | null;
  duration_minutes: number | null;
  target_intensity: string | null;
  session_data: Record<string, unknown> | null;
  is_custom: boolean;
  is_key_session: boolean;
};

type GymSessionExercise = {
  id: string;
  exerciseId: string;
  name: string;
  description: string;
  tags: string[];
  sets: number | null;
  reps: number | null;
  durationSeconds: number | null;
  notes: string;
};

type GymSessionTemplate = {
  id: string;
  name: string;
  description: string;
  duration: string;
  intensity: string;
  tags: string[];
  type: string;
  isCustom: boolean;
  isKeySession: boolean;
  exercises: GymSessionExercise[];
};

function buildTemplateSearchText(template: GymSessionTemplate) {
  return [
    template.name,
    template.description,
    template.duration,
    template.intensity,
    ...(template.tags ?? []),
    ...(template.exercises ?? []).flatMap((exercise) => [
      exercise.name,
      exercise.description,
      ...(exercise.tags ?? []),
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function cloneTemplate(template: GymSessionTemplate): GymSessionTemplate {
  return {
    ...template,
    tags: [...(template.tags ?? [])],
    exercises: (template.exercises ?? []).map((exercise) => ({
      ...exercise,
      tags: [...(exercise.tags ?? [])],
    })),
  };
}

function parseNumberInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;

  return parsed;
}

function parseNullableInteger(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDurationLabel(minutes: number | null) {
  return minutes != null ? `${minutes} min` : "";
}

function extractTemplateTags(sessionData: Record<string, unknown> | null | undefined) {
  const rawTags = sessionData?.tags;
  if (!Array.isArray(rawTags)) return [] as string[];
  return rawTags.filter((value): value is string => typeof value === "string");
}

function hasExerciseValueChanges(original: GymSessionTemplate, draft: GymSessionTemplate) {
  const originalExercises = original.exercises ?? [];
  const draftExercises = draft.exercises ?? [];

  if (originalExercises.length !== draftExercises.length) return true;

  return draftExercises.some((exercise, index) => {
    const originalExercise = originalExercises[index];
    if (!originalExercise) return true;

    return (
      (exercise.sets ?? null) !== (originalExercise.sets ?? null) ||
      (exercise.reps ?? null) !== (originalExercise.reps ?? null) ||
      (exercise.durationSeconds ?? null) !== (originalExercise.durationSeconds ?? null)
    );
  });
}

async function getAllGymSessionTemplates(): Promise<GymSessionTemplate[]> {
  const supabase = createClient();
  const { data: templateRows, error: templateError } = await supabase
    .from("session_templates")
    .select(
      "id, name, description, type, subtype, duration_minutes, target_intensity, session_data, is_custom, is_key_session",
    )
    .eq("type", "gym")
    .order("name", { ascending: true });

  if (templateError) throw templateError;

  const templates = (templateRows ?? []) as SessionTemplateRow[];
  if (templates.length === 0) return [];

  const templateIds = templates.map((template) => template.id);

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("session_template_exercises")
    .select("id, session_template_id, exercise_order, sets, reps, duration, notes, exercise_id")
    .in("session_template_id", templateIds)
    .order("exercise_order", { ascending: true });

  if (exerciseError) throw exerciseError;

  const templateExercises = (exerciseRows ?? []) as SessionTemplateExerciseRow[];
  const exerciseIds = Array.from(new Set(templateExercises.map((row) => row.exercise_id)));

  let exerciseLookup = new Map<string, ExerciseLookupRow>();

  if (exerciseIds.length > 0) {
    const { data: exerciseLookupRows, error: exerciseLookupError } = await supabase
      .from("exercises")
      .select("id, name, description, pattern")
      .in("id", exerciseIds);

    if (exerciseLookupError) throw exerciseLookupError;

    exerciseLookup = new Map(
      ((exerciseLookupRows ?? []) as ExerciseLookupRow[]).map((exercise) => [exercise.id, exercise]),
    );
  }

  const exercisesByTemplateId = new Map<string, GymSessionExercise[]>();

  for (const row of templateExercises) {
    const lookup = exerciseLookup.get(row.exercise_id);
    const current = exercisesByTemplateId.get(row.session_template_id) ?? [];

    current.push({
      id: row.id,
      exerciseId: row.exercise_id,
      name: lookup?.name ?? row.exercise_id,
      description: lookup?.description ?? "",
      tags: lookup?.pattern ? [lookup.pattern] : [],
      sets: parseNullableInteger(row.sets),
      reps: parseNullableInteger(row.reps),
      durationSeconds: parseNullableInteger(row.duration),
      notes: row.notes ?? "",
    });

    exercisesByTemplateId.set(row.session_template_id, current);
  }

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    duration: buildDurationLabel(template.duration_minutes),
    intensity: template.target_intensity ?? "",
    tags: extractTemplateTags(template.session_data),
    type: "Gym",
    isCustom: Boolean(template.is_custom),
    isKeySession: Boolean(template.is_key_session),
    exercises: exercisesByTemplateId.get(template.id) ?? [],
  }));
}

async function loadCustomGymSessionTemplates() {
  const allTemplates = await getAllGymSessionTemplates();
  return allTemplates.filter((template) => template.isCustom);
}

async function createCustomGymSessionTemplate(template: GymSessionTemplate) {
  const supabase = createClient();
  const durationMinutes = parseNullableInteger(template.duration);

  const { data: insertedTemplate, error: templateError } = await supabase
    .from("session_templates")
    .insert({
      name: template.name.trim(),
      description: template.description.trim() || null,
      type: "gym",
      subtype: "strength",
      duration_minutes: durationMinutes,
      target_intensity: template.intensity.trim() || null,
      session_data: { tags: template.tags ?? [] },
      is_custom: true,
      is_key_session: Boolean(template.isKeySession),
    })
    .select("id")
    .single();

  if (templateError || !insertedTemplate?.id) {
    throw templateError ?? new Error("Could not create custom gym session template.");
  }

  const exerciseRows = (template.exercises ?? []).map((exercise, index) => ({
    session_template_id: insertedTemplate.id,
    exercise_id: exercise.exerciseId,
    exercise_order: index + 1,
    sets: exercise.sets != null ? String(exercise.sets) : null,
    reps: exercise.reps != null ? String(exercise.reps) : null,
    duration: exercise.durationSeconds != null ? String(exercise.durationSeconds) : null,
    notes: exercise.notes?.trim() || null,
  }));

  if (exerciseRows.length > 0) {
    const { error: exerciseError } = await supabase
      .from("session_template_exercises")
      .insert(exerciseRows);

    if (exerciseError) {
      await supabase.from("session_templates").delete().eq("id", insertedTemplate.id);
      throw exerciseError;
    }
  }

  return insertedTemplate.id as string;
}

async function updateCustomGymSessionTemplate(template: GymSessionTemplate) {
  const supabase = createClient();
  const { error } = await supabase
    .from("session_templates")
    .update({
      name: template.name.trim(),
    })
    .eq("id", template.id)
    .eq("is_custom", true);

  if (error) throw error;
}

export default function SessionTemplateDashboardPage() {
  const supabase = createClient();
  const [statusMessage, setStatusMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allTemplates, setAllTemplates] = useState<GymSessionTemplate[]>([]);
  const [customTemplates, setCustomTemplates] = useState<GymSessionTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [expandedCustomTemplateId, setExpandedCustomTemplateId] = useState<string | null>(null);

  const [draftTemplates, setDraftTemplates] = useState<Record<string, GymSessionTemplate>>({});
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  const [customTemplateNames, setCustomTemplateNames] = useState<Record<string, string>>({});
  const [savingNameTemplateId, setSavingNameTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setIsLoadingTemplates(true);

      try {
        const [all, custom] = await Promise.all([
          getAllGymSessionTemplates(),
          loadCustomGymSessionTemplates(),
        ]);

        if (!cancelled) {
          const safeAll = Array.isArray(all) ? all : [];
          const safeCustom = Array.isArray(custom) ? custom : [];

          setAllTemplates(safeAll);
          setCustomTemplates(safeCustom);
          setCustomTemplateNames(
            Object.fromEntries(safeCustom.map((template) => [template.id, template.name])),
          );
        }
      } catch (error) {
        console.error("Failed to load gym session templates", error);

        if (!cancelled) {
          setAllTemplates([]);
          setCustomTemplates([]);
          setCustomTemplateNames({});
          setStatusMessage("Failed to load gym session templates.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const defaultTemplatesOnly = allTemplates.filter((template) => !template.isCustom);

    if (!query) return defaultTemplatesOnly;

    return defaultTemplatesOnly.filter((template) =>
      buildTemplateSearchText(template).includes(query),
    );
  }, [allTemplates, searchQuery]);

  function getDisplayedTemplate(template: GymSessionTemplate) {
    return draftTemplates[template.id] ?? template;
  }

  function toggleTemplate(templateId: string) {
    setExpandedTemplateId((current) => {
      const next = current === templateId ? null : templateId;

      if (next === templateId) {
        const template = allTemplates.find((item) => item.id === templateId);
        if (template) {
          setDraftTemplates((currentDrafts) => {
            if (currentDrafts[templateId]) return currentDrafts;
            return {
              ...currentDrafts,
              [templateId]: cloneTemplate(template),
            };
          });
        }
      }

      return next;
    });
  }

  function toggleCustomTemplate(templateId: string) {
    setExpandedCustomTemplateId((current) => (current === templateId ? null : templateId));
  }

  function setCustomTemplateName(templateId: string, value: string) {
    setCustomTemplateNames((current) => ({
      ...current,
      [templateId]: value,
    }));
  }

  function handleExerciseFieldChange(
    templateId: string,
    exerciseIndex: number,
    field: "sets" | "reps" | "durationSeconds",
    value: string,
  ) {
    const parsedValue = parseNumberInput(value);

    setDraftTemplates((currentDrafts) => {
      const existingTemplate = allTemplates.find((template) => template.id === templateId);
      if (!existingTemplate) return currentDrafts;

      const existingDraft = currentDrafts[templateId] ?? cloneTemplate(existingTemplate);

      return {
        ...currentDrafts,
        [templateId]: {
          ...existingDraft,
          exercises: (existingDraft.exercises ?? []).map((exercise, index) => {
            if (index !== exerciseIndex) return exercise;

            return {
              ...exercise,
              [field]: parsedValue,
            };
          }),
        },
      };
    });
  }

  async function refreshTemplates() {
    const [all, custom] = await Promise.all([
      getAllGymSessionTemplates(),
      loadCustomGymSessionTemplates(),
    ]);

    const safeAll = Array.isArray(all) ? all : [];
    const safeCustom = Array.isArray(custom) ? custom : [];

    setAllTemplates(safeAll);
    setCustomTemplates(safeCustom);
    setCustomTemplateNames(
      Object.fromEntries(safeCustom.map((template) => [template.id, template.name])),
    );
  }

  async function handleSaveAsCustomSession(originalTemplate: GymSessionTemplate) {
    const draftTemplate = getDisplayedTemplate(originalTemplate);

    if (!hasExerciseValueChanges(originalTemplate, draftTemplate)) {
      return;
    }

    setSavingTemplateId(originalTemplate.id);

    try {
      const customNameBase = `${originalTemplate.name} (Custom)`;

      const customTemplate: GymSessionTemplate = {
        ...cloneTemplate(draftTemplate),
        id: `custom-${Date.now()}`,
        name: customNameBase,
        type: "Gym",
        isCustom: true,
        isKeySession: false,
        exercises: (draftTemplate.exercises ?? []).map((exercise) => ({
          ...exercise,
          sets: exercise.sets ?? null,
          reps: exercise.reps ?? null,
          durationSeconds: exercise.durationSeconds ?? null,
        })),
      };

      await createCustomGymSessionTemplate(customTemplate);
      await refreshTemplates();

      setDraftTemplates((currentDrafts) => ({
        ...currentDrafts,
        [originalTemplate.id]: cloneTemplate(originalTemplate),
      }));

      setStatusMessage("Custom session saved.");
      window.setTimeout(() => setStatusMessage(""), 2000);
    } catch (error) {
      console.error("Failed to save custom session", error);
      setStatusMessage("Failed to save custom session.");
    } finally {
      setSavingTemplateId(null);
    }
  }

  async function handleSaveCustomTemplateName(template: GymSessionTemplate) {
    const nextName = (customTemplateNames[template.id] ?? "").trim();

    if (!nextName) {
      setStatusMessage("Custom session name is required.");
      return;
    }

    if (nextName === template.name) {
      return;
    }

    setSavingNameTemplateId(template.id);

    try {
      await updateCustomGymSessionTemplate({
        ...template,
        name: nextName,
      });

      await refreshTemplates();
      setStatusMessage("Custom session name updated.");
      window.setTimeout(() => setStatusMessage(""), 2000);
    } catch (error) {
      console.error("Failed to update custom session name", error);
      setStatusMessage("Failed to update custom session name.");
    } finally {
      setSavingNameTemplateId(null);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gym Session Templates</h1>
            <p className="mt-3 max-w-3xl text-zinc-600">
              Browse and view existing gym session templates.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/coach/gym-session-templates/create"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Create Gym Template
            </Link>
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        <div className="space-y-8">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Find Gym Session Templates</h2>

            <div className="mt-4">
              <input
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, tag, description, or exercise"
              />
            </div>

            <div className="mt-4 space-y-4">
              {isLoadingTemplates ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                  Loading gym session templates...
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                  No gym session templates matched that search.
                </div>
              ) : (
                filteredTemplates.map((template) => {
                  const isExpanded = expandedTemplateId === template.id;
                  const displayedTemplate = getDisplayedTemplate(template);
                  const isDirty = hasExerciseValueChanges(template, displayedTemplate);
                  const isSavingThisTemplate = savingTemplateId === template.id;

                  return (
                    <div
                      key={template.id}
                      className={`rounded-xl border p-4 transition ${
                        isExpanded
                          ? "border-zinc-300 bg-white shadow-sm"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTemplate(template.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">
                              {template.name}
                            </div>
                            <div className="mt-1 text-sm text-zinc-600">
                              {template.description || "—"}
                            </div>
                            <div className="mt-2 text-xs text-zinc-500">
                              {template.duration || "—"} · {template.intensity || "—"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {(template.tags ?? []).join(", ") || "—"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {(template.exercises ?? []).length} exercises
                            </div>
                          </div>

                          <div className="shrink-0 text-xs font-semibold text-zinc-500">
                            {isExpanded ? "Hide" : "View"}
                          </div>
                        </div>
                      </button>

                      {isExpanded ? (
                        <div
                          className="mt-4 border-t border-zinc-200 pt-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-sm font-semibold text-zinc-900">
                            Session contents
                          </div>

                          <div className="mt-3 space-y-3">
                            {(displayedTemplate.exercises ?? []).length === 0 ? (
                              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                No exercises in this template.
                              </div>
                            ) : (
                              (displayedTemplate.exercises ?? []).map((exercise, index) => (
                                <div
                                  key={exercise.id || `${template.id}-${index}`}
                                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                                >
                                  <div className="text-sm font-semibold text-zinc-900">
                                    {index + 1}. {exercise.name}
                                  </div>

                                  <div className="mt-1 text-sm text-zinc-600">
                                    {exercise.description || "—"}
                                  </div>

                                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                                    <label className="block">
                                      <span className="mb-1 block text-xs font-medium text-zinc-700">
                                        Sets
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                        value={exercise.sets ?? ""}
                                        onChange={(e) =>
                                          handleExerciseFieldChange(
                                            template.id,
                                            index,
                                            "sets",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </label>

                                    <label className="block">
                                      <span className="mb-1 block text-xs font-medium text-zinc-700">
                                        Reps
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                        value={exercise.reps ?? ""}
                                        onChange={(e) =>
                                          handleExerciseFieldChange(
                                            template.id,
                                            index,
                                            "reps",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </label>

                                    <label className="block">
                                      <span className="mb-1 block text-xs font-medium text-zinc-700">
                                        Duration (seconds)
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                        value={exercise.durationSeconds ?? ""}
                                        onChange={(e) =>
                                          handleExerciseFieldChange(
                                            template.id,
                                            index,
                                            "durationSeconds",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                  </div>

                                  <div className="mt-2 text-xs text-zinc-500">
                                    {(exercise.tags ?? []).join(", ") || "—"}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="mt-4">
                            <button
                              type="button"
                              disabled={!isDirty || isSavingThisTemplate}
                              onClick={() => void handleSaveAsCustomSession(template)}
                              className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${
                                !isDirty || isSavingThisTemplate
                                  ? "cursor-not-allowed border border-zinc-200 bg-zinc-200 text-zinc-500"
                                  : "border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700"
                              }`}
                            >
                              {isSavingThisTemplate ? "Saving..." : "Save as Custom Session"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Custom Gym Session Templates</h2>

            <div className="mt-4 space-y-3">
              {isLoadingTemplates ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                  Loading custom gym session templates...
                </div>
              ) : customTemplates.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                  No custom gym session templates yet.
                </div>
              ) : (
                customTemplates.map((template) => {
                  const isExpanded = expandedCustomTemplateId === template.id;
                  const nameValue = customTemplateNames[template.id] ?? template.name;
                  const isDirty = nameValue.trim() !== template.name;
                  const isSavingThisName = savingNameTemplateId === template.id;

                  return (
                    <div
                      key={template.id}
                      className={`rounded-xl border p-4 transition ${
                        isExpanded
                          ? "border-zinc-300 bg-white shadow-sm"
                          : "border-zinc-200 bg-zinc-50"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCustomTemplate(template.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">
                              {template.name}
                            </div>
                            <div className="mt-1 text-sm text-zinc-600">
                              {template.description || "—"}
                            </div>
                            <div className="mt-2 text-xs text-zinc-500">
                              {template.duration || "—"} · {template.intensity || "—"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {(template.tags ?? []).join(", ") || "—"}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {(template.exercises ?? []).length} exercises
                            </div>
                          </div>

                          <div className="shrink-0 text-xs font-semibold text-zinc-500">
                            {isExpanded ? "Hide" : "View"}
                          </div>
                        </div>
                      </button>

                      {isExpanded ? (
                        <div className="mt-4 border-t border-zinc-200 pt-4">
                          <div className="text-sm font-semibold text-zinc-900">
                            Custom session name
                          </div>

                          <div className="mt-3 flex flex-col gap-3 md:flex-row">
                            <input
                              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                              value={nameValue}
                              onChange={(e) => setCustomTemplateName(template.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              disabled={!isDirty || !nameValue.trim() || isSavingThisName}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleSaveCustomTemplateName(template);
                              }}
                              className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${
                                !isDirty || !nameValue.trim() || isSavingThisName
                                  ? "cursor-not-allowed border border-zinc-200 bg-zinc-200 text-zinc-500"
                                  : "border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700"
                              }`}
                            >
                              {isSavingThisName ? "Saving..." : "Save Name"}
                            </button>
                          </div>

                          <div className="mt-6 text-sm font-semibold text-zinc-900">
                            Session contents
                          </div>

                          <div className="mt-3 space-y-3">
                            {(template.exercises ?? []).length === 0 ? (
                              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                                No exercises in this template.
                              </div>
                            ) : (
                              (template.exercises ?? []).map((exercise, index) => (
                                <div
                                  key={exercise.id || `${template.id}-${index}`}
                                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                                >
                                  <div className="text-sm font-semibold text-zinc-900">
                                    {index + 1}. {exercise.name}
                                  </div>

                                  <div className="mt-1 text-sm text-zinc-600">
                                    {exercise.description || "—"}
                                  </div>

                                  <div className="mt-2 text-xs text-zinc-500">
                                    {(exercise.tags ?? []).join(", ") || "—"}
                                  </div>

                                  <div className="mt-2 text-xs text-zinc-500">
                                    {exercise.sets != null ? `${exercise.sets} sets` : "—"} · {" "}
                                    {exercise.reps != null ? `${exercise.reps} reps` : "—"} · {" "}
                                    {exercise.durationSeconds != null
                                      ? `${exercise.durationSeconds}s`
                                      : "—"}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

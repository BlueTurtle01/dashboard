"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ExerciseSearchRow = {
  id: string;
  name: string;
  description: string;
  pattern: string | null;
  equipment: string[] | null;
};

type SelectedExercise = {
  clientId: string;
  exerciseId: string;
  name: string;
  description: string;
  pattern: string | null;
  equipment: string[] | null;
  sets: string;
  reps: string;
  duration: string;
  notes: string;
};

type ExistingTemplateNameRow = {
  name: string;
};

function buildClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toSubtype(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function getNextVariantNumber(names: string[], difficultyLevel: string, focusArea: string, goal: string) {
  const prefix = `${difficultyLevel} - ${focusArea} - ${goal} - `;
  let maxNumber = 0;

  for (const name of names) {
    if (!name.startsWith(prefix)) continue;

    const suffix = name.slice(prefix.length).trim();
    const number = Number.parseInt(suffix, 10);

    if (!Number.isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  }

  return maxNumber + 1;
}

const focusAreaOptions = [
  "Full Body",
  "Lower Body",
  "Upper Body",
  "Core",
  "Posterior Chain",
  "Push",
  "Pull",
  "Unilateral",
  "Mobility",
  "Rehab",
];

const goalOptions = [
  "Strength",
  "Hypertrophy",
  "Power",
  "Stability",
  "Mobility",
  "Conditioning",
  "Rehab",
];

const difficultyOptions = ["Beginner", "Intermediate", "Advanced"];

const GYM_EQUIPMENT = new Set(["machine", "cable"]);

function resolveSessionLocation(exercises: SelectedExercise[]): "Gym" | "Home" {
  for (const exercise of exercises) {
    if (exercise.equipment?.some((eq) => GYM_EQUIPMENT.has(eq))) return "Gym";
  }
  return "Home";
}

export default function NewGymSessionTemplatePage() {
  const [templateDescription, setTemplateDescription] = useState("");
  const [focusArea, setFocusArea] = useState("");
  const [goal, setGoal] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("");
  const [variantNumber, setVariantNumber] = useState<number | null>(null);
  const [loadingVariantNumber, setLoadingVariantNumber] = useState(false);

  const [exerciseSearch, setExerciseSearch] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [searchingExercises, setSearchingExercises] = useState(false);
  const [exerciseResults, setExerciseResults] = useState<ExerciseSearchRow[]>([]);
  const [allEquipment, setAllEquipment] = useState<string[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(true);
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const templateNamePreview = useMemo(() => {
    if (!difficultyLevel || !focusArea || !goal || variantNumber === null) return "";
    const location = resolveSessionLocation(selectedExercises);
    return `${difficultyLevel} - ${focusArea} - ${goal} - ${variantNumber} (${location})`;
  }, [difficultyLevel, focusArea, goal, variantNumber, selectedExercises]);

  const canSave = useMemo(() => {
    return (
      focusArea.trim().length > 0 &&
      goal.trim().length > 0 &&
      difficultyLevel.trim().length > 0 &&
      variantNumber !== null &&
      selectedExercises.length > 0 &&
      !saving &&
      !loadingVariantNumber
    );
  }, [focusArea, goal, difficultyLevel, variantNumber, selectedExercises.length, saving, loadingVariantNumber]);

  useEffect(() => {
    let cancelled = false;

    async function loadAllEquipment() {
      setLoadingEquipment(true);
      const supabase = createClient();

      // Try to get equipment from exercises table and extract unique equipment values
      const { data, error } = await supabase.from("exercises").select("equipment").not("equipment", "is", null);

      if (!cancelled) {
        setLoadingEquipment(false);
        if (!error && data) {
          // Flatten all equipment arrays and get unique values
          const allEquipmentSet = new Set<string>();
          for (const row of data as { equipment: string[] | null }[]) {
            if (row.equipment && Array.isArray(row.equipment)) {
              for (const eq of row.equipment) {
                allEquipmentSet.add(eq);
              }
            }
          }

          const sorted = Array.from(allEquipmentSet).sort();
          setAllEquipment(sorted);
        } else if (error) {
          console.error("Error loading equipment:", error);
        }
      }
    }

    void loadAllEquipment();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function searchExercises() {
      const trimmed = exerciseSearch.trim();

      const supabase = createClient();

      let query = supabase
        .from("exercises")
        .select("id, name, description, pattern, equipment")
        .order("name", { ascending: true })
        .limit(20);

      if (trimmed) {
        const escaped = trimmed.replace(/,/g, " ").replace(/%/g, "").replace(/\*/g, "").trim();
        query = query.or(
          `name.ilike.%${escaped}%,description.ilike.%${escaped}%,pattern.ilike.%${escaped}%`
        );
      }

      if (selectedEquipment.length > 0) {
        // Filter exercises that have at least one of the selected equipment
        query = query.filter(
          "equipment",
          "cs",
          `{${selectedEquipment.map((e) => `"${e}"`).join(",")}}`
        );
      }

      setSearchingExercises(true);

      const { data, error } = await query;

      if (cancelled) return;

      setSearchingExercises(false);

      if (error) {
        setExerciseResults([]);
        setErrorMessage(`Could not search exercises: ${error.message}`);
        return;
      }

      setErrorMessage("");
      setExerciseResults((data ?? []) as ExerciseSearchRow[]);
    }

    void searchExercises();

    return () => {
      cancelled = true;
    };
  }, [exerciseSearch, selectedEquipment]);

  useEffect(() => {
    let cancelled = false;

    async function loadNextVariantNumber() {
      if (!difficultyLevel || !focusArea || !goal) {
        setVariantNumber(null);
        setLoadingVariantNumber(false);
        return;
      }

      setLoadingVariantNumber(true);
      setErrorMessage("");

      const supabase = createClient();
      const { data, error } = await supabase
        .from("session_templates")
        .select("name")
        .eq("type", "gym")
        .eq("difficulty_level", difficultyLevel)
        .eq("focus_area", focusArea)
        .eq("goal", goal)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setVariantNumber(null);
        setLoadingVariantNumber(false);
        setErrorMessage(`Could not determine next template number: ${error.message}`);
        return;
      }

      const rows = (data ?? []) as ExistingTemplateNameRow[];
      const nextNumber = getNextVariantNumber(
        rows.map((row) => row.name),
        difficultyLevel,
        focusArea,
        goal
      );

      setVariantNumber(nextNumber);
      setLoadingVariantNumber(false);
    }

    void loadNextVariantNumber();

    return () => {
      cancelled = true;
    };
  }, [difficultyLevel, focusArea, goal]);

  function addExercise(exercise: ExerciseSearchRow) {
    const alreadyAdded = selectedExercises.some(
      (selectedExercise) => selectedExercise.exerciseId === exercise.id
    );

    if (alreadyAdded) {
      setStatusMessage(`${exercise.name} is already in this template.`);
      return;
    }

    setSelectedExercises((current) => [
      ...current,
      {
        clientId: buildClientId("selected-exercise"),
        exerciseId: exercise.id,
        name: exercise.name,
        description: exercise.description,
        pattern: exercise.pattern,
        equipment: exercise.equipment || null,
        sets: "",
        reps: "",
        duration: "",
        notes: "",
      },
    ]);

    setStatusMessage(`${exercise.name} added.`);
  }

  function removeExercise(clientId: string) {
    setSelectedExercises((current) =>
      current.filter((selectedExercise) => selectedExercise.clientId !== clientId)
    );
  }

  function moveExercise(clientId: string, direction: -1 | 1) {
    setSelectedExercises((current) => {
      const index = current.findIndex((selectedExercise) => selectedExercise.clientId === clientId);
      if (index < 0) return current;

      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function updateSelectedExercise(
    clientId: string,
    field: keyof Pick<SelectedExercise, "sets" | "reps" | "duration" | "notes">,
    value: string
  ) {
    setSelectedExercises((current) =>
      current.map((selectedExercise) =>
        selectedExercise.clientId === clientId
          ? {
              ...selectedExercise,
              [field]: value,
            }
          : selectedExercise
      )
    );
  }

  async function saveTemplate() {
    if (!canSave || !templateNamePreview || variantNumber === null) return;

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    const supabase = createClient();
    const subtype = toSubtype(goal);

    const { data: templateRow, error: templateError } = await supabase
      .from("session_templates")
      .insert({
        name: templateNamePreview,
        description: templateDescription.trim() || null,
        type: "gym",
        subtype,
        focus_area: focusArea.trim(),
        goal: goal.trim(),
        difficulty_level: difficultyLevel.trim() || null,
        session_data: {},
      })
      .select("id")
      .single();

    if (templateError || !templateRow?.id) {
      setSaving(false);
      setErrorMessage(
        `Could not create gym session template: ${templateError?.message ?? "Unknown error"}`
      );
      return;
    }

    const insertRows = selectedExercises.map((selectedExercise, index) => ({
      session_template_id: templateRow.id,
      exercise_id: selectedExercise.exerciseId,
      exercise_order: index + 1,
      sets: selectedExercise.sets.trim() || null,
      reps: selectedExercise.reps.trim() || null,
      duration: selectedExercise.duration.trim() || null,
      notes: selectedExercise.notes.trim() || null,
    }));

    const { error: exerciseLinkError } = await supabase
      .from("session_template_exercises")
      .insert(insertRows);

    if (exerciseLinkError) {
      await supabase.from("session_templates").delete().eq("id", templateRow.id);
      setSaving(false);
      setErrorMessage(`Template was not saved: ${exerciseLinkError.message}`);
      return;
    }

    setSaving(false);
    setStatusMessage("Gym session template saved.");
    setTemplateDescription("");
    setFocusArea("");
    setGoal("");
    setDifficultyLevel("");
    setVariantNumber(null);
    setExerciseSearch("");
    setExerciseResults([]);
    setSelectedExercises([]);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Coach Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Create Gym Session Template</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Build a reusable gym session from scratch by searching for exercises, adding them to
              the session, and setting the prescription for each one.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/coach"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Coach Home
            </Link>
            <Link
              href="/coach/gym-session-templates"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Gym Templates
            </Link>
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-8 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Template details</h2>

              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-zinc-900">
                      Focus area
                    </label>
                    <select
                      value={focusArea}
                      onChange={(event) => setFocusArea(event.target.value)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    >
                      <option value="">Select focus area</option>
                      {focusAreaOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-zinc-900">Goal</label>
                    <select
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    >
                      <option value="">Select goal</option>
                      {goalOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-900">
                    Difficulty level
                  </label>
                  <select
                    value={difficultyLevel}
                    onChange={(event) => setDifficultyLevel(event.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  >
                    <option value="">Select difficulty</option>
                    {difficultyOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-900">
                    Template name
                  </label>
                  <div className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                    {!difficultyLevel || !focusArea || !goal ? (
                      <span className="text-zinc-500">
                        Select difficulty, focus area, and goal to generate a name.
                      </span>
                    ) : loadingVariantNumber ? (
                      <span className="text-zinc-500">Calculating next number…</span>
                    ) : (
                      templateNamePreview
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    The number is assigned automatically. The Gym/Home suffix is set based on
                    whether any exercise requires a machine or cable.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-900">
                    Description
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(event) => setTemplateDescription(event.target.value)}
                    rows={4}
                    placeholder="Brief summary of what this session is for..."
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void saveTemplate()}
                  disabled={!canSave}
                  className="w-full rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Gym Session Template"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Search exercises</h2>

              <div className="mt-4">
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  placeholder="Search by exercise name, description, or pattern"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                />
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-semibold text-zinc-900">
                  Filter by equipment
                </label>
                {loadingEquipment ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                    Loading equipment options…
                  </div>
                ) : allEquipment.length === 0 ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                    No equipment options available
                  </div>
                ) : (
                  <>
                    <select
                      multiple
                      value={selectedEquipment}
                      onChange={(event) =>
                        setSelectedEquipment(Array.from(event.target.selectedOptions, (o) => o.value))
                      }
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      size={Math.min(allEquipment.length, 6)}
                    >
                      {allEquipment.map((equipment) => (
                        <option key={equipment} value={equipment}>
                          {equipment}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-zinc-500">
                      Hold Ctrl/Cmd to select multiple equipment types
                    </p>
                  </>
                )}
                {selectedEquipment.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedEquipment.map((eq) => (
                      <button
                        key={eq}
                        type="button"
                        onClick={() =>
                          setSelectedEquipment((prev) => prev.filter((e) => e !== eq))
                        }
                        className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-900 hover:bg-blue-200"
                      >
                        {eq}
                        <span>×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {!exerciseSearch.trim() ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                    Start typing to search exercises.
                  </div>
                ) : searchingExercises ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                    Searching exercises…
                  </div>
                ) : exerciseResults.length === 0 ? (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                    No exercises matched that search.
                  </div>
                ) : (
                  exerciseResults.map((exercise) => (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => addExercise(exercise)}
                      className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-zinc-900">{exercise.name}</div>
                          <div className="mt-1 text-sm text-zinc-600">
                            {exercise.description || "—"}
                          </div>
                          {exercise.equipment && exercise.equipment.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {exercise.equipment.map((eq) => (
                                <span
                                  key={eq}
                                  className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-900"
                                >
                                  {eq}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 text-right text-xs text-zinc-500">
                          <div>{exercise.pattern || "—"}</div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Selected exercises</h2>

            <div className="mt-6 space-y-4">
              {selectedExercises.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
                  No exercises added yet.
                </div>
              ) : (
                selectedExercises.map((selectedExercise, index) => (
                  <div
                    key={selectedExercise.clientId}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Exercise {index + 1}
                        </div>
                        <h3 className="mt-1 text-base font-semibold text-zinc-900">
                          {selectedExercise.name}
                        </h3>
                        {selectedExercise.description ? (
                          <p className="mt-1 text-sm text-zinc-600">
                            {selectedExercise.description}
                          </p>
                        ) : null}
                        {selectedExercise.equipment && selectedExercise.equipment.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {selectedExercise.equipment.map((eq) => (
                              <span
                                key={eq}
                                className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-900"
                              >
                                {eq}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveExercise(selectedExercise.clientId, -1)}
                          disabled={index === 0}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveExercise(selectedExercise.clientId, 1)}
                          disabled={index === selectedExercises.length - 1}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeExercise(selectedExercise.clientId)}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-4">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-zinc-900">
                          Sets
                        </label>
                        <input
                          type="text"
                          value={selectedExercise.sets}
                          onChange={(event) =>
                            updateSelectedExercise(
                              selectedExercise.clientId,
                              "sets",
                              event.target.value
                            )
                          }
                          placeholder="e.g. 4"
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-zinc-900">
                          Reps
                        </label>
                        <input
                          type="text"
                          value={selectedExercise.reps}
                          onChange={(event) =>
                            updateSelectedExercise(
                              selectedExercise.clientId,
                              "reps",
                              event.target.value
                            )
                          }
                          placeholder="e.g. 8"
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-zinc-900">
                          Duration (seconds)
                        </label>
                        <input
                          type="text"
                          value={selectedExercise.duration}
                          onChange={(event) =>
                            updateSelectedExercise(
                              selectedExercise.clientId,
                              "duration",
                              event.target.value
                            )
                          }
                          placeholder="e.g. 45"
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-semibold text-zinc-900">
                          Notes
                        </label>
                        <input
                          type="text"
                          value={selectedExercise.notes}
                          onChange={(event) =>
                            updateSelectedExercise(
                              selectedExercise.clientId,
                              "notes",
                              event.target.value
                            )
                          }
                          placeholder="Optional"
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

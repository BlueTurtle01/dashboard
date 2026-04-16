"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PlanExercise } from "@/lib/planner/types";

type GymExerciseEditorProps = {
  exercises: PlanExercise[];
  onChange: (exercises: PlanExercise[]) => void;
};

type ExerciseLibraryItem = {
  id: string;
  name: string;
  description: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementTags: string[];
  equipment: string[];
  pattern?: string;
  sets: number | null;
  reps: number | null;
  durationSeconds?: number | null;
};

type ExerciseRow = {
  id: string;
  name: string;
  description: string;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
  movement_tags: string[] | null;
  equipment: string[] | null;
  pattern: string | null;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
};

function mapExerciseRow(row: ExerciseRow): ExerciseLibraryItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    primaryMuscles: row.primary_muscles ?? [],
    secondaryMuscles: row.secondary_muscles ?? [],
    movementTags: row.movement_tags ?? [],
    equipment: row.equipment ?? [],
    pattern: row.pattern ?? undefined,
    sets: row.sets ?? null,
    reps: row.reps ?? null,
    durationSeconds: row.duration_seconds ?? null,
  };
}

function normalise(text: string) {
  return text.trim().toLowerCase();
}

function buildSearchText(item: ExerciseLibraryItem) {
  return [
    item.name,
    item.description,
    ...item.primaryMuscles,
    ...item.secondaryMuscles,
    ...item.movementTags,
    ...item.equipment,
    item.pattern ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function scoreExercise(item: ExerciseLibraryItem, query: string) {
  const q = normalise(query);
  if (!q) return 0;

  let score = 0;
  const name = item.name.toLowerCase();
  const description = item.description.toLowerCase();

  if (name === q) score += 100;
  if (name.includes(q)) score += 50;
  if (item.primaryMuscles.some((x) => normalise(x).includes(q))) score += 40;
  if (item.secondaryMuscles.some((x) => normalise(x).includes(q))) score += 25;
  if (item.movementTags.some((x) => normalise(x).includes(q))) score += 20;
  if (item.equipment.some((x) => normalise(x).includes(q))) score += 10;
  if ((item.pattern ?? "").toLowerCase().includes(q)) score += 15;
  if (description.includes(q)) score += 8;

  return score;
}

async function searchExerciseLibrary(query: string): Promise<ExerciseLibraryItem[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select(`
      id,
      name,
      description,
      primary_muscles,
      secondary_muscles,
      movement_tags,
      equipment,
      pattern,
      sets,
      reps,
      duration_seconds
    `)
    .order("name");

  if (error) {
    throw new Error(`Failed to load exercises: ${error.message}`);
  }

  const exerciseLibrary = (data ?? []).map((row) => mapExerciseRow(row as ExerciseRow));
  const normalised = normalise(query);

  if (!normalised) {
    return exerciseLibrary.slice(0, 8);
  }

  return exerciseLibrary
    .map((item) => ({
      item,
      score: scoreExercise(item, normalised),
      haystack: buildSearchText(item),
    }))
    .filter(({ score, haystack }) => score > 0 || haystack.includes(normalised))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 8)
    .map(({ item }) => item);
}

function buildExerciseId(sessionId: string | undefined, index: number) {
  const base = sessionId && sessionId.trim() ? sessionId : "session";
  return `${base}-exercise-${index + 1}`;
}

function reindexExercises(exercises: PlanExercise[]) {
  return exercises.map((exercise, index) => ({
    ...exercise,
    id: buildExerciseId(exercise.sessionId, index),
    sortOrder: index + 1,
  }));
}

function tagsToText(tags: string[] | undefined) {
  return (tags ?? []).join(", ");
}

function textToTags(text: string) {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function buildPlanExerciseFromLibraryItem(
  item: ExerciseLibraryItem,
  existingExercises: PlanExercise[],
): PlanExercise {
  const sessionId = existingExercises[0]?.sessionId ?? "session";
  const nextIndex = existingExercises.length;

  return {
    id: buildExerciseId(sessionId, nextIndex),
    sessionId,
    sortOrder: nextIndex + 1,
    name: item.name,
    description: item.description,
    tags: [...(item.movementTags ?? []), ...(item.primaryMuscles ?? [])],
    sets: item.sets ?? null,
    reps: item.reps ?? null,
    durationSeconds: item.durationSeconds ?? null,
  };
}

export default function GymExerciseEditor({
  exercises,
  onChange,
}: GymExerciseEditorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExerciseLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const safeExercises = useMemo(
    () => (Array.isArray(exercises) ? exercises : []),
    [exercises]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadResults() {
      setIsLoading(true);

      try {
        const nextResults = await searchExerciseLibrary(query);

        if (!cancelled) {
          setResults(Array.isArray(nextResults) ? nextResults : []);
        }
      } catch (error) {
        console.error("Failed to search exercise library", error);

        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [query]);

  function updateExercises(nextExercises: PlanExercise[]) {
    onChange(reindexExercises(nextExercises));
  }

  function addExercise(item: ExerciseLibraryItem) {
    const nextExercise = buildPlanExerciseFromLibraryItem(item, safeExercises);
    updateExercises([...safeExercises, nextExercise]);
    setQuery("");
  }

  function updateExercise(index: number, patch: Partial<PlanExercise>) {
    const nextExercises = safeExercises.map((exercise, currentIndex) =>
      currentIndex === index ? { ...exercise, ...patch } : exercise
    );

    updateExercises(nextExercises);
  }

  function removeExercise(index: number) {
    updateExercises(safeExercises.filter((_, currentIndex) => currentIndex !== index));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= safeExercises.length) {
      return;
    }

    const nextExercises = [...safeExercises];
    const [moved] = nextExercises.splice(index, 1);
    nextExercises.splice(nextIndex, 0, moved);

    updateExercises(nextExercises);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-zinc-700">
            Search Exercise Library
          </span>
          <input
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. split squat, hinge, glutes, dumbbell"
          />
        </label>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Matching Exercises
          </div>

          <div className="mt-3 space-y-2">
            {isLoading ? (
              <div className="text-sm text-zinc-500">Loading exercises...</div>
            ) : results.length === 0 ? (
              <div className="text-sm text-zinc-500">No exercises matched that search.</div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addExercise(item)}
                  className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                >
                  <div className="font-medium text-zinc-900">{item.name}</div>
                  <div className="mt-1 text-sm text-zinc-600">{item.description || "—"}</div>
                  <div className="mt-2 text-xs text-zinc-500">
                    {[...(item.movementTags ?? []), ...(item.primaryMuscles ?? [])].join(", ") || "—"}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {safeExercises.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500">
            No exercises added yet.
          </div>
        ) : (
          safeExercises.map((exercise, index) => (
            <div key={exercise.id} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-zinc-500">Exercise {index + 1}</div>
                  <div className="text-base font-semibold text-zinc-900">{exercise.name}</div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moveExercise(index, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExercise(index, 1)}
                    disabled={index === safeExercises.length - 1}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExercise(index)}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">Name</span>
                  <input
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                    value={exercise.name}
                    onChange={(e) => updateExercise(index, { name: e.target.value })}
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">Tags</span>
                  <input
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                    value={tagsToText(exercise.tags)}
                    onChange={(e) => updateExercise(index, { tags: textToTags(e.target.value) })}
                  />
                </label>
              </div>

              <div className="mt-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">Description</span>
                  <textarea
                    className="min-h-[100px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                    value={exercise.description ?? ""}
                    onChange={(e) => updateExercise(index, { description: e.target.value })}
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">Sets</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                    value={exercise.sets ?? ""}
                    onChange={(e) =>
                      updateExercise(index, {
                        sets: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">Reps</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                    value={exercise.reps ?? ""}
                    onChange={(e) =>
                      updateExercise(index, {
                        reps: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-700">
                    Duration Seconds
                  </span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
                    value={exercise.durationSeconds ?? ""}
                    onChange={(e) =>
                      updateExercise(index, {
                        durationSeconds: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

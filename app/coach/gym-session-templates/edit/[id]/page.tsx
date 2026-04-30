"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";

type ExerciseSearchRow = {
  id: string;
  name: string;
  description: string;
  pattern: string | null;
  equipment: string[] | null;
  sets: number | null;
  reps: number | null;
  photo_url: string | null;
  video_url: string | null;
};

type SelectedExercise = {
  clientId: string;
  exerciseId: string;
  name: string;
  description: string;
  pattern: string | null;
  equipment: string[] | null;
  selectedEquipmentPiece: string | null;
  sets: string;
  reps: string;
  duration: string;
  notes: string;
  photoUrl: string | null;
  videoUrl: string;
  uploadingPhoto: boolean;
  mediaChanged: boolean;
};

function prefixedExerciseName(name: string, equipmentPiece: string | null): string {
  if (!equipmentPiece) return name;
  const cap = equipmentPiece.charAt(0).toUpperCase() + equipmentPiece.slice(1);
  return `${cap} ${name}`;
}

function buildClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function EditGymSessionTemplatePage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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

  const canSave = useMemo(() => {
    const anyUploading = selectedExercises.some((ex) => ex.uploadingPhoto);
    return (
      templateName.trim().length > 0 &&
      selectedExercises.length > 0 &&
      !saving &&
      !loading &&
      !anyUploading
    );
  }, [templateName, selectedExercises, saving, loading]);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplate() {
      setLoading(true);
      const supabase = createClient();

      const { data: templateRow, error: templateError } = await supabase
        .from("session_templates")
        .select("id, name, description, type")
        .eq("id", templateId)
        .eq("type", "gym")
        .single();

      if (templateError || !templateRow) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      const { data: exerciseRows, error: exerciseError } = await supabase
        .from("session_template_exercises")
        .select("id, exercise_id, exercise_order, sets, reps, duration, notes, selected_equipment")
        .eq("session_template_id", templateId)
        .order("exercise_order", { ascending: true });

      if (exerciseError) {
        if (!cancelled) {
          setErrorMessage(`Failed to load exercises: ${exerciseError.message}`);
          setLoading(false);
        }
        return;
      }

      const exerciseIds = (exerciseRows ?? []).map((row) => row.exercise_id as string);
      let exerciseLookup = new Map<string, ExerciseSearchRow>();

      if (exerciseIds.length > 0) {
        const { data: lookupRows, error: lookupError } = await supabase
          .from("exercises")
          .select("id, name, description, pattern, equipment, sets, reps, photo_url, video_url")
          .in("id", exerciseIds);

        if (!lookupError && lookupRows) {
          exerciseLookup = new Map(
            (lookupRows as ExerciseSearchRow[]).map((row) => [row.id, row])
          );
        }
      }

      if (!cancelled) {
        setTemplateName(templateRow.name as string);
        setTemplateDescription((templateRow.description as string | null) ?? "");
        setSelectedExercises(
          (exerciseRows ?? []).map((row) => {
            const lookup = exerciseLookup.get(row.exercise_id as string);
            return {
              clientId: buildClientId("exercise"),
              exerciseId: row.exercise_id as string,
              name: lookup?.name ?? (row.exercise_id as string),
              description: lookup?.description ?? "",
              pattern: lookup?.pattern ?? null,
              equipment: lookup?.equipment ?? null,
              selectedEquipmentPiece: (row.selected_equipment as string | null) ?? null,
              sets: (row.sets as string | null) ?? "",
              reps: (row.reps as string | null) ?? "",
              duration: (row.duration as string | null) ?? "",
              notes: (row.notes as string | null) ?? "",
              photoUrl: lookup?.photo_url ?? null,
              videoUrl: lookup?.video_url ?? "",
              uploadingPhoto: false,
              mediaChanged: false,
            };
          })
        );
        setLoading(false);
      }
    }

    void loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  useEffect(() => {
    let cancelled = false;

    async function loadAllEquipment() {
      setLoadingEquipment(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("exercises")
        .select("equipment")
        .not("equipment", "is", null);

      if (!cancelled) {
        setLoadingEquipment(false);
        if (!error && data) {
          const allEquipmentSet = new Set<string>();
          for (const row of data as { equipment: string[] | null }[]) {
            if (row.equipment && Array.isArray(row.equipment)) {
              for (const eq of row.equipment) allEquipmentSet.add(eq);
            }
          }
          setAllEquipment(Array.from(allEquipmentSet).sort());
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
        .select("id, name, description, pattern, equipment, sets, reps")
        .order("name", { ascending: true })
        .limit(20);

      if (trimmed) {
        const escaped = trimmed.replace(/,/g, " ").replace(/%/g, "").replace(/\*/g, "").trim();
        query = query.or(
          `name.ilike.%${escaped}%,description.ilike.%${escaped}%,pattern.ilike.%${escaped}%`
        );
      }

      if (selectedEquipment.length > 0) {
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
        return;
      }
      setExerciseResults((data ?? []) as ExerciseSearchRow[]);
    }

    void searchExercises();
    return () => {
      cancelled = true;
    };
  }, [exerciseSearch, selectedEquipment]);

  function addExercise(exercise: ExerciseSearchRow) {
    const alreadyAdded = selectedExercises.some((e) => e.exerciseId === exercise.id);
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
        equipment: exercise.equipment ?? null,
        selectedEquipmentPiece: null,
        sets: exercise.sets == null ? "" : String(exercise.sets),
        reps: exercise.reps == null ? "" : String(exercise.reps),
        duration: "",
        notes: "",
        photoUrl: exercise.photo_url ?? null,
        videoUrl: exercise.video_url ?? "",
        uploadingPhoto: false,
        mediaChanged: false,
      },
    ]);
    setStatusMessage(`${exercise.name} added.`);
  }

  function removeExercise(clientId: string) {
    setSelectedExercises((current) => current.filter((e) => e.clientId !== clientId));
  }

  function moveExercise(clientId: string, direction: -1 | 1) {
    setSelectedExercises((current) => {
      const index = current.findIndex((e) => e.clientId === clientId);
      if (index < 0) return current;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function toggleEquipmentPiece(clientId: string, piece: string) {
    setSelectedExercises((current) =>
      current.map((ex) =>
        ex.clientId === clientId
          ? { ...ex, selectedEquipmentPiece: ex.selectedEquipmentPiece === piece ? null : piece }
          : ex
      )
    );
  }

  async function uploadExercisePhoto(clientId: string, exerciseId: string, file: File) {
    setSelectedExercises((current) =>
      current.map((ex) => (ex.clientId === clientId ? { ...ex, uploadingPhoto: true } : ex))
    );

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `exercise-photos/${exerciseId}/${Date.now()}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("exercise-media").upload(path, file, { upsert: true });

    if (error) {
      setSelectedExercises((current) =>
        current.map((ex) => (ex.clientId === clientId ? { ...ex, uploadingPhoto: false } : ex))
      );
      setErrorMessage(`Photo upload failed: ${error.message}`);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("exercise-media").getPublicUrl(path);
    setSelectedExercises((current) =>
      current.map((ex) =>
        ex.clientId === clientId
          ? { ...ex, uploadingPhoto: false, photoUrl: publicUrl, mediaChanged: true }
          : ex
      )
    );
  }

  function clearExercisePhoto(clientId: string) {
    setSelectedExercises((current) =>
      current.map((ex) =>
        ex.clientId === clientId ? { ...ex, photoUrl: null, mediaChanged: true } : ex
      )
    );
  }

  function updateExerciseVideoUrl(clientId: string, url: string) {
    setSelectedExercises((current) =>
      current.map((ex) =>
        ex.clientId === clientId ? { ...ex, videoUrl: url, mediaChanged: true } : ex
      )
    );
  }

  function updateSelectedExercise(
    clientId: string,
    field: keyof Pick<SelectedExercise, "sets" | "reps" | "duration" | "notes">,
    value: string
  ) {
    setSelectedExercises((current) =>
      current.map((e) => (e.clientId === clientId ? { ...e, [field]: value } : e))
    );
  }

  async function saveTemplate() {
    if (!canSave) return;

    setSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from("session_templates")
      .update({
        name: templateName.trim(),
        description: templateDescription.trim() || null,
      })
      .eq("id", templateId);

    if (updateError) {
      setSaving(false);
      setErrorMessage(`Could not update template: ${updateError.message}`);
      return;
    }

    const { error: deleteError } = await supabase
      .from("session_template_exercises")
      .delete()
      .eq("session_template_id", templateId);

    if (deleteError) {
      setSaving(false);
      setErrorMessage(`Could not update exercises: ${deleteError.message}`);
      return;
    }

    const insertRows = selectedExercises.map((e, index) => ({
      session_template_id: templateId,
      exercise_id: e.exerciseId,
      exercise_order: index + 1,
      sets: e.sets.trim() || null,
      reps: e.reps.trim() || null,
      duration: e.duration.trim() || null,
      notes: e.notes.trim() || null,
      selected_equipment: e.selectedEquipmentPiece || null,
    }));

    const { error: insertError } = await supabase
      .from("session_template_exercises")
      .insert(insertRows);

    if (insertError) {
      setSaving(false);
      setErrorMessage(`Exercises not saved: ${insertError.message}`);
      return;
    }

    const mediaUpdates = selectedExercises.filter((ex) => ex.mediaChanged);
    if (mediaUpdates.length > 0) {
      await Promise.all(
        mediaUpdates.map((ex) =>
          supabase
            .from("exercises")
            .update({ photo_url: ex.photoUrl, video_url: ex.videoUrl.trim() || null })
            .eq("id", ex.exerciseId)
        )
      );
    }

    setSaving(false);
    setStatusMessage("Template saved.");
    window.setTimeout(() => router.push("/coach/gym-session-templates"), 1000);
  }

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-600">Loading template…</p>
          </div>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="text-sm font-medium text-red-900">Template not found.</p>
            <Link
              href="/coach/gym-session-templates"
              className="mt-4 inline-block text-sm font-medium text-red-700 underline"
            >
              Back to templates
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Coach Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit Gym Session Template</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">
              Update the template name, description, and exercises.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
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
                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-900">
                    Template name
                  </label>
                  <input
                    type="text"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-900">
                    Description
                  </label>
                  <textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
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
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Add exercises</h2>

              <div className="mt-4">
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
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
                      onChange={(e) =>
                        setSelectedEquipment(Array.from(e.target.selectedOptions, (o) => o.value))
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
                        onClick={() => setSelectedEquipment((prev) => prev.filter((e) => e !== eq))}
                        className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-900 hover:bg-blue-200"
                      >
                        {eq}
                        <span>x</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {!exerciseSearch.trim() && selectedEquipment.length === 0 ? (
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
            <h2 className="text-xl font-semibold">Exercises</h2>

            <div className="mt-6 space-y-4">
              {selectedExercises.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
                  No exercises in this template.
                </div>
              ) : (
                selectedExercises.map((exercise, index) => (
                  <div
                    key={exercise.clientId}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Exercise {index + 1}
                        </div>
                        <h3 className="mt-1 text-base font-semibold text-zinc-900">
                          {prefixedExerciseName(exercise.name, exercise.selectedEquipmentPiece)}
                        </h3>
                        {exercise.description ? (
                          <p className="mt-1 text-sm text-zinc-600">{exercise.description}</p>
                        ) : null}
                        {exercise.equipment && exercise.equipment.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <span className="mr-1 text-xs text-zinc-500">Equipment:</span>
                            {exercise.equipment.map((eq) => (
                              <button
                                key={eq}
                                type="button"
                                onClick={() => toggleEquipmentPiece(exercise.clientId, eq)}
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium transition ${
                                  exercise.selectedEquipmentPiece === eq
                                    ? "bg-blue-600 text-white"
                                    : "bg-blue-100 text-blue-900 hover:bg-blue-200"
                                }`}
                              >
                                {eq}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => moveExercise(exercise.clientId, -1)}
                          disabled={index === 0}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveExercise(exercise.clientId, 1)}
                          disabled={index === selectedExercises.length - 1}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-100 disabled:opacity-50"
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeExercise(exercise.clientId)}
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
                          value={exercise.sets}
                          onChange={(e) =>
                            updateSelectedExercise(exercise.clientId, "sets", e.target.value)
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
                          value={exercise.reps}
                          onChange={(e) =>
                            updateSelectedExercise(exercise.clientId, "reps", e.target.value)
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
                          value={exercise.duration}
                          onChange={(e) =>
                            updateSelectedExercise(exercise.clientId, "duration", e.target.value)
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
                          value={exercise.notes}
                          onChange={(e) =>
                            updateSelectedExercise(exercise.clientId, "notes", e.target.value)
                          }
                          placeholder="Optional"
                          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        />
                      </div>
                    </div>

                    <div className="mt-4 border-t border-zinc-200 pt-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Media
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-zinc-900">
                            Photo
                          </label>
                          {exercise.photoUrl ? (
                            <div className="flex items-center gap-3">
                              <img
                                src={exercise.photoUrl}
                                alt=""
                                className="h-16 w-16 rounded-lg border border-zinc-200 object-cover"
                              />
                              <div className="flex flex-col gap-1.5">
                                <label className="cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-center text-xs font-medium hover:bg-zinc-50">
                                  {exercise.uploadingPhoto ? "Uploading…" : "Replace"}
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="sr-only"
                                    disabled={exercise.uploadingPhoto}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) void uploadExercisePhoto(exercise.clientId, exercise.exerciseId, file);
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => clearExercisePhoto(exercise.clientId)}
                                  className="text-xs text-rose-600 hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label
                              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center transition hover:bg-zinc-100 ${exercise.uploadingPhoto ? "pointer-events-none opacity-50" : ""}`}
                            >
                              <span className="text-xs text-zinc-500">
                                {exercise.uploadingPhoto ? "Uploading…" : "Click to upload photo"}
                              </span>
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="sr-only"
                                disabled={exercise.uploadingPhoto}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void uploadExercisePhoto(exercise.clientId, exercise.exerciseId, file);
                                }}
                              />
                            </label>
                          )}
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-semibold text-zinc-900">
                            Video URL
                          </label>
                          <input
                            type="url"
                            value={exercise.videoUrl}
                            onChange={(e) => updateExerciseVideoUrl(exercise.clientId, e.target.value)}
                            placeholder="https://youtube.com/watch?v=…"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                          />
                          {exercise.videoUrl.trim() && (
                            <a
                              href={exercise.videoUrl.trim()}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1.5 inline-block text-xs text-blue-600 hover:underline"
                            >
                              Open video ↗
                            </a>
                          )}
                        </div>
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

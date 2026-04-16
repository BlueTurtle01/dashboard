"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  GymSessionTemplate,
  getAllGymSessionTemplates,
  loadCustomGymSessionTemplates,
} from "@/lib/planner/gymSessionTemplates";

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

export default function SessionTemplateDashboardPage() {
  const [statusMessage, setStatusMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allTemplates, setAllTemplates] = useState<GymSessionTemplate[]>([]);
  const [customTemplates, setCustomTemplates] = useState<GymSessionTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [expandedCustomTemplateId, setExpandedCustomTemplateId] = useState<string | null>(null);

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
          setAllTemplates(Array.isArray(all) ? all : []);
          setCustomTemplates(Array.isArray(custom) ? custom : []);
        }
      } catch (error) {
        console.error("Failed to load gym session templates", error);

        if (!cancelled) {
          setAllTemplates([]);
          setCustomTemplates([]);
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
    if (!query) return allTemplates;

    return allTemplates.filter((template) =>
      buildTemplateSearchText(template).includes(query)
    );
  }, [allTemplates, searchQuery]);

  function toggleTemplate(templateId: string) {
    setExpandedTemplateId((current) => (current === templateId ? null : templateId));
  }

  function toggleCustomTemplate(templateId: string) {
    setExpandedCustomTemplateId((current) => (current === templateId ? null : templateId));
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
              href="/coach"
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
            >
              Back to Coach Calendar
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
                              {template.isCustom ? " (Custom)" : " (Default)"}
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
                                    {exercise.sets != null ? `${exercise.sets} sets` : "—"} ·{" "}
                                    {exercise.reps != null ? `${exercise.reps} reps` : "—"} ·{" "}
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
                                    {exercise.sets != null ? `${exercise.sets} sets` : "—"} ·{" "}
                                    {exercise.reps != null ? `${exercise.reps} reps` : "—"} ·{" "}
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
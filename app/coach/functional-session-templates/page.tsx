"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FunctionalTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  activity: string | null;
  subtype: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  target_intensity: string | null;
  session_data: Record<string, unknown> | null;
  created_at: string;
};

type FunctionalTemplateForm = {
  name: string;
  description: string;
  activity: string;
  subtype: string;
  durationMinutes: string;
  distanceKm: string;
  targetIntensity: string;
  terrain: string;
  elevation: string;
  packWeightKg: string;
  timeOfDay: string;
  startTime: string;
  isTimeStrict: boolean;
  sets: string;
  setDurationSeconds: string;
  restSeconds: string;
  notes: string;
  tags: string;
};

type FieldVisibility = {
  show_distance: boolean;
  show_duration: boolean;
  show_target_intensity: boolean;
  show_terrain: boolean;
  show_elevation: boolean;
  show_pack_weight: boolean;
  show_sets: boolean;
  show_set_duration: boolean;
  show_rest_seconds: boolean;
};

type FieldConfigRow = FieldVisibility & {
  target_activity: string | null;
  target_subtype: string | null;
};

const FIELD_VISIBILITY_DEFAULTS: FieldVisibility = {
  show_distance: true,
  show_duration: true,
  show_target_intensity: true,
  show_terrain: true,
  show_elevation: true,
  show_pack_weight: true,
  show_sets: false,
  show_set_duration: false,
  show_rest_seconds: false,
};

type SessionActivityRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number | null;
  is_active: boolean;
};

type SessionSubtypeRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number | null;
  is_active: boolean;
};

type SessionActivitySubtypeRow = {
  activity_id: string;
  subtype_id: string;
  sort_order: number | null;
};

type ActivityOption = {
  id: string;
  slug: string;
  label: string;
};

type SubtypeOption = {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
};

const terrainOptions = [
  "road",
  "trail",
  "mixed",
  "sand",
  "treadmill",
  "stairs",
  "indoor",
  "water",
  "any",
] as const;

const timeOfDayOptions = [
  "any",
  "morning",
  "afternoon",
  "evening",
  "night",
  "race_simulation",
] as const;

function formatLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function createFormFromRow(row: FunctionalTemplateRow): FunctionalTemplateForm {
  const sessionData = row.session_data ?? {};
  const packWeightValue = sessionData["pack_weight_kg"];
  const tagValue = sessionData["tags"];

  return {
    name: row.name ?? "",
    description: row.description ?? "",
    activity: row.activity ?? "",
    subtype: row.subtype ?? "",
    durationMinutes: row.duration_minutes != null ? String(row.duration_minutes) : "",
    distanceKm: row.distance_km != null ? String(row.distance_km) : "",
    targetIntensity: row.target_intensity ?? "",
    terrain:
      typeof sessionData["terrain"] === "string" && sessionData["terrain"]
        ? sessionData["terrain"]
        : "any",
    elevation: typeof sessionData["elevation"] === "string" ? sessionData["elevation"] : "",
    packWeightKg:
      typeof packWeightValue === "number"
        ? String(packWeightValue)
        : typeof packWeightValue === "string"
          ? packWeightValue
          : "",
    timeOfDay:
      typeof sessionData["time_of_day"] === "string" && sessionData["time_of_day"]
        ? sessionData["time_of_day"]
        : "any",
    startTime: typeof sessionData["start_time"] === "string" ? sessionData["start_time"] : "",
    isTimeStrict: Boolean(sessionData["is_time_strict"]),
    sets: sessionData["sets"] != null ? String(sessionData["sets"]) : "",
    setDurationSeconds:
      sessionData["set_duration_seconds"] != null
        ? String(sessionData["set_duration_seconds"])
        : "",
    restSeconds: sessionData["rest_seconds"] != null ? String(sessionData["rest_seconds"]) : "",
    notes: typeof sessionData["notes"] === "string" ? sessionData["notes"] : "",
    tags: Array.isArray(tagValue) ? tagValue.join(", ") : "",
  };
}

function parseNullableInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function buildSessionData(form: FunctionalTemplateForm) {
  return {
    terrain: form.terrain || null,
    elevation: form.elevation.trim() || null,
    pack_weight_kg: parseNullableNumber(form.packWeightKg),
    time_of_day: form.timeOfDay || null,
    start_time: form.startTime || null,
    is_time_strict: form.isTimeStrict,
    sets: parseNullableInteger(form.sets),
    set_duration_seconds: parseNullableInteger(form.setDurationSeconds),
    rest_seconds: parseNullableInteger(form.restSeconds),
    notes: form.notes.trim() || null,
    tags: parseTags(form.tags),
  };
}

function buildTemplateSearchText(template: FunctionalTemplateRow) {
  const sessionData = template.session_data ?? {};
  const tags = Array.isArray(sessionData["tags"]) ? sessionData["tags"].join(" ") : "";

  return [
    template.name,
    template.description,
    template.activity,
    template.subtype,
    template.target_intensity,
    template.duration_minutes,
    template.distance_km,
    sessionData["terrain"],
    sessionData["elevation"],
    sessionData["time_of_day"],
    sessionData["notes"],
    tags,
  ]
    .join(" ")
    .toLowerCase();
}

export default function FunctionalSessionTemplatesPage() {
  const supabase = createClient();
  const [templates, setTemplates] = useState<FunctionalTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOptionData, setLoadingOptionData] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [subtypeFilter, setSubtypeFilter] = useState("all");

  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, FunctionalTemplateForm>>({});
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [subtypeOptionsByActivitySlug, setSubtypeOptionsByActivitySlug] = useState<
    Record<string, SubtypeOption[]>
  >({});
  const [allSubtypeOptions, setAllSubtypeOptions] = useState<SubtypeOption[]>([]);
  const [fieldConfigMap, setFieldConfigMap] = useState<Record<string, FieldVisibility>>({});

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
  }

  async function loadTemplates() {
    setLoading(true);

    const { data, error } = await supabase
      .from("session_templates")
      .select(
        "id, name, description, type, activity, subtype, duration_minutes, distance_km, target_intensity, session_data, created_at",
      )
      .eq("type", "functional")
      .order("name", { ascending: true });

    if (error) {
      setTemplates([]);
      setLoading(false);
      showTemporaryStatus(`Failed to load functional templates: ${error.message}`, 4000);
      return;
    }

    setTemplates((data ?? []) as FunctionalTemplateRow[]);
    setLoading(false);
  }

  async function loadActivityAndSubtypeOptions() {
    setLoadingOptionData(true);

    const [activitiesResult, subtypesResult, linksResult, fieldConfigResult] = await Promise.all([
      supabase
        .from("session_activities")
        .select("id, slug, label, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      supabase
        .from("session_subtypes")
        .select("id, slug, label, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      supabase
        .from("session_activity_subtypes")
        .select("activity_id, subtype_id, sort_order")
        .order("sort_order", { ascending: true }),
      supabase
        .from("session_template_field_config_resolved")
        .select(
          "target_activity, target_subtype, show_distance, show_duration, show_target_intensity, show_terrain, show_elevation, show_pack_weight, show_sets, show_set_duration, show_rest_seconds",
        ),
    ]);

    if (activitiesResult.error) {
      showTemporaryStatus(`Failed to load activities: ${activitiesResult.error.message}`, 4000);
      setLoadingOptionData(false);
      return;
    }

    if (subtypesResult.error) {
      showTemporaryStatus(`Failed to load subtypes: ${subtypesResult.error.message}`, 4000);
      setLoadingOptionData(false);
      return;
    }

    if (linksResult.error) {
      showTemporaryStatus(`Failed to load mappings: ${linksResult.error.message}`, 4000);
      setLoadingOptionData(false);
      return;
    }

    if (fieldConfigResult.error) {
      showTemporaryStatus(`Failed to load field config: ${fieldConfigResult.error.message}`, 4000);
      setLoadingOptionData(false);
      return;
    }

    const activities = (activitiesResult.data ?? []) as SessionActivityRow[];
    const subtypes = (subtypesResult.data ?? []) as SessionSubtypeRow[];
    const links = (linksResult.data ?? []) as SessionActivitySubtypeRow[];

    const normalizedActivities: ActivityOption[] = activities.map((row) => ({
      id: row.id,
      slug: row.slug,
      label: row.label,
    }));

    const subtypeById = new Map(
      subtypes.map((row) => [
        row.id,
        {
          id: row.id,
          slug: row.slug,
          label: row.label,
          sortOrder: row.sort_order ?? 0,
        },
      ]),
    );

    const activitySlugById = new Map(activities.map((row) => [row.id, row.slug]));
    const subtypeMap: Record<string, SubtypeOption[]> = {};

    for (const link of links) {
      const activitySlug = activitySlugById.get(link.activity_id);
      const subtype = subtypeById.get(link.subtype_id);

      if (!activitySlug || !subtype) continue;

      if (!subtypeMap[activitySlug]) {
        subtypeMap[activitySlug] = [];
      }

      subtypeMap[activitySlug].push({
        ...subtype,
        sortOrder: link.sort_order ?? subtype.sortOrder ?? 0,
      });
    }

    for (const activitySlug of Object.keys(subtypeMap)) {
      subtypeMap[activitySlug] = subtypeMap[activitySlug]
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
          return a.label.localeCompare(b.label);
        })
        .filter(
          (option, index, array) =>
            array.findIndex((candidate) => candidate.id === option.id) === index,
        );
    }

    const configMap: Record<string, FieldVisibility> = {};
    for (const row of (fieldConfigResult.data ?? []) as FieldConfigRow[]) {
      const key = `${row.target_activity ?? "*"}:${row.target_subtype ?? "*"}`;
      configMap[key] = {
        show_distance: row.show_distance,
        show_duration: row.show_duration,
        show_target_intensity: row.show_target_intensity,
        show_terrain: row.show_terrain,
        show_elevation: row.show_elevation,
        show_pack_weight: row.show_pack_weight,
        show_sets: row.show_sets,
        show_set_duration: row.show_set_duration,
        show_rest_seconds: row.show_rest_seconds,
      };
    }

    setActivityOptions(normalizedActivities);
    setSubtypeOptionsByActivitySlug(subtypeMap);
    setAllSubtypeOptions(
      subtypes.map((row) => ({
        id: row.id,
        slug: row.slug,
        label: row.label,
        sortOrder: row.sort_order ?? 0,
      })),
    );
    setFieldConfigMap(configMap);
    setLoadingOptionData(false);
  }

  useEffect(() => {
    void loadTemplates();
    void loadActivityAndSubtypeOptions();
  }, []);

  useEffect(() => {
    async function checkAdminStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");

      setIsAdmin(data != null && data.length > 0);
    }

    void checkAdminStatus();
  }, []);

  const filteredSubtypeOptions = useMemo(() => {
    if (activityFilter === "all") {
      return allSubtypeOptions;
    }

    return subtypeOptionsByActivitySlug[activityFilter] ?? [];
  }, [activityFilter, allSubtypeOptions, subtypeOptionsByActivitySlug]);

  useEffect(() => {
    if (subtypeFilter === "all") return;

    const validSubtypeSlugs = filteredSubtypeOptions.map((option) => option.slug);

    if (!validSubtypeSlugs.includes(subtypeFilter)) {
      setSubtypeFilter("all");
    }
  }, [subtypeFilter, filteredSubtypeOptions]);

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesActivity = activityFilter === "all" || template.activity === activityFilter;
      const matchesSubtype = subtypeFilter === "all" || template.subtype === subtypeFilter;

      if (!matchesActivity || !matchesSubtype) return false;
      if (!query) return true;

      return buildTemplateSearchText(template).includes(query);
    });
  }, [templates, searchQuery, activityFilter, subtypeFilter]);

  function getDraft(template: FunctionalTemplateRow) {
    return drafts[template.id] ?? createFormFromRow(template);
  }

  function isDirty(template: FunctionalTemplateRow) {
    const draft = getDraft(template);
    return JSON.stringify(draft) !== JSON.stringify(createFormFromRow(template));
  }

  function toggleTemplate(templateId: string) {
    setExpandedTemplateId((current) => {
      const next = current === templateId ? null : templateId;

      if (next === templateId) {
        const template = templates.find((item) => item.id === templateId);
        if (template) {
          setDrafts((currentDrafts) => {
            if (currentDrafts[templateId]) return currentDrafts;
            return {
              ...currentDrafts,
              [templateId]: createFormFromRow(template),
            };
          });
        }
      }

      return next;
    });
  }

  function updateDraftField(
    templateId: string,
    field: keyof FunctionalTemplateForm,
    value: string | boolean,
  ) {
    setDrafts((current) => {
      const baseTemplate = templates.find((template) => template.id === templateId);
      const existingDraft =
        current[templateId] ?? (baseTemplate ? createFormFromRow(baseTemplate) : null);

      if (!existingDraft) return current;

      const nextDraft: FunctionalTemplateForm = {
        ...existingDraft,
        [field]: value as never,
      };

      if (field === "activity") {
        const allowedSubtypes = subtypeOptionsByActivitySlug[String(value)] ?? [];
        if (!allowedSubtypes.some((option) => option.slug === nextDraft.subtype)) {
          nextDraft.subtype = allowedSubtypes[0]?.slug ?? "";
        }
      }

      return {
        ...current,
        [templateId]: nextDraft,
      };
    });
  }

  async function handleSaveTemplate(template: FunctionalTemplateRow) {
    const draft = getDraft(template);

    if (!draft.name.trim()) {
      showTemporaryStatus("Template name is required.");
      return;
    }

    if (!draft.activity || !draft.subtype) {
      showTemporaryStatus("Activity and subtype are required.");
      return;
    }

    setSavingTemplateId(template.id);

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      type: "functional",
      activity: draft.activity,
      subtype: draft.subtype,
      duration_minutes: parseNullableInteger(draft.durationMinutes),
      distance_km: parseNullableNumber(draft.distanceKm),
      target_intensity: draft.targetIntensity.trim() || null,
      session_data: buildSessionData(draft),
    };

    const { error } = await supabase
      .from("session_templates")
      .update(payload)
      .eq("id", template.id);

    setSavingTemplateId(null);

    if (error) {
      showTemporaryStatus(`Could not update template: ${error.message}`, 4000);
      return;
    }

    await loadTemplates();
    setDrafts((current) => {
      const next = { ...current };
      delete next[template.id];
      return next;
    });
    showTemporaryStatus("Functional template updated.");
  }

  async function handleDeleteTemplate(template: FunctionalTemplateRow) {
    const confirmed = window.confirm(
      `Delete functional template "${template.name}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    setDeletingTemplateId(template.id);

    const { error } = await supabase.from("session_templates").delete().eq("id", template.id);

    setDeletingTemplateId(null);

    if (error) {
      showTemporaryStatus(`Could not delete template: ${error.message}`, 4000);
      return;
    }

    setTemplates((current) => current.filter((item) => item.id !== template.id));
    setDrafts((current) => {
      const next = { ...current };
      delete next[template.id];
      return next;
    });

    if (expandedTemplateId === template.id) {
      setExpandedTemplateId(null);
    }

    showTemporaryStatus("Functional template deleted.");
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Functional Session Templates</h1>
          <p className="mt-3 max-w-3xl text-zinc-600">
            Browse, edit and manage non-gym templates from Supabase.
          </p>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Find Functional Templates</h2>

          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
            <input
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, terrain, tags, timing, or description"
            />

            <select
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              disabled={loadingOptionData}
            >
              <option value="all">All Activities</option>
              {activityOptions.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3"
              value={subtypeFilter}
              onChange={(e) => setSubtypeFilter(e.target.value)}
              disabled={loadingOptionData}
            >
              <option value="all">All Subtypes</option>
              {filteredSubtypeOptions.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 space-y-4">
            {loading ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                Loading functional templates...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                No functional templates matched that search.
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const isExpanded = expandedTemplateId === template.id;
                const draft = getDraft(template);
                const templateVis: FieldVisibility =
                  fieldConfigMap[`${draft.activity}:${draft.subtype}`] ??
                  fieldConfigMap[`${draft.activity}:*`] ??
                  fieldConfigMap[`*:*`] ??
                  FIELD_VISIBILITY_DEFAULTS;

                const subtypeOptionsForActivity =
                  subtypeOptionsByActivitySlug[draft.activity] ?? [];

                return (
                  <div
                    key={template.id}
                    className={`rounded-xl border p-4 transition ${
                      isExpanded
                        ? "border-zinc-300 bg-white shadow-sm"
                        : "border-zinc-200 bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <button
                        type="button"
                        onClick={() => toggleTemplate(template.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900">{template.name}</div>
                            <div className="mt-1 text-sm text-zinc-600">
                              {template.description || "—"}
                            </div>
                            <div className="mt-2 text-xs text-zinc-500">
                              {formatLabel(template.activity)} · {formatLabel(template.subtype)}
                              {template.duration_minutes != null ? ` · ${template.duration_minutes} min` : ""}
                              {template.target_intensity ? ` · ${template.target_intensity}` : ""}
                            </div>
                          </div>

                          <div className="shrink-0 text-xs font-semibold text-zinc-500">
                            {isExpanded ? "Hide" : "View"}
                          </div>
                        </div>
                      </button>

                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteTemplate(template)}
                          disabled={deletingTemplateId === template.id}
                          className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingTemplateId === template.id ? "Deleting…" : "Delete"}
                        </button>
                      ) : null}
                    </div>

                    {isExpanded ? (
                      <div
                        className="mt-4 border-t border-zinc-200 pt-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Name
                            </span>
                            <input
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.name}
                              onChange={(e) =>
                                updateDraftField(template.id, "name", e.target.value)
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Activity
                            </span>
                            <select
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.activity}
                              onChange={(e) =>
                                updateDraftField(template.id, "activity", e.target.value)
                              }
                            >
                              {activityOptions.map((option) => (
                                <option key={option.id} value={option.slug}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Subtype
                            </span>
                            <select
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.subtype}
                              onChange={(e) =>
                                updateDraftField(template.id, "subtype", e.target.value)
                              }
                              disabled={subtypeOptionsForActivity.length === 0}
                            >
                              {subtypeOptionsForActivity.length === 0 ? (
                                <option value="">No subtypes available</option>
                              ) : (
                                subtypeOptionsForActivity.map((option) => (
                                  <option key={option.id} value={option.slug}>
                                    {option.label}
                                  </option>
                                ))
                              )}
                            </select>
                          </label>

                          {templateVis.show_duration ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Duration (minutes)
                              </span>
                              <input
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.durationMinutes}
                                onChange={(e) =>
                                  updateDraftField(template.id, "durationMinutes", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_distance ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Distance (km)
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.distanceKm}
                                onChange={(e) =>
                                  updateDraftField(template.id, "distanceKm", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_target_intensity ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Target Intensity
                              </span>
                              <input
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.targetIntensity}
                                onChange={(e) =>
                                  updateDraftField(template.id, "targetIntensity", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_terrain ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Terrain
                              </span>
                              <select
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.terrain}
                                onChange={(e) =>
                                  updateDraftField(template.id, "terrain", e.target.value)
                                }
                              >
                                {terrainOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {formatLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}

                          {templateVis.show_elevation ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Elevation / Steepness
                              </span>
                              <input
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.elevation}
                                onChange={(e) =>
                                  updateDraftField(template.id, "elevation", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_pack_weight ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Pack Weight (kg)
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.packWeightKg}
                                onChange={(e) =>
                                  updateDraftField(template.id, "packWeightKg", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_sets ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Sets
                              </span>
                              <input
                                type="number"
                                min="1"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.sets}
                                onChange={(e) =>
                                  updateDraftField(template.id, "sets", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_set_duration ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Set Duration (seconds)
                              </span>
                              <input
                                type="number"
                                min="1"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.setDurationSeconds}
                                onChange={(e) =>
                                  updateDraftField(template.id, "setDurationSeconds", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          {templateVis.show_rest_seconds ? (
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-zinc-700">
                                Rest Between Sets (seconds)
                              </span>
                              <input
                                type="number"
                                min="0"
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                                value={draft.restSeconds}
                                onChange={(e) =>
                                  updateDraftField(template.id, "restSeconds", e.target.value)
                                }
                              />
                            </label>
                          ) : null}

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Time of Day
                            </span>
                            <select
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.timeOfDay}
                              onChange={(e) =>
                                updateDraftField(template.id, "timeOfDay", e.target.value)
                              }
                            >
                              {timeOfDayOptions.map((option) => (
                                <option key={option} value={option}>
                                  {formatLabel(option)}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Exact Start Time
                            </span>
                            <input
                              type="time"
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.startTime}
                              onChange={(e) =>
                                updateDraftField(template.id, "startTime", e.target.value)
                              }
                            />
                          </label>

                          <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
                            <input
                              type="checkbox"
                              checked={draft.isTimeStrict}
                              onChange={(e) =>
                                updateDraftField(template.id, "isTimeStrict", e.target.checked)
                              }
                            />
                            <span className="text-sm text-zinc-700">Time is strict</span>
                          </label>
                        </div>

                        <div className="mt-4 grid gap-4">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Description
                            </span>
                            <textarea
                              className="min-h-[90px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.description}
                              onChange={(e) =>
                                updateDraftField(template.id, "description", e.target.value)
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Notes
                            </span>
                            <textarea
                              className="min-h-[90px] w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.notes}
                              onChange={(e) =>
                                updateDraftField(template.id, "notes", e.target.value)
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-zinc-700">
                              Tags
                            </span>
                            <input
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              value={draft.tags}
                              onChange={(e) =>
                                updateDraftField(template.id, "tags", e.target.value)
                              }
                              placeholder="easy, trail, night"
                            />
                          </label>
                        </div>

                        <div className="mt-4">
                          <button
                            type="button"
                            disabled={!isDirty(template) || savingTemplateId === template.id}
                            onClick={() => void handleSaveTemplate(template)}
                            className={`rounded-xl px-5 py-3 text-sm font-semibold transition ${
                              !isDirty(template) || savingTemplateId === template.id
                                ? "cursor-not-allowed border border-zinc-200 bg-zinc-200 text-zinc-500"
                                : "border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700"
                            }`}
                          >
                            {savingTemplateId === template.id ? "Saving..." : "Save Changes"}
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
      </div>
    </main>
  );
}
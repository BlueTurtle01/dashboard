"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SEGMENT_TRAINING_FOCUS_TAGS } from "@/lib/constants/race-segment-tags";

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
  description: string;
  activity: string;
  subtype: string;
  durationMinutes: string;
  distanceKm: string;
  targetIntensity: string;
  terrain: string;
  elevation: string;
  packWeightKg: string;
  strides: string;
  warmUpMinutes: string;
  coolDownMinutes: string;
  intervalReps: string;
  intervalDuration: string;
  gradientPercent: string;
  perceivedEffort: string;
  timeOfDay: string;
  startTime: string;
  isTimeStrict: boolean;
  sets: string;
  setDurationSeconds: string;
  restSeconds: string;
  notes: string;
  tags: string[];
  aimTags: string[];
};

// ---------------------------------------------------------------------------
// Field visibility — driven by the session_template_field_config_resolved view.
// The DB row maps 1:1 to this type; all fields are non-nullable because the
// view always coalesces against the global-default row.
// ---------------------------------------------------------------------------
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

type IntensityOption = {
  id: string;
  label: string;
  slug: string;
};

const SUGGESTED_TAGS = [
  "bodyweight", "core", "fallback", "fartlek", "hinge", "home",
  "intervals", "legs", "low-impact", "lower-body", "mobility",
  "pack-carry", "posterior-chain", "recovery", "stability",
  "strength", "upper-body", "heat", "night", "trail", "sand",
];

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

function createEmptyForm(): FunctionalTemplateForm {
  return {
    description: "",
    activity: "",
    subtype: "",
    durationMinutes: "",
    distanceKm: "",
    targetIntensity: "",
    terrain: "any",
    elevation: "",
    packWeightKg: "",
    strides: "",
    warmUpMinutes: "",
    coolDownMinutes: "",
    intervalReps: "",
    intervalDuration: "",
    gradientPercent: "",
    perceivedEffort: "",
    timeOfDay: "any",
    startTime: "",
    isTimeStrict: false,
    sets: "",
    setDurationSeconds: "",
    restSeconds: "",
    notes: "",
    tags: [],
    aimTags: [],
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

function shouldShowTerrainForActivity(activity: string): boolean {
  const activityLower = (activity || "").toLowerCase();
  // Activities that don't need terrain
  const noTerrainActivities = ["swimming", "swim", "stairs", "stair", "strength", "core"];
  return !noTerrainActivities.some((a) => activityLower.includes(a));
}

function buildSessionData(form: FunctionalTemplateForm) {
  return {
    terrain: form.terrain || null,
    elevation: form.elevation.trim() || null,
    pack_weight_kg: parseNullableNumber(form.packWeightKg),
    strides: parseNullableInteger(form.strides),
    warm_up_minutes: parseNullableInteger(form.warmUpMinutes),
    cool_down_minutes: parseNullableInteger(form.coolDownMinutes),
    interval_reps: form.intervalReps.trim() || null,
    interval_duration: form.intervalDuration.trim() || null,
    gradient_percent: parseNullableNumber(form.gradientPercent),
    perceived_effort: parseNullableInteger(form.perceivedEffort),
    time_of_day: form.timeOfDay || null,
    start_time: form.startTime || null,
    is_time_strict: form.isTimeStrict,
    sets: parseNullableInteger(form.sets),
    set_duration_seconds: parseNullableInteger(form.setDurationSeconds),
    rest_seconds: parseNullableInteger(form.restSeconds),
    notes: form.notes.trim() || null,
    tags: form.tags,
    aim_tags: form.aimTags,
  };
}

function formFromRow(row: FunctionalTemplateRow): FunctionalTemplateForm {
  const sessionData = row.session_data ?? {};
  const packWeightValue = sessionData["pack_weight_kg"];
  const stridesValue = sessionData["strides"];
  const warmUpValue = sessionData["warm_up_minutes"];
  const coolDownValue = sessionData["cool_down_minutes"];
  const intervalRepsValue = sessionData["interval_reps"];
  const intervalDurationValue = sessionData["interval_duration"];
  const gradientPercentValue = sessionData["gradient_percent"];
  const perceivedEffortValue = sessionData["perceived_effort"];
  const tagValue = sessionData["tags"];
  const aimTagValue = sessionData["aim_tags"];

  return {
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
    strides:
      typeof stridesValue === "number"
        ? String(stridesValue)
        : typeof stridesValue === "string"
          ? stridesValue
          : "",
    warmUpMinutes:
      typeof warmUpValue === "number"
        ? String(warmUpValue)
        : typeof warmUpValue === "string"
          ? warmUpValue
          : "",
    coolDownMinutes:
      typeof coolDownValue === "number"
        ? String(coolDownValue)
        : typeof coolDownValue === "string"
          ? coolDownValue
          : "",
    intervalReps: typeof intervalRepsValue === "string" ? intervalRepsValue : "",
    intervalDuration: typeof intervalDurationValue === "string" ? intervalDurationValue : "",
    gradientPercent: typeof gradientPercentValue === "number" ? String(gradientPercentValue) : typeof gradientPercentValue === "string" ? gradientPercentValue : "",
    perceivedEffort: typeof perceivedEffortValue === "number" ? String(perceivedEffortValue) : typeof perceivedEffortValue === "string" ? perceivedEffortValue : "",
    timeOfDay:
      typeof sessionData["time_of_day"] === "string" && sessionData["time_of_day"]
        ? sessionData["time_of_day"]
        : "any",
    startTime: typeof sessionData["start_time"] === "string" ? sessionData["start_time"] : "",
    isTimeStrict: Boolean(sessionData["is_time_strict"]),
    sets: sessionData["sets"] != null ? String(sessionData["sets"]) : "",
    setDurationSeconds:
      sessionData["set_duration_seconds"] != null ? String(sessionData["set_duration_seconds"]) : "",
    restSeconds: sessionData["rest_seconds"] != null ? String(sessionData["rest_seconds"]) : "",
    notes: typeof sessionData["notes"] === "string" ? sessionData["notes"] : "",
    tags: Array.isArray(tagValue) ? tagValue.map(String) : [],
    aimTags: Array.isArray(aimTagValue) ? aimTagValue.map(String) : [],
  };
}

function buildTemplatePrefix(activityLabel: string, subtypeLabel: string) {
  return `${activityLabel} - ${subtypeLabel} - `;
}

function parseTrailingNumber(name: string, activityLabel: string, subtypeLabel: string) {
  const prefix = buildTemplatePrefix(activityLabel, subtypeLabel);
  if (!name.startsWith(prefix)) return null;

  const suffix = name.slice(prefix.length).trim();
  const parsed = Number.parseInt(suffix, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

export default function FunctionalSessionTemplatesPage() {
  const [templates, setTemplates] = useState<FunctionalTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingOptionData, setLoadingOptionData] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [subtypeFilter, setSubtypeFilter] = useState("all");
  const [statusMessage, setStatusMessage] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState<FunctionalTemplateForm>(createEmptyForm());
  const [generatedNumber, setGeneratedNumber] = useState<number | null>(null);
  const [loadingGeneratedNumber, setLoadingGeneratedNumber] = useState(false);

  const [tagSearch, setTagSearch] = useState("");
  const [aimTagSearch, setAimTagSearch] = useState("");
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [subtypeOptionsByActivitySlug, setSubtypeOptionsByActivitySlug] = useState<
    Record<string, SubtypeOption[]>
  >({});
  const [allSubtypeOptions, setAllSubtypeOptions] = useState<SubtypeOption[]>([]);
  const [fieldConfigMap, setFieldConfigMap] = useState<Record<string, FieldVisibility>>({});
  const [intensityOptions, setIntensityOptions] = useState<IntensityOption[]>([]);

  async function loadTemplates() {
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("session_templates")
      .select(
        "id, name, description, type, activity, subtype, duration_minutes, distance_km, target_intensity, session_data, created_at",
      )
      .eq("type", "functional")
      .order("name", { ascending: true });

    if (error) {
      setTemplates([]);
      setStatusMessage(`Failed to load functional session templates: ${error.message}`);
      setLoading(false);
      return;
    }

    setTemplates((data ?? []) as FunctionalTemplateRow[]);
    setLoading(false);
  }

  async function loadActivityAndSubtypeOptions() {
    setLoadingOptionData(true);

    const supabase = createClient();
    const [activitiesResult, subtypesResult, linksResult, fieldConfigResult, intensitiesResult] = await Promise.all([
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
      supabase
        .from("training_intensities")
        .select("id, label, slug")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (activitiesResult.error) {
      setStatusMessage(`Failed to load session activities: ${activitiesResult.error.message}`);
      setLoadingOptionData(false);
      return;
    }

    if (subtypesResult.error) {
      setStatusMessage(`Failed to load session subtypes: ${subtypesResult.error.message}`);
      setLoadingOptionData(false);
      return;
    }

    if (linksResult.error) {
      setStatusMessage(`Failed to load activity/subtype mappings: ${linksResult.error.message}`);
      setLoadingOptionData(false);
      return;
    }

    if (fieldConfigResult.error) {
      setStatusMessage(`Failed to load field config: ${fieldConfigResult.error.message}`);
      setLoadingOptionData(false);
      return;
    }

    if (intensitiesResult.error) {
      setStatusMessage(`Failed to load training intensities: ${intensitiesResult.error.message}`);
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
    setFieldConfigMap(configMap);

    const intensities = (intensitiesResult.data ?? []) as IntensityOption[];
    setIntensityOptions(intensities);

    setLoadingOptionData(false);
  }

  useEffect(() => {
    void loadTemplates();
    void loadActivityAndSubtypeOptions();
  }, []);

  const allowedSubtypeOptionsForSelectedActivity = useMemo(() => {
    if (!form.activity) return [];
    return subtypeOptionsByActivitySlug[form.activity] ?? [];
  }, [form.activity, subtypeOptionsByActivitySlug]);

  useEffect(() => {
    if (loadingOptionData) return;
    if (activityOptions.length === 0) return;

    setForm((current) => {
      let nextActivity = current.activity;
      if (!nextActivity || !activityOptions.some((option) => option.slug === nextActivity)) {
        nextActivity = activityOptions[0]?.slug ?? "";
      }

      const allowedSubtypes = subtypeOptionsByActivitySlug[nextActivity] ?? [];
      let nextSubtype = current.subtype;

      if (!nextSubtype || !allowedSubtypes.some((option) => option.slug === nextSubtype)) {
        nextSubtype = allowedSubtypes[0]?.slug ?? "";
      }

      if (nextActivity === current.activity && nextSubtype === current.subtype) {
        return current;
      }

      return {
        ...current,
        activity: nextActivity,
        subtype: nextSubtype,
      };
    });
  }, [loadingOptionData, activityOptions, subtypeOptionsByActivitySlug]);

  useEffect(() => {
    if (loadingOptionData) return;
    if (!form.activity) return;

    const allowedSubtypes = subtypeOptionsByActivitySlug[form.activity] ?? [];
    if (allowedSubtypes.length === 0) return;

    if (!allowedSubtypes.some((option) => option.slug === form.subtype)) {
      setForm((current) => ({
        ...current,
        subtype: allowedSubtypes[0]?.slug ?? "",
      }));
    }
  }, [form.activity, form.subtype, loadingOptionData, subtypeOptionsByActivitySlug]);

  const selectedActivityOption = useMemo(
    () => activityOptions.find((option) => option.slug === form.activity) ?? null,
    [activityOptions, form.activity],
  );

  const selectedSubtypeOption = useMemo(
    () =>
      allowedSubtypeOptionsForSelectedActivity.find((option) => option.slug === form.subtype) ??
      null,
    [allowedSubtypeOptionsForSelectedActivity, form.subtype],
  );

  const fieldVis = useMemo((): FieldVisibility => {
    if (!form.activity || !form.subtype) return FIELD_VISIBILITY_DEFAULTS;
    return (
      fieldConfigMap[`${form.activity}:${form.subtype}`] ??
      fieldConfigMap[`${form.activity}:*`] ??
      fieldConfigMap[`*:*`] ??
      FIELD_VISIBILITY_DEFAULTS
    );
  }, [form.activity, form.subtype, fieldConfigMap]);

  useEffect(() => {
    let cancelled = false;

    async function loadGeneratedNumber() {
      if (!form.activity || !form.subtype || !selectedActivityOption || !selectedSubtypeOption) {
        setGeneratedNumber(null);
        setLoadingGeneratedNumber(false);
        return;
      }

      setLoadingGeneratedNumber(true);

      const supabase = createClient();
      const { data, error } = await supabase
        .from("session_templates")
        .select("id, name")
        .eq("type", "functional")
        .eq("activity", form.activity)
        .eq("subtype", form.subtype);

      if (cancelled) return;

      if (error) {
        setGeneratedNumber(null);
        setLoadingGeneratedNumber(false);
        return;
      }

      const rows = (data ?? []) as Array<{ id: string; name: string }>;

      let existingNumberForCurrentTemplate: number | null = null;
      let highestNumber = 0;

      for (const row of rows) {
        const parsedNumber = parseTrailingNumber(
          row.name,
          selectedActivityOption.label,
          selectedSubtypeOption.label,
        );
        if (parsedNumber == null) continue;

        if (row.id === editingTemplateId) {
          existingNumberForCurrentTemplate = parsedNumber;
        }

        if (parsedNumber > highestNumber) {
          highestNumber = parsedNumber;
        }
      }

      setGeneratedNumber(existingNumberForCurrentTemplate ?? highestNumber + 1);
      setLoadingGeneratedNumber(false);
    }

    void loadGeneratedNumber();

    return () => {
      cancelled = true;
    };
  }, [form.activity, form.subtype, editingTemplateId, selectedActivityOption, selectedSubtypeOption]);

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
  }

  function updateForm<K extends keyof FunctionalTemplateForm>(
    field: K,
    value: FunctionalTemplateForm[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setEditingTemplateId(null);
    setForm(createEmptyForm());
    setGeneratedNumber(null);
  }

  function startEditingTemplate(row: FunctionalTemplateRow) {
    setEditingTemplateId(row.id);
    setExpandedTemplateId(row.id);
    setForm(formFromRow(row));
  }

const generatedNamePreview = useMemo(() => {
  if (!selectedActivityOption || !selectedSubtypeOption) return "";

  const isRun = form.activity === "run";

  if (isRun) {
    const parts: string[] = [];

    parts.push(selectedActivityOption.label);
    parts.push(selectedSubtypeOption.label);

    if (form.distanceKm) {
      parts.push(`${form.distanceKm}km`);
    }

    if (form.terrain && form.terrain !== "any") {
      parts.push(formatLabel(form.terrain));
    }

    if (form.packWeightKg) {
      parts.push(`${form.packWeightKg}kg`);
    }

    let name = parts.join(" - ");

    // Append time of day if specified
    if (form.timeOfDay && form.timeOfDay !== "any") {
      name += ` - ${formatLabel(form.timeOfDay)}`;
    }

    return name;
  }

  // fallback to numbered system
  if (generatedNumber == null) return "";

  let name = `${selectedActivityOption.label} - ${selectedSubtypeOption.label} - ${generatedNumber}`;

  // Append time of day if specified
  if (form.timeOfDay && form.timeOfDay !== "any") {
    name += ` - ${formatLabel(form.timeOfDay)}`;
  }

  return name;
}, [
  selectedActivityOption,
  selectedSubtypeOption,
  generatedNumber,
  form.activity,
  form.distanceKm,
  form.terrain,
  form.packWeightKg,
  form.timeOfDay,
]);

  async function handleSaveTemplate() {
    if (!generatedNamePreview || !form.activity || !form.subtype) {
      showTemporaryStatus("Activity and subtype are required.");
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const payload = {
      name: generatedNamePreview,
      description: form.description.trim() || null,
      type: "functional",
      activity: form.activity,
      subtype: form.subtype,
      duration_minutes: parseNullableInteger(form.durationMinutes),
      distance_km: parseNullableNumber(form.distanceKm),
      target_intensity: form.targetIntensity.trim() || null,
      session_data: buildSessionData(form),
    };

    if (editingTemplateId) {
      const { error } = await supabase
        .from("session_templates")
        .update(payload)
        .eq("id", editingTemplateId);

      setSaving(false);

      if (error) {
        showTemporaryStatus(`Could not update template: ${error.message}`, 4000);
        return;
      }

      await loadTemplates();
      resetForm();
      showTemporaryStatus("Functional session template updated.");
      return;
    }

    const { error } = await supabase.from("session_templates").insert(payload);

    setSaving(false);

    if (error) {
      showTemporaryStatus(`Could not create template: ${error.message}`, 4000);
      return;
    }

    await loadTemplates();
    resetForm();
    showTemporaryStatus("Functional session template created.");
  }

  async function handleDeleteTemplate(templateId: string, templateName: string) {
    const confirmed = window.confirm(
      `Delete functional session template "${templateName}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    const supabase = createClient();
    const { error } = await supabase.from("session_templates").delete().eq("id", templateId);

    if (error) {
      showTemporaryStatus(`Could not delete template: ${error.message}`, 4000);
      return;
    }

    if (editingTemplateId === templateId) {
      resetForm();
    }

    setTemplates((current) => current.filter((template) => template.id !== templateId));
    showTemporaryStatus("Functional session template deleted.");
  }

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return templates.filter((template) => {
      const sessionData = template.session_data ?? {};
      const tags = Array.isArray(sessionData["tags"]) ? sessionData["tags"].join(" ") : "";

      const matchesActivity = activityFilter === "all" || template.activity === activityFilter;
      const matchesSubtype = subtypeFilter === "all" || template.subtype === subtypeFilter;

      if (!matchesActivity || !matchesSubtype) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        template.name,
        template.description,
        template.activity,
        template.subtype,
        template.target_intensity,
        sessionData["terrain"],
        sessionData["elevation"],
        sessionData["time_of_day"],
        sessionData["notes"],
        tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [templates, searchQuery, activityFilter, subtypeFilter]);

  return (
    <main className="min-h-screen">
      <div className="px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Functional Session Templates</h1>
          <p className="mt-3 max-w-3xl text-zinc-600">
            Create and manage non-gym session templates such as running, swimming, cycling, hill
            walking, pack carries and race simulation sessions.
          </p>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">
                {editingTemplateId ? "Edit Functional Template" : "Create Functional Template"}
              </h2>

              {editingTemplateId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
                >
                  New Template
                </button>
              ) : null}
            </div>

            <div className="space-y-4">
              {loadingOptionData ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
                  Loading activity and subtype options...
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Activity</span>
                  <select
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={form.activity}
                    onChange={(e) => updateForm("activity", e.target.value)}
                    disabled={loadingOptionData}
                  >
                    {activityOptions.length === 0 ? (
                      <option value="">No activities available</option>
                    ) : (
                      activityOptions.map((option) => (
                        <option key={option.id} value={option.slug}>
                          {option.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Subtype</span>
                  <select
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={form.subtype}
                    onChange={(e) => updateForm("subtype", e.target.value)}
                    disabled={loadingOptionData || allowedSubtypeOptionsForSelectedActivity.length === 0}
                  >
                    {allowedSubtypeOptionsForSelectedActivity.length === 0 ? (
                      <option value="">No subtypes available</option>
                    ) : (
                      allowedSubtypeOptionsForSelectedActivity.map((option) => (
                        <option key={option.id} value={option.slug}>
                          {option.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>

              <div>
                <span className="mb-1 block text-sm font-semibold text-zinc-900">Template name</span>
                <div className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
                  {!form.activity || !form.subtype ? (
                    <span className="text-zinc-500">
                      Select activity and subtype to generate a name.
                    </span>
                  ) : loadingGeneratedNumber ? (
                    <span className="text-zinc-500">Calculating next number…</span>
                  ) : (
                    generatedNamePreview
                  )}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  The number is assigned automatically from existing templates with the same activity
                  and subtype.
                </p>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-zinc-900">Description</span>
                <textarea
                  className="min-h-[90px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  placeholder="Short description of the session"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                {fieldVis.show_target_intensity ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Target Intensity
                    </span>
                    <select
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.targetIntensity}
                      onChange={(e) => updateForm("targetIntensity", e.target.value)}
                    >
                      <option value="">Select an intensity...</option>
                      {intensityOptions.map((option) => (
                        <option key={option.id} value={option.label}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {fieldVis.show_duration ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Duration (minutes)
                    </span>
                    <input
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.durationMinutes}
                      onChange={(e) => updateForm("durationMinutes", e.target.value)}
                      placeholder="90"
                    />
                  </label>
                ) : null}

                {fieldVis.show_distance ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Distance (km)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.distanceKm}
                      onChange={(e) => updateForm("distanceKm", e.target.value)}
                      placeholder="12"
                    />
                  </label>
                ) : null}

                {fieldVis.show_sets ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">Sets</span>
                    <input
                      type="number"
                      min="1"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.sets}
                      onChange={(e) => updateForm("sets", e.target.value)}
                      placeholder="6"
                    />
                  </label>
                ) : null}

                {fieldVis.show_set_duration ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Set Duration (seconds)
                    </span>
                    <input
                      type="number"
                      min="1"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.setDurationSeconds}
                      onChange={(e) => updateForm("setDurationSeconds", e.target.value)}
                      placeholder="60"
                    />
                  </label>
                ) : null}

                {fieldVis.show_rest_seconds ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Rest Between Sets (seconds)
                    </span>
                    <input
                      type="number"
                      min="0"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.restSeconds}
                      onChange={(e) => updateForm("restSeconds", e.target.value)}
                      placeholder="90"
                    />
                  </label>
                ) : null}

                {fieldVis.show_terrain && shouldShowTerrainForActivity(form.activity) ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">Terrain</span>
                    <select
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.terrain}
                      onChange={(e) => updateForm("terrain", e.target.value)}
                    >
                      {terrainOptions.map((option) => (
                        <option key={option} value={option}>
                          {formatLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {fieldVis.show_elevation ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Elevation / Steepness
                    </span>
                    <input
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.elevation}
                      onChange={(e) => updateForm("elevation", e.target.value)}
                      placeholder="e.g. Hilly, steep, rolling"
                    />
                  </label>
                ) : null}

                {fieldVis.show_pack_weight ? (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-zinc-900">
                      Pack Weight (kg)
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                      value={form.packWeightKg}
                      onChange={(e) => updateForm("packWeightKg", e.target.value)}
                      placeholder="6"
                    />
                  </label>
                ) : null}

                {form.activity.toLowerCase() === "run" ? (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-zinc-900">
                        Strides
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        value={form.strides}
                        onChange={(e) => updateForm("strides", e.target.value)}
                        placeholder="20"
                      />
                      <p className="mt-1 text-xs text-zinc-500">
                        Optional: Number of strides at the end of the run
                      </p>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-zinc-900">
                        Warm Up
                      </span>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        value={form.warmUpMinutes}
                        onChange={(e) => updateForm("warmUpMinutes", e.target.value)}
                      >
                        <option value="">— None —</option>
                        <option value="5">5 minutes</option>
                        <option value="10">10 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="20">20 minutes</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-sm font-semibold text-zinc-900">
                        Cool Down
                      </span>
                      <select
                        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                        value={form.coolDownMinutes}
                        onChange={(e) => updateForm("coolDownMinutes", e.target.value)}
                      >
                        <option value="">— None —</option>
                        <option value="5">5 minutes</option>
                        <option value="10">10 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="20">20 minutes</option>
                      </select>
                    </label>

                    {form.subtype.toLowerCase().includes("interval") ? (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-zinc-900">
                            Interval Reps
                          </span>
                          <input
                            type="text"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                            value={form.intervalReps}
                            onChange={(e) => updateForm("intervalReps", e.target.value)}
                            placeholder="e.g. 10x1min or 6x3min"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Repetition format and duration
                          </p>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-zinc-900">
                            Recovery / Interval Duration
                          </span>
                          <input
                            type="text"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                            value={form.intervalDuration}
                            onChange={(e) => updateForm("intervalDuration", e.target.value)}
                            placeholder="e.g. 1min jog or 2min walk"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Recovery period between intervals
                          </p>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-zinc-900">
                            Gradient (%)
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                            value={form.gradientPercent}
                            onChange={(e) => updateForm("gradientPercent", e.target.value)}
                            placeholder="e.g. 8"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Hill gradient as a percentage
                          </p>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-sm font-semibold text-zinc-900">
                            Perceived Effort (%)
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                            value={form.perceivedEffort}
                            onChange={(e) => updateForm("perceivedEffort", e.target.value)}
                            placeholder="e.g. 80"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            Target perceived effort as a percentage (0–100)
                          </p>
                        </label>
                      </>
                    ) : null}
                  </>
                ) : null}

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">
                    Time of Day
                  </span>
                  <select
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={form.timeOfDay}
                    onChange={(e) => updateForm("timeOfDay", e.target.value)}
                  >
                    {timeOfDayOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">
                    Exact Start Time
                  </span>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={form.startTime}
                    onChange={(e) => updateForm("startTime", e.target.value)}
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.isTimeStrict}
                  onChange={(e) => updateForm("isTimeStrict", e.target.checked)}
                />
                <span className="text-sm font-medium text-zinc-900">
                  Exact start time is strict
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-zinc-900">Notes</span>
                <textarea
                  className="min-h-[90px] w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  placeholder="Extra guidance for the coach or athlete"
                />
              </label>

              <div>
                <span className="mb-1 block text-sm font-semibold text-zinc-900">Tags</span>

                {/* Selected tags */}
                {form.tags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {form.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => updateForm("tags", form.tags.filter((t) => t !== tag))}
                          className="ml-0.5 text-zinc-400 hover:text-white leading-none"
                          aria-label={`Remove ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search input */}
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagSearch.trim()) {
                      e.preventDefault();
                      const tag = tagSearch.trim().toLowerCase();
                      if (!form.tags.includes(tag)) {
                        updateForm("tags", [...form.tags, tag]);
                      }
                      setTagSearch("");
                    }
                  }}
                  placeholder="Search or type a tag, press Enter to add"
                />

                {/* Suggestions */}
                {(() => {
                  const q = tagSearch.trim().toLowerCase();
                  const suggestions = SUGGESTED_TAGS.filter(
                    (t) => (!q || t.includes(q)) && !form.tags.includes(t)
                  ).slice(0, 12);
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {suggestions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            updateForm("tags", [...form.tags, tag]);
                            setTagSearch("");
                          }}
                          className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-900 hover:bg-zinc-100 transition-colors"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div>
                <span className="mb-1 block text-sm font-semibold text-zinc-900">Race Focus Tags</span>

                {/* Selected aim tags */}
                {form.aimTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {form.aimTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => updateForm("aimTags", form.aimTags.filter((t) => t !== tag))}
                          className="ml-0.5 text-amber-200 hover:text-white leading-none"
                          aria-label={`Remove ${tag}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search input */}
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                  value={aimTagSearch}
                  onChange={(e) => setAimTagSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aimTagSearch.trim()) {
                      e.preventDefault();
                      const tag = aimTagSearch.trim().toLowerCase();
                      if (!form.aimTags.includes(tag)) {
                        updateForm("aimTags", [...form.aimTags, tag]);
                      }
                      setAimTagSearch("");
                    }
                  }}
                  placeholder="Search or type a tag, press Enter to add"
                />

                {/* Suggestions */}
                {(() => {
                  const q = aimTagSearch.trim().toLowerCase();
                  const suggestions = SEGMENT_TRAINING_FOCUS_TAGS.filter(
                    (t) => (!q || t.includes(q)) && !form.aimTags.includes(t)
                  ).slice(0, 12);
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {suggestions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            updateForm("aimTags", [...form.aimTags, tag]);
                            setAimTagSearch("");
                          }}
                          className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-700 hover:border-amber-900 hover:bg-amber-100 transition-colors"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void handleSaveTemplate()}
                  disabled={saving || !generatedNamePreview || loadingGeneratedNumber || loadingOptionData}
                  className="rounded-xl border border-zinc-900 bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingTemplateId ? "Save Changes" : "Create Template"}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear
                </button>
              </div>
            </div>
          </section>
      </div>
    </main>
  );
}
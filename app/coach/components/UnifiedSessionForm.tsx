"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type UnifiedSessionFormData = {
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
  timeOfDay: string;
  sets: string;
  setDurationSeconds: string;
  restSeconds: string;
  notes: string;
  tags: string[];
  sourceSessionTemplateId?: string;
  selectedMobilitySessionId?: string;
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

interface UnifiedSessionFormProps {
  initialData?: Partial<UnifiedSessionFormData>;
  generatedNamePreview?: string;
  loadingGeneratedNumber?: boolean;
  onSave: (data: UnifiedSessionFormData) => void;
  onCancel: () => void;
  isSaving?: boolean;
  submitButtonLabel?: string;
  progressiveReveal?: boolean;
}

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

// Subtypes that are superseded by the intensity dropdown
const HIDDEN_SUBTYPES = new Set(["easy", "recovery"]);

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

function buildSessionName(activity: string, subtype: string, intensity: string, durationMinutes: string, distanceKm: string): string {
  const parts: string[] = [];
  if (activity) parts.push(formatLabel(activity));
  if (intensity) parts.push(formatLabel(intensity));
  if (subtype) parts.push(formatLabel(subtype));
  if (distanceKm) parts.push(`${distanceKm}km`);
  else if (durationMinutes) parts.push(`${durationMinutes}min`);
  return parts.join(" · ");
}

function createEmptyForm(): UnifiedSessionFormData {
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
    timeOfDay: "any",
    sets: "",
    setDurationSeconds: "",
    restSeconds: "",
    notes: "",
    tags: [],
  };
}

function getRepLabels(subtype: string): { sets: string; setDuration: string; rest: string } {
  if (subtype === "tempo") {
    return {
      sets: "Number of Reps",
      setDuration: "Rep Time (seconds)",
      rest: "Time Between Reps (seconds)",
    };
  }
  return {
    sets: "Sets",
    setDuration: "Set Duration (seconds)",
    rest: "Rest Between Sets (seconds)",
  };
}

function shouldShowTerrainForActivity(activity: string): boolean {
  const activityLower = (activity || "").toLowerCase();
  const noTerrainActivities = ["swimming", "swim", "stairs", "stair", "strength", "core"];
  return !noTerrainActivities.some((a) => activityLower.includes(a));
}

export function UnifiedSessionForm({
  initialData,
  generatedNamePreview,
  loadingGeneratedNumber = false,
  onSave,
  onCancel,
  isSaving = false,
  submitButtonLabel = "Save",
  progressiveReveal = false,
}: UnifiedSessionFormProps) {
  const [form, setForm] = useState<UnifiedSessionFormData>(
    initialData ? { ...createEmptyForm(), ...initialData } : createEmptyForm()
  );

  const [tagSearch, setTagSearch] = useState("");
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [subtypeOptionsByActivitySlug, setSubtypeOptionsByActivitySlug] = useState<
    Record<string, SubtypeOption[]>
  >({});
  const [fieldConfigMap, setFieldConfigMap] = useState<Record<string, FieldVisibility>>({});
  const [intensityOptions, setIntensityOptions] = useState<IntensityOption[]>([]);
  const [loadingOptionData, setLoadingOptionData] = useState(false);
  const [allMobilitySessions, setAllMobilitySessions] = useState<Array<{ id: string; name: string; description: string; duration_minutes: number | null }>>([]);
  const [mobilitySearchQuery, setMobilitySearchQuery] = useState("");

  async function loadActivityAndSubtypeOptions() {
    setLoadingOptionData(true);

    const supabase = createClient();
    const [activitiesResult, subtypesResult, linksResult, fieldConfigResult, intensitiesResult, mobilitySessions] = await Promise.all([
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
      supabase
        .from("mobility_sessions")
        .select("id, name, description, duration_minutes")
        .order("name"),
    ]);

    if (!activitiesResult.error && activitiesResult.data) {
      const activities = activitiesResult.data;
      const normalized = activities.map((row: any) => ({
        id: row.id,
        slug: row.slug,
        label: row.label,
      }));
      setActivityOptions(normalized);
    }

    if (!subtypesResult.error && subtypesResult.data && !linksResult.error && linksResult.data) {
      const subtypes = subtypesResult.data;
      const links = linksResult.data;

      const subtypeById = new Map(
        subtypes.map((row: any) => [
          row.id,
          {
            id: row.id,
            slug: row.slug,
            label: row.label,
            sortOrder: row.sort_order ?? 0,
          },
        ]),
      );

      const activitySlugById = new Map(
        activitiesResult.data?.map((row: any) => [row.id, row.slug]) ?? []
      );
      const subtypeMap: Record<string, SubtypeOption[]> = {};

      for (const link of links as any[]) {
        const activitySlug = activitySlugById.get(link.activity_id);
        const subtype = subtypeById.get(link.subtype_id);

        if (!activitySlug || !subtype) continue;
        if (HIDDEN_SUBTYPES.has(subtype.slug)) continue;

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

      setSubtypeOptionsByActivitySlug(subtypeMap);
    }

    if (!fieldConfigResult.error && fieldConfigResult.data) {
      const configMap: Record<string, FieldVisibility> = {};
      for (const row of fieldConfigResult.data as FieldConfigRow[]) {
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
    }

    if (!intensitiesResult.error && intensitiesResult.data) {
      setIntensityOptions(intensitiesResult.data as IntensityOption[]);
    }

    if (!mobilitySessions.error && mobilitySessions.data) {
      setAllMobilitySessions(mobilitySessions.data);
    }

    setLoadingOptionData(false);
  }

  useEffect(() => {
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

      // In progressive mode, leave subtype blank until user picks one
      if (progressiveReveal && !current.subtype) {
        if (nextActivity === current.activity) return current;
        return { ...current, activity: nextActivity };
      }

      const allowedSubtypes = (subtypeOptionsByActivitySlug[nextActivity] ?? []).filter(
        (o) => !HIDDEN_SUBTYPES.has(o.slug)
      );
      let nextSubtype = current.subtype;

      if (!nextSubtype || HIDDEN_SUBTYPES.has(nextSubtype) || !allowedSubtypes.some((option) => option.slug === nextSubtype)) {
        nextSubtype = progressiveReveal ? "" : (allowedSubtypes[0]?.slug ?? "");
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
    if (progressiveReveal && !form.subtype) return;

    const allowedSubtypes = (subtypeOptionsByActivitySlug[form.activity] ?? []).filter(
      (o) => !HIDDEN_SUBTYPES.has(o.slug)
    );
    if (allowedSubtypes.length === 0) return;

    if (HIDDEN_SUBTYPES.has(form.subtype) || !allowedSubtypes.some((option) => option.slug === form.subtype)) {
      setForm((current) => ({
        ...current,
        subtype: progressiveReveal ? "" : (allowedSubtypes[0]?.slug ?? ""),
      }));
    }
  }, [form.activity, form.subtype, loadingOptionData, subtypeOptionsByActivitySlug]);

  const subtypeChosen = progressiveReveal ? !!form.subtype : true;

  const fieldVis = useMemo((): FieldVisibility => {
    if (!form.activity || !form.subtype) return FIELD_VISIBILITY_DEFAULTS;
    return (
      fieldConfigMap[`${form.activity}:${form.subtype}`] ??
      fieldConfigMap[`${form.activity}:*`] ??
      fieldConfigMap[`*:*`] ??
      FIELD_VISIBILITY_DEFAULTS
    );
  }, [form.activity, form.subtype, fieldConfigMap]);

  const autoName = useMemo(
    () => buildSessionName(form.activity, form.subtype, form.targetIntensity, form.durationMinutes, form.distanceKm),
    [form.activity, form.subtype, form.targetIntensity, form.durationMinutes, form.distanceKm],
  );

  function updateForm<K extends keyof UnifiedSessionFormData>(
    field: K,
    value: UnifiedSessionFormData[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const handleSave = () => {
    onSave(form);
  };

  return (
    <div className="space-y-4">
      {loadingOptionData ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          Loading options...
        </div>
      ) : null}

      {/* Auto-generated session name preview */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Session name (auto-generated)</p>
        <p className="mt-0.5 text-sm font-semibold text-zinc-900">
          {autoName || <span className="font-normal italic text-zinc-400">Select subtype and intensity below</span>}
        </p>
      </div>

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
            {progressiveReveal && <option value="">— select subtype —</option>}
            {allowedSubtypeOptionsForSelectedActivity.length === 0 ? (
              !progressiveReveal && <option value="">No subtypes available</option>
            ) : (
              allowedSubtypeOptionsForSelectedActivity.map((option) => (
                <option key={option.id} value={option.slug}>
                  {option.label}
                </option>
              ))
            )}
          </select>
        </label>

        {subtypeChosen && fieldVis.show_target_intensity ? (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-zinc-900">Intensity</span>
            <select
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
              value={form.targetIntensity}
              onChange={(e) => updateForm("targetIntensity", e.target.value)}
            >
              <option value="">— select —</option>
              {intensityOptions.map((option) => (
                <option key={option.id} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {subtypeChosen && generatedNamePreview && (
        <div>
          <span className="mb-1 block text-sm font-semibold text-zinc-900">Template name</span>
          <div className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900">
            {loadingGeneratedNumber ? (
              <span className="text-zinc-500">Calculating next number…</span>
            ) : (
              generatedNamePreview
            )}
          </div>
        </div>
      )}

      {subtypeChosen ? (<>
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
            <span className="mb-1 block text-sm font-semibold text-zinc-900">{getRepLabels(form.subtype).sets}</span>
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
              {getRepLabels(form.subtype).setDuration}
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
              {getRepLabels(form.subtype).rest}
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

      </div>

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
        <span className="mb-1 block text-sm font-semibold text-zinc-900">Add Paired Mobility Session (Optional)</span>
        <div className="relative">
          <input
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
            value={mobilitySearchQuery}
            onChange={(e) => setMobilitySearchQuery(e.target.value)}
            placeholder="Search mobility sessions…"
          />
          {mobilitySearchQuery.trim() && allMobilitySessions.length > 0 ? (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-xl border border-zinc-300 bg-white shadow-lg">
              {allMobilitySessions
                .filter((m) => m.name.toLowerCase().includes(mobilitySearchQuery.toLowerCase()))
                .slice(0, 8)
                .map((mobility) => (
                  <button
                    key={mobility.id}
                    type="button"
                    onClick={() => {
                      updateForm("selectedMobilitySessionId", mobility.id);
                      setMobilitySearchQuery("");
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-zinc-100 border-b last:border-b-0"
                  >
                    <div className="font-medium text-zinc-900">{mobility.name}</div>
                    {mobility.duration_minutes && <div className="text-xs text-zinc-500">{mobility.duration_minutes} min</div>}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
        {form.selectedMobilitySessionId && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 p-3 border border-emerald-200">
            <span className="text-sm font-medium text-emerald-900">
              {allMobilitySessions.find((m) => m.id === form.selectedMobilitySessionId)?.name || "Unknown"}
            </span>
            <button
              type="button"
              onClick={() => updateForm("selectedMobilitySessionId", undefined)}
              className="text-emerald-600 hover:text-emerald-700"
              aria-label="Remove mobility session"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div>
        <span className="mb-1 block text-sm font-semibold text-zinc-900">Tags</span>

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
                  className="ml-0.5 leading-none text-zinc-400 hover:text-white"
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

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
                  className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 transition-colors hover:border-zinc-900 hover:bg-zinc-100"
                >
                  + {tag}
                </button>
              ))}
            </div>
          );
        })()}
      </div>
      </>) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || loadingOptionData || loadingGeneratedNumber || (progressiveReveal && !subtypeChosen)}
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 transition disabled:opacity-50 hover:bg-emerald-100"
        >
          {isSaving ? "Saving..." : submitButtonLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

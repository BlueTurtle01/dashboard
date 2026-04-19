"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { UnifiedSessionForm, type UnifiedSessionFormData } from "@/app/coach/components/UnifiedSessionForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ActivityOption = { id: string; slug: string; label: string };
type SubtypeOption = { id: string; slug: string; label: string; sortOrder: number };
type IntensityOption = { id: string; slug: string; label: string };

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

const FIELD_VIS_DEFAULTS: FieldVisibility = {
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

type AdHocForm = {
  activity: string;
  subtype: string;
  description: string;
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
  /** Seconds between individual reps (replaces old free-text intervalDuration) */
  recoveryBetweenRepsSecs: string;
  /** Seconds of rest between sets */
  restBetweenSetsSecs: string;
  /** Distance per set in metres (alternative to set duration) */
  setDistanceMetres: string;
  timeOfDay: string;
  sets: string;
  setDurationSeconds: string;
  restSeconds: string;
  isKeySession: boolean;
};

const terrainOptions = ["road", "trail", "mixed", "sand", "treadmill", "stairs", "indoor", "water", "any"] as const;
const timeOfDayOptions = ["any", "morning", "afternoon", "evening", "night", "race_simulation"] as const;

function formatLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseNullableInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function parseNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldShowTerrain(activity: string) {
  const noTerrain = ["swimming", "swim", "stairs", "stair", "strength", "core"];
  return !noTerrain.some((a) => activity.toLowerCase().includes(a));
}

function createEmptyForm(): AdHocForm {
  return {
    activity: "",
    subtype: "",
    description: "",
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
    recoveryBetweenRepsSecs: "",
    restBetweenSetsSecs: "",
    setDistanceMetres: "",
    timeOfDay: "any",
    sets: "",
    setDurationSeconds: "",
    restSeconds: "",
    isKeySession: false,
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AdHocSessionFormProps {
  /** Called with the new template ID after successful save */
  onCreated: (templateId: string) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdHocSessionForm({ onCreated, onCancel }: AdHocSessionFormProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [form, setForm] = useState<AdHocForm>(createEmptyForm());
  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [subtypeOptionsByActivity, setSubtypeOptionsByActivity] = useState<Record<string, SubtypeOption[]>>({});
  const [fieldConfigMap, setFieldConfigMap] = useState<Record<string, FieldVisibility>>({});
  const [intensityOptions, setIntensityOptions] = useState<IntensityOption[]>([]);
  const [generatedNumber, setGeneratedNumber] = useState<number | null>(null);
  const [loadingNumber, setLoadingNumber] = useState(false);

  // ---------------------------------------------------------------------------
  // Load reference data once on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      const [activitiesRes, subtypesRes, linksRes, fieldConfigRes, intensitiesRes] = await Promise.all([
        supabase.from("session_activities").select("id, slug, label, sort_order, is_active").eq("is_active", true).order("sort_order", { ascending: true }).order("label", { ascending: true }),
        supabase.from("session_subtypes").select("id, slug, label, sort_order, is_active").eq("is_active", true).order("sort_order", { ascending: true }).order("label", { ascending: true }),
        supabase.from("session_activity_subtypes").select("activity_id, subtype_id, sort_order").order("sort_order", { ascending: true }),
        supabase.from("session_template_field_config_resolved").select("target_activity, target_subtype, show_distance, show_duration, show_target_intensity, show_terrain, show_elevation, show_pack_weight, show_sets, show_set_duration, show_rest_seconds"),
        supabase.from("training_intensities").select("id, label, slug").eq("is_active", true).order("sort_order", { ascending: true }),
      ]);

      const activities = (activitiesRes.data ?? []) as Array<{ id: string; slug: string; label: string; sort_order: number | null }>;
      const subtypes = (subtypesRes.data ?? []) as Array<{ id: string; slug: string; label: string; sort_order: number | null }>;
      const links = (linksRes.data ?? []) as Array<{ activity_id: string; subtype_id: string; sort_order: number | null }>;

      const normalizedActivities: ActivityOption[] = activities.map((r) => ({ id: r.id, slug: r.slug, label: r.label }));

      const subtypeById = new Map(subtypes.map((r) => [r.id, { id: r.id, slug: r.slug, label: r.label, sortOrder: r.sort_order ?? 0 }]));
      const activitySlugById = new Map(activities.map((r) => [r.id, r.slug]));
      const subtypeMap: Record<string, SubtypeOption[]> = {};

      for (const link of links) {
        const actSlug = activitySlugById.get(link.activity_id);
        const sub = subtypeById.get(link.subtype_id);
        if (!actSlug || !sub) continue;
        if (!subtypeMap[actSlug]) subtypeMap[actSlug] = [];
        subtypeMap[actSlug].push({ ...sub, sortOrder: link.sort_order ?? sub.sortOrder });
      }

      for (const key of Object.keys(subtypeMap)) {
        subtypeMap[key] = subtypeMap[key]
          .sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.label.localeCompare(b.label))
          .filter((opt, i, arr) => arr.findIndex((c) => c.id === opt.id) === i);
      }

      const configMap: Record<string, FieldVisibility> = {};
      for (const row of (fieldConfigRes.data ?? []) as FieldConfigRow[]) {
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
      setSubtypeOptionsByActivity(subtypeMap);
      setFieldConfigMap(configMap);
      setIntensityOptions((intensitiesRes.data ?? []) as IntensityOption[]);

      // Set defaults
      const firstActivity = normalizedActivities[0]?.slug ?? "";
      const firstSubtype = subtypeMap[firstActivity]?.[0]?.slug ?? "";
      setForm((f) => ({ ...f, activity: firstActivity, subtype: firstSubtype }));

      setLoading(false);
    }

    void load();
  }, []);

  // Reset subtype when activity changes to one where current subtype is invalid
  useEffect(() => {
    if (loading) return;
    const allowed = subtypeOptionsByActivity[form.activity] ?? [];
    if (allowed.length > 0 && !allowed.some((o) => o.slug === form.subtype)) {
      setForm((f) => ({ ...f, subtype: allowed[0].slug }));
    }
  }, [form.activity, loading, subtypeOptionsByActivity]);

  // ---------------------------------------------------------------------------
  // Derived options
  // ---------------------------------------------------------------------------
  const allowedSubtypes = useMemo(
    () => subtypeOptionsByActivity[form.activity] ?? [],
    [form.activity, subtypeOptionsByActivity],
  );

  const selectedActivity = useMemo(
    () => activityOptions.find((o) => o.slug === form.activity) ?? null,
    [activityOptions, form.activity],
  );

  const selectedSubtype = useMemo(
    () => allowedSubtypes.find((o) => o.slug === form.subtype) ?? null,
    [allowedSubtypes, form.subtype],
  );

  const fieldVis = useMemo((): FieldVisibility => {
    if (!form.activity || !form.subtype) return FIELD_VIS_DEFAULTS;
    return (
      fieldConfigMap[`${form.activity}:${form.subtype}`] ??
      fieldConfigMap[`${form.activity}:*`] ??
      fieldConfigMap[`*:*`] ??
      FIELD_VIS_DEFAULTS
    );
  }, [form.activity, form.subtype, fieldConfigMap]);

  // ---------------------------------------------------------------------------
  // Auto-number generation (matches functional template create page logic)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadNumber() {
      if (!form.activity || !form.subtype || !selectedActivity || !selectedSubtype) {
        setGeneratedNumber(null);
        return;
      }
      setLoadingNumber(true);
      const { data } = await supabase
        .from("session_templates")
        .select("id, name")
        .eq("type", "functional")
        .eq("activity", form.activity)
        .eq("subtype", form.subtype);

      if (cancelled) return;

      const rows = (data ?? []) as Array<{ id: string; name: string }>;
      const prefix = `${selectedActivity.label} - ${selectedSubtype.label} - `;
      let highest = 0;
      for (const row of rows) {
        if (!row.name.startsWith(prefix)) continue;
        const n = parseInt(row.name.slice(prefix.length).trim(), 10);
        if (Number.isFinite(n) && n > highest) highest = n;
      }
      setGeneratedNumber(highest + 1);
      setLoadingNumber(false);
    }

    void loadNumber();
    return () => { cancelled = true; };
  }, [form.activity, form.subtype, selectedActivity, selectedSubtype]);

  // ---------------------------------------------------------------------------
  // Name preview (same logic as functional template create page)
  // ---------------------------------------------------------------------------
  const generatedName = useMemo(() => {
    if (!selectedActivity || !selectedSubtype) return "";

    if (form.activity === "run") {
      const parts = [selectedActivity.label, selectedSubtype.label];
      if (form.distanceKm) parts.push(`${form.distanceKm}km`);
      if (form.terrain && form.terrain !== "any") parts.push(formatLabel(form.terrain));
      if (form.packWeightKg) parts.push(`${form.packWeightKg}kg`);
      let name = parts.join(" - ");
      if (form.timeOfDay && form.timeOfDay !== "any") name += ` - ${formatLabel(form.timeOfDay)}`;
      return name;
    }

    if (generatedNumber == null) return "";
    let name = `${selectedActivity.label} - ${selectedSubtype.label} - ${generatedNumber}`;
    if (form.timeOfDay && form.timeOfDay !== "any") name += ` - ${formatLabel(form.timeOfDay)}`;
    return name;
  }, [selectedActivity, selectedSubtype, generatedNumber, form.activity, form.distanceKm, form.terrain, form.packWeightKg, form.timeOfDay]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------
  async function handleSave() {
    if (!form.activity || !form.subtype) {
      setStatusMessage("Activity and subtype are required.");
      return;
    }
    if (!generatedName) {
      setStatusMessage("Could not generate a session name. Fill in activity and subtype.");
      return;
    }

    setSaving(true);
    setStatusMessage("");

    const sessionData = {
      terrain: form.terrain || null,
      elevation: form.elevation.trim() || null,
      pack_weight_kg: parseNullableNumber(form.packWeightKg),
      strides: parseNullableInteger(form.strides),
      warm_up_minutes: parseNullableInteger(form.warmUpMinutes),
      cool_down_minutes: parseNullableInteger(form.coolDownMinutes),
      interval_reps: form.intervalReps.trim() || null,
      recovery_between_reps_secs: parseNullableInteger(form.recoveryBetweenRepsSecs),
      rest_between_sets_secs: parseNullableInteger(form.restBetweenSetsSecs),
      set_distance_metres: parseNullableInteger(form.setDistanceMetres),
      time_of_day: form.timeOfDay || null,
      sets: parseNullableInteger(form.sets),
      set_duration_seconds: parseNullableInteger(form.setDurationSeconds),
      rest_seconds: parseNullableInteger(form.restSeconds),
      tags: [],
    };

    const { data: inserted, error } = await supabase
      .from("session_templates")
      .insert({
        name: generatedName,
        description: form.description.trim() || null,
        type: "functional",
        activity: form.activity,
        subtype: form.subtype,
        duration_minutes: parseNullableInteger(form.durationMinutes),
        distance_km: parseNullableNumber(form.distanceKm),
        target_intensity: form.targetIntensity || null,
        is_key_session: form.isKeySession,
        is_custom: true,
        session_data: sessionData,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error || !inserted?.id) {
      setStatusMessage(`Could not save: ${error?.message ?? "Unknown error"}`);
      return;
    }

    onCreated(inserted.id);
  }

  function update<K extends keyof AdHocForm>(field: K, value: AdHocForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="text-sm text-zinc-500 py-4">Loading session options…</div>
    );
  }

  const isRun = form.activity === "run";
  const isInterval = form.subtype.toLowerCase().includes("interval");

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        This session will be auto-saved as a reusable Session Template.
      </p>

      {statusMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {statusMessage}
        </div>
      ) : null}

      {/* Activity + Subtype */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</label>
          <select
            value={form.activity}
            onChange={(e) => update("activity", e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
          >
            {activityOptions.map((o) => <option key={o.id} value={o.slug}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Subtype</label>
          <select
            value={form.subtype}
            onChange={(e) => update("subtype", e.target.value)}
            disabled={allowedSubtypes.length === 0}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
          >
            {allowedSubtypes.length === 0
              ? <option value="">No subtypes</option>
              : allowedSubtypes.map((o) => <option key={o.id} value={o.slug}>{o.label}</option>)
            }
          </select>
        </div>
      </div>

      {/* Generated name preview */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Session name (auto-generated)</label>
        <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 min-h-[40px]">
          {loadingNumber ? (
            <span className="text-zinc-400">Calculating…</span>
          ) : generatedName ? (
            generatedName
          ) : (
            <span className="text-zinc-400">Select activity and subtype to generate name</span>
          )}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Short description of the session"
          rows={2}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm resize-none"
        />
      </div>

      {/* Core fields */}
      <div className="grid grid-cols-2 gap-3">
        {fieldVis.show_target_intensity && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Intensity</label>
            <select
              value={form.targetIntensity}
              onChange={(e) => update("targetIntensity", e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">Select…</option>
              {intensityOptions.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
            </select>
          </div>
        )}

        {fieldVis.show_duration && !isInterval && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Duration (min)</label>
            <input
              type="number" min="0"
              value={form.durationMinutes}
              onChange={(e) => update("durationMinutes", e.target.value)}
              placeholder="60"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {fieldVis.show_distance && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Distance (km)</label>
            <input
              type="number" min="0" step="0.1"
              value={form.distanceKm}
              onChange={(e) => update("distanceKm", e.target.value)}
              placeholder="10"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {/* For non-interval sessions, show sets/set-duration/rest only if field config enables them */}
        {!isInterval && fieldVis.show_sets && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Sets</label>
            <input
              type="number" min="1"
              value={form.sets}
              onChange={(e) => update("sets", e.target.value)}
              placeholder="6"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {!isInterval && fieldVis.show_set_duration && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Set Duration (sec)</label>
            <input
              type="number" min="1"
              value={form.setDurationSeconds}
              onChange={(e) => update("setDurationSeconds", e.target.value)}
              placeholder="60"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {!isInterval && fieldVis.show_rest_seconds && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Rest Between Sets (sec)</label>
            <input
              type="number" min="0"
              value={form.restSeconds}
              onChange={(e) => update("restSeconds", e.target.value)}
              placeholder="90"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {/* Interval fields — always shown for any interval subtype */}
        {isInterval && (
          <>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Set Count</label>
              <input
                type="number" min="1"
                value={form.sets}
                onChange={(e) => update("sets", e.target.value)}
                placeholder="e.g. 6"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Set Duration (sec)</label>
              <input
                type="number" min="1"
                value={form.setDurationSeconds}
                onChange={(e) => update("setDurationSeconds", e.target.value)}
                placeholder="e.g. 180"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Set Distance (m)</label>
              <input
                type="number" min="1"
                value={form.setDistanceMetres}
                onChange={(e) => update("setDistanceMetres", e.target.value)}
                placeholder="e.g. 400"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Recovery Between Reps (sec)</label>
              <input
                type="number" min="0"
                value={form.recoveryBetweenRepsSecs}
                onChange={(e) => update("recoveryBetweenRepsSecs", e.target.value)}
                placeholder="e.g. 60"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Rest Between Sets (sec)</label>
              <input
                type="number" min="0"
                value={form.restBetweenSetsSecs}
                onChange={(e) => update("restBetweenSetsSecs", e.target.value)}
                placeholder="e.g. 180"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          </>
        )}

        {fieldVis.show_terrain && shouldShowTerrain(form.activity) && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Terrain</label>
            <select
              value={form.terrain}
              onChange={(e) => update("terrain", e.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            >
              {terrainOptions.map((o) => <option key={o} value={o}>{formatLabel(o)}</option>)}
            </select>
          </div>
        )}

        {fieldVis.show_elevation && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Elevation</label>
            <input
              value={form.elevation}
              onChange={(e) => update("elevation", e.target.value)}
              placeholder="e.g. Hilly, rolling"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {fieldVis.show_pack_weight && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Pack Weight (kg)</label>
            <input
              type="number" min="0" step="0.1"
              value={form.packWeightKg}
              onChange={(e) => update("packWeightKg", e.target.value)}
              placeholder="6"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        {/* Run-specific fields */}
        {isRun && (
          <>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Warm Up</label>
              <select
                value={form.warmUpMinutes}
                onChange={(e) => update("warmUpMinutes", e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">— None —</option>
                {["5","10","15","20"].map((v) => <option key={v} value={v}>{v} min</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Cool Down</label>
              <select
                value={form.coolDownMinutes}
                onChange={(e) => update("coolDownMinutes", e.target.value)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">— None —</option>
                {["5","10","15","20"].map((v) => <option key={v} value={v}>{v} min</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Strides</label>
              <input
                type="number" min="0"
                value={form.strides}
                onChange={(e) => update("strides", e.target.value)}
                placeholder="e.g. 6"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          </>
        )}

        {/* Interval reps description — run intervals only */}
        {isRun && isInterval && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Interval Reps (description)</label>
            <input
              type="text"
              value={form.intervalReps}
              onChange={(e) => update("intervalReps", e.target.value)}
              placeholder="e.g. 10x1min or 6x3min"
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Time of Day</label>
          <select
            value={form.timeOfDay}
            onChange={(e) => update("timeOfDay", e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
          >
            {timeOfDayOptions.map((o) => <option key={o} value={o}>{formatLabel(o)}</option>)}
          </select>
        </div>
      </div>

      {/* Key session */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isKeySession}
          onChange={(e) => update("isKeySession", e.target.checked)}
          className="rounded"
        />
        <span className="text-sm text-zinc-700">Key session</span>
      </label>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !generatedName}
          className="rounded-xl border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create & Add to Plan"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

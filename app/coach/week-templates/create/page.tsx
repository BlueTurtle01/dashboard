"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { TRAINING_PURPOSES, TrainingPurpose } from "@/lib/planner/types";

type WeekFocusTypeRow = {
  id: string;
  name: string;
  color: string | null;
};

type SessionTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  subtype: string | null;
  activity: string | null;
  target_intensity: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  is_key_session: boolean;
  is_custom: boolean;
};

const sessionBuckets = ["Gym", "Functional"] as const;
type SessionBucket = (typeof sessionBuckets)[number];
type SlotEntryMode = "template" | "ad_hoc";

type Option = {
  value: string;
  label: string;
};

type IntensityOption = {
  id: string;
  label: string;
  slug: string;
};

const eventTypeOptions = [
  "5km",
  "10km",
  "Half Marathon",
  "Marathon",
  "Trail Marathon",
  "Ultramarathon",
  "50km",
  "100km",
  "50 Mile",
  "100 Mile",
  "24 Hour",
  "Mountain Race",
  "Stage Race",
  "Multi-Day",
  "Other",
] as const;

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

type EditableSlot = {
  localId: string;
  slot_name: string;
  session_template_id: string;
  selected_bucket: SessionBucket | "";
  selected_activity: string;
  selected_subtype: string;
  is_required: boolean;
  sort_order: number;
  notes: string;
  entry_mode: SlotEntryMode;
  ad_hoc_description: string;
  ad_hoc_duration_minutes: string;
  ad_hoc_distance_km: string;
  ad_hoc_target_intensity: string;
  ad_hoc_terrain: string;
  ad_hoc_strides: string;
  ad_hoc_interval_reps: string;
  ad_hoc_interval_duration: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function buildLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normaliseValue(value: string | null | undefined) {
  return safeString(value).trim();
}

function normaliseKey(value: string | null | undefined) {
  return normaliseValue(value).toLowerCase();
}

function formatLabel(value: string | null | undefined) {
  const trimmed = normaliseValue(value);
  if (!trimmed) return "";
  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatSessionOptionLabel(session: SessionTemplateRow): string {
  const parts: string[] = [session.name];

  const meta: string[] = [];
  if (session.type) meta.push(session.type);
  if (session.activity) meta.push(session.activity);
  if (session.subtype) meta.push(session.subtype);
  if (session.duration_minutes) meta.push(`${session.duration_minutes} min`);
  if (session.distance_km) meta.push(`${session.distance_km} km`);
  if (session.target_intensity) meta.push(session.target_intensity);
  if (session.is_key_session) meta.push("Key");

  if (meta.length > 0) {
    parts.push(`(${meta.join(" • ")})`);
  }

  return parts.join(" ");
}

function getSessionBucket(session: SessionTemplateRow): SessionBucket {
  return normaliseKey(session.type) === "gym" ? "Gym" : "Functional";
}

function getGymSubtypeKey(session: SessionTemplateRow) {
  return normaliseKey(session.subtype);
}

function getFunctionalActivityKey(session: SessionTemplateRow) {
  return normaliseKey(session.activity);
}

function getFunctionalSubtypeKey(session: SessionTemplateRow) {
  return normaliseKey(session.subtype);
}

function parseOptionalNumber(value: string | null | undefined): number | null {
  const trimmed = safeString(value).trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildScaffoldSlotName(slot: Partial<EditableSlot>) {
  const bucket = safeString(slot.selected_bucket);
  const activity = formatLabel(slot.selected_activity);
  const subtype = formatLabel(slot.selected_subtype);

  if (bucket === "Gym") {
    return subtype || "Gym Session";
  }

  const base = [activity, subtype].filter(Boolean).join(" - ");
  return base || "Functional Session";
}

function buildAdHocSlotName(slot: Partial<EditableSlot>) {
  const base = buildScaffoldSlotName(slot);
  const distance = safeString(slot.ad_hoc_distance_km).trim();
  const duration = safeString(slot.ad_hoc_duration_minutes).trim();

  if (distance) return `${base} - ${distance} km`;
  if (duration) return `${base} - ${duration} min`;

  return base;
}

function buildResolvedSlotName(slot: Partial<EditableSlot>, templateName?: string | null) {
  if (slot.entry_mode === "ad_hoc") {
    return buildAdHocSlotName(slot);
  }

  const explicit = safeString(slot.slot_name).trim();
  if (explicit) return explicit;

  if (templateName && templateName.trim()) return templateName.trim();

  return buildScaffoldSlotName(slot);
}

function shouldShowTerrainForActivity(activity: string): boolean {
  const activityLower = (activity || "").toLowerCase();
  // Activities that don't need terrain
  const noTerrainActivities = ["swimming", "swim", "stairs", "stair", "strength", "core"];
  return !noTerrainActivities.some((a) => activityLower.includes(a));
}

function buildCombinedNotes(slot: Partial<EditableSlot>) {
  const noteParts: string[] = [];

  if (slot.entry_mode === "ad_hoc") {
    const adHocLines: string[] = ["Ad hoc functional session details:"];
    adHocLines.push(`Activity: ${formatLabel(slot.selected_activity) || "Not specified"}`);
    adHocLines.push(`Subtype: ${formatLabel(slot.selected_subtype) || "Not specified"}`);

    const duration = safeString(slot.ad_hoc_duration_minutes).trim();
    const distance = safeString(slot.ad_hoc_distance_km).trim();
    const intensity = safeString(slot.ad_hoc_target_intensity).trim();
    const terrain = safeString(slot.ad_hoc_terrain).trim();
    const strides = safeString(slot.ad_hoc_strides).trim();
    const description = safeString(slot.ad_hoc_description).trim();

    if (duration) adHocLines.push(`Duration: ${duration} min`);
    if (distance) adHocLines.push(`Distance: ${distance} km`);
    if (intensity) adHocLines.push(`Intensity: ${intensity}`);
    if (terrain && terrain !== "any") adHocLines.push(`Terrain: ${formatLabel(terrain)}`);
    if (strides) adHocLines.push(`Strides: ${strides}`);
    if (description) adHocLines.push(`Description: ${description}`);

    const intervalReps = safeString(slot.ad_hoc_interval_reps).trim();
    const intervalDuration = safeString(slot.ad_hoc_interval_duration).trim();
    if (intervalReps) adHocLines.push(`Sets: ${intervalReps}`);
    if (intervalDuration) adHocLines.push(`Set Duration: ${intervalDuration}`);

    noteParts.push(adHocLines.join("\n"));
  }

  const notes = safeString(slot.notes).trim();
  if (notes) {
    noteParts.push(notes);
  }

  const combined = noteParts.join("\n\n").trim();
  return combined || null;
}

function buildWeekName(
  focusName: string,
  eventType: string,
  slots: EditableSlot[],
): string {
  const functionalCounts = new Map<string, { label: string; count: number }>();
  const runsByTerrain = new Map<string, { label: string; count: number }>();
  let gymCount = 0;

  for (const slot of slots) {
    if (slot.selected_bucket === "Gym") {
      gymCount += 1;
      continue;
    }

    if (slot.selected_bucket === "Functional") {
      // Special handling for runs: separate by terrain
      if (slot.selected_activity.toLowerCase() === "run") {
        const terrain = slot.ad_hoc_terrain || "any";
        const terrainKey = normaliseKey(terrain);
        const terrainLabel = terrain !== "any" ? formatLabel(terrain) : "Run";
        const label = terrain !== "any" ? `${terrainLabel} Run` : "Run";
        const existing = runsByTerrain.get(terrainKey);

        if (existing) {
          existing.count += 1;
        } else {
          runsByTerrain.set(terrainKey, { label, count: 1 });
        }
      } else {
        // Non-run functional activities
        const key = normaliseKey(slot.selected_subtype) || "functional";
        const label = formatLabel(slot.selected_subtype) || "Functional";
        const existing = functionalCounts.get(key);

        if (existing) {
          existing.count += 1;
        } else {
          functionalCounts.set(key, { label, count: 1 });
        }
      }
    }
  }

  const slotParts: string[] = [
    ...Array.from(runsByTerrain.values()).map((item) => `${item.count} ${item.label}`),
    ...Array.from(functionalCounts.values()).map((item) => `${item.count} ${item.label}`),
  ];

  if (gymCount > 0) {
    slotParts.push(`${gymCount} Gym`);
  }

  const parts = [focusName, eventType];
  if (slotParts.length > 0) {
    parts.push(slotParts.join(" / "));
  }

  return parts.filter(Boolean).join(" - ");
}

export default function CreateWeekTemplatePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focusTypes, setFocusTypes] = useState<WeekFocusTypeRow[]>([]);
  const [sessionTemplates, setSessionTemplates] = useState<SessionTemplateRow[]>([]);
  const [intensityOptions, setIntensityOptions] = useState<IntensityOption[]>([]);

  const [description, setDescription] = useState("");
  const [focusTypeId, setFocusTypeId] = useState("");
  const [eventType, setEventType] = useState("");
  const [conditionTags, setConditionTags] = useState<string[]>([]);
  const [trainingPurpose, setTrainingPurpose] = useState<TrainingPurpose | "">("");
  const [isActive, setIsActive] = useState(true);

  const [slots, setSlots] = useState<EditableSlot[]>([]);

  const selectedFocusTypeName = useMemo(() => {
    return focusTypes.find((focus) => focus.id === focusTypeId)?.name ?? "";
  }, [focusTypes, focusTypeId]);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.sort_order - b.sort_order),
    [slots],
  );

  const generatedName = useMemo(() => {
    return buildWeekName(selectedFocusTypeName, eventType, sortedSlots);
  }, [selectedFocusTypeName, eventType, sortedSlots]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [focusRes, sessionRes, intensityRes] = await Promise.all([
          supabase
            .from("week_focus_types")
            .select("id, name, color")
            .order("display_order", { ascending: true, nullsFirst: false })
            .order("name", { ascending: true }),
          supabase
            .from("session_templates")
            .select(
              `
                id,
                name,
                description,
                type,
                subtype,
                activity,
                target_intensity,
                duration_minutes,
                distance_km,
                is_key_session,
                is_custom
              `,
            )
            .order("type", { ascending: true })
            .order("activity", { ascending: true })
            .order("subtype", { ascending: true })
            .order("name", { ascending: true }),
          supabase
            .from("training_intensities")
            .select("id, label, slug")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
        ]);

        if (focusRes.error) throw focusRes.error;
        if (sessionRes.error) throw sessionRes.error;
        if (intensityRes.error) throw intensityRes.error;

        setFocusTypes((focusRes.data ?? []) as WeekFocusTypeRow[]);
        setSessionTemplates((sessionRes.data ?? []) as SessionTemplateRow[]);
        setIntensityOptions((intensityRes.data ?? []) as IntensityOption[]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error loading create page.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const availableBuckets = sessionBuckets.filter((bucket) =>
    sessionTemplates.some((session) => getSessionBucket(session) === bucket),
  );

  function getGymSubtypeOptions(): Option[] {
    const optionMap = new Map<string, string>();

    sessionTemplates
      .filter((session) => getSessionBucket(session) === "Gym")
      .forEach((session) => {
        const key = getGymSubtypeKey(session);
        if (!key) return;
        if (!optionMap.has(key)) {
          optionMap.set(key, formatLabel(session.subtype));
        }
      });

    return Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function getFunctionalActivityOptions(): Option[] {
    const optionMap = new Map<string, string>();

    sessionTemplates
      .filter((session) => getSessionBucket(session) === "Functional")
      .forEach((session) => {
        const key = getFunctionalActivityKey(session);
        if (!key) return;
        if (!optionMap.has(key)) {
          optionMap.set(key, formatLabel(session.activity));
        }
      });

    return Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function getFunctionalSubtypeOptions(selectedActivity: string): Option[] {
    if (!selectedActivity) return [];

    const optionMap = new Map<string, string>();

    sessionTemplates
      .filter(
        (session) =>
          getSessionBucket(session) === "Functional" &&
          getFunctionalActivityKey(session) === selectedActivity,
      )
      .forEach((session) => {
        const key = getFunctionalSubtypeKey(session);
        if (!key) return;
        if (!optionMap.has(key)) {
          optionMap.set(key, formatLabel(session.subtype));
        }
      });

    return Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function getFilteredSessions(
    selectedBucket: SessionBucket | "",
    selectedActivity: string,
    selectedSubtype: string,
  ) {
    return sessionTemplates.filter((session) => {
      if (selectedBucket && getSessionBucket(session) !== selectedBucket) return false;

      if (selectedBucket === "Gym") {
        if (selectedSubtype && getGymSubtypeKey(session) !== selectedSubtype) return false;
        return true;
      }

      if (selectedBucket === "Functional") {
        if (selectedActivity && getFunctionalActivityKey(session) !== selectedActivity) {
          return false;
        }
        if (selectedSubtype && getFunctionalSubtypeKey(session) !== selectedSubtype) {
          return false;
        }
        return true;
      }

      return true;
    });
  }

  function updateSlot(localId: string, updates: Partial<EditableSlot>) {
    setSlots((current) =>
      current.map((slot) => {
        if (slot.localId !== localId) return slot;

        const next: EditableSlot = {
          ...slot,
          ad_hoc_description: safeString(slot.ad_hoc_description),
          ad_hoc_duration_minutes: safeString(slot.ad_hoc_duration_minutes),
          ad_hoc_distance_km: safeString(slot.ad_hoc_distance_km),
          ad_hoc_target_intensity: safeString(slot.ad_hoc_target_intensity),
          ...updates,
        };

        if (next.entry_mode === "ad_hoc") {
          next.slot_name = buildAdHocSlotName(next);
        } else if (!next.session_template_id) {
          next.slot_name = buildScaffoldSlotName(next);
        }

        return next;
      }),
    );
  }

  function addSlot() {
    const nextSortOrder =
      slots.length > 0 ? Math.max(...slots.map((slot) => slot.sort_order)) + 1 : 1;

    const defaultBucket = availableBuckets[0] ?? "";

    let selectedActivity = "";
    let selectedSubtype = "";

    if (defaultBucket === "Gym") {
      selectedSubtype = getGymSubtypeOptions()[0]?.value ?? "";
    }

    if (defaultBucket === "Functional") {
      selectedActivity = getFunctionalActivityOptions()[0]?.value ?? "";
      selectedSubtype = getFunctionalSubtypeOptions(selectedActivity)[0]?.value ?? "";
    }

    const filteredSessions = getFilteredSessions(defaultBucket, selectedActivity, selectedSubtype);
    const defaultSession = filteredSessions[0] ?? null;

    const newSlot: EditableSlot = {
      localId: buildLocalId(),
      slot_name:
        defaultSession?.name ??
        buildScaffoldSlotName({
          selected_bucket: defaultBucket,
          selected_activity: selectedActivity,
          selected_subtype: selectedSubtype,
        }),
      session_template_id: defaultSession?.id ?? "",
      selected_bucket: defaultBucket,
      selected_activity: selectedActivity,
      selected_subtype: selectedSubtype,
      is_required: true,
      sort_order: nextSortOrder,
      notes: "",
      entry_mode: "template",
      ad_hoc_description: "",
      ad_hoc_duration_minutes: "",
      ad_hoc_distance_km: "",
      ad_hoc_target_intensity: "",
      ad_hoc_terrain: "any",
      ad_hoc_strides: "",
      ad_hoc_interval_reps: "",
      ad_hoc_interval_duration: "",
    };

    setSlots((current) => [...current, newSlot]);
  }

  function removeSlot(localId: string) {
    setSlots((current) => {
      const filtered = current.filter((slot) => slot.localId !== localId);
      return filtered
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((slot, index) => ({ ...slot, sort_order: index + 1 }));
    });
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);

    if (!focusTypeId) {
      setError("Focus type is required.");
      return;
    }

    if (!eventType) {
      setError("Event type is required.");
      return;
    }

    if (!generatedName.trim()) {
      setError("Week template name is required.");
      return;
    }

    if (sortedSlots.length === 0) {
      setError("Add at least one slot before saving.");
      return;
    }

    for (const slot of sortedSlots) {
      if (!slot.selected_bucket) {
        setError("Every slot must have a category.");
        return;
      }

      if (slot.selected_bucket === "Gym") {
        if (!safeString(slot.selected_subtype).trim()) {
          setError("Every gym slot must have a subtype.");
          return;
        }
      }

      if (slot.selected_bucket === "Functional") {
        if (!safeString(slot.selected_activity).trim()) {
          setError("Every functional slot must have an activity.");
          return;
        }

        if (!safeString(slot.selected_subtype).trim()) {
          setError("Every functional slot must have a subtype.");
          return;
        }
      }

      if (slot.entry_mode === "ad_hoc") {
        if (slot.selected_bucket !== "Functional") {
          setError("Ad hoc entry is only available for functional slots.");
          return;
        }

        if (
          safeString(slot.ad_hoc_duration_minutes).trim() &&
          parseOptionalNumber(slot.ad_hoc_duration_minutes) === null
        ) {
          setError("Ad hoc duration must be a valid number.");
          return;
        }

        if (
          safeString(slot.ad_hoc_distance_km).trim() &&
          parseOptionalNumber(slot.ad_hoc_distance_km) === null
        ) {
          setError("Ad hoc distance must be a valid number.");
          return;
        }
      }
    }

    setSaving(true);

    try {
      const { data: templateInsert, error: templateError } = await supabase
        .from("week_templates")
        .insert({
          name: generatedName.trim(),
          description: description.trim() || null,
          focus_type_id: focusTypeId || null,
          condition_tags: conditionTags,
          training_purpose: trainingPurpose || null,
          is_active: isActive,
          is_custom: true,
        })
        .select("id")
        .single();

      if (templateError) throw templateError;
      if (!templateInsert?.id) {
        throw new Error("Week template was created but no id was returned.");
      }

      const slotPayload = sortedSlots.map((slot, index) => {
        const templateSession = sessionTemplates.find(
          (session) => session.id === slot.session_template_id,
        );

        return {
          week_template_id: templateInsert.id,
          slot_name: buildResolvedSlotName(slot, templateSession?.name),
          session_template_id: slot.session_template_id || null,
          category: slot.selected_bucket || null,
          activity: slot.selected_bucket === "Functional" ? slot.selected_activity || null : null,
          subtype: slot.selected_subtype || null,
          is_required: slot.is_required,
          sort_order: index + 1,
          notes: buildCombinedNotes(slot),
          terrain: slot.entry_mode === "ad_hoc" ? (slot.ad_hoc_terrain || "any") : null,
        };
      });

      const { error: slotError } = await supabase
        .from("week_template_slots")
        .insert(slotPayload);

      if (slotError) throw slotError;

      router.push(`/coach/week-templates/${templateInsert.id}/view`);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error creating week template.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-6xl p-6">
          <p className="text-sm text-zinc-600">Loading create page...</p>
        </div>
      </div>
    );
  }

  const gymSubtypeOptions = getGymSubtypeOptions();
  const functionalActivityOptions = getFunctionalActivityOptions();

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-sm text-zinc-500">
              <Link href="/coach" className="hover:underline">
                Coach
              </Link>
              <span className="mx-2">/</span>
              <Link href="/coach/week-templates" className="hover:underline">
                Week Template Library
              </Link>
              <span className="mx-2">/</span>
              <span>Create</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-black">
              Create week template
            </h1>
          </div>

          <Link
            href="/coach/week-templates"
            className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back
          </Link>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-black">Week template details</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Focus type
                </label>
                <select
                  value={focusTypeId}
                  onChange={(e) => setFocusTypeId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                >
                  <option value="">Select focus type</option>
                  {focusTypes.map((focus) => (
                    <option key={focus.id} value={focus.id}>
                      {focus.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Event type
                </label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                >
                  <option value="">Select event type</option>
                  {eventTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Generated name
                </label>
                <input
                  type="text"
                  value={generatedName}
                  readOnly
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-sm text-zinc-700 outline-none"
                  placeholder="Generated automatically from focus, event type, and slot mix"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                  placeholder="Optional notes about when to use this week template"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-zinc-700">
                  Race condition tags
                </label>
                <p className="mb-3 text-xs text-zinc-500">
                  Tag this week with the race conditions it is designed for. Used by the plan assembly algorithm to select the right weeks for an athlete's race.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { value: "heat", label: "Heat acclimation" },
                      { value: "cold", label: "Cold weather" },
                      { value: "altitude", label: "Altitude" },
                      { value: "load_carriage", label: "Load carriage" },
                      { value: "no_gym", label: "No gym required" },
                      { value: "night_running", label: "Night running" },
                      { value: "sand", label: "Sand terrain" },
                      { value: "technical_terrain", label: "Technical terrain" },
                      { value: "multi_day", label: "Multi-day / stage race" },
                    ] as const
                  ).map(({ value, label }) => (
                    <label
                      key={value}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        checked={conditionTags.includes(value)}
                        onChange={(e) =>
                          setConditionTags((prev) =>
                            e.target.checked
                              ? [...prev, value]
                              : prev.filter((t) => t !== value),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Training purpose
                </label>
                <select
                  value={trainingPurpose}
                  onChange={(e) => setTrainingPurpose(e.target.value as TrainingPurpose | "")}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                >
                  <option value="">None / General</option>
                  {TRAINING_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  When coaches assign a training purpose to a week, templates tagged with that purpose appear first.
                </p>
              </div>

              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-black">Week slots</h2>
            </div>

            {sortedSlots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600">
                No slots yet. Add a slot to start building this week template.
              </div>
            ) : (
              <div className="space-y-4">
                {sortedSlots.map((slot, index) => {
                  const functionalSubtypeOptions = getFunctionalSubtypeOptions(
                    slot.selected_activity,
                  );
                  const filteredSessions = getFilteredSessions(
                    slot.selected_bucket,
                    slot.selected_activity,
                    slot.selected_subtype,
                  );

                  const isFunctional = slot.selected_bucket === "Functional";
                  const allowAdHoc = isFunctional;

                  return (
                    <div
                      key={slot.localId}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-zinc-900">
                          Slot {index + 1}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => removeSlot(slot.localId)}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-700">
                            Category
                          </label>
                          <select
                            value={slot.selected_bucket}
                            onChange={(e) => {
                              const nextBucket = e.target.value as SessionBucket | "";

                              let nextActivity = "";
                              let nextSubtype = "";

                              if (nextBucket === "Gym") {
                                nextSubtype = gymSubtypeOptions[0]?.value ?? "";
                              }

                              if (nextBucket === "Functional") {
                                nextActivity = functionalActivityOptions[0]?.value ?? "";
                                nextSubtype =
                                  getFunctionalSubtypeOptions(nextActivity)[0]?.value ?? "";
                              }

                              const nextSessions = getFilteredSessions(
                                nextBucket,
                                nextActivity,
                                nextSubtype,
                              );
                              const nextSession = nextSessions[0] ?? null;
                              const nextIsFunctional = nextBucket === "Functional";

                              updateSlot(slot.localId, {
                                selected_bucket: nextBucket,
                                selected_activity: nextActivity,
                                selected_subtype: nextSubtype,
                                session_template_id: nextSession?.id ?? "",
                                slot_name:
                                  nextSession?.name ??
                                  buildScaffoldSlotName({
                                    selected_bucket: nextBucket,
                                    selected_activity: nextActivity,
                                    selected_subtype: nextSubtype,
                                  }),
                                entry_mode: nextIsFunctional ? slot.entry_mode : "template",
                              });
                            }}
                            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                          >
                            <option value="">Select category</option>
                            {availableBuckets.map((bucket) => (
                              <option key={bucket} value={bucket}>
                                {bucket}
                              </option>
                            ))}
                          </select>
                        </div>

                        {slot.selected_bucket === "Gym" ? (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-zinc-700">
                              Subtype
                            </label>
                            <select
                              value={slot.selected_subtype}
                              onChange={(e) => {
                                const nextSubtype = e.target.value;
                                const nextSessions = getFilteredSessions(
                                  slot.selected_bucket,
                                  "",
                                  nextSubtype,
                                );
                                const nextSession = nextSessions[0] ?? null;

                                updateSlot(slot.localId, {
                                  selected_subtype: nextSubtype,
                                  session_template_id:
                                    slot.entry_mode === "template" ? nextSession?.id ?? "" : "",
                                  slot_name:
                                    slot.entry_mode === "template"
                                      ? nextSession?.name ??
                                        buildScaffoldSlotName({
                                          ...slot,
                                          selected_subtype: nextSubtype,
                                        })
                                      : slot.slot_name,
                                });
                              }}
                              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                              disabled={!slot.selected_bucket}
                            >
                              <option value="">Select subtype</option>
                              {gymSubtypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {slot.selected_bucket === "Functional" ? (
                          <>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-700">
                                Activity
                              </label>
                              <select
                                value={slot.selected_activity}
                                onChange={(e) => {
                                  const nextActivity = e.target.value;
                                  const nextSubtype =
                                    getFunctionalSubtypeOptions(nextActivity)[0]?.value ?? "";
                                  const nextSessions = getFilteredSessions(
                                    slot.selected_bucket,
                                    nextActivity,
                                    nextSubtype,
                                  );
                                  const nextSession = nextSessions[0] ?? null;

                                  updateSlot(slot.localId, {
                                    selected_activity: nextActivity,
                                    selected_subtype: nextSubtype,
                                    session_template_id:
                                      slot.entry_mode === "template" ? nextSession?.id ?? "" : "",
                                    slot_name:
                                      slot.entry_mode === "template"
                                        ? nextSession?.name ??
                                          buildScaffoldSlotName({
                                            ...slot,
                                            selected_activity: nextActivity,
                                            selected_subtype: nextSubtype,
                                          })
                                        : buildAdHocSlotName({
                                            ...slot,
                                            selected_activity: nextActivity,
                                            selected_subtype: nextSubtype,
                                          }),
                                  });
                                }}
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                disabled={!slot.selected_bucket}
                              >
                                <option value="">Select activity</option>
                                {functionalActivityOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-700">
                                Subtype
                              </label>
                              <select
                                value={slot.selected_subtype}
                                onChange={(e) => {
                                  const nextSubtype = e.target.value;
                                  const nextSessions = getFilteredSessions(
                                    slot.selected_bucket,
                                    slot.selected_activity,
                                    nextSubtype,
                                  );
                                  const nextSession = nextSessions[0] ?? null;

                                  updateSlot(slot.localId, {
                                    selected_subtype: nextSubtype,
                                    session_template_id:
                                      slot.entry_mode === "template" ? nextSession?.id ?? "" : "",
                                    slot_name:
                                      slot.entry_mode === "template"
                                        ? nextSession?.name ??
                                          buildScaffoldSlotName({
                                            ...slot,
                                            selected_subtype: nextSubtype,
                                          })
                                        : buildAdHocSlotName({
                                            ...slot,
                                            selected_subtype: nextSubtype,
                                          }),
                                  });
                                }}
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                disabled={!slot.selected_activity}
                              >
                                <option value="">Select subtype</option>
                                {functionalSubtypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        ) : null}

                        {allowAdHoc ? (
                          <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-zinc-700">
                              How do you want to add this functional session?
                            </label>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  updateSlot(slot.localId, {
                                    entry_mode: "template",
                                  });
                                }}
                                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                                  slot.entry_mode === "template"
                                    ? "bg-zinc-900 text-white"
                                    : "border border-zinc-300 bg-white text-zinc-700"
                                }`}
                              >
                                Use existing template
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  updateSlot(slot.localId, {
                                    entry_mode: "ad_hoc",
                                    session_template_id: "",
                                    slot_name: buildAdHocSlotName({
                                      ...slot,
                                      entry_mode: "ad_hoc",
                                    }),
                                  })
                                }
                                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                                  slot.entry_mode === "ad_hoc"
                                    ? "bg-zinc-900 text-white"
                                    : "border border-zinc-300 bg-white text-zinc-700"
                                }`}
                              >
                                Enter ad hoc details
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {slot.entry_mode === "template" ? (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-zinc-700">
                              Session template
                            </label>
                            <select
                              value={slot.session_template_id}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const selectedSession = sessionTemplates.find(
                                  (session) => session.id === selectedId,
                                );

                                updateSlot(slot.localId, {
                                  session_template_id: selectedId,
                                  slot_name:
                                    selectedSession?.name ??
                                    buildScaffoldSlotName(slot),
                                });
                              }}
                              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                              disabled={!slot.selected_bucket}
                            >
                              <option value="">No fixed session template</option>
                              {filteredSessions.map((session) => (
                                <option key={session.id} value={session.id}>
                                  {formatSessionOptionLabel(session)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-700">
                                Auto-generated slot name
                              </label>
                              <input
                                type="text"
                                value={buildAdHocSlotName(slot)}
                                readOnly
                                className="w-full rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm text-zinc-700 outline-none"
                              />
                            </div>

                            {!slot.selected_subtype.toLowerCase().includes("interval") ? (
                              <div>
                                <label className="mb-1 block text-sm font-medium text-zinc-700">
                                  Duration (minutes)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={slot.ad_hoc_duration_minutes ?? ""}
                                  onChange={(e) =>
                                    updateSlot(slot.localId, {
                                      ad_hoc_duration_minutes: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                  placeholder="e.g. 60"
                                />
                              </div>
                            ) : null}

                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-700">
                                Distance (km)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={slot.ad_hoc_distance_km ?? ""}
                                onChange={(e) =>
                                  updateSlot(slot.localId, {
                                    ad_hoc_distance_km: e.target.value,
                                  })
                                }
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                placeholder="e.g. 12"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-700">
                                Target intensity
                              </label>
                              <select
                                value={slot.ad_hoc_target_intensity ?? ""}
                                onChange={(e) =>
                                  updateSlot(slot.localId, {
                                    ad_hoc_target_intensity: e.target.value,
                                  })
                                }
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                              >
                                <option value="">Select an intensity...</option>
                                {intensityOptions.map((option) => (
                                  <option key={option.id} value={option.label}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {shouldShowTerrainForActivity(slot.selected_activity) ? (
                              <div>
                                <label className="mb-1 block text-sm font-medium text-zinc-700">
                                  Terrain
                                </label>
                                <select
                                  value={slot.ad_hoc_terrain ?? "any"}
                                  onChange={(e) =>
                                    updateSlot(slot.localId, {
                                      ad_hoc_terrain: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                >
                                  {terrainOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {formatLabel(option)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}

                            {slot.selected_activity.toLowerCase() === "run" &&
                            !slot.selected_subtype.toLowerCase().includes("interval") ? (
                              <div>
                                <label className="mb-1 block text-sm font-medium text-zinc-700">
                                  Strides
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={slot.ad_hoc_strides ?? ""}
                                  onChange={(e) =>
                                    updateSlot(slot.localId, {
                                      ad_hoc_strides: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                  placeholder="20"
                                />
                                <p className="mt-1 text-xs text-zinc-500">
                                  Optional: Number of strides at the end of the run
                                </p>
                              </div>
                            ) : null}

                            {slot.selected_subtype.toLowerCase().includes("interval") ? (
                              <>
                                <div>
                                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                                    Sets
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={slot.ad_hoc_interval_reps ?? ""}
                                    onChange={(e) =>
                                      updateSlot(slot.localId, {
                                        ad_hoc_interval_reps: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                    placeholder="e.g. 10"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                                    Set Duration (minutes)
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={slot.ad_hoc_interval_duration ?? ""}
                                    onChange={(e) =>
                                      updateSlot(slot.localId, {
                                        ad_hoc_interval_duration: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                    placeholder="e.g. 1"
                                  />
                                </div>
                              </>
                            ) : null}

                            <div className="md:col-span-2">
                              <label className="mb-1 block text-sm font-medium text-zinc-700">
                                Ad hoc session description
                              </label>
                              <textarea
                                value={slot.ad_hoc_description ?? ""}
                                onChange={(e) =>
                                  updateSlot(slot.localId, {
                                    ad_hoc_description: e.target.value,
                                  })
                                }
                                rows={3}
                                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                                placeholder="e.g. Easy steady run on flat terrain. Keep effort conversational."
                              />
                            </div>
                          </>
                        )}

                        <div className="flex items-end">
                          <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-700">
                            <input
                              type="checkbox"
                              checked={slot.is_required}
                              onChange={(e) =>
                                updateSlot(slot.localId, { is_required: e.target.checked })
                              }
                            />
                            Required slot
                          </label>
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-zinc-700">
                            Notes
                          </label>
                          <textarea
                            value={slot.notes}
                            onChange={(e) =>
                              updateSlot(slot.localId, { notes: e.target.value })
                            }
                            rows={2}
                            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                            placeholder="Optional notes for this slot"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex justify-start">
              <button
                type="button"
                onClick={addSlot}
                className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Add slot
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create week template"}
            </button>

            <Link
              href="/coach/week-templates"
              className="inline-flex rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { TRAINING_PURPOSES, TrainingPurpose } from "@/lib/planner/types";

type WeekTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  focus_type_id: string | null;
  tags?: string[] | null;
  condition_tags?: string[] | null;
  training_purpose?: string | null;
  is_active: boolean;
  is_custom: boolean;
  coach_user_id: string | null;
  created_at: string;
  updated_at: string;
};

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

type WeekTemplateSlotRow = {
  id: string;
  week_template_id: string;
  slot_name: string;
  session_template_id: string;
  category: string | null;
  activity: string | null;
  subtype: string | null;
  is_required: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const sessionBuckets = ["Gym", "Functional"] as const;
type SessionBucket = (typeof sessionBuckets)[number];

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

type EditableSlot = {
  localId: string;
  existingId: string | null;
  slot_name: string;
  session_template_id: string;
  selected_bucket: SessionBucket | "";
  selected_activity: string;
  selected_subtype: string;
  is_required: boolean;
  sort_order: number;
  notes: string;
};

type Option = {
  value: string;
  label: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

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

function buildLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normaliseValue(value: string | null | undefined) {
  return (value ?? "").trim();
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

function parseTags(tagsText: string): string[] {
  return [
    ...new Set(
      tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function buildWeekName(
  focusName: string,
  eventType: string,
  slots: EditableSlot[],
): string {
  const functionalCounts = new Map<string, { label: string; count: number }>();
  let gymCount = 0;

  for (const slot of slots) {
    if (slot.selected_bucket === "Gym") {
      gymCount += 1;
      continue;
    }

    if (slot.selected_bucket === "Functional") {
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

  const slotParts: string[] = [
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

export default function WeekTemplateEditPage() {
  const params = useParams<{ templateId: string }>();
  const templateId = params?.templateId;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [focusTypes, setFocusTypes] = useState<WeekFocusTypeRow[]>([]);
  const [sessionTemplates, setSessionTemplates] = useState<SessionTemplateRow[]>([]);

  const [description, setDescription] = useState("");
  const [focusTypeId, setFocusTypeId] = useState("");
  const [eventType, setEventType] = useState("");
  const [tagsInput, setTagsInput] = useState("");
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

  const parsedTags = useMemo(() => parseTags(tagsInput), [tagsInput]);

  useEffect(() => {
    async function loadPage() {
      if (!templateId) {
        setError("No week template id provided.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setSaveMessage(null);

      try {
        const [templateRes, focusRes, sessionRes, slotRes] = await Promise.all([
          supabase.from("week_templates").select("*").eq("id", templateId).single(),
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
            .from("week_template_slots")
            .select("id, week_template_id, slot_name, session_template_id, category, activity, subtype, is_required, sort_order, notes, created_at, updated_at")
            .eq("week_template_id", templateId)
            .order("sort_order", { ascending: true }),
        ]);

        if (templateRes.error) throw templateRes.error;
        if (focusRes.error) throw focusRes.error;
        if (sessionRes.error) throw sessionRes.error;
        if (slotRes.error) throw slotRes.error;

        const template = templateRes.data as WeekTemplateRow;
        const allSessionTemplates = (sessionRes.data ?? []) as SessionTemplateRow[];
        const focusTypeRows = (focusRes.data ?? []) as WeekFocusTypeRow[];

        setDescription(template.description ?? "");
        setFocusTypeId(template.focus_type_id ?? "");
        setTagsInput((template.tags ?? []).join(", "));
        setConditionTags(template.condition_tags ?? []);
        setTrainingPurpose((template.training_purpose ?? "") as TrainingPurpose | "");
        setIsActive(template.is_active);

        const focusName =
          focusTypeRows.find((focus) => focus.id === template.focus_type_id)?.name ?? "";
        const existingName = template.name ?? "";

        let inferredEventType = "";

        if (focusName && existingName.startsWith(`${focusName} - `)) {
          const remainder = existingName.slice(`${focusName} - `.length).trim();
          const matchedEventType = eventTypeOptions.find(
            (option) => remainder === option || remainder.startsWith(`${option} - `),
          );

          if (matchedEventType) {
            inferredEventType = matchedEventType;
          }
        }

        setEventType(inferredEventType);

        setFocusTypes(focusTypeRows);
        setSessionTemplates(allSessionTemplates);

        const mappedSlots: EditableSlot[] = ((slotRes.data ?? []) as WeekTemplateSlotRow[]).map(
          (slot) => {
            const matchedSession = allSessionTemplates.find(
              (session) => session.id === slot.session_template_id,
            );

            // Use category/activity/subtype from slot if available (ad hoc), otherwise from session
            const bucket = (slot.category as SessionBucket | "") || (matchedSession ? getSessionBucket(matchedSession) : "");
            const selectedActivity =
              slot.activity ||
              (bucket === "Functional" && matchedSession
                ? getFunctionalActivityKey(matchedSession)
                : "");
            const selectedSubtype =
              slot.subtype ||
              (matchedSession
                ? bucket === "Gym"
                  ? getGymSubtypeKey(matchedSession)
                  : getFunctionalSubtypeKey(matchedSession)
                : "");

            return {
              localId: buildLocalId(),
              existingId: slot.id,
              slot_name: slot.slot_name ?? "",
              session_template_id: slot.session_template_id ?? "",
              selected_bucket: bucket,
              selected_activity: selectedActivity,
              selected_subtype: selectedSubtype,
              is_required: slot.is_required ?? true,
              sort_order: slot.sort_order ?? 1,
              notes: slot.notes ?? "",
            };
          },
        );

        setSlots(mappedSlots);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error loading week template.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadPage();
  }, [templateId]);

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
      current.map((slot) => (slot.localId === localId ? { ...slot, ...updates } : slot)),
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

    setSlots((current) => [
      ...current,
      {
        localId: buildLocalId(),
        existingId: null,
        slot_name: defaultSession?.name ?? "",
        session_template_id: defaultSession?.id ?? "",
        selected_bucket: defaultBucket,
        selected_activity: selectedActivity,
        selected_subtype: selectedSubtype,
        is_required: true,
        sort_order: nextSortOrder,
        notes: "",
      },
    ]);
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

    if (!templateId) {
      setError("No week template id provided.");
      return;
    }

    setError(null);
    setSaveMessage(null);

    if (!focusTypeId) {
      setError("Focus type is required.");
      return;
    }

    if (!eventType) {
      setError("Event type is required.");
      return;
    }

    if (!generatedName.trim()) {
      setError("Week template name could not be generated.");
      return;
    }

    if (sortedSlots.length === 0) {
      setError("Add at least one slot before saving.");
      return;
    }

    for (const slot of sortedSlots) {
      if (!slot.session_template_id) {
        setError("Every slot must have a session template selected.");
        return;
      }
    }

    setSaving(true);

    try {
      const updatePayload: Record<string, unknown> = {
        name: generatedName.trim(),
        description: description.trim() || null,
        focus_type_id: focusTypeId || null,
        tags: parsedTags,
        condition_tags: conditionTags,
        training_purpose: trainingPurpose || null,
        is_active: isActive,
      };

      const { error: templateError } = await supabase
        .from("week_templates")
        .update(updatePayload)
        .eq("id", templateId);

      if (templateError) throw templateError;

      const { error: deleteError } = await supabase
        .from("week_template_slots")
        .delete()
        .eq("week_template_id", templateId);

      if (deleteError) throw deleteError;

      const payload = sortedSlots.map((slot, index) => ({
        week_template_id: templateId,
        slot_name:
          slot.slot_name.trim() ||
          sessionTemplates.find((session) => session.id === slot.session_template_id)?.name ||
          "Unnamed Slot",
        session_template_id: slot.session_template_id,
        is_required: slot.is_required,
        sort_order: index + 1,
        notes: slot.notes.trim() || null,
      }));

      const { error: insertError } = await supabase
        .from("week_template_slots")
        .insert(payload);

      if (insertError) throw insertError;

      setSlots((current) =>
        [...current]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((slot, index) => ({
            ...slot,
            sort_order: index + 1,
          })),
      );

      setSaveMessage("Week template saved.");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error saving week template.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-6xl p-6">
          <p className="text-sm text-zinc-600">Loading week template...</p>
        </div>
      </div>
    );
  }

  if (error && !focusTypeId && !description && slots.length === 0) {
    return (
      <div className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-6xl p-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>

          <div className="mt-4">
            <Link
              href="/coach/week-templates"
              className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Back to week templates
            </Link>
          </div>
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
              <Link href="/coach/week-templates" className="hover:underline">
                Week Template Library
              </Link>
              <span className="mx-2">/</span>
              <Link
                href={`/coach/week-templates/${templateId}/view`}
                className="hover:underline"
              >
                View
              </Link>
              <span className="mx-2">/</span>
              <span>Edit</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-black">
              Edit week template
            </h1>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/coach/week-templates/${templateId}/view`}
              className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              View template
            </Link>
            <Link
              href="/coach/week-templates"
              className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Back
            </Link>
          </div>
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
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
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
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
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
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
                  placeholder="Optional notes about when to use this week template"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Tags
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500"
                  placeholder="e.g. no equipment, low impact, treadmill friendly"
                />
                <p className="mt-1 text-xs text-zinc-500">Comma separated for now.</p>

                {parsedTags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parsedTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
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

                              updateSlot(slot.localId, {
                                selected_bucket: nextBucket,
                                selected_activity: nextActivity,
                                selected_subtype: nextSubtype,
                                session_template_id: nextSession?.id ?? "",
                                slot_name: nextSession?.name ?? "",
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
                                  session_template_id: nextSession?.id ?? "",
                                  slot_name: nextSession?.name ?? "",
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
                                    session_template_id: nextSession?.id ?? "",
                                    slot_name: nextSession?.name ?? "",
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
                                    session_template_id: nextSession?.id ?? "",
                                    slot_name: nextSession?.name ?? "",
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
                                slot_name: selectedSession?.name ?? "",
                              });
                            }}
                            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                            disabled={!slot.selected_bucket}
                          >
                            <option value="">Select a session template</option>
                            {filteredSessions.map((session) => (
                              <option key={session.id} value={session.id}>
                                {formatSessionOptionLabel(session)}
                              </option>
                            ))}
                          </select>
                        </div>

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

          {saveMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {saveMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save week template"}
            </button>

            <Link
              href={`/coach/week-templates/${templateId}/view`}
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
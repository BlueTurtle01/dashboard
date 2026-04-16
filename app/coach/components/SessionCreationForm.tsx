"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export type SessionFormData = {
  name: string;
  description: string;
  type: string;
  duration: string;
  intensity: string;
  isKeySession: boolean;
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

interface SessionCreationFormProps {
  initialData?: Partial<SessionFormData>;
  onSave: (data: SessionFormData) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function SessionCreationForm({
  initialData,
  onSave,
  onCancel,
  isSaving = false,
}: SessionCreationFormProps) {
  const [form, setForm] = useState<SessionFormData>({
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    type: initialData?.type ?? "Easy",
    duration: initialData?.duration ?? "",
    intensity: initialData?.intensity ?? "",
    isKeySession: initialData?.isKeySession ?? false,
  });

  const [activityOptions, setActivityOptions] = useState<ActivityOption[]>([]);
  const [subtypeOptions, setSubtypeOptions] = useState<SubtypeOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);

      const supabase = createClient();
      const [activitiesResult, subtypesResult] = await Promise.all([
        supabase
          .from("session_activities")
          .select("id, slug, label")
          .eq("is_active", true)
          .order("label", { ascending: true }),
        supabase
          .from("session_subtypes")
          .select("id, slug, label, sort_order")
          .eq("is_active", true)
          .order("label", { ascending: true }),
      ]);

      if (activitiesResult.data) {
        setActivityOptions(activitiesResult.data as ActivityOption[]);
      }

      if (subtypesResult.data) {
        setSubtypeOptions(subtypesResult.data as SubtypeOption[]);
      }

      setLoadingOptions(false);
    }

    void loadOptions();
  }, []);

  const sessionTypeOptions = useMemo(() => {
    return [
      "Easy",
      "Steady",
      "Intervals",
      "Long",
      "Recovery",
      "Gym",
      "Rest",
      "Race",
    ];
  }, []);

  const intensityOptions = [
    "Z1",
    "Z1-Z2",
    "Z2",
    "Z2-Z3",
    "Z3",
    "Z3-Z4",
    "Z4",
    "Z4+",
  ];

  const updateForm = <K extends keyof SessionFormData>(
    field: K,
    value: SessionFormData[K],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      alert("Session name is required");
      return;
    }

    onSave(form);
  };

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-zinc-900">
          Session Name
        </span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateForm("name", e.target.value)}
          placeholder="e.g. Easy 4km Run"
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-zinc-900">
          Type
        </span>
        <select
          value={form.type}
          onChange={(e) => updateForm("type", e.target.value)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
        >
          {sessionTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-zinc-900">
            Duration
          </span>
          <input
            type="text"
            value={form.duration}
            onChange={(e) => updateForm("duration", e.target.value)}
            placeholder="e.g. 45 min, 10 km"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-zinc-900">
            Intensity
          </span>
          <select
            value={form.intensity}
            onChange={(e) => updateForm("intensity", e.target.value)}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
          >
            <option value="">Select intensity...</option>
            {intensityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-zinc-900">
          Description
        </span>
        <textarea
          value={form.description}
          onChange={(e) => updateForm("description", e.target.value)}
          placeholder="Detailed description of the session"
          rows={3}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
        />
      </label>

      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={form.isKeySession}
          onChange={(e) => updateForm("isKeySession", e.target.checked)}
          className="h-4 w-4"
        />
        <span>Key session</span>
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || loadingOptions}
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 transition disabled:opacity-50 hover:bg-emerald-100"
        >
          {isSaving ? "Saving..." : "Save Session"}
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

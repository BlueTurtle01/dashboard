"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TemplateForm = {
  raceName: string;
  description: string;
  startingFitness: string;
  eventGoal: string;
  distance: string;
  isFeatured: boolean;
  isPersonalised: boolean;
  isActive: boolean;
  minWeeklyTrainingHours: string;
  minLongestRecentSessionMinutes: string;
  minTrainingConsistencyWeeks: string;
  minBackToBackDays: string;
  requiresHills: boolean;
  requiresGym: boolean;
  requiresLoadCarriage: boolean;
  requiresHeatAcclimation: boolean;
  suitableRaceGoals: string[];
};

type RaceRow = {
  id: string;
  name: string;
  distance_km: number | null;
  terrain_type: string | null;
  climate_type: string | null;
};

const RACE_GOAL_OPTIONS = [
  { value: "finish", label: "Finish" },
  { value: "finish_strong", label: "Finish Strong" },
  { value: "complete_comfortably", label: "Complete Comfortably" },
  { value: "experience", label: "Experience" },
  { value: "pb", label: "Personal Best" },
  { value: "place_highly", label: "Place Highly" },
  { value: "win_age_category", label: "Win Age Category" },
  { value: "win_overall", label: "Win Overall" },
];

const DISTANCE_OPTIONS = [
  { value: "", label: "— select distance —" },
  { value: "5K", label: "5K" },
  { value: "10K", label: "10K" },
  { value: "Half Marathon", label: "Half Marathon" },
  { value: "Marathon", label: "Marathon" },
  { value: "50K", label: "50K" },
  { value: "50 Miles", label: "50 Miles" },
  { value: "100K", label: "100K" },
  { value: "100 Miles", label: "100 Miles" },
  { value: "Multi-Day", label: "Multi-Day" },
  { value: "Sprint Triathlon", label: "Sprint Triathlon" },
  { value: "Olympic Triathlon", label: "Olympic Triathlon" },
  { value: "Half Ironman", label: "Half Ironman" },
  { value: "Ironman", label: "Ironman" },
  { value: "Other", label: "Other" },
];

const FITNESS_LABELS: Record<string, string> = {
  beginner: "Beginner",
  novice: "Novice",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAutoName(form: TemplateForm): string {
  const parts: string[] = [];
  if (form.raceName.trim()) parts.push(form.raceName.trim());
  if (form.startingFitness) parts.push(FITNESS_LABELS[form.startingFitness] ?? form.startingFitness);
  if (form.distance) parts.push(form.distance);
  if (form.eventGoal) {
    const goal = RACE_GOAL_OPTIONS.find((o) => o.value === form.eventGoal);
    if (goal) parts.push(goal.label);
  }
  return parts.join(" · ");
}

function buildInitialForm(raceName = ""): TemplateForm {
  return {
    raceName,
    description: "",
    startingFitness: "novice",
    eventGoal: "",
    distance: "",
    isFeatured: false,
    isPersonalised: false,
    isActive: true,
    minWeeklyTrainingHours: "",
    minLongestRecentSessionMinutes: "",
    minTrainingConsistencyWeeks: "",
    minBackToBackDays: "",
    requiresHills: false,
    requiresGym: false,
    requiresLoadCarriage: false,
    requiresHeatAcclimation: false,
    suitableRaceGoals: [],
  };
}

export default function NewProgramTemplatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const visibilityParam = (searchParams.get("visibility") || "").trim().toLowerCase();
  const isPublicTemplate = visibilityParam === "public";
  const supabase = useMemo(() => createClient(), []);
  const initialRaceName = (
    searchParams.get("raceName") ||
    searchParams.get("race_name") ||
    searchParams.get("race") ||
    ""
  ).trim();

  const [form, setForm] = useState<TemplateForm>(() => buildInitialForm(initialRaceName));
  const [races, setRaces] = useState<RaceRow[]>([]);
  const [raceSearchQuery, setRaceSearchQuery] = useState(initialRaceName);
  const [isLoadingRaces, setIsLoadingRaces] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const pageTitle = isPublicTemplate ? "Create Public Programme Template" : "Create Programme Template";

  const autoName = useMemo(() => buildAutoName(form), [form]);

  const filteredRaces = useMemo(() => {
    const query = raceSearchQuery.trim().toLowerCase();
    if (query.length < 2) return [];

    return races
      .filter((race) =>
        [
          race.name,
          race.distance_km ? `${race.distance_km}km` : "",
          race.terrain_type,
          race.climate_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 8);
  }, [raceSearchQuery, races]);

  useEffect(() => {
    let isMounted = true;

    async function loadRaces() {
      setIsLoadingRaces(true);

      const { data, error } = await supabase
        .from("races")
        .select("id, name, distance_km, terrain_type, climate_type")
        .eq("is_published", true)
        .order("name");

      if (!isMounted) return;

      if (error) {
        setStatusMessage(`Could not load races: ${error.message}`);
        setRaces([]);
      } else {
        setRaces((data ?? []) as RaceRow[]);
      }

      setIsLoadingRaces(false);
    }

    void loadRaces();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  function updateForm<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleRaceGoal(value: string) {
    setForm((current) => ({
      ...current,
      suitableRaceGoals: current.suitableRaceGoals.includes(value)
        ? current.suitableRaceGoals.filter((g) => g !== value)
        : [...current.suitableRaceGoals, value],
    }));
  }

  async function handleCreateTemplate() {
    setIsSaving(true);
    setStatusMessage("");

    const name = autoName.trim();
    if (!name) {
      setIsSaving(false);
      setStatusMessage("Please select at least a race, fitness level, distance, or goal to generate a template name.");
      return;
    }

    const slug = slugify(name);
    if (!slug) {
      setIsSaving(false);
      setStatusMessage("Could not generate a slug from the template name.");
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      slug,
      description: form.description.trim() || null,
      discipline: "general",
      // Placeholder values — the edit page derives these from actual weeks on every save
      plan_length_weeks: 1,
      training_days_per_week: 1,
      starting_fitness: form.startingFitness.trim() || "novice",
      event_goal: form.eventGoal || null,
      distance: form.distance || null,
      is_featured: form.isFeatured,
      is_personalised: form.isPersonalised,
      is_active: form.isActive,
      min_weekly_training_hours: form.minWeeklyTrainingHours ? Number(form.minWeeklyTrainingHours) : null,
      min_longest_recent_session_minutes: form.minLongestRecentSessionMinutes
        ? Number(form.minLongestRecentSessionMinutes)
        : null,
      min_training_consistency_weeks: form.minTrainingConsistencyWeeks
        ? Number(form.minTrainingConsistencyWeeks)
        : null,
      min_back_to_back_days: form.minBackToBackDays ? Number(form.minBackToBackDays) : null,
      requires_hills: form.requiresHills,
      requires_gym: form.requiresGym,
      requires_load_carriage: form.requiresLoadCarriage,
      requires_heat_acclimation: form.requiresHeatAcclimation,
      suitable_race_goals: form.suitableRaceGoals,
    };

    if (isPublicTemplate) {
      payload.is_public = true;
    }

    const { data, error } = await supabase
      .from("program_templates")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data?.id) {
      setIsSaving(false);
      setStatusMessage(`Could not create template: ${error?.message || "Unknown error"}`);
      return;
    }

    router.push(`/coach/program-templates/${encodeURIComponent(data.id)}/edit`);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{pageTitle}</h1>
            <p className="mt-2 text-sm text-zinc-600">
              Set the basics first — you&apos;ll add weeks and sessions after.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/coach/program-templates"
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={() => void handleCreateTemplate()}
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? "Creating…" : "Create Template"}
            </button>
          </div>
        </div>

        {/* Live template name preview */}
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Template name (auto-generated)</p>
          <p className="mt-1 text-lg font-semibold text-zinc-900">
            {autoName || <span className="text-zinc-400 font-normal italic">Select options below to generate a name</span>}
          </p>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-900">
            {statusMessage}
          </div>
        ) : null}

        <div className="space-y-6">
          {/* Core details */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Core details</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-zinc-700 md:col-span-2">
                Race
                <input
                  type="text"
                  value={raceSearchQuery}
                  onChange={(e) => setRaceSearchQuery(e.target.value)}
                  placeholder={isLoadingRaces ? "Loading races..." : "Search races by name, terrain, or climate"}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                />
                {form.raceName ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <span className="font-medium">Selected: {form.raceName}</span>
                    <button
                      type="button"
                      onClick={() => {
                        updateForm("raceName", "");
                        setRaceSearchQuery("");
                      }}
                      className="text-xs font-semibold text-emerald-800 underline"
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                {raceSearchQuery.trim().length >= 2 && filteredRaces.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                    {filteredRaces.map((race) => {
                      const details = [
                        race.distance_km ? `${race.distance_km}km` : "",
                        race.terrain_type,
                        race.climate_type,
                      ].filter(Boolean);

                      return (
                        <button
                          key={race.id}
                          type="button"
                          onClick={() => {
                            updateForm("raceName", race.name);
                            setRaceSearchQuery(race.name);
                          }}
                          className="block w-full border-b border-zinc-100 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-zinc-50"
                        >
                          <span className="block font-semibold text-zinc-900">{race.name}</span>
                          {details.length > 0 ? (
                            <span className="mt-1 block text-xs text-zinc-500">{details.join(" · ")}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {raceSearchQuery.trim().length >= 2 && !isLoadingRaces && filteredRaces.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">No matching races found.</p>
                ) : null}
              </label>

              <label className="text-sm font-medium text-zinc-700 md:col-span-2">
                Description
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                />
              </label>

              <label className="text-sm font-medium text-zinc-700">
                Starting fitness level
                <select
                  value={form.startingFitness}
                  onChange={(e) => updateForm("startingFitness", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                >
                  <option value="beginner">Beginner</option>
                  <option value="novice">Novice</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </label>

              <label className="text-sm font-medium text-zinc-700">
                Distance
                <select
                  value={form.distance}
                  onChange={(e) => updateForm("distance", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                >
                  {DISTANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Goals */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Goals</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-zinc-700">
                Event goal
                <select
                  value={form.eventGoal}
                  onChange={(e) => updateForm("eventGoal", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                >
                  <option value="">— select —</option>
                  {RACE_GOAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Prerequisites */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Prerequisites</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-medium text-zinc-700">
                Min weekly training hours
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.minWeeklyTrainingHours}
                  onChange={(e) => updateForm("minWeeklyTrainingHours", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                />
              </label>

              <label className="text-sm font-medium text-zinc-700">
                Min longest session (min)
                <input
                  type="number"
                  min={0}
                  value={form.minLongestRecentSessionMinutes}
                  onChange={(e) => updateForm("minLongestRecentSessionMinutes", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                />
              </label>

              <label className="text-sm font-medium text-zinc-700">
                Min consistency (weeks)
                <input
                  type="number"
                  min={0}
                  value={form.minTrainingConsistencyWeeks}
                  onChange={(e) => updateForm("minTrainingConsistencyWeeks", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                />
              </label>

              <label className="text-sm font-medium text-zinc-700">
                Min back-to-back days
                <input
                  type="number"
                  min={0}
                  value={form.minBackToBackDays}
                  onChange={(e) => updateForm("minBackToBackDays", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm"
                />
              </label>
            </div>
          </section>

          {/* Flags */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-zinc-900">Flags</h2>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {(
                [
                  ["Featured", "isFeatured"],
                  ["Personalised", "isPersonalised"],
                  ["Active", "isActive"],
                  ["Requires hills", "requiresHills"],
                  ["Requires gym", "requiresGym"],
                  ["Requires load carriage", "requiresLoadCarriage"],
                  ["Requires heat acclimation", "requiresHeatAcclimation"],
                ] as [string, keyof TemplateForm][]
              ).map(([label, key]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 hover:border-zinc-400 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={form[key] as boolean}
                    onChange={(e) => updateForm(key, e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {isPublicTemplate ? (
              <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
                This template will be created as a public template visible to all coaches.
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

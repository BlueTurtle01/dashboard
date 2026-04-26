"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AthletePlanRow = {
  id: string;
  athlete_user_id: string;
  coach_user_id: string | null;
  source_program_template_id: string | null;
  event_id: string | null;
  name: string;
  plan_json: unknown;
  status: "draft" | "active" | "archived";
  created_at?: string | null;
  updated_at?: string | null;
};

type WeekFocusTypeRow = {
  id: string;
  name: string;
  color: string | null;
  display_order: number | null;
};

type ExtractedPlanWeek = {
  weekNumber: number;
  focusName: string;
  focusColor: string | null;
};

const DEFAULT_WEEK_COLOR = "#d4d4d8";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWeeksArray(planJson: unknown): unknown[] {
  if (Array.isArray(planJson)) {
    return planJson;
  }

  if (!isRecord(planJson)) {
    return [];
  }

  const directWeeks = planJson.weeks;
  if (Array.isArray(directWeeks)) {
    return directWeeks;
  }

  const directCycles = planJson.cycles;
  if (Array.isArray(directCycles)) {
    const allCycleWeeks = directCycles.flatMap((cycle) => {
      if (!isRecord(cycle) || !Array.isArray(cycle.weeks)) {
        return [];
      }

      return cycle.weeks;
    });

    const totalWeeks =
      typeof planJson.totalWeeks === "number" && Number.isFinite(planJson.totalWeeks)
        ? planJson.totalWeeks
        : null;

    const cycleLength =
      typeof planJson.cycleLength === "number" && Number.isFinite(planJson.cycleLength)
        ? planJson.cycleLength
        : null;

    if (
      directCycles.length === 1 &&
      allCycleWeeks.length > 0 &&
      totalWeeks &&
      totalWeeks > allCycleWeeks.length &&
      cycleLength === allCycleWeeks.length
    ) {
      return Array.from({ length: totalWeeks }, (_, index) => allCycleWeeks[index % allCycleWeeks.length]);
    }

    return allCycleWeeks;
  }

  const nestedPlan = planJson.plan;
  if (isRecord(nestedPlan)) {
    if (Array.isArray(nestedPlan.weeks)) {
      return nestedPlan.weeks;
    }

    if (Array.isArray(nestedPlan.cycles)) {
      return nestedPlan.cycles.flatMap((cycle) => {
        if (!isRecord(cycle) || !Array.isArray(cycle.weeks)) {
          return [];
        }

        return cycle.weeks;
      });
    }
  }

  const nestedProgram = planJson.program;
  if (isRecord(nestedProgram)) {
    if (Array.isArray(nestedProgram.weeks)) {
      return nestedProgram.weeks;
    }

    if (Array.isArray(nestedProgram.cycles)) {
      return nestedProgram.cycles.flatMap((cycle) => {
        if (!isRecord(cycle) || !Array.isArray(cycle.weeks)) {
          return [];
        }

        return cycle.weeks;
      });
    }
  }

  return [];
}

function toWeekNumber(value: unknown, fallbackIndex: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallbackIndex + 1;
}

function extractWeekFocusName(week: Record<string, unknown>) {
  const candidates = [
    week.focus,
    week.focus_name,
    week.focusName,
    week.week_focus,
    week.weekFocus,
    week.focus_type,
    week.focusType,
    week.type,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (isRecord(candidate)) {
      const nestedName = candidate.name;
      if (typeof nestedName === "string" && nestedName.trim()) {
        return nestedName.trim();
      }
    }
  }

  return "Unspecified";
}

function isUsableColor(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgb\(|rgba\(|hsl\(|hsla\(|[a-zA-Z]+$)/.test(trimmed);
}

function extractWeekFocusColor(week: Record<string, unknown>) {
  const focus = week.focus;
  if (isRecord(focus) && isUsableColor(focus.color)) {
    return focus.color.trim();
  }

  const candidates = [
    week.color,
    week.focus_color,
    week.focusColor,
    week.week_focus_color,
    week.weekFocusColor,
  ];

  for (const candidate of candidates) {
    if (isUsableColor(candidate)) {
      return candidate.trim();
    }
  }

  return null;
}

function extractPlanWeeks(planJson: unknown): ExtractedPlanWeek[] {
  const rawWeeks = readWeeksArray(planJson);

  return rawWeeks
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const weekNumber = toWeekNumber(
        item.week_number ?? item.weekNumber ?? item.number ?? item.index,
        index,
      );

      return {
        weekNumber,
        focusName: extractWeekFocusName(item),
        focusColor: extractWeekFocusColor(item),
      } satisfies ExtractedPlanWeek;
    })
    .filter((item): item is ExtractedPlanWeek => item !== null)
    .sort((a, b) => a.weekNumber - b.weekNumber);
}

function normaliseFocusName(value: string) {
  return value.trim().toLowerCase();
}

function WeekFocusChart({
  planJson,
  weekFocusColorMap,
}: {
  planJson: unknown;
  weekFocusColorMap: Map<string, string>;
}) {
  const weeks = useMemo(() => extractPlanWeeks(planJson), [planJson]);

  if (weeks.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-500">
        No week data found for this plan.
      </div>
    );
  }

  const uniqueFocuses = Array.from(new Set(weeks.map((week) => week.focusName)));

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Week focus chart</div>
          <div className="text-xs text-zinc-500">Each bar is one week, coloured by week type.</div>
        </div>
        <div className="text-xs text-zinc-500">{weeks.length} weeks</div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex min-w-full items-end gap-2 border-b border-zinc-300 pb-3">
          {weeks.map((week) => {
            const color = week.focusColor || weekFocusColorMap.get(normaliseFocusName(week.focusName)) || DEFAULT_WEEK_COLOR;

            return (
              <div
                key={`${week.weekNumber}-${week.focusName}`}
                className="flex min-w-[38px] flex-col items-center gap-2"
                title={`Week ${week.weekNumber}: ${week.focusName}`}
              >
                <div className="text-[11px] text-zinc-500">{week.weekNumber}</div>
                <svg
                  width="32"
                  height="68"
                  viewBox="0 0 32 68"
                  role="img"
                  aria-label={`Week ${week.weekNumber} ${week.focusName}`}
                  className="block overflow-visible"
                >
                  <rect x="0.5" y="0.5" width="31" height="67" rx="6" ry="6" fill={color} stroke="#d4d4d8" />
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {uniqueFocuses.map((focusName) => {
          const matchingWeek = weeks.find((week) => week.focusName === focusName);
          const color = matchingWeek?.focusColor || weekFocusColorMap.get(normaliseFocusName(focusName)) || DEFAULT_WEEK_COLOR;

          return (
            <div
              key={focusName}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700"
            >
              <span
                className="inline-block h-3 w-3 rounded-full border border-zinc-300"
                style={{ backgroundColor: color }}
              />
              <span>{focusName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CoachPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const athleteId = searchParams.get("athleteId") || null;

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<AthletePlanRow[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [weekFocusTypes, setWeekFocusTypes] = useState<WeekFocusTypeRow[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingPlanName, setEditingPlanName] = useState("");

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
  }

  async function loadPlansForAthlete(targetAthleteId: string) {
    const { data, error } = await supabase
      .from("athlete_plans")
      .select(
        "id, athlete_user_id, coach_user_id, source_program_template_id, event_id, name, plan_json, status, created_at, updated_at",
      )
      .eq("athlete_user_id", targetAthleteId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });

    if (error) {
      showTemporaryStatus(`Could not load athlete plans: ${error.message}`, 4000);
      setPlans([]);
      return;
    }

    setPlans((data ?? []) as AthletePlanRow[]);
  }

  async function loadWeekFocusTypes() {
    const { data, error } = await supabase
      .from("week_focus_types")
      .select("id, name, color, display_order")
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) {
      showTemporaryStatus(`Could not load week focus colours: ${error.message}`, 4000);
      setWeekFocusTypes([]);
      return;
    }

    setWeekFocusTypes((data ?? []) as WeekFocusTypeRow[]);
  }

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      setLoading(true);
      await loadWeekFocusTypes();

      if (!athleteId) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      await loadPlansForAthlete(athleteId);

      if (!cancelled) {
        setLoading(false);
      }
    }

    void initialise();

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  async function setPlanActive(planId: string) {
    if (!athleteId) return;

    const selected = plans.find((plan) => plan.id === planId);
    if (!selected) return;

    if (selected.status === "active") {
      showTemporaryStatus("This plan is already active.", 2000);
      return;
    }

    const { error: archiveError } = await supabase
      .from("athlete_plans")
      .update({ status: "archived", is_active: false })
      .eq("athlete_user_id", athleteId)
      .eq("status", "active");

    if (archiveError) {
      showTemporaryStatus(`Could not archive current active plan: ${archiveError.message}`, 4000);
      return;
    }

    const { error: activateError } = await supabase
      .from("athlete_plans")
      .update({ status: "active", is_active: true })
      .eq("id", planId);

    if (activateError) {
      showTemporaryStatus(`Could not set plan active: ${activateError.message}`, 4000);
      return;
    }

    await loadPlansForAthlete(athleteId);
    showTemporaryStatus("Plan set as active.", 2000);
  }

  async function archivePlan(planId: string) {
    const selected = plans.find((plan) => plan.id === planId);
    if (!selected) return;

    const confirmed = window.confirm(`Archive "${selected.name || "this plan"}"?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from("athlete_plans")
      .update({ status: "archived", is_active: false })
      .eq("id", planId);

    if (error) {
      showTemporaryStatus(`Could not archive plan: ${error.message}`, 4000);
      return;
    }

    if (athleteId) {
      await loadPlansForAthlete(athleteId);
    }
    showTemporaryStatus("Plan archived.", 2000);
  }

  function startEditingPlanName(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setEditingPlanId(planId);
    setEditingPlanName(plan.name || "");
  }

  async function savePlanName(planId: string) {
    const newName = editingPlanName.trim();
    if (!newName) {
      showTemporaryStatus("Plan name cannot be empty.", 2000);
      return;
    }

    const { error } = await supabase
      .from("athlete_plans")
      .update({ name: newName })
      .eq("id", planId);

    if (error) {
      showTemporaryStatus(`Could not update plan name: ${error.message}`, 4000);
      return;
    }

    setEditingPlanId(null);
    setEditingPlanName("");
    if (athleteId) {
      await loadPlansForAthlete(athleteId);
    }
    showTemporaryStatus("Plan name updated.", 2000);
  }

  function cancelEditingPlanName() {
    setEditingPlanId(null);
    setEditingPlanName("");
  }

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status === "active"),
    [plans],
  );
  const draftPlans = useMemo(
    () => plans.filter((plan) => plan.status === "draft"),
    [plans],
  );
  const archivedPlans = useMemo(
    () => plans.filter((plan) => plan.status === "archived"),
    [plans],
  );

  const weekFocusColorMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const item of weekFocusTypes) {
      if (!item.name || !item.color) continue;
      map.set(normaliseFocusName(item.name), item.color);
    }

    return map;
  }, [weekFocusTypes]);

  function renderPlanGroup(title: string, items: AthletePlanRow[]) {
    if (items.length === 0) return null;

    return (
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">{title}</h2>

        <div className="mt-4 space-y-3">
          {items.map((plan) => (
            <div
              key={plan.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  {editingPlanId === plan.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingPlanName}
                        onChange={(e) => setEditingPlanName(e.target.value)}
                        className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                        placeholder="Plan name"
                      />
                      <button
                        type="button"
                        onClick={() => void savePlanName(plan.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingPlanName}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-zinc-900">
                          {plan.name || "Unnamed plan"}
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditingPlanName(plan.id)}
                          className="rounded text-xs text-zinc-500 hover:text-zinc-700"
                          title="Edit plan name"
                        >
                          ✎
                        </button>
                      </div>
                      <div className="mt-1 text-sm text-zinc-600">
                        Updated {formatDateTime(plan.updated_at)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/coach/plan/${encodeURIComponent(plan.id)}`}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
                  >
                    Edit
                  </Link>

                  <button
                    type="button"
                    onClick={() => void setPlanActive(plan.id)}
                    disabled={plan.status === "active"}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-50"
                  >
                    Set Active
                  </button>

                  <button
                    type="button"
                    onClick={() => void archivePlan(plan.id)}
                    disabled={plan.status === "archived"}
                    className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </div>

              {plan.status === "active" ? (
                <WeekFocusChart
                  planJson={plan.plan_json}
                  weekFocusColorMap={weekFocusColorMap}
                />
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Athlete Plans</h1>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={athleteId ? `/create-plan?athleteId=${encodeURIComponent(athleteId)}&source=scratch` : "/create-plan"}
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
            >
              New Blank Plan
            </Link>

            <Link
              href={athleteId ? `/coach/program-templates?athleteId=${encodeURIComponent(athleteId)}` : "/coach/program-templates"}
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
            >
              Use Template
            </Link>
          </div>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        {!athleteId ? (
          <div className="rounded-2xl border bg-white p-8">
            No athlete selected.
          </div>
        ) : loading ? (
          <div className="rounded-2xl border bg-white p-8">
            Loading…
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-2xl border bg-white p-8">
            No plans found for this athlete.
          </div>
        ) : (
          <div className="space-y-6">
            {renderPlanGroup("Active Plans", activePlans)}
            {renderPlanGroup("Draft Plans", draftPlans)}
            {renderPlanGroup("Archived Plans", archivedPlans)}
          </div>
        )}
      </div>
    </main>
  );
}

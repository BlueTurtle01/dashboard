"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type CalendarModal = {
  planId: string;
  templateId: string;
  planLengthWeeks: number;
  planName: string;
};

type PlanCard = {
  planId: string;
  planName: string;
  description: string | null;
  discipline: string;
  planLengthWeeks: number;
  trainingDaysPerWeek: number;
  requiresHills: boolean;
  requiresGym: boolean;
  weeks: { id: string; weekNumber: number; focus: string | null }[];
  sessionsByWeek: Map<string, { distanceKm: number | null }[]>;
  gymEquipment: string[];
};

export default function AthleteProgramLibrary() {
  const router = useRouter();
  const [cards, setCards] = useState<PlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSoloPlanHolder, setIsSoloPlanHolder] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [modal, setModal] = useState<CalendarModal | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setLoading(false); return; }

    // Check if solo plan holder
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    setIsSoloPlanHolder((roleRows ?? []).some((r) => r.role === "solo_plan_holder"));

    // 1. Active plans from templates
    const { data: plans, error: plansErr } = await supabase
      .from("athlete_plans")
      .select("id, name, source_program_template_id")
      .eq("athlete_user_id", user.id)
      .eq("status", "active")
      .not("source_program_template_id", "is", null);

    if (plansErr) { setError(plansErr.message); setLoading(false); return; }
    if (!plans || plans.length === 0) { setLoading(false); return; }

    const templateIds = [...new Set(plans.map((p) => p.source_program_template_id as string))];

    // 2. Template metadata
    const { data: templates, error: tErr } = await supabase
      .from("program_templates")
      .select("id, name, description, discipline, plan_length_weeks, training_days_per_week, requires_hills, requires_gym")
      .in("id", templateIds);
    if (tErr) { setError(tErr.message); setLoading(false); return; }

    // 3. Weeks
    const { data: allWeeks, error: wErr } = await supabase
      .from("program_template_weeks")
      .select("id, program_template_id, week_number, focus")
      .in("program_template_id", templateIds)
      .order("week_number");
    if (wErr) { setError(wErr.message); setLoading(false); return; }

    const weekIds = (allWeeks ?? []).map((w) => w.id);

    // 4. Sessions (distance + session_template_id for gym exercises)
    const { data: allSessions } = await supabase
      .from("program_template_sessions")
      .select("id, program_template_week_id, distance_km, session_template_id, session_templates ( distance_km )")
      .in("program_template_week_id", weekIds.length > 0 ? weekIds : ["__none__"]);

    // 5. Gym exercises via session_template_exercises → exercises
    const sessionTemplateIds = [
      ...new Set(
        (allSessions ?? [])
          .map((s) => s.session_template_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const gymEquipmentBySessionTemplateId = new Map<string, string[]>();

    if (sessionTemplateIds.length > 0) {
      const { data: gymExRows } = await supabase
        .from("session_template_exercises")
        .select("session_template_id, exercise_id")
        .in("session_template_id", sessionTemplateIds);

      const exerciseIds = [...new Set((gymExRows ?? []).map((r) => r.exercise_id as string))];

      if (exerciseIds.length > 0) {
        const { data: exerciseRows } = await supabase
          .from("exercises")
          .select("id, equipment")
          .in("id", exerciseIds);

        const equipmentByExerciseId = new Map<string, string[]>(
          (exerciseRows ?? []).map((e) => [e.id as string, (e.equipment as string[] | null) ?? []])
        );

        for (const row of gymExRows ?? []) {
          const stId = row.session_template_id as string;
          const equipment = equipmentByExerciseId.get(row.exercise_id as string) ?? [];
          const existing = gymEquipmentBySessionTemplateId.get(stId) ?? [];
          for (const item of equipment) {
            if (!existing.includes(item)) existing.push(item);
          }
          gymEquipmentBySessionTemplateId.set(stId, existing);
        }
      }
    }

    // Build per-week session data and per-template equipment sets
    const weeksByTemplate = new Map<string, typeof allWeeks[number][]>();
    for (const w of allWeeks ?? []) {
      const arr = weeksByTemplate.get(w.program_template_id) ?? [];
      arr.push(w);
      weeksByTemplate.set(w.program_template_id, arr);
    }

    // week id → template id lookup
    const weekToTemplate = new Map<string, string>();
    for (const [templateId, weeks] of weeksByTemplate.entries()) {
      for (const w of weeks) weekToTemplate.set(w.id, templateId);
    }

    const sessionsByWeek = new Map<string, { distanceKm: number | null }[]>();
    const equipmentByTemplate = new Map<string, Set<string>>();

    for (const s of allSessions ?? []) {
      const weekId = s.program_template_week_id as string;
      const sessionTemplate = Array.isArray(s.session_templates)
        ? (s.session_templates[0] ?? null)
        : s.session_templates;
      const distanceKm = ((sessionTemplate as { distance_km: number | null } | null)?.distance_km ?? s.distance_km) as number | null;

      const arr = sessionsByWeek.get(weekId) ?? [];
      arr.push({ distanceKm });
      sessionsByWeek.set(weekId, arr);

      // Collect equipment for this session's template
      if (s.session_template_id) {
        const equipment = gymEquipmentBySessionTemplateId.get(s.session_template_id as string) ?? [];
        const templateId = weekToTemplate.get(weekId);
        if (templateId && equipment.length > 0) {
          const set = equipmentByTemplate.get(templateId) ?? new Set<string>();
          for (const item of equipment) set.add(item);
          equipmentByTemplate.set(templateId, set);
        }
      }
    }

    // Build cards
    const templateMap = new Map((templates ?? []).map((t) => [t.id as string, t]));
    const result: PlanCard[] = [];

    for (const plan of plans) {
      const templateId = plan.source_program_template_id as string;
      const t = templateMap.get(templateId);
      if (!t) continue;

      result.push({
        planId: plan.id as string,
        planName: plan.name as string,
        description: t.description as string | null,
        discipline: t.discipline as string,
        planLengthWeeks: t.plan_length_weeks as number,
        trainingDaysPerWeek: t.training_days_per_week as number,
        requiresHills: t.requires_hills as boolean,
        requiresGym: t.requires_gym as boolean,
        weeks: (weeksByTemplate.get(templateId) ?? []).map((w) => ({
          id: w.id,
          weekNumber: w.week_number,
          focus: w.focus,
        })),
        sessionsByWeek,
        gymEquipment: [...(equipmentByTemplate.get(templateId) ?? [])].sort(),
      });
    }

    setCards(result);
    setLoading(false);
  }

  function handleAddToCalendar(planId: string, templateId: string, planLengthWeeks: number, planName: string) {
    setEventDate("");
    setEventName(planName);
    setModal({ planId, templateId, planLengthWeeks, planName });
  }

  async function handleConfirmCalendar() {
    if (!modal || !eventDate) return;
    setSaving(true);
    const supabase = createClient();

    // Fetch the existing plan_json so we can merge into it
    const { data: planRow } = await supabase
      .from("athlete_plans")
      .select("plan_json")
      .eq("id", modal.planId)
      .single();

    const existing = (planRow?.plan_json ?? {}) as Record<string, unknown>;

    const updatedJson = {
      ...existing,
      eventDate,
      eventName: eventName.trim() || modal.planName,
      weeksAvailable: modal.planLengthWeeks,
    };

    await supabase
      .from("athlete_plans")
      .update({ plan_json: updatedJson, updated_at: new Date().toISOString() })
      .eq("id", modal.planId);

    setSaving(false);
    setModal(null);
    router.push("/athlete");
  }

  async function handleClearCalendar() {
    if (!window.confirm("This will remove all programs from your calendar. Are you sure?")) return;
    setClearing(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setClearing(false); return; }

    await supabase
      .from("athlete_plans")
      .update({ status: "archived" })
      .eq("athlete_user_id", user.id)
      .eq("status", "active");

    setClearing(false);
    void load();
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-zinc-500">Loading your programs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-zinc-900">Program Library</h1>
          <p className="text-sm text-zinc-500">Your assigned training programs.</p>
        </div>
        {isSoloPlanHolder && cards.length > 0 && (
          <button
            onClick={handleClearCalendar}
            disabled={clearing}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {clearing ? "Clearing..." : "Clear Calendar"}
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-zinc-500">No programs assigned yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {cards.map((card) => (
            <ProgramCard
              key={card.planId}
              card={card}
              onAddToCalendar={() => handleAddToCalendar(card.planId, card.planLengthWeeks, card.planName)}
            />
          ))}
        </div>
      )}

      {/* Event date modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Set your race date</h2>
            <p className="mb-5 text-sm text-zinc-500">
              The calendar will be built backwards from this date so your training peaks on race day.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="eventName">
                Race / event name
              </label>
              <input
                id="eventName"
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder="e.g. London Marathon"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="eventDate">
                Race date <span className="text-red-500">*</span>
              </label>
              <input
                id="eventDate"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmCalendar()}
                disabled={!eventDate || saving}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add to Calendar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramCard({
  card,
  onAddToCalendar,
}: {
  card: PlanCard;
  onAddToCalendar: () => void;
}) {
  const weekMiles = card.weeks
    .slice()
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => {
      const sessions = card.sessionsByWeek.get(week.id) ?? [];
      const totalKm = sessions.reduce((sum, s) => sum + (s.distanceKm ?? 0), 0);
      return { weekNumber: week.weekNumber, focus: week.focus ?? "", miles: totalKm * 0.621371 };
    });

  const maxMiles = Math.max(...weekMiles.map((w) => w.miles), 1);
  const chartH = 140;
  const barW = 28;
  const gap = 6;
  const totalW = weekMiles.length * (barW + gap);
  const yAxisW = 36;
  const niceMax = Math.ceil(maxMiles / 5) * 5;
  const step = niceMax <= 20 ? 5 : niceMax <= 50 ? 10 : 20;
  const yTicks: number[] = [];
  for (let v = 0; v <= niceMax; v += step) yTicks.push(v);
  const hasDistance = weekMiles.some((w) => w.miles > 0);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-zinc-100 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{card.planName}</h2>
            {card.description && (
              <p className="mt-1 max-w-prose text-sm text-zinc-500">{card.description}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Badge>{titleCase(card.discipline)}</Badge>
              <Badge>{card.planLengthWeeks} weeks</Badge>
              <Badge>{card.trainingDaysPerWeek} days/week</Badge>
              {card.requiresHills && <Badge color="amber">Requires hills</Badge>}
              {card.requiresGym && <Badge color="indigo">Gym required</Badge>}
            </div>
            <button
              onClick={onAddToCalendar}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Add to Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-zinc-100">
        {/* Mileage chart */}
        <div className="px-6 py-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">Weekly mileage (miles)</h3>
          {hasDistance ? (
            <>
              <div className="overflow-x-auto">
                <svg width={yAxisW + totalW} height={chartH + 36} className="block">
                  {yTicks.map((tick) => {
                    const y = chartH - (tick / niceMax) * chartH;
                    return (
                      <g key={tick}>
                        <line x1={yAxisW} x2={yAxisW + totalW} y1={y} y2={y} stroke="#e4e4e7" strokeWidth={1} />
                        <text x={yAxisW - 4} y={y + 4} fontSize={9} textAnchor="end" fill="#71717a">{tick}</text>
                      </g>
                    );
                  })}
                  {weekMiles.map((w, i) => {
                    const barH = Math.max(2, (w.miles / niceMax) * chartH);
                    const x = yAxisW + i * (barW + gap);
                    const y = chartH - barH;
                    const focus = w.focus.toLowerCase();
                    const fill =
                      focus.includes("recovery") || focus.includes("deload") ? "#10b981"
                      : focus.includes("build") || focus.includes("specific") ? "#3b82f6"
                      : focus.includes("taper") || focus.includes("peak") ? "#8b5cf6"
                      : "#71717a";
                    return (
                      <g key={w.weekNumber}>
                        <rect x={x} y={y} width={barW} height={barH} fill={fill} rx={3} />
                        {w.miles > 0 && (
                          <text x={x + barW / 2} y={y - 4} fontSize={8} textAnchor="middle" fill="#52525b">
                            {w.miles.toFixed(1)}
                          </text>
                        )}
                        <text x={x + barW / 2} y={chartH + 14} fontSize={8} textAnchor="middle" fill="#71717a">
                          W{w.weekNumber}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                {[
                  { color: "#10b981", label: "Recovery / Deload" },
                  { color: "#3b82f6", label: "Build / Specific" },
                  { color: "#8b5cf6", label: "Taper / Peak" },
                  { color: "#71717a", label: "Base" },
                ].map((item) => (
                  <span key={item.label} className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
                    {item.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm italic text-zinc-400">No distance data available for this program.</p>
          )}
        </div>

        {/* Gym equipment */}
        {card.requiresGym && (
          <div className="px-6 py-5">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Gym equipment needed</h3>
            {card.gymEquipment.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {card.gymEquipment.map((item) => (
                  <span key={item} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                    {titleCase(item)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-zinc-400">Equipment details not specified.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color?: "amber" | "indigo" }) {
  const base = "rounded-full px-2.5 py-0.5 text-xs font-medium";
  const colors =
    color === "amber" ? "bg-amber-100 text-amber-800"
    : color === "indigo" ? "bg-indigo-100 text-indigo-700"
    : "bg-zinc-100 text-zinc-600";
  return <span className={`${base} ${colors}`}>{children}</span>;
}

function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.split(/[\s_-]+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

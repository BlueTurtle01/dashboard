"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PlanCard = {
  planId: string;
  planName: string;
  templateId: string;
  templateName: string;
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
  const [cards, setCards] = useState<PlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not authenticated"); setLoading(false); return; }

    // 1. Get the user's active plans that came from a template
    const { data: plans, error: plansErr } = await supabase
      .from("athlete_plans")
      .select("id, name, source_program_template_id")
      .eq("athlete_user_id", user.id)
      .eq("status", "active")
      .not("source_program_template_id", "is", null);

    if (plansErr) { setError(plansErr.message); setLoading(false); return; }
    if (!plans || plans.length === 0) { setLoading(false); return; }

    const templateIds = [...new Set(plans.map((p) => p.source_program_template_id as string))];

    // 2. Fetch template metadata
    const { data: templates, error: tErr } = await supabase
      .from("program_templates")
      .select("id, name, description, discipline, plan_length_weeks, training_days_per_week, requires_hills, requires_gym")
      .in("id", templateIds);

    if (tErr) { setError(tErr.message); setLoading(false); return; }

    // 3. Fetch weeks for all templates
    const { data: allWeeks, error: wErr } = await supabase
      .from("program_template_weeks")
      .select("id, program_template_id, week_number, focus")
      .in("program_template_id", templateIds)
      .order("week_number");

    if (wErr) { setError(wErr.message); setLoading(false); return; }

    const weekIds = (allWeeks ?? []).map((w) => w.id);

    // 4. Fetch sessions (for distance) + exercises (for gym equipment)
    const { data: allSessions } = await supabase
      .from("program_template_sessions")
      .select(`
        id,
        program_template_week_id,
        distance_km,
        activity,
        session_templates ( distance_km ),
        program_template_session_exercises (
          exercises ( equipment )
        )
      `)
      .in("program_template_week_id", weekIds.length > 0 ? weekIds : ["__none__"]);

    // Build maps
    const templateMap = new Map((templates ?? []).map((t) => [t.id, t]));
    const weeksByTemplate = new Map<string, typeof allWeeks[number][]>();
    for (const w of allWeeks ?? []) {
      const arr = weeksByTemplate.get(w.program_template_id) ?? [];
      arr.push(w);
      weeksByTemplate.set(w.program_template_id, arr);
    }

    const sessionsByWeek = new Map<string, { distanceKm: number | null }[]>();
    const equipmentByTemplate = new Map<string, Set<string>>();

    for (const s of allSessions ?? []) {
      const weekId = s.program_template_week_id as string;
      const sessionTemplate = Array.isArray(s.session_templates)
        ? s.session_templates[0] ?? null
        : s.session_templates;
      const distanceKm = (sessionTemplate?.distance_km ?? s.distance_km) as number | null;

      const arr = sessionsByWeek.get(weekId) ?? [];
      arr.push({ distanceKm });
      sessionsByWeek.set(weekId, arr);

      // Collect equipment from exercises
      const exercises = (s.program_template_session_exercises ?? []) as unknown as { exercises: { equipment: string[] | null }[] }[];
      for (const ex of exercises) {
        for (const exerciseRow of ex.exercises ?? []) {
          if (!exerciseRow?.equipment) continue;
          for (const [templateId, tWeeks] of weeksByTemplate.entries()) {
            if (tWeeks.some((w) => w.id === weekId)) {
              const set = equipmentByTemplate.get(templateId) ?? new Set<string>();
              for (const item of exerciseRow.equipment) set.add(item);
              equipmentByTemplate.set(templateId, set);
            }
          }
        }
      }
    }

    // Build final cards — one card per athlete plan
    const result: PlanCard[] = [];
    for (const plan of plans) {
      const templateId = plan.source_program_template_id as string;
      const t = templateMap.get(templateId);
      if (!t) continue;

      const weeks = (weeksByTemplate.get(templateId) ?? []).map((w) => ({
        id: w.id,
        weekNumber: w.week_number,
        focus: w.focus,
      }));

      result.push({
        planId: plan.id as string,
        planName: plan.name as string,
        templateId,
        templateName: t.name,
        description: t.description,
        discipline: t.discipline,
        planLengthWeeks: t.plan_length_weeks,
        trainingDaysPerWeek: t.training_days_per_week,
        requiresHills: t.requires_hills,
        requiresGym: t.requires_gym,
        weeks,
        sessionsByWeek,
        gymEquipment: [...(equipmentByTemplate.get(templateId) ?? [])].sort(),
      });
    }

    setCards(result);
    setLoading(false);
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
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">Program Library</h1>
      <p className="mb-8 text-sm text-zinc-500">Your assigned training programs.</p>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-zinc-500">No programs assigned yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {cards.map((card) => (
            <ProgramCard key={card.planId} card={card} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramCard({ card }: { card: PlanCard }) {
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{card.planName}</h2>
            {card.description && (
              <p className="mt-1 max-w-prose text-sm text-zinc-500">{card.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{titleCase(card.discipline)}</Badge>
            <Badge>{card.planLengthWeeks} weeks</Badge>
            <Badge>{card.trainingDaysPerWeek} days/week</Badge>
            {card.requiresHills && <Badge color="amber">Requires hills</Badge>}
            {card.requiresGym && <Badge color="indigo">Gym required</Badge>}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-zinc-100">
        {/* Mileage chart */}
        <div className="px-6 py-5">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">Weekly mileage (miles)</h3>
          {hasDistance ? (
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
          ) : (
            <p className="text-sm italic text-zinc-400">No distance data available for this program.</p>
          )}

          {/* Legend */}
          {hasDistance && (
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

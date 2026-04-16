"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type WeekTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  focus_type_id: string | null;
  training_purpose: string | null;
  is_active: boolean;
  is_custom: boolean;
  coach_user_id: string | null;
  condition_tags?: string[] | null;
  created_at: string;
  updated_at: string;
};

type WeekFocusTypeRow = {
  id: string;
  name: string;
  color: string | null;
};

type WeekTemplateWithFocus = WeekTemplateRow & {
  week_focus_types: WeekFocusTypeRow | WeekFocusTypeRow[] | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function asSingleFocusType(
  value: WeekFocusTypeRow | WeekFocusTypeRow[] | null,
): WeekFocusTypeRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const conditionTagOptions = [
  { value: "heat", label: "Heat" },
  { value: "cold", label: "Cold" },
  { value: "altitude", label: "Altitude" },
  { value: "load_carriage", label: "Load carriage" },
  { value: "no_gym", label: "No gym" },
  { value: "night_running", label: "Night running" },
  { value: "sand", label: "Sand" },
  { value: "technical_terrain", label: "Technical" },
  { value: "multi_day", label: "Multi-day" },
] as const;

export default function WeekTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WeekTemplateWithFocus[]>([]);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [focusTypes, setFocusTypes] = useState<WeekFocusTypeRow[]>([]);

  // Filter state
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [customFilter, setCustomFilter] = useState<"all" | "system" | "custom">("all");
  const [purposeFilter, setPurposeFilter] = useState("");
  const [focusFilter, setFocusFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState<string[]>([]);

  const isAdmin = roles.includes("admin");

  // Fetch user roles
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setRoles([]);
          return;
        }

        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (!error && data) {
          setRoles(data.map((r) => r.role));
        }
      } catch (err) {
        console.error("Error fetching roles:", err);
      }
    };

    fetchRoles();
  }, []);

  // Fetch templates and related data
  useEffect(() => {
    async function loadWeekTemplates() {
      setLoading(true);
      setError(null);

      try {
        const { data: templateData, error: templateError } = await supabase
          .from("week_templates")
          .select(
            `
              id,
              name,
              description,
              focus_type_id,
              training_purpose,
              is_active,
              is_custom,
              coach_user_id,
              condition_tags,
              created_at,
              updated_at,
              week_focus_types (
                id,
                name,
                color
              )
            `,
          )
          .order("updated_at", { ascending: false });

        if (templateError) throw templateError;

        const { data: slotData, error: slotError } = await supabase
          .from("week_template_slots")
          .select("week_template_id");

        if (slotError) throw slotError;

        const { data: focusData, error: focusError } = await supabase
          .from("week_focus_types")
          .select("id, name, color")
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true });

        if (focusError) throw focusError;

        const countMap: Record<string, number> = {};
        for (const row of (slotData ?? []) as { week_template_id: string }[]) {
          countMap[row.week_template_id] = (countMap[row.week_template_id] ?? 0) + 1;
        }

        setTemplates((templateData ?? []) as WeekTemplateWithFocus[]);
        setSlotCounts(countMap);
        setFocusTypes((focusData ?? []) as WeekFocusTypeRow[]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error loading week templates.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadWeekTemplates();
  }, []);

  const filteredTemplates = useMemo(() => {
    let result = templates;

    // Search filter
    const needle = search.trim().toLowerCase();
    if (needle) {
      result = result.filter((template) => {
        const focus = asSingleFocusType(template.week_focus_types);
        return (
          template.name.toLowerCase().includes(needle) ||
          (template.description ?? "").toLowerCase().includes(needle) ||
          (focus?.name ?? "").toLowerCase().includes(needle)
        );
      });
    }

    // Active filter
    if (activeFilter === "active") {
      result = result.filter((t) => t.is_active);
    } else if (activeFilter === "inactive") {
      result = result.filter((t) => !t.is_active);
    }

    // Custom filter
    if (customFilter === "system") {
      result = result.filter((t) => !t.is_custom);
    } else if (customFilter === "custom") {
      result = result.filter((t) => t.is_custom);
    }

    // Purpose filter
    if (purposeFilter) {
      result = result.filter((t) => t.training_purpose === purposeFilter);
    }

    // Focus filter
    if (focusFilter) {
      result = result.filter((t) => t.focus_type_id === focusFilter);
    }

    // Condition tags filter
    if (conditionFilter.length > 0) {
      result = result.filter((t) => {
        const tags = t.condition_tags ?? [];
        return conditionFilter.some((filter) => tags.includes(filter));
      });
    }

    return result;
  }, [search, templates, activeFilter, customFilter, purposeFilter, focusFilter, conditionFilter]);

  const hasActiveFilters =
    activeFilter !== "all" ||
    customFilter !== "all" ||
    purposeFilter ||
    focusFilter ||
    conditionFilter.length > 0;

  const uniquePurposes = useMemo(() => {
    const purposes = new Set<string>();
    templates.forEach((t) => {
      if (t.training_purpose) purposes.add(t.training_purpose);
    });
    return Array.from(purposes).sort();
  }, [templates]);

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
              <span>Week Template Library</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-black">
              Week Template Library
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Reusable week structures built from session templates. Browse and select
              templates when building athlete training plans.
            </p>
          </div>

          {isAdmin && (
            <Link
              href="/coach/week-templates/create"
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              New template
            </Link>
          )}
        </div>

        <div className="mb-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              Search
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, description or focus"
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Status
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    activeFilter === "all"
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveFilter("active")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    activeFilter === "active"
                      ? "bg-emerald-600 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Active
                </button>
                <button
                  onClick={() => setActiveFilter("inactive")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    activeFilter === "inactive"
                      ? "bg-zinc-500 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Inactive
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Type
              </label>
              <div className="flex gap-1">
                <button
                  onClick={() => setCustomFilter("all")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    customFilter === "all"
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setCustomFilter("system")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    customFilter === "system"
                      ? "bg-blue-600 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  System
                </button>
                <button
                  onClick={() => setCustomFilter("custom")}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    customFilter === "custom"
                      ? "bg-purple-600 text-white"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Purpose
              </label>
              <select
                value={purposeFilter}
                onChange={(e) => setPurposeFilter(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs outline-none transition focus:border-zinc-500"
              >
                <option value="">All</option>
                {uniquePurposes.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Focus
              </label>
              <select
                value={focusFilter}
                onChange={(e) => setFocusFilter(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs outline-none transition focus:border-zinc-500"
              >
                <option value="">All</option>
                {focusTypes.map((focus) => (
                  <option key={focus.id} value={focus.id}>
                    {focus.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {conditionTagOptions.some((opt) =>
            templates.some((t) => (t.condition_tags ?? []).includes(opt.value)),
          ) && (
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Race Conditions
              </label>
              <div className="flex flex-wrap gap-2">
                {conditionTagOptions.map((option) => {
                  const isUsed = templates.some((t) =>
                    (t.condition_tags ?? []).includes(option.value),
                  );
                  const isSelected = conditionFilter.includes(option.value);

                  if (!isUsed) return null;

                  return (
                    <button
                      key={option.value}
                      onClick={() =>
                        setConditionFilter((prev) =>
                          prev.includes(option.value)
                            ? prev.filter((v) => v !== option.value)
                            : [...prev, option.value],
                        )
                      }
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        isSelected
                          ? "bg-orange-600 text-white"
                          : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasActiveFilters && (
            <button
              onClick={() => {
                setActiveFilter("all");
                setCustomFilter("all");
                setPurposeFilter("");
                setFocusFilter("");
                setConditionFilter([]);
                setSearch("");
              }}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            Loading week templates...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
            {templates.length === 0
              ? "No week templates in the library yet."
              : "No templates match the current filters. Try clearing some filters."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Focus
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Purpose
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Slots
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Active
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Updated
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-200">
                  {filteredTemplates.map((template) => {
                    const focus = asSingleFocusType(template.week_focus_types);
                    const slotCount = slotCounts[template.id] ?? 0;

                    return (
                      <tr key={template.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-semibold text-zinc-900">
                            {template.name}
                          </div>
                          {template.description ? (
                            <div className="mt-1 max-w-md text-sm text-zinc-600">
                              {template.description}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-4 py-4 align-top">
                          {focus ? (
                            <span
                              className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                              style={{
                                backgroundColor: focus.color
                                  ? `${focus.color}22`
                                  : undefined,
                                color: focus.color ?? undefined,
                              }}
                            >
                              {focus.name}
                            </span>
                          ) : (
                            <span className="text-sm text-zinc-500">None</span>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-zinc-600">
                          {template.training_purpose ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                              {template.training_purpose}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-zinc-700">
                          {slotCount}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              template.is_active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-zinc-100 text-zinc-600"
                            }`}
                          >
                            {template.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-4 py-4 align-top text-sm text-zinc-600">
                          {new Date(template.updated_at).toLocaleString()}
                        </td>

                        <td className="px-4 py-4 align-top">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/coach/week-templates/${template.id}/view`}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              View
                            </Link>
                            {isAdmin && (
                              <Link
                                href={`/coach/week-templates/${template.id}/edit`}
                                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                              >
                                Edit
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

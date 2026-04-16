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

export default function WeekTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WeekTemplateWithFocus[]>([]);
  const [slotCounts, setSlotCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

        const countMap: Record<string, number> = {};
        for (const row of (slotData ?? []) as { week_template_id: string }[]) {
          countMap[row.week_template_id] = (countMap[row.week_template_id] ?? 0) + 1;
        }

        setTemplates((templateData ?? []) as WeekTemplateWithFocus[]);
        setSlotCounts(countMap);
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
    const needle = search.trim().toLowerCase();

    if (!needle) return templates;

    return templates.filter((template) => {
      const focus = asSingleFocusType(template.week_focus_types);

      return (
        template.name.toLowerCase().includes(needle) ||
        (template.description ?? "").toLowerCase().includes(needle) ||
        (focus?.name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [search, templates]);

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
              <span>Week Templates</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-black">
              Week Templates
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-600">
              Create reusable weeks made up of specific session templates, then use
              them later when building full plans.
            </p>
          </div>

          <Link
            href="/coach/week-templates/create"
            className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            New week template
          </Link>
        </div>

        <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-zinc-700">
            Search templates
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, description or focus"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
          />
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
            No week templates found.
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
                            <Link
                              href={`/coach/week-templates/${template.id}/edit`}
                              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
                            >
                              Edit
                            </Link>
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
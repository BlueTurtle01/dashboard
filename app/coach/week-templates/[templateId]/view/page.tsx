"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type WeekTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  focus_type_id: string | null;
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
  type: string | null;
  subtype: string | null;
  activity: string | null;
  target_intensity: string | null;
  duration_minutes: number | null;
  distance_km: number | null;
  is_key_session: boolean;
};

type WeekTemplateSlotRow = {
  id: string;
  week_template_id: string;
  slot_name: string;
  session_template_id: string;
  is_required: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  session_templates: SessionTemplateRow | SessionTemplateRow[] | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function asSingleSessionTemplate(
  value: SessionTemplateRow | SessionTemplateRow[] | null,
): SessionTemplateRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function formatSessionSummary(session: SessionTemplateRow | null): string {
  if (!session) return "Session template not found";

  const parts: string[] = [];

  if (session.type) parts.push(session.type);
  if (session.subtype) parts.push(session.subtype);
  if (session.activity) parts.push(session.activity);
  if (session.duration_minutes) parts.push(`${session.duration_minutes} min`);
  if (session.distance_km) parts.push(`${session.distance_km} km`);
  if (session.target_intensity) parts.push(session.target_intensity);
  if (session.is_key_session) parts.push("Key session");

  return parts.length > 0 ? parts.join(" • ") : "No additional details";
}

export default function WeekTemplateViewPage() {
  const params = useParams<{ templateId: string }>();
  const templateId = params?.templateId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [template, setTemplate] = useState<WeekTemplateRow | null>(null);
  const [focusType, setFocusType] = useState<WeekFocusTypeRow | null>(null);
  const [slots, setSlots] = useState<WeekTemplateSlotRow[]>([]);

  useEffect(() => {
    async function loadTemplate() {
      if (!templateId) {
        setError("No week template id provided.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: templateData, error: templateError } = await supabase
          .from("week_templates")
          .select("*")
          .eq("id", templateId)
          .single();

        if (templateError) throw templateError;
        if (!templateData) {
          setError("No week template found.");
          setLoading(false);
          return;
        }

        setTemplate(templateData);

        if (templateData.focus_type_id) {
          const { data: focusData, error: focusError } = await supabase
            .from("week_focus_types")
            .select("id, name, color")
            .eq("id", templateData.focus_type_id)
            .single();

          if (focusError) throw focusError;
          setFocusType(focusData);
        } else {
          setFocusType(null);
        }

        const { data: slotData, error: slotError } = await supabase
          .from("week_template_slots")
          .select(
            `
              id,
              week_template_id,
              slot_name,
              session_template_id,
              is_required,
              sort_order,
              notes,
              created_at,
              updated_at,
              session_templates (
                id,
                name,
                type,
                subtype,
                activity,
                target_intensity,
                duration_minutes,
                distance_km,
                is_key_session
              )
            `,
          )
          .eq("week_template_id", templateId)
          .order("sort_order", { ascending: true });

        if (slotError) throw slotError;
        setSlots((slotData ?? []) as WeekTemplateSlotRow[]);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error loading week template.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadTemplate();
  }, [templateId]);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.sort_order - b.sort_order),
    [slots],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-5xl p-6">
          <p className="text-sm text-zinc-600">Loading week template...</p>
        </div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-5xl p-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error ?? "No week template found."}
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

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 text-sm text-zinc-500">
              <Link href="/coach/week-templates" className="hover:underline">
                Week Template Library
              </Link>
              <span className="mx-2">/</span>
              <span>View</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-black">
              {template.name}
            </h1>

            {template.description ? (
              <p className="mt-2 max-w-3xl text-sm text-zinc-600">{template.description}</p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <Link
              href={`/coach/week-templates/${template.id}/edit`}
              className="inline-flex rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Edit template
            </Link>
            <Link
              href="/coach/week-templates"
              className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Focus
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-900">
              {focusType?.name ?? "None"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Active
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-900">
              {template.is_active ? "Yes" : "No"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Custom
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-900">
              {template.is_custom ? "Yes" : "No"}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Slots
            </div>
            <div className="mt-2 text-sm font-medium text-zinc-900">
              {sortedSlots.length}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-black">Week slots</h2>
          </div>

          {sortedSlots.length === 0 ? (
            <div className="px-5 py-6 text-sm text-zinc-600">
              No slots have been added to this week template yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-200">
              {sortedSlots.map((slot) => {
                const session = asSingleSessionTemplate(slot.session_templates);

                return (
                  <div key={slot.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">
                          {slot.sort_order}. {slot.slot_name}
                        </div>
                        <div className="mt-1 text-sm text-zinc-700">
                          {session?.name ?? "Unknown session template"}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {formatSessionSummary(session)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            slot.is_required
                              ? "bg-zinc-900 text-white"
                              : "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {slot.is_required ? "Required" : "Optional"}
                        </span>

                        {session?.is_key_session ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                            Key session
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {slot.notes ? (
                      <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-sm text-zinc-700">
                        {slot.notes}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SessionActivityRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number | null;
  is_active: boolean;
};

type SessionSubtypeRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number | null;
  is_active: boolean;
};

type SessionActivitySubtypeRow = {
  activity_id: string;
  subtype_id: string;
  sort_order: number | null;
};

function makeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function SessionOptionsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [savingActivity, setSavingActivity] = useState(false);
  const [savingSubtype, setSavingSubtype] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [activities, setActivities] = useState<SessionActivityRow[]>([]);
  const [subtypes, setSubtypes] = useState<SessionSubtypeRow[]>([]);
  const [links, setLinks] = useState<SessionActivitySubtypeRow[]>([]);

  const [activityLabel, setActivityLabel] = useState("");
  const [activitySortOrder, setActivitySortOrder] = useState("");

  const [subtypeLabel, setSubtypeLabel] = useState("");
  const [subtypeSortOrder, setSubtypeSortOrder] = useState("");

  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedSubtypeId, setSelectedSubtypeId] = useState("");
  const [linkSortOrder, setLinkSortOrder] = useState("");

  async function loadData() {
    setLoading(true);

    const [activitiesResult, subtypesResult, linksResult] = await Promise.all([
      supabase
        .from("session_activities")
        .select("id, slug, label, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      supabase
        .from("session_subtypes")
        .select("id, slug, label, sort_order, is_active")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
      supabase
        .from("session_activity_subtypes")
        .select("activity_id, subtype_id, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    if (activitiesResult.error) {
      setStatusMessage(`Failed to load activities: ${activitiesResult.error.message}`);
      setLoading(false);
      return;
    }

    if (subtypesResult.error) {
      setStatusMessage(`Failed to load subtypes: ${subtypesResult.error.message}`);
      setLoading(false);
      return;
    }

    if (linksResult.error) {
      setStatusMessage(`Failed to load mappings: ${linksResult.error.message}`);
      setLoading(false);
      return;
    }

    const loadedActivities = (activitiesResult.data ?? []) as SessionActivityRow[];
    const loadedSubtypes = (subtypesResult.data ?? []) as SessionSubtypeRow[];
    const loadedLinks = (linksResult.data ?? []) as SessionActivitySubtypeRow[];

    setActivities(loadedActivities);
    setSubtypes(loadedSubtypes);
    setLinks(loadedLinks);

    if (!selectedActivityId && loadedActivities.length > 0) {
      setSelectedActivityId(loadedActivities[0].id);
    }

    if (!selectedSubtypeId && loadedSubtypes.length > 0) {
      setSelectedSubtypeId(loadedSubtypes[0].id);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  function showTemporaryStatus(message: string, timeoutMs = 2500) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(""), timeoutMs);
  }

  async function handleAddActivity() {
    const trimmedLabel = activityLabel.trim();
    const slug = makeSlug(trimmedLabel);

    if (!trimmedLabel || !slug) {
      showTemporaryStatus("Activity label is required.");
      return;
    }

    setSavingActivity(true);

    const { error } = await supabase.from("session_activities").insert({
      label: trimmedLabel,
      slug,
      sort_order: activitySortOrder.trim() ? Number(activitySortOrder) : 0,
      is_active: true,
    });

    setSavingActivity(false);

    if (error) {
      showTemporaryStatus(`Could not create activity: ${error.message}`, 4000);
      return;
    }

    setActivityLabel("");
    setActivitySortOrder("");
    await loadData();
    showTemporaryStatus("Activity added.");
  }

  async function handleAddSubtype() {
    const trimmedLabel = subtypeLabel.trim();
    const slug = makeSlug(trimmedLabel);

    if (!trimmedLabel || !slug) {
      showTemporaryStatus("Subtype label is required.");
      return;
    }

    setSavingSubtype(true);

    const { error } = await supabase.from("session_subtypes").insert({
      label: trimmedLabel,
      slug,
      sort_order: subtypeSortOrder.trim() ? Number(subtypeSortOrder) : 0,
      is_active: true,
    });

    setSavingSubtype(false);

    if (error) {
      showTemporaryStatus(`Could not create subtype: ${error.message}`, 4000);
      return;
    }

    setSubtypeLabel("");
    setSubtypeSortOrder("");
    await loadData();
    showTemporaryStatus("Subtype added.");
  }

  async function handleAddMapping() {
    if (!selectedActivityId || !selectedSubtypeId) {
      showTemporaryStatus("Select both an activity and a subtype.");
      return;
    }

    setSavingLink(true);

    const { error } = await supabase.from("session_activity_subtypes").insert({
      activity_id: selectedActivityId,
      subtype_id: selectedSubtypeId,
      sort_order: linkSortOrder.trim() ? Number(linkSortOrder) : 0,
    });

    setSavingLink(false);

    if (error) {
      showTemporaryStatus(`Could not create mapping: ${error.message}`, 4000);
      return;
    }

    setLinkSortOrder("");
    await loadData();
    showTemporaryStatus("Mapping added.");
  }

  async function handleDeleteMapping(activityId: string, subtypeId: string) {
    const { error } = await supabase
      .from("session_activity_subtypes")
      .delete()
      .eq("activity_id", activityId)
      .eq("subtype_id", subtypeId);

    if (error) {
      showTemporaryStatus(`Could not delete mapping: ${error.message}`, 4000);
      return;
    }

    await loadData();
    showTemporaryStatus("Mapping deleted.");
  }

  const activityById = useMemo(
    () => new Map(activities.map((row) => [row.id, row])),
    [activities],
  );

  const subtypeById = useMemo(
    () => new Map(subtypes.map((row) => [row.id, row])),
    [subtypes],
  );

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Session Option Admin</h1>
          <p className="mt-3 max-w-3xl text-zinc-600">
            Add functional session activities, subtypes, and valid activity/subtype combinations.
          </p>
        </div>

        {statusMessage ? (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            {statusMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            Loading...
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[420px_420px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Add Activity</h2>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Label</span>
                  <input
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={activityLabel}
                    onChange={(e) => setActivityLabel(e.target.value)}
                    placeholder="e.g. Run"
                  />
                </label>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  Slug: {makeSlug(activityLabel) || "—"}
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Sort order</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={activitySortOrder}
                    onChange={(e) => setActivitySortOrder(e.target.value)}
                    placeholder="10"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleAddActivity()}
                  disabled={savingActivity}
                  className="rounded-xl border border-zinc-900 bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
                >
                  {savingActivity ? "Saving..." : "Add Activity"}
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Existing Activities
                </h3>
                <div className="mt-3 space-y-2">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm"
                    >
                      <div className="font-semibold text-zinc-900">{activity.label}</div>
                      <div className="mt-1 text-zinc-600">
                        {activity.slug} · order {activity.sort_order ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Add Subtype</h2>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Label</span>
                  <input
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={subtypeLabel}
                    onChange={(e) => setSubtypeLabel(e.target.value)}
                    placeholder="e.g. Threshold"
                  />
                </label>

                <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  Slug: {makeSlug(subtypeLabel) || "—"}
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Sort order</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={subtypeSortOrder}
                    onChange={(e) => setSubtypeSortOrder(e.target.value)}
                    placeholder="10"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleAddSubtype()}
                  disabled={savingSubtype}
                  className="rounded-xl border border-zinc-900 bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
                >
                  {savingSubtype ? "Saving..." : "Add Subtype"}
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Existing Subtypes
                </h3>
                <div className="mt-3 space-y-2">
                  {subtypes.map((subtype) => (
                    <div
                      key={subtype.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm"
                    >
                      <div className="font-semibold text-zinc-900">{subtype.label}</div>
                      <div className="mt-1 text-zinc-600">
                        {subtype.slug} · order {subtype.sort_order ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">Map Activity to Subtype</h2>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Activity</span>
                  <select
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={selectedActivityId}
                    onChange={(e) => setSelectedActivityId(e.target.value)}
                  >
                    <option value="">Select activity</option>
                    {activities.map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Subtype</span>
                  <select
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={selectedSubtypeId}
                    onChange={(e) => setSelectedSubtypeId(e.target.value)}
                  >
                    <option value="">Select subtype</option>
                    {subtypes.map((subtype) => (
                      <option key={subtype.id} value={subtype.id}>
                        {subtype.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-zinc-900">Sort order</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm"
                    value={linkSortOrder}
                    onChange={(e) => setLinkSortOrder(e.target.value)}
                    placeholder="10"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleAddMapping()}
                  disabled={savingLink}
                  className="rounded-xl border border-zinc-900 bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
                >
                  {savingLink ? "Saving..." : "Add Mapping"}
                </button>
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                  Existing Mappings
                </h3>
                <div className="mt-3 space-y-2">
                  {links.map((link) => {
                    const activity = activityById.get(link.activity_id);
                    const subtype = subtypeById.get(link.subtype_id);

                    return (
                      <div
                        key={`${link.activity_id}-${link.subtype_id}`}
                        className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm"
                      >
                        <div>
                          <div className="font-semibold text-zinc-900">
                            {activity?.label ?? formatLabel(link.activity_id)} →{" "}
                            {subtype?.label ?? formatLabel(link.subtype_id)}
                          </div>
                          <div className="mt-1 text-zinc-600">
                            order {link.sort_order ?? 0}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleDeleteMapping(link.activity_id, link.subtype_id)}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
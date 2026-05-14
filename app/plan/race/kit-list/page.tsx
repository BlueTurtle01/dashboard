"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLinkedRace, type Race } from "../race-data";

type KitItem = {
  id: number;
  item_name: string;
  brand: string | null;
  category: string;
  description: string | null;
  is_essential: boolean;
  notes: string | null;
  race_id: string | null;
};

export default function RaceKitListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [race, setRace] = useState<Race | null>(null);
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadRaceKitList() {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Unable to authenticate.");
        setLoading(false);
        return;
      }

      const linkedRace = await getLinkedRace(supabase, user.id);

      if (!linkedRace) {
        setError("No race is linked to your active plan yet.");
        setLoading(false);
        return;
      }

      setRace(linkedRace);

      const { data: items, error: kitError } = await supabase
        .from("kit_list")
        .select("id, item_name, brand, category, description, is_essential, notes, race_id")
        .or(`race_id.is.null,race_id.eq.${linkedRace.id}`)
        .order("category")
        .order("is_essential", { ascending: false })
        .order("item_name");

      if (kitError) {
        setError(`Failed to load kit list: ${kitError.message}`);
        setLoading(false);
        return;
      }

      setKitItems((items ?? []) as KitItem[]);

      const stored = window.localStorage.getItem(`race-kit:${linkedRace.id}`);
      if (stored) {
        try {
          const ids = JSON.parse(stored) as number[];
          setCheckedItems(new Set(ids));
        } catch {
          setCheckedItems(new Set());
        }
      }

      setLoading(false);
    }

    void loadRaceKitList();
  }, []);

  useEffect(() => {
    if (!race) return;
    window.localStorage.setItem(`race-kit:${race.id}`, JSON.stringify([...checkedItems]));
  }, [checkedItems, race]);

  const groupedItems = useMemo(() => {
    return kitItems.reduce<Record<string, KitItem[]>>((groups, item) => {
      const category = item.category || "Other";
      groups[category] = groups[category] ?? [];
      groups[category].push(item);
      return groups;
    }, {});
  }, [kitItems]);

  const categories = Object.keys(groupedItems).sort();
  const checkedCount = checkedItems.size;
  const totalCount = kitItems.length;

  function toggleItem(itemId: number) {
    setCheckedItems((previous) => {
      const next = new Set(previous);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-600">Loading race kit list...</p>
        </div>
      </div>
    );
  }

  if (error || !race) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h1 className="text-lg font-semibold text-red-950">Race Kit List</h1>
          <p className="mt-2 text-sm text-red-800">{error || "Unable to load race."}</p>
          <Link href="/plan/race" className="mt-4 inline-flex text-sm font-semibold text-red-950">
            Back to Race
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="space-y-5">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <Link href="/plan/race" className="text-sm font-semibold text-zinc-600">
            Back to Race
          </Link>
          <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Race Kit List</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-950">{race.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
            {race.location && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.location}</span>}
            {race.distance_km && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.distance_km} km</span>}
            {race.terrain_type && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.terrain_type}</span>}
          </div>
          <div className="mt-5 rounded-xl bg-zinc-950 px-4 py-3 text-white">
            <p className="text-sm font-semibold">
              {checkedCount} of {totalCount} packed
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: totalCount ? `${Math.round((checkedCount / totalCount) * 100)}%` : "0%" }}
              />
            </div>
          </div>
        </section>

        {categories.length === 0 ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-600">No kit list has been added for this race yet.</p>
          </section>
        ) : (
          categories.map((category) => (
            <section key={category} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h2 className="text-base font-semibold text-zinc-950">{category}</h2>
              <div className="mt-4 divide-y divide-zinc-100">
                {groupedItems[category].map((item) => {
                  const checked = checkedItems.has(item.id);
                  return (
                    <label key={item.id} className="flex gap-3 py-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(item.id)}
                        className="mt-1 h-5 w-5 rounded border-zinc-300 accent-zinc-950"
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${checked ? "text-zinc-400 line-through" : "text-zinc-950"}`}>
                          {item.item_name}
                        </span>
                        {item.brand && <span className="mt-1 block text-xs text-zinc-500">Brand: {item.brand}</span>}
                        {item.description && <span className="mt-1 block text-sm text-zinc-600">{item.description}</span>}
                        {item.notes && <span className="mt-1 block text-xs text-zinc-500">{item.notes}</span>}
                        <span className="mt-2 flex gap-2">
                          {item.is_essential && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                              Essential
                            </span>
                          )}
                          {item.race_id && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              Race specific
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

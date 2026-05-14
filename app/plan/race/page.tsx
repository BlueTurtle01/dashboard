"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getLinkedRace, type Race } from "./race-data";

export default function RacePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [race, setRace] = useState<Race | null>(null);

  useEffect(() => {
    async function loadRace() {
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
      setLoading(false);
    }

    void loadRace();
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-sm text-zinc-600">Loading race...</p>
        </div>
      </div>
    );
  }

  if (error || !race) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <h1 className="text-lg font-semibold text-red-950">Race</h1>
          <p className="mt-2 text-sm text-red-800">{error || "Unable to load race."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="space-y-5">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your Race</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-950">{race.name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
            {race.location && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.location}</span>}
            {race.distance_km && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.distance_km} km</span>}
            {race.terrain_type && <span className="rounded-full bg-zinc-100 px-3 py-1">{race.terrain_type}</span>}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-base font-semibold text-zinc-950">Race tools</h2>
          <div className="mt-4 divide-y divide-zinc-100">
            <Link href="/plan/race/kit-list" className="flex items-center justify-between gap-4 py-4">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-950">Kit List</span>
                <span className="mt-1 block text-sm text-zinc-600">
                  Check off the essentials and race-specific items for {race.name}.
                </span>
              </span>
              <span className="shrink-0 text-xl text-zinc-400" aria-hidden="true">
                &rsaquo;
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

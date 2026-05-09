"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Race = {
  id: string;
  name: string;
  slug: string;
  location: string | null;
};

type SegmentTag = {
  tag: string;
  start_km: number;
  end_km: number;
};

type RaceWithSegments = Race & {
  segments: SegmentTag[];
  uniqueTags: string[];
};

async function fetchRacesWithSegmentTags(): Promise<RaceWithSegments[]> {
  const supabase = createClient();

  const { data: races, error: racesError } = await supabase
    .from("races")
    .select("id, name, slug, location")
    .order("name", { ascending: true });

  if (racesError || !races) {
    throw new Error(`Failed to fetch races: ${racesError?.message}`);
  }

  const { data: allSegmentTags, error: tagsError } = await supabase
    .from("race_segment_tags")
    .select("race_id, tag, start_km, end_km")
    .order("start_km", { ascending: true });

  if (tagsError) {
    throw new Error(`Failed to fetch segment tags: ${tagsError.message}`);
  }

  const tagsByRaceId = new Map<string, SegmentTag[]>();
  for (const row of (allSegmentTags ?? []) as any[]) {
    const raceId = row.race_id;
    if (!tagsByRaceId.has(raceId)) {
      tagsByRaceId.set(raceId, []);
    }
    tagsByRaceId.get(raceId)!.push({
      tag: row.tag,
      start_km: Number(row.start_km),
      end_km: Number(row.end_km),
    });
  }

  return (races as Race[]).map((race) => {
    const segments = tagsByRaceId.get(race.id) ?? [];
    const uniqueTags = Array.from(new Set(segments.map((s) => s.tag))).sort();
    return {
      ...race,
      segments,
      uniqueTags,
    };
  });
}

export default function RaceSegmentTagsPage() {
  const [races, setRaces] = useState<RaceWithSegments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRaceId, setExpandedRaceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchRacesWithSegmentTags();
        if (!cancelled) {
          setRaces(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load races");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Race Segment Training Tags
          </h1>
          <p className="mt-2 text-zinc-600">
            View training focus tags assigned to elevation segments across all races. Use these to understand what
            training adaptations athletes need for specific race courses.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-center text-zinc-500">Loading races...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <p className="text-red-900">{error}</p>
          </div>
        ) : races.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-center text-zinc-500">No races found with segment tags.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {races.map((race) => (
              <div key={race.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <button
                  onClick={() =>
                    setExpandedRaceId(expandedRaceId === race.id ? null : race.id)
                  }
                  className="w-full px-6 py-4 text-left hover:bg-zinc-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-zinc-900">{race.name}</h2>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {race.uniqueTags.length > 0 ? (
                          race.uniqueTags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-900"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-zinc-500">No segment tags</span>
                        )}
                      </div>
                      {race.location && (
                        <p className="mt-1 text-sm text-zinc-600">{race.location}</p>
                      )}
                    </div>
                    <div className="ml-4 shrink-0">
                      <div className="text-sm font-semibold text-zinc-500">
                        {race.segments.length} segments
                      </div>
                      <div className="text-xs text-zinc-400">
                        {expandedRaceId === race.id ? "Hide" : "View"}
                      </div>
                    </div>
                  </div>
                </button>

                {expandedRaceId === race.id && race.segments.length > 0 && (
                  <div className="border-t border-zinc-200 px-6 py-4">
                    <div className="space-y-3">
                      {race.segments.map((segment, index) => (
                        <div
                          key={`${segment.start_km}-${segment.end_km}-${segment.tag}-${index}`}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">
                                {segment.start_km}–{segment.end_km} km
                              </div>
                              <div className="mt-1">
                                <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                                  {segment.tag}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 pt-8 border-t border-zinc-200">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
          >
            ← Back to Admin
          </Link>
        </div>
      </div>
    </main>
  );
}

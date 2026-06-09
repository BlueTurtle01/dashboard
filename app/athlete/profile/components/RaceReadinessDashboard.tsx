"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OverviewTab } from "./OverviewTab";
import { DemandsTab } from "./DemandsTab";

const supabase = createClient();

type RaceOption = {
  id: string;
  name: string;
  distance_km: number | null;
  location: string | null;
  terrain_type: string | null;
};

type Props = {
  userId: string;
};

export function RaceReadinessDashboard({ userId }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [nextGoalRaceId, setNextGoalRaceId] = useState<string | null>(null);
  const [selectedRace, setSelectedRace] = useState<RaceOption | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "demands">("overview");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RaceOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: profile } = await supabase
        .from("athlete_profiles")
        .select("next_goal_race_id, display_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (profile) {
        setDisplayName(profile.display_name ?? "");
        setDisplayNameInput(profile.display_name ?? "");
        if (profile.next_goal_race_id) {
          setNextGoalRaceId(profile.next_goal_race_id);
          const { data: race } = await supabase
            .from("races")
            .select("id, name, distance_km, location, terrain_type")
            .eq("id", profile.next_goal_race_id)
            .maybeSingle();
          setSelectedRace(race ?? null);
        }
      }
      setLoading(false);
    }
    load();
  }, [userId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from("races")
        .select("id, name, distance_km, location, terrain_type")
        .ilike("name", `%${searchQuery}%`)
        .order("name")
        .limit(10);
      setSearchResults((data ?? []) as RaceOption[]);
      setIsSearching(false);
    }, 300);
  }, [searchQuery]);

  async function selectRace(race: RaceOption) {
    setSelectedRace(race);
    setNextGoalRaceId(race.id);
    setSearchQuery("");
    setSearchResults([]);
    await supabase
      .from("athlete_profiles")
      .upsert({ user_id: userId, next_goal_race_id: race.id }, { onConflict: "user_id" });
  }

  async function saveDisplayName() {
    const trimmed = displayNameInput.trim();
    if (trimmed === displayName) return;
    setSavingName(true);
    await supabase
      .from("athlete_profiles")
      .upsert({ user_id: userId, display_name: trimmed || null }, { onConflict: "user_id" });
    setDisplayName(trimmed);
    setSavingName(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
        Loading race readiness...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Testing banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Testing mode — display name</p>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            onBlur={saveDisplayName}
            placeholder="e.g. Jane Smith"
            className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {savingName && <span className="text-xs text-amber-600">Saving…</span>}
          {displayName && !savingName && (
            <span className="text-xs text-amber-700 font-medium">Viewing as: {displayName}</span>
          )}
        </div>
      </div>

      {/* Goal race selector */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Next Goal Race</h2>

        {selectedRace ? (
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <div>
              <p className="font-semibold text-zinc-900">{selectedRace.name}</p>
              <p className="text-sm text-zinc-500">
                {[
                  selectedRace.distance_km ? `${selectedRace.distance_km} km` : null,
                  selectedRace.location,
                  selectedRace.terrain_type,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedRace(null);
                setNextGoalRaceId(null);
                setSearchQuery("");
              }}
              className="text-sm font-medium text-zinc-500 hover:text-zinc-900 underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for your goal race…"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
            {isSearching && (
              <p className="mt-2 text-xs text-zinc-400">Searching…</p>
            )}
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
                {searchResults.map((race) => (
                  <button
                    key={race.id}
                    onClick={() => selectRace(race)}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-50 border-b border-zinc-100 last:border-0 transition-colors"
                  >
                    <p className="text-sm font-medium text-zinc-900">{race.name}</p>
                    <p className="text-xs text-zinc-500">
                      {[
                        race.distance_km ? `${race.distance_km} km` : null,
                        race.location,
                        race.terrain_type,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
              <p className="mt-2 text-xs text-zinc-400">No races found for "{searchQuery}"</p>
            )}
          </div>
        )}
      </div>

      {/* Sub-tabs and content — only shown once a race is selected */}
      {selectedRace && nextGoalRaceId && (
        <>
          <div className="flex gap-1 border-b border-zinc-200">
            <button
              onClick={() => setActiveSubTab("overview")}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeSubTab === "overview"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveSubTab("demands")}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeSubTab === "demands"
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Demands
            </button>
          </div>

          {activeSubTab === "overview" && (
            <OverviewTab raceId={nextGoalRaceId} race={selectedRace} />
          )}
          {activeSubTab === "demands" && (
            <DemandsTab raceId={nextGoalRaceId} />
          )}
        </>
      )}
    </div>
  );
}

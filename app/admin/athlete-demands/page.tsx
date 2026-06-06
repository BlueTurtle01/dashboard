"use client";

import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AthleteSearchHit {
  athlete_key: string;
  race_count: number;
  first_result_year: number | null;
  last_result_year: number | null;
}

interface Race {
  race_id: string;
  race_name: string;
  result_year: number;
  result_status: string;
  finish_seconds: number | null;
  position: number | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  flat_equivalent_km: number | null;
  total_finishers: number | null;
}

interface AthleteData {
  profile: {
    athlete_key: string;
    gender: string | null;
    age_group: string | null;
    club: string | null;
    race_count: number;
    finish_count: number;
  };
  races: Race[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function fmtDist(km: number | null): string {
  return km != null ? `${km.toFixed(1)} km` : "—";
}

function fmtAscent(m: number | null): string {
  return m != null ? `${Math.round(m).toLocaleString()} m` : "—";
}

function pct(val: number | null, max: number): number {
  if (val == null || max === 0) return 0;
  return Math.round((val / max) * 100);
}

const CURRENT_YEAR = new Date().getFullYear();

// ── Demand bar ────────────────────────────────────────────────────────────────

function Bar({ value, max, color }: { value: number | null; max: number; color: string }) {
  const p = pct(value, max);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{p}%</span>
    </div>
  );
}

// ── Athlete search combobox ───────────────────────────────────────────────────

function AthleteSearch({ onSelect }: { onSelect: (key: string) => void }) {
  const [query, setQuery]       = useState("");
  const [hits, setHits]         = useState<AthleteSearchHit[]>([]);
  const [open, setOpen]         = useState(false);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    if (value.trim().length < 2) { setHits([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(value.trim())}&limit=10`);
        if (res.ok) {
          const json = await res.json() as { athletes: AthleteSearchHit[] };
          setHits(json.athletes ?? []);
          setOpen(true);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
  }

  function select(hit: AthleteSearchHit) {
    setQuery(hit.athlete_key);
    setOpen(false);
    setHits([]);
    onSelect(hit.athlete_key);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder="Search athlete name…"
        onChange={e => handleInput(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        className="w-72 border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
      />
      {searching && <span className="absolute right-3 top-2.5 text-xs text-zinc-400">…</span>}
      {open && hits.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-80 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {hits.map(h => (
            <button
              key={h.athlete_key}
              type="button"
              onClick={() => select(h)}
              className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 border-b border-zinc-100 last:border-0"
            >
              <div className="text-sm font-semibold text-zinc-800">{h.athlete_key}</div>
              <div className="text-xs text-zinc-400 mt-0.5 flex gap-3">
                <span>{h.race_count} race{h.race_count !== 1 ? "s" : ""}</span>
                {h.first_result_year && (
                  <span>{h.first_result_year}{h.last_result_year && h.last_result_year !== h.first_result_year ? `–${h.last_result_year}` : ""}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Demand card ───────────────────────────────────────────────────────────────

function DemandCard({ label, allTime, recent, unit }: { label: string; allTime: string; recent: string | null; unit?: string }) {
  return (
    <div className="border border-zinc-200 rounded-xl p-4 bg-white">
      <div className="text-xs text-zinc-400 uppercase tracking-wide font-medium mb-2">{label}</div>
      <div className="text-xl font-bold text-zinc-900">{allTime}{unit ? <span className="text-sm font-normal text-zinc-500 ml-1">{unit}</span> : null}</div>
      {recent !== null && (
        <div className="text-xs text-zinc-400 mt-1">Last 2 yrs: <span className="text-zinc-600 font-medium">{recent}{unit ? ` ${unit}` : ""}</span></div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AthleteDemandsPage() {
  const [athleteData, setAthleteData] = useState<AthleteData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState("");

  async function loadAthlete(key: string) {
    setSelectedKey(key);
    setLoading(true);
    setError(null);
    setAthleteData(null);
    try {
      const res = await fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(key)}`);
      const json = await res.json() as AthleteData & { error?: string };
      if (!res.ok || json.error) { setError(json.error ?? "Failed to load athlete"); return; }
      setAthleteData(json);
    } catch { setError("Network error"); }
    finally   { setLoading(false); }
  }

  // Only finished races with at least a distance figure are useful for demand analysis
  const finished = (athleteData?.races ?? [])
    .filter(r => r.result_status === "FINISHED" && r.finish_seconds != null)
    .sort((a, b) => b.result_year - a.result_year || (b.finish_seconds ?? 0) - (a.finish_seconds ?? 0));

  const recentFinished = finished.filter(r => r.result_year >= CURRENT_YEAR - 2);

  // ── Demand maxima ──────────────────────────────────────────────────────────
  const maxDist    = Math.max(0, ...finished.map(r => r.total_distance_km    ?? 0));
  const maxAscent  = Math.max(0, ...finished.map(r => r.total_ascent_m      ?? 0));
  const maxFlatEq  = Math.max(0, ...finished.map(r => r.flat_equivalent_km  ?? 0));
  const maxTime    = Math.max(0, ...finished.map(r => r.finish_seconds       ?? 0));

  const recentMaxDist   = Math.max(0, ...recentFinished.map(r => r.total_distance_km   ?? 0));
  const recentMaxAscent = Math.max(0, ...recentFinished.map(r => r.total_ascent_m     ?? 0));
  const recentMaxFlatEq = Math.max(0, ...recentFinished.map(r => r.flat_equivalent_km ?? 0));
  const recentMaxTime   = Math.max(0, ...recentFinished.map(r => r.finish_seconds      ?? 0));

  const profile = athleteData?.profile;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <h1 className="text-2xl font-semibold text-zinc-900 mb-1">Athlete Demands</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Race demands built up from an athlete&apos;s result history — distance, ascent, flat equivalent, and time on feet.
      </p>

      {/* Search */}
      <div className="mb-8">
        <AthleteSearch onSelect={loadAthlete} />
      </div>

      {loading && <p className="text-sm text-zinc-400">Loading…</p>}
      {error   && <p className="text-sm text-red-600">{error}</p>}

      {athleteData && (
        <>
          {/* Athlete header */}
          <div className="flex flex-wrap items-baseline gap-4 mb-6">
            <h2 className="text-xl font-bold text-zinc-900">{selectedKey}</h2>
            {profile?.club     && <span className="text-sm text-zinc-500">{profile.club}</span>}
            {profile?.gender   && <span className="text-xs px-2 py-0.5 bg-zinc-100 rounded-full text-zinc-600">{profile.gender}</span>}
            {profile?.age_group && <span className="text-xs px-2 py-0.5 bg-zinc-100 rounded-full text-zinc-600">{profile.age_group}</span>}
            <span className="text-xs text-zinc-400 ml-auto">{finished.length} finishes · {recentFinished.length} in last 2 yrs</span>
          </div>

          {finished.length === 0 ? (
            <p className="text-sm text-zinc-400">No finished races with data found.</p>
          ) : (
            <>
              {/* Demand summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <DemandCard
                  label="Longest race"
                  allTime={fmtDist(maxDist || null)}
                  recent={recentMaxDist ? fmtDist(recentMaxDist) : "none"}
                />
                <DemandCard
                  label="Max ascent"
                  allTime={fmtAscent(maxAscent || null)}
                  recent={recentMaxAscent ? fmtAscent(recentMaxAscent) : "none"}
                />
                <DemandCard
                  label="Max flat equiv"
                  allTime={maxFlatEq ? `${maxFlatEq.toFixed(1)} km` : "—"}
                  recent={recentMaxFlatEq ? `${recentMaxFlatEq.toFixed(1)} km` : "none"}
                />
                <DemandCard
                  label="Longest time"
                  allTime={maxTime ? fmtTime(maxTime) : "—"}
                  recent={recentMaxTime ? fmtTime(recentMaxTime) : "none"}
                />
              </div>

              {/* Race history table */}
              <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 text-left font-medium">Race</th>
                      <th className="px-4 py-3 text-left font-medium w-12">Year</th>
                      <th className="px-4 py-3 text-left font-medium w-28">Distance</th>
                      <th className="px-4 py-3 text-left font-medium w-28">Ascent</th>
                      <th className="px-4 py-3 text-left font-medium w-28">Flat equiv</th>
                      <th className="px-4 py-3 text-left font-medium w-24">Time</th>
                      <th className="px-4 py-3 text-left font-medium w-20">Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {finished.map((r, i) => {
                      const isRecent = r.result_year >= CURRENT_YEAR - 2;
                      return (
                        <tr key={`${r.race_id}-${r.result_year}-${i}`} className={isRecent ? "bg-green-50/40" : "hover:bg-zinc-50"}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-800 leading-tight">{r.race_name}</div>
                          </td>
                          <td className="px-4 py-3 text-zinc-500">{r.result_year}</td>
                          <td className="px-4 py-2">
                            {r.total_distance_km != null ? (
                              <>
                                <div className="text-xs text-zinc-600 mb-1">{r.total_distance_km.toFixed(1)} km</div>
                                <Bar value={r.total_distance_km} max={maxDist} color="#1e3a1e" />
                              </>
                            ) : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-4 py-2">
                            {r.total_ascent_m != null ? (
                              <>
                                <div className="text-xs text-zinc-600 mb-1">{Math.round(r.total_ascent_m).toLocaleString()} m</div>
                                <Bar value={r.total_ascent_m} max={maxAscent} color="#b45309" />
                              </>
                            ) : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-4 py-2">
                            {r.flat_equivalent_km != null ? (
                              <>
                                <div className="text-xs text-zinc-600 mb-1">{r.flat_equivalent_km.toFixed(1)} km</div>
                                <Bar value={r.flat_equivalent_km} max={maxFlatEq} color="#1d4ed8" />
                              </>
                            ) : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 text-xs whitespace-nowrap">
                            {r.finish_seconds ? fmtTime(r.finish_seconds) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {r.position != null && r.total_finishers != null
                              ? `${r.position} / ${r.total_finishers}`
                              : r.position != null ? `${r.position}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* DNFs / non-finishes */}
              {(() => {
                const nonFinishes = (athleteData.races ?? []).filter(r => r.result_status !== "FINISHED");
                if (nonFinishes.length === 0) return null;
                return (
                  <details className="mt-4">
                    <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 select-none">
                      {nonFinishes.length} non-finish{nonFinishes.length !== 1 ? "es" : ""} (DNF / DNS) — click to show
                    </summary>
                    <div className="mt-2 border border-zinc-100 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-zinc-100">
                          {nonFinishes.map((r, i) => (
                            <tr key={`${r.race_id}-${i}`} className="hover:bg-zinc-50">
                              <td className="px-4 py-2 text-zinc-600">{r.race_name}</td>
                              <td className="px-4 py-2 text-zinc-400">{r.result_year}</td>
                              <td className="px-4 py-2">
                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-600">{r.result_status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })()}

              {/* Legend */}
              <div className="mt-4 flex gap-6 text-xs text-zinc-400">
                <span><span className="inline-block w-3 h-1.5 rounded-full bg-green-900 mr-1 align-middle" /> Distance</span>
                <span><span className="inline-block w-3 h-1.5 rounded-full bg-amber-700 mr-1 align-middle" /> Ascent</span>
                <span><span className="inline-block w-3 h-1.5 rounded-full bg-blue-700 mr-1 align-middle" /> Flat equivalent</span>
                <span className="ml-auto"><span className="inline-block w-3 h-1.5 rounded-sm bg-green-50 border border-green-200 mr-1 align-middle" /> Last 2 years</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface RaceRow {
  race_id: string;
  race_name: string;
  has_gpx: boolean;
  has_profile: boolean;
  has_strategy: boolean;
  char_terrain: string | null;
  char_hilliness: string | null;
  char_crowd_size: string | null;
  char_climate: string | null;
  char_distance_band: string | null;
  char_is_uk: boolean | null;
}

type SortCol =
  | "race_name" | "has_gpx" | "has_profile" | "has_strategy"
  | "char_terrain" | "char_hilliness" | "char_crowd_size"
  | "char_climate" | "char_distance_band" | "char_is_uk";

type SortDir = "asc" | "desc";

type FilterKey =
  | "gpx" | "profile" | "strategy"
  | "terrain" | "hilliness" | "crowd_size" | "climate" | "distance_band" | "is_uk";

type GenState = "idle" | "loading" | "done" | "error";

const FILTER_DEFS: { key: FilterKey; label: string; field: keyof RaceRow }[] = [
  { key: "gpx",           label: "GPX",        field: "has_gpx" },
  { key: "profile",       label: "Profile",     field: "has_profile" },
  { key: "strategy",      label: "Strategy",    field: "has_strategy" },
  { key: "terrain",       label: "Terrain",     field: "char_terrain" },
  { key: "hilliness",     label: "Hilliness",   field: "char_hilliness" },
  { key: "crowd_size",    label: "Crowd",       field: "char_crowd_size" },
  { key: "climate",       label: "Climate",     field: "char_climate" },
  { key: "distance_band", label: "Distance",    field: "char_distance_band" },
  { key: "is_uk",         label: "UK",          field: "char_is_uk" },
];

function isMissing(row: RaceRow, field: keyof RaceRow): boolean {
  const v = row[field];
  return v === null || v === false || v === undefined;
}

const supabase = createClient();

export default function AllRaceDataCoveragePage() {
  const [rows, setRows]           = useState<RaceRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [sortCol, setSortCol]     = useState<SortCol>("race_name");
  const [sortDir, setSortDir]     = useState<SortDir>("asc");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [genStates, setGenStates] = useState<Record<string, GenState>>({});
  const [genErrors, setGenErrors] = useState<Record<string, string>>({});

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const { data: racesData, error: rErr } = await supabase
        .from("races")
        .select("id, name")
        .order("name", { ascending: true });
      if (rErr) throw rErr;
      if (!racesData || racesData.length === 0) { setRows([]); return; }

      const raceIds = racesData.map(r => r.id as string);

      const [{ data: gpxRows }, { data: profileRows }, { data: metaRows }, { data: charRows }] = await Promise.all([
        supabase.from("race_files").select("race_id").in("race_id", raceIds).eq("file_type", "gpx"),
        supabase.from("race_profiles").select("race_id").in("race_id", raceIds),
        supabase.from("races_meta").select("race_id").in("race_id", raceIds).eq("meta_key", "race_pace_strategy"),
        supabase.from("race_characteristics").select("race_id, terrain, hilliness, crowd_size, climate, distance_band, is_uk").in("race_id", raceIds),
      ]);

      const gpxSet     = new Set((gpxRows ?? []).map(r => r.race_id as string));
      const profileSet = new Set((profileRows ?? []).map(r => r.race_id as string));
      const strategySet = new Set((metaRows ?? []).map(r => r.race_id as string));
      const charMap    = new Map((charRows ?? []).map(r => [r.race_id as string, r]));

      setRows(racesData.map(r => {
        const ch = charMap.get(r.id as string) ?? null;
        return {
          race_id:           r.id as string,
          race_name:         r.name as string,
          has_gpx:           gpxSet.has(r.id as string),
          has_profile:       profileSet.has(r.id as string),
          has_strategy:      strategySet.has(r.id as string),
          char_terrain:      ch?.terrain ?? null,
          char_hilliness:    ch?.hilliness ?? null,
          char_crowd_size:   ch?.crowd_size ?? null,
          char_climate:      ch?.climate ?? null,
          char_distance_band: ch?.distance_band ?? null,
          char_is_uk:        ch?.is_uk ?? null,
        };
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  async function generateStrategy(raceId: string) {
    setGenStates(s => ({ ...s, [raceId]: "loading" }));
    setGenErrors(e => { const next = { ...e }; delete next[raceId]; return next; });
    try {
      const res = await fetch("/api/race-strategy/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Generation failed.");
      setGenStates(s => ({ ...s, [raceId]: "done" }));
      setRows(r => r.map(row => row.race_id === raceId ? { ...row, has_strategy: true } : row));
    } catch (e) {
      setGenStates(s => ({ ...s, [raceId]: "error" }));
      setGenErrors(err => ({ ...err, [raceId]: e instanceof Error ? e.message : "Failed." }));
    }
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function toggleFilter(key: FilterKey) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const sortValue = (row: RaceRow, col: SortCol): string | boolean | null => {
    if (col === "race_name") return row.race_name;
    if (col === "has_gpx") return row.has_gpx;
    if (col === "has_profile") return row.has_profile;
    if (col === "has_strategy") return row.has_strategy;
    return row[col] as string | null;
  };

  const displayed = useMemo(() => {
    let result = rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r => r.race_name.toLowerCase().includes(q));
    }

    if (activeFilters.size > 0) {
      result = result.filter(row =>
        FILTER_DEFS.some(f => activeFilters.has(f.key) && isMissing(row, f.field))
      );
    }

    result = [...result].sort((a, b) => {
      const av = sortValue(a, sortCol);
      const bv = sortValue(b, sortCol);
      let cmp = 0;
      if (av === null && bv !== null) cmp = 1;
      else if (av !== null && bv === null) cmp = -1;
      else if (typeof av === "boolean" && typeof bv === "boolean") cmp = (av === bv ? 0 : av ? -1 : 1);
      else if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [rows, search, activeFilters, sortCol, sortDir]);

  const missingCount = rows.filter(r =>
    !r.has_gpx || !r.has_profile || !r.has_strategy ||
    !r.char_terrain || !r.char_hilliness || !r.char_crowd_size ||
    !r.char_climate || !r.char_distance_band || r.char_is_uk === null
  ).length;

  const canAutoGen = displayed.filter(r => r.has_profile && !r.has_strategy && genStates[r.race_id] !== "loading").length;

  async function generateAll() {
    const targets = displayed.filter(r => r.has_profile && !r.has_strategy && genStates[r.race_id] !== "loading");
    for (const row of targets) await generateStrategy(row.race_id);
  }

  const tick = (ok: boolean) =>
    ok
      ? <span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span>
      : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>;

  const tickVal = (v: string | null | boolean) =>
    v !== null && v !== false && v !== ""
      ? <span style={{ color: "#2e7d32", fontWeight: 700, fontSize: "13px" }} title={String(v)}>✓</span>
      : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>;

  type ColDef = { key: SortCol; label: string; center?: boolean };
  const COLUMNS: ColDef[] = [
    { key: "race_name",         label: "Race" },
    { key: "has_gpx",           label: "GPX",      center: true },
    { key: "has_profile",       label: "Profile",   center: true },
    { key: "has_strategy",      label: "Strategy",  center: true },
    { key: "char_terrain",      label: "Terrain",   center: true },
    { key: "char_hilliness",    label: "Hilliness", center: true },
    { key: "char_crowd_size",   label: "Crowd",     center: true },
    { key: "char_climate",      label: "Climate",   center: true },
    { key: "char_distance_band",label: "Distance",  center: true },
    { key: "char_is_uk",        label: "UK",        center: true },
  ];

  function SortIndicator({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span style={{ color: "#ccc", marginLeft: "4px" }}>↕</span>;
    return <span style={{ color: "#1e3a1e", marginLeft: "4px" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: "6px" }}>
        <Link href="/admin/tools" style={{ color: "#2563eb", fontSize: "13px", textDecoration: "none" }}>
          ← Admin Tools
        </Link>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: "#1e3a1e" }}>
        Race Data Coverage — All Races
      </h1>
      <p style={{ margin: "0 0 24px", color: "#666", fontSize: "14px" }}>
        Data coverage status across every race — GPX file, terrain profile, pace strategy, and characteristics.
      </p>

      {/* Search + actions */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Filter by race name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            border: "1px solid #ddd", borderRadius: "7px",
            padding: "8px 13px", fontSize: "14px", outline: "none", minWidth: "260px",
          }}
        />
        {!loading && rows.length > 0 && (
          <>
            <div style={{ fontSize: "13px", color: "#555" }}>
              <strong style={{ color: "#1e3a1e" }}>{displayed.length}</strong> shown —{" "}
              <strong style={{ color: missingCount > 0 ? "#c0392b" : "#2e7d32" }}>{missingCount}</strong> with any missing data
            </div>
            {canAutoGen > 0 && (
              <button
                onClick={() => void generateAll()}
                style={{
                  padding: "6px 14px", borderRadius: "6px", border: "1px solid #1565c0",
                  background: "#1565c0", color: "#fff", fontSize: "12px", fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Generate {canAutoGen} missing {canAutoGen === 1 ? "strategy" : "strategies"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Filter buttons — show rows missing each field */}
      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "20px" }}>
          <span style={{ fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Show missing:
          </span>
          {FILTER_DEFS.map(f => {
            const active = activeFilters.has(f.key);
            const missingN = rows.filter(r => isMissing(r, f.field)).length;
            return (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                style={{
                  padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s",
                  border: active ? "1px solid #c0392b" : "1px solid #ddd",
                  background: active ? "#fdecea" : "#f7f7f7",
                  color: active ? "#c0392b" : "#555",
                }}
              >
                {f.label}{" "}
                <span style={{ fontWeight: 400, opacity: 0.7 }}>({missingN})</span>
              </button>
            );
          })}
          {activeFilters.size > 0 && (
            <button
              onClick={() => setActiveFilters(new Set())}
              style={{
                padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
                cursor: "pointer", border: "1px solid #aaa", background: "#fff", color: "#555",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading && <p style={{ color: "#888" }}>Loading all races…</p>}
      {error   && <p style={{ color: "#c0392b" }}>{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p style={{ color: "#888" }}>No races found.</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
              <thead>
                <tr style={{ background: "#f9f9f9" }}>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      style={{
                        textAlign: col.center ? "center" : "left",
                        padding: "10px 14px", fontSize: "11px", fontWeight: 600, color: "#888",
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        borderBottom: "1px solid #eee",
                        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                      }}
                    >
                      {col.label}
                      <SortIndicator col={col.key} />
                    </th>
                  ))}
                  <th style={{
                    textAlign: "center", padding: "10px 14px", fontSize: "11px",
                    fontWeight: 600, color: "#888", textTransform: "uppercase",
                    letterSpacing: "0.04em", borderBottom: "1px solid #eee",
                  }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                      {activeFilters.size > 0 ? "No races match the active filters." : "No races match your search."}
                    </td>
                  </tr>
                )}
                {displayed.map((row, i) => {
                  const allOk = row.has_gpx && row.has_profile && row.has_strategy &&
                    !!row.char_terrain && !!row.char_hilliness && !!row.char_crowd_size &&
                    !!row.char_climate && !!row.char_distance_band && row.char_is_uk !== null;
                  const gs = genStates[row.race_id] ?? "idle";
                  const ge = genErrors[row.race_id];
                  return (
                    <tr
                      key={row.race_id}
                      style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", background: allOk ? "#fafffe" : "#fff" }}
                    >
                      <td style={{ padding: "10px 14px", fontSize: "13px", color: "#1e3a1e", fontWeight: 500, whiteSpace: "nowrap" }}>
                        {row.race_name}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_gpx)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_profile)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>
                        {gs === "done" ? <span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span> : tick(row.has_strategy)}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_terrain)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_hilliness)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_crowd_size)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_climate)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_distance_band)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_is_uk)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                          {row.has_profile && !row.has_strategy && gs !== "done" && (
                            <button
                              onClick={() => void generateStrategy(row.race_id)}
                              disabled={gs === "loading"}
                              style={{
                                padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 600,
                                cursor: gs === "loading" ? "wait" : "pointer",
                                border: "1px solid #1565c0",
                                background: gs === "loading" ? "#e3f2fd" : "#1565c0",
                                color: gs === "loading" ? "#1565c0" : "#fff",
                              }}
                            >
                              {gs === "loading" ? "Generating…" : "Gen strategy"}
                            </button>
                          )}
                          {gs === "error" && ge && (
                            <span style={{ fontSize: "10.5px", color: "#c0392b", maxWidth: "140px" }} title={ge}>
                              {ge.length > 30 ? ge.slice(0, 30) + "…" : ge}
                            </span>
                          )}
                          {!allOk && (
                            <Link
                              href={`/admin/race-files?race=${encodeURIComponent(row.race_name)}`}
                              style={{ fontSize: "11px", color: "#1565c0", textDecoration: "none", fontWeight: 500, whiteSpace: "nowrap" }}
                            >
                              Upload →
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

          <div style={{ marginTop: "10px", fontSize: "11.5px", color: "#aaa" }}>
            Showing {displayed.length} of {rows.length} races.
          </div>
        </>
      )}
    </div>
  );
}

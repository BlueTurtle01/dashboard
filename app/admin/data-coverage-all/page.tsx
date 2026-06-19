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
  has_date: boolean;
  has_results: boolean;
  char_terrain: string | null;
  char_hilliness: string | null;
  char_crowd_size: string | null;
  char_climate: string | null;
  char_distance_band: string | null;
  char_country: string | null;
}

type SortCol =
  | "race_name" | "has_gpx" | "has_profile" | "has_strategy" | "has_date" | "has_results"
  | "char_terrain" | "char_hilliness" | "char_crowd_size"
  | "char_climate" | "char_distance_band" | "char_country";

type SortDir = "asc" | "desc";

type FilterKey =
  | "gpx" | "profile" | "strategy" | "date" | "results"
  | "terrain" | "hilliness" | "crowd_size" | "climate" | "distance_band" | "country";

type FilterVal = "all" | "yes" | "no";

const FILTER_DEFS: { key: FilterKey; label: string; field: keyof RaceRow }[] = [
  { key: "gpx",           label: "GPX",        field: "has_gpx" },
  { key: "profile",       label: "Profile",     field: "has_profile" },
  { key: "strategy",      label: "Strategy",    field: "has_strategy" },
  { key: "date",          label: "Race Date",   field: "has_date" },
  { key: "results",       label: "Results",     field: "has_results" },
  { key: "terrain",       label: "Terrain",     field: "char_terrain" },
  { key: "hilliness",     label: "Hilliness",   field: "char_hilliness" },
  { key: "crowd_size",    label: "Crowd",       field: "char_crowd_size" },
  { key: "climate",       label: "Climate",     field: "char_climate" },
  { key: "distance_band", label: "Distance",    field: "char_distance_band" },
  { key: "country",       label: "Country",      field: "char_country" },
];

function isMissing(row: RaceRow, field: keyof RaceRow): boolean {
  const v = row[field];
  return v === null || v === false || v === undefined;
}

type ColDef = { key: SortCol; label: string; center?: boolean };
const ALL_COLUMNS: ColDef[] = [
  { key: "race_name",          label: "Race" },
  { key: "has_gpx",            label: "GPX",       center: true },
  { key: "has_profile",        label: "Profile",    center: true },
  { key: "has_strategy",       label: "Strategy",   center: true },
  { key: "has_date",           label: "Race Date",  center: true },
  { key: "has_results",        label: "Results",    center: true },
  { key: "char_terrain",       label: "Terrain",    center: true },
  { key: "char_hilliness",     label: "Hilliness",  center: true },
  { key: "char_crowd_size",    label: "Crowd",      center: true },
  { key: "char_climate",       label: "Climate",    center: true },
  { key: "char_distance_band", label: "Distance",   center: true },
  { key: "char_country",        label: "Country",    center: true },
];

const DEFAULT_VISIBLE = new Set<SortCol>(ALL_COLUMNS.map(c => c.key));

const supabase = createClient();

export default function AllRaceDataCoveragePage() {
  const [rows, setRows]             = useState<RaceRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [sortCol, setSortCol]       = useState<SortCol>("race_name");
  const [sortDir, setSortDir]       = useState<SortDir>("asc");
  const defaultFilters = Object.fromEntries(FILTER_DEFS.map(f => [f.key, "all" as FilterVal])) as Record<FilterKey, FilterVal>;
  const [columnFilters, setColumnFilters] = useState<Record<FilterKey, FilterVal>>(defaultFilters);
  const [visibleCols, setVisibleCols] = useState<Set<SortCol>>(DEFAULT_VISIBLE);

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

      const [{ data: gpxRows }, { data: profileRows }, { data: metaRows }, { data: charRows }, { data: raceDateRows }, { data: resultsRows }] = await Promise.all([
        supabase.from("race_files").select("race_id").in("race_id", raceIds).eq("file_type", "gpx"),
        supabase.from("race_profiles").select("race_id").in("race_id", raceIds),
        supabase.from("races_meta").select("race_id").in("race_id", raceIds).eq("meta_key", "race_pace_strategy"),
        supabase.from("race_characteristics").select("race_id, terrain, hilliness, crowd_size, climate, distance_band, country").in("race_id", raceIds),
        supabase.from("race_dates").select("race_id").in("race_id", raceIds),
        supabase.rpc("get_latest_year_entrant_counts"),
      ]);

      const gpxSet      = new Set((gpxRows     ?? []).map(r => r.race_id as string));
      const profileSet  = new Set((profileRows ?? []).map(r => r.race_id as string));
      const strategySet = new Set((metaRows    ?? []).map(r => r.race_id as string));
      const charMap     = new Map((charRows    ?? []).map(r => [r.race_id as string, r]));
      const raceDateSet = new Set((raceDateRows ?? []).map(r => r.race_id as string));
      const resultsSet  = new Set((resultsRows  ?? []).map(r => r.race_id as string));

      setRows(racesData.map(r => {
        const ch = charMap.get(r.id as string) ?? null;
        return {
          race_id:            r.id as string,
          race_name:          r.name as string,
          has_gpx:            gpxSet.has(r.id as string),
          has_profile:        profileSet.has(r.id as string),
          has_strategy:       strategySet.has(r.id as string),
          has_date:           raceDateSet.has(r.id as string),
          has_results:        resultsSet.has(r.id as string),
          char_terrain:       ch?.terrain ?? null,
          char_hilliness:     ch?.hilliness ?? null,
          char_crowd_size:    ch?.crowd_size ?? null,
          char_climate:       ch?.climate ?? null,
          char_distance_band: ch?.distance_band ?? null,
          char_country:       ch?.country ?? null,
        };
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  function setFilter(key: FilterKey, val: FilterVal) {
    setColumnFilters(prev => ({ ...prev, [key]: val }));
  }

  function clearFilters() {
    setColumnFilters(defaultFilters);
  }

  function toggleCol(key: SortCol) {
    if (key === "race_name") return; // always visible
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const sortValue = (row: RaceRow, col: SortCol): string | boolean | null => {
    if (col === "race_name")    return row.race_name;
    if (col === "has_gpx")     return row.has_gpx;
    if (col === "has_profile")  return row.has_profile;
    if (col === "has_strategy") return row.has_strategy;
    if (col === "has_date")     return row.has_date;
    if (col === "has_results")  return row.has_results;
    return row[col] as string | null;
  };

  const displayed = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r => r.race_name.toLowerCase().includes(q));
    }
    if (FILTER_DEFS.some(f => columnFilters[f.key] !== "all")) {
      result = result.filter(row =>
        FILTER_DEFS.every(f => {
          const fv = columnFilters[f.key];
          if (fv === "all") return true;
          const missing = isMissing(row, f.field);
          return fv === "no" ? missing : !missing;
        })
      );
    }
    result = [...result].sort((a, b) => {
      const av = sortValue(a, sortCol);
      const bv = sortValue(b, sortCol);
      let cmp = 0;
      if (av === null && bv !== null) cmp = 1;
      else if (av !== null && bv === null) cmp = -1;
      else if (typeof av === "boolean" && typeof bv === "boolean") cmp = av === bv ? 0 : av ? -1 : 1;
      else if (typeof av === "string"  && typeof bv === "string")  cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [rows, search, columnFilters, sortCol, sortDir]);

  const missingCount = rows.filter(r =>
    !r.has_gpx || !r.has_profile || !r.has_strategy || !r.has_date || !r.has_results ||
    !r.char_terrain || !r.char_hilliness || !r.char_crowd_size ||
    !r.char_climate || !r.char_distance_band || !r.char_country
  ).length;

  const visibleColumns = ALL_COLUMNS.filter(c => visibleCols.has(c.key));

  const tick = (ok: boolean) =>
    ok ? <span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span>
       : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>;

  const tickVal = (v: string | null | boolean) =>
    v !== null && v !== false && v !== ""
      ? <span style={{ color: "#2e7d32", fontWeight: 700, fontSize: "13px" }} title={String(v)}>✓</span>
      : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>;

  function SortIndicator({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span style={{ color: "#ccc", marginLeft: "4px" }}>↕</span>;
    return <span style={{ color: "#1e3a1e", marginLeft: "4px" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const colPillStyle = (visible: boolean, fixed: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
    cursor: fixed ? "default" : "pointer",
    border: visible ? "1px solid #1565c0" : "1px solid #ddd",
    background: visible ? "#e3f2fd" : "#f7f7f7",
    color: visible ? "#1565c0" : "#aaa",
    opacity: fixed ? 0.6 : 1,
  });

  return (
    <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
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

      {/* Search + stats */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Filter by race name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: "1px solid #ddd", borderRadius: "7px", padding: "8px 13px", fontSize: "14px", outline: "none", minWidth: "260px" }}
        />
        {!loading && rows.length > 0 && (
          <div style={{ fontSize: "13px", color: "#555" }}>
            <strong style={{ color: "#1e3a1e" }}>{displayed.length}</strong> shown —{" "}
            <strong style={{ color: missingCount > 0 ? "#c0392b" : "#2e7d32" }}>{missingCount}</strong> with any missing data
          </div>
        )}
      </div>

      {/* Column filters */}
      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "14px" }}>
          <span style={{ fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", paddingBottom: "6px" }}>
            Filter:
          </span>
          {FILTER_DEFS.map(f => {
            const val = columnFilters[f.key];
            const active = val !== "all";
            return (
              <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <label style={{ fontSize: "10px", fontWeight: 600, color: active ? "#1565c0" : "#888", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {f.label}
                </label>
                <select
                  value={val}
                  onChange={e => setFilter(f.key, e.target.value as FilterVal)}
                  style={{
                    padding: "5px 8px", borderRadius: "6px", fontSize: "12px",
                    border: active ? "1px solid #1565c0" : "1px solid #ddd",
                    background: active ? "#e3f2fd" : "#fff",
                    color: active ? "#1565c0" : "#555",
                    cursor: "pointer", fontWeight: active ? 600 : 400,
                    outline: "none",
                  }}
                >
                  <option value="all">All</option>
                  <option value="yes">✓ Yes</option>
                  <option value="no">✗ No</option>
                </select>
              </div>
            );
          })}
          {FILTER_DEFS.some(f => columnFilters[f.key] !== "all") && (
            <button onClick={clearFilters}
              style={{ alignSelf: "flex-end", padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid #aaa", background: "#fff", color: "#555" }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Column visibility toggles */}
      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "20px" }}>
          <span style={{ fontSize: "12px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Columns:
          </span>
          {ALL_COLUMNS.map(col => {
            const fixed = col.key === "race_name";
            const visible = visibleCols.has(col.key);
            return (
              <button key={col.key} onClick={() => toggleCol(col.key)} style={colPillStyle(visible, fixed)}>
                {col.label}
              </button>
            );
          })}
        </div>
      )}

      {loading && <p style={{ color: "#888" }}>Loading all races…</p>}
      {error   && <p style={{ color: "#c0392b" }}>{error}</p>}
      {!loading && !error && rows.length === 0 && <p style={{ color: "#888" }}>No races found.</p>}

      {!loading && rows.length > 0 && (
        <>
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9f9f9" }}>
                  {visibleColumns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      style={{
                        textAlign: col.center ? "center" : "left",
                        padding: "10px 14px", fontSize: "11px", fontWeight: 600, color: "#888",
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        borderBottom: "1px solid #eee", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                      }}
                    >
                      {col.label}
                      <SortIndicator col={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length} style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                      {FILTER_DEFS.some(f => columnFilters[f.key] !== "all") ? "No races match the active filters." : "No races match your search."}
                    </td>
                  </tr>
                )}
                {displayed.map((row, i) => {
                  const allOk = row.has_gpx && row.has_profile && row.has_strategy && row.has_date && row.has_results &&
                    !!row.char_terrain && !!row.char_hilliness && !!row.char_crowd_size &&
                    !!row.char_climate && !!row.char_distance_band && !!row.char_country;
                  return (
                    <tr
                      key={row.race_id}
                      style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", background: allOk ? "#fafffe" : "#fff" }}
                    >
                      {visibleCols.has("race_name") && (
                        <td style={{ padding: "10px 14px", fontSize: "13px", color: "#1e3a1e", fontWeight: 500, whiteSpace: "nowrap" }}>
                          {row.race_name}
                        </td>
                      )}
                      {visibleCols.has("has_gpx") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_gpx)}</td>
                      )}
                      {visibleCols.has("has_profile") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_profile)}</td>
                      )}
                      {visibleCols.has("has_strategy") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_strategy)}</td>
                      )}
                      {visibleCols.has("has_date") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_date)}</td>
                      )}
                      {visibleCols.has("has_results") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_results)}</td>
                      )}
                      {visibleCols.has("char_terrain") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_terrain)}</td>
                      )}
                      {visibleCols.has("char_hilliness") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_hilliness)}</td>
                      )}
                      {visibleCols.has("char_crowd_size") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_crowd_size)}</td>
                      )}
                      {visibleCols.has("char_climate") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_climate)}</td>
                      )}
                      {visibleCols.has("char_distance_band") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tickVal(row.char_distance_band)}</td>
                      )}
                      {visibleCols.has("char_country") && (
                        <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "12px" }}>
                          {row.char_country
                            ? <span style={{ color: "#2e7d32", fontWeight: 500 }}>{row.char_country}</span>
                            : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>}
                        </td>
                      )}
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

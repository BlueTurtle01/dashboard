"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AthleteSuggestion {
  full_name: string;
  race_count: number;
}

interface RaceRow {
  race_id: string;
  race_name: string;
  result_year: number;
  result_status: string;
  has_gpx: boolean;
  has_profile: boolean;
  has_strategy: boolean;
}

const supabase = createClient();

export default function DataCoveragePage() {
  const [query, setQuery]               = useState("");
  const [suggestions, setSuggestions]   = useState<AthleteSuggestion[]>([]);
  const [sugOpen, setSugOpen]           = useState(false);
  const [athlete, setAthlete]           = useState<string | null>(null);
  const [rows, setRows]                 = useState<RaceRow[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [hideComplete, setHideComplete] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ── Athlete name autocomplete ──────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q || athlete) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("race_results")
        .select("full_name")
        .ilike("full_name", `%${q}%`)
        .limit(200);
      if (!data) return;
      const counts: Record<string, number> = {};
      for (const r of data) counts[r.full_name as string] = (counts[r.full_name as string] ?? 0) + 1;
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([full_name, race_count]) => ({ full_name, race_count }));
      setSuggestions(sorted);
      setSugOpen(sorted.length > 0);
    }, 280);
  }, [query, athlete]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSugOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Load races for selected athlete ───────────────────────────────────────
  async function loadAthlete(name: string) {
    setAthlete(name);
    setQuery(name);
    setSugOpen(false);
    setSuggestions([]);
    setLoading(true);
    setError(null);
    setRows([]);

    try {
      // 1. All races the athlete has appeared in
      const { data: resultData, error: rErr } = await supabase
        .from("race_results")
        .select("race_id, result_year, result_status, races(name)")
        .eq("full_name", name)
        .order("result_year", { ascending: false });
      if (rErr) throw rErr;

      // Deduplicate by race_id (keep most recent year)
      const seen = new Set<string>();
      const deduped: { race_id: string; race_name: string; result_year: number; result_status: string }[] = [];
      for (const r of resultData ?? []) {
        if (seen.has(r.race_id as string)) continue;
        seen.add(r.race_id as string);
        const nameVal = Array.isArray(r.races)
          ? (r.races[0] as { name: string } | undefined)?.name
          : (r.races as { name: string } | null)?.name;
        deduped.push({
          race_id:       r.race_id as string,
          race_name:     nameVal ?? "(unknown race)",
          result_year:   r.result_year as number,
          result_status: r.result_status as string,
        });
      }

      if (deduped.length === 0) { setRows([]); return; }

      const raceIds = deduped.map(r => r.race_id);

      // 2. Parallel data-presence checks
      const [{ data: gpxRows }, { data: profileRows }, { data: metaRows }] = await Promise.all([
        supabase.from("race_files").select("race_id").in("race_id", raceIds).eq("file_type", "gpx"),
        supabase.from("race_profiles").select("race_id").in("race_id", raceIds),
        supabase.from("races_meta").select("race_id").in("race_id", raceIds).eq("meta_key", "race_pace_strategy"),
      ]);

      const gpxSet      = new Set((gpxRows ?? []).map(r => r.race_id as string));
      const profileSet  = new Set((profileRows ?? []).map(r => r.race_id as string));
      const strategySet = new Set((metaRows ?? []).map(r => r.race_id as string));

      setRows(deduped.map(r => ({
        ...r,
        has_gpx:      gpxSet.has(r.race_id),
        has_profile:  profileSet.has(r.race_id),
        has_strategy: strategySet.has(r.race_id),
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  function clearAthlete() {
    setAthlete(null);
    setQuery("");
    setRows([]);
    setError(null);
  }

  const displayed = hideComplete
    ? rows.filter(r => !r.has_gpx || !r.has_profile || !r.has_strategy)
    : rows;

  const tick = (ok: boolean) =>
    ok
      ? <span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span>
      : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>;

  const missingCount = rows.filter(r => !r.has_gpx || !r.has_profile || !r.has_strategy).length;

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "6px" }}>
        <Link href="/admin/tools" style={{ color: "#2563eb", fontSize: "13px", textDecoration: "none" }}>
          ← Admin Tools
        </Link>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: "#1e3a1e" }}>
        Data Coverage
      </h1>
      <p style={{ margin: "0 0 28px", color: "#666", fontSize: "14px" }}>
        Look up an athlete to see which of their historical races are missing GPX, race profile, or pace strategy data.
      </p>

      {/* Athlete search */}
      <div ref={wrapRef} style={{ position: "relative", maxWidth: "420px", marginBottom: "28px" }}>
        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#555", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Athlete name
        </label>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="Type to search…"
            value={query}
            onChange={e => { setQuery(e.target.value); if (athlete) setAthlete(null); }}
            onFocus={() => suggestions.length > 0 && setSugOpen(true)}
            style={{ flex: 1, border: "1px solid #ddd", borderRadius: "7px", padding: "9px 13px", fontSize: "14px", outline: "none" }}
          />
          {athlete && (
            <button
              onClick={clearAthlete}
              style={{ padding: "9px 14px", borderRadius: "7px", border: "1px solid #ddd", background: "#f5f5f5", cursor: "pointer", fontSize: "13px", color: "#555" }}
            >
              Clear
            </button>
          )}
        </div>

        {sugOpen && suggestions.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 50, marginTop: "4px",
            maxHeight: "280px", overflowY: "auto",
          }}>
            {suggestions.map(s => (
              <button
                key={s.full_name}
                onClick={() => loadAthlete(s.full_name)}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  width: "100%", padding: "10px 14px", border: "none", background: "none",
                  textAlign: "left", cursor: "pointer", fontSize: "13px", color: "#222",
                  borderBottom: "1px solid #f5f5f5",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                <span>{s.full_name}</span>
                <span style={{ fontSize: "11px", color: "#999" }}>{s.race_count} results</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {loading && <p style={{ color: "#888" }}>Loading…</p>}
      {error   && <p style={{ color: "#c0392b" }}>{error}</p>}

      {!loading && athlete && rows.length === 0 && !error && (
        <p style={{ color: "#888" }}>No race results found for {athlete}.</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* Summary row */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "13px", color: "#555" }}>
              <strong style={{ color: "#1e3a1e" }}>{rows.length}</strong> races found —{" "}
              <strong style={{ color: missingCount > 0 ? "#c0392b" : "#2e7d32" }}>{missingCount}</strong> with missing data
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", cursor: "pointer", marginLeft: "auto" }}>
              <input
                type="checkbox"
                checked={hideComplete}
                onChange={e => setHideComplete(e.target.checked)}
              />
              Show incomplete only
            </label>
          </div>

          {/* Legend */}
          <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px", display: "flex", gap: "16px" }}>
            <span><strong>GPX</strong> — route file uploaded</span>
            <span><strong>Profile</strong> — terrain sections computed from GPX</span>
            <span><strong>Strategy</strong> — pace strategy saved (Plan Insights)</span>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9f9f9" }}>
                  {["Race", "Year", "Status", "GPX", "Profile", "Strategy", ""].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 0 ? "left" : "center",
                      padding: "10px 14px", fontSize: "11px", fontWeight: 600, color: "#888",
                      textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #eee",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                      All races are fully complete.
                    </td>
                  </tr>
                )}
                {displayed.map((row, i) => {
                  const allOk = row.has_gpx && row.has_profile && row.has_strategy;
                  return (
                    <tr key={row.race_id} style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", background: allOk ? "#fafffe" : "#fff" }}>
                      <td style={{ padding: "10px 14px", fontSize: "13px", color: "#1e3a1e", fontWeight: 500 }}>
                        {row.race_name}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "13px", color: "#555" }}>
                        {row.result_year}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <span style={{
                          fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
                          background: row.result_status === "FINISHED" ? "#e8f5e9" : row.result_status === "DNF" ? "#fce4ec" : "#f5f5f5",
                          color: row.result_status === "FINISHED" ? "#2e7d32" : row.result_status === "DNF" ? "#c0392b" : "#666",
                        }}>
                          {row.result_status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_gpx)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_profile)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_strategy)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        {!allOk && (
                          <Link
                            href={`/admin/race-files?race=${encodeURIComponent(row.race_name)}`}
                            style={{ fontSize: "12px", color: "#1565c0", textDecoration: "none", fontWeight: 500 }}
                          >
                            Upload →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "10px", fontSize: "11.5px", color: "#aaa" }}>
            Showing {displayed.length} of {rows.length} races.
            {" "}Profile = computed terrain sections from GPX.
            {" "}Strategy = plan insights stored in races_meta.
          </div>
        </>
      )}
    </div>
  );
}

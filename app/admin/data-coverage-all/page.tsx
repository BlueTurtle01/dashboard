"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface RaceRow {
  race_id: string;
  race_name: string;
  has_gpx: boolean;
  has_profile: boolean;
  has_strategy: boolean;
}

type GenState = "idle" | "loading" | "done" | "error";

const supabase = createClient();

export default function AllRaceDataCoveragePage() {
  const [rows, setRows]                 = useState<RaceRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [hideComplete, setHideComplete] = useState(false);
  const [search, setSearch]             = useState("");
  const [genStates, setGenStates]       = useState<Record<string, GenState>>({});
  const [genErrors, setGenErrors]       = useState<Record<string, string>>({});

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

      const [{ data: gpxRows }, { data: profileRows }, { data: metaRows }] = await Promise.all([
        supabase.from("race_files").select("race_id").in("race_id", raceIds).eq("file_type", "gpx"),
        supabase.from("race_profiles").select("race_id").in("race_id", raceIds),
        supabase.from("races_meta").select("race_id").in("race_id", raceIds).eq("meta_key", "race_pace_strategy"),
      ]);

      const gpxSet      = new Set((gpxRows ?? []).map(r => r.race_id as string));
      const profileSet  = new Set((profileRows ?? []).map(r => r.race_id as string));
      const strategySet = new Set((metaRows ?? []).map(r => r.race_id as string));

      setRows(racesData.map(r => ({
        race_id:      r.id as string,
        race_name:    r.name as string,
        has_gpx:      gpxSet.has(r.id as string),
        has_profile:  profileSet.has(r.id as string),
        has_strategy: strategySet.has(r.id as string),
      })));
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

  const filtered = search.trim()
    ? rows.filter(r => r.race_name.toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  const displayed = hideComplete
    ? filtered.filter(r => !r.has_gpx || !r.has_profile || !r.has_strategy)
    : filtered;

  const missingCount = filtered.filter(r => !r.has_gpx || !r.has_profile || !r.has_strategy).length;
  const canAutoGen   = displayed.filter(r => r.has_profile && !r.has_strategy && genStates[r.race_id] !== "loading").length;

  async function generateAll() {
    const targets = displayed.filter(r => r.has_profile && !r.has_strategy && genStates[r.race_id] !== "loading");
    for (const row of targets) {
      await generateStrategy(row.race_id);
    }
  }

  const tick = (ok: boolean) =>
    ok
      ? <span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span>
      : <span style={{ color: "#c0392b", fontWeight: 700 }}>✗</span>;

  return (
    <div style={{ maxWidth: "1060px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "6px" }}>
        <Link href="/admin/tools" style={{ color: "#2563eb", fontSize: "13px", textDecoration: "none" }}>
          ← Admin Tools
        </Link>
      </div>
      <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700, color: "#1e3a1e" }}>
        Race Data Coverage — All Races
      </h1>
      <p style={{ margin: "0 0 28px", color: "#666", fontSize: "14px" }}>
        Data coverage status across every race — GPX file, terrain profile, and pace strategy.
      </p>

      {/* Search + filter bar */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
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
              <strong style={{ color: "#1e3a1e" }}>{filtered.length}</strong> races —{" "}
              <strong style={{ color: missingCount > 0 ? "#c0392b" : "#2e7d32" }}>{missingCount}</strong> with missing data
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
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#555", cursor: "pointer", marginLeft: "auto" }}>
              <input type="checkbox" checked={hideComplete} onChange={e => setHideComplete(e.target.checked)} />
              Show incomplete only
            </label>
          </>
        )}
      </div>

      {/* Legend */}
      {!loading && rows.length > 0 && (
        <div style={{ fontSize: "11px", color: "#888", marginBottom: "12px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <span><strong>GPX</strong> — route file uploaded</span>
          <span><strong>Profile</strong> — terrain sections computed from GPX</span>
          <span><strong>Strategy</strong> — pace strategy saved (Plan Insights)</span>
        </div>
      )}

      {loading && <p style={{ color: "#888" }}>Loading all races…</p>}
      {error   && <p style={{ color: "#c0392b" }}>{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p style={{ color: "#888" }}>No races found.</p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div style={{ background: "#fff", border: "1px solid #e8e8e8", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9f9f9" }}>
                  {["Race", "GPX", "Profile", "Strategy", "Actions"].map((h, i) => (
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
                    <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                      {hideComplete ? "All matching races are fully complete." : "No races match your filter."}
                    </td>
                  </tr>
                )}
                {displayed.map((row, i) => {
                  const allOk = row.has_gpx && row.has_profile && row.has_strategy;
                  const gs    = genStates[row.race_id] ?? "idle";
                  const ge    = genErrors[row.race_id];
                  return (
                    <tr
                      key={row.race_id}
                      style={{ borderTop: i > 0 ? "1px solid #f0f0f0" : "none", background: allOk ? "#fafffe" : "#fff" }}
                    >
                      <td style={{ padding: "10px 14px", fontSize: "13px", color: "#1e3a1e", fontWeight: 500 }}>
                        {row.race_name}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_gpx)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>{tick(row.has_profile)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", fontSize: "16px" }}>
                        {gs === "done" ? <span style={{ color: "#2e7d32", fontWeight: 700 }}>✓</span> : tick(row.has_strategy)}
                      </td>
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
                              {gs === "loading" ? "Generating…" : "Generate strategy"}
                            </button>
                          )}
                          {gs === "error" && ge && (
                            <span style={{ fontSize: "10.5px", color: "#c0392b", maxWidth: "140px" }} title={ge}>
                              {ge.length > 40 ? ge.slice(0, 40) + "…" : ge}
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
            {" "}Profile = terrain sections computed from GPX.
            {" "}Strategy = auto-generated or manually edited pace strategy stored in races_meta.
          </div>
        </>
      )}
    </div>
  );
}

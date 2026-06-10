"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AidStation } from "@/app/api/admin/aid-stations/route";

interface RaceRow {
  id: string;
  name: string;
  total_distance_km: number | null;
  station_count: number;
  loaded: boolean;
  stations: AidStation[];
  dirty: boolean;
  saving: boolean;
  saveMsg: string;
}

const FACILITY_KEYS: (keyof AidStation & string)[] = ["water", "food", "medic", "toilets", "dropBags"];
const FACILITY_LABELS: Record<string, string> = {
  water: "💧 Water", food: "🍊 Food", medic: "🩺 Medic", toilets: "🚻 Toilets", dropBags: "🎒 Drop bags",
};

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.60934;

function blankStation(): AidStation {
  return { km: 0, name: "", water: true, food: false, medic: false, toilets: false, dropBags: false };
}

export default function AidStationsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "ok" | "forbidden">("loading");
  const [races, setRaces] = useState<RaceRow[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [useMiles, setUseMiles] = useState(false);

  const toDisp = (km: number) => useMiles ? +(km * KM_TO_MI).toFixed(2) : km;
  const fromDisp = (val: number) => useMiles ? +(val * MI_TO_KM).toFixed(4) : val;
  const unitLabel = useMiles ? "mi" : "km";

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r: { role: string }) => r.role === "admin")) { router.push("/login"); return; }
      setAuthState("ok");

      // Load all races + aid station counts
      const { data: racesData } = await supabase
        .from("races")
        .select("id, name")
        .order("name");

      const { data: metaData } = await supabase
        .from("races_meta")
        .select("race_id, meta_value")
        .eq("meta_key", "aid_stations");

      const metaMap: Record<string, string> = {};
      for (const row of (metaData ?? []) as { race_id: string; meta_value: string }[]) {
        metaMap[row.race_id] = row.meta_value;
      }

      setRaces(
        ((racesData ?? []) as { id: string; name: string }[]).map(r => {
          let stations: AidStation[] = [];
          let count = 0;
          if (metaMap[r.id]) {
            try {
              const parsed = JSON.parse(metaMap[r.id]);
              if (Array.isArray(parsed)) { stations = parsed; count = parsed.length; }
            } catch { /* ignore */ }
          }
          return {
            id: r.id, name: r.name, total_distance_km: null,
            station_count: count, loaded: count > 0,
            stations, dirty: false, saving: false, saveMsg: "",
          };
        })
      );
    }
    init();
  }, [router]);

  const toggleExpand = useCallback(async (raceId: string) => {
    if (expanded === raceId) { setExpanded(null); return; }
    setExpanded(raceId);

    setRaces(prev => prev.map(r => r.id === raceId && !r.loaded
      ? { ...r, loaded: false } : r));

    // Fetch stations if not yet loaded (count was 0 initially)
    const race = races.find(r => r.id === raceId);
    if (!race) return;
    if (race.loaded || race.stations.length > 0) return;

    const res = await fetch(`/api/admin/aid-stations?race_id=${raceId}`);
    if (res.ok) {
      const json = await res.json() as { stations: AidStation[] };
      setRaces(prev => prev.map(r =>
        r.id === raceId ? { ...r, stations: json.stations, loaded: true } : r
      ));
    }
  }, [expanded, races]);

  const updateStation = (raceId: string, idx: number, patch: Partial<AidStation>) => {
    setRaces(prev => prev.map(r => {
      if (r.id !== raceId) return r;
      const stations = r.stations.map((s, i) => i === idx ? { ...s, ...patch } : s);
      return { ...r, stations, dirty: true, saveMsg: "" };
    }));
  };

  const addStation = (raceId: string) => {
    setRaces(prev => prev.map(r => {
      if (r.id !== raceId) return r;
      const lastKm = r.stations.length > 0 ? r.stations[r.stations.length - 1].km : 0;
      return { ...r, stations: [...r.stations, { ...blankStation(), km: lastKm }], dirty: true, saveMsg: "" };
    }));
  };

  const removeStation = (raceId: string, idx: number) => {
    setRaces(prev => prev.map(r => {
      if (r.id !== raceId) return r;
      return { ...r, stations: r.stations.filter((_, i) => i !== idx), dirty: true, saveMsg: "" };
    }));
  };

  const saveStations = async (raceId: string) => {
    const race = races.find(r => r.id === raceId);
    if (!race) return;
    setRaces(prev => prev.map(r => r.id === raceId ? { ...r, saving: true, saveMsg: "" } : r));

    const res = await fetch("/api/admin/aid-stations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ race_id: raceId, stations: race.stations }),
    });
    const json = await res.json() as { success?: boolean; count?: number; error?: string };

    setRaces(prev => prev.map(r => {
      if (r.id !== raceId) return r;
      if (res.ok && json.success) {
        return { ...r, saving: false, dirty: false, station_count: json.count ?? r.stations.length, saveMsg: `Saved ${json.count} station${json.count !== 1 ? "s" : ""}` };
      }
      return { ...r, saving: false, saveMsg: `Error: ${json.error ?? "Unknown error"}` };
    }));
  };

  const filtered = races.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  if (authState === "loading") return <div style={{ padding: 48, color: "#6b7280", fontSize: 14 }}>Loading…</div>;

  return (
    <main style={{ padding: "32px 40px", maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Aid Stations</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
          Manage aid station positions and facilities for each race. Data is shared with athlete race pages and readiness reports.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search races…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, boxSizing: "border-box", padding: "8px 12px",
            border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
          {(["km", "mi"] as const).map(unit => (
            <button
              key={unit}
              onClick={() => setUseMiles(unit === "mi")}
              style={{
                padding: "8px 14px", fontSize: 12, fontWeight: 600, border: "none",
                cursor: "pointer",
                background: (unit === "mi") === useMiles ? "#2563eb" : "#fff",
                color: (unit === "mi") === useMiles ? "#fff" : "#374151",
              }}
            >{unit}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filtered.map(race => {
          const isOpen = expanded === race.id;
          return (
            <div key={race.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
              {/* Header row */}
              <div
                onClick={() => toggleExpand(race.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", cursor: "pointer", userSelect: "none",
                  background: isOpen ? "#f0f7ff" : "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{race.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: "1px 7px", borderRadius: 4,
                    background: race.station_count > 0 ? "#dcfce7" : "#fef3c7",
                    color: race.station_count > 0 ? "#166534" : "#92400e",
                    border: `1px solid ${race.station_count > 0 ? "#86efac" : "#fcd34d"}`,
                  }}>
                    {race.station_count > 0 ? `${race.station_count} station${race.station_count !== 1 ? "s" : ""}` : "No data"}
                  </span>
                  {race.dirty && (
                    <span style={{ fontSize: 10, color: "#d97706", fontWeight: 500 }}>● Unsaved</span>
                  )}
                </div>
                <span style={{ fontSize: 14, color: "#6b7280" }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Editor */}
              {isOpen && (
                <div style={{ padding: "14px 16px", borderTop: "1px solid #e5e7eb" }}>
                  {race.stations.length === 0 ? (
                    <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 10px" }}>
                      No aid stations recorded for this race yet.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto", marginBottom: 10 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <th style={thStyle}>{unitLabel}</th>
                            <th style={thStyle}>Name (optional)</th>
                            {FACILITY_KEYS.map(k => (
                              <th key={k} style={{ ...thStyle, textAlign: "center" }}>{FACILITY_LABELS[k].split(" ")[0]}</th>
                            ))}
                            <th style={thStyle} />
                          </tr>
                        </thead>
                        <tbody>
                          {race.stations.map((s, idx) => (
                            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={tdStyle}>
                                <input
                                  type="number"
                                  value={toDisp(s.km)}
                                  step="0.1"
                                  min="0"
                                  onChange={e => updateStation(race.id, idx, { km: fromDisp(parseFloat(e.target.value) || 0) })}
                                  style={inputStyle}
                                />
                              </td>
                              <td style={tdStyle}>
                                <input
                                  type="text"
                                  value={s.name ?? ""}
                                  placeholder="e.g. Checkpoint 1"
                                  onChange={e => updateStation(race.id, idx, { name: e.target.value })}
                                  style={{ ...inputStyle, width: 160 }}
                                />
                              </td>
                              {FACILITY_KEYS.map(k => (
                                <td key={k} style={{ ...tdStyle, textAlign: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(s[k as keyof AidStation])}
                                    onChange={e => updateStation(race.id, idx, { [k]: e.target.checked } as Partial<AidStation>)}
                                  />
                                </td>
                              ))}
                              <td style={tdStyle}>
                                <button
                                  onClick={() => removeStation(race.id, idx)}
                                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                                >×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => addStation(race.id)}
                      style={{
                        padding: "5px 12px", fontSize: 12, fontWeight: 500,
                        border: "1px solid #d1d5db", borderRadius: 5, background: "#fff",
                        cursor: "pointer", color: "#374151",
                      }}
                    >+ Add station</button>

                    <button
                      onClick={() => saveStations(race.id)}
                      disabled={race.saving || !race.dirty}
                      style={{
                        padding: "5px 14px", fontSize: 12, fontWeight: 600,
                        borderRadius: 5, border: "none", cursor: race.dirty && !race.saving ? "pointer" : "default",
                        background: race.dirty && !race.saving ? "#2563eb" : "#d1d5db",
                        color: race.dirty && !race.saving ? "#fff" : "#9ca3af",
                      }}
                    >{race.saving ? "Saving…" : "Save"}</button>

                    {race.saveMsg && (
                      <span style={{
                        fontSize: 11,
                        color: race.saveMsg.startsWith("Error") ? "#dc2626" : "#16a34a",
                        fontWeight: 500,
                      }}>{race.saveMsg}</span>
                    )}
                  </div>

                  {race.stations.length > 0 && (() => {
                    const sorted = [...race.stations].sort((a, b) => a.km - b.km);
                    const stops = [0, ...sorted.map(s => s.km)];
                    const gaps = stops.slice(1).map((km, i) => km - stops[i]);
                    const maxGap = Math.max(...gaps);
                    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                    return (
                      <div style={{ marginTop: 12, padding: "8px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#6b7280" }}>
                        Largest gap: <strong style={{ color: maxGap > 20 ? "#dc2626" : maxGap > 12 ? "#d97706" : "#111827" }}>{toDisp(maxGap).toFixed(1)} {unitLabel}</strong>
                        {" · "}Average gap: <strong style={{ color: "#111827" }}>{toDisp(avgGap).toFixed(1)} {unitLabel}</strong>
                        {" · "}{sorted.filter(s => s.dropBags).length > 0
                          ? <span style={{ color: "#2563eb" }}>Drop bags: ✓</span>
                          : <span>No drop bag support</span>}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 24 }}>No races match your search.</p>
        )}
      </div>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "4px 8px", fontSize: 10, fontWeight: 600,
  color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = { padding: "4px 8px", verticalAlign: "middle" };
const inputStyle: React.CSSProperties = {
  padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 4,
  fontSize: 12, width: 60, outline: "none",
};

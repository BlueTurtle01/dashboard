"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";

interface AthleteSearchHit {
  athlete_key: string;
  race_count: number;
  finish_count: number;
  first_result_year: number | null;
  last_result_year: number | null;
  career_span_years: number | null;
  avg_ascent_m: number | null;
  cluster_label: string | null;
}
interface AthleteProfile {
  athlete_key: string;
  gender: string | null;
  age_group: string | null;
  club: string | null;
  first_result_year: number | null;
  last_result_year: number | null;
}
interface AthleteRace {
  race_id: string;
  race_name: string;
  result_year: number;
  result_status: string;
  finish_seconds: number | null;
  position: number | null;
  age_group: string | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  total_finishers: number | null;
  cat_position: number | null;
  cat_finishers: number | null;
}
interface AthleteResponse {
  profile: AthleteProfile;
  races: AthleteRace[];
}

function fmtTime(s: number | null) {
  if (!s || s <= 0) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function statusBadge(status: string): { label: string; color: string } {
  if (status === "FINISHED" || status === "UNKNOWN") return { label: "Fin", color: "#2e7d32" };
  if (status === "DNF") return { label: "DNF", color: "#c0392b" };
  if (status === "DNS") return { label: "DNS", color: "#888" };
  return { label: status.slice(0, 3), color: "#888" };
}

function AthleteSearchCombobox({ onSelect, selectedKey }: { onSelect: (key: string) => void; selectedKey: string }) {
  const [query, setQuery]         = useState(selectedKey);
  const [hits, setHits]           = useState<AthleteSearchHit[]>([]);
  const [open, setOpen]           = useState(false);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedKey && !query) setQuery(selectedKey);
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const res = await fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(value.trim())}&limit=8`);
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
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder="Search athlete name…"
        onChange={e => handleInput(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "15px", color: "#111", background: "#fff", outline: "none", width: "300px" }}
      />
      {searching && <span style={{ position: "absolute", right: "14px", top: "12px", fontSize: "12px", color: "#aaa" }}>…</span>}
      {open && hits.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "#fff", border: "1px solid #ddd", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "340px", maxHeight: "340px", overflowY: "auto", marginTop: "4px" }}>
          {hits.map(h => (
            <button
              key={h.athlete_key}
              type="button"
              onClick={() => select(h)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f9f9f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#111" }}>{h.athlete_key}</div>
              <div style={{ fontSize: "12px", color: "#888", marginTop: "2px", display: "flex", gap: "10px" }}>
                <span>{h.race_count} race{h.race_count !== 1 ? "s" : ""}</span>
                {h.first_result_year && <span>{h.first_result_year}{h.last_result_year && h.last_result_year !== h.first_result_year ? `–${h.last_result_year}` : ""}</span>}
                {h.avg_ascent_m && <span>{Math.round(h.avg_ascent_m)}m avg ↑</span>}
                {h.cluster_label && <span style={{ color: "#1e3a1e", fontStyle: "italic" }}>{h.cluster_label}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AthleteHistoryPage() {
  const [athleteKey, setAthleteKey] = useState("");
  const [data, setData]             = useState<AthleteResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function loadAthlete(key: string) {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/race-readiness/athlete?key=${encodeURIComponent(key.trim())}`);
      if (!res.ok) { setError(`Failed to load athlete (${res.status})`); return; }
      setData(await res.json() as AthleteResponse);
    } catch {
      setError("Network error loading athlete.");
    } finally {
      setLoading(false);
    }
  }

  const thS: React.CSSProperties = {
    textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #1e3a1e",
    color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "12px",
  };
  const tdS: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee", fontSize: "13px" };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1e3a1e", marginBottom: "6px" }}>Athlete Race History</h1>
      <p style={{ fontSize: "13px", color: "#888", marginBottom: "28px" }}>Search an athlete to view their race history.</p>

      <AthleteSearchCombobox onSelect={key => { setAthleteKey(key); loadAthlete(key); }} selectedKey={athleteKey} />

      {loading && <div style={{ marginTop: "40px", color: "#888", fontSize: "14px" }}>Loading…</div>}
      {error   && <div style={{ marginTop: "40px", color: "#c0392b", fontSize: "14px" }}>{error}</div>}

      {data && (
        <div style={{ marginTop: "32px" }}>
          {/* Identity bubbles */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
            {[
              data.profile.gender    && { k: "Gender",   v: data.profile.gender },
              data.profile.age_group && { k: "Category", v: data.profile.age_group },
              data.profile.club      && { k: "Club",      v: data.profile.club },
            ].filter(Boolean).map((item, i) => {
              const { k, v } = item as { k: string; v: string };
              return (
                <div key={i} style={{ background: "#f5f5f5", borderRadius: "8px", padding: "10px 16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "#1e3a1e", marginTop: "2px" }}>{v}</div>
                </div>
              );
            })}
          </div>

          {/* Race history table — last 30 */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thS, width: "28%" }}>Race</th>
                <th style={{ ...thS, width: "7%" }}>Year</th>
                <th style={thS}>Status</th>
                <th style={thS}>Time</th>
                <th style={thS}>Position</th>
                <th style={thS}>Dist</th>
                <th style={thS}>Ascent</th>
                <th style={{ ...thS, width: "7%" }}>Cat</th>
              </tr>
            </thead>
            <tbody>
              {data.races.slice(0, 30).map((r, i) => {
                const { label, color } = statusBadge(r.result_status);
                const posPct = r.position && r.total_finishers
                  ? Math.round((r.position / r.total_finishers) * 100) : null;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ ...tdS, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.race_name}</td>
                    <td style={{ ...tdS, color: "#888" }}>{r.result_year}</td>
                    <td style={{ ...tdS, fontWeight: 600, color }}>{label}</td>
                    <td style={{ ...tdS, fontFamily: "monospace", fontSize: "12px" }}>{fmtTime(r.finish_seconds)}</td>
                    <td style={{ ...tdS, fontSize: "12px" }}>
                      {r.position ? (
                        <span>
                          {r.position}
                          {r.total_finishers ? <span style={{ color: "#aaa", fontSize: "11px" }}>/{r.total_finishers}</span> : ""}
                          {posPct !== null ? (
                            <span style={{ color: posPct <= 10 ? "#2e7d32" : posPct <= 25 ? "#1565c0" : "#888", fontSize: "11px", marginLeft: "4px" }}>
                              ({posPct}%)
                            </span>
                          ) : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ ...tdS, color: "#666" }}>{r.total_distance_km ? `${r.total_distance_km.toFixed(0)}km` : "—"}</td>
                    <td style={{ ...tdS, color: "#666" }}>{r.total_ascent_m ? `${Math.round(r.total_ascent_m)}m` : "—"}</td>
                    <td style={{ ...tdS, color: "#888", fontSize: "12px" }}>{r.age_group ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

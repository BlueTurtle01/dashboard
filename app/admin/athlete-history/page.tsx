"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";

/* ── Types (mirroring race-readiness API shapes) ── */
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
  race_count: number;
  finish_count: number;
  dnf_count: number;
  dnf_rate: number | null;
  avg_flat_equiv_km: number | null;
  max_flat_equiv_km: number | null;
  avg_ascent_m: number | null;
  max_ascent_m: number | null;
  first_result_year: number | null;
  last_result_year: number | null;
  career_span_years: number | null;
  cluster_label: string | null;
}
interface AthleteRace {
  race_id: string;
  race_name: string;
  result_year: number;
  result_status: string;
  finish_seconds: number | null;
  position: number | null;
  age_group: string | null;
  gender: string | null;
  club: string | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  flat_equivalent_km: number | null;
  total_finishers: number | null;
  cat_position: number | null;
  cat_finishers: number | null;
}
interface AthleteResponse {
  profile: AthleteProfile;
  races: AthleteRace[];
}

/* ── Helpers ── */
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

/* ── RaceHistoryRows ── */
function RaceHistoryRows({ races, highlightIds }: { races: AthleteRace[]; highlightIds?: Set<string> }) {
  const thS: React.CSSProperties = {
    textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #1e3a1e",
    color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "12px",
  };
  const tdS: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee", fontSize: "13px" };

  return (
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
        {races.map((r, i) => {
          const { label: statusLabel, color: statusColor } = statusBadge(r.result_status);
          const isHighlight = highlightIds?.has(`${r.race_id}|${r.result_year}`);
          const posPct = r.position && r.total_finishers
            ? Math.round((r.position / r.total_finishers) * 100) : null;
          const rowBg = isHighlight ? "#fffbf0" : i % 2 === 0 ? "#fff" : "#fafafa";
          return (
            <tr key={i} style={{ background: rowBg }}>
              <td style={{ ...tdS, fontWeight: isHighlight ? 600 : 400, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isHighlight && <span style={{ color: "#e65100", marginRight: "5px", fontSize: "11px" }}>★</span>}
                {r.race_name}
              </td>
              <td style={{ ...tdS, color: "#888" }}>{r.result_year}</td>
              <td style={{ ...tdS, fontWeight: 600, color: statusColor }}>{statusLabel}</td>
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
  );
}

/* ── Athlete Search Combobox ── */
function AthleteSearchCombobox({ onSelect, selectedKey }: { onSelect: (key: string) => void; selectedKey: string }) {
  const [query, setQuery]     = useState(selectedKey);
  const [hits, setHits]       = useState<AthleteSearchHit[]>([]);
  const [open, setOpen]       = useState(false);
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

/* ── Main Page ── */
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
      const json = await res.json() as AthleteResponse;
      setData(json);
    } catch {
      setError("Network error loading athlete.");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(key: string) {
    setAthleteKey(key);
    loadAthlete(key);
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: "11px", fontWeight: 700, color: "#1e3a1e", textTransform: "uppercase",
    letterSpacing: "0.08em", margin: "0 0 10px", borderBottom: "1px solid #e0e0e0", paddingBottom: "5px",
  };

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#1e3a1e", marginBottom: "6px" }}>Athlete Race History</h1>
      <p style={{ fontSize: "13px", color: "#888", marginBottom: "28px" }}>Search an athlete to view their full race history and career profile.</p>

      <AthleteSearchCombobox onSelect={handleSelect} selectedKey={athleteKey} />

      {loading && (
        <div style={{ marginTop: "40px", color: "#888", fontSize: "14px" }}>Loading…</div>
      )}

      {error && (
        <div style={{ marginTop: "40px", color: "#c0392b", fontSize: "14px" }}>{error}</div>
      )}

      {data && (() => {
        const p = data.profile;
        const races = data.races;

        const lastYear = p.last_result_year ?? new Date().getFullYear();
        const recentThreshold = lastYear - 1;
        const recentRaces = races.filter(r => r.result_year >= recentThreshold).slice(0, 10);

        const finished = races.filter(r => r.result_status === "FINISHED" && r.finish_seconds);
        const byPos    = [...finished].filter(r => r.position).sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
        const byDist   = [...finished].filter(r => r.total_distance_km).sort((a, b) => (b.total_distance_km ?? 0) - (a.total_distance_km ?? 0));
        const byAscent = [...finished].filter(r => r.total_ascent_m).sort((a, b) => (b.total_ascent_m ?? 0) - (a.total_ascent_m ?? 0));
        const earliest = [...races].sort((a, b) => a.result_year - b.result_year)[0];

        const uniqueById = (arr: AthleteRace[]) => {
          const seen = new Set<string>();
          return arr.filter(r => {
            const k = `${r.race_id}|${r.result_year}`;
            if (seen.has(k)) return false;
            seen.add(k); return true;
          });
        };

        const highlightRaces = uniqueById([
          ...(byPos[0] ? [byPos[0]] : []),
          ...(byDist[0] && byDist[0].total_distance_km !== byPos[0]?.total_distance_km ? [byDist[0]] : []),
          ...(byAscent[0] ? [byAscent[0]] : []),
          ...(earliest ? [earliest] : []),
        ].filter(r => !recentRaces.some(rr => rr.race_id === r.race_id && rr.result_year === r.result_year)));

        const highlightIds = new Set(highlightRaces.map(r => `${r.race_id}|${r.result_year}`));

        type Chip = { label: string; value: string; sub?: string; accent?: string };
        const chips: Chip[] = [
          { label: "Races",    value: String(p.race_count) },
          { label: "Finishes", value: String(p.finish_count) },
          ...(p.dnf_count > 0 ? [{ label: "DNFs", value: String(p.dnf_count), accent: "#c0392b" }] : []),
          ...(p.career_span_years ? [{ label: "Career Span", value: `${p.career_span_years} yr${p.career_span_years !== 1 ? "s" : ""}`, sub: `${p.first_result_year ?? ""}–${p.last_result_year ?? ""}` }] : []),
          ...(p.avg_ascent_m ? [{ label: "Avg Ascent", value: `${Math.round(p.avg_ascent_m)}m` }] : []),
          ...(p.max_ascent_m ? [{ label: "Max Ascent", value: `${Math.round(p.max_ascent_m)}m` }] : []),
          ...(p.avg_flat_equiv_km ? [{ label: "Avg Eq. Km", value: `${p.avg_flat_equiv_km.toFixed(1)} km` }] : []),
        ];

        const catRaces = recentRaces.filter(r => r.result_status === "FINISHED" && r.cat_position && r.age_group);

        return (
          <div style={{ marginTop: "32px" }}>
            {/* Identity row */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
              {[
                p.gender    && { k: "Gender",   v: p.gender },
                p.age_group && { k: "Category", v: p.age_group },
                p.club      && { k: "Club",      v: p.club },
                { k: "Active", v: `${p.first_result_year ?? "?"} – ${p.last_result_year ?? "?"}` },
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

            {/* Career stat chips */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "28px" }}>
              {chips.map((c, i) => (
                <div key={i} style={{ border: `1.5px solid ${c.accent ?? "#e0e0e0"}`, borderRadius: "20px", padding: "6px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ fontSize: "10px", color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: c.accent ?? "#222" }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize: "10px", color: "#bbb" }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Recent races */}
            {recentRaces.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                <p style={sectionLabel}>Recent Races (last 2 years)</p>
                <RaceHistoryRows races={recentRaces} />
              </div>
            )}

            {/* Category results */}
            {catRaces.length > 0 && (() => {
              const thC: React.CSSProperties = { textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "12px" };
              const tdC: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid #eee", fontSize: "13px" };
              return (
                <div style={{ marginBottom: "28px" }}>
                  <p style={sectionLabel}>Category Results (last 2 years)</p>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thC, width: "34%" }}>Race</th>
                        <th style={{ ...thC, width: "7%" }}>Year</th>
                        <th style={{ ...thC, width: "9%" }}>Cat</th>
                        <th style={thC}>Time</th>
                        <th style={thC}>Cat. Position</th>
                        <th style={thC}>Cat. Finishers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catRaces.map((r, i) => {
                        const catPct = r.cat_position && r.cat_finishers
                          ? Math.round((r.cat_position / r.cat_finishers) * 100) : null;
                        return (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...tdC, maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.race_name}</td>
                            <td style={{ ...tdC, color: "#888" }}>{r.result_year}</td>
                            <td style={{ ...tdC, fontSize: "12px", color: "#555" }}>{r.age_group}</td>
                            <td style={{ ...tdC, fontFamily: "monospace", fontSize: "12px" }}>{fmtTime(r.finish_seconds)}</td>
                            <td style={tdC}>
                              {r.cat_position}
                              {r.cat_finishers ? <span style={{ color: "#aaa", fontSize: "11px" }}>/{r.cat_finishers}</span> : ""}
                            </td>
                            <td style={tdC}>
                              {catPct !== null && (
                                <span style={{ color: catPct <= 10 ? "#2e7d32" : catPct <= 25 ? "#1565c0" : "#888", fontSize: "13px", fontWeight: 600 }}>
                                  top {catPct}%
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Career highlights */}
            {highlightRaces.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                <p style={sectionLabel}>Career Highlights ★</p>
                <RaceHistoryRows races={highlightRaces} highlightIds={highlightIds} />
              </div>
            )}

            {/* Full history */}
            {races.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                <p style={sectionLabel}>Full Race History ({races.length} races)</p>
                <RaceHistoryRows races={races} highlightIds={highlightIds} />
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type {
  AlAthleteProjection,
  AlClusterSummary,
  AthleteDetail,
  AthleteSearchResult,
  PipelineRun,
  PipelineStatus,
  TestAthleteResult,
} from "@/lib/types/athlete-similarity";

// ── Colours ───────────────────────────────────────────────────────────────────
const CLUSTER_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#ea580c", "#7c3aed",
  "#0891b2", "#be185d", "#92400e", "#374151", "#059669",
  "#b45309", "#6d28d9", "#0f766e", "#b91c1c", "#1d4ed8",
];
const OUTLIER_COLOR = "#d1d5db";
const HIGHLIGHT_COLOR = "#f59e0b";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(decimals);
}

function fmtSeconds(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "16px 20px",
};

const btn = (color = "#2563eb", small = false): React.CSSProperties => ({
  padding: small ? "4px 10px" : "7px 16px",
  background: color + "18",
  color,
  border: `1px solid ${color}40`,
  borderRadius: 6,
  cursor: "pointer",
  fontSize: small ? 12 : 13,
  fontWeight: 500,
  whiteSpace: "nowrap" as const,
});

const input: React.CSSProperties = {
  padding: "7px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

const th: React.CSSProperties = {
  padding: "8px 12px",
  textAlign: "left" as const,
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap" as const,
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#374151",
  borderBottom: "1px solid #f3f4f6",
};

const STEPS = [
  { key: "profiles",      label: "Rebuild Profiles" },
  { key: "similarities",  label: "Calculate Similarities" },
  { key: "clustering",    label: "Run Clustering" },
  { key: "summaries",     label: "Generate Summaries" },
  { key: "projection",    label: "Calculate Projection" },
  { key: "all",           label: "Run Full Pipeline" },
] as const;

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<Record<string, string>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const runStartRef = useRef<number>(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [params, setParams] = useState({
    minRaces: 2,
    topN: 50,
    simThreshold: 0.7,
    clusterMethod: "auto",
    kmeansK: 8,
  });

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/admin/athlete-similarity");
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
    return stopPolling;
  }, [loadStatus, stopPolling]);

  function getLastRun(step: string): PipelineRun | undefined {
    return status?.recentRuns.find((r) => r.step === step || (step === "all" && r.step === "all"));
  }

  async function triggerStep(step: string) {
    setRunning(step);
    setElapsedSeconds(0);
    runStartRef.current = Date.now();
    setRunLogs((prev) => ({ ...prev, [step]: "" }));

    const res = await fetch("/api/admin/athlete-similarity/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, params }),
    });

    if (!res.ok) {
      const body = await res.json();
      setRunLogs((prev) => ({ ...prev, [step]: `Error: ${body.error}` }));
      setRunning(null);
      return;
    }

    const { run_id } = await res.json();

    // Elapsed time counter — updates every second
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - runStartRef.current) / 1000));
    }, 1000);

    // Status poll — every 3 seconds
    pollIntervalRef.current = setInterval(async () => {
      const pollRes = await fetch("/api/admin/athlete-similarity");
      if (!pollRes.ok) return;
      const data: PipelineStatus = await pollRes.json();
      setStatus(data);
      const run = data.recentRuns.find((r) => r.id === run_id);
      if (run && run.status !== "running") {
        stopPolling();
        setRunning(null);
        setRunLogs((prev) => ({
          ...prev,
          [step]: run.status === "done"
            ? `Done at ${new Date(run.finished_at ?? "").toLocaleTimeString()}`
            : `Error: ${run.error_msg ?? "Unknown error"}`,
        }));
      }
    }, 3000);
  }

  function fmtElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  const isStalled = running !== null && elapsedSeconds > 600;

  const counts = status?.counts;
  const statCards = [
    { label: "Athlete Profiles",   value: counts?.profiles ?? 0 },
    { label: "Similarity Links",   value: counts?.similarities ?? 0 },
    { label: "Clusters",           value: counts?.clusterSummaries ?? 0 },
    { label: "Projection Points",  value: counts?.projectionPoints ?? 0 },
  ];

  const warnings: string[] = [];
  if (counts?.profiles === 0) warnings.push("No athlete profiles — run 'Rebuild Profiles' first.");
  if (counts?.clusterSummaries === 0 && (counts?.profiles ?? 0) > 0) warnings.push("No clusters computed yet.");
  if (counts?.projectionPoints === 0 && (counts?.profiles ?? 0) > 0) warnings.push("No projection data — scatter plot will be empty.");

  if (loading) return <div style={{ color: "#6b7280", fontSize: 14, padding: 24 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Run status banner */}
      {running !== null && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          background: isStalled ? "#fef3c7" : "#eff6ff",
          border: `1px solid ${isStalled ? "#fcd34d" : "#93c5fd"}`,
          borderRadius: 8, padding: "12px 16px",
        }}>
          {/* Pulsing dot */}
          <span style={{
            display: "inline-block", width: 10, height: 10, borderRadius: "50%",
            background: isStalled ? "#f59e0b" : "#2563eb",
            boxShadow: isStalled ? "0 0 0 3px #fde68a" : "0 0 0 3px #bfdbfe",
            animation: "pulse 1.5s infinite",
            flexShrink: 0,
          }} />
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
          <span style={{ fontSize: 14, fontWeight: 600, color: isStalled ? "#92400e" : "#1d4ed8" }}>
            {STEPS.find((s) => s.key === running)?.label ?? running} running…
          </span>
          <span style={{ fontSize: 13, color: isStalled ? "#92400e" : "#3b82f6", fontVariantNumeric: "tabular-nums" }}>
            {fmtElapsed(elapsedSeconds)} elapsed
          </span>
          {isStalled && (
            <span style={{ fontSize: 12, color: "#b45309", marginLeft: 4 }}>
              — may have stalled, check server logs
            </span>
          )}
          <button
            onClick={() => { stopPolling(); setRunning(null); setRunLogs((p) => ({ ...p, [running]: "Cancelled (still running server-side)" })); }}
            style={{ ...btn("#6b7280", true), marginLeft: "auto" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {statCards.map((s) => (
          <div key={s.label} style={{ ...card, textAlign: "center" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>
              {s.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "10px 14px" }}>
          {warnings.map((w) => (
            <div key={w} style={{ fontSize: 13, color: "#92400e" }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Pipeline controls */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>Pipeline Steps</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STEPS.map(({ key, label }) => {
              const lastRun = getLastRun(key);
              const isRunning = running === key || (running === "all" && key !== "all");
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    onClick={() => triggerStep(key)}
                    disabled={running !== null}
                    style={{
                      ...btn(key === "all" ? "#7c3aed" : "#2563eb"),
                      minWidth: 190,
                      opacity: running !== null ? 0.6 : 1,
                    }}
                  >
                    {isRunning ? `Running… ${fmtElapsed(elapsedSeconds)}` : label}
                  </button>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    {runLogs[key]
                      ? runLogs[key]
                      : lastRun
                      ? `${lastRun.status === "done" ? "✓" : lastRun.status === "error" ? "✗" : "…"} ${relativeTime(lastRun.started_at)}`
                      : "Never run"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 14px" }}>Pipeline Settings</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(
              [
                { key: "minRaces",     label: "Min races per athlete", type: "number" },
                { key: "topN",         label: "Top-N similar stored",  type: "number" },
                { key: "simThreshold", label: "Similarity threshold",  type: "number", step: "0.05" },
                { key: "kmeansK",      label: "KMeans k",              type: "number" },
              ] as { key: keyof typeof params; label: string; type: string; step?: string }[]
            ).map(({ key, label, type, step }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 12, color: "#6b7280", minWidth: 160 }}>{label}</label>
                <input
                  type={type}
                  step={step}
                  value={params[key]}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, [key]: parseFloat(e.target.value) }))
                  }
                  style={{ ...input, width: 80 }}
                />
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12, color: "#6b7280", minWidth: 160 }}>Cluster method</label>
              <select
                value={params.clusterMethod}
                onChange={(e) => setParams((p) => ({ ...p, clusterMethod: e.target.value }))}
                style={{ ...input, width: 130 }}
              >
                {["auto", "hdbscan", "dbscan", "kmeans"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Recent runs log */}
      {(status?.recentRuns.length ?? 0) > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Recent Pipeline Runs</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Step", "Status", "Started", "Duration", "Error"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(status?.recentRuns ?? []).slice(0, 10).map((run) => {
                const dur = run.finished_at
                  ? `${Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                  : "—";
                return (
                  <tr key={run.id}>
                    <td style={td}>{run.step}</td>
                    <td style={td}>
                      <span style={{
                        color: run.status === "done" ? "#16a34a" : run.status === "error" ? "#dc2626" : "#d97706",
                        fontWeight: 500,
                      }}>
                        {run.status}
                      </span>
                    </td>
                    <td style={td}>{relativeTime(run.started_at)}</td>
                    <td style={td}>{dur}</td>
                    <td style={{ ...td, color: "#dc2626", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {run.error_msg ?? ""}
                    </td>
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

// ── Athlete Search Tab ────────────────────────────────────────────────────────
function AthleteSearchTab() {
  const [search, setSearch] = useState("");
  const [athletes, setAthletes] = useState<AthleteSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<AthleteDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (search.length < 2) { setAthletes([]); return; }
      setLoading(true);
      fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(search)}&limit=30`)
        .then((r) => r.json())
        .then((d) => setAthletes(d.athletes ?? []))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function expand(key: string) {
    if (expanded === key) { setExpanded(null); setDetail(null); return; }
    setExpanded(key);
    setDetail(null);
    setDetailLoading(true);
    const res = await fetch(`/api/admin/athlete-similarity/athletes/${encodeURIComponent(key)}`);
    if (res.ok) {
      const d = await res.json();
      setDetail(d.athlete);
    }
    setDetailLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input
        placeholder="Search athlete by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...input, maxWidth: 420 }}
      />
      {loading && <div style={{ color: "#6b7280", fontSize: 13 }}>Searching…</div>}
      {athletes.length > 0 && (
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Races", "Finish", "DNF%", "Avg dist km", "Avg ascent m", "Perf index", "Cluster", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => (
                <>
                  <tr key={a.athlete_key} style={{ cursor: "pointer" }}
                    onClick={() => expand(a.athlete_key)}>
                    <td style={{ ...td, fontWeight: 500 }}>{a.athlete_key}</td>
                    <td style={td}>{a.race_count}</td>
                    <td style={td}>{a.finish_count}</td>
                    <td style={td}>{a.dnf_rate !== null ? `${(a.dnf_rate * 100).toFixed(0)}%` : "—"}</td>
                    <td style={td}>{fmt(a.avg_flat_equiv_km)}</td>
                    <td style={td}>{fmt(a.avg_ascent_m, 0)}</td>
                    <td style={td}>{fmt(a.avg_perf_index, 3)}</td>
                    <td style={td}>{a.cluster_label ?? (a.cluster_id !== null ? `Cluster ${a.cluster_id}` : "—")}</td>
                    <td style={td}>{expanded === a.athlete_key ? "▲" : "▼"}</td>
                  </tr>
                  {expanded === a.athlete_key && (
                    <tr key={`${a.athlete_key}_detail`}>
                      <td colSpan={9} style={{ padding: 0 }}>
                        {detailLoading ? (
                          <div style={{ padding: 16, color: "#6b7280" }}>Loading…</div>
                        ) : detail ? (
                          <AthleteDetailPanel detail={detail} />
                        ) : null}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {search.length >= 2 && !loading && athletes.length === 0 && (
        <div style={{ color: "#9ca3af", fontSize: 13 }}>No athlete profiles found. Run the pipeline first.</div>
      )}
    </div>
  );
}

function AthleteDetailPanel({ detail }: { detail: AthleteDetail }) {
  return (
    <div style={{ background: "#f9fafb", padding: "16px 20px", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Similar athletes */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>
            Top Similar Athletes
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Athlete", "Score", "Cluster", "Dist", "Ascent"].map((h) => (
                  <th key={h} style={{ ...th, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.similar_athletes.slice(0, 10).map((s) => (
                <tr key={s.athlete_key}>
                  <td style={{ ...td, fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.athlete_key}</td>
                  <td style={{ ...td, fontSize: 12 }}>{s.cosine_score.toFixed(3)}</td>
                  <td style={{ ...td, fontSize: 12 }}>{s.cluster_label ?? "—"}</td>
                  <td style={{ ...td, fontSize: 12 }}>{fmt(s.avg_flat_equiv_km)} km</td>
                  <td style={{ ...td, fontSize: 12 }}>{fmt(s.avg_ascent_m, 0)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Race history */}
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>
            Race History ({detail.races.length} races)
          </h4>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Race", "Year", "Status", "Time", "Dist", "Asc"].map((h) => (
                    <th key={h} style={{ ...th, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.races.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.race_name}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.result_year ?? "—"}</td>
                    <td style={{ ...td, fontSize: 12, color: r.result_status === "DNF" ? "#dc2626" : "#374151" }}>
                      {r.result_status}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>{fmtSeconds(r.finish_seconds ?? undefined)}</td>
                    <td style={{ ...td, fontSize: 12 }}>{fmt(r.flat_equivalent_km)} km</td>
                    <td style={{ ...td, fontSize: 12 }}>{fmt(r.total_ascent_m, 0)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Test Athlete Tab ──────────────────────────────────────────────────────────
const VECTOR_FIELDS = [
  { key: "avg_perf_index",       label: "Avg perf index",       hint: "1.0 = average pace vs field; <1 = faster" },
  { key: "dnf_rate",             label: "DNF rate",             hint: "0.0–1.0" },
  { key: "avg_flat_equiv_km",    label: "Avg flat equiv km",    hint: "Typical race distance" },
  { key: "avg_ascent_m",         label: "Avg ascent m",         hint: "Typical elevation gain" },
  { key: "avg_difficulty_ratio", label: "Avg difficulty ratio", hint: "1.0 = average difficulty" },
  { key: "max_flat_equiv_km",    label: "Max flat equiv km",    hint: "Longest race attempted" },
  { key: "career_span_years",    label: "Career span years",    hint: "Years between first and last race" },
  { key: "finish_count_log",     label: "Finish count (log)",   hint: "log(1 + number of finishes)" },
] as const;

const DEFAULT_VECTOR = { avg_perf_index: 1.0, dnf_rate: 0.0, avg_flat_equiv_km: 10.0, avg_ascent_m: 0.0, avg_difficulty_ratio: 1.0, max_flat_equiv_km: 10.0, career_span_years: 1.0, finish_count_log: 0.0 };

function TestAthleteTab() {
  const [mode, setMode] = useState<"existing" | "manual">("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AthleteSearchResult[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [manualVec, setManualVec] = useState({ ...DEFAULT_VECTOR });
  const [results, setResults] = useState<TestAthleteResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "existing" || searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(searchQuery)}&limit=10`)
        .then((r) => r.json())
        .then((d) => setSearchResults(d.athletes ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, mode]);

  async function runTest() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const body =
        mode === "existing"
          ? { mode: "existing", athlete_key: selectedKey, top_n: 20 }
          : { mode: "manual", vector: VECTOR_FIELDS.map((f) => manualVec[f.key]), top_n: 20 };
      const res = await fetch("/api/admin/athlete-similarity/test-athlete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResults(data.results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Mode switcher */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["existing", "manual"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              ...btn(m === mode ? "#2563eb" : "#6b7280"),
              background: m === mode ? "#2563eb18" : "transparent",
            }}>
            {m === "existing" ? "Mode A: Existing Athlete" : "Mode B: Manual Profile"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Input panel */}
        <div style={card}>
          {mode === "existing" ? (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Find Similar to Existing Athlete</h3>
              <input
                placeholder="Search athlete name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...input, marginBottom: 8 }}
              />
              {searchResults.length > 0 && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                  {searchResults.map((a) => (
                    <div
                      key={a.athlete_key}
                      onClick={() => { setSelectedKey(a.athlete_key); setSearchResults([]); setSearchQuery(a.athlete_key); }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        cursor: "pointer",
                        background: selectedKey === a.athlete_key ? "#eff6ff" : "#fff",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {a.athlete_key}
                      <span style={{ color: "#9ca3af", marginLeft: 8, fontSize: 12 }}>
                        {a.race_count} races · {a.cluster_label ?? "no cluster"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {selectedKey && (
                <div style={{ fontSize: 13, color: "#16a34a", marginBottom: 12 }}>
                  Selected: <strong>{selectedKey}</strong>
                </div>
              )}
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Manual Profile Entry</h3>
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 12 }}>
                Enter raw feature values (not pre-standardised). These will be normalised before similarity computation.
              </p>
              {VECTOR_FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: "#374151", minWidth: 180 }} title={f.hint}>
                    {f.label}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={manualVec[f.key]}
                    onChange={(e) =>
                      setManualVec((p) => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))
                    }
                    style={{ ...input, width: 100 }}
                  />
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{f.hint}</span>
                </div>
              ))}
            </>
          )}
          <button
            onClick={runTest}
            disabled={loading || (mode === "existing" && !selectedKey)}
            style={{ ...btn("#2563eb"), opacity: loading || (mode === "existing" && !selectedKey) ? 0.5 : 1 }}
          >
            {loading ? "Computing…" : "Find Similar Athletes"}
          </button>
          {error && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>

        {/* Results panel */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>
            Results {results ? `(${results.length})` : ""}
          </h3>
          {!results && !loading && (
            <div style={{ color: "#9ca3af", fontSize: 13 }}>Run the test to see results.</div>
          )}
          {loading && <div style={{ color: "#6b7280", fontSize: 13 }}>Computing similarity…</div>}
          {results && (
            <div style={{ maxHeight: 480, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["#", "Athlete", "Score", "Cluster", "Dist", "Asc", "Reasons"].map((h) => (
                      <th key={h} style={{ ...th, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.athlete_key}>
                      <td style={{ ...td, fontSize: 12, color: "#9ca3af" }}>{r.rank}</td>
                      <td style={{ ...td, fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.athlete_key}</td>
                      <td style={{ ...td, fontSize: 12, fontWeight: 500, color: "#2563eb" }}>{r.cosine_score.toFixed(3)}</td>
                      <td style={{ ...td, fontSize: 12 }}>{r.cluster_label ?? "—"}</td>
                      <td style={{ ...td, fontSize: 12 }}>{fmt(r.avg_flat_equiv_km)} km</td>
                      <td style={{ ...td, fontSize: 12 }}>{fmt(r.avg_ascent_m, 0)} m</td>
                      <td style={{ ...td, fontSize: 11, color: "#6b7280" }}>{r.similarity_reasons.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cluster Visualisation Tab ─────────────────────────────────────────────────
interface ProjectionPoint extends AlAthleteProjection {
  cluster_label?: string | null;
}

function ClusterVizTab() {
  const [points, setPoints] = useState<ProjectionPoint[]>([]);
  const [summaries, setSummaries] = useState<AlClusterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [highlight, setHighlight] = useState("");
  const [showOutliers, setShowOutliers] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/athlete-similarity/projection").then((r) => r.json()),
      fetch("/api/admin/athlete-similarity/clusters").then((r) => r.json()),
    ])
      .then(([proj, cls]) => {
        setPoints(proj.points ?? []);
        setSummaries(cls.clusters ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      if (!showOutliers && p.cluster_id === -1) return false;
      if (selectedCluster !== null && p.cluster_id !== selectedCluster) return false;
      return true;
    });
  }, [points, showOutliers, selectedCluster]);

  const byCluster = useMemo(() => {
    const map = new Map<number, ProjectionPoint[]>();
    for (const p of filteredPoints) {
      const cid = p.cluster_id ?? -1;
      const arr = map.get(cid) ?? [];
      arr.push(p);
      map.set(cid, arr);
    }
    return map;
  }, [filteredPoints]);

  const summaryMap = useMemo(() => {
    const m: Record<number, string> = {};
    for (const s of summaries) {
      m[s.cluster_id] = s.custom_label ?? s.auto_label ?? `Cluster ${s.cluster_id}`;
    }
    return m;
  }, [summaries]);

  const clusterEntries = useMemo(
    () => [...byCluster.entries()].sort((a, b) => a[0] - b[0]),
    [byCluster],
  );

  const CustomTooltipContent = ({ active, payload }: { active?: boolean; payload?: { payload: ProjectionPoint }[] }) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px", fontSize: 12 }}>
        <p style={{ fontWeight: 700, margin: "0 0 4px", color: "#111827" }}>{d.athlete_key}</p>
        <p style={{ margin: "0 0 2px", color: "#6b7280" }}>{d.race_count ?? "?"} races</p>
        <p style={{ margin: 0, color: "#6b7280" }}>
          {d.cluster_id === -1 ? "Outlier" : (summaryMap[d.cluster_id ?? -1] ?? `Cluster ${d.cluster_id}`)}
        </p>
      </div>
    );
  };

  if (loading) return <div style={{ color: "#6b7280", fontSize: 14, padding: 24 }}>Loading projection data…</div>;

  if (points.length === 0) {
    return (
      <div style={{ ...card, color: "#6b7280", fontSize: 13 }}>
        No projection data. Run the pipeline first (including the Projection step).
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedCluster ?? ""}
          onChange={(e) => setSelectedCluster(e.target.value === "" ? null : parseInt(e.target.value, 10))}
          style={{ ...input, width: 220 }}
        >
          <option value="">All clusters ({points.length} athletes)</option>
          {summaries.map((s) => (
            <option key={s.cluster_id} value={s.cluster_id}>
              {s.custom_label ?? s.auto_label ?? `Cluster ${s.cluster_id}`} ({s.athlete_count})
            </option>
          ))}
        </select>
        <input
          placeholder="Highlight athlete…"
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
          style={{ ...input, width: 200 }}
        />
        <label style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={showOutliers}
            onChange={(e) => setShowOutliers(e.target.checked)}
          />
          Show outliers
        </label>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          {filteredPoints.length.toLocaleString()} points shown
          {points[0]?.proj_method ? ` · ${points[0].proj_method.toUpperCase()} projection` : ""}
        </span>
      </div>

      {/* Scatter chart */}
      <div style={{ ...card, padding: "16px 8px" }}>
        <ResponsiveContainer width="100%" height={500}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="proj_x" type="number" domain={["auto", "auto"]}
              tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis dataKey="proj_y" type="number" domain={["auto", "auto"]}
              tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <ZAxis range={[25, 25]} />
            <Tooltip content={<CustomTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {clusterEntries.map(([cid, clusterPts], idx) => {
              const label = cid === -1 ? "Outliers" : (summaryMap[cid] ?? `Cluster ${cid}`);
              const baseColor = cid === -1 ? OUTLIER_COLOR : CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
              return (
                <Scatter key={cid} name={label} data={clusterPts} fill={baseColor} opacity={0.75}>
                  {clusterPts.map((p) => {
                    const isHighlight = highlight.length > 1 &&
                      p.athlete_key.toLowerCase().includes(highlight.toLowerCase());
                    return (
                      <Cell
                        key={p.athlete_key}
                        fill={isHighlight ? HIGHLIGHT_COLOR : baseColor}
                        strokeWidth={isHighlight ? 2 : 0}
                        stroke={isHighlight ? "#d97706" : "none"}
                      />
                    );
                  })}
                </Scatter>
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Cluster summary table */}
      {summaries.length > 0 && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Cluster Summaries</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["ID", "Label", "Athletes", "Races (med)", "Dist km (med)", "Ascent m (med)", "DNF rate (med)", "Perf index (med)"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr
                  key={s.cluster_id}
                  style={{ cursor: "pointer", background: selectedCluster === s.cluster_id ? "#eff6ff" : "transparent" }}
                  onClick={() => setSelectedCluster(selectedCluster === s.cluster_id ? null : s.cluster_id)}
                >
                  <td style={{ ...td, fontWeight: 500, color: s.cluster_id === -1 ? "#9ca3af" : "#374151" }}>
                    {s.cluster_id}
                  </td>
                  <td style={{ ...td, fontWeight: 500 }}>{s.custom_label ?? s.auto_label ?? "—"}</td>
                  <td style={td}>{s.athlete_count.toLocaleString()}</td>
                  <td style={td}>{fmt(s.median_race_count, 0)}</td>
                  <td style={td}>{fmt(s.median_flat_equiv)}</td>
                  <td style={td}>{fmt(s.median_ascent_m, 0)}</td>
                  <td style={td}>{s.median_dnf_rate !== null ? `${(s.median_dnf_rate * 100).toFixed(1)}%` : "—"}</td>
                  <td style={td}>{fmt(s.median_perf_index, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Readiness Check Tab ───────────────────────────────────────────────────────

type FitRating = "covered" | "stretch" | "significant_gap";
type ReadinessRating = "well_prepared" | "ready_with_caveats" | "a_step_up" | "major_challenge";
type RaceListItem = { id: string; name: string; race_year: number | null };

interface GapDimension { rating: FitRating; [k: string]: number | null | FitRating }
interface ReadinessResult {
  athlete_key: string;
  race_name: string;
  gap_analysis: {
    distance:   { athlete_max_km: number | null; race_requires_km: number | null; rating: FitRating };
    elevation:  { athlete_max_m: number | null;  race_requires_m: number | null;  rating: FitRating };
    difficulty: { athlete_avg: number | null;    race_ratio: number | null;        rating: FitRating };
  };
  peer_outcome: {
    similar_entrants: number; finish_rate: number | null;
    avg_finish_seconds: number | null; best_finish_seconds: number | null; limited_data: boolean;
  };
  cluster_outcome: {
    cluster_id: number | null; cluster_label: string | null;
    cluster_entrants: number; cluster_finish_rate: number | null;
  };
  own_history: { year: number | null; result_status: string; finish_seconds: number | null; position: number | null }[];
  overall_rating: ReadinessRating;
  rating_reason: string;
}

const RATING_CONFIG: Record<ReadinessRating, { label: string; color: string; bg: string }> = {
  well_prepared:      { label: "Well Prepared",       color: "#16a34a", bg: "#f0fdf4" },
  ready_with_caveats: { label: "Ready with Caveats",  color: "#d97706", bg: "#fffbeb" },
  a_step_up:          { label: "A Step Up",           color: "#ea580c", bg: "#fff7ed" },
  major_challenge:    { label: "Major Challenge",     color: "#dc2626", bg: "#fef2f2" },
};

const FIT_CONFIG: Record<FitRating, { label: string; color: string }> = {
  covered:          { label: "Covered",         color: "#16a34a" },
  stretch:          { label: "Stretch",         color: "#d97706" },
  significant_gap:  { label: "Significant Gap", color: "#dc2626" },
};

function ReadinessStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}

function GapCard({ label, leftLabel, leftVal, rightLabel, rightVal, unit, rating }: {
  label: string; leftLabel: string; leftVal: string;
  rightLabel: string; rightVal: string; unit: string; rating: FitRating;
}) {
  const rc = FIT_CONFIG[rating];
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ minWidth: 90, fontSize: 13, fontWeight: 600, color: "#374151" }}>{label}</div>
      <div style={{ flex: 1, fontSize: 13, color: "#6b7280" }}>
        {leftLabel}: <strong style={{ color: "#111827" }}>{leftVal}</strong>
        <span style={{ margin: "0 6px", color: "#d1d5db" }}>·</span>
        {rightLabel}: <strong style={{ color: "#111827" }}>{rightVal}</strong>
        <span style={{ marginLeft: 6, fontSize: 12, color: "#9ca3af" }}>{unit}</span>
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: rc.color,
        background: rc.color + "18", border: `1px solid ${rc.color}30`,
        borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>
        {rc.label}
      </span>
    </div>
  );
}

function ReadinessTab() {
  const [athleteSearch, setAthleteSearch]     = useState("");
  const [athleteResults, setAthleteResults]   = useState<AthleteSearchResult[]>([]);
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteSearchResult | null>(null);
  const [raceSearch, setRaceSearch]           = useState("");
  const [raceResults, setRaceResults]         = useState<RaceListItem[]>([]);
  const [allRaces, setAllRaces]               = useState<RaceListItem[]>([]);
  const [selectedRace, setSelectedRace]       = useState<RaceListItem | null>(null);
  const [assessment, setAssessment]           = useState<ReadinessResult | null>(null);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // Pre-fetch all races once
  useEffect(() => {
    fetch("/api/admin/races")
      .then((r) => r.json())
      .then((d) => setAllRaces(d.races ?? []));
  }, []);

  // Debounced athlete search
  useEffect(() => {
    if (athleteSearch.length < 2) { setAthleteResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/athlete-similarity/athletes?search=${encodeURIComponent(athleteSearch)}&limit=10`)
        .then((r) => r.json())
        .then((d) => setAthleteResults(d.athletes ?? []));
    }, 300);
    return () => clearTimeout(t);
  }, [athleteSearch]);

  // Client-side race filter
  useEffect(() => {
    if (raceSearch.length < 2) { setRaceResults([]); return; }
    const q = raceSearch.toLowerCase();
    setRaceResults(allRaces.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 15));
  }, [raceSearch, allRaces]);

  async function checkReadiness() {
    if (!selectedAthlete || !selectedRace) return;
    setLoading(true);
    setError(null);
    setAssessment(null);
    try {
      const url = `/api/admin/athlete-similarity/readiness?athlete_key=${encodeURIComponent(selectedAthlete.athlete_key)}&race_id=${encodeURIComponent(selectedRace.id)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setAssessment(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const canCheck = selectedAthlete !== null && selectedRace !== null && !loading;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Input panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Athlete search */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Select Athlete</h3>
          <input
            placeholder="Search athlete name…"
            value={athleteSearch}
            onChange={(e) => { setAthleteSearch(e.target.value); setSelectedAthlete(null); setAssessment(null); }}
            style={input}
          />
          {athleteResults.length > 0 && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, marginTop: 4, overflow: "hidden" }}>
              {athleteResults.map((a) => (
                <div key={a.athlete_key}
                  onClick={() => { setSelectedAthlete(a); setAthleteSearch(a.athlete_key); setAthleteResults([]); }}
                  style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer",
                    background: "#fff", borderBottom: "1px solid #f3f4f6" }}>
                  {a.athlete_key}
                  <span style={{ color: "#9ca3af", marginLeft: 8, fontSize: 12 }}>
                    {a.race_count} races{a.cluster_label ? ` · ${a.cluster_label}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
          {selectedAthlete && (
            <div style={{ fontSize: 13, color: "#16a34a", marginTop: 8 }}>
              Selected: <strong>{selectedAthlete.athlete_key}</strong>
            </div>
          )}
        </div>

        {/* Race search */}
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Select Race</h3>
          <input
            placeholder="Search race name…"
            value={raceSearch}
            onChange={(e) => { setRaceSearch(e.target.value); setSelectedRace(null); setAssessment(null); }}
            style={input}
          />
          {raceResults.length > 0 && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, marginTop: 4, overflow: "hidden" }}>
              {raceResults.map((r) => (
                <div key={r.id}
                  onClick={() => {
                    setSelectedRace(r);
                    setRaceSearch(r.name + (r.race_year ? ` (${r.race_year})` : ""));
                    setRaceResults([]);
                  }}
                  style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer",
                    background: "#fff", borderBottom: "1px solid #f3f4f6" }}>
                  {r.name}
                  {r.race_year && <span style={{ color: "#9ca3af", marginLeft: 8, fontSize: 12 }}>{r.race_year}</span>}
                </div>
              ))}
            </div>
          )}
          {selectedRace && (
            <div style={{ fontSize: 13, color: "#16a34a", marginTop: 8 }}>
              Selected: <strong>{selectedRace.name}</strong>
              {selectedRace.race_year && <span style={{ color: "#6b7280" }}> ({selectedRace.race_year})</span>}
            </div>
          )}
        </div>
      </div>

      {/* Check button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={checkReadiness} disabled={!canCheck}
          style={{ ...btn("#2563eb"), opacity: canCheck ? 1 : 0.5 }}>
          {loading ? "Checking…" : "Check Readiness"}
        </button>
        {error && <span style={{ fontSize: 13, color: "#dc2626" }}>{error}</span>}
      </div>

      {/* Results */}
      {assessment && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Header */}
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>
            {assessment.athlete_key}
            <span style={{ color: "#9ca3af", fontWeight: 400 }}> → </span>
            {assessment.race_name}
          </h2>

          {/* Overall badge */}
          {(() => {
            const c = RATING_CONFIG[assessment.overall_rating];
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 12,
                background: c.bg, border: `1px solid ${c.color}30`,
                borderRadius: 8, padding: "12px 16px" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.label}</span>
                <span style={{ fontSize: 13, color: "#374151" }}>{assessment.rating_reason}</span>
              </div>
            );
          })()}

          {/* Gap analysis */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: -6 }}>
            Course Fit
          </div>
          <GapCard label="Distance"
            leftLabel="Your max" leftVal={assessment.gap_analysis.distance.athlete_max_km !== null ? `${fmt(assessment.gap_analysis.distance.athlete_max_km)} km` : "—"}
            rightLabel="Race requires" rightVal={assessment.gap_analysis.distance.race_requires_km !== null ? `${fmt(assessment.gap_analysis.distance.race_requires_km)} km` : "No profile"}
            unit="flat equiv" rating={assessment.gap_analysis.distance.rating} />
          <GapCard label="Elevation"
            leftLabel="Your max" leftVal={assessment.gap_analysis.elevation.athlete_max_m !== null ? `${fmt(assessment.gap_analysis.elevation.athlete_max_m, 0)} m` : "—"}
            rightLabel="Race requires" rightVal={assessment.gap_analysis.elevation.race_requires_m !== null ? `${fmt(assessment.gap_analysis.elevation.race_requires_m, 0)} m` : "No profile"}
            unit="ascent" rating={assessment.gap_analysis.elevation.rating} />
          <GapCard label="Difficulty"
            leftLabel="Your avg" leftVal={assessment.gap_analysis.difficulty.athlete_avg !== null ? fmt(assessment.gap_analysis.difficulty.athlete_avg, 2) : "—"}
            rightLabel="Race ratio" rightVal={assessment.gap_analysis.difficulty.race_ratio !== null ? fmt(assessment.gap_analysis.difficulty.race_ratio, 2) : "No profile"}
            unit="difficulty ratio" rating={assessment.gap_analysis.difficulty.rating} />

          {/* Peer outcome */}
          <div style={card}>
            <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>
              Peer Outcome
              <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
                (athletes most similar to you)
              </span>
            </h4>
            {assessment.peer_outcome.similar_entrants === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
                None of your 50 most similar athletes have entered this race.
              </p>
            ) : (
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end" }}>
                <ReadinessStat label="Similar entrants" value={String(assessment.peer_outcome.similar_entrants)} />
                <ReadinessStat label="Finish rate"
                  value={assessment.peer_outcome.finish_rate !== null
                    ? `${(assessment.peer_outcome.finish_rate * 100).toFixed(0)}%` : "—"} />
                <ReadinessStat label="Avg finish time"
                  value={assessment.peer_outcome.avg_finish_seconds !== null
                    ? fmtSeconds(assessment.peer_outcome.avg_finish_seconds) : "—"} />
                <ReadinessStat label="Best finish time"
                  value={assessment.peer_outcome.best_finish_seconds !== null
                    ? fmtSeconds(assessment.peer_outcome.best_finish_seconds) : "—"} />
                {assessment.peer_outcome.limited_data && (
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>limited data (&lt;3 entrants)</span>
                )}
              </div>
            )}
          </div>

          {/* Cluster outcome */}
          <div style={card}>
            <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>
              Cluster Outcome
              {assessment.cluster_outcome.cluster_label && (
                <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>
                  ({assessment.cluster_outcome.cluster_label})
                </span>
              )}
            </h4>
            {assessment.cluster_outcome.cluster_entrants === 0 ? (
              <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
                No athletes from your cluster have entered this race.
              </p>
            ) : (
              <div style={{ display: "flex", gap: 28 }}>
                <ReadinessStat label="Cluster entrants" value={String(assessment.cluster_outcome.cluster_entrants)} />
                <ReadinessStat label="Cluster finish rate"
                  value={assessment.cluster_outcome.cluster_finish_rate !== null
                    ? `${(assessment.cluster_outcome.cluster_finish_rate * 100).toFixed(0)}%` : "—"} />
              </div>
            )}
          </div>

          {/* Own history */}
          {assessment.own_history.length > 0 && (
            <div style={card}>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px" }}>Your Prior Attempts</h4>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Year", "Status", "Finish Time", "Position"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {assessment.own_history.map((r, i) => (
                    <tr key={i}>
                      <td style={td}>{r.year ?? "—"}</td>
                      <td style={{ ...td,
                        color: r.result_status === "DNF" ? "#dc2626" : r.result_status === "FINISHED" ? "#16a34a" : "#374151",
                        fontWeight: r.result_status === "FINISHED" ? 600 : 400 }}>
                        {r.result_status}
                      </td>
                      <td style={td}>{r.finish_seconds !== null ? fmtSeconds(r.finish_seconds) : "—"}</td>
                      <td style={td}>{r.position ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "search" | "test" | "clusters" | "readiness";

const TAB_LABELS: Record<Tab, string> = {
  overview:  "Overview",
  search:    "Athlete Search",
  test:      "Test Athlete",
  clusters:  "Cluster Visualisation",
  readiness: "Readiness Check",
};

export default function AthleteSimilarityPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "ok" | "forbidden">("loading");
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles?.some((r: { role: string }) => r.role === "admin")) {
        router.push("/login");
        return;
      }
      setAuthState("ok");
    }
    checkAuth();
  }, [router]);

  if (authState === "loading") {
    return <div style={{ padding: 48, color: "#6b7280", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <main style={{ padding: "28px 40px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 8, display: "flex", gap: 8, fontSize: 13, color: "#6b7280" }}>
        <Link href="/admin/tools" style={{ color: "#2563eb", textDecoration: "none" }}>Tools</Link>
        <span>›</span>
        <span>Athlete Similarity</span>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
        Athlete Similarity
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
        Cluster athletes by race history profile, find similar athletes, and explore career archetypes.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid #e5e7eb", marginBottom: 24 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "#2563eb" : "#6b7280",
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview"  && <OverviewTab />}
      {tab === "search"    && <AthleteSearchTab />}
      {tab === "test"      && <TestAthleteTab />}
      {tab === "clusters"  && <ClusterVizTab />}
      {tab === "readiness" && <ReadinessTab />}
    </main>
  );
}

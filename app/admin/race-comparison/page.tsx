"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RaceWithProfile {
  id: string;
  name: string;
  location: string | null;
  flat_equivalent_km: number;
  wind_adjusted_flat_equivalent_km: number | null;
  difficulty_ratio: number | null;
  profile_source: string;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  community_calibration_factor: number;
  community_entry_count: number;
  calibration_updated_at: string | null;
}

interface CompareResult {
  estimated_time_b: string;
  estimated_time_b_minutes: number;
  flat_equiv_ratio: number;
  riegel_exponent_used: number;
  confidence: "high" | "medium" | "low";
  confidence_note: string;
  using_wind_adjusted: boolean;
  community_calibration_applied: {
    race_a_factor: number;
    race_b_factor: number;
    race_a_entries: number;
    race_b_entries: number;
  };
  race_a: RaceSummary;
  race_b: RaceSummary;
}

interface RaceSummary {
  id: string;
  name: string;
  flat_equivalent_km: number;
  effective_flat_equivalent_km: number;
  difficulty_ratio: number | null;
  total_distance_km: number | null;
  total_ascent_m: number | null;
  profile_source: string;
  community_calibration_factor: number;
}

interface CalibrateResult {
  message: string;
  updated: {
    race_id: string;
    race_name: string;
    entry_count: number;
    calibration_factor: number;
    bias_points_used: number;
    has_calibration: boolean;
  }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeToMinutes(h: number, m: number, s: number): number {
  return h * 60 + m + s / 60;
}

function formatDifficulty(ratio: number | null): string {
  if (!ratio) return "–";
  return `${ratio.toFixed(2)}×`;
}

function confidenceColor(c: "high" | "medium" | "low"): string {
  return c === "high" ? "#15803d" : c === "medium" ? "#92400e" : "#b91c1c";
}

function confidenceBg(c: "high" | "medium" | "low"): string {
  return c === "high" ? "#dcfce7" : c === "medium" ? "#fef9c3" : "#fee2e2";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RaceComparisonPage() {
  const supabase = createClient();

  const [races, setRaces] = useState<RaceWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [raceAId, setRaceAId] = useState("");
  const [raceBId, setRaceBId] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [riegelExp, setRiegelExp] = useState(1.06);

  // Result state
  const [result, setResult] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Calibration state
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateResult, setCalibrateResult] = useState<CalibrateResult | null>(null);
  const [calibrateError, setCalibrateError] = useState<string | null>(null);

  // ── Load races with profiles ────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        // Join race_profiles onto races — only return races that have a profile
        const { data, error: err } = await supabase
          .from("race_profiles")
          .select(
            `race_id, flat_equivalent_km, wind_adjusted_flat_equivalent_km,
             difficulty_ratio, profile_source, total_distance_km, total_ascent_m,
             community_calibration_factor, community_entry_count, calibration_updated_at,
             races ( id, name, location )`
          )
          .order("race_id");

        if (err) throw err;

        const mapped: RaceWithProfile[] = (data ?? []).map((row) => {
          const race = (row.races as unknown) as { id: string; name: string; location: string | null };
          return {
            id: row.race_id,
            name: race?.name ?? row.race_id,
            location: race?.location ?? null,
            flat_equivalent_km: row.flat_equivalent_km,
            wind_adjusted_flat_equivalent_km: row.wind_adjusted_flat_equivalent_km,
            difficulty_ratio: row.difficulty_ratio,
            profile_source: row.profile_source,
            total_distance_km: row.total_distance_km,
            total_ascent_m: row.total_ascent_m,
            community_calibration_factor: Number((row as unknown as Record<string, unknown>).community_calibration_factor ?? 1.0),
            community_entry_count: Number((row as unknown as Record<string, unknown>).community_entry_count ?? 0),
            calibration_updated_at: ((row as unknown as Record<string, unknown>).calibration_updated_at as string | null) ?? null,
          };
        });

        // Sort by name
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        setRaces(mapped);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load races");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Compare handler ─────────────────────────────────────────────────────────

  async function handleCompare() {
    if (!raceAId || !raceBId) return;
    const timeMinutes = timeToMinutes(hours, minutes, seconds);
    if (timeMinutes <= 0) {
      setCompareError("Please enter a valid finish time for Race A.");
      return;
    }

    setComparing(true);
    setCompareError(null);
    setResult(null);

    try {
      const res = await fetch("/api/race-analysis/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          race_a_id: raceAId,
          race_b_id: raceBId,
          time_a_minutes: timeMinutes,
          riegel_exponent: riegelExp,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCompareError(json.error ?? "Comparison failed");
        return;
      }
      setResult(json as CompareResult);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : "Network error");
    } finally {
      setComparing(false);
    }
  }

  // ── Calibration handler ─────────────────────────────────────────────────────

  async function handleCalibrate() {
    setCalibrating(true);
    setCalibrateError(null);
    setCalibrateResult(null);
    try {
      const res = await fetch("/api/race-analysis/calibrate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setCalibrateError(json.error ?? "Calibration failed");
        return;
      }
      setCalibrateResult(json as CalibrateResult);
      // Reload races to reflect updated factors
      setLoading(true);
      const { data, error: err } = await supabase
        .from("race_profiles")
        .select(
          `race_id, flat_equivalent_km, wind_adjusted_flat_equivalent_km,
           difficulty_ratio, profile_source, total_distance_km, total_ascent_m,
           community_calibration_factor, community_entry_count, calibration_updated_at,
           races ( id, name, location )`
        )
        .order("race_id");
      if (!err && data) {
        const mapped: RaceWithProfile[] = data.map((row) => {
          const race = (row.races as unknown) as { id: string; name: string; location: string | null };
          return {
            id: row.race_id,
            name: race?.name ?? row.race_id,
            location: race?.location ?? null,
            flat_equivalent_km: row.flat_equivalent_km,
            wind_adjusted_flat_equivalent_km: row.wind_adjusted_flat_equivalent_km,
            difficulty_ratio: row.difficulty_ratio,
            profile_source: row.profile_source,
            total_distance_km: row.total_distance_km,
            total_ascent_m: row.total_ascent_m,
            community_calibration_factor: Number((row as unknown as Record<string, unknown>).community_calibration_factor ?? 1.0),
            community_entry_count: Number((row as unknown as Record<string, unknown>).community_entry_count ?? 0),
            calibration_updated_at: ((row as unknown as Record<string, unknown>).calibration_updated_at as string | null) ?? null,
          };
        });
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        setRaces(mapped);
      }
      setLoading(false);
    } catch (err) {
      setCalibrateError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCalibrating(false);
    }
  }

  // ── Selected race helpers ───────────────────────────────────────────────────

  const raceA = races.find((r) => r.id === raceAId);
  const raceB = races.find((r) => r.id === raceBId);

  // ── Styles ────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #e4e4e7",
    padding: "24px",
    marginBottom: "20px",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 600,
    color: "#374151",
    marginBottom: "5px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "14px",
    background: "#fff",
    color: "#111",
  };

  const numInputStyle: React.CSSProperties = {
    width: "70px",
    padding: "10px",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "16px",
    textAlign: "center",
  };

  const statBoxStyle: React.CSSProperties = {
    background: "#f9fafb",
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    padding: "12px 16px",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", padding: "32px 24px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <Link
              href="/admin"
              style={{ fontSize: "13px", color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              ← Back to Admin
            </Link>
            <Link
              href="/admin/race-files"
              style={{ fontSize: "13px", color: "#4f46e5", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 500 }}
            >
              ← Race File Manager
            </Link>
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111", margin: "0 0 6px 0" }}>
            Race Finish Time Estimator
          </h1>
          <p style={{ fontSize: "15px", color: "#6b7280", margin: 0 }}>
            Translate a known finish time from Race A to an estimated time for Race B using
            each race&apos;s flat-equivalent difficulty score and Riegel&apos;s formula.
          </p>
        </div>

        {loading ? (
          <div style={{ ...cardStyle, textAlign: "center", color: "#9ca3af" }}>Loading races…</div>
        ) : error ? (
          <div style={{ ...cardStyle, background: "#fff5f5", border: "1px solid #fca5a5", color: "#b91c1c" }}>
            {error}
          </div>
        ) : races.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", color: "#6b7280" }}>
            <p style={{ marginBottom: "12px" }}>No races have profiles yet.</p>
            <Link href="/admin/race-files" style={{ color: "#4338ca", textDecoration: "underline" }}>
              Go to Race Files → upload a GPX and click &quot;Generate Race Profile&quot;
            </Link>
          </div>
        ) : (
          <>
            {/* Form */}
            <div style={cardStyle}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                {/* Race A */}
                <div>
                  <label style={labelStyle}>Reference Race (A)</label>
                  <select
                    value={raceAId}
                    onChange={(e) => { setRaceAId(e.target.value); setResult(null); }}
                    style={selectStyle}
                  >
                    <option value="">— Select race A —</option>
                    {races.filter((r) => r.id !== raceBId).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {raceA && (
                    <div style={{ ...statBoxStyle, marginTop: "8px", fontSize: "12px", color: "#374151" }}>
                      <div>{raceA.total_distance_km?.toFixed(1)} km · ↑{raceA.total_ascent_m?.toFixed(0)} m</div>
                      <div>Flat equiv: <strong>{raceA.flat_equivalent_km} km</strong> ({formatDifficulty(raceA.difficulty_ratio)})</div>
                      <div style={{ color: raceA.profile_source === "gpx_wind" ? "#15803d" : "#92400e" }}>
                        {raceA.profile_source === "gpx_wind" ? "✓ GPX + wind" : "⚠ GPX only"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Race B */}
                <div>
                  <label style={labelStyle}>Target Race (B)</label>
                  <select
                    value={raceBId}
                    onChange={(e) => { setRaceBId(e.target.value); setResult(null); }}
                    style={selectStyle}
                  >
                    <option value="">— Select race B —</option>
                    {races.filter((r) => r.id !== raceAId).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {raceB && (
                    <div style={{ ...statBoxStyle, marginTop: "8px", fontSize: "12px", color: "#374151" }}>
                      <div>{raceB.total_distance_km?.toFixed(1)} km · ↑{raceB.total_ascent_m?.toFixed(0)} m</div>
                      <div>Flat equiv: <strong>{raceB.flat_equivalent_km} km</strong> ({formatDifficulty(raceB.difficulty_ratio)})</div>
                      <div style={{ color: raceB.profile_source === "gpx_wind" ? "#15803d" : "#92400e" }}>
                        {raceB.profile_source === "gpx_wind" ? "✓ GPX + wind" : "⚠ GPX only"}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Finish time input */}
              <div style={{ marginBottom: "20px" }}>
                <label style={labelStyle}>Your finish time for Race A</label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="number" min={0} max={99} value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    style={numInputStyle} placeholder="HH" />
                  <span style={{ fontSize: "20px", color: "#9ca3af", fontWeight: 300 }}>:</span>
                  <input type="number" min={0} max={59} value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    style={numInputStyle} placeholder="MM" />
                  <span style={{ fontSize: "20px", color: "#9ca3af", fontWeight: 300 }}>:</span>
                  <input type="number" min={0} max={59} value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                    style={numInputStyle} placeholder="SS" />
                  <span style={{ fontSize: "13px", color: "#9ca3af" }}>h : min : sec</span>
                </div>
              </div>

              {/* Advanced */}
              <details style={{ marginBottom: "20px" }}>
                <summary style={{ fontSize: "13px", color: "#6b7280", cursor: "pointer", userSelect: "none" }}>
                  Advanced — Riegel exponent
                </summary>
                <div style={{ marginTop: "10px" }}>
                  <label style={labelStyle}>Riegel exponent (default 1.06)</label>
                  <input type="number" min={1.0} max={1.2} step={0.01}
                    value={riegelExp}
                    onChange={(e) => setRiegelExp(Number(e.target.value))}
                    style={{ ...numInputStyle, width: "90px" }} />
                  <p style={{ fontSize: "12px", color: "#9ca3af", margin: "6px 0 0 0" }}>
                    Higher = more fade over longer efforts. 1.06 is the road standard; 1.10–1.15 for trail/ultra.
                  </p>
                </div>
              </details>

              {/* Submit */}
              <button
                disabled={!raceAId || !raceBId || comparing}
                onClick={handleCompare}
                style={{
                  padding: "11px 24px",
                  borderRadius: "8px",
                  border: "none",
                  background: (!raceAId || !raceBId || comparing) ? "#d1d5db" : "#111",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: (!raceAId || !raceBId || comparing) ? "not-allowed" : "pointer",
                }}
              >
                {comparing ? "Estimating…" : "Estimate Finish Time →"}
              </button>

              {compareError && (
                <p style={{ color: "#b91c1c", fontSize: "13px", marginTop: "10px" }}>
                  {compareError}
                </p>
              )}
            </div>

            {/* Results */}
            {result && (
              <div style={cardStyle}>
                <h2 style={{ margin: "0 0 20px 0", fontSize: "18px", fontWeight: 700, color: "#111" }}>
                  Estimate for {result.race_b.name}
                </h2>

                {/* Big result */}
                <div style={{
                  background: "#f0fdf4", border: "1px solid #86efac",
                  borderRadius: "10px", padding: "20px 24px", marginBottom: "20px",
                  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
                }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#15803d", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Estimated finish time
                    </div>
                    <div style={{ fontSize: "36px", fontWeight: 800, color: "#166534", lineHeight: 1.1 }}>
                      {result.estimated_time_b}
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: "#15803d" }}>
                    <div>Difficulty ratio: {result.flat_equiv_ratio.toFixed(4)}</div>
                    <div>Riegel exponent: {result.riegel_exponent_used}</div>
                    <div>{result.using_wind_adjusted ? "Using wind-adjusted profiles" : "Using GPX-only profiles"}</div>
                  </div>
                </div>

                {/* Confidence badge */}
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: "8px",
                  padding: "6px 12px", borderRadius: "20px",
                  background: confidenceBg(result.confidence),
                  color: confidenceColor(result.confidence),
                  fontSize: "12px", fontWeight: 600, marginBottom: "20px",
                }}>
                  {result.confidence === "high" ? "✓ High confidence" :
                   result.confidence === "medium" ? "⚠ Medium confidence" : "⚠ Low confidence"}
                  <span style={{ fontWeight: 400 }}>— {result.confidence_note}</span>
                </div>

                {/* Race comparison */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {[
                    { label: "Race A (reference)", r: result.race_a },
                    { label: "Race B (target)", r: result.race_b },
                  ].map(({ label, r }) => (
                    <div key={r.id} style={statBoxStyle}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>
                        {label}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#111", marginBottom: "4px" }}>
                        {r.name}
                      </div>
                      <table style={{ width: "100%", fontSize: "12px", color: "#374151", borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ paddingBottom: "2px", color: "#9ca3af" }}>Distance</td>
                            <td style={{ textAlign: "right" }}>{r.total_distance_km?.toFixed(1) ?? "–"} km</td>
                          </tr>
                          <tr>
                            <td style={{ paddingBottom: "2px", color: "#9ca3af" }}>Ascent</td>
                            <td style={{ textAlign: "right" }}>{r.total_ascent_m?.toFixed(0) ?? "–"} m</td>
                          </tr>
                          <tr>
                            <td style={{ paddingBottom: "2px", color: "#9ca3af" }}>Flat equiv</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{r.flat_equivalent_km} km</td>
                          </tr>
                          <tr>
                            <td style={{ color: "#9ca3af" }}>Difficulty</td>
                            <td style={{ textAlign: "right" }}>{formatDifficulty(r.difficulty_ratio)}</td>
                          </tr>
                          <tr>
                            <td style={{ color: "#9ca3af" }}>Profile</td>
                            <td style={{ textAlign: "right", color: r.profile_source === "gpx_wind" ? "#15803d" : "#92400e" }}>
                              {r.profile_source === "gpx_wind" ? "GPX + wind" : "GPX only"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "16px", marginBottom: 0 }}>
                  Formula: estimated_time_B = time_A × (effective_flat_B ÷ effective_flat_A)
                  <sup>{result.riegel_exponent_used}</sup>.
                  Effective flat = flat_equiv × community_calibration_factor.
                  {result.community_calibration_applied.race_a_factor !== 1.0 || result.community_calibration_applied.race_b_factor !== 1.0
                    ? ` Calibration applied: A×${result.community_calibration_applied.race_a_factor.toFixed(3)} B×${result.community_calibration_applied.race_b_factor.toFixed(3)}.`
                    : " No calibration applied (not enough community data yet)."}
                </p>
              </div>
            )}

            {/* Community Calibration Panel */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h2 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: 700, color: "#111" }}>
                    Community Calibration
                  </h2>
                  <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>
                    Detects systematic model bias per course. Requires 5+ athlete entries with overlap.
                  </p>
                </div>
                <button
                  disabled={calibrating}
                  onClick={handleCalibrate}
                  style={{
                    padding: "9px 18px", borderRadius: "8px", border: "none",
                    background: calibrating ? "#d1d5db" : "#4f46e5",
                    color: "#fff", fontSize: "13px", fontWeight: 600,
                    cursor: calibrating ? "not-allowed" : "pointer",
                  }}
                >
                  {calibrating ? "Recalibrating…" : "↻ Recalibrate All Races"}
                </button>
              </div>

              {calibrateError && (
                <p style={{ color: "#b91c1c", fontSize: "13px", marginBottom: "12px" }}>{calibrateError}</p>
              )}
              {calibrateResult && (
                <p style={{ color: "#15803d", fontSize: "13px", marginBottom: "12px" }}>
                  ✓ {calibrateResult.message}
                </p>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e4e4e7" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: "#9ca3af", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Race</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#9ca3af", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Entries</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#9ca3af", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Calibration</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#9ca3af", fontWeight: 600, fontSize: "11px", textTransform: "uppercase" }}>Last updated</th>
                  </tr>
                </thead>
                <tbody>
                  {races.map((r) => {
                    const cal = r.community_calibration_factor;
                    const hasData = r.community_entry_count >= 5;
                    const calLabel = !hasData
                      ? "–"
                      : cal > 1
                      ? `${cal.toFixed(3)} (+${((cal - 1) * 100).toFixed(1)}% harder)`
                      : cal < 1
                      ? `${cal.toFixed(3)} (${((cal - 1) * 100).toFixed(1)}% easier)`
                      : "1.000 (no bias)";
                    const calColor = !hasData ? "#9ca3af" : cal > 1.02 ? "#b91c1c" : cal < 0.98 ? "#15803d" : "#374151";
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px 8px", color: "#111", fontWeight: 500 }}>
                          {r.name}
                          {r.profile_source === "gpx_wind" && (
                            <span style={{ marginLeft: "6px", fontSize: "10px", color: "#15803d" }}>wind</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: r.community_entry_count >= 5 ? "#374151" : "#9ca3af" }}>
                          {r.community_entry_count}
                          {r.community_entry_count < 5 && r.community_entry_count > 0 && (
                            <span style={{ fontSize: "10px", color: "#9ca3af", marginLeft: "4px" }}>
                              ({5 - r.community_entry_count} more needed)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: calColor, fontFamily: hasData ? "monospace" : "inherit" }}>
                          {calLabel}
                        </td>
                        <td style={{ padding: "8px 8px", textAlign: "right", color: "#9ca3af", fontSize: "12px" }}>
                          {r.calibration_updated_at
                            ? new Date(r.calibration_updated_at).toLocaleDateString()
                            : "–"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import type { ViabilityResult, CheckpointResult } from "@/lib/cutoff-viability";
import { formatPace } from "@/lib/race-analysis/pacing-model";

// ─── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  result: ViabilityResult;
  raceName: string;
  athleteName: string;
}

// ─── Colour helpers ─────────────────────────────────────────────────────────────

function finishProbColor(p: number): string {
  if (p >= 0.7) return "#15803d";
  if (p >= 0.4) return "#b45309";
  return "#b91c1c";
}

function finishProbBg(p: number): string {
  if (p >= 0.7) return "#dcfce7";
  if (p >= 0.4) return "#fef3c7";
  return "#fee2e2";
}

function bufferCellStyle(bufferMinutes: number): React.CSSProperties {
  if (bufferMinutes > 15) return { background: "#dcfce7", color: "#15803d", fontWeight: 600 };
  if (bufferMinutes >= 0) return { background: "#fef3c7", color: "#92400e", fontWeight: 600 };
  return { background: "#fee2e2", color: "#b91c1c", fontWeight: 600 };
}

function formatBuffer(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = Math.round(abs % 60);
  const sign = minutes < 0 ? "−" : "+";
  return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}

function formatPaceSec(secondsPerKm: number): string {
  return formatPace(secondsPerKm / 60);
}

function dcBandLabel(band: ViabilityResult["dcRiskBand"]): string {
  switch (band) {
    case "low": return "Low";
    case "moderate": return "Moderate";
    case "high": return "High";
    case "very_high": return "Very High";
  }
}

function interpretationText(result: ViabilityResult): string {
  const { overallFinishProbability: p, checkpointResults, pinchPointIndex } = result;
  const pinch = checkpointResults[pinchPointIndex];
  const pinchLabel = pinch ? ` — tightest at ${pinch.checkpointName} (${pinch.cumulativeDistanceKm.toFixed(1)} km)` : "";

  if (p >= 0.7) return `On current fitness, cutoffs look achievable${pinchLabel}.`;
  if (p >= 0.4) return `Cutoffs are marginal${pinchLabel}. Pace discipline will be critical.`;
  return `Cutoffs are at significant risk${pinchLabel}. Substantial training gains or a revised race target are recommended.`;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function CheckpointRow({ cp, isPinch }: { cp: CheckpointResult; isPinch: boolean }) {
  return (
    <tr style={{ background: isPinch ? "#fffbeb" : undefined }}>
      <td style={cellStyle}>
        {isPinch && <span style={{ color: "#b45309", marginRight: 4 }}>⚑</span>}
        {cp.checkpointName}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>{cp.cumulativeDistanceKm.toFixed(1)}</td>
      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>
        {formatPaceSec(cp.requiredPacePerKm)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>
        {formatPaceSec(cp.predictedPacePerKm)}
      </td>
      <td style={{ ...cellStyle, textAlign: "center", ...bufferCellStyle(cp.bufferMinutes) }}>
        {formatBuffer(cp.bufferMinutes)}
      </td>
      <td style={{ ...cellStyle, textAlign: "right" }}>{cp.survivalProbability.toFixed(2)}</td>
      <td style={{ ...cellStyle, textAlign: "right" }}>{cp.cumulativeSurvivalProbability.toFixed(2)}</td>
    </tr>
  );
}

// ─── Shared styles ───────────────────────────────────────────────────────────────

const cellStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  ...cellStyle,
  background: "#f9fafb",
  fontWeight: 600,
  fontSize: 12,
  color: "#6b7280",
  textTransform: "uppercase" as const,
  letterSpacing: "0.03em",
  borderBottom: "2px solid #e5e7eb",
};

// ─── Main component ─────────────────────────────────────────────────────────────

export default function CutoffViabilityReport({ result, raceName, athleteName }: Props) {
  const {
    overallFinishProbability: p,
    distanceCoverageRatio: dcr,
    dcRiskBand: band,
    riegelB,
    riegelBConfidence,
    pinchPointIndex,
    checkpointResults,
  } = result;

  const pinch = checkpointResults[pinchPointIndex];
  const usedPrior = riegelBConfidence < 2;

  return (
    <>
      {/* Print-only CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size: A4 portrait; margin: 16mm; }
      `}</style>

      <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "0 auto", padding: 24 }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px" }}>{raceName}</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Cut-off Viability Assessment — {athleteName}
          </p>
        </div>

        {/* Summary card */}
        <div style={{
          background: finishProbBg(p),
          border: `1px solid ${finishProbColor(p)}30`,
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}>
          <div style={{ textAlign: "center", minWidth: 90 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: finishProbColor(p), lineHeight: 1 }}>
              {Math.round(p * 100)}%
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>finish probability</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              <strong>DCR {dcr.toFixed(2)}</strong>
              {" "}— distance coverage risk:{" "}
              <span style={{ fontWeight: 600 }}>{dcBandLabel(band)}</span>
            </div>
            <div style={{ fontSize: 14, color: "#374151" }}>{interpretationText(result)}</div>
          </div>
        </div>

        {/* Checkpoint table */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px", color: "#374151" }}>
            Per-checkpoint analysis
          </h2>
          <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
            Paces shown are effort-equivalent flat pace (terrain &amp; gradient adjusted)
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Checkpoint</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Dist (km)</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Required pace*</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Predicted pace*</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Buffer</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Surv P</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Cum P</th>
              </tr>
            </thead>
            <tbody>
              {checkpointResults.map((cp, i) => (
                <CheckpointRow key={i} cp={cp} isPinch={i === pinchPointIndex} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Pinch point callout */}
        {pinch && (
          <div style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 6,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
          }}>
            <strong>⚑ Highest risk point:</strong>{" "}
            {pinch.checkpointName} at {pinch.cumulativeDistanceKm.toFixed(1)} km —
            predicted pace exceeds required by{" "}
            {Math.abs(pinch.predictedPacePerKm - pinch.requiredPacePerKm).toFixed(0)} sec/km
            (effort-equivalent flat).
          </div>
        )}

        {/* Confidence note */}
        <div style={{
          borderTop: "1px solid #e5e7eb",
          paddingTop: 12,
          fontSize: 12,
          color: "#6b7280",
        }}>
          <p style={{ margin: "0 0 4px" }}>
            Fatigue exponent: b = {riegelB.toFixed(3)}, based on{" "}
            {riegelBConfidence === 0 ? "population average (no personal data)" : `${riegelBConfidence} race result${riegelBConfidence === 1 ? "" : "s"}`}.
          </p>
          {usedPrior && (
            <p style={{ margin: "0 0 4px", color: "#b45309" }}>
              ⚠ Fatigue estimate uses population averages, not personal race data. Log race times to personalise.
            </p>
          )}
          {dcr > 2.0 && (
            <p style={{ margin: "0 0 4px", color: "#b91c1c" }}>
              ⚠ This race is more than twice the athlete&apos;s longest known race. Prediction reliability is low.
            </p>
          )}
          <p style={{ margin: 0 }}>
            Probabilities use a logistic model (pace gap ÷ 60 s/km). Terrain adjusted via Minetti et al. (2002).
          </p>
        </div>

      </div>
    </>
  );
}

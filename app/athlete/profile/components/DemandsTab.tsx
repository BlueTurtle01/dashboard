"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const supabase = createClient();

type Segment = {
  startKm: number;
  endKm: number;
  lengthKm: number;
  avgGradient: number;
  totalElevationM: number;
  type: string;
};

type Section = {
  section_type: string;
  terrain: string;
  distance_km: number;
  flat_equivalent_km?: number;
  avg_gradient_percent?: number;
  ascent_m?: number;
  descent_m?: number;
};

// Minetti flat-equivalent effort multiplier
function flatEquivMultiplier(gradientPct: number): number {
  const g = gradientPct / 100;
  return Math.max(0.5, Math.min(4.0, 1 + 4.5 * g + 19 * g ** 2 - 43.3 * g ** 3));
}

const GRADIENT_BANDS = [
  { label: "≥15% up", min: 15, max: Infinity, color: "#ea580c" },
  { label: "10–15% up", min: 10, max: 15, color: "#f97316" },
  { label: "5–10% up", min: 5, max: 10, color: "#fb923c" },
  { label: "Flat (±5%)", min: -5, max: 5, color: "#a1a1aa" },
  { label: "5–10% down", min: -10, max: -5, color: "#60a5fa" },
  { label: "10–15% down", min: -15, max: -10, color: "#3b82f6" },
  { label: "≥15% down", min: -Infinity, max: -15, color: "#2563eb" },
];

function classifyGradient(grad: number): number {
  for (let i = 0; i < GRADIENT_BANDS.length; i++) {
    const { min, max } = GRADIENT_BANDS[i];
    if (grad >= min && grad < max) return i;
  }
  // last band catches ≤ -15
  return GRADIENT_BANDS.length - 1;
}

function segmentColor(type: string): string {
  if (type.includes("climb")) return "#f97316";
  if (type.includes("descent")) return "#3b82f6";
  return "#a1a1aa";
}

function formatSegmentType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DemandsTab({ raceId }: { raceId: string }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [segRes, profileRes] = await Promise.all([
        supabase
          .from("races_meta")
          .select("value")
          .eq("race_id", raceId)
          .eq("meta_key", "sustained_segments")
          .maybeSingle(),
        supabase
          .from("race_profiles")
          .select("sections_json")
          .eq("race_id", raceId)
          .maybeSingle(),
      ]);
      if (segRes.data?.value) {
        const val = segRes.data.value;
        setSegments(Array.isArray(val) ? val : (val.segments ?? []));
      }
      if (profileRes.data?.sections_json) {
        setSections(profileRes.data.sections_json as Section[]);
      }
      setLoading(false);
    }
    load();
  }, [raceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400 text-sm">
        Loading demands…
      </div>
    );
  }

  // Build gradient histogram from sections
  const gradientBandKm = GRADIENT_BANDS.map(() => 0);
  for (const sec of sections) {
    const grad = sec.avg_gradient_percent ?? 0;
    const idx = classifyGradient(grad);
    gradientBandKm[idx] += sec.distance_km ?? 0;
  }
  const histogramData = GRADIENT_BANDS.map((band, i) => ({
    label: band.label,
    km: +gradientBandKm[i].toFixed(2),
    color: band.color,
  }));

  // Effort profile from segments
  const effortData = segments.map((seg) => ({
    label: `${seg.startKm.toFixed(0)}–${seg.endKm.toFixed(0)} km`,
    effort: +flatEquivMultiplier(seg.avgGradient).toFixed(2),
    type: seg.type,
  }));

  // 4 demand cards derived from segments
  const climbSegs = segments.filter((s) => s.type.includes("climb"));
  const descentSegs = segments.filter((s) => s.type.includes("descent"));
  const biggestClimb = climbSegs.length
    ? climbSegs.reduce((a, b) => (a.totalElevationM > b.totalElevationM ? a : b))
    : null;
  const biggestDescent = descentSegs.length
    ? descentSegs.reduce((a, b) => (a.totalElevationM > b.totalElevationM ? a : b))
    : null;

  // Pacing complexity: coefficient of variation of per-section effort
  const effortValues = sections
    .filter((s) => s.distance_km && s.distance_km > 0)
    .map((s) => flatEquivMultiplier(s.avg_gradient_percent ?? 0));
  let pacingComplexity = "—";
  if (effortValues.length > 1) {
    const mean = effortValues.reduce((a, b) => a + b, 0) / effortValues.length;
    const variance =
      effortValues.reduce((a, b) => a + (b - mean) ** 2, 0) / effortValues.length;
    const cv = Math.sqrt(variance) / mean;
    pacingComplexity = cv < 0.15 ? "Low" : cv < 0.3 ? "Moderate" : "High";
  }

  return (
    <div className="space-y-6">
      {/* 4 demand cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <DemandCard
          label="Biggest Climb"
          value={biggestClimb ? `+${biggestClimb.totalElevationM.toFixed(0)} m` : "—"}
          sub={biggestClimb ? `${biggestClimb.lengthKm.toFixed(1)} km · ${biggestClimb.avgGradient.toFixed(1)}% avg` : "No climb data"}
          accent="orange"
        />
        <DemandCard
          label="Biggest Descent"
          value={biggestDescent ? `−${biggestDescent.totalElevationM.toFixed(0)} m` : "—"}
          sub={biggestDescent ? `${biggestDescent.lengthKm.toFixed(1)} km · ${biggestDescent.avgGradient.toFixed(1)}% avg` : "No descent data"}
          accent="blue"
        />
        <DemandCard
          label="Total Sections"
          value={`${segments.length}`}
          sub={`${climbSegs.length} climbs · ${descentSegs.length} descents`}
          accent="zinc"
        />
        <DemandCard
          label="Pacing Complexity"
          value={pacingComplexity}
          sub="Variation in effort across sections"
          accent="zinc"
        />
      </div>

      {/* Gradient distribution histogram */}
      {sections.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-4">Gradient Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={histogramData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                angle={-35}
                textAnchor="end"
              />
              <YAxis
                tickFormatter={(v) => `${v} km`}
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                formatter={(val) => [`${val} km`, "Distance"]}
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid #e4e4e7",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="km" radius={[4, 4, 0, 0]}>
                {histogramData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No terrain section data available for gradient distribution." />
      )}

      {/* Effort profile chart */}
      {effortData.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-1">Effort Profile</h3>
          <p className="text-xs text-zinc-400 mb-4">
            Flat-equivalent effort multiplier per sustained segment (1.0× = flat running effort)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={effortData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                angle={-35}
                textAnchor="end"
              />
              <YAxis
                domain={[0, "auto"]}
                tickFormatter={(v) => `${v}×`}
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                formatter={(val) => [`${val}×`, "Effort"]}
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid #e4e4e7",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="effort" radius={[4, 4, 0, 0]}>
                {effortData.map((entry, i) => (
                  <Cell key={i} fill={segmentColor(entry.type)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-orange-400" /> Climbing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-blue-400" /> Descending
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-zinc-400" /> Flat
            </span>
          </div>
        </div>
      ) : (
        <EmptyState message="No sustained segment data available for effort profile." />
      )}

      {/* Sustained segment cards */}
      {segments.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700">Sustained Segments</h3>
          <div className="space-y-2">
            {segments.map((seg, i) => {
              const isClimb = seg.type.includes("climb");
              const isDescent = seg.type.includes("descent");
              const effort = flatEquivMultiplier(seg.avgGradient);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3"
                >
                  <span
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      isClimb
                        ? "bg-orange-100 text-orange-700"
                        : isDescent
                        ? "bg-blue-100 text-blue-700"
                        : "bg-zinc-200 text-zinc-600"
                    }`}
                  >
                    {formatSegmentType(seg.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700 truncate">
                      km {seg.startKm.toFixed(1)} – {seg.endKm.toFixed(1)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-semibold text-zinc-900">
                      {seg.lengthKm.toFixed(1)} km
                    </p>
                    <p className="text-xs text-zinc-500">
                      {seg.avgGradient > 0 ? "+" : ""}
                      {seg.totalElevationM.toFixed(0)} m · {seg.avgGradient.toFixed(1)}% avg
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-zinc-500">effort</p>
                    <p className="text-sm font-bold text-zinc-800">{effort.toFixed(2)}×</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DemandCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "orange" | "blue" | "zinc";
}) {
  const accentClass =
    accent === "orange"
      ? "text-orange-600"
      : accent === "blue"
      ? "text-blue-600"
      : "text-zinc-900";
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 space-y-1">
      <p className="text-xs text-zinc-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${accentClass}`}>{value}</p>
      <p className="text-xs text-zinc-400 leading-snug">{sub}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-6 text-center text-sm text-zinc-400">
      {message}
    </div>
  );
}

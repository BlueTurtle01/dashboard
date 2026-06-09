"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const supabase = createClient();

type RaceOption = {
  id: string;
  name: string;
  distance_km: number | null;
  location: string | null;
  terrain_type: string | null;
};

type ElevationPoint = { distanceKm: number; elevationM: number };

type Section = {
  section_type: string;
  terrain: string;
  distance_km: number;
  flat_equivalent_km?: number;
  avg_gradient_percent?: number;
  ascent_m?: number;
  descent_m?: number;
};

type RaceProfile = {
  total_distance_km: number | null;
  total_ascent_m: number | null;
  total_descent_m: number | null;
  sections_json: Section[] | null;
};

type Props = {
  raceId: string;
  race: RaceOption;
};

function downsample(points: ElevationPoint[], maxPoints: number): ElevationPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0);
}

function sectionIsClimbing(type: string) {
  return type.includes("climb");
}
function sectionIsDescending(type: string) {
  return type.includes("descent");
}

export function OverviewTab({ raceId, race }: Props) {
  const [elevationPoints, setElevationPoints] = useState<ElevationPoint[]>([]);
  const [raceProfile, setRaceProfile] = useState<RaceProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [metaRes, profileRes] = await Promise.all([
        supabase
          .from("races_meta")
          .select("value")
          .eq("race_id", raceId)
          .eq("meta_key", "elevation_profile")
          .maybeSingle(),
        supabase
          .from("race_profiles")
          .select("total_distance_km, total_ascent_m, total_descent_m, sections_json")
          .eq("race_id", raceId)
          .maybeSingle(),
      ]);

      if (metaRes.data?.value?.points) {
        setElevationPoints(
          downsample(metaRes.data.value.points as ElevationPoint[], 200)
        );
      }
      if (profileRes.data) {
        setRaceProfile(profileRes.data as RaceProfile);
      }

      setLoading(false);
    }
    load();
  }, [raceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-400 text-sm">
        Loading overview…
      </div>
    );
  }

  // Stat card data — prefer race_profiles totals, fall back to races table fields
  const totalDist = raceProfile?.total_distance_km ?? race.distance_km;
  const totalAscent = raceProfile?.total_ascent_m;
  const totalDescent = raceProfile?.total_descent_m;

  // Terrain composition from sections_json
  const sections = raceProfile?.sections_json ?? [];
  const totalKm = sections.reduce((s, sec) => s + (sec.distance_km ?? 0), 0);
  const climbKm = sections
    .filter((s) => sectionIsClimbing(s.section_type))
    .reduce((s, sec) => s + (sec.distance_km ?? 0), 0);
  const descentKm = sections
    .filter((s) => sectionIsDescending(s.section_type))
    .reduce((s, sec) => s + (sec.distance_km ?? 0), 0);
  const flatKm = totalKm - climbKm - descentKm;
  const climbPct = totalKm > 0 ? (climbKm / totalKm) * 100 : 0;
  const descentPct = totalKm > 0 ? (descentKm / totalKm) * 100 : 0;
  const flatPct = totalKm > 0 ? (flatKm / totalKm) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Distance" value={totalDist ? `${totalDist} km` : "—"} />
        <StatCard label="Total Ascent" value={totalAscent != null ? `${totalAscent.toLocaleString()} m` : "—"} />
        <StatCard label="Total Descent" value={totalDescent != null ? `${totalDescent.toLocaleString()} m` : "—"} />
        <StatCard label="Terrain" value={race.terrain_type ?? "—"} />
      </div>

      {/* Elevation chart */}
      {elevationPoints.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-700 mb-4">Elevation Profile</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={elevationPoints} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="elevGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#71717a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#71717a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
              <XAxis
                dataKey="distanceKm"
                tickFormatter={(v) => `${v} km`}
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}m`}
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip
                formatter={(val) => [`${val} m`, "Elevation"]}
                labelFormatter={(label) => `${label} km`}
                contentStyle={{
                  borderRadius: "0.75rem",
                  border: "1px solid #e4e4e7",
                  fontSize: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="elevationM"
                stroke="#52525b"
                strokeWidth={2}
                fill="url(#elevGradient)"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState message="No elevation profile data available for this race." />
      )}

      {/* Terrain composition */}
      {sections.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-zinc-700">Terrain Composition</h3>
          <TerrainBar label="Climbing" pct={climbPct} km={climbKm} color="bg-orange-400" />
          <TerrainBar label="Flat" pct={flatPct} km={flatKm} color="bg-zinc-400" />
          <TerrainBar label="Descending" pct={descentPct} km={descentKm} color="bg-blue-400" />
        </div>
      ) : (
        <EmptyState message="No terrain section data available for this race." />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
      <p className="text-xs text-zinc-500 font-medium mb-1">{label}</p>
      <p className="text-lg font-bold text-zinc-900 capitalize">{value}</p>
    </div>
  );
}

function TerrainBar({ label, pct, km, color }: { label: string; pct: number; km: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-zinc-600">
        <span className="font-medium">{label}</span>
        <span>{km.toFixed(1)} km ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
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

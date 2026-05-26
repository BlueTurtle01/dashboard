"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ── Race profile types ── */
type ElevationPoint = { distanceKm: number; elevationM: number };

type RaceElevProfile = {
  points: ElevationPoint[];
  totalDistanceKm: number;
  totalAscentM: number;
  totalDescentM: number;
  climbPerKm: number;
  minElevationM: number;
  maxElevationM: number;
};

type RaceTerrainSeg = { type: string; label: string; percentage: number; distanceKm?: number };

type RaceSustainedSeg = {
  startKm: number; endKm: number; lengthKm: number;
  avgGradient: number; totalElevationM: number;
  type: "climb" | "descent" | "flat";
};

type RaceProfileData = {
  elevation: RaceElevProfile | null;
  terrain: RaceTerrainSeg[] | null;
  sustainedSegments: RaceSustainedSeg[] | null;
};

function parseRaceElevProfile(value: string | null | undefined): RaceElevProfile | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(p.points) || typeof p.totalDistanceKm !== "number") return null;
    const points = (p.points as unknown[]).flatMap((pt): ElevationPoint[] => {
      if (!pt || typeof pt !== "object") return [];
      const r = pt as Record<string, unknown>;
      if (typeof r.distanceKm !== "number" || typeof r.elevationM !== "number") return [];
      return [{ distanceKm: r.distanceKm, elevationM: r.elevationM }];
    });
    if (points.length < 2) return null;
    const elevs = points.map((p) => p.elevationM);
    return {
      points,
      totalDistanceKm: p.totalDistanceKm,
      totalAscentM: typeof p.totalAscentM === "number" ? p.totalAscentM : 0,
      totalDescentM: typeof p.totalDescentM === "number" ? p.totalDescentM : 0,
      climbPerKm: typeof p.climbPerKm === "number" ? p.climbPerKm : (p.totalDistanceKm > 0 ? (p.totalAscentM as number) / p.totalDistanceKm : 0),
      minElevationM: Math.min(...elevs),
      maxElevationM: Math.max(...elevs),
    };
  } catch { return null; }
}

function parseRaceTerrainSegs(value: string | null | undefined): RaceTerrainSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as Record<string, unknown>;
    if (!Array.isArray(p.segments)) return null;
    const segs = (p.segments as unknown[]).flatMap((s): RaceTerrainSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.type !== "string" || typeof r.label !== "string" || typeof r.percentage !== "number") return [];
      return [{ type: r.type, label: r.label, percentage: r.percentage, distanceKm: typeof r.distanceKm === "number" ? r.distanceKm : undefined }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

function parseRaceSustainedSegs(value: string | null | undefined): RaceSustainedSeg[] | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value) as unknown;
    if (!Array.isArray(p)) return null;
    const segs = p.flatMap((s): RaceSustainedSeg[] => {
      if (!s || typeof s !== "object") return [];
      const r = s as Record<string, unknown>;
      if (typeof r.startKm !== "number" || typeof r.endKm !== "number" || typeof r.lengthKm !== "number" ||
          typeof r.avgGradient !== "number" || typeof r.totalElevationM !== "number" ||
          (r.type !== "climb" && r.type !== "descent" && r.type !== "flat")) return [];
      return [{ startKm: r.startKm, endKm: r.endKm, lengthKm: r.lengthKm,
                avgGradient: r.avgGradient, totalElevationM: r.totalElevationM,
                type: r.type as RaceSustainedSeg["type"] }];
    });
    return segs.length > 0 ? segs : null;
  } catch { return null; }
}

/* ── DB types ── */
type TemplateExercise = {
  id: string;
  sort_order: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  notes: string | null;
  exercises: { name: string; description: string } | null;
};

type TemplateSession = {
  id: string;
  day_label: string;
  sort_order: number;
  type: string;
  name: string;
  description: string | null;
  duration: string | null;
  duration_minutes: number | null;
  intensity: string | null;
  is_key_session: boolean;
  reason: string | null;
  program_template_session_exercises: TemplateExercise[];
};

type TemplateWeek = {
  id: string;
  week_number: number;
  focus: string | null;
  notes: string | null;
  program_template_sessions: TemplateSession[];
};

type ProgramTemplate = {
  id: string;
  name: string;
  description: string | null;
  event_goal: string | null;
  discipline: string | null;
  plan_length_weeks: number;
  training_days_per_week: number;
  program_template_weeks: TemplateWeek[];
};

/* ── Helpers ── */
function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function sessionDuration(s: TemplateSession): string {
  if (s.duration_minutes) {
    const h = Math.floor(s.duration_minutes / 60);
    const m = s.duration_minutes % 60;
    return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
  }
  return s.duration || "—";
}

function sortSessions(sessions: TemplateSession[]): TemplateSession[] {
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return [...sessions].sort((a, b) => {
    const di = dayOrder.indexOf(a.day_label) - dayOrder.indexOf(b.day_label);
    return di !== 0 ? di : a.sort_order - b.sort_order;
  });
}

/* ── Race profile sub-components ── */

const TERRAIN_COLORS: Record<string, string> = {
  road: "#78909c", tarmac: "#607d8b", asphalt: "#546e7a",
  trail: "#8d6e63", dirt: "#795548", path: "#a1887f",
  grass: "#66bb6a", grassland: "#81c784",
  gravel: "#bcaaa4", chalk: "#e0e0e0",
  sand: "#ffcc80", beach: "#ffd54f",
  technical: "#5d4037", rocky: "#6d4c41",
  woodland: "#388e3c", forest: "#2e7d32",
  default: "#90a4ae",
};

function terrainColor(type: string) {
  return TERRAIN_COLORS[type.toLowerCase()] ?? TERRAIN_COLORS.default;
}

// Downsample to at most maxPts points while preserving shape
function downsamplePoints(points: ElevationPoint[], maxPts: number): ElevationPoint[] {
  if (points.length <= maxPts) return points;
  const step = (points.length - 1) / (maxPts - 1);
  return Array.from({ length: maxPts }, (_, i) => points[Math.round(i * step)]);
}

function ElevationChart({ profile, notable }: { profile: RaceElevProfile; notable: RaceSustainedSeg[] }) {
  const W = 698; const H = 200;
  const padL = 46; const padB = 22; const padR = 8; const padT = 16;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const elevRange = Math.max(profile.maxElevationM - profile.minElevationM, 50);
  const xS = (km: number) => padL + (km / profile.totalDistanceKm) * cW;
  const yS = (m: number) => padT + cH - ((m - profile.minElevationM) / elevRange) * cH;

  const pts = downsamplePoints(profile.points, 300);
  const linePts = pts.map((p) => `${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ");
  const first = pts[0]; const last = pts[pts.length - 1];
  const areaD = `M${xS(first.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} ` +
    pts.map((p) => `L${xS(p.distanceKm).toFixed(1)},${yS(p.elevationM).toFixed(1)}`).join(" ") +
    ` L${xS(last.distanceKm).toFixed(1)},${(padT + cH).toFixed(1)} Z`;

  // Y-axis ticks (4 gridlines)
  const yStep = elevRange / 4;
  const yTicks = Array.from({ length: 5 }, (_, i) => profile.minElevationM + i * yStep);

  // X-axis ticks — roughly every 5 km
  const xInterval = Math.ceil(profile.totalDistanceKm / 8 / 5) * 5;
  const xTicks: number[] = [];
  for (let k = 0; k <= profile.totalDistanceKm; k += xInterval) xTicks.push(k);

  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      {/* Gridlines */}
      {yTicks.map((elev, i) => (
        <line key={i} x1={padL} y1={yS(elev)} x2={padL + cW} y2={yS(elev)} stroke="#eee" strokeWidth="1" />
      ))}

      {/* Notable segment bands */}
      {notable.map((seg, i) => (
        <rect key={i} x={xS(seg.startKm)} y={padT} width={Math.max(xS(seg.endKm) - xS(seg.startKm), 1)}
          height={cH} fill={seg.type === "climb" ? "#ff980018" : "#1565c018"} />
      ))}

      {/* Filled area */}
      <path d={areaD} fill="#1e3a1e18" />

      {/* Elevation line */}
      <polyline points={linePts} fill="none" stroke="#1e3a1e" strokeWidth="1.5" strokeLinejoin="round" />

      {/* Y-axis labels */}
      {yTicks.map((elev, i) => (
        <text key={i} x={padL - 5} y={yS(elev) + 3.5} textAnchor="end" fontSize="8.5" fill="#888">
          {Math.round(elev)}
        </text>
      ))}

      {/* X-axis ticks + labels */}
      {xTicks.map((km, i) => (
        <g key={i}>
          <line x1={xS(km)} y1={padT + cH} x2={xS(km)} y2={padT + cH + 4} stroke="#ccc" strokeWidth="1" />
          <text x={xS(km)} y={padT + cH + 13} textAnchor="middle" fontSize="8.5" fill="#888">{Math.round(km)}km</text>
        </g>
      ))}

      {/* Axis borders */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + cH} stroke="#bbb" strokeWidth="1" />
      <line x1={padL} y1={padT + cH} x2={padL + cW} y2={padT + cH} stroke="#bbb" strokeWidth="1" />

      {/* Notable segment labels */}
      {notable.map((seg, i) => {
        const midX = xS((seg.startKm + seg.endKm) / 2);
        const isClimb = seg.type === "climb";
        return (
          <text key={i} x={midX} y={padT - 3} textAnchor="middle" fontSize="8" fontWeight="700"
            fill={isClimb ? "#bf360c" : "#0d47a1"}>
            {isClimb ? "▲" : "▼"} {Math.abs(Math.round(seg.totalElevationM))}m
          </text>
        );
      })}
    </svg>
  );
}

function TerrainBar({ terrain }: { terrain: RaceTerrainSeg[] }) {
  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: "18px", borderRadius: "4px", overflow: "hidden", marginBottom: "8px", border: "1px solid #ddd" }}>
        {terrain.map((seg) => (
          <div key={seg.type} style={{ width: `${seg.percentage}%`, background: terrainColor(seg.type), flexShrink: 0 }} />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {terrain.map((seg) => (
          <div key={seg.type} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#444" }}>
            <span style={{ display: "inline-block", width: "11px", height: "11px", borderRadius: "2px", background: terrainColor(seg.type), border: "1px solid #ccc", flexShrink: 0 }} />
            {seg.label} — {Math.round(seg.percentage)}%
            {seg.distanceKm != null ? ` (${seg.distanceKm.toFixed(1)} km)` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

function RaceSummaryPage({ template, profile }: { template: ProgramTemplate; profile: RaceProfileData }) {
  const { elevation, terrain, sustainedSegments } = profile;

  // Top 3–5 notable segments by absolute elevation change, excluding flats
  const notable = (sustainedSegments ?? [])
    .filter((s) => s.type !== "flat")
    .sort((a, b) => Math.abs(b.totalElevationM) - Math.abs(a.totalElevationM))
    .slice(0, 5);

  const hasContent = elevation ?? terrain ?? (sustainedSegments?.length ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" }}>Race Course Profile</h2>

      {elevation && (
        <>
          {/* Stats strip */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
            {[
              { label: "Distance", value: `${elevation.totalDistanceKm.toFixed(1)} km` },
              { label: "Total ascent", value: `${Math.round(elevation.totalAscentM).toLocaleString()} m` },
              { label: "Total descent", value: `${Math.round(elevation.totalDescentM).toLocaleString()} m` },
              { label: "Climb / km", value: `${elevation.climbPerKm.toFixed(1)} m/km` },
            ].map(({ label, value }) => (
              <div key={label} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", padding: "8px 14px", fontSize: "11px", background: "#fafafa" }}>
                <div style={{ color: "#888", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontWeight: 700, color: "#111", fontSize: "13px" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Elevation chart */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ margin: "0 0 6px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Elevation Profile
              {notable.length > 0 && " — shaded sections are the most significant climbs & descents"}
            </p>
            <ElevationChart profile={elevation} notable={notable} />
          </div>
        </>
      )}

      {/* Notable segments table */}
      {notable.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Notable Segments
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr>
                {["#", "Type", "km range", "Length", "Avg gradient", "Elevation"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "5px 8px", borderBottom: "2px solid #1e3a1e", color: "#1e3a1e", fontWeight: 600, background: "#f9f9f9", fontSize: "11px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notable.map((seg, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee", color: "#555" }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>
                    <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: "8px", fontSize: "10px", fontWeight: 700,
                      background: seg.type === "climb" ? "#fff3e0" : "#e3f2fd",
                      color: seg.type === "climb" ? "#bf360c" : "#0d47a1" }}>
                      {seg.type === "climb" ? "▲ Climb" : "▼ Descent"}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>{seg.startKm.toFixed(1)}–{seg.endKm.toFixed(1)} km</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>{seg.lengthKm.toFixed(1)} km</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee" }}>{Math.abs(seg.avgGradient).toFixed(1)}%</td>
                  <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee", fontWeight: 600 }}>{Math.abs(Math.round(seg.totalElevationM))} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terrain breakdown */}
      {terrain && terrain.length > 0 && (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Terrain Surface
          </p>
          <TerrainBar terrain={terrain} />
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ── */
function PrintHeader({ template }: { template: ProgramTemplate }) {
  return (
    <div style={printHeader}>
      <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
      <div style={headerRight}>
        <div style={headerRaceName}>{template.name}</div>
        {template.event_goal && (
          <div style={headerAthleteName}>{template.event_goal}</div>
        )}
      </div>
    </div>
  );
}

function ExerciseTable({ exercises }: { exercises: TemplateExercise[] }) {
  if (exercises.length === 0) return null;
  const sorted = [...exercises].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <table style={exTable}>
      <thead>
        <tr>
          <th style={exTh}>Exercise</th>
          <th style={{ ...exTh, textAlign: "center", width: "110px" }}>Sets / Reps</th>
          <th style={exTh}>Notes</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((ex) => {
          const prescription =
            ex.sets && ex.reps
              ? `${ex.sets} × ${ex.reps}`
              : ex.sets && ex.duration_seconds
              ? `${ex.sets} × ${formatDuration(ex.duration_seconds)}`
              : ex.duration_seconds
              ? formatDuration(ex.duration_seconds)
              : ex.sets
              ? `${ex.sets} sets`
              : "—";
          return (
            <tr key={ex.id}>
              <td style={exTd}>{ex.exercises?.name ?? "Unknown exercise"}</td>
              <td style={{ ...exTd, textAlign: "center", whiteSpace: "nowrap" }}>{prescription}</td>
              <td style={exTd}>{ex.notes || (ex.exercises?.description ? ex.exercises.description.slice(0, 120) : "—")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SessionCard({ session }: { session: TemplateSession }) {
  const isGym = session.type === "Gym";
  const col = SESSION_COLOURS[session.type] ?? SESSION_COLOURS.default;

  return (
    <div style={sessionCard}>
      <div style={sessionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ ...typeBadge, background: col.bg, color: col.fg }}>{session.type}</span>
          <span style={dayLabel}>{session.day_label}</span>
          {session.is_key_session && <span style={keyBadge}>★ Key Session</span>}
          <strong style={sessionName}>{session.name}</strong>
        </div>
        <div style={sessionMeta}>
          {sessionDuration(session) !== "—" && <span>{sessionDuration(session)}</span>}
          {session.intensity && <span style={{ textTransform: "capitalize" }}>{session.intensity}</span>}
        </div>
      </div>

      {session.description && (
        <p style={descriptionText}>{session.description}</p>
      )}

      {session.reason && (
        <div style={reasonBox}>
          <span style={reasonLabel}>Why this session:</span>
          <span style={reasonText}>{session.reason}</span>
        </div>
      )}

      {isGym && <ExerciseTable exercises={session.program_template_session_exercises} />}
    </div>
  );
}

function WeekOverviewPage({ week, template }: { week: TemplateWeek; template: ProgramTemplate }) {
  const sessions = sortSessions(week.program_template_sessions);
  const trainingSessions = sessions.filter((s) => s.type !== "Rest");

  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <div style={weekHeaderBar}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <h2 style={weekTitle}>Week {week.week_number}</h2>
          {week.focus && <span style={focusBadge}>{week.focus}</span>}
        </div>
        {week.notes && <p style={weekNotes}>{week.notes}</p>}
      </div>

      <table style={overviewTable}>
        <thead>
          <tr>
            <th style={ovTh}>Day</th>
            <th style={ovTh}>Type</th>
            <th style={ovTh}>Session</th>
            <th style={ovTh}>Duration</th>
            <th style={ovTh}>Intensity</th>
            <th style={{ ...ovTh, textAlign: "center" }}>Key</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} style={s.type === "Rest" ? { opacity: 0.45 } : undefined}>
              <td style={ovTd}>{s.day_label}</td>
              <td style={ovTd}>
                <span style={{
                  ...smallTypeBadge,
                  background: (SESSION_COLOURS[s.type] ?? SESSION_COLOURS.default).bg,
                  color: (SESSION_COLOURS[s.type] ?? SESSION_COLOURS.default).fg,
                }}>
                  {s.type}
                </span>
              </td>
              <td style={{ ...ovTd, fontWeight: s.is_key_session ? 600 : 400 }}>{s.name}</td>
              <td style={ovTd}>{sessionDuration(s)}</td>
              <td style={{ ...ovTd, textTransform: "capitalize" }}>{s.intensity || "—"}</td>
              <td style={{ ...ovTd, textAlign: "center" }}>{s.is_key_session ? "★" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={weekStat}>
        {trainingSessions.length} training session{trainingSessions.length !== 1 ? "s" : ""}
        {" · "}
        {sessions.filter((s) => s.is_key_session).length} key session{sessions.filter((s) => s.is_key_session).length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function WeekDetailPage({ week, template }: { week: TemplateWeek; template: ProgramTemplate }) {
  const sessions = sortSessions(week.program_template_sessions);
  return (
    <div style={a4Page}>
      <PrintHeader template={template} />
      <div style={weekHeaderBar}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <h2 style={weekTitle}>Week {week.week_number} — Full Detail</h2>
          {week.focus && <span style={focusBadge}>{week.focus}</span>}
        </div>
        {week.notes && <p style={weekNotes}>{week.notes}</p>}
      </div>

      {sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}

/* ── Main page ── */
export default function ExportPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params?.planId as string;
  const supabase = createClient();

  const [template, setTemplate] = useState<ProgramTemplate | null>(null);
  const [raceProfile, setRaceProfile] = useState<RaceProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!templateId) return;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("program_templates")
        .select(`
          id, name, description, event_goal, discipline, plan_length_weeks, training_days_per_week,
          program_template_weeks (
            id, week_number, focus, notes,
            program_template_sessions (
              id, day_label, sort_order, type, name, description,
              duration, duration_minutes, intensity, is_key_session, reason,
              program_template_session_exercises (
                id, sort_order, sets, reps, duration_seconds, notes,
                exercises ( name, description )
              )
            )
          )
        `)
        .eq("id", templateId)
        .single();

      if (err || !data) {
        setError(err?.message ?? "Template not found.");
        setLoading(false);
        return;
      }

      // Sort weeks
      const sorted = { ...data } as ProgramTemplate;
      sorted.program_template_weeks = [...sorted.program_template_weeks].sort(
        (a, b) => a.week_number - b.week_number
      );

      setTemplate(sorted);

      // Fetch race profile via products table
      const { data: productRow } = await supabase
        .from("products")
        .select("race_id")
        .eq("template_id", templateId)
        .not("race_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (productRow?.race_id) {
        const { data: metaRows } = await supabase
          .from("races_meta")
          .select("meta_key, meta_value")
          .eq("race_id", productRow.race_id)
          .in("meta_key", ["elevation_profile", "terrain_breakdown", "sustained_segments"]);

        const meta: Record<string, string> = {};
        for (const row of (metaRows ?? []) as { meta_key: string; meta_value: string }[]) {
          meta[row.meta_key] = row.meta_value;
        }
        setRaceProfile({
          elevation: parseRaceElevProfile(meta.elevation_profile),
          terrain: parseRaceTerrainSegs(meta.terrain_breakdown),
          sustainedSegments: parseRaceSustainedSegs(meta.sustained_segments),
        });
      }

      setLoading(false);
    }
    void load();
  }, [templateId]);

  if (loading) {
    return <main style={{ padding: "60px 24px", textAlign: "center" }}><p style={{ color: "#666" }}>Loading template...</p></main>;
  }

  if (error || !template) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#b00020" }}>{error || "Template not found."}</p>
        <button type="button" onClick={() => router.push("/admin/export-programme")} style={backBtn}>Back</button>
      </main>
    );
  }

  const weeks = template.program_template_weeks;

  return (
    <>
      {/* ── Screen toolbar (hidden on print) ── */}
      <div style={toolbar} className="no-print">
        <button type="button" onClick={() => router.push("/admin/export-programme")} style={backBtn}>
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "16px" }}>{template.name}</strong>
          {template.event_goal && (
            <span style={{ color: "#666", marginLeft: "10px", fontSize: "14px" }}>· {template.event_goal}</span>
          )}
          <span style={{ color: "#aaa", marginLeft: "10px", fontSize: "13px" }}>
            {template.plan_length_weeks} weeks · {template.training_days_per_week} days/week
          </span>
        </div>
        <button type="button" onClick={() => window.print()} style={printBtn}>
          Export to PDF
        </button>
      </div>

      {/* ── A4 document canvas ── */}
      <div style={canvas}>

        {/* Cover page */}
        <div style={{ ...a4Page, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={{ maxWidth: "260px", marginBottom: "48px" }} />
          <h1 style={{ fontSize: "30px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 12px" }}>{template.name}</h1>
          {template.event_goal && <p style={{ fontSize: "18px", color: "#555", margin: "4px 0" }}>{template.event_goal}</p>}
          {template.discipline && <p style={{ fontSize: "15px", color: "#888", margin: "4px 0", textTransform: "capitalize" }}>{template.discipline}</p>}
          <p style={{ fontSize: "15px", color: "#888", marginTop: "24px" }}>
            {template.plan_length_weeks} week programme · {template.training_days_per_week} training days per week
          </p>
          {template.description && (
            <p style={{ fontSize: "14px", color: "#666", marginTop: "20px", maxWidth: "480px", lineHeight: "1.6" }}>{template.description}</p>
          )}
        </div>

        {/* Race course profile page */}
        {raceProfile && <RaceSummaryPage template={template} profile={raceProfile} />}

        {/* Section title: Overview */}
        <div style={{ ...a4Page, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <PrintHeader template={template} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 12px" }}>Programme Overview</h2>
            <p style={{ fontSize: "15px", color: "#666", margin: 0 }}>One week per page — all sessions at a glance</p>
          </div>
        </div>

        {/* Overview — one week per A4 page */}
        {weeks.map((week) => (
          <WeekOverviewPage key={`ov-${week.id}`} week={week} template={template} />
        ))}

        {/* Section title: Full Detail */}
        <div style={{ ...a4Page, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <PrintHeader template={template} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
            <h2 style={{ fontSize: "32px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 12px" }}>Full Session Detail</h2>
            <p style={{ fontSize: "15px", color: "#666", margin: 0 }}>Complete breakdown including gym exercises and session rationale</p>
          </div>
        </div>

        {/* Detail — one week per A4 page */}
        {weeks.map((week) => (
          <WeekDetailPage key={`det-${week.id}`} week={week} template={template} />
        ))}

      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .app-sidebar { display: none !important; }
          .app-topbar { display: none !important; }
          body { margin: 0; background: #fff; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

/* ── Colour map ── */
const SESSION_COLOURS: Record<string, { bg: string; fg: string }> & { default: { bg: string; fg: string } } = {
  Easy:       { bg: "#e8f5e9", fg: "#2e7d32" },
  Long:       { bg: "#e3f2fd", fg: "#1565c0" },
  Steady:     { bg: "#e8eaf6", fg: "#3949ab" },
  Recovery:   { bg: "#f3e5f5", fg: "#7b1fa2" },
  Gym:        { bg: "#fff3e0", fg: "#e65100" },
  Loaded:     { bg: "#fbe9e7", fg: "#bf360c" },
  Recce:      { bg: "#e0f7fa", fg: "#00695c" },
  Navigation: { bg: "#f1f8e9", fg: "#33691e" },
  functional: { bg: "#fce4ec", fg: "#880e4f" },
  Rest:       { bg: "#f5f5f5", fg: "#9e9e9e" },
  default:    { bg: "#f5f5f5", fg: "#555" },
};

/* ── Styles ── */

// A4 at 96dpi: 794 × 1123px. We use min-height so content can overflow gracefully on screen.
const a4Page: React.CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  background: "#fff",
  padding: "40px 48px",
  boxSizing: "border-box",
  marginBottom: "0",
  breakAfter: "page",
  pageBreakAfter: "always",
  position: "relative",
};

const canvas: React.CSSProperties = {
  background: "#6b6b6b",
  padding: "32px 0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
};

const toolbar: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  gap: "16px",
  padding: "14px 24px",
  background: "#fff",
  borderBottom: "1px solid #e5e5e5",
  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
};

const printHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "2px solid #1e3a1e",
  paddingBottom: "12px",
  marginBottom: "24px",
};

const logoImg: React.CSSProperties = {
  height: "36px",
  width: "auto",
  objectFit: "contain",
};

const headerRight: React.CSSProperties = { textAlign: "right" };

const headerRaceName: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1e3a1e",
};

const headerAthleteName: React.CSSProperties = {
  fontSize: "11px",
  color: "#666",
  marginTop: "2px",
};

const weekHeaderBar: React.CSSProperties = { marginBottom: "20px" };

const weekTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 700,
  color: "#1e3a1e",
};

const focusBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: "12px",
  background: "#1e3a1e",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 600,
};

const weekNotes: React.CSSProperties = {
  margin: "6px 0 0",
  fontSize: "13px",
  color: "#666",
  fontStyle: "italic",
};

const weekStat: React.CSSProperties = {
  marginTop: "14px",
  fontSize: "12px",
  color: "#888",
};

const overviewTable: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const ovTh: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "2px solid #1e3a1e",
  fontSize: "12px",
  fontWeight: 600,
  color: "#1e3a1e",
  background: "#f9f9f9",
};

const ovTd: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #eee",
  fontSize: "13px",
  verticalAlign: "middle",
};

const sessionCard: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: "6px",
  padding: "14px",
  marginBottom: "10px",
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

const sessionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "8px",
  flexWrap: "wrap",
};

const sessionName: React.CSSProperties = { fontSize: "14px", color: "#111" };

const sessionMeta: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  fontSize: "12px",
  color: "#666",
  whiteSpace: "nowrap",
};

const dayLabel: React.CSSProperties = { fontSize: "12px", color: "#555", fontWeight: 500 };

const typeBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 7px",
  borderRadius: "10px",
  fontSize: "11px",
  fontWeight: 600,
};

const smallTypeBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: "8px",
  fontSize: "11px",
  fontWeight: 600,
};

const keyBadge: React.CSSProperties = {
  fontSize: "11px",
  color: "#b45309",
  background: "#fef3c7",
  padding: "1px 6px",
  borderRadius: "8px",
  fontWeight: 600,
};

const descriptionText: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "13px",
  color: "#555",
  lineHeight: "1.5",
};

const reasonBox: React.CSSProperties = {
  background: "#f0f7f0",
  border: "1px solid #c8e6c9",
  borderRadius: "5px",
  padding: "8px 12px",
  marginBottom: "10px",
  fontSize: "12px",
  lineHeight: "1.5",
};

const reasonLabel: React.CSSProperties = {
  fontWeight: 600,
  color: "#2e7d32",
  marginRight: "5px",
};

const reasonText: React.CSSProperties = {
  color: "#444",
  fontStyle: "italic",
};

const exTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px",
  marginTop: "8px",
};

const exTh: React.CSSProperties = {
  textAlign: "left",
  padding: "5px 8px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  color: "#555",
  background: "#fafafa",
};

const exTd: React.CSSProperties = {
  padding: "5px 8px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "top",
  color: "#333",
};

const backBtn: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#fff",
  color: "#111",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

const printBtn: React.CSSProperties = {
  padding: "10px 20px",
  border: "none",
  borderRadius: "8px",
  background: "#1e3a1e",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

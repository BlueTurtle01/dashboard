"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

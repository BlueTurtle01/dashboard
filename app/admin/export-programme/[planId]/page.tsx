"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GeneratedPlan, PlanWeek, PlanSession, PlanExercise } from "@/lib/planner/types";

type PlanMeta = {
  name: string;
  athleteName: string | null;
  raceName: string | null;
};

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function ExerciseRow({ ex }: { ex: PlanExercise }) {
  const prescription =
    ex.sets && ex.reps
      ? `${ex.sets} × ${ex.reps}`
      : ex.sets && ex.durationSeconds
      ? `${ex.sets} × ${formatDuration(ex.durationSeconds)}`
      : ex.durationSeconds
      ? formatDuration(ex.durationSeconds)
      : ex.sets
      ? `${ex.sets} sets`
      : "—";

  return (
    <tr>
      <td style={exTd}>{ex.name}</td>
      <td style={{ ...exTd, textAlign: "center", whiteSpace: "nowrap" }}>{prescription}</td>
      <td style={exTd}>{ex.description || "—"}</td>
    </tr>
  );
}

function SessionCard({ session }: { session: PlanSession }) {
  const isGym = session.type === "Gym";
  const typeColour = SESSION_COLOURS[session.type] ?? SESSION_COLOURS.default;

  return (
    <div style={sessionCard}>
      <div style={sessionHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ ...typeBadge, background: typeColour.bg, color: typeColour.fg }}>
            {session.type}
          </span>
          <span style={dayLabel}>{session.dayLabel}</span>
          {session.isKeySession && <span style={keyBadge}>★ Key Session</span>}
          <strong style={sessionName}>{session.name}</strong>
        </div>
        <div style={sessionMeta}>
          {session.duration && <span>{session.duration}</span>}
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

      {isGym && session.exercises.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <table style={exTable}>
            <thead>
              <tr>
                <th style={exTh}>Exercise</th>
                <th style={{ ...exTh, textAlign: "center" }}>Sets / Reps</th>
                <th style={exTh}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {session.exercises.map((ex) => (
                <ExerciseRow key={ex.id} ex={ex} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WeekOverview({ week }: { week: PlanWeek }) {
  const trainingSessions = week.sessions.filter((s) => s.type !== "Rest");
  return (
    <div style={weekPage}>
      <div style={weekHeaderBar}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <h2 style={weekTitle}>Week {week.weekNumber}</h2>
          <span style={phaseBadge}>{week.phase}</span>
          {week.trainingPurpose && (
            <span style={purposeText}>{week.trainingPurpose}</span>
          )}
        </div>
        <div style={focusText}>{week.focus}</div>
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
          {week.sessions.map((s) => (
            <tr key={s.id} style={s.type === "Rest" ? restRowStyle : undefined}>
              <td style={ovTd}>{s.dayLabel}</td>
              <td style={ovTd}>
                <span
                  style={{
                    ...smallTypeBadge,
                    background: (SESSION_COLOURS[s.type] ?? SESSION_COLOURS.default).bg,
                    color: (SESSION_COLOURS[s.type] ?? SESSION_COLOURS.default).fg,
                  }}
                >
                  {s.type}
                </span>
              </td>
              <td style={{ ...ovTd, fontWeight: s.isKeySession ? 600 : 400 }}>{s.name}</td>
              <td style={ovTd}>{s.duration || "—"}</td>
              <td style={{ ...ovTd, textTransform: "capitalize" }}>{s.intensity || "—"}</td>
              <td style={{ ...ovTd, textAlign: "center" }}>{s.isKeySession ? "★" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {week.isHolidayWeek && (
        <div style={holidayBanner}>Holiday / reduced training week</div>
      )}

      <div style={weekStat}>
        {trainingSessions.length} training session{trainingSessions.length !== 1 ? "s" : ""}
        {" · "}
        {week.sessions.filter((s) => s.isKeySession).length} key session{week.sessions.filter((s) => s.isKeySession).length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function WeekDetail({ week }: { week: PlanWeek }) {
  return (
    <div style={weekPage}>
      <div style={weekHeaderBar}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <h2 style={weekTitle}>Week {week.weekNumber} — Full Detail</h2>
          <span style={phaseBadge}>{week.phase}</span>
          {week.trainingPurpose && (
            <span style={purposeText}>{week.trainingPurpose}</span>
          )}
        </div>
        <div style={focusText}>{week.focus}</div>
        {week.notes && <p style={weekNotes}>{week.notes}</p>}
      </div>

      {week.sessions.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}

function PrintHeader({ meta }: { meta: PlanMeta }) {
  return (
    <div style={printHeader}>
      <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
      <div style={headerRight}>
        {meta.raceName && <div style={headerRaceName}>{meta.raceName}</div>}
        {meta.athleteName && <div style={headerAthleteName}>{meta.athleteName}</div>}
      </div>
    </div>
  );
}

export default function ExportPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const planId = params?.planId as string;
  const supabase = createClient();

  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [meta, setMeta] = useState<PlanMeta>({ name: "", athleteName: null, raceName: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!planId) return;
    async function load() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("athlete_plans")
        .select(`
          name,
          plan_json,
          athlete_profiles!athlete_user_id ( full_name ),
          races!event_id ( race_name )
        `)
        .eq("id", planId)
        .single();

      if (err || !data) {
        setError(err?.message ?? "Plan not found.");
        setLoading(false);
        return;
      }

      const rawAthlete = Array.isArray(data.athlete_profiles)
        ? data.athlete_profiles[0]
        : data.athlete_profiles;
      const rawRace = Array.isArray(data.races) ? data.races[0] : data.races;

      setMeta({
        name: (data.name as string) ?? "Unnamed Plan",
        athleteName: (rawAthlete as { full_name: string | null } | null)?.full_name ?? null,
        raceName: (rawRace as { race_name: string | null } | null)?.race_name ?? null,
      });

      try {
        const parsed = typeof data.plan_json === "string"
          ? JSON.parse(data.plan_json)
          : data.plan_json;
        setPlan(parsed as GeneratedPlan);
      } catch {
        setError("Could not parse plan data.");
      }

      setLoading(false);
    }
    void load();
  }, [planId]);

  if (loading) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#666" }}>Loading plan...</p>
      </main>
    );
  }

  if (error || !plan) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#b00020" }}>{error || "Plan not found."}</p>
        <button type="button" onClick={() => router.push("/admin/export-programme")} style={backBtn}>
          Back
        </button>
      </main>
    );
  }

  return (
    <>
      {/* ── Screen-only toolbar ── */}
      <div style={toolbar} className="no-print">
        <button type="button" onClick={() => router.push("/admin/export-programme")} style={backBtn}>
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "16px" }}>{meta.name}</strong>
          {meta.athleteName && (
            <span style={{ color: "#666", marginLeft: "10px", fontSize: "14px" }}>
              {meta.athleteName}
            </span>
          )}
          {meta.raceName && (
            <span style={{ color: "#666", marginLeft: "10px", fontSize: "14px" }}>
              · {meta.raceName}
            </span>
          )}
        </div>
        <button type="button" onClick={() => window.print()} style={printBtn}>
          Export to PDF
        </button>
      </div>

      {/* ── Printable document ── */}
      <div style={printDocument}>
        {/* Cover page */}
        <div style={{ ...weekPage, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "80vh", textAlign: "center" }}>
          <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={{ maxWidth: "280px", marginBottom: "48px" }} />
          <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#1e3a1e", marginBottom: "16px" }}>{meta.name}</h1>
          {meta.athleteName && <p style={{ fontSize: "20px", color: "#444", margin: "4px 0" }}>{meta.athleteName}</p>}
          {meta.raceName && <p style={{ fontSize: "18px", color: "#666", margin: "4px 0" }}>{meta.raceName}</p>}
          {plan.eventDate && (
            <p style={{ fontSize: "15px", color: "#888", marginTop: "16px" }}>
              Race date: {new Date(plan.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
          <p style={{ fontSize: "15px", color: "#888" }}>
            {plan.weeksAvailable} week programme · {plan.trainingDaysPerWeek} training days per week
          </p>
        </div>

        {/* Section divider: Overview */}
        <div style={sectionDivider}>
          <PrintHeader meta={meta} />
          <h2 style={sectionTitle}>Programme Overview</h2>
          <p style={sectionSubtitle}>One week per page — all sessions at a glance</p>
        </div>

        {/* Overview — one week per page */}
        {plan.weeks.map((week) => (
          <div key={`overview-${week.id}`}>
            <PrintHeader meta={meta} />
            <WeekOverview week={week} />
          </div>
        ))}

        {/* Section divider: Full Detail */}
        <div style={sectionDivider}>
          <PrintHeader meta={meta} />
          <h2 style={sectionTitle}>Full Session Detail</h2>
          <p style={sectionSubtitle}>Complete session breakdown including gym exercises and session rationale</p>
        </div>

        {/* Detail — one week per page */}
        {plan.weeks.map((week) => (
          <div key={`detail-${week.id}`}>
            <PrintHeader meta={meta} />
            <WeekDetail week={week} />
          </div>
        ))}
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          @page { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
        }
        @media screen {
          .no-print { display: flex; }
        }
      `}</style>
    </>
  );
}

/* ── Colour map for session types ── */
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

const printDocument: React.CSSProperties = {
  background: "#f0f0f0",
  padding: "24px",
};

const weekPage: React.CSSProperties = {
  background: "#fff",
  maxWidth: "794px", // A4 width approximation at 96dpi
  margin: "0 auto 24px",
  padding: "32px 40px",
  borderRadius: "4px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  breakAfter: "page",
  pageBreakAfter: "always",
};

const sectionDivider: React.CSSProperties = {
  background: "#fff",
  maxWidth: "794px",
  margin: "0 auto 24px",
  padding: "40px",
  borderRadius: "4px",
  boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
  breakAfter: "page",
  pageBreakAfter: "always",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "400px",
  textAlign: "center",
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
  height: "40px",
  width: "auto",
  objectFit: "contain",
};

const headerRight: React.CSSProperties = {
  textAlign: "right",
};

const headerRaceName: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#1e3a1e",
};

const headerAthleteName: React.CSSProperties = {
  fontSize: "12px",
  color: "#666",
  marginTop: "2px",
};

const weekHeaderBar: React.CSSProperties = {
  marginBottom: "20px",
};

const weekTitle: React.CSSProperties = {
  margin: 0,
  fontSize: "22px",
  fontWeight: 700,
  color: "#1e3a1e",
};

const phaseBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: "12px",
  background: "#1e3a1e",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 600,
};

const purposeText: React.CSSProperties = {
  fontSize: "13px",
  color: "#555",
  fontStyle: "italic",
};

const focusText: React.CSSProperties = {
  fontSize: "15px",
  color: "#444",
  marginTop: "6px",
  fontWeight: 500,
};

const weekNotes: React.CSSProperties = {
  margin: "8px 0 0",
  fontSize: "13px",
  color: "#666",
  fontStyle: "italic",
};

const weekStat: React.CSSProperties = {
  marginTop: "14px",
  fontSize: "12px",
  color: "#888",
};

const overviewTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

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

const restRowStyle: React.CSSProperties = {
  opacity: 0.5,
};

const sessionCard: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "12px",
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

const sessionName: React.CSSProperties = {
  fontSize: "15px",
  color: "#111",
};

const sessionMeta: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  fontSize: "12px",
  color: "#666",
  whiteSpace: "nowrap",
};

const dayLabel: React.CSSProperties = {
  fontSize: "13px",
  color: "#555",
  fontWeight: 500,
};

const typeBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
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
  borderRadius: "6px",
  padding: "10px 14px",
  marginBottom: "12px",
  fontSize: "13px",
  lineHeight: "1.5",
};

const reasonLabel: React.CSSProperties = {
  fontWeight: 600,
  color: "#2e7d32",
  marginRight: "6px",
};

const reasonText: React.CSSProperties = {
  color: "#444",
  fontStyle: "italic",
};

const exTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px",
};

const exTh: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "1px solid #ddd",
  fontWeight: 600,
  color: "#555",
  background: "#fafafa",
};

const exTd: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "top",
  color: "#333",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#1e3a1e",
  margin: "0 0 8px",
};

const sectionSubtitle: React.CSSProperties = {
  fontSize: "15px",
  color: "#666",
  margin: 0,
};

const holidayBanner: React.CSSProperties = {
  marginTop: "12px",
  padding: "8px 14px",
  background: "#fff8e1",
  border: "1px solid #ffe082",
  borderRadius: "6px",
  fontSize: "13px",
  color: "#f57f17",
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

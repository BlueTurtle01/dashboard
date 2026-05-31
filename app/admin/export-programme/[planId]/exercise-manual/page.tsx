"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ── Types (minimal — only what the manual needs) ── */
type TemplateExerciseJoin = {
  exercises: {
    name: string;
    description: string | null;
    steps: string[] | null;
    primary_muscles: string[] | null;
    secondary_muscles: string[] | null;
  } | null;
};

type TemplateSession = {
  program_template_session_exercises: TemplateExerciseJoin[];
};

type TemplateWeek = {
  program_template_sessions: TemplateSession[];
};

type ProgramTemplate = {
  id: string;
  name: string;
  event_goal: string | null;
  discipline: string | null;
  plan_length_weeks: number;
  training_days_per_week: number;
  program_template_weeks: TemplateWeek[];
};

type ExerciseEntry = {
  name: string;
  description: string;
  steps: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
};

/* ── Extract unique exercises sorted alphabetically ── */
function extractExercises(template: ProgramTemplate): ExerciseEntry[] {
  const seen = new Map<string, ExerciseEntry>();
  for (const week of template.program_template_weeks) {
    for (const session of week.program_template_sessions) {
      for (const ex of session.program_template_session_exercises) {
        if (ex.exercises && !seen.has(ex.exercises.name)) {
          seen.set(ex.exercises.name, {
            name: ex.exercises.name,
            description: ex.exercises.description ?? "",
            steps: ex.exercises.steps ?? [],
            primaryMuscles: (ex.exercises.primary_muscles ?? []).filter(Boolean),
            secondaryMuscles: (ex.exercises.secondary_muscles ?? []).filter(Boolean),
          });
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Shared print header (matches programme PDF) ── */
function PrintHeader({ template }: { template: ProgramTemplate }) {
  return (
    <div style={printHeaderStyle}>
      <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={logoImg} />
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a1e" }}>{template.name}</div>
        <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>Exercise Manual</div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function ExerciseManualPage() {
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
      const { data, error: err } = await supabase
        .from("program_templates")
        .select(`
          id, name, event_goal, discipline, plan_length_weeks, training_days_per_week,
          program_template_weeks (
            program_template_sessions (
              program_template_session_exercises (
                exercises ( name, description, steps, primary_muscles, secondary_muscles )
              )
            )
          )
        `)
        .eq("id", templateId)
        .single();

      if (err || !data) {
        setError(err?.message ?? "Template not found.");
      } else {
        setTemplate(data as unknown as ProgramTemplate);
      }
      setLoading(false);
    }
    void load();
  }, [templateId]);

  const exercises = useMemo(() => (template ? extractExercises(template) : []), [template]);

  if (loading) {
    return <main style={{ padding: "60px 24px", textAlign: "center" }}><p style={{ color: "#666" }}>Loading...</p></main>;
  }

  if (error || !template) {
    return (
      <main style={{ padding: "60px 24px", textAlign: "center" }}>
        <p style={{ color: "#b00020" }}>{error || "Template not found."}</p>
        <button type="button" onClick={() => router.push(`/admin/export-programme/${templateId}`)} style={backBtn}>Back</button>
      </main>
    );
  }

  return (
    <>
      {/* ── Screen toolbar (hidden on print) ── */}
      <div style={toolbar} className="no-print">
        <button type="button" onClick={() => router.push(`/admin/export-programme/${templateId}`)} style={backBtn}>
          ← Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: "16px" }}>{template.name} — Exercise Manual</strong>
          <span style={{ color: "#aaa", marginLeft: "10px", fontSize: "13px" }}>
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button type="button" onClick={() => window.print()} style={printBtn}>
          Export to PDF
        </button>
      </div>

      {/* ── A4 document canvas ── */}
      <div style={canvas}>

        {/* Cover page — page 1 */}
        <div style={{ ...a4Page, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <img src="/tortoise-logo.png" alt="Tortoise Endurance" style={{ maxWidth: "260px", marginBottom: "48px" }} />
          <h1 style={{ fontSize: "30px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 12px" }}>{template.name}</h1>
          <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#555", margin: "0 0 16px", borderTop: "2px solid #1e3a1e", paddingTop: "16px", width: "100%", maxWidth: "400px" }}>Exercise Manual</h2>
          {template.event_goal && <p style={{ fontSize: "15px", color: "#888", margin: "4px 0" }}>{template.event_goal}</p>}
          {template.discipline && <p style={{ fontSize: "14px", color: "#aaa", margin: "4px 0", textTransform: "capitalize" }}>{template.discipline}</p>}
          <p style={{ fontSize: "13px", color: "#aaa", marginTop: "24px" }}>
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""} · alphabetical order
          </p>
          <div style={pageNum}>1</div>
        </div>

        {/* One A4 page per exercise — pages 2, 3, 4 … */}
        {exercises.map((ex, i) => (
          <div key={ex.name} style={a4Page}>
            <PrintHeader template={template} />

            {/* Exercise name */}
            <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#1e3a1e", margin: "0 0 10px" }}>{ex.name}</h2>

            {/* Muscle tags */}
            {(ex.primaryMuscles.length > 0 || ex.secondaryMuscles.length > 0) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
                {ex.primaryMuscles.map((m) => (
                  <span key={m} style={primaryTag}>{m}</span>
                ))}
                {ex.secondaryMuscles.map((m) => (
                  <span key={m} style={secondaryTag}>{m}</span>
                ))}
              </div>
            )}

            {/* Description */}
            {ex.description && (
              <p style={{ fontSize: "13px", color: "#444", lineHeight: "1.7", marginBottom: "18px" }}>
                {ex.description}
              </p>
            )}

            {/* Steps */}
            {ex.steps.length > 0 && (
              <div>
                <p style={{ margin: "0 0 10px", fontSize: "11px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #e5e5e5", paddingBottom: "6px" }}>
                  Steps
                </p>
                <ol style={{ margin: 0, paddingLeft: "22px" }}>
                  {ex.steps.map((step, si) => (
                    <li key={si} style={{ fontSize: "13px", color: "#333", lineHeight: "1.75", marginBottom: "6px" }}>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Page number */}
            <div style={pageNum}>{i + 2}</div>
          </div>
        ))}

      </div>

      <style>{`
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @media print {
          .no-print { display: none !important; }
          .app-sidebar { display: none !important; }
          .app-topbar { display: none !important; }
          body { margin: 0 !important; padding: 0 !important; background: #fff; }
          .app-content { margin: 0 !important; padding: 0 !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

/* ── Styles ── */

const a4Page: React.CSSProperties = {
  width: "794px",
  minHeight: "1123px",
  background: "#fff",
  padding: "40px 48px",
  boxSizing: "border-box",
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

const printHeaderStyle: React.CSSProperties = {
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

const pageNum: React.CSSProperties = {
  position: "absolute",
  bottom: "24px",
  right: "48px",
  fontSize: "11px",
  color: "#aaa",
};

const primaryTag: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 9px",
  borderRadius: "10px",
  fontSize: "11px",
  fontWeight: 600,
  background: "#1e3a1e",
  color: "#fff",
};

const secondaryTag: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 9px",
  borderRadius: "10px",
  fontSize: "11px",
  fontWeight: 500,
  background: "#e8f5e9",
  color: "#2e7d32",
  border: "1px solid #c8e6c9",
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

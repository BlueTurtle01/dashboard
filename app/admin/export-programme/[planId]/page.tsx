"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type TemplateSummary = {
  id: string;
  name: string;
  event_goal: string | null;
  discipline: string | null;
  plan_length_weeks: number;
  training_days_per_week: number;
  focus_descriptions: Record<string, string> | null;
};

type WeekRow = {
  week_number: number;
  focus: string | null;
};

export default function ExportHubPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params?.planId as string;
  const supabase = createClient();

  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Local editable state for focus descriptions
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    if (!templateId) return;
    async function load() {
      const [templateResult, weeksResult] = await Promise.all([
        supabase
          .from("program_templates")
          .select("id, name, event_goal, discipline, plan_length_weeks, training_days_per_week, focus_descriptions")
          .eq("id", templateId)
          .single(),
        supabase
          .from("program_template_weeks")
          .select("week_number, focus")
          .eq("program_template_id", templateId)
          .order("week_number", { ascending: true }),
      ]);

      if (templateResult.error || !templateResult.data) {
        setError(templateResult.error?.message ?? "Template not found.");
        setLoading(false);
        return;
      }

      const t = templateResult.data as TemplateSummary;
      setTemplate(t);
      setDescriptions(t.focus_descriptions ?? {});
      setWeeks((weeksResult.data ?? []) as WeekRow[]);
      setLoading(false);
    }
    void load();
  }, [templateId]);

  // Derive unique focuses in order of first appearance
  const uniqueFocuses: { label: string; weekNumbers: number[] }[] = [];
  const seen = new Set<string>();
  for (const w of weeks) {
    if (!w.focus) continue;
    if (!seen.has(w.focus)) {
      seen.add(w.focus);
      uniqueFocuses.push({ label: w.focus, weekNumbers: [] });
    }
    uniqueFocuses.find((f) => f.label === w.focus)!.weekNumbers.push(w.week_number);
  }

  async function handleSave() {
    if (!templateId) return;
    setSaving(true);
    setSaveStatus("");
    const { error: err } = await supabase
      .from("program_templates")
      .update({ focus_descriptions: descriptions })
      .eq("id", templateId);
    setSaving(false);
    setSaveStatus(err ? `Error: ${err.message}` : "Saved.");
    setTimeout(() => setSaveStatus(""), 2500);
  }

  if (loading) {
    return <main style={page}><p style={{ color: "#666", textAlign: "center", paddingTop: "60px" }}>Loading...</p></main>;
  }

  if (error || !template) {
    return (
      <main style={page}>
        <p style={{ color: "#b00020", textAlign: "center", paddingTop: "60px" }}>{error || "Template not found."}</p>
        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <button type="button" onClick={() => router.push("/admin/export-programme")} style={secondaryBtn}>
            Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={headerRow}>
          <button type="button" onClick={() => router.push("/admin/export-programme")} style={secondaryBtn}>
            ← Back
          </button>
        </div>

        <div style={titleBlock}>
          <h1 style={title}>{template.name}</h1>
          <div style={metaRow}>
            {template.event_goal && <span style={metaChip}>{template.event_goal}</span>}
            {template.discipline && <span style={metaChip}>{template.discipline}</span>}
            <span style={metaChip}>{template.plan_length_weeks} weeks</span>
            <span style={metaChip}>{template.training_days_per_week} days/week</span>
          </div>
          <p style={subtitle}>Choose a document to preview and export as PDF.</p>
        </div>

        {/* Export documents */}
        <div style={grid}>
          <button
            type="button"
            style={docCard}
            onClick={() => router.push(`/admin/export-programme/${templateId}/programme`)}
          >
            <div style={docIcon}>📋</div>
            <div style={docTitle}>Programme PDF</div>
            <div style={docDesc}>
              The full training programme: cover page, weekly calendar overview, phase descriptions, race profile, mileage chart, race strategy, and week-by-week session detail.
            </div>
            <div style={docAction}>Open →</div>
          </button>

          <button
            type="button"
            style={docCard}
            onClick={() => router.push(`/admin/export-programme/${templateId}/exercise-manual`)}
          >
            <div style={docIcon}>📖</div>
            <div style={docTitle}>Exercise Manual</div>
            <div style={docDesc}>
              A reference guide containing the description and step-by-step instructions for every exercise used in this programme. Consistent branding and page numbers for cross-referencing.
            </div>
            <div style={docAction}>Open →</div>
          </button>
        </div>

        {/* Phase descriptions editor */}
        {uniqueFocuses.length > 0 && (
          <div style={section}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Phase Descriptions</h2>
                <p style={sectionSubtitle}>
                  These appear in the Programme PDF after the weekly calendar overview. Describe the purpose of each training phase.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {saveStatus && (
                  <span style={{ fontSize: "13px", color: saveStatus.startsWith("Error") ? "#b00020" : "#2e7d32" }}>
                    {saveStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={primaryBtn}
                >
                  {saving ? "Saving…" : "Save Descriptions"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {uniqueFocuses.map(({ label, weekNumbers }) => {
                const wkRange = weekNumbers.length === 1
                  ? `Week ${weekNumbers[0]}`
                  : `Weeks ${Math.min(...weekNumbers)}–${Math.max(...weekNumbers)}`;
                return (
                  <div key={label} style={focusCard}>
                    <div style={focusCardHeader}>
                      <div>
                        <div style={focusLabel}>{label}</div>
                        <div style={focusWeeks}>{wkRange} · {weekNumbers.length} week{weekNumbers.length !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <textarea
                      value={descriptions[label] ?? ""}
                      onChange={(e) => setDescriptions((prev) => ({ ...prev, [label]: e.target.value }))}
                      placeholder={`Describe the purpose of the ${label} phase — what athletes are training for, what to expect, and what success looks like.`}
                      rows={4}
                      style={textarea}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const container: React.CSSProperties = { maxWidth: "860px", margin: "0 auto" };
const headerRow: React.CSSProperties = { marginBottom: "32px" };
const titleBlock: React.CSSProperties = { marginBottom: "36px" };
const title: React.CSSProperties = { margin: "0 0 10px", fontSize: "28px", fontWeight: 700, color: "#111" };
const metaRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" };
const metaChip: React.CSSProperties = { display: "inline-block", padding: "3px 10px", borderRadius: "12px", fontSize: "12px", background: "#e8f5e9", color: "#2e7d32", fontWeight: 500 };
const subtitle: React.CSSProperties = { margin: 0, color: "#666", fontSize: "15px" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "40px" };
const docCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: "12px",
  padding: "28px 24px",
  cursor: "pointer",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  transition: "box-shadow 0.15s",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};
const docIcon: React.CSSProperties = { fontSize: "28px" };
const docTitle: React.CSSProperties = { fontSize: "18px", fontWeight: 700, color: "#1e3a1e" };
const docDesc: React.CSSProperties = { fontSize: "14px", color: "#555", lineHeight: "1.6", flex: 1 };
const docAction: React.CSSProperties = { fontSize: "14px", fontWeight: 600, color: "#1e3a1e", marginTop: "4px" };
const secondaryBtn: React.CSSProperties = { padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "14px" };
const primaryBtn: React.CSSProperties = { padding: "10px 20px", border: "none", borderRadius: "8px", background: "#1e3a1e", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "14px" };
const section: React.CSSProperties = { background: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "28px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" };
const sectionHeader: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "24px" };
const sectionTitle: React.CSSProperties = { margin: "0 0 6px", fontSize: "18px", fontWeight: 700, color: "#1e3a1e" };
const sectionSubtitle: React.CSSProperties = { margin: 0, fontSize: "14px", color: "#666", lineHeight: "1.5" };
const focusCard: React.CSSProperties = { border: "1px solid #eee", borderRadius: "8px", padding: "16px", background: "#fafafa" };
const focusCardHeader: React.CSSProperties = { marginBottom: "10px" };
const focusLabel: React.CSSProperties = { fontSize: "15px", fontWeight: 700, color: "#1e3a1e" };
const focusWeeks: React.CSSProperties = { fontSize: "12px", color: "#888", marginTop: "2px" };
const textarea: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid #ddd", borderRadius: "6px", padding: "10px 12px", fontSize: "13px", lineHeight: "1.6", resize: "vertical", fontFamily: "inherit", background: "#fff", color: "#111" };

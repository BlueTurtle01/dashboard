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
};

export default function ExportHubPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params?.planId as string;
  const supabase = createClient();

  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!templateId) return;
    async function load() {
      const { data, error: err } = await supabase
        .from("program_templates")
        .select("id, name, event_goal, discipline, plan_length_weeks, training_days_per_week")
        .eq("id", templateId)
        .single();
      if (err || !data) {
        setError(err?.message ?? "Template not found.");
      } else {
        setTemplate(data as TemplateSummary);
      }
      setLoading(false);
    }
    void load();
  }, [templateId]);

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

        <div style={grid}>
          <button
            type="button"
            style={docCard}
            onClick={() => router.push(`/admin/export-programme/${templateId}/programme`)}
          >
            <div style={docIcon}>📋</div>
            <div style={docTitle}>Programme PDF</div>
            <div style={docDesc}>
              The full training programme: cover page, weekly mileage, race strategy, and week-by-week session detail. Exercise steps are replaced with page references to the Exercise Manual.
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
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" };
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

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type VaccinationStatus = "Unnecessary" | "Recommended" | "Mandatory";

type CountryDetail = {
  id: string;
  country_name: string;
  hepatitis_a: VaccinationStatus;
  tetanus: VaccinationStatus;
  typhoid: VaccinationStatus;
  hepatitis_b: VaccinationStatus;
  rabies: VaccinationStatus;
  cholera: VaccinationStatus;
  yellow_fever: VaccinationStatus;
  polio: VaccinationStatus;
  dengue: VaccinationStatus;
  chikungunya: VaccinationStatus;
  meningococcal_acwy: VaccinationStatus;
  bcg_tb: VaccinationStatus;
  notes: string | null;
  source_name: string;
  source_url: string;
  checked_at: string;
};

const VACCINE_LABELS: Array<{ field: keyof CountryDetail; label: string }> = [
  { field: "hepatitis_a", label: "Hepatitis A" },
  { field: "hepatitis_b", label: "Hepatitis B" },
  { field: "tetanus", label: "Tetanus" },
  { field: "typhoid", label: "Typhoid" },
  { field: "rabies", label: "Rabies" },
  { field: "cholera", label: "Cholera" },
  { field: "yellow_fever", label: "Yellow Fever" },
  { field: "polio", label: "Polio" },
  { field: "dengue", label: "Dengue" },
  { field: "chikungunya", label: "Chikungunya" },
  { field: "meningococcal_acwy", label: "Meningococcal ACWY" },
  { field: "bcg_tb", label: "BCG / TB" },
];

function StatusBadge({ status }: { status: VaccinationStatus }) {
  if (status === "Mandatory") return <span style={mandatoryBadgeStyle}>Mandatory</span>;
  if (status === "Recommended") return <span style={recommendedBadgeStyle}>Recommended</span>;
  return <span style={unnecessaryBadgeStyle}>Unnecessary</span>;
}

export default function CountryDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [country, setCountry] = useState<CountryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      const { data, error: err } = await supabase
        .from("travel_vaccination_cheatsheets")
        .select("*")
        .eq("id", id)
        .single();
      if (err) {
        setError(`Could not load country: ${err.message}`);
      } else {
        setCountry(data as CountryDetail);
      }
      setLoading(false);
    }
    if (id) load();
  }, [supabase, id]);

  const mandatory = VACCINE_LABELS.filter((v) => country && country[v.field] === "Mandatory");
  const recommended = VACCINE_LABELS.filter((v) => country && country[v.field] === "Recommended");
  const unnecessary = VACCINE_LABELS.filter((v) => country && country[v.field] === "Unnecessary");

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            {loading ? (
              <h1 style={titleStyle}>Loading...</h1>
            ) : country ? (
              <>
                <h1 style={titleStyle}>{country.country_name}</h1>
                <p style={subtitleStyle}>Travel health &amp; vaccination overview</p>
              </>
            ) : (
              <h1 style={titleStyle}>Country not found</h1>
            )}
          </div>
          <div style={headerActionsStyle}>
            <button type="button" onClick={() => router.push("/admin/countries")} style={secondaryButtonStyle}>
              Back to Countries
            </button>
          </div>
        </div>

        {error ? <p style={errorStyle}>{error}</p> : null}

        {!loading && country ? (
          <>
            {/* Summary strip */}
            <div style={summaryStripStyle}>
              <div style={summaryItemStyle}>
                <span style={summaryNumberStyle({ color: "#b00020" })}>{mandatory.length}</span>
                <span style={summaryLabelStyle}>Mandatory</span>
              </div>
              <div style={summaryDividerStyle} />
              <div style={summaryItemStyle}>
                <span style={summaryNumberStyle({ color: "#b45309" })}>{recommended.length}</span>
                <span style={summaryLabelStyle}>Recommended</span>
              </div>
              <div style={summaryDividerStyle} />
              <div style={summaryItemStyle}>
                <span style={summaryNumberStyle({ color: "#999" })}>{unnecessary.length}</span>
                <span style={summaryLabelStyle}>Unnecessary</span>
              </div>
            </div>

            {/* Vaccination table */}
            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>Vaccinations</h2>
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Vaccine</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {VACCINE_LABELS.map(({ field, label }) => (
                      <tr key={field}>
                        <td style={tdStyle}>{label}</td>
                        <td style={tdStyle}>
                          <StatusBadge status={country[field] as VaccinationStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Notes */}
            {country.notes ? (
              <section style={cardStyle}>
                <h2 style={sectionTitleStyle}>Notes</h2>
                <p style={notesStyle}>{country.notes}</p>
              </section>
            ) : null}

            {/* Source */}
            <section style={cardStyle}>
              <h2 style={sectionTitleStyle}>Source</h2>
              <p style={sourceLineStyle}>
                <span style={sourceLabelStyle}>Provider:</span> {country.source_name}
              </p>
              <p style={sourceLineStyle}>
                <span style={sourceLabelStyle}>URL:</span>{" "}
                <a href={country.source_url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                  {country.source_url}
                </a>
              </p>
              <p style={sourceLineStyle}>
                <span style={sourceLabelStyle}>Data checked:</span> {country.checked_at}
              </p>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "800px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "32px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px", alignItems: "flex-start" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px", marginBottom: "20px" };
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 16px", fontSize: "17px", fontWeight: 600 };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #ddd", fontSize: "13px", fontWeight: 600, background: "#fafafa", color: "#444" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #eee", fontSize: "14px" };
const notesStyle: React.CSSProperties = { margin: 0, color: "#444", fontSize: "14px", lineHeight: "1.6" };
const sourceLineStyle: React.CSSProperties = { margin: "0 0 8px", fontSize: "14px", color: "#444" };
const sourceLabelStyle: React.CSSProperties = { fontWeight: 600, color: "#111" };
const linkStyle: React.CSSProperties = { color: "#1a56db", textDecoration: "underline" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const mandatoryBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: "#fde8e8", color: "#b00020", fontSize: "13px", fontWeight: 600 };
const recommendedBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: "#fff8e1", color: "#b45309", fontSize: "13px", fontWeight: 600 };
const unnecessaryBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: "#f5f5f5", color: "#999", fontSize: "13px", fontWeight: 600 };

const summaryStripStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e5e5e5",
  marginBottom: "20px",
  overflow: "hidden",
};
const summaryItemStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "20px 16px",
  gap: "4px",
};
const summaryDividerStyle: React.CSSProperties = { width: "1px", background: "#e5e5e5", alignSelf: "stretch" };
const summaryNumberStyle = (extra: React.CSSProperties): React.CSSProperties => ({
  fontSize: "28px",
  fontWeight: 700,
  ...extra,
});
const summaryLabelStyle: React.CSSProperties = { fontSize: "13px", color: "#666" };

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type Tab = "vaccinations" | "climate";

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

type ClimateRow = {
  id: string;
  race_region: string;
  race_month: string;
  avg_day_temp_c_min: number | null;
  avg_day_temp_c_max: number | null;
  avg_night_temp_c_min: number | null;
  avg_night_temp_c_max: number | null;
  humidity_expectation: string | null;
  rainfall_expectation: string | null;
  wind_expectation: string | null;
  uv_expectation: string | null;
  training_implication: string;
  race_week_warning: string | null;
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

function tempRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min === null) return `up to ${max}°C`;
  if (max === null) return `${min}°C+`;
  return `${min}–${max}°C`;
}

export default function CountryDetailPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const supabase = createClient();

  const [country, setCountry] = useState<CountryDetail | null>(null);
  const [climate, setClimate] = useState<ClimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("vaccinations");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      // Try to load by slug first, then fallback to UUID for backward compatibility
      let { data: countryData, error: countryErr } = await supabase
        .from("travel_vaccination_cheatsheets")
        .select("*")
        .eq("slug", slug)
        .single();

      // If not found by slug, try UUID (backward compatibility)
      if (countryErr && countryErr.code === 'PGRST116') {
        const { data: uuidData, error: uuidErr } = await supabase
          .from("travel_vaccination_cheatsheets")
          .select("*")
          .eq("id", slug)
          .single();
        countryData = uuidData;
        countryErr = uuidErr;
      }

      if (countryErr) {
        setError(`Could not load country: ${countryErr.message}`);
        setLoading(false);
        return;
      }

      const c = countryData as CountryDetail;
      setCountry(c);

      const { data: climateData } = await supabase
        .from("race_climate_expectations")
        .select("*")
        .eq("country_name", c.country_name)
        .order("race_region")
        .order("race_month");

      setClimate((climateData || []) as ClimateRow[]);
      setLoading(false);
    }

    if (slug) load();
  }, [supabase, slug]);

  const mandatory = VACCINE_LABELS.filter((v) => country && country[v.field] === "Mandatory");
  const recommended = VACCINE_LABELS.filter((v) => country && country[v.field] === "Recommended");
  const unnecessary = VACCINE_LABELS.filter((v) => country && country[v.field] === "Unnecessary");

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerRowStyle}>
          <div>
            {loading ? (
              <h1 style={titleStyle}>Loading...</h1>
            ) : country ? (
              <>
                <h1 style={titleStyle}>{country.country_name}</h1>
                <p style={subtitleStyle}>Travel health &amp; race climate overview</p>
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
                <span style={summaryLabelStyle}>Mandatory vax</span>
              </div>
              <div style={summaryDividerStyle} />
              <div style={summaryItemStyle}>
                <span style={summaryNumberStyle({ color: "#b45309" })}>{recommended.length}</span>
                <span style={summaryLabelStyle}>Recommended vax</span>
              </div>
              <div style={summaryDividerStyle} />
              <div style={summaryItemStyle}>
                <span style={summaryNumberStyle({ color: "#1a56db" })}>{climate.length}</span>
                <span style={summaryLabelStyle}>Climate entries</span>
              </div>
            </div>

            {/* Tab bar */}
            <div style={tabBarStyle}>
              <button
                type="button"
                style={tab === "vaccinations" ? activeTabStyle : tabStyle}
                onClick={() => setTab("vaccinations")}
              >
                Vaccinations
              </button>
              <button
                type="button"
                style={tab === "climate" ? activeTabStyle : tabStyle}
                onClick={() => setTab("climate")}
              >
                Climate
                {climate.length > 0 && (
                  <span style={tabCountStyle}>{climate.length}</span>
                )}
              </button>
            </div>

            {/* Vaccinations tab */}
            {tab === "vaccinations" && (
              <>
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

                {country.notes ? (
                  <section style={cardStyle}>
                    <h2 style={sectionTitleStyle}>Notes</h2>
                    <p style={notesStyle}>{country.notes}</p>
                  </section>
                ) : null}

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
            )}

            {/* Climate tab */}
            {tab === "climate" && (
              <section style={cardStyle}>
                <h2 style={sectionTitleStyle}>Race Climate</h2>
                {climate.length === 0 ? (
                  <p style={helperStyle}>No climate data added yet.</p>
                ) : (
                  climate.map((row) => (
                    <div key={row.id} style={climateCardStyle}>
                      <div style={climateHeaderStyle}>
                        <span style={climateRegionStyle}>{row.race_region}</span>
                        <span style={climateMonthStyle}>{row.race_month}</span>
                      </div>

                      <div style={climateGridStyle}>
                        <div style={climateStatStyle}>
                          <span style={climateStatLabelStyle}>Day temp</span>
                          <span style={climateStatValueStyle}>
                            {tempRange(row.avg_day_temp_c_min, row.avg_day_temp_c_max)}
                          </span>
                        </div>
                        <div style={climateStatStyle}>
                          <span style={climateStatLabelStyle}>Night temp</span>
                          <span style={climateStatValueStyle}>
                            {tempRange(row.avg_night_temp_c_min, row.avg_night_temp_c_max)}
                          </span>
                        </div>
                        {row.humidity_expectation ? (
                          <div style={climateStatStyle}>
                            <span style={climateStatLabelStyle}>Humidity</span>
                            <span style={climateStatValueStyle}>{row.humidity_expectation}</span>
                          </div>
                        ) : null}
                        {row.rainfall_expectation ? (
                          <div style={climateStatStyle}>
                            <span style={climateStatLabelStyle}>Rainfall</span>
                            <span style={climateStatValueStyle}>{row.rainfall_expectation}</span>
                          </div>
                        ) : null}
                        {row.wind_expectation ? (
                          <div style={climateStatStyle}>
                            <span style={climateStatLabelStyle}>Wind</span>
                            <span style={climateStatValueStyle}>{row.wind_expectation}</span>
                          </div>
                        ) : null}
                        {row.uv_expectation ? (
                          <div style={climateStatStyle}>
                            <span style={climateStatLabelStyle}>UV</span>
                            <span style={climateStatValueStyle}>{row.uv_expectation}</span>
                          </div>
                        ) : null}
                      </div>

                      <div style={climateImplicationStyle}>
                        <span style={climateImplicationLabelStyle}>Training implication</span>
                        <p style={climateImplicationTextStyle}>{row.training_implication}</p>
                      </div>

                      {row.race_week_warning ? (
                        <div style={climateWarningStyle}>
                          <span style={climateWarningLabelStyle}>Race week warning</span>
                          <p style={climateWarningTextStyle}>{row.race_week_warning}</p>
                        </div>
                      ) : null}

                      <div style={climateSourceStyle}>
                        Source:{" "}
                        <a href={row.source_url} target="_blank" rel="noopener noreferrer" style={linkStyle}>
                          {row.source_name}
                        </a>
                        {" · "}checked {row.checked_at}
                      </div>
                    </div>
                  ))
                )}
              </section>
            )}
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
const helperStyle: React.CSSProperties = { color: "#888", fontSize: "14px", margin: 0 };
const sourceLineStyle: React.CSSProperties = { margin: "0 0 8px", fontSize: "14px", color: "#444" };
const sourceLabelStyle: React.CSSProperties = { fontWeight: 600, color: "#111" };
const linkStyle: React.CSSProperties = { color: "#1a56db", textDecoration: "underline" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const mandatoryBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: "#fde8e8", color: "#b00020", fontSize: "13px", fontWeight: 600 };
const recommendedBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: "#fff8e1", color: "#b45309", fontSize: "13px", fontWeight: 600 };
const unnecessaryBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "3px 12px", borderRadius: "12px", background: "#f5f5f5", color: "#999", fontSize: "13px", fontWeight: 600 };

const summaryStripStyle: React.CSSProperties = { display: "flex", background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", marginBottom: "8px", overflow: "hidden" };
const summaryItemStyle: React.CSSProperties = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px", gap: "4px" };
const summaryDividerStyle: React.CSSProperties = { width: "1px", background: "#e5e5e5", alignSelf: "stretch" };
const summaryNumberStyle = (extra: React.CSSProperties): React.CSSProperties => ({ fontSize: "28px", fontWeight: 700, ...extra });
const summaryLabelStyle: React.CSSProperties = { fontSize: "13px", color: "#666" };

const tabBarStyle: React.CSSProperties = { display: "flex", gap: 0, borderBottom: "2px solid #e5e5e5", marginBottom: "24px", marginTop: "16px" };
const tabStyle: React.CSSProperties = { padding: "10px 20px", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: "-2px", cursor: "pointer", fontSize: "14px", fontWeight: 500, color: "#666", display: "flex", alignItems: "center", gap: "6px" };
const activeTabStyle: React.CSSProperties = { ...tabStyle, borderBottomColor: "#111", color: "#111", fontWeight: 700 };
const tabCountStyle: React.CSSProperties = { background: "#e5e5e5", color: "#555", borderRadius: "10px", padding: "1px 7px", fontSize: "12px", fontWeight: 600 };

const climateCardStyle: React.CSSProperties = { border: "1px solid #e5e5e5", borderRadius: "10px", padding: "16px", marginBottom: "16px" };
const climateHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "12px" };
const climateRegionStyle: React.CSSProperties = { fontWeight: 700, fontSize: "15px" };
const climateMonthStyle: React.CSSProperties = { fontSize: "13px", color: "#666", background: "#f5f5f5", padding: "2px 10px", borderRadius: "10px" };
const climateGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px", marginBottom: "14px" };
const climateStatStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "2px" };
const climateStatLabelStyle: React.CSSProperties = { fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" };
const climateStatValueStyle: React.CSSProperties = { fontSize: "14px", fontWeight: 600, color: "#111" };
const climateImplicationStyle: React.CSSProperties = { background: "#f0f7ff", borderRadius: "8px", padding: "12px", marginBottom: "10px" };
const climateImplicationLabelStyle: React.CSSProperties = { fontSize: "11px", color: "#1a56db", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 };
const climateImplicationTextStyle: React.CSSProperties = { margin: "4px 0 0", fontSize: "13px", color: "#1e3a5f", lineHeight: "1.5" };
const climateWarningStyle: React.CSSProperties = { background: "#fff8e1", borderRadius: "8px", padding: "12px", marginBottom: "10px" };
const climateWarningLabelStyle: React.CSSProperties = { fontSize: "11px", color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 };
const climateWarningTextStyle: React.CSSProperties = { margin: "4px 0 0", fontSize: "13px", color: "#7c4a00", lineHeight: "1.5" };
const climateSourceStyle: React.CSSProperties = { fontSize: "12px", color: "#999", marginTop: "4px" };

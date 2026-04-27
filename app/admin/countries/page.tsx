"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type VaccinationStatus = "Unnecessary" | "Recommended" | "Mandatory";

type CountryRow = {
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
  checked_at: string;
};

const VAX_FIELDS: Array<keyof Omit<CountryRow, "id" | "country_name" | "checked_at">> = [
  "hepatitis_a",
  "tetanus",
  "typhoid",
  "hepatitis_b",
  "rabies",
  "cholera",
  "yellow_fever",
  "polio",
  "dengue",
  "chikungunya",
  "meningococcal_acwy",
  "bcg_tb",
];

function countStatus(row: CountryRow, status: VaccinationStatus): number {
  return VAX_FIELDS.filter((f) => row[f] === status).length;
}

export default function AdminCountriesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      const { data, error: err } = await supabase
        .from("travel_vaccination_cheatsheets")
        .select(
          "id, country_name, hepatitis_a, tetanus, typhoid, hepatitis_b, rabies, cholera, yellow_fever, polio, dengue, chikungunya, meningococcal_acwy, bcg_tb, checked_at",
        )
        .order("country_name");
      if (err) {
        setError(`Could not load countries: ${err.message}`);
      } else {
        setCountries((data || []) as CountryRow[]);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.country_name.toLowerCase().includes(q));
  }, [countries, search]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Countries</h1>
            <p style={subtitleStyle}>Vaccination and travel health data by destination.</p>
          </div>
          <div style={headerActionsStyle}>
            <button type="button" onClick={() => router.push("/admin")} style={secondaryButtonStyle}>
              Back to Admin
            </button>
          </div>
        </div>

        {error ? <p style={errorStyle}>{error}</p> : null}

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>All Countries</h2>
              <p style={sectionSubtitleStyle}>
                Stored in <code>public.travel_vaccination_cheatsheets</code>
              </p>
            </div>
            <div style={countStyle}>{filtered.length} shown</div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by country name..."
            style={searchInputStyle}
          />

          {loading ? (
            <p style={helperStyle}>Loading countries...</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>No countries found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Country</th>
                    <th style={thStyle}>Mandatory</th>
                    <th style={thStyle}>Recommended</th>
                    <th style={thStyle}>Unnecessary</th>
                    <th style={thStyle}>Data checked</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td style={tdStyle}>
                        <span style={countryNameStyle}>{c.country_name}</span>
                      </td>
                      <td style={tdStyle}>
                        {countStatus(c, "Mandatory") > 0 ? (
                          <span style={mandatoryBadgeStyle}>{countStatus(c, "Mandatory")}</span>
                        ) : (
                          <span style={zeroBadgeStyle}>0</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {countStatus(c, "Recommended") > 0 ? (
                          <span style={recommendedBadgeStyle}>{countStatus(c, "Recommended")}</span>
                        ) : (
                          <span style={zeroBadgeStyle}>0</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={unnecessaryBadgeStyle}>{countStatus(c, "Unnecessary")}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={dateCellStyle}>{c.checked_at}</span>
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/countries/${c.id}`)}
                          style={smallButtonStyle}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1000px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "28px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const headerActionsStyle: React.CSSProperties = { display: "flex", gap: "12px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px", marginBottom: "24px" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: "18px", fontWeight: 600 };
const sectionSubtitleStyle: React.CSSProperties = { margin: "4px 0 0", color: "#666", fontSize: "13px" };
const countStyle: React.CSSProperties = { fontSize: "14px", color: "#666" };
const searchInputStyle: React.CSSProperties = { width: "100%", padding: "12px", border: "1px solid #ccc", borderRadius: "8px", marginBottom: "16px", boxSizing: "border-box", fontSize: "15px" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px", borderBottom: "1px solid #ddd", fontSize: "13px", fontWeight: 600, background: "#fafafa", color: "#444" };
const tdStyle: React.CSSProperties = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "middle", fontSize: "14px" };
const countryNameStyle: React.CSSProperties = { fontWeight: 600 };
const dateCellStyle: React.CSSProperties = { color: "#888", fontSize: "13px" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 700, cursor: "pointer" };
const smallButtonStyle: React.CSSProperties = { padding: "8px 14px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "13px" };
const mandatoryBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", background: "#fde8e8", color: "#b00020", fontSize: "13px", fontWeight: 600 };
const recommendedBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", background: "#fff8e1", color: "#b45309", fontSize: "13px", fontWeight: 600 };
const unnecessaryBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", background: "#f5f5f5", color: "#999", fontSize: "13px", fontWeight: 600 };
const zeroBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 10px", borderRadius: "12px", background: "#f5f5f5", color: "#ccc", fontSize: "13px", fontWeight: 600 };

"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { NameMatchRow } from "@/app/api/athlete-network/name-matches/route";

export const dynamic = "force-dynamic";

type SortKey = "probability_score" | "distinct_races" | "total_entries" | "full_name";

export default function NameMatchesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<NameMatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [minRaces, setMinRaces] = useState(2);
  const [minEntries, setMinEntries] = useState(2);
  const [search, setSearch] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("distinct_races");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r) => r.role === "admin")) {
        router.push("/login"); return;
      }

      const res = await fetch("/api/athlete-network/name-matches");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Failed to load data");
        setLoading(false);
        return;
      }
      const data: NameMatchRow[] = await res.json();
      setRows(data);
      setLoading(false);
    }
    load().catch(() => { setError("Unexpected error"); setLoading(false); });
  }, [router]);

  const filtered = useMemo(() => {
    let out = rows.filter(
      (r) =>
        r.distinct_races >= minRaces &&
        r.total_entries >= minEntries &&
        (search === "" || r.full_name.toLowerCase().includes(search.toLowerCase()))
    );

    out = [...out].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return out;
  }, [rows, minRaces, minEntries, search, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortIndicator({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "#ccc", marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{sortAsc ? "↑" : "↓"}</span>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Link href="/admin/athlete-network" style={breadcrumbStyle}>Athlete Network</Link>
              <span style={{ color: "#ccc" }}>/</span>
              <h1 style={titleStyle}>Name Matches</h1>
            </div>
            <p style={subtitleStyle}>
              Names appearing across multiple race results, scored by the probability
              that all entries belong to the same person.
            </p>
          </div>
          <button onClick={() => router.push("/admin/athlete-network")} style={backButtonStyle}>
            ← Back
          </button>
        </div>

        {/* Filters */}
        <div style={filterBarStyle}>
          <label style={filterLabelStyle}>
            Min races
            <select
              value={minRaces}
              onChange={(e) => setMinRaces(Number(e.target.value))}
              style={selectStyle}
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
          </label>
          <label style={filterLabelStyle}>
            Min entries
            <select
              value={minEntries}
              onChange={(e) => setMinEntries(Number(e.target.value))}
              style={selectStyle}
            >
              {[2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
          </label>
          <input
            type="search"
            placeholder="Search name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInputStyle}
          />
          <span style={resultCountStyle}>
            {loading ? "Loading…" : `${filtered.length.toLocaleString()} names`}
          </span>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <section style={cardStyle}>
          {loading ? (
            <p style={helperStyle}>Loading name matches…</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>No names match the current filters.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th onClick={() => toggleSort("full_name")}>
                      Name <SortIndicator col="full_name" />
                    </Th>
                    <Th onClick={() => toggleSort("total_entries")} right>
                      Entries <SortIndicator col="total_entries" />
                    </Th>
                    <Th onClick={() => toggleSort("distinct_races")} right>
                      Races <SortIndicator col="distinct_races" />
                    </Th>
                    <Th>Years</Th>
                    <Th>Club</Th>
                    <Th>Gender</Th>
                    <Th onClick={() => toggleSort("probability_score")} right>
                      Probability <SortIndicator col="probability_score" />
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.full_name} style={trStyle}>
                      <td style={tdNameStyle}>{row.full_name}</td>
                      <td style={tdNumStyle}>{row.total_entries}</td>
                      <td style={tdNumStyle}>{row.distinct_races}</td>
                      <td style={tdStyle}>
                        <span style={yearsPillsStyle}>
                          {row.years.map((y) => (
                            <span key={y} style={yearPillStyle}>{y}</span>
                          ))}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <ClubCell
                          sample={row.sample_club}
                          distinctCount={row.distinct_clubs}
                        />
                      </td>
                      <td style={tdStyle}>
                        <GenderCell
                          gender={row.gender}
                          distinctGenders={row.distinct_genders}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <ProbabilityBadge score={Number(row.probability_score)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={legendStyle}>
          <span style={legendTitleStyle}>Probability score</span>
          <span style={legendItemStyle}>
            <span style={{ ...legendDotStyle, background: "#1e7c34" }} />
            High ≥ 0.80
          </span>
          <span style={legendItemStyle}>
            <span style={{ ...legendDotStyle, background: "#d46b08" }} />
            Medium 0.60–0.79
          </span>
          <span style={legendItemStyle}>
            <span style={{ ...legendDotStyle, background: "#b00020" }} />
            Low &lt; 0.60
          </span>
          <span style={legendNoteStyle}>
            Signals: name match (base 0.60) + consistent club (+0.25) + consistent gender (+0.05/-0.20) + consistent age group (+0.05)
          </span>
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Th({
  children, onClick, right,
}: {
  children: React.ReactNode; onClick?: () => void; right?: boolean;
}) {
  return (
    <th
      onClick={onClick}
      style={{
        ...thStyle,
        textAlign: right ? "right" : "left",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {children}
    </th>
  );
}

function ClubCell({ sample, distinctCount }: { sample: string | null; distinctCount: number }) {
  if (!sample) return <span style={neutralTagStyle}>None</span>;
  if (distinctCount === 1)
    return (
      <span style={{ fontSize: "13px" }}>
        {sample} <span style={consistentTagStyle}>consistent</span>
      </span>
    );
  return (
    <span style={{ fontSize: "13px" }}>
      {sample} <span style={mixedTagStyle}>mixed</span>
    </span>
  );
}

function GenderCell({ gender, distinctGenders }: { gender: string | null; distinctGenders: number }) {
  if (distinctGenders > 1)
    return <span style={mixedTagStyle}>mixed</span>;
  if (!gender) return <span style={neutralTagStyle}>—</span>;
  return <span style={{ fontSize: "13px" }}>{gender}</span>;
}

function ProbabilityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  let bg = "#fde8e8", color = "#b00020";
  if (score >= 0.80) { bg = "#e6f4ea"; color = "#1e7c34"; }
  else if (score >= 0.60) { bg = "#fff3e6"; color = "#d46b08"; }
  return (
    <span style={{ ...probBadgeStyle, background: bg, color }}>
      {pct}%
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f5f5f5", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1200px", margin: "0 auto" };

const headerRowStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: "24px", gap: "16px", flexWrap: "wrap",
};

const breadcrumbStyle: React.CSSProperties = {
  fontSize: "14px", color: "#666", textDecoration: "none", fontWeight: 500,
};

const titleStyle: React.CSSProperties = { margin: 0, fontSize: "22px", fontWeight: 700 };

const subtitleStyle: React.CSSProperties = {
  margin: "6px 0 0", color: "#555", fontSize: "14px", lineHeight: 1.4,
};

const backButtonStyle: React.CSSProperties = {
  padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px",
  background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer",
  fontSize: "14px", whiteSpace: "nowrap",
};

const filterBarStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
  marginBottom: "16px", padding: "16px 20px", background: "#fff",
  borderRadius: "10px", border: "1px solid #e5e5e5",
};

const filterLabelStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "8px",
  fontSize: "13px", fontWeight: 600, color: "#444",
};

const selectStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: "6px", border: "1px solid #ddd",
  fontSize: "13px", background: "#fafafa", cursor: "pointer",
};

const searchInputStyle: React.CSSProperties = {
  padding: "7px 12px", borderRadius: "6px", border: "1px solid #ddd",
  fontSize: "13px", width: "200px",
};

const resultCountStyle: React.CSSProperties = {
  marginLeft: "auto", fontSize: "13px", color: "#888", fontWeight: 500,
};

const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };

const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5",
  overflow: "hidden", marginBottom: "16px",
};

const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px", padding: "24px" };

const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const thStyle: React.CSSProperties = {
  padding: "12px 14px", borderBottom: "1px solid #e5e5e5",
  fontSize: "12px", fontWeight: 700, color: "#666",
  background: "#fafafa", textTransform: "uppercase", letterSpacing: "0.04em",
};

const trStyle: React.CSSProperties = { borderBottom: "1px solid #f0f0f0" };

const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: "13px", verticalAlign: "middle" };
const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdNameStyle: React.CSSProperties = { ...tdStyle, fontWeight: 600 };

const yearsPillsStyle: React.CSSProperties = { display: "flex", gap: "4px", flexWrap: "wrap" };
const yearPillStyle: React.CSSProperties = {
  fontSize: "11px", padding: "2px 6px", borderRadius: "4px",
  background: "#f0f0f0", color: "#444", fontWeight: 500,
};

const consistentTagStyle: React.CSSProperties = {
  fontSize: "11px", padding: "2px 6px", borderRadius: "4px",
  background: "#e6f4ea", color: "#1e7c34", fontWeight: 600, marginLeft: "4px",
};
const mixedTagStyle: React.CSSProperties = {
  fontSize: "11px", padding: "2px 6px", borderRadius: "4px",
  background: "#fff3e6", color: "#d46b08", fontWeight: 600, marginLeft: "4px",
};
const neutralTagStyle: React.CSSProperties = {
  fontSize: "11px", padding: "2px 6px", borderRadius: "4px",
  background: "#f5f5f5", color: "#888", fontWeight: 500,
};
const probBadgeStyle: React.CSSProperties = {
  display: "inline-block", padding: "3px 10px", borderRadius: "999px",
  fontSize: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums",
};

const legendStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
  fontSize: "12px", color: "#666",
};
const legendTitleStyle: React.CSSProperties = { fontWeight: 700, color: "#444" };
const legendItemStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "5px" };
const legendDotStyle: React.CSSProperties = { width: "10px", height: "10px", borderRadius: "50%" };
const legendNoteStyle: React.CSSProperties = { color: "#999", marginLeft: "auto", textAlign: "right" };

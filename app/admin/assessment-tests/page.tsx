"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type AssessmentTestRow = {
  id: string;
  name: string;
  description: string | null;
  aim: string | null;
  target_muscles: string[];
  video_urls: string[];
  created_at: string;
};

export default function AdminAssessmentTestsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tests, setTests] = useState<AssessmentTestRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("assessment_tests")
        .select("id, name, description, aim, target_muscles, video_urls, created_at")
        .order("name", { ascending: true });

      if (error) {
        setErrorMessage(`Could not load assessment tests: ${error.message}`);
      } else {
        setTests((data || []) as AssessmentTestRow[]);
      }

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const filteredTests = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tests;

    return tests.filter((test) =>
      test.name.toLowerCase().includes(query) ||
      (test.description || "").toLowerCase().includes(query) ||
      (test.aim || "").toLowerCase().includes(query) ||
      test.target_muscles.some((m) => m.toLowerCase().includes(query))
    );
  }, [tests, search]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Assessment Tests</h1>
            <p style={subtitleStyle}>
              Physical tests to identify muscle imbalances and weaknesses.
            </p>
          </div>

          <div style={headerActionsStyle}>
            <Link href="/admin/assessment-tests/create" style={buttonLinkStyle}>
              Create Test
            </Link>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              style={secondaryButtonStyle}
            >
              Back to Admin
            </button>
          </div>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>All Tests</h2>
              <p style={sectionSubtitleStyle}>
                Stored in <code>public.assessment_tests</code>
              </p>
            </div>
            <div style={countStyle}>{filteredTests.length} shown</div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, aim, description, muscles..."
            style={searchInputStyle}
          />

          {loading ? (
            <p style={helperStyle}>Loading tests...</p>
          ) : filteredTests.length === 0 ? (
            <p style={helperStyle}>No assessment tests found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Aim</th>
                    <th style={thStyle}>Target muscles</th>
                    <th style={thStyle}>Videos</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.map((test) => (
                    <tr key={test.id}>
                      <td style={tdStyle}>
                        <div style={primaryCellStyle}>{test.name}</div>
                        {test.description ? (
                          <div style={secondaryCellStyle}>{test.description}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{test.aim || "—"}</td>
                      <td style={tdStyle}>
                        {test.target_muscles.length > 0 ? (
                          <div style={tagsContainerStyle}>
                            {test.target_muscles.map((m) => (
                              <span key={m} style={tagStyle}>{m}</span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td style={tdStyle}>{test.video_urls.length > 0 ? test.video_urls.length : "—"}</td>
                      <td style={tdStyle}>
                        <Link href={`/admin/assessment-tests/${test.id}/edit`} style={actionLinkStyle}>
                          Edit
                        </Link>
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

const pageStyle: React.CSSProperties = {
  padding: "40px 20px",
  backgroundColor: "#f9fafb",
  minHeight: "100vh",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "32px",
  gap: "20px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: 700,
  margin: 0,
  color: "#111827",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginTop: "8px",
  margin: 0,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
};

const buttonLinkStyle: React.CSSProperties = {
  padding: "10px 16px",
  backgroundColor: "#111827",
  color: "#fff",
  textDecoration: "none",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  backgroundColor: "#e5e7eb",
  color: "#111827",
  textDecoration: "none",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 600,
  border: "1px solid #d1d5db",
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  padding: "12px 16px",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  borderRadius: "6px",
  fontSize: "14px",
  marginBottom: "20px",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "24px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
  paddingBottom: "16px",
  borderBottom: "1px solid #e5e7eb",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  margin: 0,
  color: "#111827",
};

const sectionSubtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  marginTop: "4px",
  margin: 0,
};

const countStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  fontWeight: 500,
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "14px",
  marginBottom: "20px",
  boxSizing: "border-box",
};

const helperStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  textAlign: "center",
  padding: "20px",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  padding: "12px",
  textAlign: "left",
  borderBottom: "2px solid #e5e7eb",
  fontWeight: 600,
  color: "#374151",
  backgroundColor: "#f9fafb",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e5e7eb",
  verticalAlign: "top",
};

const primaryCellStyle: React.CSSProperties = {
  fontWeight: 500,
  color: "#111827",
};

const secondaryCellStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  marginTop: "4px",
};

const tagsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap",
};

const tagStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  backgroundColor: "#f3f4f6",
  color: "#374151",
  borderRadius: "4px",
  fontSize: "12px",
  fontWeight: 500,
};

const actionLinkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 500,
  cursor: "pointer",
};

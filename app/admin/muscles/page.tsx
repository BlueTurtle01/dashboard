"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type MuscleRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export default function AdminMusclesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [muscles, setMuscles] = useState<MuscleRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("muscle_options")
        .select("id, slug, label, sort_order, is_active, created_at")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

      if (error) {
        setErrorMessage(`Could not load muscles: ${error.message}`);
      } else {
        setMuscles((data || []) as MuscleRow[]);
      }

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const filteredMuscles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return muscles;
    return muscles.filter(
      (m) =>
        m.label.toLowerCase().includes(query) ||
        m.slug.toLowerCase().includes(query)
    );
  }, [muscles, search]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Muscles</h1>
            <p style={subtitleStyle}>
              Manage muscle options used to tag exercises, stretches, and
              assessments.
            </p>
          </div>
          <div style={headerActionsStyle}>
            <Link href="/admin/muscles/create" style={buttonLinkStyle}>
              Create Muscle
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
              <h2 style={sectionTitleStyle}>All Muscles</h2>
              <p style={sectionSubtitleStyle}>
                Stored in <code>public.muscle_options</code>
              </p>
            </div>
            <div style={countStyle}>{filteredMuscles.length} shown</div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by label or slug..."
            style={searchInputStyle}
          />

          {loading ? (
            <p style={helperStyle}>Loading muscles...</p>
          ) : filteredMuscles.length === 0 ? (
            <p style={helperStyle}>No muscles found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Label</th>
                    <th style={thStyle}>Slug</th>
                    <th style={thStyle}>Sort order</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMuscles.map((muscle) => (
                    <tr key={muscle.id}>
                      <td style={tdStyle}>
                        <div style={primaryCellStyle}>{muscle.label}</div>
                      </td>
                      <td style={tdStyle}>
                        <code style={codeStyle}>{muscle.slug}</code>
                      </td>
                      <td style={tdStyle}>{muscle.sort_order}</td>
                      <td style={tdStyle}>
                        <span
                          style={
                            muscle.is_active ? activeChipStyle : inactiveChipStyle
                          }
                        >
                          {muscle.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <Link
                          href={`/admin/muscles/${muscle.id}/edit`}
                          style={actionLinkStyle}
                        >
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
  maxWidth: "1000px",
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
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  backgroundColor: "#e5e7eb",
  color: "#111827",
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
  verticalAlign: "middle",
};

const primaryCellStyle: React.CSSProperties = {
  fontWeight: 500,
  color: "#111827",
};

const codeStyle: React.CSSProperties = {
  fontSize: "12px",
  backgroundColor: "#f3f4f6",
  padding: "2px 6px",
  borderRadius: "4px",
  color: "#374151",
};

const activeChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  backgroundColor: "#dcfce7",
  color: "#166534",
};

const inactiveChipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  backgroundColor: "#f3f4f6",
  color: "#6b7280",
};

const actionLinkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 500,
};

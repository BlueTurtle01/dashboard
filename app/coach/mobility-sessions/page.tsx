"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StretchRow = {
  id: string;
  name: string;
};

type MobilitySessionStretchRow = {
  id: string;
  mobility_session_id: string;
  stretch_id: string;
  sort_order: number;
  hold_duration_seconds: number | null;
  notes: string | null;
};

type MobilitySessionRow = {
  id: string;
  name: string;
  description: string;
  duration_minutes: number | null;
  difficulty_level: string | null;
  focus_areas: string[];
  created_at: string;
};

type MobilitySession = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number | null;
  difficultyLevel: string | null;
  focusAreas: string[];
  stretches: Array<{
    id: string;
    stretchId: string;
    stretchName: string;
    sortOrder: number;
    holdDurationSeconds: number | null;
    notes: string | null;
  }>;
};

export default function MobilitySessionsPage() {
  const router = useRouter();
  const supabase = createClient();

  const [sessions, setSessions] = useState<MobilitySession[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      try {
        const { data: sessionRows, error: sessionError } = await supabase
          .from("mobility_sessions")
          .select("id, name, description, duration_minutes, difficulty_level, focus_areas, created_at")
          .order("name", { ascending: true });

        if (sessionError) {
          setErrorMessage(`Could not load mobility sessions: ${sessionError.message}`);
          setLoading(false);
          return;
        }

        const sessions = (sessionRows || []) as MobilitySessionRow[];
        if (sessions.length === 0) {
          setSessions([]);
          setLoading(false);
          return;
        }

        const sessionIds = sessions.map((s) => s.id);

        const { data: stretchRows, error: stretchError } = await supabase
          .from("mobility_session_stretches")
          .select("id, mobility_session_id, stretch_id, sort_order, hold_duration_seconds, notes")
          .in("mobility_session_id", sessionIds)
          .order("sort_order", { ascending: true });

        if (stretchError) {
          setErrorMessage(`Could not load stretches: ${stretchError.message}`);
          setLoading(false);
          return;
        }

        const stretches = (stretchRows || []) as MobilitySessionStretchRow[];

        const { data: stretchLookup, error: lookupError } = await supabase
          .from("stretches")
          .select("id, name")
          .in(
            "id",
            stretches.map((s) => s.stretch_id),
          );

        if (lookupError) {
          setErrorMessage(`Could not load stretch names: ${lookupError.message}`);
          setLoading(false);
          return;
        }

        const stretchMap = new Map(
          (stretchLookup || []).map((s: StretchRow) => [s.id, s.name]),
        );
        const stretchesBySessionId = new Map<string, typeof stretches>();
        stretches.forEach((stretch) => {
          if (!stretchesBySessionId.has(stretch.mobility_session_id)) {
            stretchesBySessionId.set(stretch.mobility_session_id, []);
          }
          stretchesBySessionId.get(stretch.mobility_session_id)!.push(stretch);
        });

        const enrichedSessions: MobilitySession[] = sessions.map((session) => ({
          id: session.id,
          name: session.name,
          description: session.description,
          durationMinutes: session.duration_minutes,
          difficultyLevel: session.difficulty_level,
          focusAreas: session.focus_areas || [],
          stretches: (stretchesBySessionId.get(session.id) || []).map((stretch) => ({
            id: stretch.id,
            stretchId: stretch.stretch_id,
            stretchName: stretchMap.get(stretch.stretch_id) || "Unknown Stretch",
            sortOrder: stretch.sort_order,
            holdDurationSeconds: stretch.hold_duration_seconds,
            notes: stretch.notes,
          })),
        }));

        setSessions(enrichedSessions);
      } catch (err) {
        setErrorMessage("An unexpected error occurred");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return sessions;
    }

    return sessions.filter((session) => {
      return (
        session.name.toLowerCase().includes(query) ||
        session.description.toLowerCase().includes(query) ||
        session.focusAreas.some((area) => area.toLowerCase().includes(query)) ||
        session.stretches.some((stretch) => stretch.stretchName.toLowerCase().includes(query))
      );
    });
  }, [sessions, search]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Mobility Sessions</h1>
            <p style={subtitleStyle}>Build and manage mobility sessions from stretches.</p>
          </div>

          <div style={headerActionsStyle}>
            <Link href="/coach/mobility-sessions/create" style={buttonLinkStyle}>
              Create Mobility Session
            </Link>
            <button type="button" onClick={() => router.push("/coach/dashboard")} style={secondaryButtonStyle}>
              Back to Coach
            </button>
          </div>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>All Mobility Sessions</h2>
              <p style={sectionSubtitleStyle}>Reusable mobility and flexibility routines</p>
            </div>
            <div style={countStyle}>{filteredSessions.length} shown</div>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, description, focus areas, or stretches..."
            style={searchInputStyle}
          />

          {loading ? (
            <p style={helperStyle}>Loading mobility sessions...</p>
          ) : filteredSessions.length === 0 ? (
            <p style={helperStyle}>
              {sessions.length === 0 ? "No mobility sessions created yet." : "No sessions match your search."}
            </p>
          ) : (
            <div style={gridStyle}>
              {filteredSessions.map((session) => (
                <div key={session.id} style={cardItemStyle}>
                  <div style={cardHeaderStyle}>
                    <div>
                      <h3 style={cardTitleStyle}>{session.name}</h3>
                      {session.difficultyLevel && (
                        <span style={difficultyBadgeStyle(session.difficultyLevel)}>
                          {session.difficultyLevel}
                        </span>
                      )}
                    </div>
                  </div>

                  {session.description && (
                    <p style={cardDescriptionStyle}>{session.description}</p>
                  )}

                  <div style={metaRowStyle}>
                    {session.durationMinutes && (
                      <span style={metaStyle}>⏱️ {session.durationMinutes} min</span>
                    )}
                    <span style={metaStyle}>📋 {session.stretches.length} stretches</span>
                  </div>

                  {session.focusAreas.length > 0 && (
                    <div style={tagsStyle}>
                      {session.focusAreas.map((area) => (
                        <span key={area} style={tagStyle}>
                          {area}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={stretchListStyle}>
                    <p style={stretchListLabelStyle}>Stretches:</p>
                    <ol style={stretchListOlStyle}>
                      {session.stretches.map((stretch) => (
                        <li key={stretch.id} style={stretchListItemStyle}>
                          <span style={stretchNameStyle}>{stretch.stretchName}</span>
                          {stretch.holdDurationSeconds && (
                            <span style={holdDurationStyle}>{stretch.holdDurationSeconds}s</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div style={actionStyle}>
                    <Link href={`/coach/mobility-sessions/${session.id}/edit`} style={editLinkStyle}>
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// Styles
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
  gap: "20px",
};

const cardItemStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "16px",
  backgroundColor: "#fafbfc",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "8px",
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 600,
  color: "#111827",
};

const cardDescriptionStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#6b7280",
  lineHeight: 1.5,
};

const metaRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  fontSize: "12px",
  color: "#6b7280",
};

const metaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

const tagsStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  flexWrap: "wrap",
};

const tagStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 8px",
  backgroundColor: "#e0e7ff",
  color: "#4f46e5",
  borderRadius: "4px",
  fontSize: "11px",
  fontWeight: 500,
};

const stretchListStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  borderRadius: "4px",
  padding: "8px 0",
};

const stretchListLabelStyle: React.CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: "12px",
  fontWeight: 600,
  color: "#374151",
};

const stretchListOlStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "20px",
};

const stretchListItemStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "4px",
  display: "flex",
  justifyContent: "space-between",
  gap: "8px",
};

const stretchNameStyle: React.CSSProperties = {
  color: "#374151",
  fontWeight: 500,
};

const holdDurationStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#9ca3af",
  whiteSpace: "nowrap",
};

const actionStyle: React.CSSProperties = {
  marginTop: "8px",
};

const editLinkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 500,
  fontSize: "13px",
  cursor: "pointer",
};

function difficultyBadgeStyle(difficulty: string): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
    marginTop: "4px",
  };

  const colors: Record<string, { bg: string; text: string }> = {
    beginner: { bg: "#dcfce7", text: "#166534" },
    intermediate: { bg: "#fef3c7", text: "#92400e" },
    advanced: { bg: "#fee2e2", text: "#991b1b" },
  };

  const color = colors[difficulty.toLowerCase()] || colors.beginner;

  return {
    ...baseStyle,
    backgroundColor: color.bg,
    color: color.text,
  };
}

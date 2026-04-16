"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type ExerciseRow = {
  id: string;
  name: string;
  description: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_tags: string[];
  equipment: string[];
  pattern: string | null;
  created_at: string;
};

type SessionActivityRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export default function AdminExercisesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [gymExercises, setGymExercises] = useState<ExerciseRow[]>([]);
  const [sessionActivities, setSessionActivities] = useState<SessionActivityRow[]>([]);

  const [gymSearch, setGymSearch] = useState("");
  const [activitySearch, setActivitySearch] = useState("");

  const [loadingGymExercises, setLoadingGymExercises] = useState(true);
  const [loadingSessionActivities, setLoadingSessionActivities] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoadingGymExercises(true);
      setLoadingSessionActivities(true);
      setErrorMessage("");

      const [exercisesResult, activitiesResult] = await Promise.all([
        supabase
          .from("exercises")
          .select(
            "id, name, description, primary_muscles, secondary_muscles, movement_tags, equipment, pattern, created_at"
          )
          .order("name", { ascending: true }),
        supabase
          .from("session_activities")
          .select("id, slug, label, sort_order, is_active, created_at")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      ]);

      const errors: string[] = [];

      if (exercisesResult.error) {
        errors.push(`Could not load gym exercises: ${exercisesResult.error.message}`);
      } else {
        setGymExercises((exercisesResult.data || []) as ExerciseRow[]);
      }

      if (activitiesResult.error) {
        errors.push(`Could not load session activities: ${activitiesResult.error.message}`);
      } else {
        setSessionActivities((activitiesResult.data || []) as SessionActivityRow[]);
      }

      if (errors.length > 0) {
        setErrorMessage(errors.join(" "));
      }

      setLoadingGymExercises(false);
      setLoadingSessionActivities(false);
    }

    loadData();
  }, [supabase]);

  const filteredGymExercises = useMemo(() => {
    const query = gymSearch.trim().toLowerCase();

    if (!query) {
      return gymExercises;
    }

    return gymExercises.filter((exercise) => {
      return (
        exercise.name.toLowerCase().includes(query) ||
        exercise.id.toLowerCase().includes(query) ||
        exercise.description.toLowerCase().includes(query) ||
        (exercise.pattern || "").toLowerCase().includes(query) ||
        exercise.primary_muscles.some((item) => item.toLowerCase().includes(query)) ||
        exercise.secondary_muscles.some((item) => item.toLowerCase().includes(query)) ||
        exercise.movement_tags.some((item) => item.toLowerCase().includes(query)) ||
        exercise.equipment.some((item) => item.toLowerCase().includes(query))
      );
    });
  }, [gymExercises, gymSearch]);

  const filteredSessionActivities = useMemo(() => {
    const query = activitySearch.trim().toLowerCase();

    if (!query) {
      return sessionActivities;
    }

    return sessionActivities.filter((activity) => {
      return (
        activity.label.toLowerCase().includes(query) ||
        activity.slug.toLowerCase().includes(query)
      );
    });
  }, [sessionActivities, activitySearch]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Exercises & Activities</h1>
            <p style={subtitleStyle}>
              Manage gym exercises and functional session activities.
            </p>
          </div>

          <div style={headerActionsStyle}>
            <Link href="/admin/exercises/create" style={buttonLinkStyle}>
              Create Gym Exercise
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
              <h2 style={sectionTitleStyle}>Gym Exercises</h2>
              <p style={sectionSubtitleStyle}>
                Stored in <code>public.exercises</code>
              </p>
            </div>
            <div style={countStyle}>{filteredGymExercises.length} shown</div>
          </div>

          <input
            value={gymSearch}
            onChange={(event) => setGymSearch(event.target.value)}
            placeholder="Search by name, id, pattern, muscles, movement tags, equipment..."
            style={searchInputStyle}
          />

          {loadingGymExercises ? (
            <p style={helperStyle}>Loading gym exercises...</p>
          ) : filteredGymExercises.length === 0 ? (
            <p style={helperStyle}>No gym exercises found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Pattern</th>
                    <th style={thStyle}>Movement Tags</th>
                    <th style={thStyle}>Equipment</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredGymExercises.map((exercise) => (
                    <tr key={exercise.id}>
                      <td style={tdStyle}>
                        <div style={primaryCellStyle}>{exercise.name}</div>
                        {exercise.description ? (
                          <div style={secondaryCellStyle}>{exercise.description}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <code>{exercise.id}</code>
                      </td>
                      <td style={tdStyle}>{exercise.pattern || "—"}</td>
                      <td style={tdStyle}>
                        {exercise.movement_tags.length > 0
                          ? exercise.movement_tags.join(", ")
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        {exercise.equipment.length > 0
                          ? exercise.equipment.join(", ")
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        <div style={actionRowStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/admin/exercises/${exercise.id}/edit`)
                            }
                            style={smallButtonStyle}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Functional Session Activities</h2>
              <p style={sectionSubtitleStyle}>
                Stored in <code>public.session_activities</code>
              </p>
            </div>
            <div style={countStyle}>{filteredSessionActivities.length} shown</div>
          </div>

          <input
            value={activitySearch}
            onChange={(event) => setActivitySearch(event.target.value)}
            placeholder="Search by label or slug..."
            style={searchInputStyle}
          />

          {loadingSessionActivities ? (
            <p style={helperStyle}>Loading session activities...</p>
          ) : filteredSessionActivities.length === 0 ? (
            <p style={helperStyle}>No session activities found.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Label</th>
                    <th style={thStyle}>Slug</th>
                    <th style={thStyle}>Sort Order</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessionActivities.map((activity) => (
                    <tr key={activity.id}>
                      <td style={tdStyle}>
                        <div style={primaryCellStyle}>{activity.label}</div>
                      </td>
                      <td style={tdStyle}>
                        <code>{activity.slug}</code>
                      </td>
                      <td style={tdStyle}>{activity.sort_order}</td>
                      <td style={tdStyle}>{activity.is_active ? "Yes" : "No"}</td>
                      <td style={tdStyle}>
                        <div style={actionRowStyle}>
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/admin/session-activities/${activity.id}/edit`)
                            }
                            style={smallButtonStyle}
                          >
                            Edit
                          </button>
                        </div>
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
  minHeight: "100vh",
  background: "#f5f5f5",
  padding: "32px 24px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1280px",
  margin: "0 auto",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "16px",
  marginBottom: "24px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: "8px",
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#666",
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
  padding: "24px",
  marginBottom: "24px",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: "4px",
};

const sectionSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#666",
  fontSize: "14px",
};

const countStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#666",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #ddd",
  fontSize: "14px",
  background: "#fafafa",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
  fontSize: "14px",
};

const primaryCellStyle: React.CSSProperties = {
  fontWeight: 600,
  marginBottom: "4px",
};

const secondaryCellStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "13px",
};

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const helperStyle: React.CSSProperties = {
  color: "#666",
  fontSize: "14px",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  marginBottom: "16px",
};

const buttonLinkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: "8px",
  background: "#111111",
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 700,
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 600,
  cursor: "pointer",
};
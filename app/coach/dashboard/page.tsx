"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TutorialProvider } from "@/lib/context/TutorialContext";
import TutorialInfoBox from "@/components/tutorial/TutorialInfoBox";
import "./CoachDashboard.css";

type CoachAthleteLink = {
  id: string;
  athlete_user_id: string;
  status: string;
  created_at: string;
};

type AthleteProfile = {
  user_id: string;
  full_name: string | null;
  date_of_birth: string | null;
  selected_event_id: string | null;
  created_at: string | null;
  tags?: string[];
  event:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type AthleteLinkRow = {
  id: string;
  athlete_user_id: string;
  status: string;
  linked_at: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  event_name: string | null;
  athlete_created_at: string | null;
  tags?: string[];
  summary?: string;
};

function formatDate(dateString: string | null) {
  if (!dateString) return "—";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return "—";

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "—";

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < dob.getDate())
  ) {
    age -= 1;
  }

  return age.toString();
}

function generateAthleteSummary(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return "";

  // Group tags by category based on common prefixes
  const experience = tags.filter(t =>
    ["ultramarathoner", "trail_runner", "road_runner", "desert_racing", "multi_day_racing"].includes(t)
  );
  const injuries = tags.filter(t =>
    t.includes("pain") || t.includes("issue") || t.includes("syndrome") || t.includes("fasciitis") ||
    t.includes("splint") || t.includes("fracture") || t.includes("tendinitis")
  );
  const focuses = tags.filter(t =>
    t.includes("focus") || t.includes("specialist") || t.includes("advocate") || t.includes("optimization")
  );
  const specialties = tags.filter(t =>
    ["first_time_racer", "comeback_from_injury", "female_athlete_coach", "masters_athlete", "athlete_with_family"].includes(t)
  );

  const parts: string[] = [];

  if (experience.length > 0) {
    const expLabels = experience.map(t =>
      t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    );
    parts.push(expLabels.slice(0, 2).join(", "));
  }

  if (injuries.length > 0) {
    parts.push(`${injuries.length} injury concern${injuries.length > 1 ? "s" : ""}`);
  }

  if (specialties.length > 0) {
    const specLabels = specialties.map(t =>
      t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    );
    parts.push(specLabels[0]);
  }

  return parts.slice(0, 2).join(". ");
}

function getErrorMessage(error: unknown) {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const maybeError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    return (
      maybeError.message ||
      maybeError.details ||
      maybeError.hint ||
      maybeError.code ||
      JSON.stringify(error)
    );
  }

  return String(error);
}

function getEventName(
  event:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null
    | undefined
) {
  if (!event) return null;
  if (Array.isArray(event)) {
    return event[0]?.name ?? null;
  }
  return event.name ?? null;
}

function CoachDashboardContent() {
  const searchParams = useSearchParams();
  const tutorial = searchParams.get("tutorial");
  const [rows, setRows] = useState<AthleteLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coachUserId, setCoachUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    async function loadDashboard() {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw new Error(`Failed to get current user: ${userError.message}`);
        }

        if (!user?.id) {
          throw new Error("No logged-in user found.");
        }

        const resolvedCoachUserId = user.id;

        if (!isMounted) return;
        setCoachUserId(resolvedCoachUserId);

        const { data: linksData, error: linksError } = await supabase
          .from("coach_athlete_links")
          .select("id, athlete_user_id, status, created_at")
          .eq("coach_user_id", resolvedCoachUserId)
          .order("created_at", { ascending: false });

        if (linksError) {
          throw new Error(`Failed to load coach_athlete_links: ${linksError.message}`);
        }

        const links = (linksData ?? []) as CoachAthleteLink[];

        if (links.length === 0) {
          if (!isMounted) return;
          setRows([]);
          return;
        }

        const athleteIds = [...new Set(links.map((link) => link.athlete_user_id))];

        const { data: profilesData, error: profilesError } = await supabase
          .from("athlete_profiles")
          .select(`
            user_id,
            full_name,
            date_of_birth,
            selected_event_id,
            created_at,
            tags,
            event:races!athlete_profiles_selected_event_id_fkey (
              id,
              name
            )
          `)
          .in("user_id", athleteIds);

        if (profilesError) {
          throw new Error(`Failed to load athlete_profiles: ${profilesError.message}`);
        }

        const profiles = (profilesData ?? []) as AthleteProfile[];
        const profileMap = new Map<string, AthleteProfile>();
        for (const profile of profiles) {
          profileMap.set(profile.user_id, profile);
        }

        // Fetch emails from the users table
        const { data: usersData } = await supabase
          .from("users")
          .select("id, email")
          .in("id", athleteIds);

        const emailMap = new Map<string, string | null>();
        for (const u of usersData ?? []) {
          emailMap.set(u.id, u.email ?? null);
        }

        const mergedRows: AthleteLinkRow[] = links.map((link) => {
          const profile = profileMap.get(link.athlete_user_id);
          const fullName = profile?.full_name?.trim() || "";
          const spaceIdx = fullName.indexOf(" ");
          const firstName = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx);
          const lastName = spaceIdx === -1 ? "" : fullName.slice(spaceIdx + 1);

          return {
            id: link.id,
            athlete_user_id: link.athlete_user_id,
            status: link.status,
            linked_at: link.created_at,
            first_name: firstName || "—",
            last_name: lastName || "—",
            email: emailMap.get(link.athlete_user_id) ?? null,
            date_of_birth: profile?.date_of_birth ?? null,
            event_name: getEventName(profile?.event),
            athlete_created_at: profile?.created_at ?? null,
            tags: profile?.tags,
            summary: generateAthleteSummary(profile?.tags),
          };
        });

        if (!isMounted) return;
        setRows(mergedRows);
      } catch (err) {
        console.error("Failed to load coach dashboard:", err);

        if (!isMounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const activeCount = useMemo(
    () => rows.filter((row) => row.status === "active").length,
    [rows]
  );

  return (
    <main className="coach-dashboard-page">
      <div className="coach-dashboard-page__inner">
        <div className="coach-dashboard-page__header">
          <div>
            <h1>Coach Dashboard</h1>
            <p>View all athletes linked to this coach account.</p>
          </div>

          <div className="coach-dashboard-page__stats">
            <div className="coach-dashboard-stat">
              <span className="coach-dashboard-stat__label">Total linked</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="coach-dashboard-stat">
              <span className="coach-dashboard-stat__label">Active</span>
              <strong>{activeCount}</strong>
            </div>
          </div>
        </div>

        {coachUserId && (
          <div className="coach-dashboard-page__coach-id">
            Coach user ID: <code>{coachUserId}</code>
          </div>
        )}

        {tutorial === 'dashboard' && (
          <div className="coach-dashboard-message" style={{ marginBottom: '24px', backgroundColor: '#f0f9ff', borderColor: '#bfdbfe' }}>
            <TutorialInfoBox
              title="Welcome to Coach Dashboard"
              description="This is your central hub for managing all your athletes. Click 'View' on any athlete to see their detailed profile, where you'll find tabs for training plans, injury management, race history, and more."
              step={1}
              totalSteps={1}
              showNext={false}
            />
          </div>
        )}

        {loading ? (
          <div className="coach-dashboard-message">Loading athletes...</div>
        ) : error ? (
          <div className="coach-dashboard-message coach-dashboard-message--error">
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="coach-dashboard-message">
            No athletes are linked to this coach yet.
          </div>
        ) : (
          <div className="coach-dashboard-table-wrap">
            <table className="coach-dashboard-table">
              <thead>
                <tr>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Email</th>
                  <th>Event</th>
                  <th>Age</th>
                  <th>Status</th>
                  <th>Linked</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="coach-dashboard-athlete-cell">
                        <strong>{row.first_name}</strong>
                        {row.summary && (
                          <p style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
                            {row.summary}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>{row.last_name}</td>
                    <td>{row.email || "—"}</td>
                    <td>{row.event_name || "—"}</td>
                    <td>{getAge(row.date_of_birth)}</td>
                    <td>
                      <span
                        className={`coach-dashboard-status coach-dashboard-status--${row.status}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td>{formatDate(row.linked_at)}</td>
                    <td>
                      <Link
                        href={`/coach/athlete-overview?athleteId=${row.athlete_user_id}${tutorial === 'dashboard' ? '&tutorial=athlete-overview' : ''}`}
                        className="coach-dashboard-view-link"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CoachDashboardPage() {
  const searchParams = useSearchParams();
  const tutorial = searchParams.get("tutorial");
  const isInTutorial = tutorial === "dashboard";

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="dashboard">
      <CoachDashboardContent />
    </TutorialProvider>
  );
}

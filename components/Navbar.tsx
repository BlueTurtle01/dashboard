import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";
import NotificationsIcon from "./NotificationsIcon";
import WarningsIcon from "./WarningsIcon";
import UserAccountDropdown from "./UserAccountDropdown";
import "./Navbar.css";

export default async function Navbar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let roles: string[] = [];

  if (user) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    roles = data?.map((row) => row.role) ?? [];
  }

  const isAdmin = roles.includes("admin");
  const isCoach = roles.includes("coach");
  const isAthlete = roles.includes("athlete");
  const canAccessCoachArea = isAdmin || isCoach;

  return (
    <nav className="site-navbar">
      <div className="site-navbar__inner">
        <Link href="/" className="site-navbar__brand">
          My App
        </Link>

        <div className="site-navbar__links">
          {isAthlete && (
            <Link href="/athlete" className="site-navbar__link">
              My Training
            </Link>
          )}

          {isAthlete && (
            <Link href="/athlete/profile" className="site-navbar__link">
              Profile
            </Link>
          )}

          {canAccessCoachArea && (
            <Link href="/coach/dashboard" className="site-navbar__link">
              Dashboard
            </Link>
          )}

          <Link href="/coaches" className="site-navbar__link">
            Coaches
          </Link>

          {canAccessCoachArea && (
            <div className="site-navbar__dropdown">
              <button className="site-navbar__dropdown-trigger" type="button">
                Programs
              </button>
              <div className="site-navbar__dropdown-menu">
                <Link
                  href="/coach/program-templates/"
                  className="site-navbar__dropdown-link"
                >
                  View Programs
                </Link>
                <Link
                  href="/coach/program-templates/create"
                  className="site-navbar__dropdown-link"
                >
                  Create Program
                </Link>
              </div>
            </div>
          )}

          {canAccessCoachArea && (
            <div className="site-navbar__dropdown">
              <button className="site-navbar__dropdown-trigger" type="button">
                Mobility
              </button>
              <div className="site-navbar__dropdown-menu">
                <Link
                  href="/coach/mobility-sessions"
                  className="site-navbar__dropdown-link"
                >
                  View Mobility Sessions
                </Link>
                <Link
                  href="/coach/mobility-sessions/create"
                  className="site-navbar__dropdown-link"
                >
                  Create Mobility Session
                </Link>
              </div>
            </div>
          )}


          {isAdmin && (
            <div className="site-navbar__dropdown">
              <button className="site-navbar__dropdown-trigger" type="button">
                Admin
              </button>
              <div className="site-navbar__dropdown-menu">
                <Link href="/admin/coach-performance" className="site-navbar__dropdown-link">
                  Coach Performance
                </Link>

                {/* Library Management */}
                <div style={{ borderTop: "1px solid #e5e5e5", marginTop: "8px", paddingTop: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#666", padding: "4px 12px", textTransform: "uppercase" }}>
                    Library
                  </div>
                  <Link href="/admin/exercises" className="site-navbar__dropdown-link">
                    Exercises
                  </Link>
                  <Link href="/admin/exercises/create" className="site-navbar__dropdown-link">
                    Create Exercise
                  </Link>
                  <Link href="/admin/stretches" className="site-navbar__dropdown-link">
                    Stretches
                  </Link>
                  <Link href="/admin/stretches/create" className="site-navbar__dropdown-link">
                    Create Stretch
                  </Link>
                </div>

                {/* Templates */}
                <div style={{ borderTop: "1px solid #e5e5e5", marginTop: "8px", paddingTop: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#666", padding: "4px 12px", textTransform: "uppercase" }}>
                    Templates
                  </div>
                  <Link href="/coach/gym-session-templates" className="site-navbar__dropdown-link">
                    Gym Sessions
                  </Link>
                  <Link href="/coach/gym-session-templates/create" className="site-navbar__dropdown-link">
                    Create Gym Session
                  </Link>
                  <Link href="/coach/functional-session-templates" className="site-navbar__dropdown-link">
                    Functional Sessions
                  </Link>
                  <Link href="/coach/functional-session-templates/create" className="site-navbar__dropdown-link">
                    Create Functional Session
                  </Link>
                  <Link href="/admin/functional/types/create" className="site-navbar__dropdown-link">
                    Functional Types
                  </Link>
                </div>

                {/* Configuration */}
                <div style={{ borderTop: "1px solid #e5e5e5", marginTop: "8px", paddingTop: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#666", padding: "4px 12px", textTransform: "uppercase" }}>
                    Configuration
                  </div>
                  <Link href="/admin/session-template-field-config/" className="site-navbar__dropdown-link">
                    Session Template Tags
                  </Link>
                  <Link href="/athlete/profile" className="site-navbar__dropdown-link">
                    Athlete Profile
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="site-navbar__actions">
          <NotificationsIcon />
          <WarningsIcon />

          {canAccessCoachArea && (
            <Link href="/coach/profile" className="site-navbar__dropdown-link">
              My Profile
            </Link>
          )}

          <UserAccountDropdown />
        </div>
      </div>
    </nav>
  );
}
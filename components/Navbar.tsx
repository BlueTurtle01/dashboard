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
            <Link href="/intake" className="site-navbar__link">
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


          {isAdmin && (
            <div className="site-navbar__dropdown">
              <button className="site-navbar__dropdown-trigger" type="button">
                Admin
              </button>
              <div className="site-navbar__dropdown-menu">
                <Link href="/admin/coach-performance" className="site-navbar__dropdown-link">
                  Coach Performance
                </Link>
                <Link href="/admin/exercises" className="site-navbar__dropdown-link">
                  View Exercises
                </Link>
                <Link href="/admin/exercises/create" className="site-navbar__dropdown-link">
                  Create Exercise
                </Link>
                <Link href="/admin/functional/types/create" className="site-navbar__dropdown-link">
                  Functional Session Types
                </Link>
                <Link href="/intake" className="site-navbar__dropdown-link">
                  Athlete Intake
                </Link>
                                <Link href="/admin/session-template-field-config/" className="site-navbar__dropdown-link">
                  Session Template Tag Config
                </Link>
                <Link href="/coach/gym-session-templates" className="site-navbar__dropdown-link">
                  View Gym Templates
                </Link>
                <Link href="/coach/gym-session-templates/create" className="site-navbar__dropdown-link">
                  Create Gym Template
                </Link>
                <Link href="/coach/functional-session-templates" className="site-navbar__dropdown-link">
                  View Functional Templates
                </Link>
                <Link href="/coach/functional-session-templates/create" className="site-navbar__dropdown-link">
                  Create Functional Template
                </Link>
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
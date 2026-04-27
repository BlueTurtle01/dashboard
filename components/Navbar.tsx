import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NotificationsIcon from "./NotificationsIcon";
import WarningsIcon from "./WarningsIcon";
import UserAccountDropdown from "./UserAccountDropdown";
import SidebarDropdown from "./SidebarDropdown";
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
  const isSoloPlanHolder = roles.includes("solo_plan_holder");
  const canAccessCoachArea = isAdmin || isCoach;

  if (!user) return null;

  return (
    <>
      {/* ── Fixed left sidebar ────────────────────────────────── */}
      <aside className="app-sidebar">
        {/* Logo */}
        <div className="app-sidebar__logo">
          <div className="app-sidebar__logo-icon">EP</div>
          <div className="app-sidebar__logo-text">
            <span className="app-sidebar__logo-name">Endurance</span>
            <span className="app-sidebar__logo-sub">Coach Platform</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="app-sidebar__nav">
          {/* Athlete section */}
          {(isAthlete || isSoloPlanHolder) && (
            <>
              <span className="app-sidebar__group-label">Training</span>
              <Link href="/athlete" className="app-sidebar__link">
                My Plan
              </Link>
              <Link href="/athlete/profile" className="app-sidebar__link">
                Profile
              </Link>
            </>
          )}

          {/* Coach section */}
          {canAccessCoachArea && (
            <>
              <span className="app-sidebar__group-label">Coach</span>
              <Link href="/coach/dashboard" className="app-sidebar__link">
                Dashboard
              </Link>
              {(isAthlete || canAccessCoachArea) && (
                <Link href="/coaches" className="app-sidebar__link">
                  Coaches
                </Link>
              )}
              <SidebarDropdown
                label="Programs"
                items={[
                  { href: "/coach/program-templates", label: "View Programs" },
                  { href: "/coach/program-templates/create", label: "Create Program" },
                ]}
              />
              <SidebarDropdown
                label="Mobility"
                items={[
                  { href: "/coach/mobility-sessions", label: "View Mobility Sessions" },
                  { href: "/coach/mobility-sessions/create", label: "Create Mobility Session" },
                ]}
              />
              {canAccessCoachArea && (
                <Link href="/coach/profile" className="app-sidebar__link">
                  My Profile
                </Link>
              )}
            </>
          )}

          {/* Support — visible to all signed-in users */}
          <span className="app-sidebar__group-label">Help</span>
          <Link href="/support" className="app-sidebar__link">
            Support
          </Link>

          {/* Admin section */}
          {isAdmin && (
            <>
              <span className="app-sidebar__group-label">Admin</span>
              <SidebarDropdown
                label="Admin"
                items={[
                  { href: "/admin/coach-performance", label: "Coach Performance" },
                  { href: "/admin/support", label: "Support Tickets" },
                  { href: "/admin/support/stats", label: "Support Analytics" },
                ]}
              />
              <SidebarDropdown
                label="Library"
                items={[
                  { href: "/admin/exercises", label: "Exercises" },
                  { href: "/admin/exercises/create", label: "Create Exercise" },
                  { href: "/admin/stretches", label: "Stretches" },
                  { href: "/admin/stretches/create", label: "Create Stretch" },
                ]}
              />
              <SidebarDropdown
                label="Templates"
                items={[
                  { href: "/coach/gym-session-templates", label: "Gym Sessions" },
                  { href: "/coach/gym-session-templates/create", label: "Create Gym Session" },
                  { href: "/coach/functional-session-templates", label: "Functional Sessions" },
                  { href: "/coach/functional-session-templates/create", label: "Create Functional Session" },
                  { href: "/admin/functional/types/create", label: "Functional Types" },
                ]}
              />
              <SidebarDropdown
                label="Config"
                items={[
                  { href: "/admin/session-template-field-config", label: "Session Template Tags" },
                  { href: "/athlete/profile", label: "Athlete Profile" },
                  { href: "/admin/solo-plans", label: "Solo Plans" },
                ]}
              />
            </>
          )}
        </nav>

        {/* Bottom user area */}
        <div className="app-sidebar__bottom">
          <UserAccountDropdown />
        </div>
      </aside>

      {/* ── Fixed topbar ──────────────────────────────────────── */}
      <header className="app-topbar">
        <NotificationsIcon />
        <WarningsIcon />
      </header>
    </>
  );
}

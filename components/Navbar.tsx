import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/auth";
import { userHasPlanAppAccess } from "@/lib/auth/product-access";
import NotificationsIcon from "./NotificationsIcon";
import WarningsIcon from "./WarningsIcon";
import UserAccountDropdown from "./UserAccountDropdown";
import SidebarDropdown from "./SidebarDropdown";
import RoleViewDropdown from "./RoleViewDropdown";
import SidebarToggleButton from "./SidebarToggleButton";
import "./Navbar.css";

const VIEW_AS_ROLE_COOKIE = "ep_view_as_role";
const VIEWABLE_ROLES: AppRole[] = ["admin", "coach", "athlete", "solo_plan_holder"];

export default async function Navbar() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let actualRoles: AppRole[] = [];
  let features: string[] = [];
  let hasPlanAccess = false;

  if (user) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    actualRoles = (data?.map((row) => row.role) ?? []).filter(
      (role): role is AppRole =>
        role === "admin" ||
        role === "coach" ||
        role === "athlete" ||
        role === "solo_plan_holder" ||
        role === "creator"
    );

    const { data: featureData } = await supabase
      .from("user_features")
      .select("feature")
      .eq("user_id", user.id);

    features = featureData?.map((row) => row.feature) ?? [];
    hasPlanAccess = await userHasPlanAppAccess(supabase, user.id);
  }

  const selectedRole = (await cookies()).get(VIEW_AS_ROLE_COOKIE)?.value as AppRole | undefined;
  const roleView =
    actualRoles.includes("admin") && selectedRole && VIEWABLE_ROLES.includes(selectedRole)
      ? selectedRole
      : null;
  const roles = roleView ? [roleView] : actualRoles;

  const isActualAdmin = actualRoles.includes("admin");
  const isAdmin = roles.includes("admin");
  const isCoach = roles.includes("coach");
  const isAthlete = roles.includes("athlete");
  const isSoloPlanHolder = roles.includes("solo_plan_holder") || hasPlanAccess;

  // Hide navbar for plan-only users; they use the PWA shell instead.
  if (
    !isActualAdmin &&
    hasPlanAccess &&
    actualRoles.every((role) => role === "solo_plan_holder")
  ) {
    return null;
  }

  // Load nav permissions for non-admin roles
  let allowedNavItems = new Set<string>();
  if (!isAdmin && user) {
    const { data: permRows } = await supabase
      .from("role_nav_permissions")
      .select("nav_item")
      .in("role", roles)
      .eq("enabled", true);
    allowedNavItems = new Set(permRows?.map((r) => r.nav_item) ?? []);
  }

  // Admins bypass the permissions table; everyone else uses it
  function can(navItem: string): boolean {
    if (isAdmin) return true;
    return allowedNavItems.has(navItem);
  }

  const canAccessCoachArea = isAdmin || isCoach || can("coach_dashboard") ||
    can("coach_chat") || can("coach_programs") ||
    can("coach_mobility") || can("coach_gym_sessions") || can("coach_profile");
  const canAccessTrainingArea = isAthlete || isSoloPlanHolder ||
    can("athlete_plan") || can("athlete_chat") ||
    can("athlete_information") ||
    can("athlete_profile") || can("athlete_integrations") || can("athlete_upgrades");
  const canAccessKnowledgeBase = isAdmin || isCoach || isAthlete || isSoloPlanHolder ||
    can("athlete_knowledge_base") || can("coach_knowledge_base") || can("admin_knowledge_base");

  const hasRaceInfo = features.includes("race_info");
  const hasKitList = features.includes("kit_list");

  // ── Badge counts ──────────────────────────────────────
  let adminOpenTicketCount = 0;
  let adminFlaggedQbCount = 0;
  let coachHasUnread = false;
  let athleteHasUnread = false;

  if (isActualAdmin) {
    const { count } = await supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");
    adminOpenTicketCount = count ?? 0;

    const { count: flaggedCount } = await supabase
      .from("kb_flagged_questions")
      .select("*", { count: "exact", head: true })
      .eq("reviewed", false);
    adminFlaggedQbCount = flaggedCount ?? 0;
  }

  if (isCoach && user) {
    try {
      const { data: convs } = await supabase
        .from("chat_conversations")
        .select("id, coach_last_read_at")
        .eq("coach_user_id", user.id);

      if (convs && convs.length > 0) {
        const { data: threads } = await supabase
          .from("chat_threads")
          .select("id, conversation_id")
          .in(
            "conversation_id",
            convs.map((c) => c.id)
          );

        if (threads && threads.length > 0) {
          for (const thread of threads) {
            const conv = convs.find((c) => c.id === thread.conversation_id);
            if (!conv) continue;

            const lastRead = conv.coach_last_read_at
              ? new Date(conv.coach_last_read_at)
              : new Date(0);
            const { count } = await supabase
              .from("chat_messages")
              .select("*", { count: "exact", head: true })
              .eq("thread_id", thread.id)
              .neq("sender_user_id", user.id)
              .eq("status", "sent")
              .gte("created_at", lastRead.toISOString());

            if ((count ?? 0) > 0) {
              coachHasUnread = true;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("Error checking coach unread messages:", err);
    }
  }

  let athleteKbUnread = false;
  if ((isAthlete || isSoloPlanHolder) && user) {
    try {
      const { count } = await supabase
        .from("kb_answer_notifications")
        .select("id", { count: "exact", head: true })
        .eq("athlete_user_id", user.id)
        .eq("read", false);
      athleteKbUnread = (count ?? 0) > 0;
    } catch (err) {
      console.error("Error checking kb notifications:", err);
    }
  }

  if (isAthlete && user) {
    try {
      const { data: convs } = await supabase
        .from("chat_conversations")
        .select("id, athlete_last_read_at")
        .eq("athlete_user_id", user.id);

      if (convs && convs.length > 0) {
        const { data: threads } = await supabase
          .from("chat_threads")
          .select("id, conversation_id")
          .in(
            "conversation_id",
            convs.map((c) => c.id)
          );

        if (threads && threads.length > 0) {
          for (const thread of threads) {
            const conv = convs.find((c) => c.id === thread.conversation_id);
            if (!conv) continue;

            const lastRead = conv.athlete_last_read_at
              ? new Date(conv.athlete_last_read_at)
              : new Date(0);
            const { count } = await supabase
              .from("chat_messages")
              .select("*", { count: "exact", head: true })
              .eq("thread_id", thread.id)
              .neq("sender_user_id", user.id)
              .eq("status", "sent")
              .gte("created_at", lastRead.toISOString());

            if ((count ?? 0) > 0) {
              athleteHasUnread = true;
              break;
            }
          }
        }
      }
    } catch (err) {
      console.error("Error checking athlete unread messages:", err);
    }
  }

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
          {/* Athlete / Training section */}
          {canAccessTrainingArea && (
            <>
              <span className="app-sidebar__group-label">Training</span>
              {can("athlete_onboarding") && (
                <Link href="/athlete/onboarding" className="app-sidebar__link">
                  Onboarding
                </Link>
              )}
              {(can("athlete_plan") || hasPlanAccess) && (
                <SidebarDropdown
                  label="My Plan"
                  items={[
                    { href: hasPlanAccess && !isAthlete ? "/plan" : "/athlete", label: "Plan" },
                    { href: "/athlete/race-summary", label: "Race Summary" },
                    ...(isSoloPlanHolder ? [] : [{ href: "/athlete/log", label: "Log" }]),
                  ]}
                />
              )}
              {can("athlete_chat") && (
                <Link href="/athlete/chat" className="app-sidebar__link">
                  Chat
                  {athleteHasUnread && <span className="app-sidebar__nav-badge" />}
                </Link>
              )}
              {can("athlete_information") && (
                <SidebarDropdown
                  label="Information"
                  items={[
                    { href: "/athlete/information/destination", label: "Destination", requiresUpgrade: !hasRaceInfo },
                    { href: "/athlete/information/kit-list", label: "Kit List", requiresUpgrade: !hasKitList },
                  ]}
                />
              )}
              {can("athlete_profile") && (
                <Link href="/athlete/profile" className="app-sidebar__link">
                  Profile
                </Link>
              )}
              {can("athlete_integrations") && (
                <Link href="/athlete/integrations" className="app-sidebar__link">
                  Integrations
                </Link>
              )}
              {can("athlete_upgrades") && (
                <Link href="/athlete/upgrades" className="app-sidebar__link">
                  Upgrades
                </Link>
              )}
            </>
          )}

          {/* Coach section */}
          {canAccessCoachArea && (
            <>
              <span className="app-sidebar__group-label">Coach</span>
              {can("coach_onboarding") && (
                <Link href="/coach/onboarding" className="app-sidebar__link">
                  Onboarding
                </Link>
              )}
              {can("coach_dashboard") && (
                <Link href="/coach/dashboard" className="app-sidebar__link">
                  Dashboard
                </Link>
              )}
              {can("coach_chat") && (
                <Link href="/coach/chat" className="app-sidebar__link">
                  Chat
                  {coachHasUnread && <span className="app-sidebar__nav-badge" />}
                </Link>
              )}
              {can("coach_programs") && (
                <SidebarDropdown
                  label="Programs"
                  items={[
                    { href: "/coach/program-templates", label: "View Programs" },
                    { href: "/coach/program-templates/create", label: "Create Program" },
                  ]}
                />
              )}
              {can("coach_mobility") && (
                <SidebarDropdown
                  label="Mobility"
                  items={[
                    { href: "/coach/mobility-sessions", label: "View Mobility Sessions" },
                    { href: "/coach/mobility-sessions/create", label: "Create Mobility Session" },
                  ]}
                />
              )}
              {can("coach_gym_sessions") && (
                <SidebarDropdown
                  label="Gym Sessions"
                  items={[
                    { href: "/coach/gym-session-templates", label: "View Gym Sessions" },
                    { href: "/coach/gym-session-templates/create", label: "Create Gym Session" },
                  ]}
                />
              )}
              {can("coach_profile") && (
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
            {isActualAdmin && adminOpenTicketCount > 0 && <span className="app-sidebar__nav-badge" />}
          </Link>
          {canAccessKnowledgeBase && (
            <Link href="/knowledge-base" className="app-sidebar__link">
              Knowledge Base
              {athleteKbUnread && <span className="app-sidebar__nav-badge--green" />}
              {isActualAdmin && adminFlaggedQbCount > 0 && <span className="app-sidebar__nav-badge" />}
            </Link>
          )}
          <Link href="/help/suggest-feature" className="app-sidebar__link">
            Suggest Feature
          </Link>

          {/* Admin section */}
          {can("admin_panel") || can("admin_library") || can("admin_templates") || can("admin_destinations") || can("admin_config") || can("admin_tools") ? (
            <>
              <span className="app-sidebar__group-label">Admin</span>
              {can("admin_panel") && (
                <SidebarDropdown
                  label="Admin"
                  items={[
                    { href: "/admin/users/create-user", label: "Create Users" },
                    { href: "/admin/users", label: "Users" },
                    { href: "/admin/role-permissions", label: "Role Permissions" },
                    { href: "/admin/coach-performance", label: "Coach Performance" },
                    { href: "/admin/support", label: "Support Tickets" },
                    { href: "/admin/support/stats", label: "Support Analytics" },
                    { href: "/admin/export-programme", label: "Export Programme" },
                    { href: "/admin/plans", label: "Plans" },
                  ]}
                />
              )}
              {can("admin_library") && (
                <SidebarDropdown
                  label="Library"
                  items={[
                    { href: "/admin/exercises", label: "Exercises" },
                    { href: "/admin/exercises/create", label: "Create Exercise" },
                    { href: "/admin/stretches", label: "Stretches" },
                    { href: "/admin/stretches/create", label: "Create Stretch" },
                    { href: "/admin/assessment-tests", label: "Assessment Tests" },
                    { href: "/admin/assessment-tests/create", label: "Create Assessment Test" },
                    { href: "/admin/muscles", label: "Muscles" },
                    { href: "/admin/muscles/create", label: "Create Muscle" },
                    { href: "/admin/assessment-tags", label: "Assessment Tags" },
                    { href: "/admin/assessment-tags/create", label: "Create Assessment Tag" },
                  ]}
                />
              )}
              {can("admin_templates") && (
                <SidebarDropdown
                  label="Templates"
                  items={[
                    { href: "/coach/functional-session-templates", label: "Functional Sessions" },
                    { href: "/coach/functional-session-templates/create", label: "Create Functional Session" },
                    { href: "/admin/functional/types/create", label: "Functional Types" },
                  ]}
                />
              )}
              {can("admin_destinations") && (
                <SidebarDropdown
                  label="Destinations"
                  items={[
                    { href: "/admin/countries", label: "Countries" },
                    { href: "/admin/events", label: "Events" },
                  ]}
                />
              )}
              {can("admin_config") && (
                <SidebarDropdown
                  label="Config"
                  items={[
                    { href: "/admin/session-template-field-config", label: "Session Template Tags" },
                    { href: "/athlete/profile", label: "Athlete Profile" },
                    { href: "/admin/solo-plans", label: "Solo Plans" },
                    { href: "/admin/coach-athlete-links", label: "Coach-Athlete Links" },
                    { href: "/admin/chat/phrases", label: "Chat Moderation" },
                    { href: "/admin/chat/moderation", label: "Review Flagged Messages" },
                  ]}
                />
              )}
              {can("admin_tools") && (
                <SidebarDropdown
                  label="Tools"
                  items={[
                    { href: "/admin/tools", label: "Tools Hub" },
                    { href: "/admin/race-strategy", label: "Race Strategy" },
                    { href: "/admin/race-files", label: "Race Files" },
                    { href: "/admin/race-comparison", label: "Race Comparison" },
                    { href: "/admin/races", label: "Race Tags" },
                    { href: "/admin/athlete-network", label: "Data Analysis" },
                    { href: "/admin/tools/athlete-similarity", label: "Athlete Similarity" },
                    { href: "/admin/results-import", label: "Import Results" },
                    { href: "/admin/raw-races", label: "Raw Races" },
                    { href: "/admin/race-rename", label: "Race Rename" },
                    { href: "/admin/race-pacing", label: "Race Pacing" },
                    { href: "/admin/race-readiness", label: "Race Readiness" },
                    { href: "/admin/race-intelligence", label: "Race Intelligence" },
                    { href: "/admin/athlete-demands", label: "Athlete Demands" },
                    { href: "/admin/preparation-races", label: "Preparation Races" },
                  ]}
                />
              )}
            </>
          ) : null}
        </nav>

        {/* Bottom user area */}
        <div className="app-sidebar__bottom">
          <RoleViewDropdown roles={actualRoles} selectedRole={roleView} />
          <UserAccountDropdown />
        </div>
      </aside>

      {/* ── Fixed topbar ──────────────────────────────────────── */}
      <header className="app-topbar">
        <SidebarToggleButton />
        <NotificationsIcon />
        <WarningsIcon />
      </header>
    </>
  );
}

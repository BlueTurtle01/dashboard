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
  let features: string[] = [];

  if (user) {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    roles = data?.map((row) => row.role) ?? [];

    const { data: featureData } = await supabase
      .from("user_features")
      .select("feature")
      .eq("user_id", user.id);

    features = featureData?.map((row) => row.feature) ?? [];
  }

  const isAdmin = roles.includes("admin");
  const isCoach = roles.includes("coach");
  const isAthlete = roles.includes("athlete");
  const isSoloPlanHolder = roles.includes("solo_plan_holder");
  const canAccessCoachArea = isAdmin || isCoach;

  const hasRaceInfo = features.includes("race_info");
  const hasKitList = features.includes("kit_list");

  // ── Badge counts ──────────────────────────────────────
  let adminOpenTicketCount = 0;
  let coachHasUnread = false;
  let athleteHasUnread = false;

  if (isAdmin) {
    const { count } = await supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");
    adminOpenTicketCount = count ?? 0;
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
          {/* Athlete section */}
          {(isAthlete || isSoloPlanHolder) && (
            <>
              <span className="app-sidebar__group-label">Training</span>
              <SidebarDropdown
                label="My Plan"
                items={[
                  { href: "/athlete", label: "Plan" },
                  { href: "/athlete/sessions", label: "Sessions" },
                  ...(isSoloPlanHolder ? [] : [{ href: "/athlete/log", label: "Log" }]),
                ]}
              />
              <Link href="/athlete/chat" className="app-sidebar__link">
                Chat
                {athleteHasUnread && <span className="app-sidebar__nav-badge" />}
              </Link>
              <Link href="/athlete/library" className="app-sidebar__link">
                Library
              </Link>
              <Link href="/athlete/knowledge-base" className="app-sidebar__link">
                Knowledge Base
                {athleteKbUnread && <span className="app-sidebar__nav-badge--green" />}
              </Link>
              <SidebarDropdown
                label="Information"
                items={[
                  { href: "/athlete/information/destination", label: "Destination", requiresUpgrade: !hasRaceInfo },
                  { href: "/athlete/information/kit-list", label: "Kit List", requiresUpgrade: !hasKitList },
                ]}
              />
              <Link href="/athlete/profile" className="app-sidebar__link">
                Profile
              </Link>
              <Link href="/athlete/upgrades" className="app-sidebar__link">
                Upgrades
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
              <Link href="/coach/chat" className="app-sidebar__link">
                Chat
                {coachHasUnread && <span className="app-sidebar__nav-badge" />}
              </Link>
              <Link href="/coach/knowledge-base" className="app-sidebar__link">
                Knowledge Base
              </Link>
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
              <SidebarDropdown
                label="Gym Sessions"
                items={[
                  { href: "/coach/gym-session-templates", label: "View Gym Sessions" },
                  { href: "/coach/gym-session-templates/create", label: "Create Gym Session" },
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
            {isAdmin && adminOpenTicketCount > 0 && <span className="app-sidebar__nav-badge" />}
          </Link>

          {/* Admin section */}
          {isAdmin && (
            <>
              <span className="app-sidebar__group-label">Admin</span>
              <SidebarDropdown
                label="Admin"
                items={[
                  { href: "/admin/users/create-user", label: "Create Users" },
                  { href: "/admin/users", label: "Users" },
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
                  { href: "/coach/functional-session-templates", label: "Functional Sessions" },
                  { href: "/coach/functional-session-templates/create", label: "Create Functional Session" },
                  { href: "/admin/functional/types/create", label: "Functional Types" },
                ]}
              />
              <SidebarDropdown
                label="Destinations"
                items={[
                  { href: "/admin/countries", label: "Countries" },
                ]}
              />
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

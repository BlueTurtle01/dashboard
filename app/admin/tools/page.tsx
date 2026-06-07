"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ToolCard {
  href: string;
  title: string;
  description: string;
  badge?: "Active" | "Beta" | "Coming soon";
}

interface ToolGroup {
  label: string;
  tools: ToolCard[];
}

const GROUPS: ToolGroup[] = [
  {
    label: "Race Intelligence",
    tools: [
      {
        href: "/admin/race-readiness",
        title: "Race Readiness",
        description: "Generate a personalised readiness PDF for an athlete targeting a specific race.",
        badge: "Active",
      },
      {
        href: "/admin/race-files",
        title: "Race Files",
        description: "Upload GPX routes and wind analysis CSV files for any race.",
        badge: "Active",
      },
      {
        href: "/admin/data-coverage",
        title: "Data Coverage",
        description: "See which races with results are missing GPX, race profile, or pace strategy data.",
        badge: "Active",
      },
      {
        href: "/admin/race-strategy",
        title: "Race Strategy",
        description: "Build and store pace strategy sections for Plan Insights on the public race page.",
        badge: "Active",
      },
      {
        href: "/admin/race-comparison",
        title: "Race Comparison",
        description: "Compare the elevation and terrain profiles of two races side by side.",
        badge: "Active",
      },
      {
        href: "/admin/race-pacing",
        title: "Race Pacing",
        description: "Analyse historic pacing patterns and splits across a race's result set.",
        badge: "Active",
      },
    ],
  },
  {
    label: "Results & Data Import",
    tools: [
      {
        href: "/admin/results-import",
        title: "Import Results",
        description: "Bulk upload race result CSVs. Handles deduplication and year tracking automatically.",
        badge: "Active",
      },
      {
        href: "/admin/raw-races",
        title: "Raw Races",
        description: "Review and publish imported races, or merge duplicate race entries.",
        badge: "Active",
      },
      {
        href: "/admin/race-rename",
        title: "Race Rename",
        description: "Rename or merge duplicate race entries across the database.",
        badge: "Active",
      },
      {
        href: "/admin/races",
        title: "All Races",
        description: "Browse and edit all race records, coordinates, and metadata.",
        badge: "Active",
      },
    ],
  },
  {
    label: "Athlete Intelligence",
    tools: [
      {
        href: "/admin/athlete-network",
        title: "Data Analysis",
        description: "Probabilistic identity matching, race paths, career trajectory clustering, and field correlation analysis.",
        badge: "Active",
      },
      {
        href: "/admin/tools/athlete-similarity",
        title: "Athlete Similarity",
        description: "Cluster athletes by race history profile. Find similar athletes and explore career archetypes.",
        badge: "Active",
      },
      {
        href: "/admin/athlete-demands",
        title: "Athlete Demands",
        description: "Analyse training load and race demands for individual athletes.",
        badge: "Active",
      },
    ],
  },
  {
    label: "Content & Configuration",
    tools: [
      {
        href: "/admin/exercises",
        title: "Exercises",
        description: "Manage the exercise library used in training plans and sessions.",
        badge: "Active",
      },
      {
        href: "/admin/stretches",
        title: "Stretches",
        description: "Manage the stretching and mobility exercise library.",
        badge: "Active",
      },
      {
        href: "/admin/plans",
        title: "Plans",
        description: "View and manage coached training plans.",
        badge: "Active",
      },
      {
        href: "/admin/solo-plans",
        title: "Solo Plans",
        description: "Manage self-guided training plans available to individual athletes.",
        badge: "Active",
      },
      {
        href: "/admin/preparation-races",
        title: "Preparation Races",
        description: "Configure recommended prep races that appear on goal race pages.",
        badge: "Active",
      },
      {
        href: "/admin/events",
        title: "Events",
        description: "Manage training events and race calendar entries.",
        badge: "Active",
      },
      {
        href: "/admin/countries",
        title: "Countries",
        description: "Edit country reference data used across the platform.",
        badge: "Active",
      },
      {
        href: "/admin/export-programme",
        title: "Export Programme",
        description: "Export training programmes for athletes.",
        badge: "Active",
      },
      {
        href: "/admin/session-template-field-config",
        title: "Session Field Config",
        description: "Configure which fields appear on session templates.",
        badge: "Active",
      },
    ],
  },
  {
    label: "Users & Access",
    tools: [
      {
        href: "/admin/users",
        title: "Users",
        description: "Manage user accounts and assign roles.",
        badge: "Active",
      },
      {
        href: "/admin/role-permissions",
        title: "Role Permissions",
        description: "Configure what each role can access across the platform.",
        badge: "Active",
      },
      {
        href: "/admin/coach-performance",
        title: "Coach Performance",
        description: "Review coach activity metrics and athlete engagement data.",
        badge: "Active",
      },
      {
        href: "/admin/coach-athlete-links",
        title: "Coach–Athlete Links",
        description: "Manage which athletes are linked to which coaches.",
        badge: "Active",
      },
      {
        href: "/admin/support",
        title: "Support",
        description: "View and respond to user support requests.",
        badge: "Active",
      },
    ],
  },
];

const BADGE_COLOR: Record<string, string> = {
  Active:         "#16a34a",
  Beta:           "#d97706",
  "Coming soon":  "#9ca3af",
};

export default function AdminToolsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "ok" | "forbidden">("loading");

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!roles?.some((r: { role: string }) => r.role === "admin")) {
        router.push("/login");
        return;
      }
      setAuthState("ok");
    }
    checkAuth();
  }, [router]);

  if (authState === "loading") {
    return <div style={{ padding: 48, color: "#6b7280", fontSize: 14 }}>Loading…</div>;
  }

  return (
    <main style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
        Admin Tools
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 36px" }}>
        All admin pages in one place.
      </p>

      {GROUPS.map((group, gi) => (
        <section key={group.label} style={{ marginBottom: gi < GROUPS.length - 1 ? 40 : 0 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: "1px solid #f0f0f0",
          }}>
            {group.label}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}>
            {group.tools.map((tool) => (
              <Link key={tool.href} href={tool.href} style={{ textDecoration: "none" }}>
                <ToolCardEl tool={tool} />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function ToolCardEl({ tool }: { tool: ToolCard }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? "#2563eb" : "#e5e7eb"}`,
        borderRadius: 8,
        padding: "14px 16px",
        background: "#fff",
        cursor: "pointer",
        boxShadow: hovered ? "0 2px 8px rgba(37,99,235,0.09)" : "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
          {tool.title}
        </span>
        {tool.badge && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: BADGE_COLOR[tool.badge],
            background: BADGE_COLOR[tool.badge] + "18",
            border: `1px solid ${BADGE_COLOR[tool.badge]}40`,
            borderRadius: 4,
            padding: "1px 7px",
            whiteSpace: "nowrap",
            marginLeft: 8,
            flexShrink: 0,
          }}>
            {tool.badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>
        {tool.description}
      </p>
    </div>
  );
}

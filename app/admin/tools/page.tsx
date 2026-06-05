"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ToolCard {
  href: string;
  title: string;
  description: string;
  badge: "Active" | "Beta" | "Coming soon";
}

const TOOLS: ToolCard[] = [
  {
    href: "/admin/tools/athlete-similarity",
    title: "Athlete Similarity",
    description:
      "Cluster athletes by race history profile. Find similar athletes, explore career archetypes, and test profile vectors against the full population.",
    badge: "Active",
  },
  {
    href: "/admin/athlete-network",
    title: "Data Analysis",
    description:
      "Probabilistic identity matching, race paths, career trajectory clustering, and field correlation analysis.",
    badge: "Active",
  },
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
];

const BADGE_COLOR: Record<string, string> = {
  Active: "#16a34a",
  Beta: "#d97706",
  "Coming soon": "#9ca3af",
};

export default function AdminToolsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"loading" | "ok" | "forbidden">("loading");

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
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
    return (
      <div style={{ padding: 48, color: "#6b7280", fontSize: 14 }}>Loading…</div>
    );
  }

  return (
    <main style={{ padding: "32px 40px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/admin/users" style={{ color: "#2563eb", fontSize: 13, textDecoration: "none" }}>
          ← Admin
        </Link>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
        Admin Tools
      </h1>
      <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 32px" }}>
        ML analysis, data exploration, and management tools.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "20px 22px",
                background: "#fff",
                cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#2563eb";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(37,99,235,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "#e5e7eb";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>
                  {tool.title}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: BADGE_COLOR[tool.badge],
                    background: BADGE_COLOR[tool.badge] + "18",
                    border: `1px solid ${BADGE_COLOR[tool.badge]}40`,
                    borderRadius: 4,
                    padding: "2px 8px",
                    whiteSpace: "nowrap",
                    marginLeft: 8,
                  }}
                >
                  {tool.badge}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.55 }}>
                {tool.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

interface Stats {
  totalResults: number;
  namesWithMultipleEntries: number;
  namesAcrossMultipleRaces: number;
}

export default function AthleteNetworkPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id);
      if (!roles?.some((r) => r.role === "admin")) {
        router.push("/login"); return;
      }

      const { data: statsData, error: statsError } = await supabase.rpc("al_network_stats");

      if (statsError) {
        setError(statsError.message);
        setLoading(false);
        return;
      }

      const s = (statsData as Array<{ total_results: number; names_multi_entry: number; names_multi_race: number }>)?.[0];
      setStats({
        totalResults: s?.total_results ?? 0,
        namesWithMultipleEntries: s?.names_multi_entry ?? 0,
        namesAcrossMultipleRaces: s?.names_multi_race ?? 0,
      });
      setLoading(false);
    }
    load().catch(() => { setError("Failed to load stats"); setLoading(false); });
  }, [router]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Data Analysis</h1>
            <p style={subtitleStyle}>
              Probabilistic identity matching across race results. Links entrants
              who appear in multiple races using name, club, gender, and age group
              as signals — even when they are not registered users.
            </p>
          </div>
          <button onClick={() => router.push("/admin")} style={backButtonStyle}>
            Back to Admin
          </button>
        </div>

        {error && <p style={errorStyle}>{error}</p>}

        <div style={statsRowStyle}>
          <StatCard
            label="Total race results"
            value={loading ? "—" : (stats?.totalResults ?? 0).toLocaleString()}
            description="Imported finisher records across all races and years"
          />
          <StatCard
            label="Names with 2+ entries"
            value={loading ? "—" : (stats?.namesWithMultipleEntries ?? 0).toLocaleString()}
            description="Distinct names appearing more than once across any race or year"
          />
          <StatCard
            label="Names across 2+ races"
            value={loading ? "—" : (stats?.namesAcrossMultipleRaces ?? 0).toLocaleString()}
            description="Names seen in at least two different races — highest linking potential"
          />
        </div>

        <h2 style={sectionHeadingStyle}>Analysis tools</h2>
        <div style={toolsGridStyle}>
          <ToolCard
            href="/admin/athlete-network/name-matches"
            title="Name Matches"
            description="Browse all names that appear across multiple race results, ranked by probability that each set of entries belongs to the same person. Signals: exact name match, consistent club, gender, and age group."
            badge="Active"
          />
          <ToolCard
            href="#"
            title="Network Graph"
            description="Visual network showing connections between entrants across races. Coming in a future iteration."
            badge="Coming soon"
            disabled
          />
          <ToolCard
            href="#"
            title="Entrant Profiles"
            description="Manage confirmed entrant profiles — deduplicated person entities built from reviewed links."
            badge="Coming soon"
            disabled
          />
        </div>

        <div style={noticeStyle}>
          <p style={noticeTextStyle}>
            <strong>Privacy note:</strong> This tool analyses race result data
            that is already in the public domain (published by race organisers).
            Probabilistic links are not stored unless manually confirmed by an admin.
          </p>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div style={statCardStyle}>
      <p style={statLabelStyle}>{label}</p>
      <p style={statValueStyle}>{value}</p>
      <p style={statDescStyle}>{description}</p>
    </div>
  );
}

function ToolCard({
  href, title, description, badge, disabled,
}: {
  href: string; title: string; description: string; badge: string; disabled?: boolean;
}) {
  const card = (
    <div style={{ ...toolCardStyle, opacity: disabled ? 0.55 : 1 }}>
      <div style={toolCardHeaderStyle}>
        <span style={toolCardTitleStyle}>{title}</span>
        <span style={disabled ? badgeComingSoonStyle : badgeActiveStyle}>{badge}</span>
      </div>
      <p style={toolCardDescStyle}>{description}</p>
      {!disabled && <p style={toolCardLinkStyle}>Open →</p>}
    </div>
  );

  if (disabled) return card;
  return <Link href={href} style={{ textDecoration: "none" }}>{card}</Link>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f5f5f5",
  padding: "40px 24px",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1100px",
  margin: "0 auto",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "32px",
  gap: "16px",
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "28px",
  fontWeight: 700,
};

const subtitleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#555",
  fontSize: "14px",
  maxWidth: "620px",
  lineHeight: 1.5,
};

const backButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#fff",
  color: "#111",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };

const statsRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: "16px",
  marginBottom: "40px",
};

const statCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e5e5e5",
  padding: "24px",
};

const statLabelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  fontWeight: 600,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const statValueStyle: React.CSSProperties = {
  margin: "8px 0 4px",
  fontSize: "32px",
  fontWeight: 700,
  color: "#111",
};

const statDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#666",
  lineHeight: 1.4,
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  margin: "0 0 16px",
};

const toolsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "16px",
  marginBottom: "40px",
};

const toolCardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e5e5e5",
  padding: "24px",
  cursor: "pointer",
  transition: "border-color 0.15s",
};

const toolCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "10px",
};

const toolCardTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "15px",
};

const toolCardDescStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#555",
  lineHeight: 1.5,
};

const toolCardLinkStyle: React.CSSProperties = {
  margin: "12px 0 0",
  fontSize: "13px",
  fontWeight: 600,
  color: "#111",
};

const badgeActiveStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: "999px",
  background: "#e6f4ea",
  color: "#1e7c34",
};

const badgeComingSoonStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  padding: "3px 8px",
  borderRadius: "999px",
  background: "#f0f0f0",
  color: "#888",
};

const noticeStyle: React.CSSProperties = {
  background: "#fffbe6",
  border: "1px solid #ffe58f",
  borderRadius: "8px",
  padding: "16px 20px",
};

const noticeTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#7a5c00",
  lineHeight: 1.5,
};

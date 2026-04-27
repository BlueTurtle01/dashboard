"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TicketStats } from "@/lib/actions/support";

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  billing: "Billing",
  coaching: "Coaching",
  account: "Account",
  feedback: "Feedback",
  other: "Other",
};

const URGENCY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const URGENCY_COLORS: Record<string, string> = {
  low: "#9ca3af",
  medium: "#f59e0b",
  high: "#ef4444",
  urgent: "#7c3aed",
};

export default function SupportStatsView({ stats }: { stats: TicketStats }) {
  const categoryData = Object.entries(stats.byCategory).map(([key, count]) => ({
    name: CATEGORY_LABELS[key] ?? key,
    count,
  }));

  const urgencyData = Object.entries(stats.byUrgency).map(([key, count]) => ({
    name: URGENCY_LABELS[key] ?? key,
    count,
    fill: URGENCY_COLORS[key] ?? "#111",
  }));

  return (
    <div>
      {/* Stat cards */}
      <div style={cardsGrid}>
        <StatCard label="Total Tickets" value={stats.total} />
        <StatCard label="Open" value={stats.byStatus.open} color="#2563eb" />
        <StatCard label="In Progress" value={stats.byStatus.in_progress} color="#d97706" />
        <StatCard label="Resolved" value={stats.byStatus.resolved} color="#0a7f3f" />
        <StatCard label="Closed" value={stats.byStatus.closed} color="#6b7280" />
      </div>

      {/* Resolution time cards */}
      <div style={sectionTitle}>Resolution Times</div>
      <div style={cardsGrid}>
        <StatCard
          label="Tickets Resolved"
          value={stats.resolvedCount}
          sub="with recorded time"
        />
        <StatCard
          label="Average"
          value={formatDuration(stats.avgResolutionMinutes)}
          sub="resolution time"
        />
        <StatCard
          label="Median"
          value={formatDuration(stats.medianResolutionMinutes)}
          sub="resolution time"
        />
        <StatCard
          label="Fastest"
          value={formatDuration(stats.fastestMinutes)}
          color="#0a7f3f"
        />
        <StatCard
          label="Slowest"
          value={formatDuration(stats.slowestMinutes)}
          color="#b00020"
        />
      </div>

      {/* Charts row */}
      <div style={chartsRow}>
        <div style={chartCard}>
          <p style={chartTitle}>Tickets by Category</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={categoryData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#111" radius={[4, 4, 0, 0]} name="Tickets" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={chartCard}>
          <p style={chartTitle}>Tickets by Urgency</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={urgencyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Tickets"
                fill="#111"
                // per-bar fill via Cell would need import; using a single fill is fine for now
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent resolved tickets table */}
      <div style={sectionTitle}>Recently Resolved</div>
      {stats.recentResolved.length === 0 ? (
        <p style={emptyStyle}>No resolved tickets yet.</p>
      ) : (
        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Subject</th>
                <th style={{ ...th, textAlign: "left" }}>User</th>
                <th style={th}>Category</th>
                <th style={th}>Urgency</th>
                <th style={th}>Opened</th>
                <th style={th}>Resolved</th>
                <th style={th}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentResolved.map((t) => (
                <tr key={t.id} style={trStyle}>
                  <td style={tdStyle}>{t.subject}</td>
                  <td style={{ ...tdStyle, color: "#888", fontSize: "12px" }}>{t.user_email}</td>
                  <td style={tdCenter}>{CATEGORY_LABELS[t.category] ?? t.category}</td>
                  <td style={tdCenter}>
                    <span style={{ color: URGENCY_COLORS[t.urgency] ?? "#111", fontWeight: 600 }}>
                      {URGENCY_LABELS[t.urgency] ?? t.urgency}
                    </span>
                  </td>
                  <td style={tdCenter}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td style={tdCenter}>
                    {t.resolved_at ? new Date(t.resolved_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ ...tdCenter, fontWeight: 600 }}>
                    {formatDuration(t.resolution_minutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={statCardStyle}>
      <span style={{ ...statValueStyle, color: color ?? "#111" }}>{value}</span>
      <span style={statLabelStyle}>{label}</span>
      {sub && <span style={statSubStyle}>{sub}</span>}
    </div>
  );
}

const cardsGrid: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginBottom: "28px",
};

const statCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "16px 24px",
  border: "1px solid #e5e5e5",
  borderRadius: "10px",
  minWidth: "100px",
  gap: "2px",
};

const statValueStyle: React.CSSProperties = {
  fontSize: "26px",
  fontWeight: 700,
  lineHeight: 1,
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#888",
  marginTop: "4px",
  textAlign: "center",
};

const statSubStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#bbb",
  textAlign: "center",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#444",
  marginBottom: "14px",
  paddingTop: "4px",
};

const chartsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "20px",
  marginBottom: "32px",
};

const chartCard: React.CSSProperties = {
  border: "1px solid #e5e5e5",
  borderRadius: "10px",
  padding: "20px",
};

const chartTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#444",
  margin: "0 0 14px",
};

const tableWrap: React.CSSProperties = { overflowX: "auto" };

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const th: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "2px solid #e5e5e5",
  fontWeight: 600,
  color: "#555",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const trStyle: React.CSSProperties = { borderBottom: "1px solid #f5f5f5" };

const tdStyle: React.CSSProperties = {
  padding: "11px 14px",
  color: "#111",
};

const tdCenter: React.CSSProperties = {
  padding: "11px 14px",
  textAlign: "center",
  color: "#444",
  whiteSpace: "nowrap",
};

const emptyStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: "14px",
  padding: "20px 0",
};

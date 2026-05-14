"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRole } from "@/lib/types/auth";
import { UserDetail, saveUserRoles } from "@/lib/actions/userRoles";
import { grantFeature, revokeFeature } from "@/lib/actions/userFeatures";

const ALL_ROLES: AppRole[] = ["admin", "coach", "athlete", "creator"];
const ALL_FEATURES = ["race_info", "video_analysis", "vaccinations", "kit_list"] as const;
type UserFeature = (typeof ALL_FEATURES)[number];

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  coach: "Coach",
  athlete: "Athlete",
  solo_plan_holder: "Solo Plan",
  creator: "Creator",
};

const FEATURE_LABELS: Record<UserFeature, string> = {
  race_info: "Race Info",
  video_analysis: "Video Analysis",
  vaccinations: "Vaccinations",
  kit_list: "Kit List",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UserDetailClient({ user, features: initialFeatures }: { user: UserDetail; features: string[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<Set<AppRole>>(new Set(user.roles));
  const [features, setFeatures] = useState<Set<UserFeature>>(new Set(initialFeatures as UserFeature[]));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [featureStatus, setFeatureStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function toggleRole(role: AppRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
    setStatus("idle");
  }

  function toggleFeature(feature: UserFeature) {
    setFeatures((prev) => {
      const next = new Set(prev);
      next.has(feature) ? next.delete(feature) : next.add(feature);
      return next;
    });
    setFeatureStatus("idle");
  }

  async function handleSave() {
    setStatus("saving");
    try {
      await saveUserRoles(user.id, [...roles]);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  async function handleSaveFeatures() {
    setFeatureStatus("saving");
    try {
      const currentFeatures = new Set(initialFeatures as UserFeature[]);
      const toAdd = [...features].filter((f) => !currentFeatures.has(f));
      const toRemove = [...currentFeatures].filter((f) => !features.has(f));

      for (const feature of toAdd) {
        await grantFeature(user.id, feature);
      }

      for (const feature of toRemove) {
        await revokeFeature(user.id, feature);
      }

      setFeatureStatus("saved");
    } catch {
      setFeatureStatus("error");
    }
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>{user.email}</h1>
            <p style={subtitleStyle}>User ID: {user.id}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/admin/users")}
            style={secondaryButtonStyle}
          >
            ← Back to Users
          </button>
        </div>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Account Details</h2>
          <div style={detailGridStyle}>
            <DetailRow label="Email" value={user.email} />
            <DetailRow label="Phone" value={user.phone ?? "—"} />
            <DetailRow label="Email confirmed" value={formatDate(user.email_confirmed_at)} />
            <DetailRow label="Created" value={formatDate(user.created_at)} />
            <DetailRow label="Last sign in" value={formatDate(user.last_sign_in_at)} />
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Roles</h2>
          <p style={sectionSubtitleStyle}>
            Changes take effect immediately after saving.
          </p>
          <div style={rolesGridStyle}>
            {ALL_ROLES.map((role) => (
              <label key={role} style={roleLabelStyle}>
                <input
                  type="checkbox"
                  checked={roles.has(role)}
                  onChange={() => toggleRole(role)}
                  style={checkboxStyle}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          <div style={saveRowStyle}>
            <button
              type="button"
              onClick={handleSave}
              disabled={status === "saving"}
              style={
                status === "saved"
                  ? savedButtonStyle
                  : status === "error"
                  ? errorButtonStyle
                  : primaryButtonStyle
              }
            >
              {status === "saving"
                ? "Saving..."
                : status === "saved"
                ? "Saved"
                : status === "error"
                ? "Error — retry"
                : "Save roles"}
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Features</h2>
          <p style={sectionSubtitleStyle}>
            Manage which features this user has access to.
          </p>
          <div style={rolesGridStyle}>
            {ALL_FEATURES.map((feature) => (
              <label key={feature} style={roleLabelStyle}>
                <input
                  type="checkbox"
                  checked={features.has(feature)}
                  onChange={() => toggleFeature(feature)}
                  style={checkboxStyle}
                />
                {FEATURE_LABELS[feature]}
              </label>
            ))}
          </div>
          <div style={saveRowStyle}>
            <button
              type="button"
              onClick={handleSaveFeatures}
              disabled={featureStatus === "saving"}
              style={
                featureStatus === "saved"
                  ? savedButtonStyle
                  : featureStatus === "error"
                  ? errorButtonStyle
                  : primaryButtonStyle
              }
            >
              {featureStatus === "saving"
                ? "Saving..."
                : featureStatus === "saved"
                ? "Saved"
                : featureStatus === "error"
                ? "Error — retry"
                : "Save features"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={detailValueStyle}>{value}</span>
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "700px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "24px", fontWeight: 700, wordBreak: "break-all" };
const subtitleStyle: React.CSSProperties = { margin: "6px 0 0", color: "#888", fontSize: "13px", fontFamily: "monospace", wordBreak: "break-all" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px", marginBottom: "24px" };
const sectionTitleStyle: React.CSSProperties = { margin: "0 0 16px", fontSize: "17px", fontWeight: 600 };
const sectionSubtitleStyle: React.CSSProperties = { margin: "-8px 0 16px", color: "#666", fontSize: "13px" };
const detailGridStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "12px" };
const detailRowStyle: React.CSSProperties = { display: "flex", gap: "16px", justifyContent: "space-between", borderBottom: "1px solid #f0f0f0", paddingBottom: "12px" };
const detailLabelStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 600, color: "#555", minWidth: "140px" };
const detailValueStyle: React.CSSProperties = { fontSize: "13px", color: "#111", textAlign: "right", wordBreak: "break-all" };
const rolesGridStyle: React.CSSProperties = { display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "20px" };
const roleLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", fontWeight: 500 };
const checkboxStyle: React.CSSProperties = { width: "16px", height: "16px", accentColor: "#111" };
const saveRowStyle: React.CSSProperties = { display: "flex", gap: "12px" };
const baseButtonStyle: React.CSSProperties = { padding: "10px 20px", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "14px", cursor: "pointer" };
const primaryButtonStyle: React.CSSProperties = { ...baseButtonStyle, background: "#111", color: "#fff" };
const savedButtonStyle: React.CSSProperties = { ...baseButtonStyle, background: "#0a7f3f", color: "#fff" };
const errorButtonStyle: React.CSSProperties = { ...baseButtonStyle, background: "#b00020", color: "#fff" };
const secondaryButtonStyle: React.CSSProperties = { padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 600, fontSize: "14px", cursor: "pointer" };

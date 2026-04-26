"use client";

import { useState } from "react";
import { AppRole } from "@/lib/auth/get-current-user";
import { UserWithRoles, saveUserRoles } from "@/lib/actions/userRoles";

const ALL_ROLES: AppRole[] = ["admin", "coach", "athlete", "solo_plan_holder"];

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  coach: "Coach",
  athlete: "Athlete",
  solo_plan_holder: "Solo Plan",
};

export default function UserRolesTable({ users }: { users: UserWithRoles[] }) {
  const [roleMap, setRoleMap] = useState<Record<string, Set<AppRole>>>(() => {
    const map: Record<string, Set<AppRole>> = {};
    for (const u of users) {
      map[u.id] = new Set(u.roles);
    }
    return map;
  });

  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [search, setSearch] = useState("");

  function toggleRole(userId: string, role: AppRole) {
    setRoleMap((prev) => {
      const next = new Set(prev[userId]);
      next.has(role) ? next.delete(role) : next.add(role);
      return { ...prev, [userId]: next };
    });
  }

  async function handleSave(userId: string) {
    setSaving((prev) => ({ ...prev, [userId]: "saving" }));
    try {
      await saveUserRoles(userId, [...roleMap[userId]]);
      setSaving((prev) => ({ ...prev, [userId]: "saved" }));
      setTimeout(() => setSaving((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      }), 2000);
    } catch {
      setSaving((prev) => ({ ...prev, [userId]: "error" }));
    }
  }

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <input
        type="search"
        placeholder="Filter by email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Email</th>
              {ALL_ROLES.map((role) => (
                <th key={role} style={thStyle}>
                  {ROLE_LABELS[role]}
                </th>
              ))}
              <th style={thStyle}>Save</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => {
              const status = saving[user.id];
              return (
                <tr key={user.id} style={trStyle}>
                  <td style={tdEmailStyle}>{user.email}</td>
                  {ALL_ROLES.map((role) => (
                    <td key={role} style={tdCenterStyle}>
                      <input
                        type="checkbox"
                        checked={roleMap[user.id]?.has(role) ?? false}
                        onChange={() => toggleRole(user.id, role)}
                        style={checkboxStyle}
                      />
                    </td>
                  ))}
                  <td style={tdCenterStyle}>
                    <button
                      onClick={() => handleSave(user.id)}
                      disabled={status === "saving"}
                      style={
                        status === "saved"
                          ? savedButtonStyle
                          : status === "error"
                          ? errorButtonStyle
                          : saveButtonStyle
                      }
                    >
                      {status === "saving"
                        ? "Saving..."
                        : status === "saved"
                        ? "Saved"
                        : status === "error"
                        ? "Error"
                        : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={ALL_ROLES.length + 2} style={emptyStyle}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const searchStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  marginBottom: "20px",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "14px",
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "2px solid #e5e5e5",
  fontWeight: 600,
  whiteSpace: "nowrap",
  textAlign: "center",
  color: "#444",
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid #f0f0f0",
};

const tdEmailStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#111",
  wordBreak: "break-all",
};

const tdCenterStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "center",
};

const checkboxStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: "#111",
};

const baseButtonStyle: React.CSSProperties = {
  padding: "6px 14px",
  border: "none",
  borderRadius: "6px",
  fontWeight: 600,
  fontSize: "13px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const saveButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: "#111",
  color: "#fff",
};

const savedButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: "#0a7f3f",
  color: "#fff",
};

const errorButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: "#b00020",
  color: "#fff",
};

const emptyStyle: React.CSSProperties = {
  padding: "24px",
  textAlign: "center",
  color: "#888",
};

"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SoloPlanAssignment = {
  id: string;
  plan_id: string;
  athlete_user_id: string;
  user_email: string | null;
  plan_name: string | null;
  created_at: string | null;
};

type ProgramTemplate = {
  id: string;
  name: string;
  discipline: string;
  plan_length_weeks: number;
  description: string | null;
};

type AssignmentFormData = {
  templateId: string;
  athleteUserId: string;
};

export default function AdminSoloPlanPage() {
  const router = useRouter();
  const supabase = createClient();

  const [assignments, setAssignments] = useState<SoloPlanAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [revokingIds, setRevokingIds] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<ProgramTemplate[]>([]);
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
  const [templatesSearch, setTemplatesSearch] = useState("");

  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<{ id: string; email: string }[]>([]);
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");

  const [formData, setFormData] = useState<AssignmentFormData>({
    templateId: "",
    athleteUserId: "",
  });
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  const [selectedUser, setSelectedUser] = useState<{ id: string; email: string } | null>(null);
  const [assigningPlan, setAssigningPlan] = useState(false);

  async function loadAssignments() {
    setLoading(true);
    setErrorMessage("");

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "solo_plan_holder");

    if (roleError) {
      setErrorMessage(`Could not load assignments: ${roleError.message}`);
      setLoading(false);
      return;
    }

    const soloPlanUserIds = (roleData || []).map((r) => r.user_id);
    if (soloPlanUserIds.length === 0) {
      setAssignments([]);
      setLoading(false);
      return;
    }

    const { data: plansData, error: plansError } = await supabase
      .from("athlete_plans")
      .select("id, name, athlete_user_id, created_at")
      .in("athlete_user_id", soloPlanUserIds)
      .order("created_at", { ascending: false });

    if (plansError) {
      setErrorMessage(`Could not load plans: ${plansError.message}`);
      setLoading(false);
      return;
    }

    const usersRes = await fetch("/api/admin/list-users");
    if (!usersRes.ok) {
      const { error } = await usersRes.json() as { error?: string };
      setErrorMessage(`Could not load users: ${error ?? usersRes.statusText}`);
      setLoading(false);
      return;
    }
    const { users: allUsers } = await usersRes.json() as { users: { id: string; email: string | null }[] };

    const emailMap = new Map(allUsers.map((u) => [u.id, u.email]));

    const assignmentList = (plansData || []).map((plan: Record<string, unknown>) => ({
      id: `${plan.id}`,
      plan_id: `${plan.id}`,
      athlete_user_id: `${plan.athlete_user_id}`,
      user_email: emailMap.get(`${plan.athlete_user_id}`) || null,
      plan_name: plan.name || null,
      created_at: plan.created_at || null,
    })) as SoloPlanAssignment[];

    setAssignments(assignmentList);
    setLoading(false);
  }

  async function loadTemplates() {
    const { data, error } = await supabase
      .from("program_templates")
      .select("id, name, discipline, plan_length_weeks, description")
      .eq("is_active", true)
      .order("name");

    if (!error && data) {
      setTemplates(data as ProgramTemplate[]);
      setFilteredTemplates(data as ProgramTemplate[]);
    }
  }

  async function loadUsers() {
    const res = await fetch("/api/admin/list-users");
    if (!res.ok) return;
    const { users: allUsers } = await res.json() as { users: { id: string; email: string | null }[] };

    const mappedUsers = allUsers.map((u) => ({ id: u.id, email: u.email ?? `user-${u.id.slice(0, 8)}` }));

    setUsers(mappedUsers);
    setFilteredUsers(mappedUsers);
  }

  useEffect(() => {
    void loadAssignments();
    void loadTemplates();
    void loadUsers();
  }, []);

  useEffect(() => {
    const query = templatesSearch.toLowerCase();
    if (query.length === 0) {
      setFilteredTemplates(templates);
    } else {
      setFilteredTemplates(
        templates.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            t.discipline.toLowerCase().includes(query)
        )
      );
    }
  }, [templatesSearch, templates]);

  useEffect(() => {
    const query = usersSearch.toLowerCase();
    if (query.length === 0) {
      setFilteredUsers(users);
    } else {
      setFilteredUsers(users.filter((u) => u.email.toLowerCase().includes(query)));
    }
  }, [usersSearch, users]);

  function selectTemplate(template: ProgramTemplate) {
    setSelectedTemplate(template);
    setFormData((prev) => ({
      ...prev,
      templateId: template.id,
    }));
    setTemplatesSearch(template.name);
    setShowTemplatesDropdown(false);
  }

  function selectUser(user: { id: string; email: string }) {
    setSelectedUser(user);
    setFormData((prev) => ({
      ...prev,
      athleteUserId: user.id,
    }));
    setUsersSearch(user.email);
    setShowUsersDropdown(false);
  }

  async function handleAssignPlan(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.templateId || !formData.athleteUserId || !selectedTemplate || !selectedUser) {
      setErrorMessage("Please select both a template and an athlete.");
      return;
    }

    setAssigningPlan(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      // Create a new athlete_plan from the template
      const planJson = generatePlanFromTemplate(selectedTemplate);

      const { data: planData, error: planError } = await supabase
        .from("athlete_plans")
        .insert({
          athlete_user_id: formData.athleteUserId,
          plan_json: planJson,
          status: "active",
          name: selectedTemplate.name,
          coach_user_id: null,
          source_program_template_id: formData.templateId,
        })
        .select("id")
        .single();

      if (planError) {
        setErrorMessage(`Could not create plan: ${planError.message}`);
        setAssigningPlan(false);
        return;
      }

      // Assign solo_plan_holder role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: formData.athleteUserId,
        role: "solo_plan_holder",
      });

      if (roleError && !roleError.message.includes("duplicate")) {
        setErrorMessage(`Could not assign role: ${roleError.message}`);
        setAssigningPlan(false);
        return;
      }

      setSuccessMessage(
        `Plan "${selectedTemplate.name}" assigned to ${selectedUser.email}. Plan ID: ${planData.id}`
      );
      setFormData({ templateId: "", athleteUserId: "" });
      setSelectedTemplate(null);
      setSelectedUser(null);
      setTemplatesSearch("");
      setUsersSearch("");
      await loadAssignments();
    } catch (err) {
      setErrorMessage(`Unexpected error: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    setAssigningPlan(false);
  }

  async function handleRevoke(assignment: SoloPlanAssignment) {
    const confirmed = window.confirm(
      `Revoke access to "${assignment.plan_name || "this plan"}" for ${assignment.user_email}?\n\nThe plan will be archived.`
    );
    if (!confirmed) return;

    setRevokingIds((prev) => new Set([...prev, assignment.id]));
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error: planError } = await supabase
        .from("athlete_plans")
        .update({ status: "archived" })
        .eq("id", assignment.plan_id);

      if (planError) {
        setErrorMessage(`Could not archive plan: ${planError.message}`);
      }

      const { error: roleError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", assignment.athlete_user_id)
        .eq("role", "solo_plan_holder");

      if (roleError) {
        setErrorMessage(`Could not remove role: ${roleError.message}`);
      }

      if (!planError && !roleError) {
        setSuccessMessage(`Access revoked for ${assignment.user_email}.`);
        setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
      }
    } catch (err) {
      setErrorMessage(`Unexpected error: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    setRevokingIds((prev) => {
      const next = new Set(prev);
      next.delete(assignment.id);
      return next;
    });
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Sell a Solo Plan</h1>
            <p style={subtitleStyle}>Assign pre-built plans to athletes without coaching.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={secondaryButtonStyle}>
            Back to Admin
          </button>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
        {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Assign a Plan to an Athlete</h2>
          <form onSubmit={handleAssignPlan} style={formStyle}>
            <div style={formGroupStyle}>
              <label htmlFor="templateSearch" style={labelStyle}>
                Program Template
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="templateSearch"
                  type="text"
                  value={templatesSearch}
                  onChange={(e) => setTemplatesSearch(e.target.value)}
                  onFocus={() => setShowTemplatesDropdown(true)}
                  placeholder="Search templates..."
                  style={inputStyle}
                />
                {showTemplatesDropdown && (
                  <div style={dropdownMenuStyle}>
                    {filteredTemplates.length === 0 ? (
                      <div style={{ padding: "0.75rem", color: "#999", fontSize: "0.9rem" }}>
                        {templates.length === 0
                          ? "No templates available"
                          : "No matching templates"}
                      </div>
                    ) : (
                      filteredTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => selectTemplate(template)}
                          style={dropdownItemStyle(selectedTemplate?.id === template.id)}
                        >
                          <div style={{ fontWeight: "500", color: "#1f2937" }}>
                            {template.name}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
                            {template.discipline} • {template.plan_length_weeks}w
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedTemplate && (
                <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" }}>
                  Selected: <strong>{selectedTemplate.name}</strong>
                </div>
              )}
            </div>

            <div style={formGroupStyle}>
              <label htmlFor="userSearch" style={labelStyle}>
                Athlete
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="userSearch"
                  type="text"
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  onFocus={() => setShowUsersDropdown(true)}
                  placeholder="Search athletes..."
                  style={inputStyle}
                />
                {showUsersDropdown && (
                  <div style={dropdownMenuStyle}>
                    {filteredUsers.length === 0 ? (
                      <div style={{ padding: "0.75rem", color: "#999", fontSize: "0.9rem" }}>
                        {users.length === 0 ? "No athletes found" : "No matching athletes"}
                      </div>
                    ) : (
                      filteredUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => selectUser(user)}
                          style={dropdownItemStyle(selectedUser?.id === user.id)}
                        >
                          <div style={{ fontWeight: "500", color: "#1f2937" }}>
                            {user.email}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
                            ID: {user.id.slice(0, 8)}...
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.5rem" }}>
                  Selected: <strong>{selectedUser.email}</strong>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={assigningPlan}
              style={primaryButtonStyle}
            >
              {assigningPlan ? "Assigning..." : "Assign Plan"}
            </button>
          </form>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Active Solo Plan Assignments</h2>
          {loading ? (
            <p style={helperStyle}>Loading assignments...</p>
          ) : assignments.length === 0 ? (
            <p style={helperStyle}>No active solo plan assignments yet.</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Athlete Email</th>
                    <th style={thStyle}>Plan Name</th>
                    <th style={thStyle}>Assigned</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td style={tdStyle}>{assignment.user_email || "(unknown)"}</td>
                      <td style={tdStyle}>{assignment.plan_name || "(unnamed)"}</td>
                      <td style={tdStyle}>
                        {assignment.created_at
                          ? new Date(assignment.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => void handleRevoke(assignment)}
                          disabled={revokingIds.has(assignment.id)}
                          style={dangerButtonStyle}
                        >
                          {revokingIds.has(assignment.id) ? "Revoking..." : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function generatePlanFromTemplate(template: ProgramTemplate): Record<string, unknown> {
  const cyclesArray = [];
  const weeksPerCycle = Math.ceil(template.plan_length_weeks / 1);

  for (let w = 0; w < template.plan_length_weeks; w++) {
    cyclesArray.push({
      weekNumber: w + 1,
      focus: null,
      sessions: [],
    });
  }

  return {
    weeks: cyclesArray,
    totalWeeks: template.plan_length_weeks,
    templateId: template.id,
    createdAt: new Date().toISOString(),
  };
}

function dropdownItemStyle(isSelected: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    padding: "0.75rem",
    textAlign: "left",
    background: isSelected ? "#e0e7ff" : "#fff",
    border: "none",
    borderBottom: "1px solid #f3f4f6",
    cursor: "pointer",
    fontSize: "0.9rem",
  };
}

// Styles
const dropdownMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #d1d5db",
  borderTop: "none",
  borderRadius: "0 0 4px 4px",
  maxHeight: "300px",
  overflowY: "auto",
  zIndex: 10,
};

const pageStyle: React.CSSProperties = {
  padding: "2rem",
  background: "#f9fafb",
  minHeight: "100vh",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1200px",
  margin: "0 auto",
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: "2rem",
};

const titleStyle: React.CSSProperties = {
  fontSize: "2rem",
  fontWeight: "700",
  margin: "0 0 0.5rem 0",
  color: "#111",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  color: "#666",
  margin: "0",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e5e5",
  borderRadius: "8px",
  padding: "1.5rem",
  marginBottom: "1.5rem",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: "600",
  margin: "0 0 1rem 0",
  color: "#1f2937",
};

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};

const formGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const formRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "1rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: "600",
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  padding: "0.625rem",
  fontSize: "0.95rem",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  fontFamily: "inherit",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  background: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  fontSize: "1rem",
  fontWeight: "600",
  cursor: "pointer",
  transition: "background 0.2s",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  background: "#e5e7eb",
  color: "#1f2937",
  border: "none",
  borderRadius: "4px",
  fontSize: "1rem",
  fontWeight: "600",
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "0.5rem 1rem",
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  fontSize: "0.9rem",
  fontWeight: "600",
  cursor: "pointer",
};

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.95rem",
};

const thStyle: React.CSSProperties = {
  padding: "0.75rem",
  textAlign: "left",
  borderBottom: "2px solid #e5e7eb",
  fontWeight: "600",
  color: "#374151",
  background: "#f9fafb",
};

const tdStyle: React.CSSProperties = {
  padding: "0.75rem",
  borderBottom: "1px solid #e5e7eb",
  color: "#6b7280",
};

const errorStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "#fee",
  color: "#c00",
  borderRadius: "4px",
  marginBottom: "1rem",
  fontSize: "0.95rem",
};

const successStyle: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "#efe",
  color: "#070",
  borderRadius: "4px",
  marginBottom: "1rem",
  fontSize: "0.95rem",
};

const helperStyle: React.CSSProperties = {
  padding: "1rem",
  color: "#666",
  textAlign: "center",
  fontSize: "0.95rem",
};

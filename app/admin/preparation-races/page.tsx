"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type PreparationRace = {
  id: string;
  name: string;
  event_date: string | null;
  distance_km: number | null;
  event_type: string | null;
  location: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

type EditingRace = {
  id: string;
  name: string;
  event_date: string;
  distance_km: string;
  event_type: string;
  location: string;
  description: string;
  is_active: boolean;
};

export default function AdminPreparationRacesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [races, setRaces] = useState<PreparationRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<EditingRace | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRace, setNewRace] = useState<Omit<EditingRace, "id">>({
    name: "",
    event_date: "",
    distance_km: "",
    event_type: "",
    location: "",
    description: "",
    is_active: true,
  });

  async function loadRaces() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("preparation_races")
      .select("id, name, event_date, distance_km, event_type, location, description, is_active, created_at")
      .order("event_date", { ascending: false });

    if (error) {
      setErrorMessage(`Could not load races: ${error.message}`);
    } else {
      setRaces((data || []) as PreparationRace[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadRaces();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return races;
    return races.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.location || "").toLowerCase().includes(query) ||
        (r.event_type || "").toLowerCase().includes(query),
    );
  }, [races, search]);

  async function handleCreate() {
    if (!newRace.name.trim()) {
      setErrorMessage("Race name is required");
      return;
    }
    if (!newRace.event_date) {
      setErrorMessage("Event date is required");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.from("preparation_races").insert([
      {
        name: newRace.name,
        event_date: newRace.event_date,
        distance_km: newRace.distance_km ? parseFloat(newRace.distance_km) : null,
        event_type: newRace.event_type || null,
        location: newRace.location || null,
        description: newRace.description || null,
        is_active: newRace.is_active,
      },
    ]);

    if (error) {
      setErrorMessage(`Could not create race: ${error.message}`);
    } else {
      setSuccessMessage("Race created successfully");
      setNewRace({
        name: "",
        event_date: "",
        distance_km: "",
        event_type: "",
        location: "",
        description: "",
        is_active: true,
      });
      setShowCreateForm(false);
      await loadRaces();
    }
  }

  function startEdit(race: PreparationRace) {
    setEditingId(race.id);
    setEditingData({
      id: race.id,
      name: race.name,
      event_date: race.event_date || "",
      distance_km: race.distance_km ? String(race.distance_km) : "",
      event_type: race.event_type || "",
      location: race.location || "",
      description: race.description || "",
      is_active: race.is_active,
    });
  }

  async function handleSaveEdit() {
    if (!editingData) return;
    if (!editingData.name.trim()) {
      setErrorMessage("Race name is required");
      return;
    }
    if (!editingData.event_date) {
      setErrorMessage("Event date is required");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("preparation_races")
      .update({
        name: editingData.name,
        event_date: editingData.event_date,
        distance_km: editingData.distance_km ? parseFloat(editingData.distance_km) : null,
        event_type: editingData.event_type || null,
        location: editingData.location || null,
        description: editingData.description || null,
        is_active: editingData.is_active,
      })
      .eq("id", editingData.id);

    if (error) {
      setErrorMessage(`Could not update race: ${error.message}`);
    } else {
      setSuccessMessage("Race updated successfully");
      setEditingId(null);
      setEditingData(null);
      await loadRaces();
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingData(null);
  }

  async function handleDelete(id: string) {
    const race = races.find((r) => r.id === id);
    if (!race) return;

    const confirmed = window.confirm(
      `Permanently delete "${race.name}"?\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("preparation_races")
      .delete()
      .eq("id", id);

    if (error) {
      setErrorMessage(`Could not delete race: ${error.message}`);
    } else {
      setSuccessMessage(`"${race.name}" deleted`);
      await loadRaces();
    }
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerRowStyle}>
          <div>
            <h1 style={titleStyle}>Preparation Races</h1>
            <p style={subtitleStyle}>Manage races used for training and preparation.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} style={secondaryButtonStyle}>
            Back to Admin
          </button>
        </div>

        {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
        {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>All Races</h2>
              <p style={sectionSubtitleStyle}>Stored in <code>public.preparation_races</code></p>
            </div>
            <div style={countStyle}>{filtered.length} shown</div>
          </div>

          <div style={topRowStyle}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, location, type..."
              style={searchInputStyle}
            />
            <button
              type="button"
              onClick={() => setShowCreateForm(!showCreateForm)}
              style={primaryButtonStyle}
            >
              {showCreateForm ? "Cancel" : "+ New Race"}
            </button>
          </div>

          {showCreateForm && (
            <div style={formCardStyle}>
              <h3 style={formTitleStyle}>Create New Race</h3>
              <div style={formGridStyle}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Race Name *</label>
                  <input
                    type="text"
                    value={newRace.name}
                    onChange={(e) => setNewRace({ ...newRace, name: e.target.value })}
                    placeholder="e.g., Spring Marathon"
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Event Date *</label>
                  <input
                    type="date"
                    value={newRace.event_date}
                    onChange={(e) => setNewRace({ ...newRace, event_date: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newRace.distance_km}
                    onChange={(e) => setNewRace({ ...newRace, distance_km: e.target.value })}
                    placeholder="e.g., 42.2"
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Event Type</label>
                  <input
                    type="text"
                    value={newRace.event_type}
                    onChange={(e) => setNewRace({ ...newRace, event_type: e.target.value })}
                    placeholder="e.g., Marathon, 10K, Trail"
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Location</label>
                  <input
                    type="text"
                    value={newRace.location}
                    onChange={(e) => setNewRace({ ...newRace, location: e.target.value })}
                    placeholder="e.g., City Name"
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Active</label>
                  <div style={checkboxStyle}>
                    <input
                      type="checkbox"
                      checked={newRace.is_active}
                      onChange={(e) => setNewRace({ ...newRace, is_active: e.target.checked })}
                    />
                    <span>This race is available for selection</span>
                  </div>
                </div>
                <div style={{ ...formGroupStyle, gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={newRace.description}
                    onChange={(e) => setNewRace({ ...newRace, description: e.target.value })}
                    placeholder="Optional notes..."
                    style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
                  />
                </div>
              </div>
              <div style={formActionsStyle}>
                <button
                  type="button"
                  onClick={() => handleCreate()}
                  style={primaryButtonStyle}
                >
                  Create Race
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRace({
                      name: "",
                      event_date: "",
                      distance_km: "",
                      event_type: "",
                      location: "",
                      description: "",
                      is_active: true,
                    });
                  }}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p style={helperStyle}>Loading races...</p>
          ) : filtered.length === 0 ? (
            <p style={helperStyle}>{search ? "No races found." : "No races yet. Create one to get started."}</p>
          ) : (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Race Name</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Distance</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Location</th>
                    <th style={thStyle}>Active</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((race) =>
                    editingId === race.id && editingData ? (
                      <tr key={race.id} style={editingRowStyle}>
                        <td style={tdStyle} colSpan={7}>
                          <div style={editFormStyle}>
                            <div style={editGridStyle}>
                              <div style={editGroupStyle}>
                                <label style={labelStyle}>Race Name</label>
                                <input
                                  type="text"
                                  value={editingData.name}
                                  onChange={(e) => setEditingData({ ...editingData, name: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={editGroupStyle}>
                                <label style={labelStyle}>Event Date</label>
                                <input
                                  type="date"
                                  value={editingData.event_date}
                                  onChange={(e) => setEditingData({ ...editingData, event_date: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={editGroupStyle}>
                                <label style={labelStyle}>Distance (km)</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={editingData.distance_km}
                                  onChange={(e) => setEditingData({ ...editingData, distance_km: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={editGroupStyle}>
                                <label style={labelStyle}>Event Type</label>
                                <input
                                  type="text"
                                  value={editingData.event_type}
                                  onChange={(e) => setEditingData({ ...editingData, event_type: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={editGroupStyle}>
                                <label style={labelStyle}>Location</label>
                                <input
                                  type="text"
                                  value={editingData.location}
                                  onChange={(e) => setEditingData({ ...editingData, location: e.target.value })}
                                  style={inputStyle}
                                />
                              </div>
                              <div style={editGroupStyle}>
                                <label style={labelStyle}>Active</label>
                                <div style={checkboxStyle}>
                                  <input
                                    type="checkbox"
                                    checked={editingData.is_active}
                                    onChange={(e) => setEditingData({ ...editingData, is_active: e.target.checked })}
                                  />
                                  <span>Available for selection</span>
                                </div>
                              </div>
                              <div style={{ ...editGroupStyle, gridColumn: "1 / -1" }}>
                                <label style={labelStyle}>Description</label>
                                <textarea
                                  value={editingData.description}
                                  onChange={(e) => setEditingData({ ...editingData, description: e.target.value })}
                                  style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
                                />
                              </div>
                            </div>
                            <div style={editActionsStyle}>
                              <button type="button" onClick={() => void handleSaveEdit()} style={primaryButtonStyle}>
                                Save
                              </button>
                              <button type="button" onClick={cancelEdit} style={secondaryButtonStyle}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={race.id}>
                        <td style={tdStyle}>
                          <div style={primaryCellStyle}>{race.name}</div>
                        </td>
                        <td style={tdStyle}>
                          {race.event_date ? new Date(race.event_date).toLocaleDateString("en-GB") : "—"}
                        </td>
                        <td style={tdStyle}>
                          {race.distance_km ? `${race.distance_km} km` : "—"}
                        </td>
                        <td style={tdStyle}>{race.event_type || "—"}</td>
                        <td style={tdStyle}>{race.location || "—"}</td>
                        <td style={tdStyle}>
                          <span style={race.is_active ? activeBadgeStyle : inactiveBadgeStyle}>
                            {race.is_active ? "Yes" : "No"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={actionRowStyle}>
                            <button
                              type="button"
                              onClick={() => startEdit(race)}
                              style={smallButtonStyle}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(race.id)}
                              style={deleteButtonStyle}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", background: "#f9f9f9", padding: "40px 24px" };
const containerStyle: React.CSSProperties = { maxWidth: "1200px", margin: "0 auto" };
const headerRowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px", gap: "16px", flexWrap: "wrap" };
const titleStyle: React.CSSProperties = { margin: 0, fontSize: "28px", fontWeight: 700 };
const subtitleStyle: React.CSSProperties = { margin: "8px 0 0", color: "#666", fontSize: "15px" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: "12px", border: "1px solid #e5e5e5", padding: "24px" };
const sectionHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: "18px", fontWeight: 600 };
const sectionSubtitleStyle: React.CSSProperties = { margin: 0, color: "#666", fontSize: "14px" };
const countStyle: React.CSSProperties = { fontSize: "14px", color: "#666" };
const topRowStyle: React.CSSProperties = { display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" };
const searchInputStyle: React.CSSProperties = { flex: 1, minWidth: "200px", padding: "10px 12px", border: "1px solid #ccc", borderRadius: "8px", fontSize: "14px" };
const primaryButtonStyle: React.CSSProperties = { padding: "10px 16px", border: "none", borderRadius: "8px", background: "#0066cc", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "14px" };
const secondaryButtonStyle: React.CSSProperties = { padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "14px" };
const deleteButtonStyle: React.CSSProperties = { padding: "6px 12px", border: "1px solid #f5c6cb", borderRadius: "6px", background: "#fff", color: "#b00020", fontWeight: 600, cursor: "pointer", fontSize: "12px" };
const smallButtonStyle: React.CSSProperties = { padding: "6px 12px", border: "1px solid #ccc", borderRadius: "6px", background: "#fff", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "12px" };
const formCardStyle: React.CSSProperties = { background: "#f5f5f5", border: "1px solid #ddd", borderRadius: "8px", padding: "20px", marginBottom: "20px" };
const formTitleStyle: React.CSSProperties = { margin: 0, fontSize: "16px", fontWeight: 600, marginBottom: "16px" };
const formGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "16px" };
const formGroupStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };
const editFormStyle: React.CSSProperties = { padding: "16px", background: "#f5f5f5", borderRadius: "8px" };
const editGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "12px" };
const editGroupStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };
const labelStyle: React.CSSProperties = { fontSize: "13px", fontWeight: 600, marginBottom: "6px", color: "#333" };
const inputStyle: React.CSSProperties = { padding: "8px 10px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "14px" };
const checkboxStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" };
const formActionsStyle: React.CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const editActionsStyle: React.CSSProperties = { display: "flex", gap: "10px", marginTop: "12px" };
const tableWrapStyle: React.CSSProperties = { overflowX: "auto" };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px", borderBottom: "1px solid #ddd", fontSize: "14px", fontWeight: 600, background: "#fafafa" };
const tdStyle: React.CSSProperties = { padding: "12px", borderBottom: "1px solid #eee", verticalAlign: "top", fontSize: "14px" };
const primaryCellStyle: React.CSSProperties = { fontWeight: 600 };
const editingRowStyle: React.CSSProperties = { background: "#f5f5f5" };
const helperStyle: React.CSSProperties = { color: "#666", fontSize: "14px" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px" };
const successStyle: React.CSSProperties = { color: "#2e7d32", marginBottom: "16px" };
const activeBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: "12px", background: "#e8f5e9", color: "#2e7d32", fontSize: "12px", fontWeight: 500 };
const inactiveBadgeStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: "12px", background: "#f5f5f5", color: "#999", fontSize: "12px", fontWeight: 500 };
const actionRowStyle: React.CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap" };

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StretchOption = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementTags: string[];
  equipment: string[];
};

type SelectedStretch = {
  id: string;
  stretchId: string;
  name: string;
  sortOrder: number;
  holdDurationSeconds: number | null;
  notes: string;
  equipment: string[];
};

type StretchRow = {
  id: string;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_tags: string[];
  equipment: string[];
};

const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"];
const FOCUS_AREAS = ["flexibility", "mobility", "recovery", "warm-up", "cool-down", "active recovery"];

export default function CreateMobilitySessionPage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("beginner");
  const [selectedFocusAreas, setSelectedFocusAreas] = useState<string[]>([]);

  const [stretchSearch, setStretchSearch] = useState("");
  const [allStretches, setAllStretches] = useState<StretchOption[]>([]);
  const [selectedStretches, setSelectedStretches] = useState<SelectedStretch[]>([]);
  const [loadingStretches, setLoadingStretches] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadStretches() {
      setLoadingStretches(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("stretches")
        .select("id, name, primary_muscles, secondary_muscles, movement_tags, equipment")
        .order("name", { ascending: true });

      if (error) {
        setErrorMessage(`Could not load stretches: ${error.message}`);
      } else {
        const stretches = (data || []) as StretchRow[];
        setAllStretches(
          stretches.map((s) => ({
            id: s.id,
            name: s.name,
            primaryMuscles: s.primary_muscles || [],
            secondaryMuscles: s.secondary_muscles || [],
            movementTags: s.movement_tags || [],
            equipment: s.equipment || [],
          })),
        );
      }

      setLoadingStretches(false);
    }

    loadStretches();
  }, [supabase]);

  const filteredStretches = useMemo(() => {
    const query = stretchSearch.trim().toLowerCase();

    return allStretches
      .filter((stretch) => !selectedStretches.some((selected) => selected.stretchId === stretch.id))
      .filter((stretch) => {
        if (!query) return false;
        return (
          stretch.name.toLowerCase().includes(query) ||
          stretch.primaryMuscles.some((m) => m.toLowerCase().includes(query)) ||
          stretch.secondaryMuscles.some((m) => m.toLowerCase().includes(query)) ||
          stretch.movementTags.some((t) => t.toLowerCase().includes(query))
        );
      })
      .slice(0, 10);
  }, [allStretches, stretchSearch, selectedStretches]);

  function addStretch(stretch: StretchOption) {
    const newStretch: SelectedStretch = {
      id: `stretch-${Date.now()}-${Math.random()}`,
      stretchId: stretch.id,
      name: stretch.name,
      sortOrder: selectedStretches.length + 1,
      holdDurationSeconds: null,
      notes: "",
      equipment: stretch.equipment,
    };
    setSelectedStretches([...selectedStretches, newStretch]);
    setStretchSearch("");
  }

  function removeStretch(stretchId: string) {
    setSelectedStretches((current) => {
      const filtered = current.filter((s) => s.id !== stretchId);
      return filtered.map((s, index) => ({ ...s, sortOrder: index + 1 }));
    });
  }

  function updateStretchHoldDuration(stretchId: string, duration: string) {
    setSelectedStretches((current) =>
      current.map((s) =>
        s.id === stretchId ? { ...s, holdDurationSeconds: duration ? parseInt(duration) : null } : s,
      ),
    );
  }

  function updateStretchNotes(stretchId: string, notes: string) {
    setSelectedStretches((current) =>
      current.map((s) => (s.id === stretchId ? { ...s, notes } : s)),
    );
  }

  function moveStretch(stretchId: string, direction: "up" | "down") {
    const index = selectedStretches.findIndex((s) => s.id === stretchId);
    if (index === -1) return;

    if (direction === "up" && index > 0) {
      const newStretches = [...selectedStretches];
      [newStretches[index], newStretches[index - 1]] = [newStretches[index - 1], newStretches[index]];
      setSelectedStretches(newStretches.map((s, i) => ({ ...s, sortOrder: i + 1 })));
    } else if (direction === "down" && index < selectedStretches.length - 1) {
      const newStretches = [...selectedStretches];
      [newStretches[index], newStretches[index + 1]] = [newStretches[index + 1], newStretches[index]];
      setSelectedStretches(newStretches.map((s, i) => ({ ...s, sortOrder: i + 1 })));
    }
  }

  function toggleFocusArea(area: string) {
    setSelectedFocusAreas((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!name.trim()) {
      setErrorMessage("Please enter a session name.");
      setSaving(false);
      return;
    }

    if (selectedStretches.length === 0) {
      setErrorMessage("Please add at least one stretch to the session.");
      setSaving(false);
      return;
    }

    const id = makeSessionId(name);

    // Check if any selected stretch has equipment
    const hasEquipment = selectedStretches.some((stretch) => {
      const stretchData = allStretches.find((s) => s.id === stretch.stretchId);
      return stretchData && stretchData.equipment.length > 0;
    });

    const tags = hasEquipment ? ["equipment-required"] : [];

    const sessionPayload = {
      id,
      name: name.trim(),
      description: description.trim(),
      duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
      difficulty_level: difficultyLevel,
      focus_areas: selectedFocusAreas,
      tags,
    };

    const { error: sessionError } = await supabase.from("mobility_sessions").insert(sessionPayload);

    if (sessionError) {
      if (sessionError.message.toLowerCase().includes("duplicate")) {
        setErrorMessage("A session with this name already exists.");
      } else {
        setErrorMessage(`Could not create session: ${sessionError.message}`);
      }
      setSaving(false);
      return;
    }

    const stretchPayloads = selectedStretches.map((stretch) => ({
      id: `mobility_stretch_${Date.now()}_${stretch.id}`,
      mobility_session_id: id,
      stretch_id: stretch.stretchId,
      sort_order: stretch.sortOrder,
      hold_duration_seconds: stretch.holdDurationSeconds,
      notes: stretch.notes || null,
    }));

    const { error: stretchError } = await supabase.from("mobility_session_stretches").insert(stretchPayloads);

    if (stretchError) {
      setErrorMessage(`Could not add stretches: ${stretchError.message}`);
      setSaving(false);
      return;
    }

    setSuccessMessage("Mobility session created successfully!");
    setName("");
    setDescription("");
    setDurationMinutes("");
    setDifficultyLevel("beginner");
    setSelectedFocusAreas([]);
    setSelectedStretches([]);
    setSaving(false);

    setTimeout(() => {
      router.push("/coach/mobility-sessions");
    }, 1500);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Create Mobility Session</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="name" style={labelStyle}>
            Session Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={inputStyle}
            placeholder="e.g., Full Body Flexibility, Hip Mobility Routine"
            required
          />

          <label htmlFor="description" style={labelStyle}>
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            style={textareaStyle}
            placeholder="Describe the purpose and benefits of this session..."
          />

          <div style={rowStyle}>
            <div style={colStyle}>
              <label htmlFor="duration" style={labelStyle}>
                Duration (minutes)
              </label>
              <input
                id="duration"
                type="number"
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                style={inputStyle}
                placeholder="e.g., 15, 30"
                min="1"
              />
            </div>

            <div style={colStyle}>
              <label htmlFor="difficulty" style={labelStyle}>
                Difficulty Level
              </label>
              <select value={difficultyLevel} onChange={(event) => setDifficultyLevel(event.target.value)} style={inputStyle}>
                {DIFFICULTY_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label style={labelStyle}>Focus Areas</label>
          <div style={focusAreasStyle}>
            {FOCUS_AREAS.map((area) => (
              <label key={area} style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={selectedFocusAreas.includes(area)}
                  onChange={() => toggleFocusArea(area)}
                  style={checkboxStyle}
                />
                {area.charAt(0).toUpperCase() + area.slice(1).replace("-", " ")}
              </label>
            ))}
          </div>

          <label htmlFor="stretch-search" style={labelStyle}>
            Add Stretches
          </label>
          <div style={pickerWrapStyle}>
            <input
              id="stretch-search"
              value={stretchSearch}
              onChange={(event) => setStretchSearch(event.target.value)}
              placeholder="Search stretches by name or muscle group..."
              style={inputStyle}
            />
            {stretchSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingStretches ? (
                  <div style={dropdownMessageStyle}>Loading stretches...</div>
                ) : filteredStretches.length > 0 ? (
                  filteredStretches.map((stretch) => (
                    <button
                      key={stretch.id}
                      type="button"
                      onClick={() => addStretch(stretch)}
                      style={dropdownItemStyle}
                    >
                      <div style={{ fontWeight: 600 }}>{stretch.name}</div>
                      <div style={dropdownMetaStyle}>
                        {stretch.primaryMuscles.join(", ")}
                      </div>
                    </button>
                  ))
                ) : (
                  <div style={dropdownMessageStyle}>No matching stretches found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div style={selectedSectionStyle}>
            <div style={selectedHeaderStyle}>
              <h3 style={selectedTitleStyle}>Selected Stretches ({selectedStretches.length})</h3>
            </div>

            {selectedStretches.length === 0 ? (
              <p style={helperStyle}>No stretches added yet. Search and add stretches above.</p>
            ) : (
              <div style={stretchListContainerStyle}>
                {selectedStretches.map((stretch, index) => (
                  <div key={stretch.id} style={stretchItemStyle}>
                    <div style={stretchItemHeaderStyle}>
                      <span style={stretchOrderStyle}>{index + 1}</span>
                      <div style={stretchNameWithEquipmentStyle}>
                        <span style={stretchNameInListStyle}>{stretch.name}</span>
                        {stretch.equipment.length > 0 && (
                          <div style={equipmentBadgesStyle}>
                            {stretch.equipment.map((equip) => (
                              <span key={equip} style={equipmentBadgeStyle}>
                                {equip}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={stretchItemButtonsStyle}>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => moveStretch(stretch.id, "up")}
                            style={moveButtonStyle}
                            title="Move up"
                          >
                            ↑
                          </button>
                        )}
                        {index < selectedStretches.length - 1 && (
                          <button
                            type="button"
                            onClick={() => moveStretch(stretch.id, "down")}
                            style={moveButtonStyle}
                            title="Move down"
                          >
                            ↓
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeStretch(stretch.id)}
                          style={removeButtonStyle}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div style={stretchDetailsStyle}>
                      <div style={stretchDetailColStyle}>
                        <label style={detailLabelStyle}>Hold Duration (seconds)</label>
                        <input
                          type="number"
                          value={stretch.holdDurationSeconds || ""}
                          onChange={(e) => updateStretchHoldDuration(stretch.id, e.target.value)}
                          style={detailInputStyle}
                          placeholder="e.g., 30"
                          min="1"
                        />
                      </div>

                      <div style={stretchDetailColStyle}>
                        <label style={detailLabelStyle}>Notes</label>
                        <input
                          type="text"
                          value={stretch.notes}
                          onChange={(e) => updateStretchNotes(stretch.id, e.target.value)}
                          style={detailInputStyle}
                          placeholder="e.g., Feel the stretch in hamstrings"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
          {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

          <div style={buttonRowStyle}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Creating..." : "Create Mobility Session"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/coach/mobility-sessions")}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function makeSessionId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Styles
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "32px 24px",
  background: "#f5f5f5",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "800px",
  background: "#ffffff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const titleStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "24px",
  fontSize: "28px",
  fontWeight: 700,
  color: "#111827",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontWeight: 600,
  color: "#374151",
  fontSize: "14px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  marginBottom: "16px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  marginBottom: "16px",
  fontSize: "14px",
  boxSizing: "border-box",
  resize: "vertical",
};

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "16px",
};

const colStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const focusAreasStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "12px",
  marginBottom: "16px",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "14px",
  cursor: "pointer",
  color: "#374151",
};

const checkboxStyle: React.CSSProperties = {
  cursor: "pointer",
};

const pickerWrapStyle: React.CSSProperties = {
  position: "relative",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% - 8px)",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
  zIndex: 20,
  overflow: "hidden",
  maxHeight: "300px",
  overflowY: "auto",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  border: "none",
  borderBottom: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
  fontSize: "14px",
};

const dropdownMetaStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  marginTop: "2px",
};

const dropdownMessageStyle: React.CSSProperties = {
  padding: "12px",
  color: "#6b7280",
  fontSize: "14px",
  textAlign: "center",
};

const selectedSectionStyle: React.CSSProperties = {
  marginBottom: "16px",
  padding: "16px",
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  border: "1px solid #e5e7eb",
};

const selectedHeaderStyle: React.CSSProperties = {
  marginBottom: "12px",
};

const selectedTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "14px",
  fontWeight: 600,
  color: "#374151",
};

const helperStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "13px",
  color: "#6b7280",
  fontStyle: "italic",
};

const stretchListContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const stretchItemStyle: React.CSSProperties = {
  backgroundColor: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: "4px",
  padding: "12px",
};

const stretchItemHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "8px",
};

const stretchOrderStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  backgroundColor: "#e5e7eb",
  color: "#374151",
  fontSize: "12px",
  fontWeight: 600,
  flexShrink: 0,
};

const stretchNameWithEquipmentStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const stretchNameInListStyle: React.CSSProperties = {
  fontWeight: 500,
  color: "#111827",
  fontSize: "14px",
};

const equipmentBadgesStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  flexWrap: "wrap",
};

const equipmentBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  backgroundColor: "#dbeafe",
  color: "#1e40af",
  borderRadius: "3px",
  fontSize: "10px",
  fontWeight: 600,
};

const stretchItemButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
};

const moveButtonStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "12px",
  border: "1px solid #d1d5db",
  backgroundColor: "#fff",
  borderRadius: "4px",
  cursor: "pointer",
  color: "#6b7280",
};

const removeButtonStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "12px",
  border: "1px solid #fca5a5",
  backgroundColor: "#fff",
  borderRadius: "4px",
  cursor: "pointer",
  color: "#dc2626",
};

const stretchDetailsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
};

const stretchDetailColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const detailLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#6b7280",
  marginBottom: "4px",
};

const detailInputStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: "12px",
  border: "1px solid #e5e7eb",
  borderRadius: "4px",
  width: "100%",
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  marginBottom: "16px",
  padding: "12px",
  backgroundColor: "#ffebee",
  borderRadius: "6px",
  fontSize: "14px",
};

const successStyle: React.CSSProperties = {
  color: "#0a7f3f",
  marginBottom: "16px",
  padding: "12px",
  backgroundColor: "#ecfdf5",
  borderRadius: "6px",
  fontSize: "14px",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  marginTop: "24px",
};

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 16px",
  border: "none",
  borderRadius: "6px",
  background: "#111111",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "14px",
};

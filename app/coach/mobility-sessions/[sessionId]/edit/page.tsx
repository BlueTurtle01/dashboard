"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StretchOption = {
  id: string;
  name: string;
  description: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementTags: string[];
  equipment: string[];
};

type SelectedStretch = {
  id: string; // junction row id (existing) or temp id (new)
  stretchId: string;
  name: string;
  sortOrder: number;
  holdDurationSeconds: number | null;
  notes: string;
  isNew?: boolean; // true if not yet saved
};

type StretchRow = {
  id: string;
  name: string;
  description: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_tags: string[];
  equipment: string[];
};

type SessionTemplateOption = {
  id: string;
  name: string;
  type: "functional" | "gym";
};

type PairedSession = {
  id: string;
  sessionTemplateId: string;
  templateName: string;
  templateType: "functional" | "gym";
  autoAddEnabled: boolean;
};

const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"];
const FOCUS_AREAS = ["flexibility", "mobility", "recovery", "warm-up", "cool-down", "active recovery"];

export default function EditMobilitySessionPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
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
  const [loadingSession, setLoadingSession] = useState(true);

  const [sessionTemplateSearch, setSessionTemplateSearch] = useState("");
  const [allSessionTemplates, setAllSessionTemplates] = useState<SessionTemplateOption[]>([]);
  const [pairedSessions, setPairedSessions] = useState<PairedSession[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoadingSession(true);
      setLoadingStretches(true);
      setLoadingTemplates(true);
      setErrorMessage("");

      const [sessionResult, stretchesResult, junctionResult, templatesResult, pairsResult] = await Promise.all([
        supabase
          .from("mobility_sessions")
          .select("id, name, description, duration_minutes, difficulty_level, focus_areas, tags")
          .eq("id", sessionId)
          .single(),
        supabase
          .from("stretches")
          .select("id, name, description, primary_muscles, secondary_muscles, movement_tags, equipment")
          .order("name"),
        supabase
          .from("mobility_session_stretches")
          .select("id, stretch_id, sort_order, hold_duration_seconds, notes, stretches(id, name)")
          .eq("mobility_session_id", sessionId)
          .order("sort_order"),
        supabase
          .from("session_templates")
          .select("id, name, type")
          .order("type, name"),
        supabase
          .from("mobility_session_pairs")
          .select("id, session_template_id, auto_add_enabled, session_templates(name, type)")
          .eq("mobility_session_id", sessionId),
      ]);

      if (sessionResult.error) {
        setErrorMessage(`Could not load session: ${sessionResult.error.message}`);
        setLoadingSession(false);
        setLoadingStretches(false);
        setLoadingTemplates(false);
        return;
      }

      const s = sessionResult.data;
      setName(s.name ?? "");
      setDescription(s.description ?? "");
      setDurationMinutes(s.duration_minutes ? String(s.duration_minutes) : "");
      setDifficultyLevel(s.difficulty_level ?? "beginner");
      setSelectedFocusAreas(s.focus_areas ?? []);
      setLoadingSession(false);

      if (stretchesResult.data) {
        setAllStretches(
          (stretchesResult.data as StretchRow[]).map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description ?? "",
            primaryMuscles: r.primary_muscles ?? [],
            secondaryMuscles: r.secondary_muscles ?? [],
            movementTags: r.movement_tags ?? [],
            equipment: r.equipment ?? [],
          })),
        );
      }
      setLoadingStretches(false);

      if (junctionResult.data) {
        setSelectedStretches(
          junctionResult.data.map((row: any) => ({
            id: row.id,
            stretchId: row.stretch_id,
            name: row.stretches?.name ?? row.stretch_id,
            sortOrder: row.sort_order,
            holdDurationSeconds: row.hold_duration_seconds ?? null,
            notes: row.notes ?? "",
          })),
        );
      }

      if (templatesResult.data) {
        setAllSessionTemplates(
          (templatesResult.data as any[]).map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
          })),
        );
      }
      setLoadingTemplates(false);

      if (pairsResult.data) {
        setPairedSessions(
          (pairsResult.data as any[]).map((row) => ({
            id: row.id,
            sessionTemplateId: row.session_template_id,
            templateName: row.session_templates?.name ?? "Unknown",
            templateType: row.session_templates?.type ?? "functional",
            autoAddEnabled: row.auto_add_enabled ?? false,
          })),
        );
      }
    }

    loadData();
  }, [sessionId]);

  const filteredStretches = useMemo(() => {
    const query = stretchSearch.trim().toLowerCase();
    return allStretches
      .filter((s) => !selectedStretches.some((sel) => sel.stretchId === s.id))
      .filter((s) => {
        if (!query) return false;
        return (
          s.name.toLowerCase().includes(query) ||
          s.primaryMuscles.some((m) => m.toLowerCase().includes(query)) ||
          s.secondaryMuscles.some((m) => m.toLowerCase().includes(query)) ||
          s.movementTags.some((t) => t.toLowerCase().includes(query))
        );
      })
      .slice(0, 10);
  }, [allStretches, stretchSearch, selectedStretches]);

  const filteredSessionTemplates = useMemo(() => {
    const query = sessionTemplateSearch.trim().toLowerCase();
    return allSessionTemplates
      .filter((t) => !pairedSessions.some((p) => p.sessionTemplateId === t.id))
      .filter((t) => {
        if (!query) return false;
        return t.name.toLowerCase().includes(query) || t.type.toLowerCase().includes(query);
      })
      .slice(0, 10);
  }, [allSessionTemplates, sessionTemplateSearch, pairedSessions]);

  function addStretch(stretch: StretchOption) {
    setSelectedStretches((prev) => [
      ...prev,
      {
        id: `stretch-${Date.now()}-${Math.random()}`,
        stretchId: stretch.id,
        name: stretch.name,
        sortOrder: prev.length + 1,
        holdDurationSeconds: null,
        notes: "",
        isNew: true,
      },
    ]);
    setStretchSearch("");
  }

  function removeStretch(id: string) {
    setSelectedStretches((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.map((s, i) => ({ ...s, sortOrder: i + 1 }));
    });
  }

  function updateHoldDuration(id: string, value: string) {
    setSelectedStretches((prev) =>
      prev.map((s) => (s.id === id ? { ...s, holdDurationSeconds: value ? parseInt(value) : null } : s)),
    );
  }

  function updateNotes(id: string, notes: string) {
    setSelectedStretches((prev) => prev.map((s) => (s.id === id ? { ...s, notes } : s)));
  }

  function moveStretch(id: string, direction: "up" | "down") {
    const index = selectedStretches.findIndex((s) => s.id === id);
    if (index === -1) return;
    const next = [...selectedStretches];
    if (direction === "up" && index > 0) {
      [next[index], next[index - 1]] = [next[index - 1], next[index]];
    } else if (direction === "down" && index < next.length - 1) {
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
    setSelectedStretches(next.map((s, i) => ({ ...s, sortOrder: i + 1 })));
  }

  function toggleFocusArea(area: string) {
    setSelectedFocusAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area],
    );
  }

  async function addSessionTemplatePair(template: SessionTemplateOption) {
    const { error } = await supabase
      .from("mobility_session_pairs")
      .insert({
        mobility_session_id: sessionId,
        session_template_id: template.id,
        auto_add_enabled: false,
      });

    if (!error) {
      setPairedSessions((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          sessionTemplateId: template.id,
          templateName: template.name,
          templateType: template.type,
          autoAddEnabled: false,
        },
      ]);
      setSessionTemplateSearch("");
    }
  }

  async function removeSessionTemplatePair(pairId: string) {
    await supabase
      .from("mobility_session_pairs")
      .delete()
      .eq("id", pairId);

    setPairedSessions((prev) => prev.filter((p) => p.id !== pairId));
  }

  async function toggleAutoAdd(pairId: string, currentState: boolean) {
    await supabase
      .from("mobility_session_pairs")
      .update({ auto_add_enabled: !currentState })
      .eq("id", pairId);

    setPairedSessions((prev) =>
      prev.map((p) => (p.id === pairId ? { ...p, autoAddEnabled: !currentState } : p)),
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
      setErrorMessage("Please add at least one stretch.");
      setSaving(false);
      return;
    }

    // Check if any selected stretch has equipment
    const hasEquipment = selectedStretches.some((stretch) => {
      const stretchData = allStretches.find((s) => s.id === stretch.stretchId);
      return stretchData && stretchData.equipment.length > 0;
    });

    const tags = hasEquipment ? ["equipment-required"] : [];

    // Update session metadata
    const { error: updateError } = await supabase
      .from("mobility_sessions")
      .update({
        name: name.trim(),
        description: description.trim(),
        duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
        difficulty_level: difficultyLevel,
        focus_areas: selectedFocusAreas,
        tags,
      })
      .eq("id", sessionId);

    if (updateError) {
      setErrorMessage(`Could not update session: ${updateError.message}`);
      setSaving(false);
      return;
    }

    // Replace all stretches: delete existing, re-insert all
    const { error: deleteError } = await supabase
      .from("mobility_session_stretches")
      .delete()
      .eq("mobility_session_id", sessionId);

    if (deleteError) {
      setErrorMessage(`Could not update stretches: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    const stretchPayloads = selectedStretches.map((s, i) => ({
      id: `mobility_stretch_${Date.now()}_${s.stretchId}_${i}`,
      mobility_session_id: sessionId,
      stretch_id: s.stretchId,
      sort_order: i + 1,
      hold_duration_seconds: s.holdDurationSeconds,
      notes: s.notes || null,
    }));

    const { error: insertError } = await supabase
      .from("mobility_session_stretches")
      .insert(stretchPayloads);

    if (insertError) {
      setErrorMessage(`Could not save stretches: ${insertError.message}`);
      setSaving(false);
      return;
    }

    setSuccessMessage("Session updated successfully!");
    setSaving(false);
    setTimeout(() => router.push("/coach/mobility-sessions"), 1200);
  }

  if (loadingSession || loadingStretches || loadingTemplates) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ textAlign: "center", color: "#6b7280" }}>Loading session…</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Edit Mobility Session</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="name" style={labelStyle}>Session Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} required />

          <label htmlFor="description" style={labelStyle}>Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={textareaStyle}
          />

          <div style={rowStyle}>
            <div style={colStyle}>
              <label htmlFor="duration" style={labelStyle}>Duration (minutes)</label>
              <input
                id="duration"
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                style={inputStyle}
                min="1"
              />
            </div>
            <div style={colStyle}>
              <label htmlFor="difficulty" style={labelStyle}>Difficulty Level</label>
              <select value={difficultyLevel} onChange={(e) => setDifficultyLevel(e.target.value)} style={inputStyle}>
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

          <label htmlFor="stretch-search" style={labelStyle}>Add Stretches</label>
          <div style={pickerWrapStyle}>
            <input
              id="stretch-search"
              value={stretchSearch}
              onChange={(e) => setStretchSearch(e.target.value)}
              placeholder="Search stretches by name or muscle group…"
              style={inputStyle}
            />
            {stretchSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingStretches ? (
                  <div style={dropdownMessageStyle}>Loading stretches…</div>
                ) : filteredStretches.length > 0 ? (
                  filteredStretches.map((stretch) => (
                    <button key={stretch.id} type="button" onClick={() => addStretch(stretch)} style={dropdownItemStyle}>
                      <div style={{ fontWeight: 600 }}>{stretch.name}</div>
                      {stretch.description && <div style={dropdownMetaStyle}>{stretch.description}</div>}
                      <div style={dropdownMetaStyle}>{stretch.primaryMuscles.join(", ")}</div>
                    </button>
                  ))
                ) : (
                  <div style={dropdownMessageStyle}>No matching stretches found.</div>
                )}
              </div>
            ) : null}
          </div>

          <label htmlFor="session-template-search" style={labelStyle}>Pair with Session Templates (Auto-Add to Plans)</label>
          <div style={pickerWrapStyle}>
            <input
              id="session-template-search"
              value={sessionTemplateSearch}
              onChange={(e) => setSessionTemplateSearch(e.target.value)}
              placeholder="Search functional or gym sessions…"
              style={inputStyle}
            />
            {sessionTemplateSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingTemplates ? (
                  <div style={dropdownMessageStyle}>Loading session templates…</div>
                ) : filteredSessionTemplates.length > 0 ? (
                  filteredSessionTemplates.map((template) => (
                    <button key={template.id} type="button" onClick={() => addSessionTemplatePair(template)} style={dropdownItemStyle}>
                      <div style={{ fontWeight: 600 }}>{template.name}</div>
                      <div style={dropdownMetaStyle}>{template.type}</div>
                    </button>
                  ))
                ) : (
                  <div style={dropdownMessageStyle}>No matching templates found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div style={selectedSectionStyle}>
            <div style={selectedHeaderStyle}>
              <h3 style={selectedTitleStyle}>Paired Sessions ({pairedSessions.length})</h3>
            </div>
            {pairedSessions.length === 0 ? (
              <p style={helperStyle}>No sessions paired yet. When coaches add one of these templates to a plan, this mobility session can be automatically added as recovery.</p>
            ) : (
              <div style={stretchListContainerStyle}>
                {pairedSessions.map((pair) => (
                  <div key={pair.id} style={stretchItemStyle}>
                    <div style={stretchItemHeaderStyle}>
                      <span style={stretchNameInListStyle}>{pair.templateName}</span>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginRight: "auto", marginLeft: "8px" }}>({pair.templateType})</div>
                      <div style={stretchItemButtonsStyle}>
                        <label style={{ display: "flex", alignItems: "center", gap: "6px", marginRight: "8px", fontSize: "13px", cursor: "pointer", color: "#374151" }}>
                          <input
                            type="checkbox"
                            checked={pair.autoAddEnabled}
                            onChange={() => toggleAutoAdd(pair.id, pair.autoAddEnabled)}
                            style={{ cursor: "pointer" }}
                          />
                          Auto-add
                        </label>
                        <button type="button" onClick={() => removeSessionTemplatePair(pair.id)} style={removeButtonStyle}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={selectedSectionStyle}>
            <div style={selectedHeaderStyle}>
              <h3 style={selectedTitleStyle}>Stretches ({selectedStretches.length})</h3>
            </div>

            {selectedStretches.length === 0 ? (
              <p style={helperStyle}>No stretches added yet.</p>
            ) : (
              <div style={stretchListContainerStyle}>
                {selectedStretches.map((stretch, index) => (
                  <div key={stretch.id} style={stretchItemStyle}>
                    <div style={stretchItemHeaderStyle}>
                      <span style={stretchOrderStyle}>{index + 1}</span>
                      <span style={stretchNameInListStyle}>{stretch.name}</span>
                      <div style={stretchItemButtonsStyle}>
                        {index > 0 && (
                          <button type="button" onClick={() => moveStretch(stretch.id, "up")} style={moveButtonStyle}>↑</button>
                        )}
                        {index < selectedStretches.length - 1 && (
                          <button type="button" onClick={() => moveStretch(stretch.id, "down")} style={moveButtonStyle}>↓</button>
                        )}
                        <button type="button" onClick={() => removeStretch(stretch.id)} style={removeButtonStyle}>✕</button>
                      </div>
                    </div>
                    <div style={stretchDetailsStyle}>
                      <div style={stretchDetailColStyle}>
                        <label style={detailLabelStyle}>Hold Duration (seconds)</label>
                        <input
                          type="number"
                          value={stretch.holdDurationSeconds ?? ""}
                          onChange={(e) => updateHoldDuration(stretch.id, e.target.value)}
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
                          onChange={(e) => updateNotes(stretch.id, e.target.value)}
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
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={() => router.push("/coach/mobility-sessions")} style={secondaryButtonStyle}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 24px", background: "#f5f5f5" };
const cardStyle: React.CSSProperties = { width: "100%", maxWidth: "800px", background: "#ffffff", padding: "32px", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" };
const titleStyle: React.CSSProperties = { textAlign: "center", marginBottom: "24px", fontSize: "28px", fontWeight: 700, color: "#111827" };
const labelStyle: React.CSSProperties = { display: "block", marginBottom: "8px", fontWeight: 600, color: "#374151", fontSize: "14px" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "6px", marginBottom: "16px", fontSize: "14px", boxSizing: "border-box" };
const textareaStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: "6px", marginBottom: "16px", fontSize: "14px", boxSizing: "border-box", resize: "vertical" };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" };
const colStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };
const focusAreasStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "16px" };
const checkboxLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer", color: "#374151" };
const checkboxStyle: React.CSSProperties = { cursor: "pointer" };
const pickerWrapStyle: React.CSSProperties = { position: "relative" };
const dropdownStyle: React.CSSProperties = { position: "absolute", top: "calc(100% - 8px)", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "6px", boxShadow: "0 10px 24px rgba(0,0,0,0.08)", zIndex: 20, overflow: "hidden", maxHeight: "300px", overflowY: "auto" };
const dropdownItemStyle: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: "1px solid #e5e7eb", background: "#fff", cursor: "pointer", fontSize: "14px" };
const dropdownMetaStyle: React.CSSProperties = { fontSize: "12px", color: "#6b7280", marginTop: "2px" };
const dropdownMessageStyle: React.CSSProperties = { padding: "12px", color: "#6b7280", fontSize: "14px", textAlign: "center" };
const selectedSectionStyle: React.CSSProperties = { marginBottom: "16px", padding: "16px", backgroundColor: "#f9fafb", borderRadius: "6px", border: "1px solid #e5e7eb" };
const selectedHeaderStyle: React.CSSProperties = { marginBottom: "12px" };
const selectedTitleStyle: React.CSSProperties = { margin: 0, fontSize: "14px", fontWeight: 600, color: "#374151" };
const helperStyle: React.CSSProperties = { margin: 0, fontSize: "13px", color: "#6b7280", fontStyle: "italic" };
const stretchListContainerStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const stretchItemStyle: React.CSSProperties = { backgroundColor: "#fff", border: "1px solid #d1d5db", borderRadius: "4px", padding: "12px" };
const stretchItemHeaderStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" };
const stretchOrderStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#e5e7eb", color: "#374151", fontSize: "12px", fontWeight: 600, flexShrink: 0 };
const stretchNameInListStyle: React.CSSProperties = { flex: 1, fontWeight: 500, color: "#111827", fontSize: "14px" };
const stretchItemButtonsStyle: React.CSSProperties = { display: "flex", gap: "4px" };
const moveButtonStyle: React.CSSProperties = { padding: "4px 8px", fontSize: "12px", border: "1px solid #d1d5db", backgroundColor: "#fff", borderRadius: "4px", cursor: "pointer", color: "#6b7280" };
const removeButtonStyle: React.CSSProperties = { padding: "4px 8px", fontSize: "12px", border: "1px solid #fca5a5", backgroundColor: "#fff", borderRadius: "4px", cursor: "pointer", color: "#dc2626" };
const stretchDetailsStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" };
const stretchDetailColStyle: React.CSSProperties = { display: "flex", flexDirection: "column" };
const detailLabelStyle: React.CSSProperties = { fontSize: "11px", fontWeight: 600, color: "#6b7280", marginBottom: "4px" };
const detailInputStyle: React.CSSProperties = { padding: "6px 8px", fontSize: "12px", border: "1px solid #e5e7eb", borderRadius: "4px", width: "100%", boxSizing: "border-box" };
const errorStyle: React.CSSProperties = { color: "#b00020", marginBottom: "16px", padding: "12px", backgroundColor: "#ffebee", borderRadius: "6px", fontSize: "14px" };
const successStyle: React.CSSProperties = { color: "#0a7f3f", marginBottom: "16px", padding: "12px", backgroundColor: "#ecfdf5", borderRadius: "6px", fontSize: "14px" };
const buttonRowStyle: React.CSSProperties = { display: "flex", gap: "12px", marginTop: "24px" };
const buttonStyle: React.CSSProperties = { flex: 1, padding: "12px 16px", border: "none", borderRadius: "6px", background: "#111111", color: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: "14px" };
const secondaryButtonStyle: React.CSSProperties = { padding: "12px 16px", border: "1px solid #d1d5db", borderRadius: "6px", background: "#ffffff", color: "#111111", fontWeight: 600, cursor: "pointer", fontSize: "14px" };

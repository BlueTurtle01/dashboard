"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type FieldConfigRow = {
  id: string;
  activity: string | null;
  subtype: string | null;
  show_distance: boolean | null;
  show_duration: boolean | null;
  show_target_intensity: boolean | null;
  show_terrain: boolean | null;
  show_elevation: boolean | null;
  show_pack_weight: boolean | null;
  show_sets: boolean | null;
  show_set_duration: boolean | null;
  show_rest_seconds: boolean | null;
  show_strides: boolean | null;
  show_warm_up: boolean | null;
  show_cool_down: boolean | null;
  show_interval_reps: boolean | null;
  show_interval_duration: boolean | null;
  show_time_of_day: boolean | null;
  show_tags: boolean | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type EditableRow = {
  id: string;
  activity: string;
  subtype: string;
  show_distance: boolean;
  show_duration: boolean;
  show_target_intensity: boolean;
  show_terrain: boolean;
  show_elevation: boolean;
  show_pack_weight: boolean;
  show_sets: boolean;
  show_set_duration: boolean;
  show_rest_seconds: boolean;
  show_strides: boolean;
  show_warm_up: boolean;
  show_cool_down: boolean;
  show_interval_reps: boolean;
  show_interval_duration: boolean;
  show_time_of_day: boolean;
  show_tags: boolean;
  notes: string;
  isNew?: boolean;
};

type CheckboxKey = keyof Omit<EditableRow, "id" | "activity" | "subtype" | "notes" | "isNew">;

const checkboxFields: Array<{ key: CheckboxKey; label: string; group: string }> = [
  { key: "show_duration",          label: "Duration",           group: "Core" },
  { key: "show_distance",          label: "Distance",           group: "Core" },
  { key: "show_target_intensity",  label: "Target Intensity",   group: "Core" },
  { key: "show_terrain",           label: "Terrain",            group: "Environment" },
  { key: "show_elevation",         label: "Elevation",          group: "Environment" },
  { key: "show_pack_weight",       label: "Pack Weight",        group: "Environment" },
  { key: "show_warm_up",           label: "Warm Up",            group: "Structure" },
  { key: "show_cool_down",         label: "Cool Down",          group: "Structure" },
  { key: "show_strides",           label: "Strides",            group: "Structure" },
  { key: "show_sets",              label: "Sets",               group: "Intervals" },
  { key: "show_set_duration",      label: "Set Duration",       group: "Intervals" },
  { key: "show_rest_seconds",      label: "Rest Seconds",       group: "Intervals" },
  { key: "show_interval_reps",     label: "Interval Reps",      group: "Intervals" },
  { key: "show_interval_duration", label: "Interval Duration",  group: "Intervals" },
  { key: "show_time_of_day",       label: "Time of Day",        group: "Display" },
  { key: "show_tags",              label: "Tags",               group: "Display" },
];

const groups = ["Core", "Environment", "Structure", "Intervals", "Display"];

function toEditableRow(row: FieldConfigRow): EditableRow {
  return {
    id: row.id,
    activity: row.activity ?? "",
    subtype: row.subtype ?? "",
    show_distance: !!row.show_distance,
    show_duration: !!row.show_duration,
    show_target_intensity: !!row.show_target_intensity,
    show_terrain: !!row.show_terrain,
    show_elevation: !!row.show_elevation,
    show_pack_weight: !!row.show_pack_weight,
    show_sets: !!row.show_sets,
    show_set_duration: !!row.show_set_duration,
    show_rest_seconds: !!row.show_rest_seconds,
    show_strides: !!row.show_strides,
    show_warm_up: !!row.show_warm_up,
    show_cool_down: !!row.show_cool_down,
    show_interval_reps: !!row.show_interval_reps,
    show_interval_duration: !!row.show_interval_duration,
    show_time_of_day: !!row.show_time_of_day,
    show_tags: !!row.show_tags,
    notes: row.notes ?? "",
    isNew: false,
  };
}

function createBlankRow(): EditableRow {
  return {
    id: `new-${crypto.randomUUID()}`,
    activity: "",
    subtype: "",
    show_distance: false,
    show_duration: false,
    show_target_intensity: false,
    show_terrain: false,
    show_elevation: false,
    show_pack_weight: false,
    show_sets: false,
    show_set_duration: false,
    show_rest_seconds: false,
    show_strides: false,
    show_warm_up: false,
    show_cool_down: false,
    show_interval_reps: false,
    show_interval_duration: false,
    show_time_of_day: false,
    show_tags: true,
    notes: "",
    isNew: true,
  };
}

function sidebarLabel(row: EditableRow) {
  const activity = row.activity || "—";
  const subtype = row.subtype || "(all)";
  return { activity, subtype };
}

export default function SessionTemplateFieldConfigPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function loadRows() {
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase
      .from("session_template_field_config")
      .select("*")
      .order("activity", { ascending: true, nullsFirst: true })
      .order("subtype", { ascending: true, nullsFirst: true });

    if (error) {
      setMessage({ text: `Could not load: ${error.message}`, ok: false });
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []).map(toEditableRow));
    setLoading(false);
  }

  useEffect(() => {
    loadRows();
  }, []);

  function updateSelected<K extends keyof EditableRow>(key: K, value: EditableRow[K]) {
    if (!selectedId) return;
    setRows((current) =>
      current.map((row) => (row.id === selectedId ? { ...row, [key]: value } : row))
    );
  }

  async function saveSelected() {
    if (!selected) return;
    setMessage(null);

    const trimmedActivity = selected.activity.trim();
    const trimmedSubtype = selected.subtype.trim();

    if (!trimmedActivity) {
      setMessage({ text: "Activity is required.", ok: false });
      return;
    }

    setSavingRowId(selected.id);

    const payload = {
      activity: trimmedActivity,
      subtype: trimmedSubtype || null,
      show_distance: selected.show_distance,
      show_duration: selected.show_duration,
      show_target_intensity: selected.show_target_intensity,
      show_terrain: selected.show_terrain,
      show_elevation: selected.show_elevation,
      show_pack_weight: selected.show_pack_weight,
      show_sets: selected.show_sets,
      show_set_duration: selected.show_set_duration,
      show_rest_seconds: selected.show_rest_seconds,
      show_strides: selected.show_strides,
      show_warm_up: selected.show_warm_up,
      show_cool_down: selected.show_cool_down,
      show_interval_reps: selected.show_interval_reps,
      show_interval_duration: selected.show_interval_duration,
      show_time_of_day: selected.show_time_of_day,
      show_tags: selected.show_tags,
      notes: selected.notes.trim() || null,
    };

    if (selected.isNew) {
      const { data, error } = await supabase
        .from("session_template_field_config")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        setMessage({ text: `Could not create: ${error.message}`, ok: false });
        setSavingRowId(null);
        return;
      }

      const saved = toEditableRow(data);
      setRows((current) =>
        current.map((r) => (r.id === selected.id ? saved : r))
      );
      setSelectedId(saved.id);
      setMessage({ text: "Config created.", ok: true });
      setSavingRowId(null);
      return;
    }

    const { data, error } = await supabase
      .from("session_template_field_config")
      .update(payload)
      .eq("id", selected.id)
      .select("*")
      .single();

    if (error) {
      setMessage({ text: `Could not save: ${error.message}`, ok: false });
      setSavingRowId(null);
      return;
    }

    setRows((current) =>
      current.map((r) => (r.id === selected.id ? toEditableRow(data) : r))
    );
    setMessage({ text: "Saved.", ok: true });
    setSavingRowId(null);
  }

  async function deleteSelected() {
    if (!selected) return;
    setMessage(null);

    if (selected.isNew) {
      setRows((current) => current.filter((r) => r.id !== selected.id));
      setSelectedId(null);
      return;
    }

    setDeletingRowId(selected.id);

    const { error } = await supabase
      .from("session_template_field_config")
      .delete()
      .eq("id", selected.id);

    if (error) {
      setMessage({ text: `Could not delete: ${error.message}`, ok: false });
      setDeletingRowId(null);
      return;
    }

    setRows((current) => current.filter((r) => r.id !== selected.id));
    setSelectedId(null);
    setMessage({ text: "Deleted.", ok: true });
    setDeletingRowId(null);
  }

  function addNew() {
    const blank = createBlankRow();
    setRows((current) => [blank, ...current]);
    setSelectedId(blank.id);
    setMessage(null);
  }

  // Group sidebar items by activity
  const grouped = useMemo(() => {
    const map = new Map<string, EditableRow[]>();
    for (const row of rows) {
      const act = row.activity || "—";
      if (!map.has(act)) map.set(act, []);
      map.get(act)!.push(row);
    }
    return map;
  }, [rows]);

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", fontSize: "14px" }}>

      {/* Sidebar */}
      <div style={{
        width: "220px",
        flexShrink: 0,
        borderRight: "1px solid #e5e7eb",
        background: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{ padding: "16px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#374151", marginBottom: "10px" }}>
            Field Config
          </div>
          <button
            type="button"
            onClick={addNew}
            style={{
              width: "100%",
              padding: "8px 12px",
              background: "#1f6feb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            + Add Config
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {loading ? (
            <p style={{ padding: "12px 16px", color: "#6b7280", margin: 0 }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ padding: "12px 16px", color: "#6b7280", margin: 0 }}>No configs yet.</p>
          ) : (
            Array.from(grouped.entries()).map(([activity, actRows]) => (
              <div key={activity}>
                <div style={{
                  padding: "6px 16px 4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  {activity}
                </div>
                {actRows.map((row) => {
                  const { subtype } = sidebarLabel(row);
                  const isActive = row.id === selectedId;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => { setSelectedId(row.id); setMessage(null); }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 16px",
                        background: isActive ? "#eff6ff" : "transparent",
                        border: "none",
                        borderLeft: isActive ? "3px solid #1f6feb" : "3px solid transparent",
                        color: isActive ? "#1d4ed8" : "#374151",
                        fontWeight: isActive ? 600 : 400,
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                    >
                      {row.isNew ? <em>New config</em> : subtype}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {!selected ? (
          <div style={{ color: "#6b7280", marginTop: "60px", textAlign: "center" }}>
            <p style={{ fontSize: "16px", marginBottom: "8px" }}>Select a config from the sidebar</p>
            <p style={{ fontSize: "13px" }}>or click <strong>+ Add Config</strong> to create a new one.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700 }}>
                  {selected.isNew ? "New Config" : `${selected.activity} · ${selected.subtype || "all subtypes"}`}
                </h1>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "13px" }}>
                  Fields shown in the session form for this activity / subtype combination.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={saveSelected}
                  disabled={savingRowId === selected.id}
                  style={{
                    padding: "9px 18px",
                    background: "#1f6feb",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: savingRowId === selected.id ? 0.6 : 1,
                  }}
                >
                  {savingRowId === selected.id ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  disabled={deletingRowId === selected.id}
                  style={{
                    padding: "9px 18px",
                    background: "#fee2e2",
                    color: "#b91c1c",
                    border: "1px solid #fca5a5",
                    borderRadius: "8px",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: deletingRowId === selected.id ? 0.6 : 1,
                  }}
                >
                  {deletingRowId === selected.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>

            {message ? (
              <div style={{
                marginBottom: "20px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: message.ok ? "#f0fdf4" : "#fef2f2",
                border: `1px solid ${message.ok ? "#86efac" : "#fca5a5"}`,
                color: message.ok ? "#166534" : "#b91c1c",
                fontSize: "13px",
                fontWeight: 500,
              }}>
                {message.text}
              </div>
            ) : null}

            {/* Activity + Subtype */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "28px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>Activity</span>
                <input
                  type="text"
                  value={selected.activity}
                  onChange={(e) => updateSelected("activity", e.target.value)}
                  placeholder="e.g. run"
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>Subtype</span>
                <input
                  type="text"
                  value={selected.subtype}
                  onChange={(e) => updateSelected("subtype", e.target.value)}
                  placeholder="e.g. interval (blank = all)"
                  style={inputStyle}
                />
              </label>
            </div>

            {/* Field checkboxes grouped */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "28px" }}>
              {groups.map((group) => {
                const fields = checkboxFields.filter((f) => f.group === group);
                return (
                  <div key={group} style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: "10px",
                    padding: "16px",
                  }}>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                      {group}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {fields.map((field) => (
                        <label key={field.key} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={selected[field.key] as boolean}
                            onChange={(e) => updateSelected(field.key, e.target.checked)}
                            style={{ width: "17px", height: "17px", cursor: "pointer", accentColor: "#1f6feb" }}
                          />
                          <span style={{ fontSize: "14px", color: "#111827" }}>{field.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Notes */}
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>Notes (optional)</span>
              <textarea
                value={selected.notes}
                onChange={(e) => updateSelected("notes", e.target.value)}
                placeholder="e.g. Hill reps — elevation relevant, no distance"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
  width: "100%",
  background: "#fff",
};

"use client";

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
  notes: string;
  isNew?: boolean;
};

const checkboxColumns: Array<{
  key:
    | "show_distance"
    | "show_duration"
    | "show_target_intensity"
    | "show_terrain"
    | "show_elevation"
    | "show_pack_weight"
    | "show_sets"
    | "show_set_duration"
    | "show_rest_seconds";
  label: string;
}> = [
  { key: "show_distance", label: "Distance" },
  { key: "show_duration", label: "Duration" },
  { key: "show_target_intensity", label: "Target Intensity" },
  { key: "show_terrain", label: "Terrain" },
  { key: "show_elevation", label: "Elevation" },
  { key: "show_pack_weight", label: "Pack Weight" },
  { key: "show_sets", label: "Sets" },
  { key: "show_set_duration", label: "Set Duration" },
  { key: "show_rest_seconds", label: "Rest Seconds" },
];

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
    notes: "",
    isNew: true,
  };
}

export default function SessionTemplateFieldConfigPage() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  async function loadRows() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("session_template_field_config")
      .select("*")
      .order("activity", { ascending: true, nullsFirst: true })
      .order("subtype", { ascending: true, nullsFirst: true });

    if (error) {
      setMessage(`Could not load rows: ${error.message}`);
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

  function updateRow<K extends keyof EditableRow>(
    rowId: string,
    key: K,
    value: EditableRow[K]
  ) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row))
    );
  }

  async function saveRow(row: EditableRow) {
    setMessage("");

    const trimmedActivity = row.activity.trim();
    const trimmedSubtype = row.subtype.trim();

    if (!trimmedActivity) {
      setMessage("Activity is required.");
      return;
    }

    setSavingRowId(row.id);

    const payload = {
      activity: trimmedActivity,
      subtype: trimmedSubtype || null,
      show_distance: row.show_distance,
      show_duration: row.show_duration,
      show_target_intensity: row.show_target_intensity,
      show_terrain: row.show_terrain,
      show_elevation: row.show_elevation,
      show_pack_weight: row.show_pack_weight,
      show_sets: row.show_sets,
      show_set_duration: row.show_set_duration,
      show_rest_seconds: row.show_rest_seconds,
      notes: row.notes.trim() || null,
    };

    if (row.isNew) {
      const { data, error } = await supabase
        .from("session_template_field_config")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        setMessage(`Could not create row: ${error.message}`);
        setSavingRowId(null);
        return;
      }

      setRows((current) =>
        current.map((r) => (r.id === row.id ? toEditableRow(data) : r))
      );
      setMessage("Row created.");
      setSavingRowId(null);
      return;
    }

    const { data, error } = await supabase
      .from("session_template_field_config")
      .update(payload)
      .eq("id", row.id)
      .select("*")
      .single();

    if (error) {
      setMessage(`Could not save row: ${error.message}`);
      setSavingRowId(null);
      return;
    }

    setRows((current) =>
      current.map((r) => (r.id === row.id ? toEditableRow(data) : r))
    );
    setMessage("Row updated.");
    setSavingRowId(null);
  }

  async function deleteRow(row: EditableRow) {
    setMessage("");

    if (row.isNew) {
      setRows((current) => current.filter((r) => r.id !== row.id));
      return;
    }

    setDeletingRowId(row.id);

    const { error } = await supabase
      .from("session_template_field_config")
      .delete()
      .eq("id", row.id);

    if (error) {
      setMessage(`Could not delete row: ${error.message}`);
      setDeletingRowId(null);
      return;
    }

    setRows((current) => current.filter((r) => r.id !== row.id));
    setMessage("Row deleted.");
    setDeletingRowId(null);
  }

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "12px",
          boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
          padding: "20px",
          overflowX: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            marginBottom: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin: "0 0 6px 0",
                textAlign: "center",
              }}
            >
              Session Template Field Config
            </h1>
            <p style={{ margin: 0, color: "#555" }}>
              Control which fields show for each activity and subtype.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setRows((current) => [createBlankRow(), ...current])}
              style={buttonStyle}
            >
              Add Row
            </button>

            <button
              type="button"
              onClick={loadRows}
              style={secondaryButtonStyle}
            >
              Refresh
            </button>
          </div>
        </div>

        {message ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "10px 12px",
              borderRadius: "8px",
              background: "#f6f6f6",
              border: "1px solid #ddd",
            }}
          >
            {message}
          </div>
        ) : null}

        {loading ? (
          <p>Loading...</p>
        ) : rows.length === 0 ? (
          <p>No rows found.</p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "1550px",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Activity</th>
                <th style={thStyle}>Subtype</th>
                {checkboxColumns.map((column) => (
                  <th key={column.key} style={thStyleCentered}>
                    {column.label}
                  </th>
                ))}
                <th style={thStyle}>Notes</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.activity}
                      onChange={(e) =>
                        updateRow(row.id, "activity", e.target.value)
                      }
                      placeholder="e.g. run"
                      style={inputStyle}
                    />
                  </td>

                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.subtype}
                      onChange={(e) =>
                        updateRow(row.id, "subtype", e.target.value)
                      }
                      placeholder="e.g. interval"
                      style={inputStyle}
                    />
                  </td>

                  {checkboxColumns.map((column) => (
                    <td key={column.key} style={tdStyleCentered}>
                      <input
                        type="checkbox"
                        checked={row[column.key]}
                        onChange={(e) =>
                          updateRow(row.id, column.key, e.target.checked)
                        }
                        style={{ width: "18px", height: "18px" }}
                      />
                    </td>
                  ))}

                  <td style={tdStyle}>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={(e) => updateRow(row.id, "notes", e.target.value)}
                      placeholder="Optional notes"
                      style={inputStyle}
                    />
                  </td>

                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => saveRow(row)}
                        disabled={savingRowId === row.id}
                        style={buttonStyle}
                      >
                        {savingRowId === row.id ? "Saving..." : "Save"}
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteRow(row)}
                        disabled={deletingRowId === row.id}
                        style={dangerButtonStyle}
                      >
                        {deletingRowId === row.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px",
  borderBottom: "1px solid #ddd",
  background: "#f8f8f8",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const thStyleCentered: React.CSSProperties = {
  ...thStyle,
  textAlign: "center",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

const tdStyleCentered: React.CSSProperties = {
  ...tdStyle,
  textAlign: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#1f6feb",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  border: "none",
  borderRadius: "8px",
  background: "#c62828",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
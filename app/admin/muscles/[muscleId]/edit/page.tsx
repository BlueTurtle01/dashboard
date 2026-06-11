"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MuscleRow = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export default function EditMusclePage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const muscleId =
    typeof params.muscleId === "string" ? params.muscleId : "";

  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!muscleId) return;

    async function loadMuscle() {
      setLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("muscle_options")
        .select("id, slug, label, sort_order, is_active")
        .eq("id", muscleId)
        .single();

      if (error || !data) {
        setErrorMessage(
          error?.message ?? "Muscle not found."
        );
        setLoading(false);
        return;
      }

      const row = data as MuscleRow;
      setLabel(row.label);
      setSlug(row.slug);
      setSortOrder(String(row.sort_order));
      setIsActive(row.is_active);
      setLoading(false);
    }

    loadMuscle();
  }, [muscleId, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedLabel = label.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedLabel) {
      setErrorMessage("Label is required.");
      return;
    }
    if (!trimmedSlug) {
      setErrorMessage("Slug is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase
      .from("muscle_options")
      .update({
        label: trimmedLabel,
        slug: trimmedSlug,
        sort_order: parseInt(sortOrder, 10) || 0,
        is_active: isActive,
      })
      .eq("id", muscleId);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.message.toLowerCase().includes("unique")) {
        setErrorMessage("A muscle with this slug already exists.");
      } else {
        setErrorMessage(`Could not save: ${error.message}`);
      }
      setSaving(false);
      return;
    }

    setSuccessMessage("Muscle saved.");
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("muscle_options")
      .delete()
      .eq("id", muscleId);

    if (error) {
      setErrorMessage(`Could not delete: ${error.message}`);
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }

    router.push("/admin/muscles");
  }

  if (loading) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={helperStyle}>Loading muscle...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Edit Muscle</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="label" style={labelStyle}>
            Label
          </label>
          <input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Quadriceps"
            style={inputStyle}
            required
          />

          <label htmlFor="slug" style={labelStyle}>
            Slug
          </label>
          <p style={helperStyle}>
            Changing the slug will break any exercises, stretches, or
            assessments already using it.
          </p>
          <input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. quadriceps"
            style={inputStyle}
            required
          />

          <label htmlFor="sort-order" style={labelStyle}>
            Sort order
          </label>
          <input
            id="sort-order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={inputStyle}
          />

          <div style={checkboxRowStyle}>
            <input
              id="is-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={checkboxStyle}
            />
            <label htmlFor="is-active" style={checkboxLabelStyle}>
              Active — show in muscle pickers
            </label>
          </div>

          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
          {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

          <div style={buttonRowStyle}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/muscles")}
              style={secondaryButtonStyle}
            >
              Back
            </button>
          </div>
        </form>

        <div style={dangerZoneStyle}>
          <p style={dangerTitleStyle}>Danger zone</p>
          {confirmDelete ? (
            <div>
              <p style={dangerWarningStyle}>
                This will permanently delete this muscle option. Any exercises,
                stretches, or assessments that reference this slug will lose the
                tag. Are you sure?
              </p>
              <div style={buttonRowStyle}>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  style={deleteConfirmButtonStyle}
                >
                  {deleting ? "Deleting..." : "Yes, delete permanently"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              style={deleteButtonStyle}
            >
              Delete muscle
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

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
  maxWidth: "560px",
  background: "#ffffff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const titleStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "24px",
  fontSize: "24px",
  fontWeight: 700,
  color: "#111827",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "6px",
  fontWeight: 600,
  fontSize: "14px",
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const helperStyle: React.CSSProperties = {
  marginTop: "-4px",
  marginBottom: "8px",
  color: "#6b7280",
  fontSize: "13px",
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "24px",
};

const checkboxStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
};

const checkboxLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  marginBottom: "16px",
  fontSize: "14px",
};

const successStyle: React.CSSProperties = {
  color: "#0a7f3f",
  marginBottom: "16px",
  fontSize: "14px",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
};

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#111111",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
};

const dangerZoneStyle: React.CSSProperties = {
  marginTop: "40px",
  paddingTop: "24px",
  borderTop: "1px solid #fee2e2",
};

const dangerTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#991b1b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "12px",
};

const dangerWarningStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  marginBottom: "16px",
};

const deleteButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #fca5a5",
  borderRadius: "8px",
  background: "#fff",
  color: "#dc2626",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "14px",
};

const deleteConfirmButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 16px",
  border: "none",
  borderRadius: "8px",
  background: "#dc2626",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "14px",
};

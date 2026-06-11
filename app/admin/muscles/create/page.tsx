"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateMusclePage() {
  const router = useRouter();
  const supabase = createClient();

  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Auto-generate slug from label unless user has manually edited it
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(makeSlug(label));
    }
  }, [label, slugManuallyEdited]);

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

    const { error } = await supabase.from("muscle_options").insert({
      label: trimmedLabel,
      slug: trimmedSlug,
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive,
    });

    if (error) {
      if (error.message.toLowerCase().includes("duplicate") || error.message.toLowerCase().includes("unique")) {
        setErrorMessage("A muscle with this slug already exists.");
      } else {
        setErrorMessage(`Could not create muscle: ${error.message}`);
      }
      setSaving(false);
      return;
    }

    setSuccessMessage(`Muscle "${trimmedLabel}" created successfully.`);
    setLabel("");
    setSlug("");
    setSlugManuallyEdited(false);
    setSortOrder("0");
    setIsActive(true);
    setSaving(false);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Create Muscle</h1>

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
            Used to reference this muscle in exercises, stretches, and
            assessments. Auto-generated from the label — only change if needed.
          </p>
          <input
            id="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugManuallyEdited(true);
            }}
            placeholder="e.g. quadriceps"
            style={inputStyle}
            required
          />

          <label htmlFor="sort-order" style={labelStyle}>
            Sort order
          </label>
          <p style={helperStyle}>
            Lower numbers appear first in dropdowns. Use 0 for default ordering
            by label.
          </p>
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
              {saving ? "Creating..." : "Create Muscle"}
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
      </div>
    </main>
  );
}

function makeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

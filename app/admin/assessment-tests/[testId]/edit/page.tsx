"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MuscleOption = {
  id: string;
  label: string;
  slug: string;
};

type AssessmentTestRow = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  aim: string | null;
  notes: string | null;
  instructions: string[];
  video_urls: string[];
  target_muscles: string[];
};

export default function EditAssessmentTestPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const testId = typeof params.testId === "string" ? params.testId : "";

  const [name, setName] = useState("");
  const [category, setCategory] = useState<"strength" | "imbalance" | "">("");
  const [description, setDescription] = useState("");
  const [aim, setAim] = useState("");
  const [notes, setNotes] = useState("");

  const [instructions, setInstructions] = useState<string[]>([]);
  const [newInstruction, setNewInstruction] = useState("");

  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState("");

  const [muscleSearch, setMuscleSearch] = useState("");
  const [allMuscleOptions, setAllMuscleOptions] = useState<MuscleOption[]>([]);
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleOption[]>([]);
  const [loadingMuscles, setLoadingMuscles] = useState(true);

  const [loadingTest, setLoadingTest] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoadingMuscles(true);
      setLoadingTest(true);
      setErrorMessage("");

      const [musclesResult, testResult] = await Promise.all([
        supabase
          .from("muscle_options")
          .select("id, label, slug")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("assessment_tests")
          .select("id, name, category, description, aim, notes, instructions, video_urls, target_muscles")
          .eq("id", testId)
          .single(),
      ]);

      const errors: string[] = [];

      if (musclesResult.error) {
        errors.push(`Could not load muscle options: ${musclesResult.error.message}`);
      } else {
        setAllMuscleOptions((musclesResult.data || []) as MuscleOption[]);
      }

      if (testResult.error) {
        errors.push(`Could not load test: ${testResult.error.message}`);
      } else {
        const test = testResult.data as AssessmentTestRow;
        setName(test.name);
        setCategory((test.category as "strength" | "imbalance" | "") ?? "");
        setDescription(test.description ?? "");
        setAim(test.aim ?? "");
        setNotes(test.notes ?? "");
        setInstructions(test.instructions ?? []);
        setVideoUrls(test.video_urls ?? []);

        // Pre-select muscles by matching slugs against loaded options
        if (!musclesResult.error && musclesResult.data) {
          const slugSet = new Set(test.target_muscles);
          setSelectedMuscles(
            (musclesResult.data as MuscleOption[]).filter((o) => slugSet.has(o.slug))
          );
        }
      }

      if (errors.length > 0) setErrorMessage(errors.join(" "));

      setLoadingMuscles(false);
      setLoadingTest(false);
    }

    if (testId) loadData();
  }, [testId, supabase]);

  const filteredMuscleOptions = useMemo(() => {
    const query = muscleSearch.trim().toLowerCase();
    return allMuscleOptions
      .filter((o) => !selectedMuscles.some((s) => s.id === o.id))
      .filter((o) => {
        if (!query) return false;
        return o.label.toLowerCase().includes(query) || o.slug.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [allMuscleOptions, muscleSearch, selectedMuscles]);

  function addMuscle(option: MuscleOption) {
    setSelectedMuscles((current) =>
      current.some((item) => item.id === option.id) ? current : [...current, option]
    );
    setMuscleSearch("");
  }

  function removeMuscle(optionId: string) {
    setSelectedMuscles((current) => current.filter((o) => o.id !== optionId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const payload = {
      name: name.trim(),
      category: category || null,
      description: description.trim() || null,
      aim: aim.trim() || null,
      notes: notes.trim() || null,
      instructions: instructions.filter((s) => s.trim().length > 0),
      video_urls: videoUrls.filter((u) => u.trim().length > 0),
      target_muscles: selectedMuscles.map((m) => m.slug),
    };

    const { error } = await supabase
      .from("assessment_tests")
      .update(payload)
      .eq("id", testId);

    if (error) {
      setErrorMessage(`Could not save test: ${error.message}`);
      setSaving(false);
      return;
    }

    setSuccessMessage("Assessment test saved.");
    setSaving(false);
  }

  if (loadingTest) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ textAlign: "center", color: "#666" }}>Loading test...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Edit Assessment Test</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="name" style={labelStyle}>Test name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            required
          />

          <label style={labelStyle}>Category</label>
          <div style={segmentedControlStyle}>
            {(["strength", "imbalance"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setCategory(category === opt ? "" : opt)}
                style={category === opt ? segmentActiveStyle : segmentStyle}
              >
                {opt === "strength" ? "Strength" : "Imbalance"}
              </button>
            ))}
          </div>

          <label htmlFor="description" style={labelStyle}>Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={textareaStyle}
          />

          <label htmlFor="aim" style={labelStyle}>Aim</label>
          <textarea
            id="aim"
            value={aim}
            onChange={(e) => setAim(e.target.value)}
            rows={3}
            placeholder="What imbalance or weakness does this test reveal?"
            style={textareaStyle}
          />

          <label htmlFor="notes" style={labelStyle}>Notes</label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="What should the assessor watch out for? Common compensations, red flags, technique cues..."
            style={textareaStyle}
          />

          <label htmlFor="muscle-search" style={labelStyle}>Target muscles</label>
          <div style={pickerWrapStyle}>
            <input
              id="muscle-search"
              value={muscleSearch}
              onChange={(e) => setMuscleSearch(e.target.value)}
              placeholder="Start typing to search muscles"
              style={inputStyle}
            />
            {muscleSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingMuscles ? (
                  <div style={dropdownMessageStyle}>Loading muscle options...</div>
                ) : filteredMuscleOptions.length > 0 ? (
                  filteredMuscleOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => addMuscle(option)}
                      style={dropdownItemStyle}
                    >
                      <div style={{ fontWeight: 600 }}>{option.label}</div>
                      <div style={dropdownMetaStyle}>{option.slug}</div>
                    </button>
                  ))
                ) : (
                  <div style={dropdownMessageStyle}>No matching muscles found.</div>
                )}
              </div>
            ) : null}
          </div>
          <div style={selectedSectionStyle}>
            {selectedMuscles.length === 0 ? (
              <p style={helperStyle}>No muscles selected yet.</p>
            ) : (
              <div style={chipContainerStyle}>
                {selectedMuscles.map((option) => (
                  <div key={option.id} style={chipStyle}>
                    <span>{option.label}</span>
                    <button type="button" onClick={() => removeMuscle(option.id)} style={chipRemoveButtonStyle}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label style={labelStyle}>Instructions</label>
          <p style={helperStyle}>Numbered steps explaining how to perform the test.</p>
          {instructions.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ minWidth: "22px", fontWeight: 700, color: "#555", fontSize: "13px" }}>{i + 1}.</span>
              <input
                value={step}
                onChange={(e) => setInstructions(instructions.map((s, j) => j === i ? e.target.value : s))}
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setInstructions(instructions.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "#b00020", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 4px" }}
              >×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            <input
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newInstruction.trim()) {
                    setInstructions([...instructions, newInstruction.trim()]);
                    setNewInstruction("");
                  }
                }
              }}
              placeholder="Add a step and press Enter or click Add"
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => { if (newInstruction.trim()) { setInstructions([...instructions, newInstruction.trim()]); setNewInstruction(""); } }}
              style={addButtonStyle}
            >Add</button>
          </div>

          <label style={labelStyle}>Video links</label>
          <p style={helperStyle}>Paste URLs to demonstration videos (YouTube, Vimeo, etc.).</p>
          {videoUrls.map((url, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <input
                value={url}
                onChange={(e) => setVideoUrls(videoUrls.map((u, j) => j === i ? e.target.value : u))}
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setVideoUrls(videoUrls.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "#b00020", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 4px" }}
              >×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
            <input
              value={newVideoUrl}
              onChange={(e) => setNewVideoUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newVideoUrl.trim()) {
                    setVideoUrls([...videoUrls, newVideoUrl.trim()]);
                    setNewVideoUrl("");
                  }
                }
              }}
              placeholder="Paste a video URL and press Enter or click Add"
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => { if (newVideoUrl.trim()) { setVideoUrls([...videoUrls, newVideoUrl.trim()]); setNewVideoUrl(""); } }}
              style={addButtonStyle}
            >Add</button>
          </div>

          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
          {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

          <div style={buttonRowStyle}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" onClick={() => router.push("/admin/assessment-tests")} style={secondaryButtonStyle}>
              Back
            </button>
          </div>
        </form>
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
  maxWidth: "720px",
  background: "#ffffff",
  padding: "32px",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
};

const titleStyle: React.CSSProperties = {
  textAlign: "center",
  marginBottom: "24px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
  resize: "vertical",
};

const helperStyle: React.CSSProperties = {
  marginTop: "-8px",
  marginBottom: "16px",
  color: "#666",
  fontSize: "13px",
};

const pickerWrapStyle: React.CSSProperties = {
  position: "relative",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% - 16px)",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: "8px",
  boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
  zIndex: 20,
  overflow: "hidden",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "12px",
  border: "none",
  borderBottom: "1px solid #eee",
  background: "#fff",
  cursor: "pointer",
};

const dropdownMetaStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#666",
  marginTop: "4px",
};

const dropdownMessageStyle: React.CSSProperties = {
  padding: "12px",
  color: "#666",
  fontSize: "14px",
};

const selectedSectionStyle: React.CSSProperties = {
  marginBottom: "16px",
};

const chipContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 10px",
  borderRadius: "999px",
  background: "#111",
  color: "#fff",
  fontSize: "14px",
};

const chipRemoveButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#fff",
  cursor: "pointer",
  fontSize: "16px",
  lineHeight: 1,
  padding: 0,
};

const addButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#f5f5f5",
  cursor: "pointer",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const errorStyle: React.CSSProperties = {
  color: "#b00020",
  marginBottom: "16px",
};

const successStyle: React.CSSProperties = {
  color: "#0a7f3f",
  marginBottom: "16px",
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
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 16px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111111",
  fontWeight: 700,
  cursor: "pointer",
};

const segmentedControlStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginBottom: "24px",
};

const segmentStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 16px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#fff",
  color: "#374151",
  fontWeight: 500,
  fontSize: "14px",
  cursor: "pointer",
};

const segmentActiveStyle: React.CSSProperties = {
  ...segmentStyle,
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
  fontWeight: 700,
};

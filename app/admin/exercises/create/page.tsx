"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MovementTag = {
  id: string;
  name: string;
  slug: string;
};

type EquipmentOption = {
  id: string;
  label: string;
  slug: string;
};

type MuscleOption = {
  id: string;
  label: string;
  slug: string;
};

export default function CreateExercisePage() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pattern, setPattern] = useState("");

  const [movementTagSearch, setMovementTagSearch] = useState("");
  const [allMovementTags, setAllMovementTags] = useState<MovementTag[]>([]);
  const [selectedMovementTags, setSelectedMovementTags] = useState<MovementTag[]>([]);
  const [loadingMovementTags, setLoadingMovementTags] = useState(true);

  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [allEquipmentOptions, setAllEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [selectedEquipmentOptions, setSelectedEquipmentOptions] = useState<EquipmentOption[]>([]);
  const [loadingEquipmentOptions, setLoadingEquipmentOptions] = useState(true);

  const [primaryMuscleSearch, setPrimaryMuscleSearch] = useState("");
  const [secondaryMuscleSearch, setSecondaryMuscleSearch] = useState("");
  const [allMuscleOptions, setAllMuscleOptions] = useState<MuscleOption[]>([]);
  const [selectedPrimaryMuscles, setSelectedPrimaryMuscles] = useState<MuscleOption[]>([]);
  const [selectedSecondaryMuscles, setSelectedSecondaryMuscles] = useState<MuscleOption[]>([]);
  const [loadingMuscleOptions, setLoadingMuscleOptions] = useState(true);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoadingMovementTags(true);
      setLoadingEquipmentOptions(true);
      setLoadingMuscleOptions(true);
      setErrorMessage("");

      const [movementTagsResult, equipmentResult, musclesResult] = await Promise.all([
        supabase.from("exercise_movement_tags").select("id, name, slug").order("name"),
        supabase
          .from("equipment_options")
          .select("id, label, slug")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
        supabase
          .from("muscle_options")
          .select("id, label, slug")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      ]);

      const errors: string[] = [];

      if (movementTagsResult.error) {
        errors.push(`Could not load movement tags: ${movementTagsResult.error.message}`);
      } else {
        setAllMovementTags((movementTagsResult.data || []) as MovementTag[]);
      }

      if (equipmentResult.error) {
        errors.push(`Could not load equipment options: ${equipmentResult.error.message}`);
      } else {
        setAllEquipmentOptions((equipmentResult.data || []) as EquipmentOption[]);
      }

      if (musclesResult.error) {
        errors.push(`Could not load muscle options: ${musclesResult.error.message}`);
      } else {
        setAllMuscleOptions((musclesResult.data || []) as MuscleOption[]);
      }

      if (errors.length > 0) {
        setErrorMessage(errors.join(" "));
      }

      setLoadingMovementTags(false);
      setLoadingEquipmentOptions(false);
      setLoadingMuscleOptions(false);
    }

    loadOptions();
  }, [supabase]);

  const filteredMovementTags = useMemo(() => {
    const query = movementTagSearch.trim().toLowerCase();

    return allMovementTags
      .filter((tag) => !selectedMovementTags.some((selected) => selected.id === tag.id))
      .filter((tag) => {
        if (!query) return false;
        return tag.name.toLowerCase().includes(query) || tag.slug.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [allMovementTags, movementTagSearch, selectedMovementTags]);

  const filteredEquipmentOptions = useMemo(() => {
    const query = equipmentSearch.trim().toLowerCase();

    return allEquipmentOptions
      .filter((option) => !selectedEquipmentOptions.some((selected) => selected.id === option.id))
      .filter((option) => {
        if (!query) return false;
        return option.label.toLowerCase().includes(query) || option.slug.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [allEquipmentOptions, equipmentSearch, selectedEquipmentOptions]);

  const filteredPrimaryMuscleOptions = useMemo(() => {
    const query = primaryMuscleSearch.trim().toLowerCase();
    const blockedIds = new Set([
      ...selectedPrimaryMuscles.map((item) => item.id),
      ...selectedSecondaryMuscles.map((item) => item.id),
    ]);

    return allMuscleOptions
      .filter((option) => !blockedIds.has(option.id))
      .filter((option) => {
        if (!query) return false;
        return option.label.toLowerCase().includes(query) || option.slug.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [allMuscleOptions, primaryMuscleSearch, selectedPrimaryMuscles, selectedSecondaryMuscles]);

  const filteredSecondaryMuscleOptions = useMemo(() => {
    const query = secondaryMuscleSearch.trim().toLowerCase();
    const blockedIds = new Set([
      ...selectedPrimaryMuscles.map((item) => item.id),
      ...selectedSecondaryMuscles.map((item) => item.id),
    ]);

    return allMuscleOptions
      .filter((option) => !blockedIds.has(option.id))
      .filter((option) => {
        if (!query) return false;
        return option.label.toLowerCase().includes(query) || option.slug.toLowerCase().includes(query);
      })
      .slice(0, 8);
  }, [allMuscleOptions, secondaryMuscleSearch, selectedPrimaryMuscles, selectedSecondaryMuscles]);

  function addMovementTag(tag: MovementTag) {
    setSelectedMovementTags((current) =>
      current.some((item) => item.id === tag.id) ? current : [...current, tag]
    );
    setMovementTagSearch("");
  }

  function removeMovementTag(tagId: string) {
    setSelectedMovementTags((current) => current.filter((tag) => tag.id !== tagId));
  }

  function addEquipmentOption(option: EquipmentOption) {
    setSelectedEquipmentOptions((current) =>
      current.some((item) => item.id === option.id) ? current : [...current, option]
    );
    setEquipmentSearch("");
  }

  function removeEquipmentOption(optionId: string) {
    setSelectedEquipmentOptions((current) =>
      current.filter((option) => option.id !== optionId)
    );
  }

  function addPrimaryMuscle(option: MuscleOption) {
    setSelectedPrimaryMuscles((current) =>
      current.some((item) => item.id === option.id) ? current : [...current, option]
    );
    setPrimaryMuscleSearch("");
  }

  function removePrimaryMuscle(optionId: string) {
    setSelectedPrimaryMuscles((current) =>
      current.filter((option) => option.id !== optionId)
    );
  }

  function addSecondaryMuscle(option: MuscleOption) {
    setSelectedSecondaryMuscles((current) =>
      current.some((item) => item.id === option.id) ? current : [...current, option]
    );
    setSecondaryMuscleSearch("");
  }

  function removeSecondaryMuscle(optionId: string) {
    setSelectedSecondaryMuscles((current) =>
      current.filter((option) => option.id !== optionId)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const id = makeExerciseId(name);

    if (!id) {
      setErrorMessage("Please enter an exercise name.");
      setSaving(false);
      return;
    }

    const payload = {
      id,
      name: name.trim(),
      description: description.trim(),
      primary_muscles: selectedPrimaryMuscles.map((item) => item.slug),
      secondary_muscles: selectedSecondaryMuscles.map((item) => item.slug),
      movement_tags: selectedMovementTags.map((item) => item.slug),
      equipment: selectedEquipmentOptions.map((item) => item.slug),
      pattern: pattern.trim() || null,
    };

    const { error } = await supabase.from("exercises").insert(payload);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        setErrorMessage("An exercise with this name already exists.");
      } else {
        setErrorMessage(`Could not create exercise: ${error.message}`);
      }
      setSaving(false);
      return;
    }

    setSuccessMessage("Exercise created successfully.");
    setName("");
    setDescription("");
    setPattern("");
    setMovementTagSearch("");
    setSelectedMovementTags([]);
    setEquipmentSearch("");
    setSelectedEquipmentOptions([]);
    setPrimaryMuscleSearch("");
    setSecondaryMuscleSearch("");
    setSelectedPrimaryMuscles([]);
    setSelectedSecondaryMuscles([]);
    setSaving(false);
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Create Exercise</h1>

        <form onSubmit={handleSubmit}>
          <label htmlFor="name" style={labelStyle}>
            Exercise name
          </label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={inputStyle}
            required
          />

          <label htmlFor="description" style={labelStyle}>
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            style={textareaStyle}
          />

          <label htmlFor="primary-muscle-search" style={labelStyle}>
            Primary muscles
          </label>
          <div style={pickerWrapStyle}>
            <input
              id="primary-muscle-search"
              value={primaryMuscleSearch}
              onChange={(event) => setPrimaryMuscleSearch(event.target.value)}
              placeholder="Start typing to search primary muscles"
              style={inputStyle}
            />
            {primaryMuscleSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingMuscleOptions ? (
                  <div style={dropdownMessageStyle}>Loading muscle options...</div>
                ) : filteredPrimaryMuscleOptions.length > 0 ? (
                  filteredPrimaryMuscleOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => addPrimaryMuscle(option)}
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
            {selectedPrimaryMuscles.length === 0 ? (
              <p style={helperStyle}>No primary muscles selected yet.</p>
            ) : (
              <div style={chipContainerStyle}>
                {selectedPrimaryMuscles.map((option) => (
                  <div key={option.id} style={chipStyle}>
                    <span>{option.label}</span>
                    <button
                      type="button"
                      onClick={() => removePrimaryMuscle(option.id)}
                      style={chipRemoveButtonStyle}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="secondary-muscle-search" style={labelStyle}>
            Secondary muscles
          </label>
          <div style={pickerWrapStyle}>
            <input
              id="secondary-muscle-search"
              value={secondaryMuscleSearch}
              onChange={(event) => setSecondaryMuscleSearch(event.target.value)}
              placeholder="Start typing to search secondary muscles"
              style={inputStyle}
            />
            {secondaryMuscleSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingMuscleOptions ? (
                  <div style={dropdownMessageStyle}>Loading muscle options...</div>
                ) : filteredSecondaryMuscleOptions.length > 0 ? (
                  filteredSecondaryMuscleOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => addSecondaryMuscle(option)}
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
            {selectedSecondaryMuscles.length === 0 ? (
              <p style={helperStyle}>No secondary muscles selected yet.</p>
            ) : (
              <div style={chipContainerStyle}>
                {selectedSecondaryMuscles.map((option) => (
                  <div key={option.id} style={chipStyle}>
                    <span>{option.label}</span>
                    <button
                      type="button"
                      onClick={() => removeSecondaryMuscle(option.id)}
                      style={chipRemoveButtonStyle}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="movement-tag-search" style={labelStyle}>
            Movement tags
          </label>
          <div style={pickerWrapStyle}>
            <input
              id="movement-tag-search"
              value={movementTagSearch}
              onChange={(event) => setMovementTagSearch(event.target.value)}
              placeholder="Start typing to search movement tags"
              style={inputStyle}
            />
            {movementTagSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingMovementTags ? (
                  <div style={dropdownMessageStyle}>Loading movement tags...</div>
                ) : filteredMovementTags.length > 0 ? (
                  filteredMovementTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => addMovementTag(tag)}
                      style={dropdownItemStyle}
                    >
                      <div style={{ fontWeight: 600 }}>{tag.name}</div>
                      <div style={dropdownMetaStyle}>{tag.slug}</div>
                    </button>
                  ))
                ) : (
                  <div style={dropdownMessageStyle}>No matching movement tags found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div style={selectedSectionStyle}>
            {selectedMovementTags.length === 0 ? (
              <p style={helperStyle}>No movement tags selected yet.</p>
            ) : (
              <div style={chipContainerStyle}>
                {selectedMovementTags.map((tag) => (
                  <div key={tag.id} style={chipStyle}>
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      onClick={() => removeMovementTag(tag.id)}
                      style={chipRemoveButtonStyle}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="equipment-search" style={labelStyle}>
            Equipment
          </label>
          <div style={pickerWrapStyle}>
            <input
              id="equipment-search"
              value={equipmentSearch}
              onChange={(event) => setEquipmentSearch(event.target.value)}
              placeholder="Start typing to search equipment"
              style={inputStyle}
            />
            {equipmentSearch.trim() ? (
              <div style={dropdownStyle}>
                {loadingEquipmentOptions ? (
                  <div style={dropdownMessageStyle}>Loading equipment options...</div>
                ) : filteredEquipmentOptions.length > 0 ? (
                  filteredEquipmentOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => addEquipmentOption(option)}
                      style={dropdownItemStyle}
                    >
                      <div style={{ fontWeight: 600 }}>{option.label}</div>
                      <div style={dropdownMetaStyle}>{option.slug}</div>
                    </button>
                  ))
                ) : (
                  <div style={dropdownMessageStyle}>No matching equipment found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div style={selectedSectionStyle}>
            {selectedEquipmentOptions.length === 0 ? (
              <p style={helperStyle}>No equipment selected yet.</p>
            ) : (
              <div style={chipContainerStyle}>
                {selectedEquipmentOptions.map((option) => (
                  <div key={option.id} style={chipStyle}>
                    <span>{option.label}</span>
                    <button
                      type="button"
                      onClick={() => removeEquipmentOption(option.id)}
                      style={chipRemoveButtonStyle}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label htmlFor="pattern" style={labelStyle}>
            Pattern
          </label>
          <input
            id="pattern"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="e.g. squat, hinge, push, pull"
            style={inputStyle}
          />

          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
          {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

          <div style={buttonRowStyle}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Creating..." : "Create Exercise"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin")}
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

function makeExerciseId(value: string) {
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
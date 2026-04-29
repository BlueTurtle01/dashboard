"use client";
export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type ExerciseRow = {
  id: string;
  name: string;
  alternative_names: string[] | null;
  description: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  movement_tags: string[];
  equipment: string[];
  pattern: string | null;
  sets: number | null;
  reps: number | null;
};

export default function EditExercisePage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();

  const exerciseId =
    typeof params.exerciseId === "string" ? params.exerciseId : "";

  const [name, setName] = useState("");
  const [alternativeNames, setAlternativeNames] = useState("");
  const [description, setDescription] = useState("");
  const [pattern, setPattern] = useState("");
  const [defaultSets, setDefaultSets] = useState("");
  const [defaultReps, setDefaultReps] = useState("");

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

  const [loadingExercise, setLoadingExercise] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Alternative exercises state
  type AlternativeLink = { id: string; alternativeExerciseId: string; alternativeName: string; priority: number };
  const [alternatives, setAlternatives] = useState<AlternativeLink[]>([]);
  const [altSearch, setAltSearch] = useState("");
  const [altSearchResults, setAltSearchResults] = useState<ExerciseRow[]>([]);
  const [loadingAltSearch, setLoadingAltSearch] = useState(false);

  useEffect(() => {
    async function loadPageData() {
      if (!exerciseId) {
        setErrorMessage("No exercise ID was provided.");
        setLoadingExercise(false);
        setLoadingMovementTags(false);
        setLoadingEquipmentOptions(false);
        setLoadingMuscleOptions(false);
        return;
      }

      setLoadingExercise(true);
      setLoadingMovementTags(true);
      setLoadingEquipmentOptions(true);
      setLoadingMuscleOptions(true);
      setErrorMessage("");
      setSuccessMessage("");

      const [exerciseResult, movementTagsResult, equipmentResult, musclesResult, alternativesResult] =
        await Promise.all([
          supabase
            .from("exercises")
            .select(
              "id, name, alternative_names, description, primary_muscles, secondary_muscles, movement_tags, equipment, pattern, sets, reps"
            )
            .eq("id", exerciseId)
            .single(),
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
          supabase
            .from("exercise_alternative_links")
            .select("id, priority, alternative_exercise_id, exercises!alternative_exercise_id(name)")
            .eq("exercise_id", exerciseId)
            .order("priority"),
        ]);

      const errors: string[] = [];

      let movementTags: MovementTag[] = [];
      let equipmentOptions: EquipmentOption[] = [];
      let muscleOptions: MuscleOption[] = [];

      if (exerciseResult.error) {
        errors.push(`Could not load exercise: ${exerciseResult.error.message}`);
      }

      if (movementTagsResult.error) {
        errors.push(`Could not load movement tags: ${movementTagsResult.error.message}`);
      } else {
        movementTags = (movementTagsResult.data || []) as MovementTag[];
        setAllMovementTags(movementTags);
      }

      if (equipmentResult.error) {
        errors.push(`Could not load equipment options: ${equipmentResult.error.message}`);
      } else {
        equipmentOptions = (equipmentResult.data || []) as EquipmentOption[];
        setAllEquipmentOptions(equipmentOptions);
      }

      if (musclesResult.error) {
        errors.push(`Could not load muscle options: ${musclesResult.error.message}`);
      } else {
        muscleOptions = (musclesResult.data || []) as MuscleOption[];
        setAllMuscleOptions(muscleOptions);
      }

      // Process alternatives
      if (alternativesResult.error) {
        errors.push(`Could not load alternatives: ${alternativesResult.error.message}`);
      } else if (alternativesResult.data) {
        const alts = (alternativesResult.data as any[]).map((row: any) => ({
          id: row.id,
          alternativeExerciseId: row.alternative_exercise_id,
          alternativeName: row.exercises?.name || "",
          priority: row.priority,
        }));
        setAlternatives(alts);
      }

      if (!exerciseResult.error && exerciseResult.data) {
        const exercise = exerciseResult.data as ExerciseRow;

        setName(exercise.name || "");
        setAlternativeNames((exercise.alternative_names ?? []).join("\n"));
        setDescription(exercise.description || "");
        setPattern(exercise.pattern || "");
        setDefaultSets(exercise.sets == null ? "" : String(exercise.sets));
        setDefaultReps(exercise.reps == null ? "" : String(exercise.reps));

        setSelectedMovementTags(
          movementTags.filter((tag) => (exercise.movement_tags || []).includes(tag.slug))
        );

        setSelectedEquipmentOptions(
          equipmentOptions.filter((option) => (exercise.equipment || []).includes(option.slug))
        );

        setSelectedPrimaryMuscles(
          muscleOptions.filter((option) => (exercise.primary_muscles || []).includes(option.slug))
        );

        setSelectedSecondaryMuscles(
          muscleOptions.filter((option) =>
            (exercise.secondary_muscles || []).includes(option.slug)
          )
        );
      }

      if (errors.length > 0) {
        setErrorMessage(errors.join(" "));
      }

      setLoadingExercise(false);
      setLoadingMovementTags(false);
      setLoadingEquipmentOptions(false);
      setLoadingMuscleOptions(false);
    }

    loadPageData();
  }, [exerciseId, supabase]);

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

  async function handleSearchAlternatives() {
    if (!altSearch.trim()) {
      setAltSearchResults([]);
      return;
    }

    setLoadingAltSearch(true);
    const query = altSearch.trim().toLowerCase();
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, description, primary_muscles, secondary_muscles, movement_tags, equipment, pattern")
      .neq("id", exerciseId)
      .ilike("name", `%${altSearch}%`)
      .limit(8);

    if (!error && data) {
      const filtered = (data as ExerciseRow[]).filter(
        (ex) => !alternatives.some((alt) => alt.alternativeExerciseId === ex.id)
      );
      setAltSearchResults(filtered);
    }
    setLoadingAltSearch(false);
  }

  async function handleAddAlternative(altEx: ExerciseRow) {
    const { error } = await supabase.from("exercise_alternative_links").insert({
      exercise_id: exerciseId,
      alternative_exercise_id: altEx.id,
      priority: alternatives.length,
    });

    if (!error) {
      setAlternatives([
        ...alternatives,
        {
          id: `new-${Math.random()}`,
          alternativeExerciseId: altEx.id,
          alternativeName: altEx.name,
          priority: alternatives.length,
        },
      ]);
      setAltSearch("");
      setAltSearchResults([]);
    }
  }

  async function handleRemoveAlternative(linkId: string) {
    const { error } = await supabase
      .from("exercise_alternative_links")
      .delete()
      .eq("id", linkId);

    if (!error) {
      setAlternatives(alternatives.filter((alt) => alt.id !== linkId));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!exerciseId) {
      setErrorMessage("No exercise ID was provided.");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Please enter an exercise name.");
      setSaving(false);
      return;
    }

    const payload = {
      name: trimmedName,
      alternative_names: parseAlternativeNames(alternativeNames),
      description: description.trim(),
      primary_muscles: selectedPrimaryMuscles.map((item) => item.slug),
      secondary_muscles: selectedSecondaryMuscles.map((item) => item.slug),
      movement_tags: selectedMovementTags.map((item) => item.slug),
      equipment: selectedEquipmentOptions.map((item) => item.slug),
      pattern: pattern.trim() || null,
      sets: parseOptionalPositiveInteger(defaultSets),
      reps: parseOptionalPositiveInteger(defaultReps),
    };

    const { error } = await supabase
      .from("exercises")
      .update(payload)
      .eq("id", exerciseId);

    if (error) {
      setErrorMessage(`Could not update exercise: ${error.message}`);
      setSaving(false);
      return;
    }

    setSuccessMessage("Exercise updated successfully.");
    setSaving(false);
  }

  if (loadingExercise) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={titleStyle}>Edit Exercise</h1>
          <p>Loading exercise...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Edit Exercise</h1>

        {exerciseId ? (
          <p style={helperStyle}>
            Editing exercise ID: <strong>{exerciseId}</strong>
          </p>
        ) : null}

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

          <label htmlFor="alternative-names" style={labelStyle}>
            Alternative names
          </label>
          <textarea
            id="alternative-names"
            value={alternativeNames}
            onChange={(event) => setAlternativeNames(event.target.value)}
            rows={3}
            placeholder="One per line, e.g. RDL"
            style={textareaStyle}
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

          <div style={numberGridStyle}>
            <div>
              <label htmlFor="default-sets" style={labelStyle}>
                Default sets
              </label>
              <input
                id="default-sets"
                type="number"
                min="0"
                step="1"
                value={defaultSets}
                onChange={(event) => setDefaultSets(event.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="default-reps" style={labelStyle}>
                Default reps
              </label>
              <input
                id="default-reps"
                type="number"
                min="0"
                step="1"
                value={defaultReps}
                onChange={(event) => setDefaultReps(event.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
          {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

          {/* Alternative Exercises Section */}
          <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #e5e5e5" }}>
            <h3 style={{ marginBottom: "16px", fontSize: "18px", fontWeight: "600" }}>Alternative Exercises</h3>

            {/* Live Search */}
            <div style={{ marginBottom: "16px" }}>
              <label style={labelStyle}>Search for alternatives</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  value={altSearch}
                  onChange={(e) => setAltSearch(e.target.value)}
                  onKeyUp={handleSearchAlternatives}
                  placeholder="Search by name or ID..."
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>

              {/* Search Results */}
              {altSearchResults.length > 0 && (
                <div style={{ marginTop: "8px", border: "1px solid #e5e5e5", borderRadius: "6px", maxHeight: "200px", overflowY: "auto" }}>
                  {altSearchResults.map((result) => (
                    <div
                      key={result.id}
                      style={{
                        padding: "8px 12px",
                        borderBottom: "1px solid #f0f0f0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>{result.name}</span>
                      <button
                        type="button"
                        onClick={() => handleAddAlternative(result)}
                        style={{
                          padding: "4px 12px",
                          background: "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current Alternatives List */}
            {alternatives.length > 0 && (
              <div style={{ marginTop: "16px" }}>
                <h4 style={{ marginBottom: "12px", fontSize: "14px", fontWeight: "500" }}>Linked alternatives:</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {alternatives.map((alt) => (
                    <div
                      key={alt.id}
                      style={{
                        padding: "12px",
                        background: "#f8f9fa",
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "500" }}>{alt.alternativeName}</div>
                        <div style={{ fontSize: "12px", color: "#666" }}>Priority: {alt.priority}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAlternative(alt.id)}
                        style={{
                          padding: "4px 12px",
                          background: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={buttonRowStyle}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Saving..." : "Save Changes"}
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/exercises")}
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

function parseOptionalPositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed) || parsed < 0) return null;

  return parsed;
}

function parseAlternativeNames(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
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

const numberGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
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

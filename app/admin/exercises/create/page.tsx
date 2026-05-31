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

  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [infoLink, setInfoLink] = useState("");

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

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true);
    setErrorMessage("");
    const ext = file.name.split(".").pop() ?? "jpg";
    const uploadId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString(36);
    const path = `exercise-photos/${uploadId}.${ext}`;
    const { error } = await supabase.storage.from("exercise-media").upload(path, file, { upsert: true });
    if (error) {
      setErrorMessage(`Photo upload failed: ${error.message}`);
      setUploadingPhoto(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("exercise-media").getPublicUrl(path);
    setPhotoUrl(publicUrl);
    setUploadingPhoto(false);
  }

  function clearPhoto() {
    setPhotoUrl(null);
  }

  async function uploadVideo(file: File) {
    setUploadingVideo(true);
    setErrorMessage("");
    const ext = file.name.split(".").pop() ?? "mp4";
    const uploadId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString(36);
    const path = `exercise-videos/${uploadId}.${ext}`;
    const { error } = await supabase.storage.from("exercise-media").upload(path, file, { upsert: true });
    if (error) {
      setErrorMessage(`Video upload failed: ${error.message}`);
      setUploadingVideo(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("exercise-media").getPublicUrl(path);
    setVideoUrl(publicUrl);
    setUploadingVideo(false);
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
      alternative_names: parseAlternativeNames(alternativeNames),
      description: description.trim(),
      primary_muscles: selectedPrimaryMuscles.map((item) => item.slug),
      secondary_muscles: selectedSecondaryMuscles.map((item) => item.slug),
      movement_tags: selectedMovementTags.map((item) => item.slug),
      equipment: selectedEquipmentOptions.map((item) => item.slug),
      pattern: pattern.trim() || null,
      sets: parseOptionalPositiveInteger(defaultSets),
      reps: parseOptionalPositiveInteger(defaultReps),
      photo_url: photoUrl,
      video_url: videoUrl.trim() || null,
      steps: steps.filter((s) => s.trim().length > 0),
      info_link: infoLink.trim() || null,
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
    setAlternativeNames("");
    setDescription("");
    setPattern("");
    setDefaultSets("");
    setDefaultReps("");
    setMovementTagSearch("");
    setSelectedMovementTags([]);
    setEquipmentSearch("");
    setSelectedEquipmentOptions([]);
    setPrimaryMuscleSearch("");
    setSecondaryMuscleSearch("");
    setSelectedPrimaryMuscles([]);
    setSelectedSecondaryMuscles([]);
    setPhotoUrl(null);
    setVideoUrl("");
    setUploadingVideo(false);
    setSteps([]);
    setNewStep("");
    setInfoLink("");
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

          <label style={labelStyle}>Steps</label>
          <p style={helperStyle}>Numbered instructions shown on the programme export.</p>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ minWidth: "22px", fontWeight: 700, color: "#555", fontSize: "13px" }}>{i + 1}.</span>
              <input
                value={step}
                onChange={(e) => setSteps(steps.map((s, j) => j === i ? e.target.value : s))}
                style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", color: "#b00020", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 4px" }}
              >×</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); if (newStep.trim()) { setSteps([...steps, newStep.trim()]); setNewStep(""); } }
              }}
              placeholder="Add a step and press Enter or click Add"
              style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => { if (newStep.trim()) { setSteps([...steps, newStep.trim()]); setNewStep(""); } }}
              style={{ padding: "10px 16px", border: "1px solid #ccc", borderRadius: "8px", background: "#f5f5f5", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
            >Add</button>
          </div>

          <label style={labelStyle}>Photo</label>
          {photoUrl ? (
            <div style={thumbnailRowStyle}>
              <img src={photoUrl} alt="" style={thumbnailStyle} />
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <label style={replaceButtonStyle}>
                  {uploadingPhoto ? "Uploading…" : "Replace"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    disabled={uploadingPhoto}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); }}
                  />
                </label>
                <button type="button" onClick={clearPhoto} style={removePhotoStyle}>Remove</button>
              </div>
            </div>
          ) : (
            <label style={uploadAreaStyle(uploadingPhoto)}>
              <span style={{ color: "#666", fontSize: "14px" }}>
                {uploadingPhoto ? "Uploading…" : "Click to upload a photo"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                disabled={uploadingPhoto}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); }}
              />
            </label>
          )}

          <label style={labelStyle}>Video</label>
          {videoUrl ? (
            <div style={{ marginBottom: "16px" }}>
              {isDirectVideoUrl(videoUrl) && (
                <video src={videoUrl} controls style={videoPlayerStyle} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px" }}>
                <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={videoLinkStyle}>
                  Open ↗
                </a>
                <label style={{ ...replaceButtonStyle, cursor: uploadingVideo ? "default" : "pointer" }}>
                  {uploadingVideo ? "Uploading…" : "Replace"}
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                    style={{ display: "none" }}
                    disabled={uploadingVideo}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadVideo(f); }}
                  />
                </label>
                <button type="button" onClick={() => setVideoUrl("")} style={removePhotoStyle}>Remove</button>
              </div>
            </div>
          ) : (
            <label style={uploadAreaStyle(uploadingVideo)}>
              <span style={{ color: "#666", fontSize: "14px" }}>
                {uploadingVideo ? "Uploading…" : "Click to upload a video"}
              </span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                style={{ display: "none" }}
                disabled={uploadingVideo}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadVideo(f); }}
              />
            </label>
          )}
          <label htmlFor="video-url" style={labelStyle}>Or paste a video URL</label>
          <input
            id="video-url"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            style={inputStyle}
          />

          <label htmlFor="info-link" style={labelStyle}>Reference link (admin only)</label>
          <input
            id="info-link"
            type="url"
            value={infoLink}
            onChange={(e) => setInfoLink(e.target.value)}
            placeholder="https://…"
            style={inputStyle}
          />

          {errorMessage ? <p style={errorStyle}>{errorMessage}</p> : null}
          {successMessage ? <p style={successStyle}>{successMessage}</p> : null}

          <div style={buttonRowStyle}>
            <button type="submit" disabled={saving || uploadingPhoto || uploadingVideo} style={buttonStyle}>
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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  marginBottom: "16px",
  resize: "vertical",
};

const numberGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
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

function uploadAreaStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "2px dashed #ccc",
    borderRadius: "8px",
    padding: "24px",
    cursor: disabled ? "default" : "pointer",
    marginBottom: "16px",
    background: "#fafafa",
    opacity: disabled ? 0.5 : 1,
  };
}

const thumbnailRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
  marginBottom: "16px",
};

const thumbnailStyle: React.CSSProperties = {
  width: "64px",
  height: "64px",
  objectFit: "cover",
  borderRadius: "8px",
  border: "1px solid #eee",
};

const replaceButtonStyle: React.CSSProperties = {
  display: "block",
  padding: "6px 12px",
  border: "1px solid #ccc",
  borderRadius: "6px",
  background: "#fff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 600,
  textAlign: "center",
};

const removePhotoStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#b00020",
  cursor: "pointer",
  fontSize: "13px",
  padding: 0,
};

const videoLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: "-8px",
  marginBottom: "16px",
  fontSize: "13px",
  color: "#1a56db",
};

const videoPlayerStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: "8px",
  border: "1px solid #eee",
  maxHeight: "240px",
};

function isDirectVideoUrl(url: string) {
  return url.includes("supabase.co") || /\.(mp4|webm|mov|avi)(\?|$)/i.test(url);
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WindAnalysisSettings } from "@/lib/race-analysis/types";
import { DEFAULT_WIND_SETTINGS } from "@/lib/race-analysis/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type FileType = "gpx" | "wind_analysis" | "course_map" | "elevation_profile" | "other";

interface RaceFile {
  id: string;
  race_id: string;
  file_type: FileType;
  file_name: string;
  storage_path: string;
  public_url: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  uploaded_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Race {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  has_terrain_segments: boolean;
}

interface RaceWithFiles extends Race {
  files: RaceFile[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FILE_TYPE_LABELS: Record<FileType, string> = {
  gpx: "GPX Course",
  wind_analysis: "Wind Analysis",
  course_map: "Course Map",
  elevation_profile: "Elevation Profile",
  other: "Other",
};

const FILE_TYPE_ACCEPT: Record<FileType, string> = {
  gpx: ".gpx,application/gpx+xml,application/xml,text/xml",
  wind_analysis: ".csv,text/csv,application/csv",
  course_map: ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf",
  elevation_profile: ".png,.jpg,.jpeg,.csv,image/png,image/jpeg,text/csv",
  other: "*",
};

const FILE_TYPE_ORDER: FileType[] = [
  "gpx",
  "wind_analysis",
  "course_map",
  "elevation_profile",
  "other",
];

const BUCKET = "race-files";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeColor(type: FileType): { bg: string; text: string } {
  const map: Record<FileType, { bg: string; text: string }> = {
    gpx: { bg: "#e0f2fe", text: "#0369a1" },
    wind_analysis: { bg: "#f0fdf4", text: "#15803d" },
    course_map: { bg: "#fef9c3", text: "#92400e" },
    elevation_profile: { bg: "#fce7f3", text: "#9d174d" },
    other: { bg: "#f4f4f5", text: "#52525b" },
  };
  return map[type] ?? map.other;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RaceFilesPage() {
  const supabase = createClient();

  const [races, setRaces] = useState<RaceWithFiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRaceId, setExpandedRaceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Per-race upload state: { [raceId]: { [fileType]: boolean } }
  const [uploading, setUploading] = useState<Record<string, Record<string, boolean>>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});

  // Wind analysis generation
  const [windModalRaceId, setWindModalRaceId] = useState<string | null>(null);
  const [windSettings, setWindSettings] = useState<WindAnalysisSettings>({ ...DEFAULT_WIND_SETTINGS });
  const [windGenerating, setWindGenerating] = useState<Record<string, boolean>>({});
  const [windError, setWindError] = useState<Record<string, string>>({});
  const [windSuccess, setWindSuccess] = useState<Record<string, string>>({});

  // Race profile generation
  const [profileGenerating, setProfileGenerating] = useState<Record<string, boolean>>({});
  const [profileError, setProfileError] = useState<Record<string, string>>({});
  const [profileSuccess, setProfileSuccess] = useState<Record<string, string>>({});

  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const [batchReprocessing, setBatchReprocessing] = useState(false);
  const [batchReprocessMsg, setBatchReprocessMsg] = useState<string | null>(null);

  // Hidden file inputs per (race × fileType)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const { data: racesData, error: racesErr } = await supabase
        .from("races")
        .select("id, name, slug, location")
        .order("name", { ascending: true });

      if (racesErr || !racesData) throw new Error(racesErr?.message ?? "Failed to load races");

      const { data: filesData, error: filesErr } = await supabase
        .from("race_files")
        .select("*")
        .order("created_at", { ascending: true });

      if (filesErr) throw new Error(filesErr.message);

      const { data: terrainMeta } = await supabase
        .from("races_meta")
        .select("race_id")
        .eq("meta_key", "terrain_segments");

      const racesWithTerrain = new Set((terrainMeta ?? []).map((m: { race_id: string }) => m.race_id));

      const filesByRace = new Map<string, RaceFile[]>();
      for (const f of (filesData ?? []) as RaceFile[]) {
        if (!filesByRace.has(f.race_id)) filesByRace.set(f.race_id, []);
        filesByRace.get(f.race_id)!.push(f);
      }

      setRaces(
        (racesData as Omit<Race, "has_terrain_segments" | "files">[]).map((r) => ({
          ...r,
          has_terrain_segments: racesWithTerrain.has(r.id),
          files: filesByRace.get(r.id) ?? [],
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleFileSelected(
    raceId: string,
    fileType: FileType,
    file: File
  ) {
    const key = `${raceId}_${fileType}`;
    setUploading((prev) => ({ ...prev, [raceId]: { ...prev[raceId], [fileType]: true } }));
    setUploadError((prev) => ({ ...prev, [key]: "" }));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop() ?? "bin";
      const uuid = crypto.randomUUID();
      const storagePath = `${raceId}/${fileType}/${uuid}.${ext}`;

      // Check if a file of this type already exists for this race
      const existingFile = races
        .find((r) => r.id === raceId)
        ?.files.find((f) => f.file_type === fileType);

      // Upload to storage (upsert if replacing)
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false });

      if (storageErr) throw new Error(storageErr.message);

      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      if (existingFile) {
        // Delete old storage object
        await supabase.storage.from(BUCKET).remove([existingFile.storage_path]);

        // Update DB row
        const { error: updateErr } = await supabase
          .from("race_files")
          .update({
            file_name: file.name,
            storage_path: storagePath,
            public_url: publicUrl,
            file_size_bytes: file.size,
            mime_type: file.type || null,
            uploaded_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingFile.id);

        if (updateErr) throw new Error(updateErr.message);
      } else {
        // Insert new DB row
        const { error: insertErr } = await supabase.from("race_files").insert({
          race_id: raceId,
          file_type: fileType,
          file_name: file.name,
          storage_path: storagePath,
          public_url: publicUrl,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          uploaded_by: user.id,
        });

        if (insertErr) throw new Error(insertErr.message);
      }

      await loadData();
    } catch (err) {
      setUploadError((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setUploading((prev) => ({ ...prev, [raceId]: { ...prev[raceId], [fileType]: false } }));
      // Reset the hidden input so the same file can be re-selected if needed
      const inputKey = `${raceId}_${fileType}`;
      if (inputRefs.current[inputKey]) {
        inputRefs.current[inputKey]!.value = "";
      }
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(raceId: string, file: RaceFile) {
    if (!confirm(`Delete "${file.file_name}"? This cannot be undone.`)) return;

    setDeleting((prev) => ({ ...prev, [file.id]: true }));
    try {
      await supabase.storage.from(BUCKET).remove([file.storage_path]);
      const { error: dbErr } = await supabase
        .from("race_files")
        .delete()
        .eq("id", file.id);
      if (dbErr) throw new Error(dbErr.message);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting((prev) => ({ ...prev, [file.id]: false }));
    }
  }

  // ── Wind analysis generation ──────────────────────────────────────────────

  async function handleGenerateWind(raceId: string) {
    setWindModalRaceId(null);
    setWindGenerating((prev) => ({ ...prev, [raceId]: true }));
    setWindError((prev) => ({ ...prev, [raceId]: "" }));
    setWindSuccess((prev) => ({ ...prev, [raceId]: "" }));

    try {
      const res = await fetch("/api/race-analysis/wind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId, settings: windSettings }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setWindError((prev) => ({ ...prev, [raceId]: json.error ?? "Generation failed" }));
        return;
      }

      setWindSuccess((prev) => ({
        ...prev,
        [raceId]: `Generated from ${json.gpx_points} GPX points → ${json.sections_count} sections.`,
      }));
      await loadData();
    } catch (err) {
      setWindError((prev) => ({
        ...prev,
        [raceId]: err instanceof Error ? err.message : "Network error",
      }));
    } finally {
      setWindGenerating((prev) => ({ ...prev, [raceId]: false }));
    }
  }

  // ── Race profile generation ───────────────────────────────────────────────

  async function handleGenerateProfile(raceId: string) {
    setProfileGenerating((prev) => ({ ...prev, [raceId]: true }));
    setProfileError((prev) => ({ ...prev, [raceId]: "" }));
    setProfileSuccess((prev) => ({ ...prev, [raceId]: "" }));

    try {
      const res = await fetch("/api/race-analysis/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        setProfileError((prev) => ({ ...prev, [raceId]: json.error ?? "Generation failed" }));
        return;
      }

      setProfileSuccess((prev) => ({
        ...prev,
        [raceId]:
          `${json.total_distance_km} km · flat equiv ${json.flat_equivalent_km} km` +
          (json.difficulty_ratio ? ` (${json.difficulty_ratio}×)` : "") +
          (json.wind_adjusted_flat_equivalent_km
            ? ` · wind-adj ${json.wind_adjusted_flat_equivalent_km} km`
            : "") +
          (json.terrain_source === "osm"
            ? ` · OSM terrain (${json.terrain_segments_count} segments)`
            : " · fallback terrain"),
      }));
      await loadData();
    } catch (err) {
      setProfileError((prev) => ({
        ...prev,
        [raceId]: err instanceof Error ? err.message : "Network error",
      }));
    } finally {
      setProfileGenerating((prev) => ({ ...prev, [raceId]: false }));
    }
  }

  // ── Filtered races ────────────────────────────────────────────────────────

  const filteredRaces = races.filter((r) =>
    search.trim() === ""
      ? true
      : r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Styles ────────────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f5f5f5",
    padding: "32px 24px",
  };

  const innerStyle: React.CSSProperties = {
    maxWidth: "900px",
    margin: "0 auto",
  };

  const headingStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 700,
    color: "#111",
    margin: "0 0 6px 0",
  };

  const subheadingStyle: React.CSSProperties = {
    fontSize: "15px",
    color: "#666",
    margin: "0 0 28px 0",
  };

  const searchStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "14px",
    marginBottom: "20px",
    boxSizing: "border-box",
    background: "#fff",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #e4e4e7",
    marginBottom: "12px",
    overflow: "hidden",
  };

  const cardHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    cursor: "pointer",
    userSelect: "none",
  };

  const cardBodyStyle: React.CSSProperties = {
    borderTop: "1px solid #e4e4e7",
    padding: "20px",
  };

  const fileRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 14px",
    borderRadius: "8px",
    background: "#fafafa",
    border: "1px solid #e4e4e7",
    marginBottom: "8px",
  };

  const uploadSectionStyle: React.CSSProperties = {
    marginTop: "16px",
    paddingTop: "16px",
    borderTop: "1px solid #e4e4e7",
  };

  const uploadBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "7px 13px",
    borderRadius: "7px",
    border: "1px solid #d1d5db",
    background: "#fff",
    fontSize: "13px",
    fontWeight: 500,
    color: "#374151",
    cursor: "pointer",
    marginRight: "8px",
    marginBottom: "8px",
  };

  const uploadBtnLoadingStyle: React.CSSProperties = {
    ...uploadBtnStyle,
    opacity: 0.6,
    cursor: "not-allowed",
  };

  const iconBtnStyle: React.CSSProperties = {
    padding: "5px 9px",
    borderRadius: "6px",
    border: "1px solid #e4e4e7",
    background: "#fff",
    cursor: "pointer",
    fontSize: "13px",
    color: "#374151",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };

  const deleteBtnStyle: React.CSSProperties = {
    ...iconBtnStyle,
    color: "#b91c1c",
    borderColor: "#fca5a5",
    background: "#fff5f5",
  };

  async function handleBackfillCoords() {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const res  = await fetch("/api/admin/backfill-race-coords", { method: "POST" });
      const json = await res.json() as { updated?: number; skipped?: number; errors?: number; error?: string };
      if (!res.ok || json.error) {
        setBackfillMsg(`Error: ${json.error ?? "Unknown error"}`);
      } else {
        setBackfillMsg(
          `Done — ${json.updated} updated, ${json.skipped} already had coordinates${json.errors ? `, ${json.errors} failed` : ""}.`
        );
      }
    } catch {
      setBackfillMsg("Network error running backfill.");
    }
    setBackfilling(false);
  }

  async function handleBatchReprocess() {
    const eligible = races.filter((r) => r.files.some((f) => f.file_type === "gpx"));
    if (eligible.length === 0) {
      setBatchReprocessMsg("No races with a GPX file to reprocess.");
      return;
    }
    setBatchReprocessing(true);
    setBatchReprocessMsg(null);
    let done = 0, failed = 0;
    for (const race of eligible) {
      try {
        const res = await fetch("/api/race-analysis/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ race_id: race.id }),
        });
        const json = await res.json() as { success?: boolean; error?: string };
        if (!res.ok || !json.success) { failed++; } else { done++; }
      } catch { failed++; }
      setBatchReprocessMsg(`Processing… ${done + failed} / ${eligible.length}`);
    }
    setBatchReprocessing(false);
    setBatchReprocessMsg(`Done — ${done} reprocessed, ${failed} failed.`);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <div style={innerStyle}>
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <Link
              href="/admin"
              style={{ fontSize: "13px", color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              ← Back to Admin
            </Link>
            <Link
              href="/admin/race-comparison"
              style={{ fontSize: "13px", color: "#4f46e5", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: 500 }}
            >
              Race Comparison →
            </Link>
          </div>
          <h1 style={headingStyle}>Race File Manager</h1>
          <p style={subheadingStyle}>
            Upload and manage GPX courses, wind analysis CSVs, and other files for each race.
            These files power the automated pacing analysis pipeline.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void handleBackfillCoords()}
              disabled={backfilling}
              style={{ padding: "7px 14px", fontSize: "13px", fontWeight: 500, borderRadius: "7px", border: "1px solid #d1d5db", background: backfilling ? "#f3f4f6" : "#fff", color: "#374151", cursor: backfilling ? "default" : "pointer" }}
            >
              {backfilling ? "⏳ Backfilling…" : "📍 Backfill Race Coordinates"}
            </button>
            {backfillMsg && (
              <span style={{ fontSize: "12px", color: backfillMsg.startsWith("Error") ? "#b91c1c" : "#166534" }}>
                {backfillMsg}
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleBatchReprocess()}
              disabled={batchReprocessing}
              style={{ padding: "7px 14px", fontSize: "13px", fontWeight: 500, borderRadius: "7px", border: "1px solid #86efac", background: batchReprocessing ? "#f0fdf4" : "#dcfce7", color: "#15803d", cursor: batchReprocessing ? "default" : "pointer" }}
            >
              {batchReprocessing ? "⏳ Reprocessing…" : "♻ Batch Reprocess All Profiles"}
            </button>
            {batchReprocessMsg && (
              <span style={{ fontSize: "12px", color: batchReprocessMsg.startsWith("Done") ? "#166534" : "#374151" }}>
                {batchReprocessMsg}
              </span>
            )}
          </div>
        </div>

        {/* Terrain warning banner */}
        {!loading && (() => {
          const missing = races.filter(
            (r) => !r.has_terrain_segments && r.files.some((f) => f.file_type === "gpx")
          );
          if (missing.length === 0) return null;
          return (
            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderLeft: "4px solid #f59e0b", borderRadius: "8px", padding: "12px 16px", marginBottom: "20px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "#92400e", marginBottom: "4px" }}>
                ⚠ {missing.length} race{missing.length !== 1 ? "s" : ""} with a GPX file but no terrain analysis yet
              </div>
              <div style={{ fontSize: "12px", color: "#78350f", marginBottom: "6px" }}>
                Click "Generate Race Profile" on each race, or use "Batch Reprocess All Profiles" above.
                The OSM terrain analysis runs automatically during profile generation.
              </div>
              <div style={{ fontSize: "12px", color: "#92400e" }}>
                {missing.map((r) => r.name).join(" · ")}
              </div>
            </div>
          );
        })()}

        {/* Search */}
        <input
          type="text"
          placeholder="Search races by name or location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchStyle}
        />

        {/* States */}
        {loading ? (
          <div style={{ ...cardStyle, padding: "32px", textAlign: "center", color: "#6b7280" }}>
            Loading races…
          </div>
        ) : error ? (
          <div style={{ ...cardStyle, padding: "20px", background: "#fff5f5", border: "1px solid #fca5a5", color: "#b91c1c" }}>
            {error}
          </div>
        ) : filteredRaces.length === 0 ? (
          <div style={{ ...cardStyle, padding: "32px", textAlign: "center", color: "#6b7280" }}>
            {search ? "No races match your search." : "No races found."}
          </div>
        ) : (
          filteredRaces.map((race) => {
            const isExpanded = expandedRaceId === race.id;
            const filesByType = new Map<FileType, RaceFile>();
            for (const f of race.files) filesByType.set(f.file_type, f);

            return (
              <div key={race.id} style={cardStyle}>
                {/* Card header / accordion toggle */}
                <div
                  style={cardHeaderStyle}
                  onClick={() => setExpandedRaceId(isExpanded ? null : race.id)}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "16px", color: "#111" }}>
                      {race.name}
                    </div>
                    {race.location && (
                      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                        📍 {race.location}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {race.files.some((f) => f.file_type === "gpx") && !race.has_terrain_segments && (
                      <span style={{ padding: "3px 10px", borderRadius: "20px", background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d", fontSize: "11px", fontWeight: 600 }}>
                        ⚠ No terrain analysis
                      </span>
                    )}
                    {race.has_terrain_segments && (
                      <span style={{ padding: "3px 10px", borderRadius: "20px", background: "#f0fdf4", color: "#15803d", fontSize: "11px", fontWeight: 600 }}>
                        ✓ OSM terrain
                      </span>
                    )}
                    <span style={{
                      padding: "3px 10px",
                      borderRadius: "20px",
                      background: race.files.length > 0 ? "#dcfce7" : "#f4f4f5",
                      color: race.files.length > 0 ? "#166534" : "#6b7280",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}>
                      {race.files.length} file{race.files.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: "16px" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </div>

                {/* Expanded card body */}
                {isExpanded && (
                  <div style={cardBodyStyle}>
                    {/* Existing files */}
                    {race.files.length === 0 ? (
                      <p style={{ fontSize: "14px", color: "#9ca3af", margin: "0 0 16px 0" }}>
                        No files uploaded yet for this race.
                      </p>
                    ) : (
                      <div style={{ marginBottom: "4px" }}>
                        {FILE_TYPE_ORDER.filter((ft) => filesByType.has(ft)).map((ft) => {
                          const file = filesByType.get(ft)!;
                          const colors = fileTypeColor(ft);
                          return (
                            <div key={file.id} style={fileRowStyle}>
                              {/* Type badge */}
                              <span style={{
                                padding: "3px 10px",
                                borderRadius: "20px",
                                background: colors.bg,
                                color: colors.text,
                                fontSize: "11px",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}>
                                {FILE_TYPE_LABELS[ft]}
                              </span>

                              {/* Filename + size */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "13px", fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {file.file_name}
                                </div>
                                {file.file_size_bytes && (
                                  <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "1px" }}>
                                    {formatBytes(file.file_size_bytes)}
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                                <a
                                  href={file.public_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={iconBtnStyle}
                                  title="Download / open"
                                >
                                  ↓
                                </a>
                                <button
                                  onClick={() => handleDelete(race.id, file)}
                                  disabled={!!deleting[file.id]}
                                  style={deleting[file.id] ? { ...deleteBtnStyle, opacity: 0.5 } : deleteBtnStyle}
                                  title="Delete file"
                                >
                                  {deleting[file.id] ? "…" : "🗑"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Upload buttons */}
                    <div style={uploadSectionStyle}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                        Upload
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0" }}>
                        {FILE_TYPE_ORDER.map((ft) => {
                          const isUploading = uploading[race.id]?.[ft];
                          const hasExisting = filesByType.has(ft);
                          const inputKey = `${race.id}_${ft}`;
                          const errKey = `${race.id}_${ft}`;

                          return (
                            <div key={ft} style={{ display: "inline-block" }}>
                              {/* Hidden file input */}
                              <input
                                type="file"
                                accept={FILE_TYPE_ACCEPT[ft]}
                                style={{ display: "none" }}
                                ref={(el) => { inputRefs.current[inputKey] = el; }}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileSelected(race.id, ft, file);
                                }}
                              />
                              <button
                                disabled={isUploading}
                                onClick={() => inputRefs.current[inputKey]?.click()}
                                style={isUploading ? uploadBtnLoadingStyle : uploadBtnStyle}
                                title={hasExisting ? `Replace ${FILE_TYPE_LABELS[ft]}` : `Upload ${FILE_TYPE_LABELS[ft]}`}
                              >
                                {isUploading ? (
                                  <>⏳ Uploading…</>
                                ) : hasExisting ? (
                                  <><span style={{ fontSize: "11px" }}>↺</span> Replace {FILE_TYPE_LABELS[ft]}</>
                                ) : (
                                  <>+ {FILE_TYPE_LABELS[ft]}</>
                                )}
                              </button>
                              {uploadError[errKey] && (
                                <div style={{ fontSize: "12px", color: "#b91c1c", marginBottom: "6px" }}>
                                  {uploadError[errKey]}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Generate Wind Analysis */}
                    {filesByType.has("gpx") && (
                      <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e4e4e7" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                          Auto-generate
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <button
                            disabled={!!windGenerating[race.id]}
                            onClick={() => {
                              setWindSettings({ ...DEFAULT_WIND_SETTINGS });
                              setWindError((prev) => ({ ...prev, [race.id]: "" }));
                              setWindSuccess((prev) => ({ ...prev, [race.id]: "" }));
                              setWindModalRaceId(race.id);
                            }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "6px",
                              padding: "7px 14px", borderRadius: "7px",
                              border: "1px solid #a5b4fc",
                              background: windGenerating[race.id] ? "#f5f3ff" : "#eef2ff",
                              color: "#4338ca", fontSize: "13px", fontWeight: 600,
                              cursor: windGenerating[race.id] ? "not-allowed" : "pointer",
                              opacity: windGenerating[race.id] ? 0.7 : 1,
                            }}
                          >
                            {windGenerating[race.id] ? "⏳ Generating…" : "⚡ Generate Wind Analysis"}
                          </button>

                          {windError[race.id] && (
                            <span style={{ fontSize: "12px", color: "#b91c1c" }}>
                              {windError[race.id]}
                            </span>
                          )}
                          {windSuccess[race.id] && (
                            <span style={{ fontSize: "12px", color: "#15803d" }}>
                              ✓ {windSuccess[race.id]}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: "12px", color: "#9ca3af", margin: "6px 0 0 0" }}>
                          Fetches ERA5 historical wind from Open-Meteo and saves a wind_analysis CSV automatically.
                        </p>
                      </div>
                    )}

                    {/* Generate Race Profile */}
                    {filesByType.has("gpx") && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <button
                            disabled={!!profileGenerating[race.id]}
                            onClick={() => handleGenerateProfile(race.id)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "6px",
                              padding: "7px 14px", borderRadius: "7px",
                              border: "1px solid #86efac",
                              background: profileGenerating[race.id] ? "#f0fdf4" : "#dcfce7",
                              color: "#15803d", fontSize: "13px", fontWeight: 600,
                              cursor: profileGenerating[race.id] ? "not-allowed" : "pointer",
                              opacity: profileGenerating[race.id] ? 0.7 : 1,
                            }}
                          >
                            {profileGenerating[race.id] ? "⏳ Generating…" : "📊 Generate Race Profile"}
                          </button>

                          {profileError[race.id] && (
                            <span style={{ fontSize: "12px", color: "#b91c1c" }}>
                              {profileError[race.id]}
                            </span>
                          )}
                          {profileSuccess[race.id] && (
                            <span style={{ fontSize: "12px", color: "#15803d" }}>
                              ✓ {profileSuccess[race.id]}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: "12px", color: "#9ca3af", margin: "6px 0 0 0" }}>
                          Runs OSM terrain analysis then computes flat-equivalent difficulty score (+ wind if available).
                          Required before using the Race Comparison tool.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Summary */}
        {!loading && !error && filteredRaces.length > 0 && (
          <div style={{ marginTop: "12px", fontSize: "13px", color: "#9ca3af", textAlign: "right" }}>
            {filteredRaces.length} race{filteredRaces.length !== 1 ? "s" : ""} shown
            {search ? ` (filtered from ${races.length})` : ""}
          </div>
        )}
      </div>

      {/* ── Wind Analysis Settings Modal ─────────────────────────────────────── */}
      {windModalRaceId && (() => {
        const race = races.find((r) => r.id === windModalRaceId);
        if (!race) return null;

        const labelStyle: React.CSSProperties = {
          display: "block", fontSize: "12px", fontWeight: 600,
          color: "#374151", marginBottom: "4px",
        };
        const inputStyle: React.CSSProperties = {
          width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
          borderRadius: "6px", fontSize: "13px", boxSizing: "border-box",
        };
        const gridStyle: React.CSSProperties = {
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px",
        };

        return (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setWindModalRaceId(null)}
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
                zIndex: 50,
              }}
            />

            {/* Modal */}
            <div style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "#fff", borderRadius: "12px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: "28px", width: "min(560px, 95vw)",
              zIndex: 51, maxHeight: "90vh", overflowY: "auto",
            }}>
              <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 700, color: "#111" }}>
                Generate Wind Analysis
              </h2>
              <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#6b7280" }}>
                {race.name} — ERA5 historical data via Open-Meteo (free, no API key required)
              </p>

              {/* Race date */}
              <div style={{ ...gridStyle, marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>Race Month (1–12)</label>
                  <input
                    type="number" min={1} max={12} style={inputStyle}
                    value={windSettings.race_month}
                    onChange={(e) => setWindSettings((s) => ({ ...s, race_month: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Race Day (1–31)</label>
                  <input
                    type="number" min={1} max={31} style={inputStyle}
                    value={windSettings.race_day}
                    onChange={(e) => setWindSettings((s) => ({ ...s, race_day: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Analysis window */}
              <div style={{ ...gridStyle, marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>Years of history</label>
                  <input
                    type="number" min={1} max={10} style={inputStyle}
                    value={windSettings.years_back}
                    onChange={(e) => setWindSettings((s) => ({ ...s, years_back: Number(e.target.value) }))}
                  />
                  <span style={{ fontSize: "11px", color: "#9ca3af" }}>More years = more data, slower</span>
                </div>
                <div>
                  <label style={labelStyle}>Window days (± around race date)</label>
                  <input
                    type="number" min={1} max={30} style={inputStyle}
                    value={windSettings.window_days}
                    onChange={(e) => setWindSettings((s) => ({ ...s, window_days: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Section size + race hours */}
              <div style={{ ...gridStyle, marginBottom: "14px" }}>
                <div>
                  <label style={labelStyle}>Section size (km)</label>
                  <input
                    type="number" min={0.5} max={10} step={0.5} style={inputStyle}
                    value={windSettings.section_km}
                    onChange={(e) => setWindSettings((s) => ({ ...s, section_km: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Race start hour (UTC)</label>
                  <input
                    type="number" min={0} max={23} style={inputStyle}
                    value={windSettings.start_hour}
                    onChange={(e) => setWindSettings((s) => ({ ...s, start_hour: Number(e.target.value) }))}
                  />
                </div>
              </div>

              {/* Thresholds */}
              <div style={{ ...gridStyle, marginBottom: "20px" }}>
                <div>
                  <label style={labelStyle}>Headwind threshold (m/s)</label>
                  <input
                    type="number" min={0} max={20} step={0.5} style={inputStyle}
                    value={windSettings.headwind_threshold_ms}
                    onChange={(e) => setWindSettings((s) => ({ ...s, headwind_threshold_ms: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Strong headwind threshold (m/s)</label>
                  <input
                    type="number" min={0} max={20} step={0.5} style={inputStyle}
                    value={windSettings.strong_headwind_threshold_ms}
                    onChange={(e) => setWindSettings((s) => ({ ...s, strong_headwind_threshold_ms: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setWindModalRaceId(null)}
                  style={{
                    padding: "9px 18px", borderRadius: "7px",
                    border: "1px solid #d1d5db", background: "#fff",
                    fontSize: "13px", fontWeight: 500, cursor: "pointer", color: "#374151",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleGenerateWind(race.id)}
                  style={{
                    padding: "9px 18px", borderRadius: "7px",
                    border: "none", background: "#4338ca",
                    fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#fff",
                  }}
                >
                  ⚡ Generate
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

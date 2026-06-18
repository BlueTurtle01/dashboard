"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WindAnalysisSettings } from "@/lib/race-analysis/types";
import { DEFAULT_WIND_SETTINGS } from "@/lib/race-analysis/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type FileType = "gpx" | "wind_analysis" | "course_map" | "elevation_profile" | "results" | "other";

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
  country: string | null;
  terrain_type: string | null;
  distance_km: number | null;
  is_desert_race: boolean;
  has_terrain_segments: boolean;
  race_latitude: number | null;
  race_longitude: number | null;
  race_end_date: string | null;
}

interface RaceWithFiles extends Race {
  files: RaceFile[];
}

type TerrainOpt = "road" | "coastal" | "trail" | "mountain";

interface CharFormState {
  is_uk: boolean;
  terrain: TerrainOpt | "";
  hilliness: 1 | 2 | 3 | 4 | "";
  crowd_size: 1 | 2 | 3 | "";
  climate: 1 | 2 | 3 | 4 | "";
  distance_band: 1 | 2 | 3 | 4 | "";
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FILE_TYPE_LABELS: Record<FileType, string> = {
  gpx: "GPX Course",
  wind_analysis: "Wind Analysis",
  course_map: "Course Map",
  elevation_profile: "Elevation Profile",
  results: "Race Results",
  other: "Other",
};

const FILE_TYPE_ACCEPT: Record<FileType, string> = {
  gpx: ".gpx,application/gpx+xml,application/xml,text/xml",
  wind_analysis: ".csv,text/csv,application/csv",
  course_map: ".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf",
  elevation_profile: ".png,.jpg,.jpeg,.csv,image/png,image/jpeg,text/csv",
  results: ".csv,text/csv,application/csv",
  other: "*",
};

const FILE_TYPE_ORDER: FileType[] = [
  "gpx",
  "wind_analysis",
  "course_map",
  "elevation_profile",
  "results",
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
    results: { bg: "#f3e8ff", text: "#7e22ce" },
    other: { bg: "#f4f4f5", text: "#52525b" },
  };
  return map[type] ?? map.other;
}

// ─── Race Matcher helpers ─────────────────────────────────────────────────────

function inferCharForm(
  race: Omit<Race, "has_terrain_segments" | "files">,
  ascentM: number | null,
  profileDistanceKm: number | null,
  entrantCount: number | null,
): CharFormState {
  const country = (race.country ?? "").toLowerCase().trim();
  let is_uk = ["uk", "united kingdom", "england", "scotland", "wales", "northern ireland"].includes(country);
  if (!is_uk && !country && race.race_latitude != null && race.race_longitude != null) {
    const lat = Number(race.race_latitude);
    const lon = Number(race.race_longitude);
    is_uk = lat >= 49.9 && lat <= 61.0 && lon >= -8.2 && lon <= 2.0;
  }

  const tt = (race.terrain_type ?? "").toLowerCase();
  let terrain: TerrainOpt | "" = "";
  if (tt.includes("road")) terrain = "road";
  else if (tt.includes("coast")) terrain = "coastal";
  else if (tt.includes("mountain") || tt.includes("alpine") || tt.includes("fell")) terrain = "mountain";
  else if (tt.includes("trail") || tt.includes("desert") || tt.includes("sand")) terrain = "trail";

  const d = race.distance_km ?? profileDistanceKm;
  let distance_band: CharFormState["distance_band"] = "";
  if (d != null) {
    if (d <= 42.2) distance_band = 1;
    else if (d <= 70) distance_band = 2;
    else if (d <= 120) distance_band = 3;
    else distance_band = 4;
  }

  let hilliness: CharFormState["hilliness"] = "";
  if (ascentM != null && d != null && d > 0) {
    const mPerKm = ascentM / d;
    if (mPerKm < 5) hilliness = 1;
    else if (mPerKm < 10) hilliness = 2;
    else if (mPerKm < 20) hilliness = 3;
    else hilliness = 4;
  }

  const climate: CharFormState["climate"] = race.is_desert_race ? 4 : "";

  let crowd_size: CharFormState["crowd_size"] = "";
  if (entrantCount !== null) {
    if (entrantCount < 400)  crowd_size = 1;
    else if (entrantCount <= 2000) crowd_size = 2;
    else crowd_size = 3;
  }

  return { is_uk, terrain, distance_band, hilliness, climate, crowd_size };
}

function CharPicker<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { v: T; label: string }[];
  value: T | "";
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            style={{
              padding: "5px 12px", borderRadius: "6px",
              border: `1px solid ${active ? "#4f46e5" : "#d1d5db"}`,
              background: active ? "#eef2ff" : "#fff",
              color: active ? "#4338ca" : "#374151",
              fontSize: "13px", fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
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

  // Create race modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", slug: "", location: "", country: "", distance_km: "" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Results import outcome per race (keyed by raceId)
  const [resultsImport, setResultsImport] = useState<Record<string, { rowCount?: number; warning?: string; error?: string }>>({});

  // Race Matcher characteristics
  const [profileDistances, setProfileDistances] = useState<Record<string, number>>({});
  const [charForms, setCharForms] = useState<Record<string, CharFormState>>({});
  const [charSaving, setCharSaving] = useState<Record<string, boolean>>({});
  const [charSaveStatus, setCharSaveStatus] = useState<Record<string, "idle" | "saved" | "error">>({});
  const [charHasRow, setCharHasRow] = useState<Set<string>>(new Set());
  const [entrantCounts, setEntrantCounts] = useState<Record<string, { year: number; count: number }>>({});
  const [processRace, setProcessRace] = useState<Record<string, { step: string; error?: string; done?: boolean }>>({});
  const [processAll, setProcessAll] = useState<{ running: boolean; done: number; total: number; failed: number } | null>(null);

  // Hidden file inputs per (race × fileType)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: racesData, error: racesErr },
        { data: filesData, error: filesErr },
        { data: terrainMeta },
        { data: charsData },
        { data: profilesData },
        { data: entrantData },
      ] = await Promise.all([
        supabase
          .from("races")
          .select("id, name, slug, location, country, terrain_type, distance_km, is_desert_race, race_latitude, race_longitude, race_end_date")
          .order("name", { ascending: true }),
        supabase.from("race_files").select("*").order("created_at", { ascending: true }),
        supabase.from("races_meta").select("race_id").eq("meta_key", "terrain_segments"),
        supabase.from("race_characteristics").select("race_id, is_uk, terrain, hilliness, crowd_size, climate, distance_band"),
        supabase.from("race_profiles").select("race_id, total_ascent_m, total_distance_km"),
        supabase.rpc("get_latest_year_entrant_counts"),
      ]);

      if (racesErr || !racesData) throw new Error(racesErr?.message ?? "Failed to load races");
      if (filesErr) throw new Error(filesErr.message);

      const racesWithTerrain = new Set((terrainMeta ?? []).map((m: { race_id: string }) => m.race_id));

      const filesByRace = new Map<string, RaceFile[]>();
      for (const f of (filesData ?? []) as RaceFile[]) {
        if (!filesByRace.has(f.race_id)) filesByRace.set(f.race_id, []);
        filesByRace.get(f.race_id)!.push(f);
      }

      type CharRow = { race_id: string; is_uk: boolean; terrain: string; hilliness: number; crowd_size: number; climate: number; distance_band: number };
      const charsByRaceId = new Map<string, CharRow>((charsData ?? []).map((c: CharRow) => [c.race_id, c]));
      type ProfileRow = { race_id: string; total_ascent_m: number; total_distance_km: number };
      const profileByRaceId = new Map<string, ProfileRow>((profilesData ?? []).map((p: ProfileRow) => [p.race_id, p]));
      setProfileDistances(Object.fromEntries((profilesData ?? []).map((p: ProfileRow) => [p.race_id, p.total_distance_km])));

      type EntrantRow = { race_id: string; latest_year: number; entrant_count: number };
      const typedEntrants = (entrantData ?? []) as EntrantRow[];
      const entrantByRaceId = new Map<string, { year: number; count: number }>(
        typedEntrants.map(e => [e.race_id, { year: e.latest_year, count: Number(e.entrant_count) }]),
      );
      setEntrantCounts(Object.fromEntries(entrantByRaceId));

      type RaceRow = Omit<Race, "has_terrain_segments" | "files">;
      const typedRaces = racesData as RaceRow[];

      const newForms: Record<string, CharFormState> = {};
      const newHasRow = new Set<string>();
      for (const r of typedRaces) {
        const existing = charsByRaceId.get(r.id);
        if (existing) {
          newHasRow.add(r.id);
          newForms[r.id] = {
            is_uk: existing.is_uk,
            terrain: existing.terrain as TerrainOpt,
            hilliness: existing.hilliness as CharFormState["hilliness"],
            crowd_size: existing.crowd_size as CharFormState["crowd_size"],
            climate: existing.climate as CharFormState["climate"],
            distance_band: existing.distance_band as CharFormState["distance_band"],
          };
        } else {
          const prof = profileByRaceId.get(r.id) ?? null;
          newForms[r.id] = inferCharForm(
            r,
            prof?.total_ascent_m ?? null,
            prof?.total_distance_km ?? null,
            entrantByRaceId.get(r.id)?.count ?? null,
          );
        }
      }
      setCharForms(newForms);
      setCharHasRow(newHasRow);

      setRaces(
        typedRaces.map((r) => ({
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

      // For results CSVs: trigger the import pipeline after the file is stored
      if (fileType === "results") {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("race_id", raceId);
        try {
          const importRes = await fetch("/api/admin/race-files-import", { method: "POST", body: fd });
          const importJson = await importRes.json() as { rowCount?: number; warning?: string; error?: string };
          setResultsImport((prev) => ({ ...prev, [raceId]: importJson }));
        } catch {
          setResultsImport((prev) => ({ ...prev, [raceId]: { error: "Import request failed" } }));
        }
      }
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

      let json: { success?: boolean; error?: string; total_distance_km?: number; flat_equivalent_km?: number; difficulty_ratio?: number; wind_adjusted_flat_equivalent_km?: number; terrain_source?: string; terrain_segments_count?: number } = {};
      try {
        json = await res.json();
      } catch {
        // Non-JSON response (e.g. Vercel 504 timeout on large course)
        setProfileError((prev) => ({
          ...prev,
          [raceId]: res.status === 504
            ? "Request timed out — the terrain analysis may take too long for this course length. Try again; it will use cached terrain data if available."
            : `Server error (HTTP ${res.status}) — check the server logs.`,
        }));
        return;
      }

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

  function nameToSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleCreateRace() {
    if (!createForm.name.trim() || !createForm.slug.trim()) {
      setCreateError("Name and slug are required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const { error } = await supabase.from("races").insert({
        name: createForm.name.trim(),
        slug: createForm.slug.trim(),
        location: createForm.location.trim() || null,
        country: createForm.country.trim() || null,
        distance_km: createForm.distance_km ? Number(createForm.distance_km) : null,
      });
      if (error) throw new Error(error.message);
      setCreateModalOpen(false);
      setCreateForm({ name: "", slug: "", location: "", country: "", distance_km: "" });
      await loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create race");
    } finally {
      setCreating(false);
    }
  }

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

  async function handleProcessRace(raceId: string) {
    const setStep = (step: string, error?: string, done?: boolean) =>
      setProcessRace((prev) => ({ ...prev, [raceId]: { step, error, done } }));

    setStep("Analysing wind…");
    try {
      const windRes = await fetch("/api/race-analysis/wind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId }),
      });
      const windJson = await windRes.json() as { success?: boolean; skipped?: boolean; error?: string };
      if (!windRes.ok && !windJson.skipped) throw new Error(windJson.error ?? "Wind failed");
    } catch (err) {
      setStep("Wind failed — continuing", err instanceof Error ? err.message : undefined);
    }

    setStep("Building profile…");
    try {
      const profRes = await fetch("/api/race-analysis/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId }),
      });
      const profJson = await profRes.json() as { success?: boolean; error?: string };
      if (!profRes.ok || !profJson.success) throw new Error(profJson.error ?? "Profile failed");
    } catch (err) {
      setStep("Profile failed", err instanceof Error ? err.message : undefined, true);
      return;
    }

    setStep("Generating strategy…");
    try {
      const stratRes = await fetch("/api/race-strategy/auto-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId }),
      });
      const stratJson = await stratRes.json() as { success?: boolean; error?: string };
      if (!stratRes.ok || !stratJson.success) throw new Error(stratJson.error ?? "Strategy failed");
    } catch {
      // Strategy failure is non-critical
    }

    setStep("Done", undefined, true);
    await loadData();
  }

  async function handleProcessAll() {
    const eligible = races.filter((r) => r.files.some((f) => f.file_type === "gpx"));
    if (eligible.length === 0) return;
    setProcessAll({ running: true, done: 0, total: eligible.length, failed: 0 });
    let done = 0, failed = 0;
    for (const race of eligible) {
      try {
        await handleProcessRace(race.id);
        done++;
      } catch { failed++; }
      setProcessAll({ running: true, done: done + failed, total: eligible.length, failed });
    }
    setProcessAll({ running: false, done, total: eligible.length, failed });
  }

  async function handleSaveCharacteristics(raceId: string) {
    const form = charForms[raceId];
    if (!form || form.terrain === "" || form.hilliness === "" || form.crowd_size === "" || form.climate === "" || form.distance_band === "") return;
    setCharSaving((prev) => ({ ...prev, [raceId]: true }));
    setCharSaveStatus((prev) => ({ ...prev, [raceId]: "idle" }));
    const { error } = await supabase.from("race_characteristics").upsert(
      { race_id: raceId, is_uk: form.is_uk, terrain: form.terrain, hilliness: form.hilliness, crowd_size: form.crowd_size, climate: form.climate, distance_band: form.distance_band },
      { onConflict: "race_id" },
    );
    setCharSaving((prev) => ({ ...prev, [raceId]: false }));
    if (error) {
      setCharSaveStatus((prev) => ({ ...prev, [raceId]: "error" }));
    } else {
      setCharSaveStatus((prev) => ({ ...prev, [raceId]: "saved" }));
      setCharHasRow((prev) => new Set([...prev, raceId]));
    }
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
            Upload and manage GPX courses, wind analysis CSVs, race results, and other files for each race.
            Results CSVs are automatically parsed and imported with checkpoint times (Male/Female only).
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setCreateForm({ name: "", slug: "", location: "", country: "", distance_km: "" });
                setCreateError(null);
                setCreateModalOpen(true);
              }}
              style={{ padding: "7px 14px", fontSize: "13px", fontWeight: 600, borderRadius: "7px", border: "1px solid #4f46e5", background: "#4f46e5", color: "#fff", cursor: "pointer" }}
            >
              + New Race
            </button>
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
              onClick={() => void handleProcessAll()}
              disabled={processAll?.running ?? false}
              style={{ padding: "7px 14px", fontSize: "13px", fontWeight: 600, borderRadius: "7px", border: "1px solid #86efac", background: processAll?.running ? "#f0fdf4" : "#dcfce7", color: "#15803d", cursor: processAll?.running ? "default" : "pointer" }}
            >
              {processAll?.running
                ? `⏳ Processing… ${processAll.done}/${processAll.total}`
                : "⚡ Process All Races"}
            </button>
            {processAll && !processAll.running && (
              <span style={{ fontSize: "12px", color: processAll.failed > 0 ? "#b91c1c" : "#166534" }}>
                ✓ {processAll.done} processed{processAll.failed > 0 ? `, ${processAll.failed} failed` : ""}
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
                Click "⚡ Process Race" on each race, or use "⚡ Process All Races" above.
                OSM terrain analysis, characteristics, and pace strategy are all computed automatically.
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
                    {charHasRow.has(race.id) && (
                      <span style={{ padding: "3px 10px", borderRadius: "20px", background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd", fontSize: "11px", fontWeight: 600 }}>
                        ✓ In Matcher
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

                    {/* Results import outcome */}
                    {resultsImport[race.id] && (() => {
                      const r = resultsImport[race.id];
                      const isOk = !r.error && r.rowCount !== undefined;
                      return (
                        <div style={{
                          fontSize: "12px", padding: "8px 12px", borderRadius: "6px", marginBottom: "10px",
                          background: r.error ? "#fff5f5" : r.warning ? "#fffbeb" : "#f0fdf4",
                          color: r.error ? "#b91c1c" : r.warning ? "#92400e" : "#15803d",
                          border: `1px solid ${r.error ? "#fca5a5" : r.warning ? "#fcd34d" : "#86efac"}`,
                        }}>
                          {r.error && `⚠ Import error: ${r.error}`}
                          {r.warning && `ℹ ${r.warning}`}
                          {isOk && `✓ Imported ${r.rowCount} Male/Female results with checkpoint times`}
                        </div>
                      );
                    })()}

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

                    {/* Process Race — primary action */}
                    {filesByType.has("gpx") && (
                      <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e4e4e7" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                          Auto-process
                        </div>

                        {/* Primary: Process Race (chains everything) */}
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                          {(() => {
                            const pr = processRace[race.id];
                            const isRunning = pr && !pr.done;
                            return (
                              <>
                                <button
                                  disabled={!!isRunning}
                                  onClick={() => void handleProcessRace(race.id)}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: "6px",
                                    padding: "8px 16px", borderRadius: "7px",
                                    border: "1px solid #86efac",
                                    background: isRunning ? "#f0fdf4" : "#dcfce7",
                                    color: "#15803d", fontSize: "13px", fontWeight: 700,
                                    cursor: isRunning ? "not-allowed" : "pointer",
                                    opacity: isRunning ? 0.8 : 1,
                                  }}
                                >
                                  {isRunning ? `⏳ ${pr.step}` : "⚡ Process Race"}
                                </button>
                                {pr?.done && !pr.error && (
                                  <span style={{ fontSize: "12px", color: "#15803d" }}>✓ Done</span>
                                )}
                                {pr?.error && (
                                  <span style={{ fontSize: "12px", color: "#b91c1c" }}>{pr.error}</span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <p style={{ fontSize: "12px", color: "#9ca3af", margin: "0 0 10px 0" }}>
                          Runs wind analysis, OSM terrain, profile, characteristics, and pace strategy in one step.
                        </p>

                        {/* Secondary: manual wind + profile buttons */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            disabled={!!windGenerating[race.id]}
                            onClick={() => {
                              setWindSettings({ ...DEFAULT_WIND_SETTINGS });
                              setWindError((prev) => ({ ...prev, [race.id]: "" }));
                              setWindSuccess((prev) => ({ ...prev, [race.id]: "" }));
                              setWindModalRaceId(race.id);
                            }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "5px",
                              padding: "5px 11px", borderRadius: "6px",
                              border: "1px solid #c7d2fe",
                              background: windGenerating[race.id] ? "#f5f3ff" : "#eef2ff",
                              color: "#4338ca", fontSize: "12px", fontWeight: 500,
                              cursor: windGenerating[race.id] ? "not-allowed" : "pointer",
                            }}
                          >
                            {windGenerating[race.id] ? "⏳ Wind…" : "⚡ Wind (manual date)"}
                          </button>
                          <button
                            disabled={!!profileGenerating[race.id]}
                            onClick={() => handleGenerateProfile(race.id)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "5px",
                              padding: "5px 11px", borderRadius: "6px",
                              border: "1px solid #bbf7d0",
                              background: profileGenerating[race.id] ? "#f0fdf4" : "#f0fdf4",
                              color: "#166534", fontSize: "12px", fontWeight: 500,
                              cursor: profileGenerating[race.id] ? "not-allowed" : "pointer",
                            }}
                          >
                            {profileGenerating[race.id] ? "⏳ Profile…" : "📊 Profile only"}
                          </button>
                          {(windError[race.id] || windSuccess[race.id]) && (
                            <span style={{ fontSize: "11px", color: windError[race.id] ? "#b91c1c" : "#15803d" }}>
                              {windError[race.id] || windSuccess[race.id]}
                            </span>
                          )}
                          {(profileError[race.id] || profileSuccess[race.id]) && (
                            <span style={{ fontSize: "11px", color: profileError[race.id] ? "#b91c1c" : "#15803d" }}>
                              {profileError[race.id] || profileSuccess[race.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Race Matcher Characteristics ── */}
                    {(() => {
                      const form = charForms[race.id];
                      if (!form) return null;
                      const isComplete = form.terrain !== "" && form.hilliness !== "" && form.crowd_size !== "" && form.climate !== "" && form.distance_band !== "";
                      const setField = <K extends keyof CharFormState>(key: K, val: CharFormState[K]) => {
                        setCharForms((prev) => ({ ...prev, [race.id]: { ...prev[race.id], [key]: val } }));
                        setCharSaveStatus((prev) => ({ ...prev, [race.id]: "idle" }));
                      };
                      return (
                        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e4e4e7" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Race Matcher
                            </div>
                            <span style={{
                              padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600,
                              background: charHasRow.has(race.id) ? "#f0f9ff" : "#f4f4f5",
                              color: charHasRow.has(race.id) ? "#0369a1" : "#6b7280",
                              border: charHasRow.has(race.id) ? "1px solid #bae6fd" : "1px solid #e4e4e7",
                            }}>
                              {charHasRow.has(race.id) ? "✓ In Matcher" : "Not in Matcher"}
                            </span>
                            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#9ca3af" }}>
                              Auto-populated by ⚡ Process Race
                            </span>
                          </div>

                          <div style={{ display: "grid", gap: "12px" }}>
                            {/* Location */}
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>Location</div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                {([true, false] as const).map((v) => {
                                  const active = form.is_uk === v;
                                  return (
                                    <button key={String(v)} type="button" onClick={() => setField("is_uk", v)}
                                      style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${active ? "#4f46e5" : "#d1d5db"}`, background: active ? "#eef2ff" : "#fff", color: active ? "#4338ca" : "#374151", fontSize: "13px", fontWeight: active ? 600 : 400, cursor: "pointer" }}>
                                      {v ? "UK race" : "International"}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Terrain */}
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>Terrain</div>
                              <CharPicker<TerrainOpt>
                                options={[{ v: "road", label: "Road" }, { v: "trail", label: "Trail" }, { v: "coastal", label: "Coastal" }, { v: "mountain", label: "Mountain" }]}
                                value={form.terrain}
                                onChange={(v) => setField("terrain", v)}
                              />
                            </div>

                            {/* Hilliness */}
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>
                                Hilliness <span style={{ fontWeight: 400, textTransform: "none" }}>(1 = flat · 4 = very hilly)</span>
                              </div>
                              <CharPicker<number>
                                options={[{ v: 1, label: "1 – Flat" }, { v: 2, label: "2 – Undulating" }, { v: 3, label: "3 – Hilly" }, { v: 4, label: "4 – Very hilly" }]}
                                value={form.hilliness}
                                onChange={(v) => setField("hilliness", v as CharFormState["hilliness"])}
                              />
                            </div>

                            {/* Crowd size */}
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>
                                Crowd size <span style={{ fontWeight: 400, textTransform: "none" }}>(1 = quiet · 3 = big event)</span>
                              </div>
                              <CharPicker<number>
                                options={[{ v: 1, label: "1 – Quiet & remote" }, { v: 2, label: "2 – Mid-sized" }, { v: 3, label: "3 – Big event" }]}
                                value={form.crowd_size}
                                onChange={(v) => setField("crowd_size", v as CharFormState["crowd_size"])}
                              />
                              {entrantCounts[race.id] && (
                                <div style={{ marginTop: "5px", fontSize: "11px", color: "#6b7280" }}>
                                  {entrantCounts[race.id].count.toLocaleString()} entrants in {entrantCounts[race.id].year}
                                  {!charHasRow.has(race.id) && form.crowd_size !== "" && (
                                    <span style={{ marginLeft: "6px", color: "#9ca3af" }}>· auto-inferred</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Climate */}
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>
                                Climate <span style={{ fontWeight: 400, textTransform: "none" }}>(1 = cold · 4 = hot)</span>
                              </div>
                              <CharPicker<number>
                                options={[{ v: 1, label: "1 – Cold" }, { v: 2, label: "2 – Mild" }, { v: 3, label: "3 – Warm" }, { v: 4, label: "4 – Hot" }]}
                                value={form.climate}
                                onChange={(v) => setField("climate", v as CharFormState["climate"])}
                              />
                            </div>

                            {/* Distance band */}
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", marginBottom: "6px" }}>Distance band</div>
                              <CharPicker<number>
                                options={[{ v: 1, label: "≤ Marathon" }, { v: 2, label: "50K" }, { v: 3, label: "100K" }, { v: 4, label: "100M+" }]}
                                value={form.distance_band}
                                onChange={(v) => setField("distance_band", v as CharFormState["distance_band"])}
                              />
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px" }}>
                            <button
                              type="button"
                              disabled={!isComplete || !!charSaving[race.id]}
                              onClick={() => void handleSaveCharacteristics(race.id)}
                              style={{
                                padding: "7px 16px", borderRadius: "7px", border: "none",
                                background: isComplete ? "#4f46e5" : "#e5e7eb",
                                color: isComplete ? "#fff" : "#9ca3af",
                                fontSize: "13px", fontWeight: 600,
                                cursor: isComplete && !charSaving[race.id] ? "pointer" : "not-allowed",
                                opacity: charSaving[race.id] ? 0.7 : 1,
                              }}
                            >
                              {charSaving[race.id] ? "Saving…" : "Save to Matcher"}
                            </button>
                            {charSaveStatus[race.id] === "saved" && <span style={{ fontSize: "12px", color: "#15803d" }}>✓ Saved</span>}
                            {charSaveStatus[race.id] === "error" && <span style={{ fontSize: "12px", color: "#b91c1c" }}>Save failed — check console</span>}
                            {!isComplete && <span style={{ fontSize: "12px", color: "#9ca3af" }}>Fill all fields to save</span>}
                          </div>
                        </div>
                      );
                    })()}
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

      {/* ── Create Race Modal ────────────────────────────────────────────────── */}
      {createModalOpen && (
        <>
          <div
            onClick={() => setCreateModalOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50 }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: "12px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            padding: "28px", width: "min(480px, 95vw)",
            zIndex: 51,
          }}>
            <h2 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 700, color: "#111" }}>
              New Race
            </h2>
            <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#6b7280" }}>
              Create a new race entry. You can upload files and generate profiles after.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                  Race Name <span style={{ color: "#b91c1c" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Marathon des Sables"
                  value={createForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setCreateForm((f) => ({
                      ...f,
                      name,
                      slug: f.slug === nameToSlug(f.name) ? nameToSlug(name) : f.slug,
                    }));
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                  Slug <span style={{ color: "#b91c1c" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. marathon-des-sables"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box", fontFamily: "monospace" }}
                />
                <span style={{ fontSize: "11px", color: "#9ca3af" }}>URL-safe identifier, auto-filled from name</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Sahara Desert"
                    value={createForm.location}
                    onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Country</label>
                  <input
                    type="text"
                    placeholder="e.g. Morocco"
                    value={createForm.country}
                    onChange={(e) => setCreateForm((f) => ({ ...f, country: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>Distance (km)</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="e.g. 250"
                  value={createForm.distance_km}
                  onChange={(e) => setCreateForm((f) => ({ ...f, distance_km: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {createError && (
              <div style={{ marginTop: "14px", fontSize: "13px", color: "#b91c1c", padding: "8px 12px", background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: "6px" }}>
                {createError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                onClick={() => setCreateModalOpen(false)}
                style={{ padding: "9px 18px", borderRadius: "7px", border: "1px solid #d1d5db", background: "#fff", fontSize: "13px", fontWeight: 500, cursor: "pointer", color: "#374151" }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateRace()}
                disabled={creating}
                style={{ padding: "9px 18px", borderRadius: "7px", border: "none", background: creating ? "#818cf8" : "#4f46e5", fontSize: "13px", fontWeight: 600, cursor: creating ? "not-allowed" : "pointer", color: "#fff" }}
              >
                {creating ? "Creating…" : "Create Race"}
              </button>
            </div>
          </div>
        </>
      )}

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

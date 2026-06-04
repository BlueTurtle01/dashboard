"use client";

import { useEffect, useRef, useState } from "react";
import { parseCsvFile, type ParsedImport } from "@/lib/results-import/csv-parser";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileState {
  file: File;
  parsed: ParsedImport | null;
  parseError: string | null;
  status: "pending" | "importing" | "done" | "skipped" | "error";
  resultMessage: string | null;
  // Editable fields
  editName: string;
  editYear: string;
}

interface ImportRecord {
  id: string;
  original_filename: string;
  race_id: string;
  row_count: number;
  created_at: string;
  race_name: string;
}

interface GpxFileState {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  message: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCount(rows: ParsedImport["rows"]) {
  const finished = rows.filter((r) => r.result_status === "FINISHED").length;
  const dnf = rows.filter((r) => r.result_status === "DNF").length;
  const dns = rows.filter((r) => r.result_status === "DNS").length;
  const parts = [`${finished} finisher${finished !== 1 ? "s" : ""}`];
  if (dnf) parts.push(`${dnf} DNF`);
  if (dns) parts.push(`${dns} DNS`);
  return parts.join(" / ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultsImportPage() {
  const [tab, setTab] = useState<"csv" | "gpx">("csv");

  // CSV tab state
  const [csvFiles, setCsvFiles] = useState<FileState[]>([]);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // GPX tab state
  const [gpxFiles, setGpxFiles] = useState<GpxFileState[]>([]);
  const [gpxDragOver, setGpxDragOver] = useState(false);
  const gpxInputRef = useRef<HTMLInputElement>(null);

  // Load import history
  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/raw-races");
      const body = await res.json();
      // Map raw-races response into a flat history list
      const rows: ImportRecord[] = [];
      for (const race of body.races ?? []) {
        for (const filename of race.source_files ?? []) {
          rows.push({
            id: race.id,
            original_filename: filename,
            race_id: race.id,
            row_count: race.result_count,
            created_at: race.created_at,
            race_name: race.name,
          });
        }
      }
      setImportHistory(rows);
    } catch {
      // non-critical
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── CSV file handling ─────────────────────────────────────────────────────

  function addCsvFiles(fileList: FileList | File[]) {
    const toAdd: FileState[] = [];
    const alreadyImported = new Set(importHistory.map((r) => r.original_filename));

    for (const file of Array.from(fileList)) {
      if (!file.name.toLowerCase().endsWith(".csv")) continue;
      const duplicate = csvFiles.some((f) => f.file.name === file.name);
      if (duplicate) continue;

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const parsed = parseCsvFile(file.name, text);
          setCsvFiles((prev) =>
            prev.map((f) =>
              f.file === file
                ? {
                    ...f,
                    parsed,
                    editName: parsed.raceName,
                    editYear: String(parsed.raceYear),
                    status: alreadyImported.has(file.name) ? "skipped" : "pending",
                    resultMessage: alreadyImported.has(file.name) ? "Already imported" : null,
                  }
                : f
            )
          );
        } catch (err) {
          setCsvFiles((prev) =>
            prev.map((f) =>
              f.file === file
                ? { ...f, parseError: String(err), status: "error" }
                : f
            )
          );
        }
      };
      reader.readAsText(file);

      toAdd.push({
        file,
        parsed: null,
        parseError: null,
        status: "pending",
        resultMessage: null,
        editName: "",
        editYear: "",
      });
    }
    setCsvFiles((prev) => [...prev, ...toAdd]);
  }

  function removeCsvFile(filename: string) {
    setCsvFiles((prev) => prev.filter((f) => f.file.name !== filename));
  }

  async function importAll() {
    const ready = csvFiles.filter((f) => f.status === "pending" && f.parsed);
    if (!ready.length) return;

    // Set all to importing
    setCsvFiles((prev) =>
      prev.map((f) =>
        f.status === "pending" && f.parsed ? { ...f, status: "importing" } : f
      )
    );

    const formData = new FormData();
    for (const f of ready) {
      // If user edited name/year, rebuild the file with a patched first line
      if (
        f.parsed &&
        (f.editName !== f.parsed.raceName || f.editYear !== String(f.parsed.raceYear))
      ) {
        // Re-create file with patched title row so the server parses the correct values
        const text = await f.file.text();
        const lines = text.split(/\r?\n/);
        lines[0] = `${f.editName} ${f.editYear}`;
        const patched = new Blob([lines.join("\n")], { type: "text/csv" });
        formData.append("files", patched, f.file.name);
      } else {
        formData.append("files", f.file, f.file.name);
      }
    }

    const res = await fetch("/api/admin/results-import", {
      method: "POST",
      body: formData,
    });
    const body = await res.json();

    const resultMap = new Map<string, { rowCount?: number; error?: string; warning?: string }>();
    for (const r of body.results ?? []) {
      resultMap.set(r.filename, r);
    }

    setCsvFiles((prev) =>
      prev.map((f) => {
        if (f.status !== "importing") return f;
        const r = resultMap.get(f.file.name);
        if (!r) return { ...f, status: "error", resultMessage: "No response" };
        if (r.error) return { ...f, status: "error", resultMessage: r.error };
        if (r.warning) return { ...f, status: "skipped", resultMessage: r.warning };
        return { ...f, status: "done", resultMessage: `${r.rowCount} rows imported` };
      })
    );

    loadHistory();
  }

  // ── GPX file handling ─────────────────────────────────────────────────────

  function addGpxFiles(fileList: FileList | File[]) {
    const toAdd: GpxFileState[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.toLowerCase().endsWith(".gpx")) continue;
      if (gpxFiles.some((f) => f.file.name === file.name)) continue;
      toAdd.push({ file, status: "pending", message: null });
    }
    setGpxFiles((prev) => [...prev, ...toAdd]);
  }

  async function uploadGpx(gpxFile: GpxFileState) {
    setGpxFiles((prev) =>
      prev.map((f) => (f.file === gpxFile.file ? { ...f, status: "uploading" } : f))
    );
    const formData = new FormData();
    formData.append("file", gpxFile.file);

    const res = await fetch("/api/admin/raw-gpx-upload", { method: "POST", body: formData });
    const body = await res.json();

    setGpxFiles((prev) =>
      prev.map((f) =>
        f.file === gpxFile.file
          ? {
              ...f,
              status: res.ok ? "done" : "error",
              message: res.ok ? "Uploaded" : (body.error ?? "Upload failed"),
            }
          : f
      )
    );
  }

  async function uploadAllGpx() {
    const pending = gpxFiles.filter((f) => f.status === "pending");
    await Promise.all(pending.map(uploadGpx));
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const readyCount = csvFiles.filter((f) => f.status === "pending" && f.parsed).length;
  const gpxPendingCount = gpxFiles.filter((f) => f.status === "pending").length;

  return (
    <div style={{ padding: "24px", maxWidth: 960, fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin/athlete-network" style={{ color: "#6b7280", fontSize: 14 }}>
          ← Athlete Network
        </a>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Results Import</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Bulk upload race results CSVs and GPX files. Imported races are stored but not published on
        the athlete-facing site — manage them from{" "}
        <a href="/admin/raw-races" style={{ color: "#2563eb" }}>Raw Races</a>.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 24 }}>
        {(["csv", "gpx"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px",
              fontWeight: tab === t ? 600 : 400,
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent",
              cursor: "pointer",
              color: tab === t ? "#2563eb" : "#374151",
              marginBottom: -1,
            }}
          >
            {t === "csv" ? "Results CSV" : "GPX Files"}
          </button>
        ))}
      </div>

      {/* ── CSV Tab ── */}
      {tab === "csv" && (
        <div>
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
            onDragLeave={() => setCsvDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setCsvDragOver(false);
              addCsvFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={() => csvInputRef.current?.click()}
            style={{
              border: `2px dashed ${csvDragOver ? "#2563eb" : "#d1d5db"}`,
              borderRadius: 8,
              padding: "32px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: csvDragOver ? "#eff6ff" : "#f9fafb",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Drop CSV files here or <span style={{ color: "#2563eb" }}>click to browse</span>
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
              Accepts .csv — one file per race year
            </div>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              multiple
              style={{ display: "none" }}
              onChange={(e) => e.target.files && addCsvFiles(e.target.files)}
            />
          </div>

          {/* File cards */}
          {csvFiles.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {csvFiles.map((f) => (
                <CsvFileCard
                  key={f.file.name}
                  fileState={f}
                  onRemove={() => removeCsvFile(f.file.name)}
                  onEditName={(v) =>
                    setCsvFiles((prev) =>
                      prev.map((x) => (x.file.name === f.file.name ? { ...x, editName: v } : x))
                    )
                  }
                  onEditYear={(v) =>
                    setCsvFiles((prev) =>
                      prev.map((x) => (x.file.name === f.file.name ? { ...x, editYear: v } : x))
                    )
                  }
                />
              ))}
            </div>
          )}

          {csvFiles.length > 0 && (
            <button
              onClick={importAll}
              disabled={readyCount === 0}
              style={{
                padding: "10px 24px",
                background: readyCount > 0 ? "#2563eb" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: readyCount > 0 ? "pointer" : "not-allowed",
                fontWeight: 600,
                marginBottom: 32,
              }}
            >
              Import {readyCount > 0 ? `${readyCount} file${readyCount !== 1 ? "s" : ""}` : "All"}
            </button>
          )}

          {/* Import history */}
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Import History</h2>
          {historyLoading ? (
            <div style={{ color: "#9ca3af" }}>Loading…</div>
          ) : importHistory.length === 0 ? (
            <div style={{ color: "#9ca3af" }}>No imports yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px" }}>File</th>
                  <th style={{ padding: "6px 8px" }}>Race</th>
                  <th style={{ padding: "6px 8px" }}>Rows</th>
                  <th style={{ padding: "6px 8px" }}>Imported</th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 8px", color: "#374151" }}>{r.original_filename}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <a href="/admin/raw-races" style={{ color: "#2563eb" }}>{r.race_name}</a>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{r.row_count.toLocaleString()}</td>
                    <td style={{ padding: "6px 8px", color: "#6b7280" }}>
                      {new Date(r.created_at).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── GPX Tab ── */}
      {tab === "gpx" && (
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setGpxDragOver(true); }}
            onDragLeave={() => setGpxDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setGpxDragOver(false);
              addGpxFiles(Array.from(e.dataTransfer.files));
            }}
            onClick={() => gpxInputRef.current?.click()}
            style={{
              border: `2px dashed ${gpxDragOver ? "#2563eb" : "#d1d5db"}`,
              borderRadius: 8,
              padding: "32px 24px",
              textAlign: "center",
              cursor: "pointer",
              background: gpxDragOver ? "#eff6ff" : "#f9fafb",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Drop GPX files here or <span style={{ color: "#2563eb" }}>click to browse</span>
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
              Files are stored and can be linked to a race later
            </div>
            <input
              ref={gpxInputRef}
              type="file"
              accept=".gpx"
              multiple
              style={{ display: "none" }}
              onChange={(e) => e.target.files && addGpxFiles(e.target.files)}
            />
          </div>

          {gpxFiles.length > 0 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {gpxFiles.map((f) => (
                  <div
                    key={f.file.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      background: "#fff",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 13 }}>{f.file.name}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      {(f.file.size / 1024).toFixed(0)} KB
                    </span>
                    <StatusBadge status={f.status} message={f.message} />
                    {f.status === "pending" && (
                      <button
                        onClick={() => uploadGpx(f)}
                        style={{ fontSize: 12, padding: "4px 10px", cursor: "pointer", border: "1px solid #d1d5db", borderRadius: 4 }}
                      >
                        Upload
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={uploadAllGpx}
                disabled={gpxPendingCount === 0}
                style={{
                  padding: "10px 24px",
                  background: gpxPendingCount > 0 ? "#2563eb" : "#9ca3af",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: gpxPendingCount > 0 ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Upload All ({gpxPendingCount})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CsvFileCard({
  fileState: f,
  onRemove,
  onEditName,
  onEditYear,
}: {
  fileState: FileState;
  onRemove: () => void;
  onEditName: (v: string) => void;
  onEditYear: (v: string) => void;
}) {
  const statusColor: Record<FileState["status"], string> = {
    pending: "#2563eb",
    importing: "#d97706",
    done: "#16a34a",
    skipped: "#9ca3af",
    error: "#dc2626",
  };
  const statusLabel: Record<FileState["status"], string> = {
    pending: "Ready",
    importing: "Importing…",
    done: "Done",
    skipped: "Skipped",
    error: "Error",
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{f.file.name}</span>
            <span style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 9999,
              background: statusColor[f.status] + "20",
              color: statusColor[f.status],
              fontWeight: 600,
            }}>
              {f.resultMessage ?? statusLabel[f.status]}
            </span>
          </div>

          {f.parsed && f.status !== "error" && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Race:</span>
                <input
                  value={f.editName}
                  onChange={(e) => onEditName(e.target.value)}
                  disabled={f.status !== "pending"}
                  style={{ border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 6px", fontSize: 12, width: 240 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>Year:</span>
                <input
                  value={f.editYear}
                  onChange={(e) => onEditYear(e.target.value)}
                  disabled={f.status !== "pending"}
                  style={{ border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 6px", fontSize: 12, width: 60 }}
                />
              </label>
              <span style={{ fontSize: 12, color: "#6b7280" }}>{formatCount(f.parsed.rows)}</span>
              {f.parsed.parseErrors.length > 0 && (
                <span style={{ fontSize: 11, color: "#d97706" }}>⚠ {f.parsed.parseErrors[0]}</span>
              )}
            </div>
          )}

          {f.parseError && (
            <div style={{ fontSize: 12, color: "#dc2626" }}>Parse error: {f.parseError}</div>
          )}
          {!f.parsed && !f.parseError && (
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Parsing…</div>
          )}
        </div>

        {f.status === "pending" && (
          <button
            onClick={onRemove}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, message }: { status: GpxFileState["status"]; message: string | null }) {
  const map: Record<GpxFileState["status"], { color: string; label: string }> = {
    pending: { color: "#6b7280", label: "Pending" },
    uploading: { color: "#d97706", label: "Uploading…" },
    done: { color: "#16a34a", label: "Done" },
    error: { color: "#dc2626", label: message ?? "Error" },
  };
  const { color, label } = map[status];
  return <span style={{ fontSize: 12, color }}>{label}</span>;
}

"use client";

import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawRace {
  id: string;
  name: string;
  slug: string;
  race_year: number | null;
  created_at: string;
  result_count: number;
  source_files: string[];
}

interface PublishedRace {
  id: string;
  name: string;
  slug: string;
}

interface PublishForm {
  name: string;
  slug: string;
  location: string;
  distance_km: string;
  terrain_type: string;
  race_date: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RawRacesPage() {
  const [races, setRaces] = useState<RawRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Publish modal
  const [publishTarget, setPublishTarget] = useState<RawRace | null>(null);
  const [publishForm, setPublishForm] = useState<PublishForm>({
    name: "",
    slug: "",
    location: "",
    distance_km: "",
    terrain_type: "",
    race_date: "",
  });
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  // Link modal
  const [linkTarget, setLinkTarget] = useState<RawRace | null>(null);
  const [publishedRaces, setPublishedRaces] = useState<PublishedRace[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [selectedLinkRace, setSelectedLinkRace] = useState<PublishedRace | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/raw-races");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setRaces(body.races ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  function openPublish(race: RawRace) {
    setPublishTarget(race);
    setPublishForm({
      name: race.name,
      slug: race.slug,
      location: "",
      distance_km: "",
      terrain_type: "",
      race_date: "",
    });
    setPublishError(null);
  }

  async function submitPublish() {
    if (!publishTarget) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch(`/api/admin/raw-races/${publishTarget.id}/publish`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: publishForm.name,
          slug: publishForm.slug,
          location: publishForm.location || null,
          distance_km: publishForm.distance_km ? parseFloat(publishForm.distance_km) : null,
          terrain_type: publishForm.terrain_type || null,
          race_date: publishForm.race_date || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setPublishTarget(null);
      await load();
    } catch (e) {
      setPublishError(String(e));
    } finally {
      setPublishing(false);
    }
  }

  // ── Link ──────────────────────────────────────────────────────────────────

  async function openLink(race: RawRace) {
    setLinkTarget(race);
    setLinkSearch("");
    setSelectedLinkRace(null);
    setLinkError(null);
    // Load published races for selection
    const res = await fetch("/api/admin/raw-races/published-list");
    if (res.ok) {
      const body = await res.json();
      setPublishedRaces(body.races ?? []);
    }
  }

  async function submitLink() {
    if (!linkTarget || !selectedLinkRace) return;
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/admin/raw-races/${linkTarget.id}/link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_race_id: selectedLinkRace.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setLinkTarget(null);
      await load();
    } catch (e) {
      setLinkError(String(e));
    } finally {
      setLinking(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteRace(race: RawRace) {
    if (!confirm(`Delete "${race.name}" and all ${race.result_count.toLocaleString()} result rows? This cannot be undone.`)) return;
    setDeleting((d) => ({ ...d, [race.id]: true }));
    setDeleteError((e) => { const next = { ...e }; delete next[race.id]; return next; });
    try {
      const res = await fetch(`/api/admin/raw-races/${race.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setRaces((prev) => prev.filter((r) => r.id !== race.id));
    } catch (e) {
      setDeleteError((d) => ({ ...d, [race.id]: String(e) }));
    } finally {
      setDeleting((d) => { const next = { ...d }; delete next[race.id]; return next; });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const filteredPublished = publishedRaces.filter(
    (r) =>
      r.name.toLowerCase().includes(linkSearch.toLowerCase()) ||
      r.slug.toLowerCase().includes(linkSearch.toLowerCase())
  );

  return (
    <div style={{ padding: "24px", maxWidth: 1040, fontFamily: "sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin/athlete-network" style={{ color: "#6b7280", fontSize: 14 }}>
          ← Athlete Network
        </a>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Raw Races</h1>
        <a
          href="/admin/results-import"
          style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}
        >
          + Import more
        </a>
      </div>
      <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
        Races imported from CSV files. They are not visible to athletes until published. Athlete
        network analysis runs on all results regardless of published status.
      </p>

      {error && <div style={{ color: "#dc2626", marginBottom: 16 }}>{error}</div>}
      {loading ? (
        <div style={{ color: "#9ca3af" }}>Loading…</div>
      ) : races.length === 0 ? (
        <div style={{ color: "#9ca3af" }}>
          No unpublished races.{" "}
          <a href="/admin/results-import" style={{ color: "#2563eb" }}>Import some CSVs</a>.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
              <th style={{ padding: "8px 10px" }}>Race Name</th>
              <th style={{ padding: "8px 10px" }}>Year</th>
              <th style={{ padding: "8px 10px" }}>Results</th>
              <th style={{ padding: "8px 10px" }}>Source Files</th>
              <th style={{ padding: "8px 10px" }}>Imported</th>
              <th style={{ padding: "8px 10px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {races.map((race) => (
              <tr key={race.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 10px", fontWeight: 500 }}>{race.name}</td>
                <td style={{ padding: "8px 10px", color: "#6b7280" }}>{race.race_year ?? "—"}</td>
                <td style={{ padding: "8px 10px" }}>{race.result_count.toLocaleString()}</td>
                <td style={{ padding: "8px 10px", color: "#6b7280", fontSize: 12, maxWidth: 220, wordBreak: "break-all" }}>
                  {race.source_files.join(", ")}
                </td>
                <td style={{ padding: "8px 10px", color: "#9ca3af", fontSize: 12 }}>
                  {new Date(race.created_at).toLocaleDateString("en-GB")}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => openPublish(race)}
                      style={btnStyle("#16a34a")}
                    >
                      Publish
                    </button>
                    <button
                      onClick={() => openLink(race)}
                      style={btnStyle("#2563eb")}
                    >
                      Link
                    </button>
                    <button
                      onClick={() => deleteRace(race)}
                      disabled={!!deleting[race.id]}
                      style={btnStyle("#dc2626")}
                    >
                      {deleting[race.id] ? "…" : "Delete"}
                    </button>
                  </div>
                  {deleteError[race.id] && (
                    <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{deleteError[race.id]}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── Publish Modal ── */}
      {publishTarget && (
        <Modal onClose={() => setPublishTarget(null)} title={`Publish: ${publishTarget.name}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FormField label="Race Name *" value={publishForm.name} onChange={(v) => setPublishForm((f) => ({ ...f, name: v }))} />
            <FormField label="Slug *" value={publishForm.slug} onChange={(v) => setPublishForm((f) => ({ ...f, slug: v }))} placeholder="e.g. salomon-glen-coe-skyline" />
            <FormField label="Location" value={publishForm.location} onChange={(v) => setPublishForm((f) => ({ ...f, location: v }))} />
            <FormField label="Distance (km)" value={publishForm.distance_km} onChange={(v) => setPublishForm((f) => ({ ...f, distance_km: v }))} type="number" />
            <FormField label="Terrain type" value={publishForm.terrain_type} onChange={(v) => setPublishForm((f) => ({ ...f, terrain_type: v }))} placeholder="e.g. mountain, trail, road" />
            <FormField label="Race date" value={publishForm.race_date} onChange={(v) => setPublishForm((f) => ({ ...f, race_date: v }))} type="date" />

            {publishError && <div style={{ color: "#dc2626", fontSize: 13 }}>{publishError}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setPublishTarget(null)} style={btnStyle("#6b7280")}>Cancel</button>
              <button onClick={submitPublish} disabled={publishing || !publishForm.slug} style={btnStyle("#16a34a")}>
                {publishing ? "Publishing…" : "Publish Race"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Link Modal ── */}
      {linkTarget && (
        <Modal onClose={() => setLinkTarget(null)} title={`Link "${linkTarget.name}" to existing race`}>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
            Moves all {linkTarget.result_count.toLocaleString()} result rows into the selected published race and removes this entry.
          </p>
          <input
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Search published races…"
            style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            {filteredPublished.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedLinkRace(r)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: selectedLinkRace?.id === r.id ? "#eff6ff" : "transparent",
                  borderBottom: "1px solid #f3f4f6",
                  fontSize: 13,
                }}
              >
                {r.name} <span style={{ color: "#9ca3af", fontSize: 11 }}>{r.slug}</span>
              </div>
            ))}
            {filteredPublished.length === 0 && (
              <div style={{ padding: "12px", color: "#9ca3af", fontSize: 13 }}>No matches</div>
            )}
          </div>

          {linkError && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{linkError}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button onClick={() => setLinkTarget(null)} style={btnStyle("#6b7280")}>Cancel</button>
            <button onClick={submitLink} disabled={!selectedLinkRace || linking} style={btnStyle("#2563eb")}>
              {linking ? "Linking…" : "Link Results"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "5px 12px",
    background: color + "18",
    color,
    border: `1px solid ${color}40`,
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
  };
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
    }}>
      <div style={{ background: "#fff", borderRadius: 10, padding: 24, width: 480, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <span style={{ color: "#374151", fontWeight: 500 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
      />
    </label>
  );
}

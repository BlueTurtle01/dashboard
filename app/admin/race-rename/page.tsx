"use client";

import { useEffect, useMemo, useState } from "react";

interface Race {
  id: string;
  name: string;
  slug: string;
  race_year: number | null;
  is_published: boolean;
  is_archived: boolean;
  result_count: number;
}

type SaveState = "idle" | "saving" | "done" | "error";

export default function RaceRenamePage() {
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Per-row editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Merge confirmation
  const [pendingMerge, setPendingMerge] = useState<{
    sourceId: string;
    newName: string;
    targetName: string;
  } | null>(null);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<Race | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Archive state
  const [archivingId, setArchivingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/races");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load races");
      setRaces(body.races ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return races.filter((r) => {
      if (!showArchived && r.is_archived) return false;
      if (showArchived && !r.is_archived) return false;
      if (q) return r.name.toLowerCase().includes(q);
      return true;
    });
  }, [races, search, showArchived]);

  function startEdit(race: Race) {
    setEditingId(race.id);
    setEditValue(race.name);
    setSaveState("idle");
    setSaveError(null);
    setPendingMerge(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setSaveState("idle");
    setSaveError(null);
    setPendingMerge(null);
  }

  function checkForMerge(sourceId: string, newName: string): string | null {
    const lower = newName.trim().toLowerCase();
    const match = races.find(
      (r) => r.id !== sourceId && r.name.toLowerCase() === lower
    );
    return match ? match.name : null;
  }

  async function doSave(sourceId: string, newName: string) {
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/races/${sourceId}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");

      setSaveState("done");
      setPendingMerge(null);
      setEditingId(null);
      await load();
    } catch (e) {
      setSaveState("error");
      setSaveError(String(e));
    }
  }

  async function doDelete(race: Race) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/races/${race.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Delete failed");
      setPendingDelete(null);
      await load();
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  async function doArchive(race: Race) {
    setArchivingId(race.id);
    try {
      const res = await fetch(`/api/admin/races/${race.id}/archive`, { method: "PATCH" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Archive failed");
      await load();
    } finally {
      setArchivingId(null);
    }
  }

  function handleSaveClick(sourceId: string) {
    const newName = editValue.trim();
    if (!newName) return;
    const existingName = checkForMerge(sourceId, newName);
    if (existingName) {
      setPendingMerge({ sourceId, newName, targetName: existingName });
    } else {
      doSave(sourceId, newName);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Race Rename</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Search for a race and edit its name. If the new name matches an existing race, all
        results will be merged into that race and the duplicate removed.
      </p>

      <div className="flex items-center gap-4 mb-6">
        <input
          type="text"
          placeholder="Search races…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-zinc-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-zinc-300 accent-blue-600"
          />
          Show archived
        </label>
      </div>

      {loading && <p className="text-sm text-zinc-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="border border-zinc-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-medium">Race name</th>
                <th className="px-4 py-3 text-left font-medium w-16">Year</th>
                <th className="px-4 py-3 text-left font-medium w-20">Results</th>
                <th className="px-4 py-3 text-left font-medium w-24">Status</th>
                <th className="px-4 py-3 w-40" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                    No races found
                  </td>
                </tr>
              )}
              {filtered.map((race) => {
                const isEditing = editingId === race.id;
                const isArchiving = archivingId === race.id;
                return (
                  <tr key={race.id} className={`hover:bg-zinc-50 ${race.is_archived ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveClick(race.id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="border border-zinc-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {saveState === "error" && saveError && (
                            <p className="text-xs text-red-600">{saveError}</p>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium text-zinc-800">{race.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {race.race_year ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{race.result_count}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                          race.is_published
                            ? "bg-green-100 text-green-700"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {race.is_published ? "published" : "imported"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleSaveClick(race.id)}
                            disabled={saveState === "saving" || !editValue.trim() || editValue.trim() === race.name}
                            className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-40"
                          >
                            {saveState === "saving" ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saveState === "saving"}
                            className="text-xs text-zinc-500 hover:text-zinc-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-3 justify-end">
                          {!race.is_archived && (
                            <button
                              onClick={() => startEdit(race)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Rename
                            </button>
                          )}
                          <button
                            onClick={() => doArchive(race)}
                            disabled={isArchiving}
                            className="text-xs text-zinc-500 hover:text-zinc-800 font-medium disabled:opacity-40"
                          >
                            {isArchiving
                              ? "…"
                              : race.is_archived
                              ? "Unarchive"
                              : "Archive"}
                          </button>
                          <button
                            onClick={() => { setPendingDelete(race); setDeleteError(null); }}
                            className="text-xs text-red-500 hover:text-red-700 font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-2">Delete race?</h2>
            <p className="text-sm text-zinc-600 mb-1">
              <span className="font-medium text-zinc-900">&ldquo;{pendingDelete.name}&rdquo;</span> will be permanently deleted along with all{" "}
              <span className="font-medium text-zinc-900">{pendingDelete.result_count}</span> results. This cannot be undone.
            </p>
            {deleteError && <p className="text-xs text-red-600 mt-2">{deleteError}</p>}
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="text-sm text-zinc-500 hover:text-zinc-800 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => doDelete(pendingDelete)}
                disabled={deleting}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-40"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge confirmation dialog */}
      {pendingMerge && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-2">Merge races?</h2>
            <p className="text-sm text-zinc-600 mb-4">
              A race named{" "}
              <span className="font-medium text-zinc-900">
                &ldquo;{pendingMerge.targetName}&rdquo;
              </span>{" "}
              already exists. All results from this race will be moved into it and
              this entry will be removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingMerge(null)}
                className="text-sm text-zinc-500 hover:text-zinc-800 px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => doSave(pendingMerge.sourceId, pendingMerge.newName)}
                disabled={saveState === "saving"}
                className="text-sm bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-40"
              >
                {saveState === "saving" ? "Merging…" : "Merge & remove duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

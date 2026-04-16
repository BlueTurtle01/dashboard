"use client";

import { useEffect, useState } from "react";
import { getSessionLibraryItemById, searchSessionLibrary, SessionLibraryItem } from "@/lib/planner/sessionLibrary";
import { PlanSession } from "@/lib/planner/types";

export default function SessionSearchReplace({
  session,
  onApply,
}: {
  session: PlanSession;
  onApply: (nextSession: PlanSession) => void;
}) {
  const [query, setQuery] = useState(session.name);
  const [results, setResults] = useState<SessionLibraryItem[]>([]);

  useEffect(() => {
    searchSessionLibrary(query).then(setResults);
  }, [query]);

  async function handleSelect(item: SessionLibraryItem) {
    const selected = await getSessionLibraryItemById(item.id);
    if (!selected) return;
    onApply({
      ...session,
      type: selected.type,
      name: selected.name,
      description: selected.description,
      tags: selected.tags,
      duration: selected.duration,
      intensity: selected.intensity,
      isKeySession: selected.isKeySession,
      exercises: selected.exercises,
    });
    setQuery(selected.name);
  }

  return (
    <div className="space-y-3">
      <input
        className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none transition focus:border-zinc-500"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type to search session library"
      />

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Suggestions
        </div>
        <div className="grid gap-2">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-3 text-left transition hover:bg-zinc-100"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-zinc-900">{item.name}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                  {item.type}
                </span>
              </div>
              <div className="mt-1 text-sm text-zinc-600">{item.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

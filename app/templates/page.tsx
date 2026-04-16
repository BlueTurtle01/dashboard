"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { planRepository } from "@/lib/data/planRepository";

type PlanTemplate = { id: string; name: string; createdAt: string };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<PlanTemplate[]>([]);

  useEffect(() => {
    // Legacy template storage — no-op
    void planRepository;
    setTemplates([]);
  }, []);

  function loadTemplate(_id: string) {
    window.location.href = "/coach";
  }

  function deleteTemplate(_id: string) {
    setTemplates([]);
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Templates</h1>

          <Link
            href="/coach"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
          >
            Back to Coach
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            No templates yet.
          </div>
        ) : (
          <div className="space-y-4">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-lg">{template.name}</div>
                  <div className="text-sm text-zinc-500">
                    {new Date(template.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => loadTemplate(template.id)}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
                  >
                    Load
                  </button>

                  <button
                    onClick={() => deleteTemplate(template.id)}
                    className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
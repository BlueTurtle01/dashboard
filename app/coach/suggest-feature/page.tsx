"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SuggestFeaturePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in to submit a suggestion.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("feature_suggestions")
      .insert({
        coach_user_id: user.id,
        title: title.trim(),
        description: description.trim(),
        created_at: new Date().toISOString(),
      });

    setLoading(false);
    if (insertError) {
      setError(`Error submitting suggestion: ${insertError.message}`);
      return;
    }

    setSubmitted(true);
    setTitle("");
    setDescription("");
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Suggest a Feature</h1>
        <p className="mt-3 text-zinc-600">
          Help us improve the Coach Dashboard by suggesting new features or improvements.
        </p>

        {submitted && (
          <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-900">
            ✓ Thanks for your suggestion! We'll review it shortly.
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-medium text-red-900">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-zinc-900 mb-2">
              Feature Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dark mode, Export plans as PDF"
              required
              disabled={loading || submitted}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-zinc-900 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us more about this feature..."
              rows={6}
              required
              disabled={loading || submitted}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm disabled:opacity-50"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !title.trim() || !description.trim() || submitted}
              className="rounded-xl bg-zinc-900 text-white px-5 py-3 text-sm font-semibold hover:bg-zinc-700 disabled:opacity-50"
            >
              {loading ? "Submitting..." : "Submit Suggestion"}
            </button>
            <Link
              href="/coach/dashboard"
              className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold hover:bg-zinc-100"
            >
              Back
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GeneratedPlan } from "@/lib/planner/types";

export default function FeedbackPage() {
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [planId, setPlanId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionDate, setSubmissionDate] = useState<string | null>(null);

  // Form state
  const [whatWentWell, setWhatWentWell] = useState("");
  const [whatDidntWork, setWhatDidntWork] = useState("");
  const [newInjuries, setNewInjuries] = useState("");
  const [lifeChanges, setLifeChanges] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [overallFeeling, setOverallFeeling] = useState<number | null>(null);
  const [planClarity, setPlanClarity] = useState<number | null>(null);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
          setError("Unable to authenticate");
          setLoading(false);
          return;
        }

        const { data: planData, error: queryError } = await supabase
          .from("athlete_plans")
          .select("id, plan_json")
          .eq("athlete_user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queryError) {
          setError("Failed to load plan");
          setLoading(false);
          return;
        }

        if (!planData) {
          setError("No active plan found");
          setLoading(false);
          return;
        }

        const plan = planData.plan_json as GeneratedPlan;
        setPlanId(planData.id);
        setPlan(plan);

        // For now, always use month 1 (single feedback per plan for MVP)
        // Can enhance later to track multiple months per plan
        const currentMonth = 1;

        // Check if feedback already submitted for month 1
        const { data: existingFeedback } = await supabase
          .from("athlete_feedback")
          .select("submitted_at")
          .eq("athlete_user_id", user.id)
          .eq("plan_id", planData.id)
          .eq("month_number", currentMonth)
          .maybeSingle();

        if (existingFeedback) {
          setSubmitted(true);
          setSubmissionDate(existingFeedback.submitted_at);
        }

        setLoading(false);
      } catch (err) {
        setError("An error occurred while loading your check-in");
        setLoading(false);
      }
    };

    fetchPlan();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (overallFeeling === null || planClarity === null) {
      setError("Please rate both the overall feeling and plan clarity");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("Authentication failed");
        setSubmitting(false);
        return;
      }

      const currentMonth = 1; // MVP: single feedback per plan

      const { error: insertError } = await supabase
        .from("athlete_feedback")
        .insert({
          athlete_user_id: user.id,
          plan_id: planId,
          month_number: currentMonth,
          what_went_well: whatWentWell || null,
          what_didnt_work: whatDidntWork || null,
          new_injuries: newInjuries || null,
          life_changes: lifeChanges || null,
          suggestions: suggestions || null,
          overall_feeling: overallFeeling,
          plan_clarity: planClarity,
        });

      if (insertError) {
        setError("Failed to submit feedback");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
      setSubmissionDate(new Date().toISOString());
      setSubmitting(false);
    } catch (err) {
      setError("An error occurred while submitting");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-zinc-600">Loading check-in…</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
        <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-8 shadow-sm text-center">
          <div className="text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-emerald-900">Thank you!</h1>
          <p className="mt-3 text-emerald-800">
            Your monthly check-in has been submitted. Your coach is reviewing your feedback.
          </p>
          {submissionDate && (
            <p className="mt-2 text-sm text-emerald-700">
              Submitted on {new Date(submissionDate).toLocaleDateString()}
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">Monthly Check-in</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Tell your coach how the past month went, what you'd like to adjust, and how you're feeling.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
            {/* What went well */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">What went well this month?</label>
              <textarea
                rows={4}
                value={whatWentWell}
                onChange={(e) => setWhatWentWell(e.target.value)}
                placeholder="E.g., I nailed the tempo runs, felt great on the long run, recovered well…"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>

            {/* What didn't work */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">
                What didn't work / was too hard or easy?
              </label>
              <textarea
                rows={4}
                value={whatDidntWork}
                onChange={(e) => setWhatDidntWork(e.target.value)}
                placeholder="E.g., The intervals felt too hard, I was too tired, didn't have time for gym days…"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>

            {/* New injuries */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">
                Any new injuries or physical concerns? <span className="text-xs text-zinc-500">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={newInjuries}
                onChange={(e) => setNewInjuries(e.target.value)}
                placeholder="E.g., Left knee pain during runs, lower back tightness…"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>

            {/* Life changes */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">
                Any life changes coming up? <span className="text-xs text-zinc-500">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={lifeChanges}
                onChange={(e) => setLifeChanges(e.target.value)}
                placeholder="E.g., Traveling next week, new job starting, lots of stress at home…"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>

            {/* Suggestions */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">
                Anything you'd like to try next month? <span className="text-xs text-zinc-500">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={suggestions}
                onChange={(e) => setSuggestions(e.target.value)}
                placeholder="E.g., More hill work, longer long runs, fewer gym sessions…"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm"
              />
            </div>

            {/* Overall feeling */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">How are you feeling overall?</label>
              <div className="mt-3 flex gap-2 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setOverallFeeling(num)}
                    className={`w-10 h-10 rounded font-semibold text-sm transition-colors ${
                      overallFeeling === num
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-300 text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">1 = Struggling, 10 = Crushing it</p>
            </div>

            {/* Plan clarity */}
            <div>
              <label className="text-sm font-semibold text-zinc-700">
                How clear and easy to follow was the plan?
              </label>
              <div className="mt-3 flex gap-2 flex-wrap">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPlanClarity(num)}
                    className={`w-10 h-10 rounded font-semibold text-sm transition-colors ${
                      planClarity === num
                        ? "bg-zinc-900 text-white"
                        : "border border-zinc-300 text-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">1 = Confusing, 10 = Crystal clear</p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit Check-in"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

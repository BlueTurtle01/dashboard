"use client";

import { useEffect, useState } from "react";
import {
  getRaceQuestionsForAthlete,
  submitRaceQuestion,
  markKbNotificationsRead,
  type QuestionWithAnswers,
} from "@/lib/actions/knowledge-base";
import { createClient } from "@/lib/supabase/client";

type Race = {
  id: string;
  name: string;
};

export default function AthleteRaceKbClient() {
  const supabase = createClient();

  const [questions, setQuestions] = useState<QuestionWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalBody, setModalBody] = useState("");
  const [selectedRaceId, setSelectedRaceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availableRaces, setAvailableRaces] = useState<Race[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error: profileError } = await supabase
        .from("athlete_profiles")
        .select("selected_event_id, selected_preparation_race_ids")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);

      const raceIds = new Set<string>();
      if (profile?.selected_event_id) raceIds.add(profile.selected_event_id);
      if (profile?.selected_preparation_race_ids?.length) {
        profile.selected_preparation_race_ids.forEach((id: string) => raceIds.add(id));
      }

      if (raceIds.size > 0) {
        const { data: races, error: racesError } = await supabase
          .from("races")
          .select("id, name")
          .in("id", Array.from(raceIds))
          .order("name");

        if (racesError) throw new Error(racesError.message);
        setAvailableRaces((races ?? []) as Race[]);
      }

      const data = await getRaceQuestionsForAthlete();
      setQuestions(data);
      void markKbNotificationsRead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitQuestion() {
    if (!modalTitle.trim() || !selectedRaceId) {
      alert("Please enter a question title and select a race");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitRaceQuestion(modalTitle, modalBody, selectedRaceId);
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else {
        setModalTitle("");
        setModalBody("");
        setSelectedRaceId("");
        setShowModal(false);
        await loadData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit question");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredQuestions = questions.filter((q) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return q.title.toLowerCase().includes(searchLower) || q.body.toLowerCase().includes(searchLower);
  });

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-zinc-500">Loading race questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (availableRaces.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-amber-900">
          You haven't selected any goal races or preparation races yet. Update your profile to ask race-specific questions.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h2 className="mb-1 text-xl font-bold text-zinc-900">Race Questions</h2>
          <p className="text-sm text-zinc-500">Ask coaches about races in your goal or prep race list.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          Ask a Question
        </button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search questions by title or content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      {filteredQuestions.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-zinc-500">
            {questions.length === 0
              ? "No race questions yet. Be the first to ask one!"
              : "No questions match your search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredQuestions.map((question) => (
            <div key={question.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="mb-1 text-lg font-semibold text-zinc-900">{question.title}</h3>
                    {question.body.trim() !== question.title.trim() && (
                      <p className="text-sm text-zinc-600">{question.body}</p>
                    )}
                  </div>
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                    {question.answer_count} {question.answer_count === 1 ? "answer" : "answers"}
                  </span>
                </div>
              </div>

              {question.answer_count > 0 ? (
                <div className="px-6 py-4">
                  <h4 className="mb-3 text-sm font-semibold text-zinc-700">Answers</h4>
                  <div className="space-y-3">
                    {question.answers.map((answer) => (
                      <div key={answer.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-zinc-900">{answer.submitted_by_name}</p>
                          <p className="text-xs text-zinc-500">
                            {new Date(answer.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-zinc-700">{answer.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-6 py-4">
                  <p className="text-sm italic text-zinc-400">No answers yet. Coaches may respond soon!</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ask a Question Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Ask a Race Question</h2>
            <p className="mb-5 text-sm text-zinc-500">
              Ask coaches about a specific race. Only coaches who have completed the race can answer.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="raceSelect">
                Which race? <span className="text-red-500">*</span>
              </label>
              <select
                id="raceSelect"
                value={selectedRaceId}
                onChange={(e) => setSelectedRaceId(e.target.value)}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <option value="">Select a race...</option>
                {availableRaces.map((race) => (
                  <option key={race.id} value={race.id}>
                    {race.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="questionTitle">
                Question Title <span className="text-red-500">*</span>
              </label>
              <input
                id="questionTitle"
                type="text"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                placeholder="e.g., How should I prepare for the heat?"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="questionBody">
                Question Details <span className="text-zinc-400">(optional)</span>
              </label>
              <textarea
                id="questionBody"
                value={modalBody}
                onChange={(e) => setModalBody(e.target.value)}
                placeholder="Provide more context about your question..."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                rows={4}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowModal(false);
                  setModalTitle("");
                  setModalBody("");
                  setSelectedRaceId("");
                }}
                disabled={submitting}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitQuestion()}
                disabled={!modalTitle.trim() || !selectedRaceId || submitting}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

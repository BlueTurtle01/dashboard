"use client";

import { useEffect, useState } from "react";
import {
  getQuestions,
  submitQuestion,
  markKbNotificationsRead,
  type QuestionWithAnswers,
} from "@/lib/actions/knowledge-base";

export default function AthleteKnowledgeBase() {
  const [questions, setQuestions] = useState<QuestionWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalBody, setModalBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadQuestions();
    void markKbNotificationsRead();
  }, []);

  async function loadQuestions() {
    try {
      setLoading(true);
      const data = await getQuestions();
      setQuestions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitQuestion() {
    if (!modalTitle.trim() || !modalBody.trim()) {
      alert("Please fill in both title and body");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitQuestion(modalTitle, modalBody);
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else {
        setModalTitle("");
        setModalBody("");
        setShowModal(false);
        await loadQuestions();
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
        <p className="text-zinc-500">Loading knowledge base...</p>
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-zinc-900">Knowledge Base</h1>
          <p className="text-sm text-zinc-500">Find answers to common questions about your training.</p>
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
              ? "No questions yet. Be the first to ask one!"
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
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-zinc-900">{question.title}</h2>
                      {question.type === "faq" && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          FAQ
                        </span>
                      )}
                    </div>
                    {question.type !== "faq" && (
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
                  <h3 className="mb-3 text-sm font-semibold text-zinc-700">Answers</h3>
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
                  <p className="text-sm italic text-zinc-400">No answers yet. Check back soon!</p>
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
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Ask a Question</h2>
            <p className="mb-5 text-sm text-zinc-500">
              Share your question with our coaching team. They will provide answers that might help other athletes too.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="questionTitle">
                Question Title <span className="text-red-500">*</span>
              </label>
              <input
                id="questionTitle"
                type="text"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                placeholder="e.g., How should I train in hot weather?"
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-zinc-700" htmlFor="questionBody">
                Question Details <span className="text-red-500">*</span>
              </label>
              <textarea
                id="questionBody"
                value={modalBody}
                onChange={(e) => setModalBody(e.target.value)}
                placeholder="Provide more details about your question..."
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
                }}
                disabled={submitting}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitQuestion()}
                disabled={!modalTitle.trim() || !modalBody.trim() || submitting}
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

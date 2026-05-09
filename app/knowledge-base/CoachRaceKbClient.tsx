"use client";

import { useEffect, useState } from "react";
import {
  getRaceQuestionsForCoach,
  submitRaceAnswer,
  type QuestionWithAnswers,
} from "@/lib/actions/knowledge-base";

type QuestionUI = QuestionWithAnswers & {
  answerBody: string;
  isSubmitting: boolean;
};

export default function CoachRaceKbClient() {
  const [questions, setQuestions] = useState<QuestionUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadQuestions();
  }, []);

  async function loadQuestions() {
    try {
      setLoading(true);
      const data = await getRaceQuestionsForCoach();
      setQuestions(
        data.map((q) => ({
          ...q,
          answerBody: "",
          isSubmitting: false,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questions");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAnswer(questionId: string, answerBody: string) {
    const questionIndex = questions.findIndex((q) => q.id === questionId);
    if (questionIndex === -1) return;

    if (!answerBody.trim()) {
      alert("Please enter an answer");
      return;
    }

    const updatedQuestions = [...questions];
    updatedQuestions[questionIndex].isSubmitting = true;
    setQuestions(updatedQuestions);

    try {
      const result = await submitRaceAnswer(questionId, answerBody);
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else {
        await loadQuestions();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit answer");
    } finally {
      updatedQuestions[questionIndex].isSubmitting = false;
      setQuestions(updatedQuestions);
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div>
          <h2 className="mb-1 text-xl font-bold text-zinc-900">Race Questions</h2>
          <p className="text-sm text-zinc-500">Answer questions about races you have completed.</p>
        </div>
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
              ? "No race questions for your completed races yet. Check back soon!"
              : "No questions match your search."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredQuestions.map((question) => {
            const canAnswer = question.answer_count < 3;
            const hasAnswered = question.answers.some(
              (a) => a.submitted_by_name && a.submitted_by_name.includes("Coach")
            );

            return (
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

                {question.answer_count > 0 && (
                  <div className="border-b border-zinc-100 px-6 py-4">
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
                )}

                {canAnswer && (
                  <div className="px-6 py-4">
                    <div className="mb-3">
                      <label className="mb-2 block text-sm font-medium text-zinc-700">Your Answer</label>
                      <textarea
                        value={
                          questions[questions.findIndex((q) => q.id === question.id)]?.answerBody || ""
                        }
                        onChange={(e) => {
                          const index = questions.findIndex((q) => q.id === question.id);
                          const updated = [...questions];
                          updated[index].answerBody = e.target.value;
                          setQuestions(updated);
                        }}
                        placeholder="Share your experience and advice..."
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                        rows={4}
                        disabled={question.isSubmitting}
                      />
                    </div>
                    <button
                      onClick={() => {
                        const index = questions.findIndex((q) => q.id === question.id);
                        handleSubmitAnswer(question.id, questions[index].answerBody);
                      }}
                      disabled={
                        !questions[questions.findIndex((q) => q.id === question.id)]?.answerBody.trim() ||
                        question.isSubmitting
                      }
                      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {question.isSubmitting ? "Submitting..." : "Submit Answer"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  getQuestionsForCoach,
  submitAnswer,
  flagQuestion,
  type QuestionWithAnswers,
} from "@/lib/actions/knowledge-base";
import { createClient } from "@/lib/supabase/client";

type QuestionUI = QuestionWithAnswers & {
  answerBody?: string;
  isSubmitting?: boolean;
};

export default function CoachKbClient({ initialQuestions }: { initialQuestions: QuestionWithAnswers[] }) {
  const [questions, setQuestions] = useState<QuestionUI[]>(
    initialQuestions.map((q) => ({ ...q, answerBody: "", isSubmitting: false }))
  );
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagModalQuestionId, setFlagModalQuestionId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) setCurrentUserId(user.id);
    })();
  }, []);

  async function handleSubmitAnswer(questionId: string) {
    const question = questions.find((q) => q.id === questionId);
    if (!question?.answerBody?.trim()) {
      alert("Please enter an answer");
      return;
    }

    const updated = questions.map((q) =>
      q.id === questionId ? { ...q, isSubmitting: true } : q
    );
    setQuestions(updated);

    try {
      const result = await submitAnswer(questionId, question.answerBody);
      if (result.error) {
        alert(`Error: ${result.error}`);
        setQuestions(questions);
        return;
      }

      await loadQuestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to submit answer");
      setQuestions(questions);
    }
  }

  async function loadQuestions() {
    try {
      setLoading(true);
      const data = await getQuestionsForCoach();
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

  async function handleFlagQuestion() {
    if (!flagModalQuestionId || !flagReason.trim()) {
      alert("Please provide a reason for flagging");
      return;
    }

    setFlagSubmitting(true);
    try {
      const result = await flagQuestion(flagModalQuestionId, flagReason);
      if (result.error) {
        alert(`Error: ${result.error}`);
      } else {
        alert("Question flagged for admin review");
        setFlagModalQuestionId(null);
        setFlagReason("");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to flag question");
    } finally {
      setFlagSubmitting(false);
    }
  }

  const unansweredCount = questions.filter((q) => q.answer_count === 0).length;

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
        <h1 className="mb-1 text-2xl font-bold text-zinc-900">Knowledge Base</h1>
        <p className="text-sm text-zinc-500">Answer questions from our community of athletes.</p>
      </div>

      {/* Stats */}
      <div className="mb-8 flex gap-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-600">Total Questions</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{questions.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-600">Unanswered</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{unansweredCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-zinc-500">Loading questions...</p>
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-zinc-500">No questions yet. Check back soon!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {questions.map((question) => {
            const hasAnswered = question.answers.some((a) => a.submitted_by === currentUserId);
            const canAnswer = question.answer_count < 3 && !hasAnswered;

            return (
              <div key={question.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                {/* Question Header */}
                <div className="border-b border-zinc-100 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="mb-1 text-lg font-semibold text-zinc-900">{question.title}</h2>
                      <p className="text-sm text-zinc-600">{question.body}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                          question.answer_count === 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {question.answer_count} / 3
                      </span>
                      <button
                        onClick={() => setFlagModalQuestionId(question.id)}
                        title="Flag this question for admin review"
                        className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        🚩 Flag
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-zinc-400">
                    Asked by {question.submitted_by_name} · {new Date(question.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Existing Answers */}
                {question.answers.length > 0 && (
                  <div className="border-b border-zinc-100 px-6 py-5">
                    <h3 className="mb-3 text-sm font-semibold text-zinc-700">Answers ({question.answers.length})</h3>
                    <div className="space-y-3">
                      {question.answers.map((answer) => (
                        <div key={answer.id} className="rounded-lg border border-green-100 bg-green-50 p-4">
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

                {/* Answer Form or Status */}
                <div className="px-6 py-5">
                  {hasAnswered ? (
                    <p className="text-sm font-medium text-green-600">✓ You answered this question</p>
                  ) : question.answer_count >= 3 ? (
                    <p className="text-sm font-medium text-zinc-500">Maximum answers reached</p>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">
                        Your answer
                      </label>
                      <textarea
                        value={question.answerBody || ""}
                        onChange={(e) => {
                          const updated = questions.map((q) =>
                            q.id === question.id ? { ...q, answerBody: e.target.value } : q
                          );
                          setQuestions(updated);
                        }}
                        placeholder="Provide your expert answer..."
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                        rows={3}
                        disabled={question.isSubmitting}
                      />
                      <button
                        onClick={() => void handleSubmitAnswer(question.id)}
                        disabled={!question.answerBody?.trim() || question.isSubmitting}
                        className="mt-3 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {question.isSubmitting ? "Submitting..." : "Submit Answer"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Flag Question Modal */}
      {flagModalQuestionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Flag Question</h2>
            <p className="mb-5 text-sm text-zinc-500">
              Explain why this question should be reviewed by admins.
            </p>

            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-zinc-700">
                Reason for flagging <span className="text-red-500">*</span>
              </label>
              <textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="e.g., Inappropriate content, spam, duplicated, etc."
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                rows={3}
                disabled={flagSubmitting}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setFlagModalQuestionId(null);
                  setFlagReason("");
                }}
                disabled={flagSubmitting}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleFlagQuestion()}
                disabled={!flagReason.trim() || flagSubmitting}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {flagSubmitting ? "Flagging..." : "Flag Question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

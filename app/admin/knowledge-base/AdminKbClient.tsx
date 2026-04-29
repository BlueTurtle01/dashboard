"use client";

import { useState } from "react";
import { updateQuestionAndClearFlag, type FlaggedQuestionWithDetails } from "@/lib/actions/knowledge-base";

type EditingQuestion = {
  id: string;
  title: string;
  body: string;
};

export default function AdminKbClient({
  initialFlaggedQuestions,
}: {
  initialFlaggedQuestions: FlaggedQuestionWithDetails[];
}) {
  const [flaggedQuestions, setFlaggedQuestions] = useState<FlaggedQuestionWithDetails[]>(
    initialFlaggedQuestions
  );
  const [editingQuestion, setEditingQuestion] = useState<EditingQuestion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmitEdit() {
    if (!editingQuestion) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await updateQuestionAndClearFlag(
        editingQuestion.id,
        editingQuestion.title,
        editingQuestion.body
      );

      if (result.error) {
        setError(result.error);
      } else {
        // Remove from list
        setFlaggedQuestions(
          flaggedQuestions.filter((q) => q.id !== editingQuestion.id)
        );
        setEditingQuestion(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update question");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-bold text-zinc-900">Flagged Questions</h1>
        <p className="text-sm text-zinc-500">Review and moderate flagged questions from coaches.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {flaggedQuestions.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-zinc-500">No flagged questions at this time.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {flaggedQuestions.map((question) => (
            <div key={question.id} className="rounded-2xl border border-red-200 bg-white shadow-sm">
              {/* Question Header */}
              <div className="border-b border-red-100 bg-red-50 px-6 py-4">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">{question.title}</h2>
                    <p className="mt-1 text-sm text-zinc-600">{question.body}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    Flagged
                  </span>
                </div>
                <div className="text-xs text-zinc-500">
                  <p>Asked by {question.submitted_by_name}</p>
                  <p className="mt-1">
                    Flagged by coach on {new Date(question.flagged_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Flag Reason */}
              <div className="border-b border-zinc-100 px-6 py-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-700">Reason for flagging:</h3>
                <p className="text-sm text-zinc-600">{question.flag_reason}</p>
              </div>

              {/* Answers */}
              {question.answers.length > 0 && (
                <div className="border-b border-zinc-100 px-6 py-4">
                  <h3 className="mb-3 text-sm font-semibold text-zinc-700">
                    Answers ({question.answers.length})
                  </h3>
                  <div className="space-y-3">
                    {question.answers.map((answer) => (
                      <div key={answer.id} className="rounded-lg border border-green-100 bg-green-50 p-3">
                        <p className="text-xs font-medium text-zinc-900">{answer.submitted_by_name}</p>
                        <p className="mt-1 text-sm text-zinc-700">{answer.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="px-6 py-4">
                <button
                  onClick={() =>
                    setEditingQuestion({
                      id: question.id,
                      title: question.title,
                      body: question.body,
                    })
                  }
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  Edit & Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Edit Question</h2>
            <p className="mb-6 text-sm text-zinc-500">
              Review and edit the question title and body, then resubmit.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Title</label>
              <input
                type="text"
                value={editingQuestion.title}
                onChange={(e) =>
                  setEditingQuestion({ ...editingQuestion, title: e.target.value })
                }
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                disabled={submitting}
              />
            </div>

            <div className="mb-6">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Body</label>
              <textarea
                value={editingQuestion.body}
                onChange={(e) =>
                  setEditingQuestion({ ...editingQuestion, body: e.target.value })
                }
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                rows={6}
                disabled={submitting}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditingQuestion(null)}
                disabled={submitting}
                className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSubmitEdit()}
                disabled={!editingQuestion.title.trim() || !editingQuestion.body.trim() || submitting}
                className="flex-1 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit & Clear Flag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

interface ModerationMessage {
  id: string;
  content: string;
  status: 'flagged' | 'blocked';
  flagged_phrase: string;
  created_at: string;
  sender_user_id: string;
  senderName: string;
  senderRole: 'coach' | 'athlete';
  otherName: string;
  threadTitle: string;
}

export default function AdminModerationPage() {
  const [messages, setMessages] = useState<ModerationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'flagged' | 'blocked'>('all');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetchMessages();
  }, [status, offset]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const statusParam = status === 'all' ? '' : `&status=${status}`;
      const response = await fetch(
        `/api/chat/moderation?limit=${limit}&offset=${offset}${statusParam}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch moderation data');
      }

      const data = await response.json();
      setMessages(data.messages);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      console.error('Error fetching moderation data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus: 'all' | 'flagged' | 'blocked') => {
    setStatus(newStatus);
    setOffset(0);
  };

  const handlePrevious = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNext = () => {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  };

  if (loading && messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading moderation data...</p>
      </div>
    );
  }

  const statusCounts = {
    all: total,
    flagged: 0,
    blocked: 0,
  };

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-2">Chat Moderation Review</h1>
      <p className="text-zinc-600 mb-6">Monitor flagged and blocked messages from chat conversations</p>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-6">
          <p className="text-red-900 text-sm">{error}</p>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex gap-2 mb-6 border-b border-zinc-200">
        <button
          onClick={() => handleStatusChange('all')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            status === 'all'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-zinc-600 hover:text-zinc-900'
          }`}
        >
          All Messages ({total})
        </button>
        <button
          onClick={() => handleStatusChange('flagged')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            status === 'flagged'
              ? 'border-amber-600 text-amber-600'
              : 'border-transparent text-zinc-600 hover:text-zinc-900'
          }`}
        >
          Flagged
        </button>
        <button
          onClick={() => handleStatusChange('blocked')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            status === 'blocked'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-zinc-600 hover:text-zinc-900'
          }`}
        >
          Blocked
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-12 text-center">
          <p className="text-zinc-600">
            {status === 'all'
              ? 'No flagged or blocked messages yet'
              : `No ${status} messages`}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4 mb-6">
            {messages.map((msg) => (
              <div key={msg.id} className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-zinc-900">{msg.senderName}</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          msg.senderRole === 'coach'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-purple-100 text-purple-900'
                        }`}
                      >
                        {msg.senderRole}
                      </span>
                      <span className="text-sm text-zinc-600">→ {msg.otherName}</span>
                    </div>
                    <p className="text-sm text-zinc-600">
                      Thread: <span className="font-medium">{msg.threadTitle}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                        msg.status === 'blocked'
                          ? 'bg-red-100 text-red-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {msg.status === 'blocked' ? 'Blocked' : 'Flagged'}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="bg-zinc-50 rounded border border-zinc-200 p-3 mb-3">
                  <p className="text-sm text-zinc-900 break-words">{msg.content}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-600">Flagged phrase:</span>
                  <span className="font-mono text-xs bg-zinc-200 text-zinc-900 px-2 py-1 rounded">
                    {msg.flagged_phrase}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-600">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrevious}
                disabled={offset === 0}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={handleNext}
                disabled={offset + limit >= total}
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

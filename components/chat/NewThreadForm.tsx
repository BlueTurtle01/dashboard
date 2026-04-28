'use client';

import { useState } from 'react';
import { ChatThread } from '@/lib/chat/types';

interface NewThreadFormProps {
  conversationId: string;
  onCreated: (thread: ChatThread) => void;
  onCancel?: () => void;
}

export default function NewThreadForm({
  conversationId,
  onCreated,
  onCancel,
}: NewThreadFormProps) {
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          title: title.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create thread');
      }

      const newThread = await response.json();
      setTitle('');
      onCreated(newThread);
    } catch (err) {
      console.error('Error creating thread:', err);
      setError(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setCreating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-blue-900 mb-3">Start a New Thread</h3>

      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 'Race Prep 2026', 'Injury Recovery'"
          className="flex-1 rounded-lg border border-blue-300 px-4 py-2 text-sm placeholder-blue-600 focus:border-blue-500 focus:outline-none bg-white"
          disabled={creating}
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}
    </form>
  );
}

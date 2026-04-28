'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ChatThread } from '@/lib/chat/types';
import ChatThreadList from '@/components/chat/ChatThreadList';
import NewThreadForm from '@/components/chat/NewThreadForm';

interface CoachAthleteChatPageProps {
  params: Promise<{
    athleteId: string;
  }>;
}

export default function CoachAthleteThreadsPage({ params: paramsPromise }: CoachAthleteChatPageProps) {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athleteName, setAthleteName] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewThreadForm, setShowNewThreadForm] = useState(false);

  // Handle async params
  useEffect(() => {
    (async () => {
      const resolved = await paramsPromise;
      setAthleteId(resolved.athleteId);
    })();
  }, [paramsPromise]);

  useEffect(() => {
    if (!athleteId) return;

    const fetchData = async () => {
      try {
        console.log('[CoachThreadsList] Fetching conversation for athlete:', athleteId);

        const supabase = createClient();

        // Get or create conversation
        const convResponse = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerId: athleteId,
            partnerRole: 'athlete',
          }),
        });

        if (!convResponse.ok) {
          const data = await convResponse.json();
          throw new Error(data.error || 'Failed to get conversation');
        }

        const conversation = await convResponse.json();
        console.log('[CoachThreadsList] Got conversation:', conversation.id);
        setConversationId(conversation.id);

        // Fetch athlete name
        const { data: profile } = await supabase
          .from('athlete_profiles')
          .select('full_name')
          .eq('user_id', athleteId)
          .maybeSingle();

        setAthleteName(profile?.full_name || 'Athlete');

        // Fetch threads
        const threadsResponse = await fetch(
          `/api/chat/threads?conversationId=${conversation.id}`
        );

        if (!threadsResponse.ok) {
          throw new Error('Failed to fetch threads');
        }

        const { threads: loadedThreads } = await threadsResponse.json();
        console.log('[CoachThreadsList] Loaded threads:', loadedThreads.length);
        setThreads(loadedThreads || []);
        setError(null);
      } catch (err) {
        console.error('[CoachThreadsList] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load threads');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [athleteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading threads...</p>
      </div>
    );
  }

  if (error || !conversationId) {
    return (
      <div className="p-6">
        <Link
          href="/coach/chat"
          className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold mb-4 inline-block"
        >
          ← Back to Messages
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mt-4">
          <p className="text-red-900">{error || 'Failed to load threads'}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="border-b border-zinc-200 p-6 flex items-center gap-4">
        <Link
          href="/coach/chat"
          className="text-zinc-600 hover:text-zinc-900"
        >
          ←
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            {athleteName || 'Athlete'}
          </h1>
          <p className="text-sm text-zinc-600">Message threads</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        {showNewThreadForm && conversationId ? (
          <NewThreadForm
            conversationId={conversationId}
            onCreated={(newThread) => {
              setThreads([newThread, ...threads]);
              setShowNewThreadForm(false);
            }}
            onCancel={() => setShowNewThreadForm(false)}
          />
        ) : (
          <button
            onClick={() => setShowNewThreadForm(true)}
            className="mb-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            + New Thread
          </button>
        )}

        <ChatThreadList
          threads={threads}
          basePath={`/coach/chat/${athleteId}`}
          onThreadsUpdate={setThreads}
        />
      </div>
    </main>
  );
}

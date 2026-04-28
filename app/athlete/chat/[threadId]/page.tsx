'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ChatThread } from '@/lib/chat/types';
import ChatThreadComponent from '@/components/chat/ChatThread';

interface AthleteChatThreadPageProps {
  params: Promise<{
    threadId: string;
  }>;
}

export default function AthleteChatThreadPage({ params: paramsPromise }: AthleteChatThreadPageProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle async params
  useEffect(() => {
    (async () => {
      const resolved = await paramsPromise;
      setThreadId(resolved.threadId);
    })();
  }, [paramsPromise]);

  useEffect(() => {
    if (!threadId) return;

    const fetchData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        setCurrentUserId(user.id);

        // Fetch thread details
        const { data: threadData, error: threadError } = await supabase
          .from('chat_threads')
          .select('*, conversations:conversation_id(coach_user_id)')
          .eq('id', threadId)
          .maybeSingle();

        if (threadError || !threadData) {
          throw new Error('Thread not found');
        }

        setThread(threadData as ChatThread);

        // Get coach ID from conversation
        const coachId = (threadData as any).conversations?.coach_user_id;

        if (coachId) {
          // Fetch coach name
          const { data: profile } = await supabase
            .from('athlete_profiles')
            .select('full_name')
            .eq('user_id', coachId)
            .maybeSingle();

          setCoachName(profile?.full_name || 'Coach');
        } else {
          setCoachName('Coach');
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching thread:', err);
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [threadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading thread...</p>
      </div>
    );
  }

  if (error || !thread || !currentUserId) {
    return (
      <div className="p-6">
        <Link
          href="/athlete/chat"
          className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold mb-4 inline-block"
        >
          ← Back to Messages
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mt-4">
          <p className="text-red-900">{error || 'Failed to load thread'}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="border-b border-zinc-200 p-6 flex items-center gap-4">
        <Link
          href="/athlete/chat"
          className="text-zinc-600 hover:text-zinc-900"
        >
          ←
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{thread.title}</h1>
          <p className="text-sm text-zinc-600">with {coachName || 'Coach'}</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatThreadComponent
          thread={thread}
          currentUserId={currentUserId}
          otherParticipantName={coachName || 'Coach'}
        />
      </div>
    </main>
  );
}

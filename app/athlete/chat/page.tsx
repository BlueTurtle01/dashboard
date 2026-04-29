'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatThread } from '@/lib/chat/types';
import ChatThreadList from '@/components/chat/ChatThreadList';
import NewThreadForm from '@/components/chat/NewThreadForm';

export default function AthleteChatPage() {
  const [coachId, setCoachId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewThreadForm, setShowNewThreadForm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        console.log('[AthleteChat] Current user:', user.id);

        // Get active coach link
        const { data: links, error: linksError } = await supabase
          .from('coach_athlete_links')
          .select('coach_user_id')
          .eq('athlete_user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (linksError) {
          throw new Error(linksError.message);
        }

        if (!links) {
          setError('No active coach assigned');
          setLoading(false);
          return;
        }

        const linkedCoachId = links.coach_user_id;
        console.log('[AthleteChat] Coach ID:', linkedCoachId);
        setCoachId(linkedCoachId);

        // Get or create conversation
        // FIXED: athlete passes their coach's ID as partnerId with partnerRole 'coach'
        const convResponse = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerId: linkedCoachId,
            partnerRole: 'coach',
          }),
        });

        if (!convResponse.ok) {
          const data = await convResponse.json();
          throw new Error(data.error || 'Failed to get conversation');
        }

        const conversation = await convResponse.json();
        console.log('[AthleteChat] Conversation:', conversation.id);
        setConversationId(conversation.id);

        // Fetch coach name
        const { data: profile } = await supabase
          .from('athlete_profiles')
          .select('full_name')
          .eq('user_id', linkedCoachId)
          .maybeSingle();

        setCoachName(profile?.full_name || 'Coach');

        // Fetch threads
        const threadsResponse = await fetch(
          `/api/chat/threads?conversationId=${conversation.id}`
        );

        if (!threadsResponse.ok) {
          throw new Error('Failed to fetch threads');
        }

        const { threads: loadedThreads } = await threadsResponse.json();
        console.log('[AthleteChat] Loaded threads:', loadedThreads.length);
        setThreads(loadedThreads || []);
        setError(null);

        // Mark chat as read (fire-and-forget)
        fetch('/api/chat/mark-read', { method: 'POST' }).catch((err) =>
          console.error('[AthleteChat] Error marking as read:', err)
        );
      } catch (err) {
        console.error('[AthleteChat] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load chat');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading chat...</p>
      </div>
    );
  }

  if (error || !conversationId) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <h2 className="font-semibold text-red-900 mb-2">Error Loading Chat</h2>
          <p className="text-red-900 text-sm">{error || 'Failed to load chat'}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="border-b border-zinc-200 p-6">
        <h1 className="text-xl font-bold text-zinc-900">
          {coachName || 'Coach'}
        </h1>
        <p className="text-sm text-zinc-600 mt-1">Message threads</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        {showNewThreadForm ? (
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
          basePath="/athlete/chat"
          onThreadsUpdate={setThreads}
        />
      </div>
    </main>
  );
}

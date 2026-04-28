'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ChatConversation, ChatParticipant } from '@/lib/chat/types';
import ChatThread from '@/components/chat/ChatThread';

interface CoachChatThreadPageProps {
  params: {
    athleteId: string;
  };
}

export default function CoachChatThreadPage({ params }: CoachChatThreadPageProps) {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [athlete, setAthlete] = useState<ChatParticipant | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        setCurrentUserId(user.id);

        const response = await fetch(
          `/api/chat/conversations?athleteId=${params.athleteId}`
        );
        if (!response.ok) throw new Error('Failed to fetch conversation');
        const conv = await response.json();
        setConversation(conv);

        const athleteResponse = await supabase
          .from('athlete_profiles')
          .select('user_id, full_name')
          .eq('user_id', params.athleteId)
          .maybeSingle();

        if (athleteResponse.error) throw athleteResponse.error;
        setAthlete(athleteResponse.data as ChatParticipant | null);
        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load chat');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.athleteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading chat...</p>
      </div>
    );
  }

  if (error || !conversation || !athlete || !currentUserId) {
    return (
      <div className="p-4">
        <Link
          href="/coach/chat"
          className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold mb-4 inline-block"
        >
          ← Back to Messages
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 mt-4">
          <p className="text-red-900">{error || 'Failed to load chat'}</p>
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
            {athlete.full_name || 'Athlete'}
          </h1>
          <p className="text-sm text-zinc-600">Message thread</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatThread
          conversation={conversation}
          currentUserId={currentUserId}
          otherParticipant={athlete}
        />
      </div>
    </main>
  );
}

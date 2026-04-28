'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatConversation, ChatParticipant } from '@/lib/chat/types';
import ChatThread from '@/components/chat/ChatThread';

export default function AthleteChatPage() {
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [coach, setCoach] = useState<ChatParticipant | null>(null);
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

        const { data: links } = await supabase
          .from('coach_athlete_links')
          .select('coach_user_id')
          .eq('athlete_user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!links) {
          setError('No active coach assigned');
          setLoading(false);
          return;
        }

        const coachId = links.coach_user_id;

        const response = await fetch(
          `/api/chat/conversations?athleteId=${user.id}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!response.ok) throw new Error('Failed to fetch conversation');
        const conv = await response.json();
        setConversation(conv);

        const coachResponse = await supabase
          .from('athlete_profiles')
          .select('user_id, full_name')
          .eq('user_id', coachId)
          .maybeSingle();

        if (coachResponse.error) {
          setCoach({ user_id: coachId, full_name: 'Coach' });
        } else {
          setCoach(coachResponse.data as ChatParticipant);
        }

        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load chat');
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

  if (error || !conversation || !coach || !currentUserId) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-red-900">{error || 'Failed to load chat'}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="border-b border-zinc-200 p-6">
        <h1 className="text-xl font-bold text-zinc-900">
          {coach.full_name || 'Coach'}
        </h1>
        <p className="text-sm text-zinc-600 mt-1">Message your coach</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatThread
          conversation={conversation}
          currentUserId={currentUserId}
          otherParticipant={coach}
        />
      </div>
    </main>
  );
}

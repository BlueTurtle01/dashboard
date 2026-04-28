'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import ChatConversationList from '@/components/chat/ChatConversationList';

interface ConversationWithAthlete {
  id: string;
  coach_user_id: string;
  athlete_user_id: string;
  created_at: string;
  last_message_at: string | null;
  athlete?: {
    full_name: string | null;
  };
}

export default function CoachChatPage() {
  const [conversations, setConversations] = useState<ConversationWithAthlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const response = await fetch('/api/chat/conversations');
        if (!response.ok) throw new Error('Failed to fetch conversations');
        const data = await response.json();
        setConversations(data.asCoach || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching conversations:', err);
        setError('Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-zinc-600">Loading conversations...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-red-900">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="border-b border-zinc-200 p-6">
        <h1 className="text-2xl font-bold text-zinc-900">Messages</h1>
        <p className="text-zinc-600 mt-1">Chat with your athletes</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatConversationList conversations={conversations} />
      </div>
    </main>
  );
}

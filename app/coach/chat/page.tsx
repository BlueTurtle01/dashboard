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
        console.log('Fetching conversations...');
        const response = await fetch('/api/chat/conversations');
        console.log('Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Response error body:', errorText);
          let errorMessage = 'Failed to fetch conversations';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${errorText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('Conversations data:', data);
        setConversations(data.asCoach || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching conversations:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load conversations';
        setError(errorMessage);
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
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <h2 className="font-semibold text-red-900 mb-2">Error Loading Chat</h2>
          <p className="text-red-900 text-sm mb-3">{error}</p>
          <details className="text-xs text-red-800">
            <summary className="cursor-pointer underline">Debug info</summary>
            <pre className="mt-2 bg-red-100 p-2 rounded overflow-auto text-xs">
              Check browser console (F12) for full error details
            </pre>
          </details>
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

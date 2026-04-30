'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TutorialProvider } from '@/lib/context/TutorialContext';
import TutorialInfoBox from '@/components/tutorial/TutorialInfoBox';

interface Conversation {
  id: string;
  coach_user_id: string;
  athlete_user_id: string;
  athleteName?: string;
  created_at: string;
}

function CoachChatPageContent() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const tutorial = searchParams.get('tutorial');

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        console.log('[CoachChat] Fetching conversations...');
        const response = await fetch('/api/chat/conversations');
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch conversations');
        }
        const data = await response.json();
        console.log('[CoachChat] Loaded conversations:', data.asCoach.length);
        setConversations(data.asCoach || []);
        setError(null);

        // Mark chat as read (fire-and-forget)
        fetch('/api/chat/mark-read', { method: 'POST' }).catch((err) =>
          console.error('[CoachChat] Error marking as read:', err)
        );
      } catch (err) {
        console.error('[CoachChat] Error fetching conversations:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load conversations'
        );
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

  return (
    <main className="h-screen flex flex-col bg-white">
      <div className="border-b border-zinc-200 p-6">
        <div className="max-w-2xl mx-auto w-full">
          <h1 className="text-2xl font-bold text-zinc-900">Messages</h1>
          <p className="text-zinc-600 mt-1">Chat with your athletes</p>
        </div>
      </div>

      {tutorial === 'chat' && (
        <div className="border-b border-zinc-200 px-6 pt-4">
          <div className="max-w-2xl mx-auto w-full">
            <TutorialInfoBox
              title="Welcome to Coach Chat"
              description="This is where you communicate with your athletes. Click on an athlete below to view or start conversations with them."
              step={1}
              totalSteps={3}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="p-6">
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <h2 className="font-semibold text-red-900 mb-2">Error Loading Chat</h2>
            <p className="text-red-900 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto w-full">
          {conversations.length === 0 ? (
            <div className="text-center">
              <p className="text-zinc-600 mb-2">No athletes to chat with yet</p>
              <p className="text-sm text-zinc-500">
                Once you link with athletes, you can start conversations here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href={`/coach/chat/${conv.athlete_user_id}${tutorial === 'chat' ? '?tutorial=chat' : ''}`}
                  className="block p-4 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-zinc-900">
                        {conv.athleteName || 'Athlete'}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1">
                        Click to view threads
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="h-2 w-2 rounded-full bg-indigo-600"></div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function CoachChatPage() {
  const searchParams = useSearchParams();
  const tutorial = searchParams.get('tutorial');
  const isInTutorial = tutorial === 'chat';

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="chat">
      <CoachChatPageContent />
    </TutorialProvider>
  );
}

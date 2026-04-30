'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChatThread } from '@/lib/chat/types';
import ChatThreadComponent from '@/components/chat/ChatThread';
import { TutorialProvider } from '@/lib/context/TutorialContext';
import TutorialInfoBox from '@/components/tutorial/TutorialInfoBox';

interface CoachChatThreadPageProps {
  params: Promise<{
    athleteId: string;
    threadId: string;
  }>;
}

function CoachChatThreadPageContent({ params: paramsPromise }: CoachChatThreadPageProps) {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [athleteName, setAthleteName] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const tutorial = searchParams.get('tutorial');

  // Handle async params
  useEffect(() => {
    (async () => {
      const resolved = await paramsPromise;
      setAthleteId(resolved.athleteId);
      setThreadId(resolved.threadId);
    })();
  }, [paramsPromise]);

  useEffect(() => {
    if (!athleteId || !threadId) return;

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
          .select('*')
          .eq('id', threadId)
          .maybeSingle();

        if (threadError || !threadData) {
          throw new Error('Thread not found');
        }

        setThread(threadData);

        // Fetch athlete name
        const { data: profile } = await supabase
          .from('athlete_profiles')
          .select('full_name')
          .eq('user_id', athleteId)
          .maybeSingle();

        setAthleteName(profile?.full_name || 'Athlete');
        setError(null);
      } catch (err) {
        console.error('Error fetching thread:', err);
        setError(err instanceof Error ? err.message : 'Failed to load thread');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [athleteId, threadId]);

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
          href={`/coach/chat/${athleteId}`}
          className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold mb-4 inline-block"
        >
          ← Back to Threads
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
          href={`/coach/chat/${athleteId}${tutorial === 'chat' ? '?tutorial=chat' : ''}`}
          className="text-zinc-600 hover:text-zinc-900"
        >
          ←
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">{thread.title}</h1>
          <p className="text-sm text-zinc-600">with {athleteName || 'Athlete'}</p>
        </div>
      </div>

      {tutorial === 'chat' && (
        <div className="border-b border-zinc-200 px-6 pt-4 pb-4">
          <div className="max-w-2xl mx-auto w-full">
            <TutorialInfoBox
              title="Send and Receive Messages"
              description="Type your message at the bottom and send it. Your athlete will see it immediately. You can discuss training plans, answer questions, and provide feedback here."
              step={3}
              totalSteps={3}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <ChatThreadComponent
          thread={thread}
          currentUserId={currentUserId}
          otherParticipantName={athleteName || 'Athlete'}
        />
      </div>
    </main>
  );
}

export default function CoachChatThreadPage({ params: paramsPromise }: CoachChatThreadPageProps) {
  const searchParams = useSearchParams();
  const tutorial = searchParams.get('tutorial');
  const isInTutorial = tutorial === 'chat';

  return (
    <TutorialProvider isInTutorial={isInTutorial} tutorialType="chat">
      <CoachChatThreadPageContent params={paramsPromise} />
    </TutorialProvider>
  );
}

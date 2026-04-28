'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatThread } from '@/lib/chat/types';
import { formatDistanceToNow } from 'date-fns';

interface ChatThreadListProps {
  threads: ChatThread[];
  basePath: string;
  onThreadsUpdate?: (threads: ChatThread[]) => void;
}

export default function ChatThreadList({
  threads: initialThreads,
  basePath,
  onThreadsUpdate,
}: ChatThreadListProps) {
  const [threads, setThreads] = useState<ChatThread[]>(initialThreads);

  useEffect(() => {
    const supabase = createClient();
    if (initialThreads.length === 0) return;

    const conversationId = initialThreads[0]?.conversation_id;
    if (!conversationId) return;

    // Subscribe to new threads
    const channel = supabase
      .channel(`chat-threads:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_threads',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const newThread = payload.new as ChatThread;
          setThreads((prev) => {
            // Don't add if already exists
            if (prev.some((t) => t.id === newThread.id)) {
              return prev;
            }
            return [newThread, ...prev];
          });
          onThreadsUpdate?.([newThread, ...threads]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_threads',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const updatedThread = payload.new as ChatThread;
          setThreads((prev) =>
            prev.map((t) => (t.id === updatedThread.id ? updatedThread : t))
          );
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [initialThreads, threads, onThreadsUpdate]);

  if (threads.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-zinc-600 mb-2">No threads yet</p>
          <p className="text-sm text-zinc-500">Create one to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((thread) => {
        const lastMessageTime = thread.last_message_at
          ? new Date(thread.last_message_at)
          : null;

        return (
          <Link
            key={thread.id}
            href={`${basePath}/${thread.id}`}
            className="block p-4 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-zinc-900 truncate">
                  {thread.title}
                </h3>
                {lastMessageTime && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Last message {formatDistanceToNow(lastMessageTime, { addSuffix: true })}
                  </p>
                )}
              </div>
              <div className="ml-4 flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-indigo-600"></div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

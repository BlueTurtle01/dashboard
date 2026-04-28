'use client';

import Link from 'next/link';
import { ChatConversation } from '@/lib/chat/types';
import { formatDistanceToNow } from 'date-fns';

interface ConversationWithAthlete extends ChatConversation {
  athlete?: {
    full_name: string | null;
  };
}

interface ChatConversationListProps {
  conversations: ConversationWithAthlete[];
}

export default function ChatConversationList({
  conversations,
}: ChatConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-zinc-600 mb-2">No active conversations</p>
          <p className="text-sm text-zinc-500">
            Conversations will appear here once you message your athletes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-200">
        {conversations.map((conversation) => {
          const athleteName = conversation.athlete?.full_name || 'Athlete';
          const lastMessageDate = conversation.last_message_at
            ? new Date(conversation.last_message_at)
            : null;

          return (
            <Link
              key={conversation.id}
              href={`/coach/chat/${conversation.athlete_user_id}`}
              className="block p-4 hover:bg-zinc-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-zinc-900 truncate">
                    {athleteName}
                  </h3>
                  {lastMessageDate && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Last message {formatDistanceToNow(lastMessageDate, { addSuffix: true })}
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
    </div>
  );
}

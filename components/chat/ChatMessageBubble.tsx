'use client';

import { ChatMessage } from '@/lib/chat/types';
import { formatDistanceToNow } from 'date-fns';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  senderName?: string;
}

export default function ChatMessageBubble({
  message,
  isOwnMessage,
  senderName,
}: ChatMessageBubbleProps) {
  const timestamp = new Date(message.created_at);

  if (message.status === 'flagged') {
    return (
      <div className="mx-4 my-2 flex justify-center">
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
          Message flagged by content filter
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-4 my-2 flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs rounded-xl px-4 py-2 ${
          isOwnMessage
            ? 'bg-indigo-600 text-white'
            : 'bg-zinc-100 text-zinc-900'
        }`}
      >
        {!isOwnMessage && senderName && (
          <div className={`text-xs font-semibold mb-1 ${
            isOwnMessage ? 'text-indigo-100' : 'text-zinc-600'
          }`}>
            {senderName}
          </div>
        )}
        <p className="break-words text-sm">{message.content}</p>
        <div className={`text-xs mt-1 ${
          isOwnMessage ? 'text-indigo-100' : 'text-zinc-500'
        }`}>
          {formatDistanceToNow(timestamp, { addSuffix: true })}
        </div>
      </div>
    </div>
  );
}

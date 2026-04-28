'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatMessage, ChatConversation, ChatParticipant } from '@/lib/chat/types';
import ChatMessageBubble from './ChatMessageBubble';

interface ChatThreadProps {
  conversation: ChatConversation;
  currentUserId: string;
  otherParticipant: ChatParticipant;
}

export default function ChatThread({
  conversation,
  currentUserId,
  otherParticipant,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await fetch(
          `/api/chat/messages/get?conversationId=${conversation.id}&limit=50&offset=0`
        );
        if (!response.ok) throw new Error('Failed to fetch messages');
        const { messages: loadedMessages } = await response.json();
        setMessages(loadedMessages || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching messages:', err);
        setError('Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload: any) => {
          const newMessage = payload.new as ChatMessage;
          if (newMessage.status === 'sent') {
            setMessages((prev) => [...prev, newMessage]);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [conversation.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          content: inputValue,
        }),
      });

      if (response.status === 400) {
        setError('Message was blocked by content filter');
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setInputValue('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500">Loading conversation...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto border-b border-zinc-200">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-500">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessageBubble
            key={message.id}
            message={message}
            isOwnMessage={message.sender_user_id === currentUserId}
            senderName={
              message.sender_user_id === currentUserId
                ? 'You'
                : otherParticipant.full_name || 'Coach'
            }
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSendMessage}
        className="border-t border-zinc-200 bg-white p-4 flex gap-2"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !inputValue.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}

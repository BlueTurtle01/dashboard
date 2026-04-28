import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkPhrase } from '@/lib/chat/phraseFilter';
import { BannedPhrase } from '@/lib/chat/types';

let bannedPhrasesCache: BannedPhrase[] = [];
let phrasesCacheTime = 0;
const PHRASES_CACHE_DURATION = 60000;

async function getBannedPhrases(supabase: any): Promise<BannedPhrase[]> {
  const now = Date.now();
  if (bannedPhrasesCache.length > 0 && now - phrasesCacheTime < PHRASES_CACHE_DURATION) {
    return bannedPhrasesCache;
  }

  const { data: phrases, error } = await supabase
    .from('chat_banned_phrases')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching banned phrases:', error);
    return [];
  }

  bannedPhrasesCache = (phrases || []) as BannedPhrase[];
  phrasesCacheTime = now;
  return bannedPhrasesCache;
}

async function isThreadParticipant(
  supabase: any,
  threadId: string,
  userId: string
): Promise<boolean> {
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('conversation_id')
    .eq('id', threadId)
    .maybeSingle();

  if (threadError || !thread) {
    return false;
  }

  const { data: conversation, error: convError } = await supabase
    .from('chat_conversations')
    .select('coach_user_id, athlete_user_id')
    .eq('id', thread.conversation_id)
    .maybeSingle();

  if (convError || !conversation) {
    return false;
  }

  return conversation.coach_user_id === userId || conversation.athlete_user_id === userId;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { threadId, content } = await req.json();

    if (!threadId || !content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'threadId and non-empty content required' },
        { status: 400 }
      );
    }

    // Verify user is participant
    const isParticipant = await isThreadParticipant(supabase, threadId, user.id);

    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check phrase filter
    const bannedPhrases = await getBannedPhrases(supabase);
    const checkResult = checkPhrase(content, bannedPhrases);

    // Determine message status based on phrase check
    let messageStatus = 'sent';
    if (!checkResult.allowed) {
      messageStatus = 'blocked';
    } else if (checkResult.severity === 'flag') {
      messageStatus = 'flagged';
    }

    // Insert message (all statuses: sent, flagged, and blocked)
    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .insert({
        thread_id: threadId,
        sender_user_id: user.id,
        content: content.trim(),
        status: messageStatus,
        flagged_phrase: checkResult.matchedPhrase || null,
      })
      .select()
      .single();

    if (messageError) {
      console.error('Message insert error:', messageError);
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    // Return 400 error for blocked messages (so user sees error)
    if (!checkResult.allowed) {
      return NextResponse.json(
        { error: 'Message blocked', reason: 'Restricted phrase detected' },
        { status: 400 }
      );
    }

    // Update thread's last_message_at
    const { error: updateError } = await supabase
      .from('chat_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);

    if (updateError) {
      console.error('Thread update error:', updateError);
    }

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

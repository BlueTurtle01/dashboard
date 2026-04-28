import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const threadId = searchParams.get('threadId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!threadId) {
      return NextResponse.json(
        { error: 'threadId is required' },
        { status: 400 }
      );
    }

    // Verify participant
    const isParticipant = await isThreadParticipant(supabase, threadId, user.id);

    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch messages (show sent and flagged, not blocked)
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .neq('status', 'blocked')
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (messagesError) {
      console.error('Messages fetch error:', messagesError);
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    return NextResponse.json({
      messages: messages || [],
      offset,
      limit,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function isParticipantInConversation(
  supabase: any,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('coach_user_id, athlete_user_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.coach_user_id === userId || data.athlete_user_id === userId;
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId required' },
        { status: 400 }
      );
    }

    // Check participant
    const isParticipant = await isParticipantInConversation(
      supabase,
      conversationId,
      user.id
    );

    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch threads ordered by most recent activity first
    const { data: threads, error: threadsError } = await supabase
      .from('chat_threads')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (threadsError) {
      console.error('Threads fetch error:', threadsError);
      return NextResponse.json({ error: threadsError.message }, { status: 500 });
    }

    return NextResponse.json({ threads: threads || [] });
  } catch (error) {
    console.error('Error fetching threads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { conversationId, title } = await req.json();

    if (!conversationId || !title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { error: 'conversationId and title required' },
        { status: 400 }
      );
    }

    // Check participant
    const isParticipant = await isParticipantInConversation(
      supabase,
      conversationId,
      user.id
    );

    if (!isParticipant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create thread
    const { data: newThread, error: createError } = await supabase
      .from('chat_threads')
      .insert({
        conversation_id: conversationId,
        title: title.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Thread creation error:', createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json(newThread, { status: 201 });
  } catch (error) {
    console.error('Error creating thread:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

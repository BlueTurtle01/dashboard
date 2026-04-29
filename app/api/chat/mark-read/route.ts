import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Mark all conversations where user is coach as read
    await supabase
      .from('chat_conversations')
      .update({ coach_last_read_at: now })
      .eq('coach_user_id', user.id);

    // Mark all conversations where user is athlete as read
    await supabase
      .from('chat_conversations')
      .update({ athlete_last_read_at: now })
      .eq('athlete_user_id', user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error marking chat as read:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

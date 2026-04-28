import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const athleteId = searchParams.get('athleteId');

    if (athleteId) {
      const coachConversation = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('coach_user_id', user.id)
        .eq('athlete_user_id', athleteId)
        .maybeSingle();

      if (coachConversation.data) {
        return NextResponse.json(coachConversation.data);
      }

      const { data: newConversation, error: insertError } = await supabase
        .from('chat_conversations')
        .insert({
          coach_user_id: user.id,
          athlete_user_id: athleteId,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json(newConversation);
    }

    const { data: conversationsAsCoach, error: coachError } = await supabase
      .from('chat_conversations')
      .select('*, athlete:athlete_user_id(full_name)')
      .eq('coach_user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (coachError) {
      return NextResponse.json({ error: coachError.message }, { status: 500 });
    }

    const { data: conversationsAsAthlete, error: athleteError } = await supabase
      .from('chat_conversations')
      .select('*, coach:coach_user_id(full_name)')
      .eq('athlete_user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (athleteError) {
      return NextResponse.json({ error: athleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      asCoach: conversationsAsCoach || [],
      asAthlete: conversationsAsAthlete || [],
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

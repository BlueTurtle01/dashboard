import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('[chat/conversations] Auth error:', userError);
      return NextResponse.json({ error: `Auth error: ${userError.message}` }, { status: 401 });
    }

    if (!user) {
      console.error('[chat/conversations] No user found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('[chat/conversations] User:', user.id);

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

    console.log('[chat/conversations] Querying conversations as coach...');
    const { data: conversationsAsCoach, error: coachError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('coach_user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (coachError) {
      console.error('[chat/conversations] Coach query error:', coachError);
      return NextResponse.json({ error: `Database error: ${coachError.message}` }, { status: 500 });
    }

    console.log('[chat/conversations] Found conversations:', conversationsAsCoach?.length || 0);

    let conversationsAsCoachWithProfiles = [];
    if (conversationsAsCoach && conversationsAsCoach.length > 0) {
      const athleteIds = conversationsAsCoach.map(c => c.athlete_user_id);
      const { data: athletes } = await supabase
        .from('athlete_profiles')
        .select('user_id, full_name')
        .in('user_id', athleteIds);

      conversationsAsCoachWithProfiles = conversationsAsCoach.map(conv => ({
        ...conv,
        athlete: athletes?.find(a => a.user_id === conv.athlete_user_id) || { full_name: null }
      }));
    }

    const { data: conversationsAsAthlete, error: athleteError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('athlete_user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (athleteError) {
      return NextResponse.json({ error: athleteError.message }, { status: 500 });
    }

    let conversationsAsAthleteWithProfiles = [];
    if (conversationsAsAthlete && conversationsAsAthlete.length > 0) {
      conversationsAsAthleteWithProfiles = conversationsAsAthlete.map(conv => ({
        ...conv,
        coach: { full_name: null }
      }));
    }

    return NextResponse.json({
      asCoach: conversationsAsCoachWithProfiles || [],
      asAthlete: conversationsAsAthleteWithProfiles || [],
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

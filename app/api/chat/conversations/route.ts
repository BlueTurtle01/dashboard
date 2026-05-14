import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getUserDisplayName } from '@/lib/chat/getUserName';
import { canUseCoachChat } from '@/lib/chat/access';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch all conversations where user is coach or athlete
    const { data: asCoach, error: coachError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('coach_user_id', user.id)
      .order('created_at', { ascending: false });

    if (coachError) {
      console.error('Coach conversations error:', coachError);
      return NextResponse.json({ error: coachError.message }, { status: 500 });
    }

    const { data: asAthlete, error: athleteError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('athlete_user_id', user.id)
      .order('created_at', { ascending: false });

    if (athleteError) {
      console.error('Athlete conversations error:', athleteError);
      return NextResponse.json({ error: athleteError.message }, { status: 500 });
    }

    // Enrich with participant names
    const enrichedCoach = await Promise.all(
      (asCoach || []).map(async (conv) => ({
        ...conv,
        athleteName: await getUserDisplayName(supabase, conv.athlete_user_id),
      }))
    );

    const enrichedAthlete = await Promise.all(
      (asAthlete || []).map(async (conv) => ({
        ...conv,
        coachName: await getUserDisplayName(supabase, conv.coach_user_id),
      }))
    );

    return NextResponse.json({
      asCoach: enrichedCoach,
      asAthlete: enrichedAthlete,
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
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

    const { partnerId, partnerRole } = await req.json();

    if (!partnerId || !partnerRole) {
      return NextResponse.json(
        { error: 'partnerId and partnerRole required' },
        { status: 400 }
      );
    }

    let coachUserId: string;
    let athleteUserId: string;

    if (partnerRole === 'coach') {
      coachUserId = partnerId;
      athleteUserId = user.id;
    } else if (partnerRole === 'athlete') {
      coachUserId = user.id;
      athleteUserId = partnerId;
    } else {
      return NextResponse.json(
        { error: 'Invalid partnerRole' },
        { status: 400 }
      );
    }

    if (!(await canUseCoachChat(supabase, coachUserId, athleteUserId))) {
      return NextResponse.json({ error: 'Chat access is not active for this coach-athlete pair' }, { status: 403 });
    }

    // Check if conversation exists
    const { data: existing, error: existError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('coach_user_id', coachUserId)
      .eq('athlete_user_id', athleteUserId)
      .maybeSingle();

    if (existError) {
      console.error('Conversation lookup error:', existError);
      return NextResponse.json({ error: existError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    // Create new conversation
    const { data: newConv, error: insertError } = await supabase
      .from('chat_conversations')
      .insert({
        coach_user_id: coachUserId,
        athlete_user_id: athleteUserId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Conversation creation error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(newConv, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

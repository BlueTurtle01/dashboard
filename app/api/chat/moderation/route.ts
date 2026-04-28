import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin role - skip for now since page-level auth handles it
  // TODO: Add proper role check once user_roles RLS is configured

  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status'); // 'flagged', 'blocked', or null for all
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    let query = supabase
      .from('chat_messages')
      .select(
        `
        id,
        content,
        status,
        flagged_phrase,
        created_at,
        sender_user_id,
        thread_id,
        threads:thread_id(
          id,
          title,
          conversation_id,
          conversations:conversation_id(
            coach_user_id,
            athlete_user_id
          )
        )
        `,
        { count: 'exact' }
      )
      .neq('status', 'sent')
      .order('created_at', { ascending: false });

    if (status && (status === 'flagged' || status === 'blocked')) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    // Enrich with user names
    const enrichedData = await Promise.all(
      (data || []).map(async (msg: any) => {
        const senderProfile = await supabase
          .from('athlete_profiles')
          .select('full_name')
          .eq('user_id', msg.sender_user_id)
          .maybeSingle();

        const conversation = msg.threads?.[0]?.conversations;
        const isCoach = msg.sender_user_id === conversation?.coach_user_id;
        const otherUserId = isCoach ? conversation?.athlete_user_id : conversation?.coach_user_id;

        const otherProfile = await supabase
          .from('athlete_profiles')
          .select('full_name')
          .eq('user_id', otherUserId)
          .maybeSingle();

        return {
          ...msg,
          senderName: senderProfile?.data?.full_name || 'Unknown',
          senderRole: isCoach ? 'coach' : 'athlete',
          otherName: otherProfile?.data?.full_name || 'Unknown',
          threadTitle: msg.threads?.[0]?.title || 'Unknown Thread',
        };
      })
    );

    return NextResponse.json({
      messages: enrichedData,
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Error fetching moderation data:', err);
    return NextResponse.json(
      { error: 'Failed to fetch moderation data' },
      { status: 500 }
    );
  }
}

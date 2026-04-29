import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
    const limit = parseInt(searchParams.get('limit') || '60', 10);

    if (!athleteId) {
      return NextResponse.json({ error: 'athleteId required' }, { status: 400 });
    }

    // Verify coach-athlete link
    const { data: link, error: linkError } = await supabase
      .from('coach_athlete_links')
      .select('id')
      .eq('coach_user_id', user.id)
      .eq('athlete_user_id', athleteId)
      .eq('status', 'active')
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json({ error: 'Athlete not linked to this coach' }, { status: 403 });
    }

    // Use admin client to bypass RLS — the coach-athlete link is already
    // verified above, so this read is authorised.
    const adminClient = createAdminClient();
    const { data: activities, error } = await adminClient
      .from('athlete_activities')
      .select('*')
      .eq('user_id', athleteId)
      .order('start_time', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching athlete activities:', error);
      return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
    }

    return NextResponse.json({ activities: activities || [] });
  } catch (error) {
    console.error('Error in coach athlete-activities endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

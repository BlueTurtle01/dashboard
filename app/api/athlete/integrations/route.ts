import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: integration, error } = await supabase
      .from('athlete_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'strava')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching integration:', error);
      return NextResponse.json({ error: 'Failed to fetch integration' }, { status: 500 });
    }

    return NextResponse.json({ integration: integration || null });
  } catch (error) {
    console.error('Error in integrations endpoint:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

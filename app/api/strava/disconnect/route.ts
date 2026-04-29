import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { deauthorizeWithStrava } from '@/lib/strava';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the current integration to get the access token
    const { data: integration } = await supabase
      .from('athlete_integrations')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'strava')
      .eq('is_active', true)
      .single();

    // Try to deauthorize with Strava (best effort, don't block on failure)
    if (integration?.access_token) {
      await deauthorizeWithStrava(integration.access_token);
    }

    // Mark integration as inactive
    const { error: updateError } = await supabase
      .from('athlete_integrations')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('provider', 'strava');

    if (updateError) {
      console.error('Error disconnecting Strava:', updateError);
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in disconnect endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

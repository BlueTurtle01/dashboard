import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getStravaAuthorizeUrl } from '@/lib/strava';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const stravaUrl = getStravaAuthorizeUrl(user.id);
    return NextResponse.redirect(stravaUrl);
  } catch (error) {
    console.error('Error in Strava connect:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/lib/strava';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle Strava error response
    if (error) {
      const errorReason = searchParams.get('error_description') || 'Unknown error';
      const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set('error', `Strava: ${errorReason}`);
      return NextResponse.redirect(redirectUrl);
    }

    if (!code || !state) {
      const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set('error', 'Missing code or state from Strava');
      return NextResponse.redirect(redirectUrl);
    }

    // Verify authenticated user and that state matches
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set('error', 'Authentication required');
      return NextResponse.redirect(redirectUrl);
    }

    // For MVP, state is simply the user ID
    if (state !== user.id) {
      const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set('error', 'Invalid state parameter');
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(code);

    // Store integration in Supabase
    const { error: insertError } = await supabase
      .from('athlete_integrations')
      .upsert(
        {
          user_id: user.id,
          provider: 'strava',
          provider_athlete_id: tokenResponse.athlete.id,
          provider_username: tokenResponse.athlete.username,
          provider_firstname: tokenResponse.athlete.firstname,
          provider_lastname: tokenResponse.athlete.lastname,
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token,
          expires_at: new Date(tokenResponse.expires_at * 1000).toISOString(),
          scopes: tokenResponse.scope?.split(',') || [],
          is_active: true,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (insertError) {
      console.error('Error storing integration:', insertError);
      const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
      redirectUrl.searchParams.set('error', 'Failed to store integration');
      return NextResponse.redirect(redirectUrl);
    }

    // Redirect to integrations page with success message
    const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
    redirectUrl.searchParams.set('success', 'Strava connected successfully');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Error in Strava callback:', error);
    const redirectUrl = new URL('/athlete/integrations', process.env.NEXT_PUBLIC_APP_URL!);
    redirectUrl.searchParams.set('error', 'Failed to connect Strava');
    return NextResponse.redirect(redirectUrl);
  }
}

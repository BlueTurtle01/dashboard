import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getValidStravaAccessToken, subscribeToStravaWebhook, getStravaWebhookSubscriptions } from '@/lib/strava';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get valid access token
    let accessToken: string;
    try {
      accessToken = await getValidStravaAccessToken(user.id);
    } catch (error) {
      return NextResponse.json(
        { error: 'No active Strava integration found' },
        { status: 400 }
      );
    }

    // Check if already subscribed
    const existingSubscriptions = await getStravaWebhookSubscriptions(accessToken);

    if (existingSubscriptions.length > 0) {
      // User already has webhook subscriptions
      return NextResponse.json({
        success: true,
        message: 'Already subscribed to webhooks',
        subscribed: true,
      });
    }

    // Build callback URL
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/strava`;
    const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'your_verify_token';

    // Subscribe to webhooks
    const subscription = await subscribeToStravaWebhook(accessToken, callbackUrl, verifyToken);

    // Store webhook subscription in database
    const { error: insertError } = await supabase
      .from('strava_webhooks')
      .upsert({
        user_id: user.id,
        webhook_id: subscription.id,
        callback_url: callbackUrl,
        is_active: true,
      });

    if (insertError) {
      console.error('Error storing webhook subscription:', insertError);
      return NextResponse.json(
        { error: 'Failed to store webhook subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully subscribed to webhooks',
      subscribed: true,
      webhook_id: subscription.id,
    });
  } catch (error) {
    console.error('Error subscribing to webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe to webhooks', details: String(error) },
      { status: 500 }
    );
  }
}

// Check webhook subscription status
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user has webhook subscription
    const { data: webhook, error } = await supabase
      .from('strava_webhooks')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching webhook:', error);
      return NextResponse.json({ error: 'Failed to fetch webhook status' }, { status: 500 });
    }

    return NextResponse.json({
      subscribed: !!webhook,
      webhook: webhook || null,
    });
  } catch (error) {
    console.error('Error checking webhook status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

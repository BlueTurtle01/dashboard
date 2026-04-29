import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getValidStravaAccessToken, deleteStravaWebhookSubscription } from '@/lib/strava';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the user's webhook subscription
    const { data: webhook, error: fetchError } = await supabase
      .from('strava_webhooks')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !webhook) {
      return NextResponse.json(
        { error: 'No active webhook subscription found' },
        { status: 400 }
      );
    }

    // Get valid access token
    let accessToken: string;
    try {
      accessToken = await getValidStravaAccessToken(user.id);
    } catch (error) {
      console.error('Failed to get access token:', error);
      // Still mark local webhook as inactive even if token is invalid
    }

    // Try to delete webhook from Strava (best effort)
    if (accessToken) {
      try {
        await deleteStravaWebhookSubscription(accessToken, webhook.webhook_id);
      } catch (error) {
        console.error('Failed to delete webhook from Strava:', error);
        // Continue with local deletion even if remote deletion fails
      }
    }

    // Mark webhook as inactive
    const { error: updateError } = await supabase
      .from('strava_webhooks')
      .update({ is_active: false })
      .eq('id', webhook.id);

    if (updateError) {
      console.error('Error updating webhook:', updateError);
      return NextResponse.json(
        { error: 'Failed to unsubscribe from webhooks' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Unsubscribed from webhooks' });
  } catch (error) {
    console.error('Error unsubscribing from webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe from webhooks', details: String(error) },
      { status: 500 }
    );
  }
}

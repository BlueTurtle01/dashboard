import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getValidStravaAccessToken, fetchStravaActivityDetail } from '@/lib/strava';

const WEBHOOK_VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'your_verify_token';

// Handle Strava webhook verification
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ 'hub.challenge': challenge });
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}

// Handle incoming webhook events from Strava
export async function POST(req: Request) {
  try {
    const event = await req.json();

    // Log event for debugging
    console.log('Received Strava webhook event:', {
      event_type: event.event_type,
      object_type: event.object_type,
      object_id: event.object_id,
      owner_id: event.owner_id,
      aspect_type: event.aspect_type,
    });

    const supabase = await createClient();

    // Store the event in the database
    const { data: storedEvent, error: storeError } = await supabase
      .from('strava_webhook_events')
      .insert({
        event_type: event.event_type,
        object_type: event.object_type,
        object_id: event.object_id,
        owner_id: event.owner_id,
        aspect_type: event.aspect_type,
        updates: event.updates || null,
        raw_event: event,
      })
      .select()
      .single();

    if (storeError) {
      console.error('Error storing webhook event:', storeError);
      return NextResponse.json({ error: 'Failed to store event' }, { status: 500 });
    }

    // Process the event if it's an activity create or update
    if (
      event.object_type === 'activity' &&
      (event.event_type === 'create' || event.event_type === 'update')
    ) {
      // Find the user who owns this Strava activity
      const { data: integration, error: findError } = await supabase
        .from('athlete_integrations')
        .select('*')
        .eq('provider', 'strava')
        .eq('provider_athlete_id', event.owner_id)
        .eq('is_active', true)
        .single();

      if (findError || !integration) {
        console.log(`No active integration found for Strava athlete ${event.owner_id}`);
        // Mark as processed but with no matching user
        await supabase
          .from('strava_webhook_events')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('id', storedEvent.id);

        return NextResponse.json({ success: true });
      }

      try {
        // Get valid access token
        const accessToken = await getValidStravaAccessToken(integration.user_id);

        // Fetch full activity details from Strava
        const activity = await fetchStravaActivityDetail(accessToken, event.object_id);

        // Upsert activity into database
        const { error: upsertError } = await supabase
          .from('athlete_activities')
          .upsert({
            user_id: integration.user_id,
            provider: 'strava',
            provider_activity_id: activity.id,
            name: activity.name,
            activity_type: activity.type,
            sport_type: activity.sport_type,
            start_time: activity.start_date,
            timezone: activity.timezone,
            distance_m: activity.distance,
            moving_time_seconds: activity.moving_time,
            elapsed_time_seconds: activity.elapsed_time,
            total_elevation_gain_m: activity.total_elevation_gain,
            average_speed_mps: activity.average_speed,
            max_speed_mps: activity.max_speed,
            average_heartrate: activity.average_heartrate || null,
            max_heartrate: activity.max_heartrate || null,
            kudos_count: activity.kudos_count,
            raw_data: activity,
            synced_at: new Date().toISOString(),
          });

        if (upsertError) {
          console.error('Error upserting activity:', upsertError);
          throw upsertError;
        }

        // Mark webhook event as processed
        await supabase
          .from('strava_webhook_events')
          .update({
            user_id: integration.user_id,
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq('id', storedEvent.id);

        console.log(`Successfully processed activity ${event.object_id} for user ${integration.user_id}`);
      } catch (error) {
        console.error('Error processing webhook event:', error);
        // Mark as processed with error
        await supabase
          .from('strava_webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            error_message: String(error),
          })
          .eq('id', storedEvent.id);

        // Still return 200 so Strava doesn't retry
        return NextResponse.json({ success: true, processed: false });
      }
    } else {
      // For other event types (like activity delete), just mark as processed
      await supabase
        .from('strava_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', storedEvent.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook', details: String(error) },
      { status: 500 }
    );
  }
}

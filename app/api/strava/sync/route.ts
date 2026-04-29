import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getValidStravaAccessToken, fetchStravaActivities } from '@/lib/strava';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get valid access token (refreshes if needed)
    let accessToken: string;
    try {
      accessToken = await getValidStravaAccessToken(user.id);
    } catch (error) {
      return NextResponse.json(
        { error: 'No active Strava integration found' },
        { status: 400 }
      );
    }

    // Fetch recent activities from Strava
    const activities = await fetchStravaActivities(accessToken, {
      page: 1,
      perPage: 30,
    });

    if (!activities || activities.length === 0) {
      // Still update last_sync_at even if no new activities
      await supabase
        .from('athlete_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('provider', 'strava');

      return NextResponse.json({ success: true, syncedCount: 0 });
    }

    // Prepare activities for insertion
    const activitiesToInsert = activities.map((activity) => ({
      user_id: user.id,
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
    }));

    // Upsert activities into database
    const { error: upsertError, data: upsertedData } = await supabase
      .from('athlete_activities')
      .upsert(activitiesToInsert, { onConflict: 'provider,provider_activity_id' })
      .select();

    if (upsertError) {
      console.error('Error upserting activities:', upsertError);
      return NextResponse.json(
        { error: 'Failed to sync activities' },
        { status: 500 }
      );
    }

    // Update last_sync_at timestamp
    const { error: updateError } = await supabase
      .from('athlete_integrations')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('provider', 'strava');

    if (updateError) {
      console.error('Error updating last_sync_at:', updateError);
    }

    return NextResponse.json({
      success: true,
      syncedCount: upsertedData?.length || activities.length,
    });
  } catch (error) {
    console.error('Error syncing Strava activities:', error);
    return NextResponse.json(
      { error: 'Failed to sync activities', details: String(error) },
      { status: 500 }
    );
  }
}

import { createClient } from '@/lib/supabase/server';

// TypeScript types for Strava API responses
export interface StravaTokenResponse {
  token_type: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  access_token: string;
  athlete: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    city: string;
    state: string;
    country: string;
    sex: string;
    summit: boolean;
    created_at: string;
    updated_at: string;
    badge_type_id: number;
    weight: number;
    profile_medium: string;
    profile: string;
    resource_state: number;
  };
  scope?: string;
}

export interface StravaSummaryActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  timezone: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  kudos_count: number;
  resource_state: number;
}

export interface AthleteIntegration {
  id: string;
  user_id: string;
  provider: string;
  provider_athlete_id: number;
  provider_username: string | null;
  provider_firstname: string | null;
  provider_lastname: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  connected_at: string;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export function getStravaAuthorizeUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state: userId,
  });

  return `${STRAVA_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for token: ${error}`);
  }

  return response.json();
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return response.json();
}

export async function getValidStravaAccessToken(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: integration, error } = await supabase
    .from('athlete_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .eq('is_active', true)
    .single();

  if (error) {
    throw new Error(`No active Strava integration found: ${error.message}`);
  }

  if (!integration) {
    throw new Error('No active Strava integration found');
  }

  // Check if token is still valid with 5-minute buffer
  const expiresAt = new Date(integration.expires_at).getTime();
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt > now + bufferMs) {
    return integration.access_token;
  }

  // Token expired, refresh it
  const newToken = await refreshStravaToken(integration.refresh_token);

  // Update the integration with new token
  const { error: updateError } = await supabase
    .from('athlete_integrations')
    .update({
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      expires_at: new Date(newToken.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  if (updateError) {
    console.error('Failed to update token:', updateError);
  }

  return newToken.access_token;
}

export async function fetchStravaActivities(
  accessToken: string,
  options?: { after?: number; before?: number; page?: number; perPage?: number }
): Promise<StravaSummaryActivity[]> {
  const params = new URLSearchParams({
    page: (options?.page ?? 1).toString(),
    per_page: (options?.perPage ?? 30).toString(),
  });

  if (options?.after) {
    params.append('after', options.after.toString());
  }

  if (options?.before) {
    params.append('before', options.before.toString());
  }

  const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch activities: ${error}`);
  }

  return response.json();
}

export async function deauthorizeWithStrava(accessToken: string): Promise<void> {
  try {
    await fetch(`${STRAVA_API_BASE}/oauth/deauthorize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Failed to deauthorize with Strava:', error);
    // Don't throw - we still want to disconnect locally even if remote deauth fails
  }
}

// Webhook-related functions
export async function subscribeToStravaWebhook(
  callbackUrl: string,
  verifyToken: string
): Promise<{ id: number; resource_state: number }> {
  // Strava webhooks API requires Basic Auth with client_id:client_secret
  const credentials = Buffer.from(
    `${process.env.STRAVA_CLIENT_ID}:${process.env.STRAVA_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(`${STRAVA_API_BASE}/push_subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to subscribe to webhooks: ${error}`);
  }

  return response.json();
}

export async function getStravaWebhookSubscriptions(accessToken: string): Promise<any[]> {
  const response = await fetch(`${STRAVA_API_BASE}/push_subscriptions`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get webhooks: ${error}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function deleteStravaWebhookSubscription(
  webhookId: number
): Promise<void> {
  // Strava webhooks API requires Basic Auth with client_id:client_secret
  const credentials = Buffer.from(
    `${process.env.STRAVA_CLIENT_ID}:${process.env.STRAVA_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(`${STRAVA_API_BASE}/push_subscriptions/${webhookId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete webhook: ${error}`);
  }
}

export async function fetchStravaActivityDetail(
  accessToken: string,
  activityId: number
): Promise<StravaSummaryActivity> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${activityId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch activity detail: ${error}`);
  }

  return response.json();
}

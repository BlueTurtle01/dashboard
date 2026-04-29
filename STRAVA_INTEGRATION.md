# Strava Integration Guide

This document explains the read-only Strava integration for the endurance training platform.

## Overview

The integration allows authenticated athletes to:
1. Connect their Strava account via OAuth 2.0
2. Store OAuth tokens securely in Supabase
3. Manually sync recent activities from Strava
4. View synced activities in the training dashboard
5. Disconnect from Strava

The integration is **read-only** — no data is written or uploaded to Strava.

## Setup

### 1. Create Strava API Application

1. Go to [Strava Developer](https://www.strava.com/settings/apps)
2. Create a new API application
3. Note the **Client ID** and **Client Secret**
4. Set the OAuth redirect URI to match your app:
   - Development: `http://localhost:3000/api/strava/callback`
   - Production: `https://your-domain.com/api/strava/callback`

### 2. Apply Database Migration

The migration creates two tables:
- `athlete_integrations`: Stores OAuth tokens and connection metadata
- `athlete_activities`: Stores synced activity data

Apply the migration via Supabase CLI or UI:
```bash
supabase migration up
```

Or manually run the SQL from `supabase/migrations/001_strava_integration.sql` in Supabase SQL Editor.

### 3. Configure Environment Variables

Add to `.env.local`:
```
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

The `NEXT_PUBLIC_APP_URL` is used to construct redirect URIs.

### 4. Start the Application

```bash
npm run dev
```

## Usage

### Connect Strava

1. Navigate to `/athlete/integrations`
2. Click "Connect Strava"
3. Authorize the app at Strava
4. You'll be redirected back to the integrations page

### Sync Activities

1. On the integrations page, click "Sync Recent Activities"
2. The app fetches the last 30 recent activities from Strava
3. Activities are stored in the `athlete_activities` table
4. You'll see a confirmation with the count of synced activities

### View Activities

Recent synced activities are displayed in a table on the integrations page, showing:
- Date
- Activity name
- Sport type
- Distance (km)
- Moving time
- Elevation gain (m)
- Average heart rate (if available)

### Disconnect Strava

1. On the integrations page, click "Disconnect"
2. Your local connection is deactivated
3. Historical activity data is retained
4. You can reconnect at any time

## Architecture

### Database Tables

#### `athlete_integrations`
Stores the OAuth connection:
- `user_id`: Reference to authenticated user
- `provider`: 'strava' (for future extensibility)
- `provider_athlete_id`: Strava athlete ID
- `provider_username`, `provider_firstname`, `provider_lastname`: Athlete info from Strava
- `access_token`: OAuth access token
- `refresh_token`: OAuth refresh token
- `expires_at`: Token expiration time (auto-refreshed when needed)
- `scopes`: OAuth scopes requested
- `is_active`: Connection status
- `last_sync_at`: Timestamp of last sync

#### `athlete_activities`
Stores synced activities:
- `user_id`: Reference to athlete
- `provider`: 'strava'
- `provider_activity_id`: Strava activity ID
- Activity fields: name, type, distance, time, elevation, heart rate, etc.
- `raw_data`: Full Strava activity JSON
- `synced_at`: When the activity was synced

### API Routes

**GET `/api/strava/connect`**
- Requires authentication
- Redirects to Strava OAuth authorization URL

**GET `/api/strava/callback`**
- Handles OAuth callback from Strava
- Exchanges code for access token
- Stores integration in database
- Redirects to integrations page with success/error message

**POST `/api/strava/sync`**
- Requires authentication
- Fetches recent activities from Strava
- Upserts activities into database
- Updates `last_sync_at` timestamp
- Returns count of synced activities

**POST `/api/strava/disconnect`**
- Requires authentication
- Deactivates the connection locally
- Attempts to deauthorize with Strava (best-effort)
- Retains historical activity data

**GET `/api/athlete/integrations`**
- Requires authentication
- Returns the authenticated user's Strava integration

**GET `/api/athlete/activities`**
- Requires authentication
- Returns synced activities for the user
- Supports query params: `provider`, `limit`

### Token Management

The `lib/strava.ts` module handles token lifecycle:
- `getValidStravaAccessToken()` checks if the token is expired (with 5-minute buffer)
- If expired, it refreshes the token using the refresh token
- Updated token is stored back in the database
- The sync endpoint always calls this to ensure a valid token

### Security

✅ **Server-side only:**
- `STRAVA_CLIENT_SECRET` is never exposed to the browser
- All Strava API calls happen server-side

✅ **Row-level security:**
- Users can only view their own integrations and activities
- RLS policies enforce this at the database level

✅ **Auth checks:**
- All API routes require an authenticated Supabase user
- `user_id` is derived from the session, never from client input

✅ **No write access:**
- The integration only reads from Strava
- No activities are created, modified, or uploaded
- `activity:write` scope is not requested

✅ **Token refresh:**
- Tokens are refreshed automatically when expired
- Refresh happens transparently during sync

## Testing Checklist

- [ ] Apply the migration
- [ ] Set environment variables
- [ ] Log in as an athlete
- [ ] Navigate to `/athlete/integrations`
- [ ] Click "Connect Strava" and authorize
- [ ] Confirm you see athlete name and connected status
- [ ] Click "Sync Recent Activities"
- [ ] Confirm activities appear in the table
- [ ] Click "Disconnect" and confirm connection is removed
- [ ] Reconnect and confirm previous activities are still there
- [ ] Test on production with the correct callback URI

## Troubleshooting

**"No active Strava integration found"**
- The user hasn't connected Strava yet, or the connection is marked inactive
- Have them click "Connect Strava" first

**"Failed to exchange code for token"**
- Verify `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are correct
- Check that the redirect URI registered in Strava matches the callback URL
- Look at server logs for detailed error messages

**"Activities not syncing"**
- Check that the token hasn't expired (it should auto-refresh)
- Verify the user has granted `read,activity:read_all` permissions
- Check network requests in browser DevTools

**"Token refresh errors"**
- The refresh token may have been revoked
- Have the user disconnect and reconnect

## Future Enhancements

- Automatic sync on a schedule (e.g., daily)
- Pagination support for fetching older activities
- Filtering by activity type or date range
- Integration with training plan metrics
- Display of additional Strava data (effort, power, etc.)
- Activity import into training sessions

## References

- [Strava API Documentation](https://developers.strava.com/docs/reference/)
- [OAuth 2.0 Specification](https://tools.ietf.org/html/rfc6749)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)

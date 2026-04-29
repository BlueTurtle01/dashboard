# Strava Integration - Quick Start Setup

## Step 1: Apply the Database Migration

The integration requires two new database tables. Apply the migration via Supabase:

### Option A: Using Supabase CLI
```bash
supabase migration up
```

### Option B: Using Supabase Dashboard
1. Go to your Supabase project: https://app.supabase.com
2. Click "SQL Editor" in the sidebar
3. Click "New Query"
4. Copy the contents of `supabase/migrations/001_strava_integration.sql`
5. Paste into the SQL editor
6. Click "Run"

> **Note:** The migration creates tables with RLS policies that ensure users can only access their own data.

## Step 2: Verify Environment Variables

Check that `.env.local` contains all required Strava environment variables:

```
STRAVA_CLIENT_ID=232838
STRAVA_CLIENT_SECRET=4128e61d1f41f930489061f7e3621131ab623d62
NEXT_PUBLIC_APP_URL=https://dashboard-delta-ten-55.vercel.app
STRAVA_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_here
```

The webhook verify token validates that webhook requests from Strava are genuine. Set it to any random string:
```
STRAVA_WEBHOOK_VERIFY_TOKEN=my_secure_random_token_xyz123
```

These are already added in your `.env.local` file.

## Step 3: Update Strava Callback URI (Important!)

1. Go to [Strava Developer Settings](https://www.strava.com/settings/apps)
2. Click on your API application
3. Update the **Authorization Callback Domain** to match your deployment:
   - **Local development:** `http://localhost:3000`
   - **Production:** `https://dashboard-delta-ten-55.vercel.app`

The callback endpoint will automatically be: `https://your-domain/api/strava/callback`

## Step 4: Start the Development Server

```bash
npm run dev
```

## Step 5: Test the Integration

1. **Log in** to your app as an athlete account
2. **Click the "Integrations" link** in the athlete navigation menu (or go directly to `/athlete/integrations`)
3. **Click "Connect Strava"** 
   - You'll be redirected to Strava
   - Authorize the app (it only requests read access)
   - You'll be redirected back
4. **Confirm connection** - You should see your name displayed
5. **Click "Sync Recent Activities"** to fetch your last 30 Strava activities
6. **View the activities** in the table below
7. **Test disconnect** - Click "Disconnect" to remove the connection (activities are retained)
8. **Reconnect** to verify activities are still there

## Expected Behavior

### Connected State
- Shows athlete name
- Shows last sync time
- "Sync Recent Activities" button available
- "Disconnect" button available
- Recent activities displayed in table (date, name, sport, distance, time, elevation, heart rate)

### Not Connected State
- Shows explanation text
- "Connect Strava" button available
- No activities table

### Syncing
- Shows "Syncing..." while fetching
- Displays success message with count (e.g., "Synced 12 activities")
- Shows errors if something goes wrong

## File Structure

All Strava integration code is organized as follows:

```
lib/strava.ts                                  # Core utilities
app/api/strava/                                # OAuth and sync endpoints
  ├── connect/route.ts
  ├── callback/route.ts
  ├── sync/route.ts
  ├── disconnect/route.ts
  ├── webhook-subscribe/route.ts               # Webhook subscription
  └── webhook-unsubscribe/route.ts             # Webhook unsubscription
app/api/webhooks/strava/route.ts               # Webhook receiver endpoint
app/api/athlete/                               # Data access endpoints
  ├── integrations/route.ts
  └── activities/route.ts
app/athlete/integrations/                      # UI pages and components
  ├── page.tsx
  └── StravaIntegration.tsx
supabase/migrations/001_strava_integration.sql # Database schema
STRAVA_INTEGRATION.md                          # Full documentation
STRAVA_WEBHOOKS.md                             # Webhook setup guide
```

## Troubleshooting

### "Strava: invalid_grant" or "Invalid client_id"
- Verify `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` in `.env.local`
- Check the credentials match your Strava API app

### "Redirect URI mismatch"
- Verify the callback domain in Strava Developer Settings
- Make sure it matches your app's domain exactly

### Activities not showing
- First, connect to Strava
- Then click "Sync Recent Activities"
- Check browser console for error messages
- Verify the user has public Strava activities

### Token expired errors
- Token refresh happens automatically
- Usually resolves on next sync attempt
- If persistent, reconnect to Strava

## What Was Built

✅ **Database:** Two tables for storing integrations and activities with RLS policies
✅ **OAuth Flow:** Secure connection to Strava with token management
✅ **API Routes:** Endpoints for connecting, syncing, and disconnecting
✅ **UI Component:** Clean interface for managing integrations
✅ **Activities Display:** Table showing recent synced workouts
✅ **Navigation:** Added "Integrations" link to athlete menu
✅ **Security:** Server-side token handling, no exposure to browser

## Next Steps

1. Apply the migration above
2. Start the dev server
3. Navigate to `/athlete/integrations`
4. Connect your Strava account
5. Sync your activities
6. Confirm everything works as expected

See `STRAVA_INTEGRATION.md` for complete documentation and advanced configuration.

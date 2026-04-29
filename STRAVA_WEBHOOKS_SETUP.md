# Strava Webhooks - Correct Setup

Strava webhooks are configured **once at the app level** in your developer settings, not dynamically per user.

## How Strava Webhooks Work

When a user completes an activity on Strava:
1. Strava detects the new activity
2. Strava POST's event to your configured webhook endpoint
3. Your app receives the event and fetches full activity details
4. Activity appears in the dashboard

**No per-user subscription needed** — all users of your app automatically trigger webhooks to the same endpoint.

## Setup Steps

### Step 1: Configure Webhook in Strava Developer Settings

1. Go to: https://www.strava.com/settings/apps
2. Click your app (Client ID: 232838)
3. Scroll to **Webhook Settings**
4. Set **Callback URL** to:
   ```
   https://dashboard-delta-ten-55.vercel.app/api/webhooks/strava
   ```
5. Set **Verify Token** to match your `.env.local`:
   ```
   STRAVA_WEBHOOK_VERIFY_TOKEN=webhook_verify_token_abc123
   ```
6. Click **Subscribe** or **Update**
7. Strava will verify the endpoint by calling it with a GET request
8. Should say "✓ Subscribed"

### Step 2: Verify Environment Variables

Check `.env.local` has:
```
STRAVA_WEBHOOK_VERIFY_TOKEN=webhook_verify_token_abc123
```

And Vercel has the same value in project settings.

### Step 3: Deploy

```bash
git add .
git commit -m "Setup Strava webhooks"
git push
```

Wait for Vercel to deploy.

### Step 4: Test

1. User connects Strava at `/athlete/integrations`
2. User completes an activity on Strava
3. Wait 5-30 seconds
4. Activity appears automatically in the dashboard

## How It Works

```
Strava Settings: Configure callback URL once
           ↓
User connects to your app (OAuth)
           ↓
User completes activity on Strava
           ↓
Strava POST /api/webhooks/strava with event
           ↓
Your app receives event
           ↓
Your app finds user by Strava athlete_id
           ↓
Your app fetches full activity details
           ↓
Activity stored in athlete_activities
           ↓
Activity appears on dashboard
```

## Webhook Event Flow

When activity is completed on Strava, you receive:

```json
POST /api/webhooks/strava
{
  "event_type": "create",
  "object_type": "activity",
  "object_id": 123456789,
  "owner_id": 987654321,
  "aspect_type": "create",
  "updates": {}
}
```

Your code:
1. Validates verify token matches
2. Finds athlete with provider_athlete_id = 987654321
3. Fetches activity 123456789 from Strava API
4. Stores in athlete_activities table

## Troubleshooting

### "Webhook verification failed"

Strava can't reach your endpoint. Check:
- URL is correct: `https://dashboard-delta-ten-55.vercel.app/api/webhooks/strava`
- Server is running
- Endpoint responds to GET requests with 200 OK

### Webhooks configured but activities not syncing

Check:
1. User connected Strava
2. User has public activities on Strava
3. Check database for events:
   ```sql
   SELECT * FROM strava_webhook_events 
   ORDER BY created_at DESC LIMIT 10;
   ```

### Verify token mismatch

Make sure verify token in:
- Strava Settings matches
- `.env.local` matches
- Vercel project settings matches

## Files

- **`app/api/webhooks/strava/route.ts`** — Webhook receiver endpoint
- **`.env.local`** — `STRAVA_WEBHOOK_VERIFY_TOKEN`
- **`supabase/migrations/001_strava_integration.sql`** — Webhook event tables

## Key Differences from Before

✅ **Removed**: Per-user webhook subscription API calls (not needed)
✅ **Kept**: Webhook endpoint to receive events from Strava
✅ **Kept**: Manual sync button for user to sync on demand
✅ **Added**: Automatic syncing when webhooks arrive

Webhooks are **app-level**, not user-level. Configure once in Strava settings!

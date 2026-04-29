# Strava Webhooks - Automatic Activity Syncing

This guide explains how to set up and use Strava webhooks for automatic activity syncing.

## What Are Webhooks?

Strava webhooks are push notifications sent to your server when a user completes an activity. Instead of your app constantly asking "Do you have a new activity?", Strava automatically tells you when something happens.

**Benefits:**
- ⚡ Instant sync - Activities appear on the dashboard within seconds
- 📱 Real-time - No polling or manual syncing needed
- ⚙️ Efficient - Only processes events that matter
- 💾 Optional - Users can enable/disable as they prefer

## How It Works

1. User connects Strava → You subscribe to webhooks on their behalf
2. User completes an activity on Strava
3. Strava sends POST to your webhook endpoint
4. Your app receives the notification and fetches full activity details
5. Activity appears in the dashboard automatically

## Setup

### Step 1: Set Webhook Verify Token

Generate a random token and add to `.env.local`:

```bash
# Generate a random token (or use any random string)
STRAVA_WEBHOOK_VERIFY_TOKEN=your_random_verify_token_123456789
```

This token is used to validate that webhook requests actually come from Strava.

### Step 2: Apply Database Migration

Run the migration to create webhook tables:

```bash
supabase migration up
```

Creates:
- `strava_webhooks` - Tracks webhook subscriptions per user
- `strava_webhook_events` - Logs all received webhook events for debugging

### Step 3: Deploy Webhook Endpoint

The webhook endpoint is at `/api/webhooks/strava` and is automatically created.

**For local development:**
- Webhooks won't work on `localhost` — Strava needs a public URL
- Test with manual syncing instead, or deploy to staging

**For production:**
- Your webhook URL: `https://your-domain.com/api/webhooks/strava`
- This is automatically used when users subscribe

### Step 4: User Enables Automatic Syncing

1. User goes to `/athlete/integrations`
2. Connects Strava (if not already connected)
3. Clicks "Enable" under "Automatic Syncing"
4. System subscribes to webhooks on their behalf

The integration page shows:
- **🔄 Enabled** - Webhooks are active, new activities sync automatically
- **⏸️ Disabled** - Only manual syncing available

## How It Works Under the Hood

### Webhook Event Flow

```
Strava User completes activity
         ↓
    Strava backend
         ↓
POST /api/webhooks/strava (your server)
         ↓
Verify request token
         ↓
Store event in strava_webhook_events
         ↓
Find user by Strava athlete_id
         ↓
Fetch full activity details
         ↓
Upsert into athlete_activities
         ↓
Return 200 OK to Strava
```

### Key Functions

**Webhook Subscription (subscribeToStravaWebhook)**
```typescript
POST https://www.strava.com/api/v3/push_subscriptions
{
  "callback_url": "https://your-domain.com/api/webhooks/strava",
  "verify_token": "your_webhook_verify_token"
}
```
Returns a webhook ID that tracks the subscription.

**Webhook Verification (GET /api/webhooks/strava)**
Strava calls this when subscribing to verify your endpoint:
```
GET /api/webhooks/strava?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
```
You respond with the challenge to confirm ownership.

**Event Processing (POST /api/webhooks/strava)**
Strava sends activity events:
```json
{
  "event_type": "create",
  "object_type": "activity",
  "object_id": 123456789,
  "owner_id": 987654321,
  "aspect_type": "create",
  "updates": {}
}
```
Your server fetches the full activity and stores it.

## Event Handling

### Supported Events

- **activity.create** - New activity uploaded
- **activity.update** - Activity edited (distance, time, etc.)
- **activity.delete** - Activity deleted (currently logged but not processed)

### Event Storage

All webhook events are stored in `strava_webhook_events` for debugging:

```sql
SELECT * FROM strava_webhook_events 
WHERE user_id = 'user-uuid' 
ORDER BY created_at DESC;
```

Fields:
- `event_type` - "create", "update", "delete"
- `object_type` - Always "activity" for now
- `object_id` - Strava activity ID
- `owner_id` - Strava athlete ID
- `processed` - Whether we successfully handled it
- `error_message` - If processing failed
- `raw_event` - Full Strava event JSON

## User Controls

### In the Integrations Page

**"Automatic Syncing" Section**
- Status badge shows if enabled/disabled
- "Enable" button subscribes to webhooks
- "Disable" button unsubscribes (user retains manual sync)

**Behavior**
- Enabling adds webhook subscription to Strava
- Disabling removes it but keeps local connection
- If enabling fails, clear error message displayed
- Can toggle on/off anytime

### Manual Syncing Still Works

Users can always click "Sync Recent Activities" to manually pull their last 30 activities, regardless of webhook status.

## Troubleshooting

### "Failed to subscribe to webhooks"

**Cause:** Can't reach Strava API or invalid credentials
- Check `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are correct
- Check network connectivity
- Check Strava API status

### Webhooks enabled but activities not syncing

**Check:**
1. Verify token is set correctly in `.env.local`
2. Webhook URL is publicly accessible (test with `curl`)
3. Check `strava_webhook_events` table for received events
4. Check logs for processing errors

```sql
SELECT * FROM strava_webhook_events 
WHERE processed = false 
LIMIT 10;
```

### "Webhook endpoint not responding"

Strava will retry for up to 24 hours. Make sure:
- Your server is running
- `/api/webhooks/strava` endpoint exists
- Responds with 200 OK
- Can reach Strava API to fetch activity details

### Multiple subscriptions

Strava limits subscriptions per app. If you have multiple, they may override:
```sql
SELECT * FROM strava_webhooks WHERE is_active = true;
```

Delete extras:
```typescript
await deleteStravaWebhookSubscription(accessToken, webhookId);
```

## Technical Details

### Idempotency

Webhook events can be delivered multiple times. The system handles this by:
- Using unique constraint on `athlete_activities(provider, provider_activity_id)`
- Upserting activities (update if exists, insert if new)
- Logging all events for audit trail

### Activity Detail Fetching

When a webhook arrives, we fetch full activity from Strava:
```
GET /api/v3/activities/{activity_id}
```

This includes all metrics (distance, elevation, heart rate, etc.) that aren't in the webhook.

### Token Management

Webhooks use the same OAuth tokens as manual sync. If a token expires:
- Auto-refresh happens transparently
- If refresh fails, webhook is logged with error
- User can retry or manually sync

### Rate Limiting

Strava has rate limits. Webhooks count against your limit. Consider:
- Caching activity details
- Batch processing events
- Monitoring Strava rate limit headers

## Security

✅ **Webhook verification**: All requests validated against verify token
✅ **Auth checks**: Only process for authenticated integrations
✅ **Token storage**: Access tokens stored securely in Supabase
✅ **RLS policies**: Users only see their own webhooks and activities
✅ **Event logging**: All events stored for audit trail

## Files

```
app/api/webhooks/strava/route.ts          # Webhook endpoint
app/api/strava/webhook-subscribe/route.ts # Subscription management
app/api/strava/webhook-unsubscribe/route.ts # Unsubscription
lib/strava.ts                              # Webhook API functions
supabase/migrations/001_strava_integration.sql  # Tables
.env.local                                 # STRAVA_WEBHOOK_VERIFY_TOKEN
```

## Testing

### Local Testing

Webhooks require a public URL. To test locally:

1. **Use a tunneling service** (ngrok, localtonet, etc.)
   ```bash
   ngrok http 3000
   ```
   Your URL: `https://xxx-ngrok.io`

2. **Manual Testing**
   Post to your webhook endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/webhooks/strava \
     -H "Content-Type: application/json" \
     -d '{
       "event_type": "create",
       "object_type": "activity",
       "object_id": 123456789,
       "owner_id": 987654321,
       "aspect_type": "create"
     }'
   ```

3. **Strava Sandbox** (if available)
   - Use Strava's sandbox athlete account
   - Create test activities
   - Monitor webhook events

### Production Testing

1. User connects Strava
2. User enables "Automatic Syncing"
3. Verify subscription in database:
   ```sql
   SELECT * FROM strava_webhooks WHERE user_id = 'user-uuid';
   ```
4. User completes activity on Strava
5. Wait up to 30 seconds
6. Check `strava_webhook_events`:
   ```sql
   SELECT * FROM strava_webhook_events 
   WHERE user_id = 'user-uuid' 
   ORDER BY created_at DESC LIMIT 1;
   ```
7. Check if activity appears in dashboard

## Monitoring

### Key Metrics to Track

```sql
-- Recent webhook events
SELECT event_type, COUNT(*) as count, 
       SUM(CASE WHEN processed THEN 1 ELSE 0 END) as successful
FROM strava_webhook_events
WHERE created_at > now() - interval '24 hours'
GROUP BY event_type;

-- Failed processing
SELECT user_id, event_type, error_message
FROM strava_webhook_events
WHERE processed = false AND error_message IS NOT NULL
ORDER BY created_at DESC;

-- Active subscriptions
SELECT COUNT(*) FROM strava_webhooks WHERE is_active = true;
```

## Future Enhancements

- Activity deletion handling
- Webhook event retry logic
- Batch event processing
- Webhook history UI for users
- Activity update conflict resolution
- Real-time notifications to user
- Webhook health monitoring dashboard

## References

- [Strava Webhooks API](https://developers.strava.com/docs/webhooks/)
- [Activity API](https://developers.strava.com/docs/reference/)
- [Push Subscriptions](https://developers.strava.com/docs/webhooks/#push-subscriptions)

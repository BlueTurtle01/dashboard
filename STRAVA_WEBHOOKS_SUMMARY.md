# Strava Webhooks Implementation Summary

Automatic activity syncing has been added via Strava webhooks. When users complete activities on Strava, they are automatically pushed to the dashboard in real-time.

## What Was Added

### New API Endpoints (3)

1. **`POST /api/strava/webhook-subscribe`**
   - Subscribe user to automatic activity syncing
   - Creates webhook subscription with Strava
   - Stores subscription in database
   - Returns webhook status

2. **`GET /api/strava/webhook-subscribe`**
   - Check if user has active webhooks
   - Returns subscription status

3. **`POST /api/strava/webhook-unsubscribe`**
   - Disable automatic syncing
   - Removes webhook subscription from Strava
   - Marks local subscription as inactive

4. **`POST/GET /api/webhooks/strava`**
   - Receives webhook events from Strava
   - Validates verify token
   - Processes activity create/update events
   - Fetches full activity details
   - Stores in athlete_activities table

### New Database Tables (2)

**`strava_webhooks`** - Subscription tracking
- user_id, webhook_id, callback_url
- is_active status
- subscribed_at timestamp

**`strava_webhook_events`** - Event logging
- event_type, object_type, object_id
- owner_id (Strava athlete)
- processed status & error_message
- Full raw_event JSON for debugging

### Updated UI Component

**StravaIntegration.tsx** now shows:
- **Automatic Syncing section** with blue info box
  - Status badge: "🔄 Enabled" or "⏸️ Disabled"
  - Enable/Disable buttons
  - Confirmation dialogs

New state management for:
- webhookStatus
- subscribing/unsubscribing loading states

### New Utility Functions (4)

Added to `lib/strava.ts`:
- `subscribeToStravaWebhook()` - Register webhook with Strava
- `getStravaWebhookSubscriptions()` - List active subscriptions
- `deleteStravaWebhookSubscription()` - Remove webhook
- `fetchStravaActivityDetail()` - Get full activity data

### Updated Environment

Added to `.env.local`:
```
STRAVA_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_here
```

## How It Works

### User Enables Automatic Syncing

```
User clicks "Enable" button
    ↓
POST /api/strava/webhook-subscribe
    ↓
Call subscribeToStravaWebhook() with Strava API
    ↓
Strava verifies webhook URL at GET /api/webhooks/strava
    ↓
Store subscription in strava_webhooks table
    ↓
Show "🔄 Enabled" in UI
```

### Activity Completion

```
User completes activity on Strava
    ↓
Strava POST to /api/webhooks/strava
    ↓
Verify webhook token
    ↓
Store event in strava_webhook_events
    ↓
Find user by Strava athlete_id
    ↓
Fetch full activity with fetchStravaActivityDetail()
    ↓
Upsert into athlete_activities
    ↓
Activity appears in dashboard (seconds later)
```

## New Files

```
app/api/strava/webhook-subscribe/route.ts      (109 lines)
app/api/strava/webhook-unsubscribe/route.ts    (71 lines)
app/api/webhooks/strava/route.ts               (156 lines)
STRAVA_WEBHOOKS.md                             (Complete guide)
```

## Updated Files

```
supabase/migrations/001_strava_integration.sql  (+74 lines for webhook tables)
lib/strava.ts                                   (+92 lines for webhook functions)
app/athlete/integrations/StravaIntegration.tsx  (Complete rewrite with webhooks)
STRAVA_SETUP_QUICK_START.md                     (Updated with webhook info)
.env.local                                      (Added webhook token)
```

## Database Changes

The migration now includes:

**New Triggers** (2)
- `strava_webhooks_updated_at`
- `strava_webhook_events_updated_at`

**New Indexes** (3)
- `strava_webhook_events_user_processed_idx`
- `strava_webhook_events_object_id_idx`
- `strava_webhook_events_created_idx`

**New RLS Policies** (6)
- View own webhooks
- Service role manage webhooks
- View own webhook events
- Service role insert events

## Key Features

✅ **Real-time syncing** - Activities appear within seconds
✅ **User control** - Can enable/disable anytime
✅ **Event logging** - All webhooks stored for debugging
✅ **Error handling** - Failed events logged with error message
✅ **Idempotency** - Duplicate webhooks handled gracefully
✅ **Token refresh** - Automatic token refresh on expiration
✅ **Security** - Webhook verify token validation
✅ **Fallback** - Manual sync still works if webhooks fail

## Setup Steps

1. **Update `.env.local`** with webhook verify token
   ```
   STRAVA_WEBHOOK_VERIFY_TOKEN=my_random_token_123
   ```

2. **Apply migration**
   ```bash
   supabase migration up
   ```

3. **For production**, webhook endpoint must be public:
   ```
   https://dashboard-delta-ten-55.vercel.app/api/webhooks/strava
   ```

4. **User actions**:
   - Connect Strava (if not already)
   - Click "Enable" under "Automatic Syncing"
   - Complete activity on Strava
   - Activity syncs automatically

## Testing

### Local Development
- Webhooks won't work on localhost (Strava needs public URL)
- Use manual syncing for testing: "Sync Recent Activities"
- Or deploy to staging/production

### Production
- Deploy app first
- User enables webhooks in UI
- Complete activity on Strava
- Watch it appear in dashboard
- Check database for events:
  ```sql
  SELECT * FROM strava_webhook_events 
  WHERE user_id = 'xxx' 
  ORDER BY created_at DESC;
  ```

## Monitoring Webhooks

Check subscription status:
```sql
SELECT * FROM strava_webhooks 
WHERE user_id = 'xxx' 
AND is_active = true;
```

View recent events:
```sql
SELECT event_type, processed, error_message, created_at
FROM strava_webhook_events
WHERE user_id = 'xxx'
ORDER BY created_at DESC
LIMIT 10;
```

Check for failures:
```sql
SELECT * FROM strava_webhook_events
WHERE processed = false 
AND error_message IS NOT NULL
ORDER BY created_at DESC;
```

## Limitations

- Strava may have rate limits on webhook deliveries
- Local development won't receive webhooks (localhost issue)
- Activity deletions are logged but not processed yet
- No real-time UI updates (page refresh shows new activities)

## Future Enhancements

- Activity deletion handling
- Webhook status indicator on dashboard
- Webhook failure notifications to user
- Real-time push notifications
- Activity update conflict resolution
- Batch event processing
- Webhook replay functionality
- Admin webhook monitoring dashboard

## Documentation

- **STRAVA_INTEGRATION.md** - General integration guide
- **STRAVA_WEBHOOKS.md** - Detailed webhook documentation
- **STRAVA_SETUP_QUICK_START.md** - Quick start with webhooks
- **STRAVA_REDIRECT_URI_FIX.md** - OAuth callback setup

## Status

✅ **Complete and ready for testing**

All webhook functionality is implemented and integrated into the UI. Users can now enable automatic syncing and have their Strava activities pushed to the dashboard in real-time.

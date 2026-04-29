# Fixing Strava Redirect URI Error

## The Problem

You're seeing this error:
```
{"message":"Bad Request","errors":[{"resource":"Application","field":"redirect_uri","code":"invalid"}]}
```

This happens because the **callback domain is not registered** in your Strava API application settings.

## The Solution

### Step 1: Go to Strava Developer Settings

1. Navigate to: https://www.strava.com/settings/apps
2. Click on your API application (the one with Client ID: 232838)

### Step 2: Update Authorization Callback Domain

In the "Authorization Callback Domain" field, you need to enter your app's domain:

**For production (Vercel):**
```
dashboard-delta-ten-55.vercel.app
```

**For local development:**
```
localhost:3000
```

> **Important:** Enter ONLY the domain, NOT the full path. Do not include `/api/strava/callback` or the protocol.

### Step 3: Save Changes

Click "Update" or "Save" button on the Strava settings page.

### Step 4: Wait for Changes to Propagate

Sometimes Strava takes a minute or two to apply the changes. You can immediately try again, but if it still doesn't work, wait 1-2 minutes and try again.

### Step 5: Test Connection

1. Go back to your app at `/athlete/integrations`
2. Click "Connect Strava"
3. You should be redirected to Strava's authorization page (not an error)
4. Authorize the app
5. You'll be redirected back to your app with your connection confirmed

## Why This Happens

Strava OAuth requires you to:
- Register your callback **domain** (just the domain part, e.g., `example.com`)
- Your code provides the **full callback URI** (e.g., `https://example.com/api/strava/callback`)

When you try to connect, the OAuth server checks that the domain in your callback URI matches a domain you've registered. If it doesn't match exactly, you get the `invalid` error.

## Common Issues

### "Still getting the error"
- Make sure you saved the settings in Strava
- Wait 1-2 minutes for changes to propagate
- Try clearing your browser cache
- Use an incognito/private window to test

### "Works on local but not production (or vice versa)"
- You may need to register BOTH domains:
  - `localhost:3000` for local development
  - `dashboard-delta-ten-55.vercel.app` for production
- Switch between them as needed, or register both if your Strava app allows multiple domains

### "Different error now"
- Check the browser's Network tab (DevTools)
- Look at the redirect URL to see what parameters are being sent
- Verify Client ID is correct in `.env.local`

## Verifying the Fix

Once fixed, the OAuth flow should work:

1. Click "Connect Strava" → Redirects to Strava
2. Authorize → Redirects back to `/athlete/integrations`
3. See message: "Strava connected successfully"
4. See athlete name displayed
5. Click "Sync Recent Activities" → Activities appear

If you're still having issues, check:
- [ ] Callback domain is registered in Strava settings
- [ ] Domain matches exactly (no typos)
- [ ] You waited 1-2 minutes after saving
- [ ] Client ID and Secret in `.env.local` are correct
- [ ] App URL in `.env.local` matches your deployment

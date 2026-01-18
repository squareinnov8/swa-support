# Gmail Push Notifications Setup

This guide explains how to set up real-time Gmail notifications using Google Cloud Pub/Sub. Instead of polling Gmail periodically, the system receives instant notifications when new emails arrive.

## Overview

```
New email arrives in Gmail
  → Gmail API publishes to Pub/Sub topic
  → Pub/Sub pushes to your webhook (/api/webhooks/gmail)
  → Webhook processes new messages immediately
```

## Prerequisites

- Google Cloud Platform (GCP) account
- Gmail API already configured (OAuth credentials exist)
- Vercel deployment URL

## Step 1: Enable Required APIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create one)
3. Go to **APIs & Services > Library**
4. Enable:
   - **Gmail API** (if not already enabled)
   - **Cloud Pub/Sub API**

## Step 2: Create Pub/Sub Topic

1. Go to **Pub/Sub > Topics** in GCP Console
2. Click **Create Topic**
3. Name it: `gmail-notifications` (or similar)
4. Note the full topic name: `projects/YOUR-PROJECT-ID/topics/gmail-notifications`

## Step 3: Grant Gmail Publish Permissions

Gmail needs permission to publish to your Pub/Sub topic.

1. Go to your topic's **Permissions** tab
2. Click **Add Principal**
3. Add this service account: `gmail-api-push@system.gserviceaccount.com`
4. Role: **Pub/Sub Publisher**
5. Save

## Step 4: Create Pub/Sub Subscription

1. Go to **Pub/Sub > Subscriptions**
2. Click **Create Subscription**
3. Configure:
   - **Subscription ID**: `gmail-webhook`
   - **Topic**: Select your topic
   - **Delivery type**: Push
   - **Endpoint URL**: `https://your-app.vercel.app/api/webhooks/gmail`
   - **Enable authentication** (optional but recommended):
     - Create a service account or use existing
     - Add the `Authorization` header with a Bearer token
4. Click **Create**

### Optional: Add Authentication

For extra security, set an authorization token:

1. In the subscription, enable **Push authentication**
2. Set your own secret token
3. Add to Vercel environment: `GMAIL_WEBHOOK_SECRET=your-secret-token`

## Step 5: Configure Environment Variables

Add to your Vercel project (Settings > Environment Variables):

```
GMAIL_PUBSUB_TOPIC=projects/YOUR-PROJECT-ID/topics/gmail-notifications
GMAIL_WEBHOOK_SECRET=your-optional-secret-token
```

## Step 6: Deploy and Initialize Watch

1. Deploy your app to Vercel
2. Initialize the Gmail watch:

```bash
# Initial setup (creates the watch)
curl -X POST "https://your-app.vercel.app/api/gmail/renew-watch?setup=true"
```

3. Verify watch is active:

```bash
curl "https://your-app.vercel.app/api/gmail/renew-watch"
```

Expected response:
```json
{
  "configured": true,
  "active": true,
  "expiration": "2026-01-25T00:00:00.000Z",
  "needsRenewal": false
}
```

## Verification

1. Send a test email to `support@squarewheelsauto.com`
2. Check Vercel logs - you should see `[GmailWebhook] Received notification...`
3. The email should be processed within seconds

## Troubleshooting

### "Gmail push notifications not configured"
- Ensure `GMAIL_PUBSUB_TOPIC` is set in Vercel environment variables
- Redeploy after adding the variable

### Watch not receiving notifications
- Verify the Pub/Sub subscription endpoint URL is correct
- Check that `gmail-api-push@system.gserviceaccount.com` has Publisher role on the topic
- Ensure the subscription is in "Active" state

### "401 Unauthorized" in webhook
- If using authentication, verify `GMAIL_WEBHOOK_SECRET` matches the Pub/Sub subscription token

### Watch expires unexpectedly
- The cron job at `/api/gmail/renew-watch` runs every 6 days
- You can manually renew: `curl -X POST "https://your-app.vercel.app/api/gmail/renew-watch?force=true"`

## Architecture

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/gmail/watch.ts` | Watch management utilities |
| `src/app/api/webhooks/gmail/route.ts` | Webhook endpoint for Pub/Sub |
| `src/app/api/gmail/renew-watch/route.ts` | Watch renewal endpoint |
| `supabase/migrations/026_gmail_push_notifications.sql` | Database columns for watch state |

### Database Columns Added

```sql
gmail_sync_state.watch_expiration  -- When the watch expires
gmail_sync_state.watch_resource_id -- Resource ID for stopping watch
gmail_sync_state.pubsub_topic      -- Configured Pub/Sub topic
```

### Cron Jobs

| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| Daily 8am UTC | `/api/agent/poll` | Fallback polling (safety net) |
| Every 6 days | `/api/gmail/renew-watch` | Renew watch before expiration |

## Cost Considerations

- **Pub/Sub**: Very cheap (~$0.04 per million messages)
- **Gmail API**: No extra cost (uses existing quota)
- **Vercel**: Each webhook invocation counts as a function execution

## Comparison: Polling vs Push

| Aspect | Polling (5 min) | Push Notifications |
|--------|-----------------|-------------------|
| API calls/month | ~8,640 | ~4-5 (watch renewal only) |
| Latency | Up to 5 minutes | 1-5 seconds |
| Cost | Higher API usage | Minimal Pub/Sub cost |
| Complexity | Simple | Moderate (one-time setup) |

## Support

If you encounter issues:
1. Check Vercel function logs
2. Check Pub/Sub subscription metrics in GCP Console
3. Verify Gmail watch status via the GET endpoint

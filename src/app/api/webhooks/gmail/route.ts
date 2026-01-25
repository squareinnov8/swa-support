/**
 * Gmail Push Notification Webhook
 *
 * Receives push notifications from Google Cloud Pub/Sub when new emails arrive.
 * This eliminates the need for periodic polling - Gmail notifies us in real-time.
 *
 * POST /api/webhooks/gmail
 *
 * Pub/Sub sends a message in this format:
 * {
 *   "message": {
 *     "data": "base64-encoded-json",
 *     "messageId": "...",
 *     "publishTime": "..."
 *   },
 *   "subscription": "projects/.../subscriptions/..."
 * }
 *
 * The decoded data contains:
 * {
 *   "emailAddress": "support@squarewheelsauto.com",
 *   "historyId": "12345"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { runGmailMonitor } from "@/lib/gmail/monitor";
import { renewWatchIfNeeded } from "@/lib/gmail/watch";
import { checkStaleHumanHandling } from "@/lib/threads";
import { supabase } from "@/lib/db";

const SUPPORT_EMAIL = "support@squarewheelsauto.com";

// Optional: Verify the request comes from Google
// You can configure a secret token in your Pub/Sub subscription
const WEBHOOK_SECRET = process.env.GMAIL_WEBHOOK_SECRET;

type PubSubMessage = {
  message: {
    data: string; // Base64 encoded
    messageId: string;
    publishTime: string;
  };
  subscription: string;
};

type GmailNotification = {
  emailAddress: string;
  historyId: string;
};

/**
 * Handle Gmail push notification
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Optional: Verify webhook secret
    if (WEBHOOK_SECRET) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
        console.warn("[GmailWebhook] Invalid or missing authorization");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Parse Pub/Sub message
    const body = await request.json() as PubSubMessage;

    if (!body.message?.data) {
      console.warn("[GmailWebhook] Invalid Pub/Sub message format");
      // Return 200 to prevent Pub/Sub from retrying
      return NextResponse.json({ status: "ignored", reason: "invalid format" });
    }

    // Decode the notification data
    const decodedData = Buffer.from(body.message.data, "base64").toString("utf-8");
    const notification: GmailNotification = JSON.parse(decodedData);

    console.log(`[GmailWebhook] Received notification for ${notification.emailAddress}, historyId: ${notification.historyId}`);

    // Verify this is for our support email
    if (notification.emailAddress !== SUPPORT_EMAIL) {
      console.warn(`[GmailWebhook] Ignoring notification for ${notification.emailAddress}`);
      return NextResponse.json({ status: "ignored", reason: "wrong email" });
    }

    // Check if we're already processing (prevent duplicate processing from retries)
    const { data: recentRun } = await supabase
      .from("agent_poll_runs")
      .select("id, started_at")
      .eq("status", "running")
      .gte("started_at", new Date(Date.now() - 30000).toISOString()) // Within last 30 seconds
      .limit(1)
      .maybeSingle();

    if (recentRun) {
      console.log(`[GmailWebhook] Skipping - already processing (run ${recentRun.id})`);
      return NextResponse.json({ status: "skipped", reason: "already processing" });
    }

    // Process new messages using the existing monitor function
    // The monitor uses historyId from the database for incremental sync
    const result = await runGmailMonitor();

    // Check for stale HUMAN_HANDLING threads (runs on every webhook call)
    // This ensures threads stuck in human handling are returned to Lina promptly
    const staleResult = await checkStaleHumanHandling();
    if (staleResult.threadsReturned > 0) {
      console.log(`[GmailWebhook] Returned ${staleResult.threadsReturned} stale threads to Lina`);
    }

    // Proactively renew watch if needed (self-healing)
    const watchStatus = await renewWatchIfNeeded(false);
    if (!watchStatus.success) {
      console.warn("[GmailWebhook] Watch renewal failed:", watchStatus.error);
    }

    const duration = Date.now() - startTime;
    console.log(`[GmailWebhook] Processed in ${duration}ms:`, {
      newMessages: result.newMessagesFound,
      drafts: result.draftsGenerated,
      errors: result.errors.length,
    });

    return NextResponse.json({
      status: "processed",
      duration,
      result: {
        threadsChecked: result.threadsChecked,
        newMessagesFound: result.newMessagesFound,
        draftsGenerated: result.draftsGenerated,
        escalations: result.escalations,
        errors: result.errors,
      },
      staleHandling: {
        threadsReturned: staleResult.threadsReturned,
        threadIds: staleResult.threadIds,
      },
    });
  } catch (error) {
    console.error("[GmailWebhook] Error processing notification:", error);

    // Return 200 to prevent infinite retries on permanent errors
    // Pub/Sub will retry on 4xx/5xx, which could cause duplicate processing
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Health check / verification endpoint
 * Google Cloud may send a GET request to verify the endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "gmail-webhook",
    timestamp: new Date().toISOString(),
  });
}

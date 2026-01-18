/**
 * Gmail Watch Renewal Endpoint
 *
 * POST /api/gmail/renew-watch
 *
 * Renews the Gmail push notification watch subscription.
 * Gmail watches expire after 7 days, so this should run periodically via cron.
 *
 * Query parameters:
 * - force=true: Force renewal even if watch hasn't expired
 * - setup=true: Initial setup (same as force)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  setupGmailWatch,
  renewWatchIfNeeded,
  checkWatchStatus,
  stopGmailWatch,
  isGmailPushConfigured,
} from "@/lib/gmail/watch";

/**
 * Renew or set up Gmail watch
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";
  const setup = url.searchParams.get("setup") === "true";

  // Check if Pub/Sub is configured
  if (!isGmailPushConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "Gmail push notifications not configured. Set GMAIL_PUBSUB_TOPIC environment variable.",
      },
      { status: 400 }
    );
  }

  try {
    // For initial setup or forced renewal
    if (force || setup) {
      console.log("[RenewWatch] Force/setup renewal requested");
      const result = await setupGmailWatch();

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        action: "renewed",
        expiration: result.expiration?.toISOString(),
        historyId: result.historyId,
      });
    }

    // Normal renewal - only if needed
    const result = await renewWatchIfNeeded(false);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.expiration ? "renewed" : "skipped",
      expiration: result.expiration?.toISOString(),
    });
  } catch (error) {
    console.error("[RenewWatch] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Check watch status
 */
export async function GET() {
  if (!isGmailPushConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "Set GMAIL_PUBSUB_TOPIC environment variable to enable push notifications",
    });
  }

  const status = await checkWatchStatus();

  return NextResponse.json({
    configured: true,
    active: status.active,
    expiration: status.expiration?.toISOString() || null,
    needsRenewal: status.needsRenewal,
  });
}

/**
 * Stop watching (disable push notifications)
 */
export async function DELETE() {
  const result = await stopGmailWatch();

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Gmail watch stopped. Push notifications disabled.",
  });
}

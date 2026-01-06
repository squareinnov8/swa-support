/**
 * Gmail Monitor Polling Endpoint
 *
 * Triggers the Gmail monitoring service.
 * Can be called by:
 * - Vercel Cron (vercel.json cron config)
 * - External cron service
 * - Manual trigger from admin UI
 */

import { NextRequest, NextResponse } from "next/server";
import { runGmailMonitor, getMonitorStatus } from "@/lib/gmail";
import { isGmailConfigured } from "@/lib/import/gmail/auth";

// Cron secret for verification (optional)
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET - Get monitor status
 */
export async function GET() {
  try {
    const status = await getMonitorStatus();
    return NextResponse.json({
      configured: isGmailConfigured(),
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST - Trigger polling run
 *
 * Headers:
 * - Authorization: Bearer <CRON_SECRET> (optional, for cron jobs)
 *
 * Query params:
 * - force=true - Run even if recently polled
 */
export async function POST(request: NextRequest) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    if (providedSecret !== CRON_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  // Check if Gmail is configured
  if (!isGmailConfigured()) {
    return NextResponse.json(
      {
        error: "Gmail not configured",
        hint: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI",
      },
      { status: 503 }
    );
  }

  try {
    // Check if we should skip (rate limiting)
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";

    if (!force) {
      const status = await getMonitorStatus();

      // Skip if last sync was within 30 seconds (prevent double-triggering)
      if (status.lastSyncAt) {
        const lastSync = new Date(status.lastSyncAt);
        const secondsSinceSync = (Date.now() - lastSync.getTime()) / 1000;

        if (secondsSinceSync < 30) {
          return NextResponse.json({
            skipped: true,
            reason: `Last sync was ${Math.round(secondsSinceSync)}s ago`,
            lastSyncAt: status.lastSyncAt,
          });
        }
      }

      // Skip if too many consecutive errors (backoff)
      if (status.errorCount >= 5) {
        return NextResponse.json(
          {
            skipped: true,
            reason: `Too many consecutive errors (${status.errorCount})`,
            lastError: status.lastError,
            hint: "Check Gmail configuration and resolve the issue, then reset error count",
          },
          { status: 503 }
        );
      }
    }

    // Run the monitor
    const result = await runGmailMonitor();

    return NextResponse.json({
      success: result.success,
      runId: result.runId,
      stats: {
        threadsChecked: result.threadsChecked,
        newMessagesFound: result.newMessagesFound,
        draftsGenerated: result.draftsGenerated,
        ticketsCreated: result.ticketsCreated,
        ticketsUpdated: result.ticketsUpdated,
        escalations: result.escalations,
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error("Gmail monitor error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

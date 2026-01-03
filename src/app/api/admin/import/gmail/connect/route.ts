/**
 * Gmail OAuth Connect
 *
 * GET: Get OAuth authorization URL
 */

import { NextRequest, NextResponse } from "next/server";
import { isGmailConfigured, getAuthorizationUrl } from "@/lib/import/gmail";

export async function GET(request: NextRequest) {
  try {
    if (!isGmailConfigured()) {
      return NextResponse.json(
        { error: "Gmail OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI" },
        { status: 500 }
      );
    }

    // Generate state for CSRF protection
    const state = crypto.randomUUID();

    const authUrl = getAuthorizationUrl(state);

    return NextResponse.json({
      authUrl,
      state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate auth URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

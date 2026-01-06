/**
 * Gmail Setup API
 *
 * Handles OAuth flow and token storage for autonomous Gmail monitoring.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  isGmailConfigured,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserEmail,
} from "@/lib/import/gmail/auth";
import { storeGmailTokens, getMonitorStatus } from "@/lib/gmail";
import { supabase } from "@/lib/db";

/**
 * GET - Get setup status or start OAuth flow
 *
 * Query params:
 * - action=auth - Start OAuth flow (returns redirect URL)
 * - status=true - Get current setup status
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  // Check configuration
  if (!isGmailConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        error: "Gmail OAuth not configured",
        hint: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI",
      },
      { status: 503 }
    );
  }

  // Return status
  if (searchParams.get("status") === "true") {
    const status = await getMonitorStatus();

    // Check if we have a refresh token stored
    const { data: syncState } = await supabase
      .from("gmail_sync_state")
      .select("refresh_token, email_address")
      .eq("email_address", "support@squarewheelsauto.com")
      .single();

    return NextResponse.json({
      configured: true,
      hasRefreshToken: !!syncState?.refresh_token,
      monitorStatus: status,
    });
  }

  // Start OAuth flow
  if (action === "auth") {
    const state = crypto.randomUUID();

    // Store state for verification
    const cookieStore = await cookies();
    cookieStore.set("gmail_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 600, // 10 minutes
      sameSite: "lax",
    });

    const authUrl = getAuthorizationUrl(state);

    return NextResponse.json({
      authUrl,
      state,
    });
  }

  return NextResponse.json(
    { error: "Invalid action. Use ?action=auth or ?status=true" },
    { status: 400 }
  );
}

/**
 * POST - Complete OAuth flow and store tokens
 *
 * Body:
 * - code: OAuth authorization code
 * - state: OAuth state for verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, state } = body;

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    // Verify state if provided
    if (state) {
      const cookieStore = await cookies();
      const storedState = cookieStore.get("gmail_oauth_state")?.value;

      if (state !== storedState) {
        return NextResponse.json(
          { error: "Invalid OAuth state" },
          { status: 400 }
        );
      }

      // Clear state cookie
      cookieStore.delete("gmail_oauth_state");
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return NextResponse.json(
        {
          error: "No refresh token received",
          hint: "Make sure to request offline access and consent",
        },
        { status: 400 }
      );
    }

    // Get user email to verify it's the support account
    const email = await getUserEmail(tokens);

    if (!email) {
      return NextResponse.json(
        { error: "Could not get user email" },
        { status: 500 }
      );
    }

    // For security, only allow the support email
    if (email !== "support@squarewheelsauto.com") {
      return NextResponse.json(
        {
          error: "Wrong account",
          message: `Please authenticate with support@squarewheelsauto.com (got ${email})`,
        },
        { status: 403 }
      );
    }

    // Store refresh token for persistent access
    await storeGmailTokens(email, tokens.refresh_token);

    return NextResponse.json({
      success: true,
      email,
      message: "Gmail monitoring is now configured. The agent will automatically poll for new messages.",
    });
  } catch (error) {
    console.error("Gmail setup error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Disable Gmail monitoring
 */
export async function DELETE() {
  await supabase
    .from("gmail_sync_state")
    .update({
      sync_enabled: false,
      refresh_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("email_address", "support@squarewheelsauto.com");

  return NextResponse.json({
    success: true,
    message: "Gmail monitoring disabled",
  });
}

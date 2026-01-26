/**
 * API endpoint to fetch Gmail attachments for display in admin UI
 *
 * GET /api/admin/attachments?messageId=xxx&attachmentId=yyy
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";

const SUPPORT_EMAIL = "support@squarewheelsauto.com";

/**
 * Get valid Gmail tokens for fetching attachments
 */
async function getGmailTokens(): Promise<GmailTokens> {
  const { data: syncState, error } = await supabase
    .from("gmail_sync_state")
    .select("refresh_token")
    .eq("email_address", SUPPORT_EMAIL)
    .single();

  if (error || !syncState?.refresh_token) {
    throw new Error("Gmail not configured");
  }

  const tokens: GmailTokens = {
    access_token: "",
    refresh_token: syncState.refresh_token,
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    token_type: "Bearer",
    expiry_date: 0,
  };

  return refreshTokenIfNeeded(tokens);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const messageId = searchParams.get("messageId");
  const attachmentId = searchParams.get("attachmentId");

  if (!messageId || !attachmentId) {
    return NextResponse.json(
      { error: "Missing messageId or attachmentId" },
      { status: 400 }
    );
  }

  try {
    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    if (!response.data.data) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 }
      );
    }

    // Gmail API returns base64url encoded data
    const base64 = response.data.data.replace(/-/g, "+").replace(/_/g, "/");
    const buffer = Buffer.from(base64, "base64");

    // Return the image with appropriate content type
    // Default to jpeg if we can't determine the type
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("[Attachments API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attachment" },
      { status: 500 }
    );
  }
}

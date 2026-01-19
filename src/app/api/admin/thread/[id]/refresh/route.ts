/**
 * Thread Refresh API
 *
 * Syncs Gmail messages for a thread. Called automatically when loading a thread detail page.
 * Does NOT reprocess existing messages - only syncs new messages from Gmail.
 *
 * Note: Reprocessing was removed to prevent duplicate messages being created.
 * If you need to regenerate a draft, use the dedicated regenerate endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";
import { fetchThread } from "@/lib/import/gmail/fetcher";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threadId } = await params;

    // Fetch the thread
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("id, gmail_thread_id, external_thread_id, subject, channel, state, human_handling_mode")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    let newMessagesCount = 0;

    // If thread has a Gmail thread ID, sync messages from Gmail
    if (thread.gmail_thread_id) {
      const syncResult = await syncGmailMessages(thread.gmail_thread_id, threadId);
      newMessagesCount = syncResult.newMessages;
    }

    // Note: We no longer automatically reprocess the thread to avoid creating duplicate messages.
    // The sync above will bring in any new Gmail messages.
    // If the user needs to regenerate a draft, they should use the explicit regenerate action.

    return NextResponse.json({
      success: true,
      newMessages: newMessagesCount,
      reprocessed: false,
      message: newMessagesCount > 0
        ? `Synced ${newMessagesCount} new message(s) from Gmail`
        : "No new messages",
    });
  } catch (error) {
    console.error("Thread refresh error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * Sync messages from Gmail thread to our database
 */
async function syncGmailMessages(
  gmailThreadId: string,
  threadId: string
): Promise<{ newMessages: number }> {
  let newMessages = 0;

  try {
    // Get Gmail sync state for tokens
    const { data: syncState, error: stateError } = await supabase
      .from("gmail_sync_state")
      .select("refresh_token")
      .eq("email_address", "support@squarewheelsauto.com")
      .single();

    if (stateError || !syncState?.refresh_token) {
      console.warn("[Refresh] Gmail not configured - skipping sync");
      return { newMessages: 0 };
    }

    // Get fresh tokens
    const tokens: GmailTokens = {
      access_token: "",
      refresh_token: syncState.refresh_token,
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      token_type: "Bearer",
      expiry_date: 0,
    };

    const freshTokens = await refreshTokenIfNeeded(tokens);

    // Fetch the Gmail thread
    const gmailThread = await fetchThread(freshTokens, gmailThreadId);
    if (!gmailThread || gmailThread.messages.length === 0) {
      return { newMessages: 0 };
    }

    // Sync each message that doesn't exist yet
    for (const gmailMsg of gmailThread.messages) {
      // Check if message already exists
      const { data: existing } = await supabase
        .from("messages")
        .select("id")
        .eq("channel_metadata->>gmail_message_id", gmailMsg.id)
        .maybeSingle();

      if (existing) {
        continue;
      }

      // Insert the message
      const direction = gmailMsg.isIncoming ? "inbound" : "outbound";

      const { error } = await supabase.from("messages").insert({
        thread_id: threadId,
        direction,
        from_email: gmailMsg.from,
        to_email: gmailMsg.to[0] || null,
        body_text: gmailMsg.body,
        channel: "email",
        channel_metadata: {
          gmail_thread_id: gmailMsg.threadId,
          gmail_message_id: gmailMsg.id,
          gmail_date: gmailMsg.date.toISOString(),
          synced_from_gmail: true,
        },
        created_at: gmailMsg.date.toISOString(),
      });

      if (!error) {
        newMessages++;
        console.log(`[Refresh] Synced ${direction} message ${gmailMsg.id}`);
      }
    }

    if (newMessages > 0) {
      // Update thread updated_at
      await supabase
        .from("threads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", threadId);
    }

    return { newMessages };
  } catch (error) {
    console.error("[Refresh] Gmail sync error:", error);
    return { newMessages: 0 };
  }
}

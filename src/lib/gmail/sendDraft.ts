/**
 * Send Approved Draft
 *
 * Sends approved drafts to customers via Gmail API.
 * Properly threads replies in existing Gmail conversations.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";
import { markDraftAsSent } from "@/lib/llm/draftGenerator";

const SUPPORT_EMAIL = "support@squarewheelsauto.com";

/**
 * Get valid Gmail tokens for sending
 */
async function getGmailTokens(): Promise<GmailTokens> {
  const { data: syncState, error } = await supabase
    .from("gmail_sync_state")
    .select("refresh_token")
    .eq("email_address", SUPPORT_EMAIL)
    .single();

  if (error || !syncState?.refresh_token) {
    throw new Error("Gmail not configured. No refresh token found for support@squarewheelsauto.com");
  }

  const tokens: GmailTokens = {
    access_token: "",
    refresh_token: syncState.refresh_token,
    scope: "https://www.googleapis.com/auth/gmail.send",
    token_type: "Bearer",
    expiry_date: 0,
  };

  return refreshTokenIfNeeded(tokens);
}

/**
 * Convert plain text to simple HTML
 */
function textToHtml(text: string): string {
  // Escape HTML entities
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Convert line breaks to <br> and wrap in basic HTML
  const withBreaks = escaped.replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
  <div>${withBreaks}</div>
</body>
</html>`;
}

/**
 * Encode email content as base64url for Gmail API
 */
function encodeEmail(params: {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  const headers = [
    `From: SquareWheels Support <${params.from}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: <${params.inReplyTo}>`);
  }
  if (params.references) {
    headers.push(`References: ${params.references}`);
  }

  const email = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.textBody).toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.htmlBody).toString("base64"),
    `--${boundary}--`,
  ].join("\r\n");

  // Convert to base64url encoding
  return Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Get thread info including Gmail thread ID and customer email
 */
async function getThreadInfo(threadId: string): Promise<{
  gmailThreadId: string | null;
  customerEmail: string | null;
  subject: string | null;
}> {
  const { data: thread, error } = await supabase
    .from("threads")
    .select("gmail_thread_id, subject")
    .eq("id", threadId)
    .single();

  if (error || !thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  // Get customer email from the first inbound message
  const { data: message } = await supabase
    .from("messages")
    .select("from_email")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  return {
    gmailThreadId: thread.gmail_thread_id,
    customerEmail: message?.from_email || null,
    subject: thread.subject,
  };
}

/**
 * Get the latest inbound message's Gmail message ID for reply headers
 */
async function getLatestInboundMessageId(threadId: string): Promise<string | null> {
  const { data: message } = await supabase
    .from("messages")
    .select("channel_metadata")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!message?.channel_metadata) {
    return null;
  }

  const metadata = message.channel_metadata as { gmail_message_id?: string };
  return metadata.gmail_message_id || null;
}

/**
 * Get all message IDs in thread for References header
 */
async function getAllMessageIds(threadId: string): Promise<string[]> {
  const { data: messages } = await supabase
    .from("messages")
    .select("channel_metadata")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (!messages) return [];

  return messages
    .map((m) => {
      const metadata = m.channel_metadata as { gmail_message_id?: string } | null;
      return metadata?.gmail_message_id;
    })
    .filter((id): id is string => Boolean(id));
}

/**
 * Send an approved draft as a Gmail reply
 */
export async function sendApprovedDraft(params: {
  threadId: string;
  draftText: string;
  draftGenerationId?: string;
  wasEdited?: boolean;
  editDistance?: number;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  error?: string;
}> {
  const { threadId, draftText, draftGenerationId, wasEdited, editDistance } = params;

  try {
    // 1. Get thread info
    const threadInfo = await getThreadInfo(threadId);

    if (!threadInfo.gmailThreadId) {
      return {
        success: false,
        error: "Thread does not have a Gmail thread ID. Cannot send via Gmail.",
      };
    }

    if (!threadInfo.customerEmail) {
      return {
        success: false,
        error: "Could not find customer email address for this thread.",
      };
    }

    // 2. Get message IDs for threading headers
    const latestMessageId = await getLatestInboundMessageId(threadId);
    const allMessageIds = await getAllMessageIds(threadId);

    // 3. Build email
    const subject = threadInfo.subject?.startsWith("Re:")
      ? threadInfo.subject
      : `Re: ${threadInfo.subject || "Your SquareWheels Order"}`;

    const htmlBody = textToHtml(draftText);

    const rawEmail = encodeEmail({
      to: threadInfo.customerEmail,
      from: SUPPORT_EMAIL,
      subject,
      textBody: draftText,
      htmlBody,
      inReplyTo: latestMessageId || undefined,
      references: allMessageIds.length > 0
        ? allMessageIds.map((id) => `<${id}>`).join(" ")
        : undefined,
    });

    // 4. Send via Gmail API
    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawEmail,
        threadId: threadInfo.gmailThreadId,
      },
    });

    const gmailMessageId = response.data.id;
    if (!gmailMessageId) {
      throw new Error("Gmail API did not return a message ID");
    }

    // 5. Insert outbound message to database
    const { error: messageError } = await supabase.from("messages").insert({
      thread_id: threadId,
      direction: "outbound",
      from_email: SUPPORT_EMAIL,
      to_email: threadInfo.customerEmail,
      subject,
      body_text: draftText,
      body_html: htmlBody,
      channel: "email",
      channel_metadata: {
        gmail_thread_id: threadInfo.gmailThreadId,
        gmail_message_id: gmailMessageId,
        sent_by_agent: true,
        draft_generation_id: draftGenerationId,
      },
    });

    if (messageError) {
      console.error("[SendDraft] Failed to insert message record:", messageError);
      // Don't fail - email was sent successfully
    }

    // 6. Mark draft as sent
    if (draftGenerationId) {
      await markDraftAsSent(draftGenerationId, wasEdited || false, editDistance);
    }

    // 7. Update thread state to AWAITING_INFO (waiting for customer response)
    const { error: threadError } = await supabase
      .from("threads")
      .update({
        state: "AWAITING_INFO",
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    if (threadError) {
      console.error("[SendDraft] Failed to update thread state:", threadError);
    }

    // 8. Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      type: "draft_sent",
      payload: {
        draft_generation_id: draftGenerationId,
        gmail_message_id: gmailMessageId,
        to_email: threadInfo.customerEmail,
        was_edited: wasEdited || false,
      },
    });

    console.log(`[SendDraft] Sent draft for thread ${threadId} to ${threadInfo.customerEmail}`);

    return {
      success: true,
      gmailMessageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[SendDraft] Failed to send draft:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if a thread can send via Gmail (has gmail_thread_id)
 */
export async function canSendViaGmail(threadId: string): Promise<boolean> {
  const { data: thread } = await supabase
    .from("threads")
    .select("gmail_thread_id")
    .eq("id", threadId)
    .single();

  return Boolean(thread?.gmail_thread_id);
}

/**
 * Check if Gmail is configured for sending
 */
export function isGmailSendConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
}

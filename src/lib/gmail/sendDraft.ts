/**
 * Send Approved Draft
 *
 * Sends approved drafts to customers via Gmail API.
 * Properly threads replies in existing Gmail conversations.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";
import { markDraftAsSent } from "@/lib/llm/draftGenerator";
import { addActivityNote, isHubSpotConfigured, updateTicketStage } from "@/lib/hubspot";

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
 * Attachment data for email encoding
 */
type EmailAttachment = {
  filename: string;
  mimeType: string;
  data: Buffer;
};

/**
 * Encode email content as base64url for Gmail API
 * Supports optional attachments
 */
function encodeEmail(params: {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
  attachments?: EmailAttachment[];
}): string {
  const hasAttachments = params.attachments && params.attachments.length > 0;
  const outerBoundary = `boundary_outer_${Date.now()}`;
  const innerBoundary = `boundary_inner_${Date.now()}`;

  const headers = [
    `From: SquareWheels Support <${params.from}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
  ];

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: <${params.inReplyTo}>`);
  }
  if (params.references) {
    headers.push(`References: ${params.references}`);
  }

  if (hasAttachments) {
    // Multipart/mixed for attachments
    headers.push(`Content-Type: multipart/mixed; boundary="${outerBoundary}"`);

    const emailParts = [
      headers.join("\r\n"),
      "",
      `--${outerBoundary}`,
      `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
      "",
      `--${innerBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(params.textBody).toString("base64"),
      `--${innerBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(params.htmlBody).toString("base64"),
      `--${innerBoundary}--`,
    ];

    // Add attachments
    for (const att of params.attachments!) {
      emailParts.push(
        `--${outerBoundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        "Content-Transfer-Encoding: base64",
        "",
        att.data.toString("base64")
      );
    }

    emailParts.push(`--${outerBoundary}--`);

    return Buffer.from(emailParts.join("\r\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } else {
    // Simple multipart/alternative without attachments
    headers.push(`Content-Type: multipart/alternative; boundary="${outerBoundary}"`);

    const email = [
      headers.join("\r\n"),
      "",
      `--${outerBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(params.textBody).toString("base64"),
      `--${outerBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(params.htmlBody).toString("base64"),
      `--${outerBoundary}--`,
    ].join("\r\n");

    return Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
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
 * Fetch attachment data from Gmail
 */
async function fetchGmailAttachment(
  gmail: ReturnType<typeof createGmailClient>,
  gmailMessageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  try {
    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: gmailMessageId,
      id: attachmentId,
    });

    if (!response.data.data) {
      return null;
    }

    // Gmail API returns base64url encoded data
    const base64 = response.data.data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64");
  } catch (error) {
    console.error(`[SendDraft] Failed to fetch attachment ${attachmentId}:`, error);
    return null;
  }
}

/**
 * Send an approved draft as a Gmail reply
 * Supports attachments and recipient override for vendor forwards
 */
export async function sendApprovedDraft(params: {
  threadId: string;
  draftText: string;
  draftGenerationId?: string;
  draftMessageId?: string; // Optional: message ID of the draft to look up metadata
  wasEdited?: boolean;
  editDistance?: number;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  error?: string;
}> {
  const { threadId, draftText, draftGenerationId, draftMessageId, wasEdited, editDistance } = params;

  try {
    // 1. Get thread info
    const threadInfo = await getThreadInfo(threadId);

    if (!threadInfo.gmailThreadId) {
      return {
        success: false,
        error: "Thread does not have a Gmail thread ID. Cannot send via Gmail.",
      };
    }

    // 2. Check for draft metadata (attachments, recipient override)
    let recipientOverride: string | undefined;
    let forwardAttachments: {
      gmail_message_id: string;
      attachments: Array<{ id: string; filename: string; mimeType: string; size: number }>;
    } | undefined;

    if (draftMessageId) {
      const { data: draftMessage } = await supabase
        .from("messages")
        .select("channel_metadata")
        .eq("id", draftMessageId)
        .single();

      if (draftMessage?.channel_metadata) {
        const meta = draftMessage.channel_metadata as {
          recipient_override?: string;
          forward_attachments?: typeof forwardAttachments;
        };
        recipientOverride = meta.recipient_override;
        forwardAttachments = meta.forward_attachments;
      }
    }

    // Determine recipient: override (for vendor) or customer email
    const toEmail = recipientOverride || threadInfo.customerEmail;
    if (!toEmail) {
      return {
        success: false,
        error: "Could not determine recipient email address.",
      };
    }

    // 3. Get Gmail client and fetch attachments if needed
    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    const emailAttachments: EmailAttachment[] = [];
    if (forwardAttachments && forwardAttachments.attachments.length > 0) {
      console.log(`[SendDraft] Fetching ${forwardAttachments.attachments.length} attachments...`);

      for (const att of forwardAttachments.attachments) {
        const data = await fetchGmailAttachment(gmail, forwardAttachments.gmail_message_id, att.id);
        if (data) {
          emailAttachments.push({
            filename: att.filename,
            mimeType: att.mimeType,
            data,
          });
          console.log(`[SendDraft] Fetched attachment: ${att.filename}`);
        }
      }
    }

    // 4. Get message IDs for threading headers
    const latestMessageId = await getLatestInboundMessageId(threadId);
    const allMessageIds = await getAllMessageIds(threadId);

    // 5. Build email
    const subject = threadInfo.subject?.startsWith("Re:")
      ? threadInfo.subject
      : `Re: ${threadInfo.subject || "Your SquareWheels Order"}`;

    const htmlBody = textToHtml(draftText);

    const rawEmail = encodeEmail({
      to: toEmail,
      from: SUPPORT_EMAIL,
      subject,
      textBody: draftText,
      htmlBody,
      inReplyTo: latestMessageId || undefined,
      references: allMessageIds.length > 0
        ? allMessageIds.map((id) => `<${id}>`).join(" ")
        : undefined,
      attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    });

    // 6. Send via Gmail API

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

    // 7. Insert outbound message to database
    const { error: messageError } = await supabase.from("messages").insert({
      thread_id: threadId,
      direction: "outbound",
      from_email: SUPPORT_EMAIL,
      to_email: toEmail,
      subject,
      body_text: draftText,
      body_html: htmlBody,
      channel: "email",
      channel_metadata: {
        gmail_thread_id: threadInfo.gmailThreadId,
        gmail_message_id: gmailMessageId,
        sent_by_agent: true,
        draft_generation_id: draftGenerationId,
        recipient_override: recipientOverride || undefined,
        attachment_count: emailAttachments.length,
      },
    });

    if (messageError) {
      console.error("[SendDraft] Failed to insert message record:", messageError);
      // Don't fail - email was sent successfully
    }

    // 8. Mark draft as sent
    if (draftGenerationId) {
      await markDraftAsSent(draftGenerationId, wasEdited || false, editDistance);
    }

    // 9. Update thread state to AWAITING_INFO (waiting for customer response)
    // Only update if sending to customer, not for vendor forwards
    if (!recipientOverride) {
      const sentAt = new Date().toISOString();
      const { error: threadError } = await supabase
        .from("threads")
        .update({
          state: "AWAITING_INFO",
          updated_at: sentAt,
          last_message_at: sentAt,
        })
        .eq("id", threadId);

      if (threadError) {
        console.error("[SendDraft] Failed to update thread state:", threadError);
      }
    }

    // 10. Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      type: "draft_sent",
      payload: {
        draft_generation_id: draftGenerationId,
        gmail_message_id: gmailMessageId,
        to_email: toEmail,
        was_edited: wasEdited || false,
        is_vendor_forward: !!recipientOverride,
        attachment_count: emailAttachments.length,
      },
    });

    const attachmentNote = emailAttachments.length > 0 ? ` with ${emailAttachments.length} attachment(s)` : "";
    console.log(`[SendDraft] Sent draft for thread ${threadId} to ${toEmail}${attachmentNote}`);

    // 11. Sync to HubSpot
    if (isHubSpotConfigured()) {
      // Add outbound message note
      addActivityNote(threadId, {
        type: "message",
        direction: "outbound",
        from: "lina@squarewheelsauto.com",
        body: draftText.slice(0, 1000),
      }).catch((err) => console.error("[HubSpot] Outbound note failed:", err));

      // Update ticket stage to "Waiting on contact" if sending to customer (not vendor)
      if (!recipientOverride) {
        updateTicketStage(threadId, "AWAITING_INFO").catch((err) =>
          console.error("[HubSpot] Stage update failed:", err)
        );
      }
    }

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

/**
 * Send a new email to a customer (not a reply to existing thread)
 * Used for vendor request outreach, proactive notifications, etc.
 */
export async function sendEmailToCustomer(params: {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
  error?: string;
}> {
  const { to, subject, body, replyTo } = params;

  try {
    const htmlBody = textToHtml(body);

    const rawEmail = encodeEmail({
      to,
      from: SUPPORT_EMAIL,
      subject,
      textBody: body,
      htmlBody,
    });

    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawEmail,
      },
    });

    const gmailMessageId = response.data.id;
    const gmailThreadId = response.data.threadId;

    if (!gmailMessageId) {
      throw new Error("Gmail API did not return a message ID");
    }

    console.log(`[SendEmail] Sent email to ${to}: ${subject}`);

    return {
      success: true,
      gmailMessageId,
      gmailThreadId: gmailThreadId || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[SendEmail] Failed to send email:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

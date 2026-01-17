/**
 * Escalation Email Sender
 *
 * Sends escalation emails to Rob via Gmail API.
 * Tracks sent emails in the database for response handling.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";
import type { EscalationEmailContent } from "@/lib/collaboration/types";
import { generateEscalationEmailHtml } from "./emailGenerator";

const ROB_EMAIL = "rob@squarewheelsauto.com";
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
    access_token: "", // Will be refreshed
    refresh_token: syncState.refresh_token,
    scope: "https://www.googleapis.com/auth/gmail.send",
    token_type: "Bearer",
    expiry_date: 0, // Force refresh
  };

  return refreshTokenIfNeeded(tokens);
}

/**
 * Encode email content as base64url for Gmail API
 */
function encodeEmail(params: {
  to: string;
  from: string;
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  const headers = [
    `From: Lina (Support Agent) <${params.from}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`);
  }
  if (params.references) {
    headers.push(`References: ${params.references}`);
  }

  const email = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.htmlBody).toString("base64"),
    `--${boundary}--`,
  ].join("\r\n");

  // Convert to base64url encoding (replace + with -, / with _, remove =)
  return Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an escalation email to Rob
 *
 * @returns The Gmail message ID for tracking responses
 */
export async function sendEscalationEmail(
  threadId: string,
  content: EscalationEmailContent,
  gmailThreadId?: string
): Promise<{ messageId: string; gmailMessageId: string }> {
  // Get Gmail API client
  const tokens = await getGmailTokens();
  const gmail = createGmailClient(tokens);

  // Generate HTML body
  const htmlBody = generateEscalationEmailHtml(content);

  // Build email
  const rawEmail = encodeEmail({
    to: ROB_EMAIL,
    from: SUPPORT_EMAIL,
    subject: content.subject,
    htmlBody,
    threadId: gmailThreadId,
  });

  // Send via Gmail API
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: rawEmail,
      threadId: gmailThreadId, // Continue existing thread if available
    },
  });

  const gmailMessageId = response.data.id;
  if (!gmailMessageId) {
    throw new Error("Gmail API did not return a message ID");
  }

  // Track in database
  const { data: emailRecord, error } = await supabase
    .from("escalation_emails")
    .insert({
      thread_id: threadId,
      sent_to: ROB_EMAIL,
      subject: content.subject,
      html_body: htmlBody,
      customer_profile: content.customerProfile,
      gmail_message_id: gmailMessageId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save escalation email record:", error);
    // Don't throw - email was sent successfully
  }

  console.log(`[Escalation] Sent email for thread ${threadId} to ${ROB_EMAIL}`);

  return {
    messageId: emailRecord?.id || "",
    gmailMessageId,
  };
}

/**
 * Check if we should send an escalation email for this thread
 * (Avoids duplicate emails for the same escalation)
 */
export async function shouldSendEscalationEmail(threadId: string): Promise<boolean> {
  // Check if we've already sent an escalation email for this thread recently (within 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: recentEmail } = await supabase
    .from("escalation_emails")
    .select("id")
    .eq("thread_id", threadId)
    .gte("sent_at", oneDayAgo)
    .limit(1)
    .maybeSingle();

  return !recentEmail;
}

/**
 * Check if Gmail is configured for sending
 */
export function isGmailSendConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

const SUPPORT_ESCALATION_LABEL = "support-escalation";

/**
 * Find or create the support-escalation Gmail label
 */
async function getOrCreateEscalationLabel(
  gmail: ReturnType<typeof createGmailClient>
): Promise<string> {
  // List all labels
  const labelsResponse = await gmail.users.labels.list({ userId: "me" });
  const labels = labelsResponse.data.labels || [];

  // Check if label exists
  const existingLabel = labels.find(
    (l) => l.name?.toLowerCase() === SUPPORT_ESCALATION_LABEL.toLowerCase()
  );
  if (existingLabel?.id) {
    return existingLabel.id;
  }

  // Create the label
  const createResponse = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: SUPPORT_ESCALATION_LABEL,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
      color: {
        backgroundColor: "#fb4c2f", // Red background
        textColor: "#ffffff",
      },
    },
  });

  if (!createResponse.data.id) {
    throw new Error("Failed to create escalation label");
  }

  console.log(`[Escalation] Created Gmail label: ${SUPPORT_ESCALATION_LABEL}`);
  return createResponse.data.id;
}

/**
 * Apply the support-escalation label to a Gmail thread
 */
export async function applyEscalationLabel(
  gmailThreadId: string
): Promise<boolean> {
  try {
    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    // Get or create the escalation label
    const labelId = await getOrCreateEscalationLabel(gmail);

    // Get all messages in the thread
    const threadResponse = await gmail.users.threads.get({
      userId: "me",
      id: gmailThreadId,
    });

    const messages = threadResponse.data.messages || [];

    // Apply label to all messages in the thread
    for (const message of messages) {
      if (message.id) {
        await gmail.users.messages.modify({
          userId: "me",
          id: message.id,
          requestBody: {
            addLabelIds: [labelId],
          },
        });
      }
    }

    console.log(
      `[Escalation] Applied ${SUPPORT_ESCALATION_LABEL} label to thread ${gmailThreadId} (${messages.length} messages)`
    );
    return true;
  } catch (error) {
    console.error(`[Escalation] Failed to apply label:`, error);
    return false;
  }
}

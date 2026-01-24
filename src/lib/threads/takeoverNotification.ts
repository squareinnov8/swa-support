/**
 * Takeover Notification
 *
 * Sends email notifications when Lina takes over a thread
 * that was stuck in HUMAN_HANDLING for too long.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";

const ROB_EMAIL = "rob@squarewheelsauto.com";
const SUPPORT_EMAIL = "support@squarewheelsauto.com";
const ADMIN_URL = process.env.NEXT_PUBLIC_APP_URL || "https://support-agent-v2.vercel.app";

export type TakeoverNotificationParams = {
  threadId: string;
  subject: string;
  customerEmail: string;
  previousHandler: string;
  handlingStartedAt: string;
  timeoutHours: number;
};

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
 * Encode email content as base64url for Gmail API
 */
function encodeEmail(params: {
  to: string;
  from: string;
  subject: string;
  htmlBody: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  const headers = [
    `From: Lina (Support Agent) <${params.from}>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

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

  return Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate HTML content for the notification email
 */
function generateNotificationHtml(params: TakeoverNotificationParams): string {
  const threadUrl = `${ADMIN_URL}/admin/thread/${params.threadId}`;
  const handlingStarted = new Date(params.handlingStartedAt);
  const hoursAgo = Math.round(
    (Date.now() - handlingStarted.getTime()) / (1000 * 60 * 60)
  );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #f8f4f0;
      border-left: 4px solid #e07800;
      padding: 16px;
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .header h2 {
      margin: 0 0 8px 0;
      color: #e07800;
    }
    .info-box {
      background: #f9f9f9;
      padding: 16px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .info-row {
      margin-bottom: 8px;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .btn {
      display: inline-block;
      background: #e07800;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 500;
    }
    .btn:hover {
      background: #c56700;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>⚠️ Lina Taking Over Ticket</h2>
    <p>A ticket in HUMAN_HANDLING has timed out after ${params.timeoutHours} hours.</p>
  </div>

  <div class="info-box">
    <div class="info-row">
      <span class="info-label">Subject:</span> ${escapeHtml(params.subject)}
    </div>
    <div class="info-row">
      <span class="info-label">Customer:</span> ${escapeHtml(params.customerEmail)}
    </div>
    <div class="info-row">
      <span class="info-label">Previous Handler:</span> ${escapeHtml(params.previousHandler)}
    </div>
    <div class="info-row">
      <span class="info-label">In HUMAN_HANDLING since:</span> ${handlingStarted.toLocaleString()} (${hoursAgo} hours ago)
    </div>
  </div>

  <p>
    I've generated a draft response with an apology for the delay. The ticket has been
    moved back to <strong>IN_PROGRESS</strong> status and is ready for review.
  </p>

  <p style="margin-top: 24px;">
    <a href="${threadUrl}" class="btn">View Ticket &rarr;</a>
  </p>

  <div class="footer">
    <p>
      This notification was sent automatically because the ticket was in HUMAN_HANDLING
      for more than ${params.timeoutHours} hours without resolution.
    </p>
    <p>– Lina (Support Agent)</p>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Send a notification email to Rob when Lina takes over a stale thread
 */
export async function sendTakeoverNotification(
  params: TakeoverNotificationParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Check if Gmail is configured
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log("[TakeoverNotification] Gmail not configured, skipping notification");
      return { success: false, error: "Gmail not configured" };
    }

    // Get Gmail tokens
    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    // Generate email content
    const htmlBody = generateNotificationHtml(params);
    const subject = `[Lina Takeover] ${params.subject}`;

    // Encode email
    const rawEmail = encodeEmail({
      to: ROB_EMAIL,
      from: SUPPORT_EMAIL,
      subject,
      htmlBody,
    });

    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawEmail,
      },
    });

    const messageId = response.data.id;
    if (!messageId) {
      throw new Error("Gmail API did not return a message ID");
    }

    console.log(`[TakeoverNotification] Sent notification to ${ROB_EMAIL} for thread ${params.threadId}`);

    // Log the notification in events
    await supabase.from("events").insert({
      thread_id: params.threadId,
      type: "TAKEOVER_NOTIFICATION_SENT",
      payload: {
        sent_to: ROB_EMAIL,
        gmail_message_id: messageId,
        timeout_hours: params.timeoutHours,
      },
    });

    return { success: true, messageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[TakeoverNotification] Failed to send notification:", err);
    return { success: false, error: errorMessage };
  }
}

/**
 * Check if Gmail is configured for sending notifications
 */
export function isNotificationConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
}

/**
 * Forward Order to Vendor
 *
 * Forwards Shopify order confirmation emails to vendors via Gmail API.
 * Preserves original HTML formatting when available.
 */

import { supabase } from "@/lib/db";
import {
  createGmailClient,
  refreshTokenIfNeeded,
  type GmailTokens,
} from "@/lib/import/gmail/auth";
import type { gmail_v1 } from "googleapis";

const SUPPORT_EMAIL = "support@squarewheelsauto.com";

/**
 * Extract HTML body from a Gmail message
 */
function extractHtmlBody(payload: gmail_v1.Schema$MessagePart): string | null {
  // Check if this part is HTML
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }

  // Recursively check parts (for multipart messages)
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = extractHtmlBody(part);
      if (html) return html;
    }
  }

  return null;
}

/**
 * Fetch original email HTML from Gmail
 */
export async function fetchOriginalEmailHtml(
  gmailMessageId: string
): Promise<string | null> {
  try {
    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    const message = await gmail.users.messages.get({
      userId: "me",
      id: gmailMessageId,
      format: "full",
    });

    if (!message.data.payload) {
      return null;
    }

    return extractHtmlBody(message.data.payload);
  } catch (error) {
    console.error("[ForwardOrder] Failed to fetch original email:", error);
    return null;
  }
}

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
    throw new Error(
      "Gmail not configured. No refresh token found for support@squarewheelsauto.com"
    );
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
 * Encode forwarded email as base64url for Gmail API
 * If originalHtmlBody is provided, uses it directly to preserve Shopify formatting
 */
function encodeForwardedEmail(params: {
  to: string[];
  from: string;
  subject: string;
  originalBody: string;
  originalHtmlBody?: string | null;
  originalFrom: string;
  originalDate: string;
  originalSubject: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  // Build forward header
  const forwardHeader = [
    "---------- Forwarded message ----------",
    `From: ${params.originalFrom}`,
    `Date: ${params.originalDate}`,
    `Subject: ${params.originalSubject}`,
    "",
  ].join("\n");

  const forwardBody = forwardHeader + params.originalBody;

  // If we have the original HTML, wrap it with forward header
  // Otherwise, convert plain text to basic HTML
  let htmlBody: string;
  if (params.originalHtmlBody) {
    // Inject forward header into the original HTML
    const forwardHeaderHtml = `
      <div style="padding: 10px 0; margin-bottom: 20px; border-bottom: 1px solid #ccc; font-family: Arial, sans-serif; font-size: 12px; color: #666;">
        <strong>---------- Forwarded message ----------</strong><br>
        From: ${params.originalFrom}<br>
        Date: ${params.originalDate}<br>
        Subject: ${params.originalSubject}
      </div>
    `;
    // Insert forward header at the start of body content
    htmlBody = params.originalHtmlBody.replace(
      /<body[^>]*>/i,
      (match) => `${match}${forwardHeaderHtml}`
    );
    // If no body tag found, wrap it
    if (!htmlBody.includes(forwardHeaderHtml)) {
      htmlBody = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${forwardHeaderHtml}${params.originalHtmlBody}</body></html>`;
    }
  } else {
    // Fallback: convert plain text to HTML
    htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
  <div>${forwardBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")}</div>
</body>
</html>`;
  }

  const headers = [
    `From: SquareWheels Orders <${params.from}>`,
    `To: ${params.to.join(", ")}`,
    `Subject: Fwd: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const email = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(forwardBody).toString("base64"),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(htmlBody).toString("base64"),
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
 * Forward an order email to vendor(s)
 * If gmailMessageId is provided, fetches and preserves the original HTML formatting
 */
export async function forwardOrderToVendor(params: {
  vendorEmails: string[];
  orderNumber: string;
  originalSubject: string;
  originalBody: string;
  originalFrom: string;
  originalDate: string;
  gmailMessageId?: string;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  gmailThreadId?: string;
  error?: string;
}> {
  const {
    vendorEmails,
    orderNumber,
    originalSubject,
    originalBody,
    originalFrom,
    originalDate,
    gmailMessageId: originalMessageId,
  } = params;

  if (vendorEmails.length === 0) {
    return {
      success: false,
      error: "No vendor emails provided",
    };
  }

  try {
    // Fetch original HTML if we have the message ID
    let originalHtmlBody: string | null = null;
    if (originalMessageId) {
      originalHtmlBody = await fetchOriginalEmailHtml(originalMessageId);
      if (originalHtmlBody) {
        console.log(`[ForwardOrder] Using original HTML formatting for order #${orderNumber}`);
      }
    }

    const rawEmail = encodeForwardedEmail({
      to: vendorEmails,
      from: SUPPORT_EMAIL,
      subject: originalSubject,
      originalBody,
      originalHtmlBody,
      originalFrom,
      originalDate,
      originalSubject,
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

    console.log(
      `[ForwardOrder] Forwarded order #${orderNumber} to ${vendorEmails.join(", ")}`
    );

    return {
      success: true,
      gmailMessageId,
      gmailThreadId: gmailThreadId || undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ForwardOrder] Failed to forward order:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Reply to a vendor thread (e.g., to forward customer response)
 * Supports optional attachments (photos, documents, etc.)
 */
export async function replyToVendorThread(params: {
  vendorEmails: string[];
  vendorThreadId: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  attachments?: Array<{ filename: string; content: Buffer; mimeType: string }>;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  error?: string;
}> {
  const { vendorEmails, vendorThreadId, subject, body, inReplyToMessageId, attachments } =
    params;

  try {
    const boundary = `boundary_${Date.now()}`;
    const hasAttachments = attachments && attachments.length > 0;

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.5; color: #333;">
  <div>${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")}</div>
</body>
</html>`;

    // Use multipart/mixed when we have attachments, multipart/alternative otherwise
    const contentType = hasAttachments
      ? `multipart/mixed; boundary="${boundary}"`
      : `multipart/alternative; boundary="${boundary}"`;

    const headers = [
      `From: SquareWheels Support <${SUPPORT_EMAIL}>`,
      `To: ${vendorEmails.join(", ")}`,
      `Subject: Re: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}`,
    ];

    if (inReplyToMessageId) {
      headers.push(`In-Reply-To: <${inReplyToMessageId}>`);
      headers.push(`References: <${inReplyToMessageId}>`);
    }

    // Build email parts
    const emailParts: string[] = [headers.join("\r\n"), ""];

    if (hasAttachments) {
      // With attachments: nested multipart/alternative for text/html, then attachments
      const altBoundary = `alt_${Date.now()}`;

      emailParts.push(
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        "",
        `--${altBoundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(body).toString("base64"),
        `--${altBoundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(htmlBody).toString("base64"),
        `--${altBoundary}--`
      );

      // Add each attachment
      for (const att of attachments!) {
        emailParts.push(
          `--${boundary}`,
          `Content-Type: ${att.mimeType}; name="${att.filename}"`,
          `Content-Disposition: attachment; filename="${att.filename}"`,
          "Content-Transfer-Encoding: base64",
          "",
          att.content.toString("base64")
        );
      }

      emailParts.push(`--${boundary}--`);
    } else {
      // No attachments: simple multipart/alternative
      emailParts.push(
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(body).toString("base64"),
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(htmlBody).toString("base64"),
        `--${boundary}--`
      );
    }

    const email = emailParts.join("\r\n");

    const rawEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const tokens = await getGmailTokens();
    const gmail = createGmailClient(tokens);

    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: rawEmail,
        threadId: vendorThreadId,
      },
    });

    const gmailMessageId = response.data.id;
    if (!gmailMessageId) {
      throw new Error("Gmail API did not return a message ID");
    }

    if (hasAttachments) {
      console.log(`[ReplyToVendor] Sent reply with ${attachments!.length} attachment(s)`);
    }

    return {
      success: true,
      gmailMessageId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("[ReplyToVendor] Failed to reply:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

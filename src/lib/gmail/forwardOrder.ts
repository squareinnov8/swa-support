/**
 * Forward Order to Vendor
 *
 * Forwards Shopify order confirmation emails to vendors via Gmail API.
 */

import { supabase } from "@/lib/db";
import {
  createGmailClient,
  refreshTokenIfNeeded,
  type GmailTokens,
} from "@/lib/import/gmail/auth";

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
 */
function encodeForwardedEmail(params: {
  to: string[];
  from: string;
  subject: string;
  originalBody: string;
  originalFrom: string;
  originalDate: string;
  originalSubject: string;
}): string {
  const boundary = `boundary_${Date.now()}`;

  // Build forward body
  const forwardHeader = [
    "---------- Forwarded message ----------",
    `From: ${params.originalFrom}`,
    `Date: ${params.originalDate}`,
    `Subject: ${params.originalSubject}`,
    "",
  ].join("\n");

  const forwardBody = forwardHeader + params.originalBody;

  // Convert plain text to HTML
  const htmlBody = `<!DOCTYPE html>
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
 */
export async function forwardOrderToVendor(params: {
  vendorEmails: string[];
  orderNumber: string;
  originalSubject: string;
  originalBody: string;
  originalFrom: string;
  originalDate: string;
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
  } = params;

  if (vendorEmails.length === 0) {
    return {
      success: false,
      error: "No vendor emails provided",
    };
  }

  try {
    const rawEmail = encodeForwardedEmail({
      to: vendorEmails,
      from: SUPPORT_EMAIL,
      subject: originalSubject,
      originalBody,
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
 */
export async function replyToVendorThread(params: {
  vendorEmails: string[];
  vendorThreadId: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
}): Promise<{
  success: boolean;
  gmailMessageId?: string;
  error?: string;
}> {
  const { vendorEmails, vendorThreadId, subject, body, inReplyToMessageId } =
    params;

  try {
    const boundary = `boundary_${Date.now()}`;

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

    const headers = [
      `From: SquareWheels Support <${SUPPORT_EMAIL}>`,
      `To: ${vendorEmails.join(", ")}`,
      `Subject: Re: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];

    if (inReplyToMessageId) {
      headers.push(`In-Reply-To: <${inReplyToMessageId}>`);
      headers.push(`References: <${inReplyToMessageId}>`);
    }

    const email = [
      headers.join("\r\n"),
      "",
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
      `--${boundary}--`,
    ].join("\r\n");

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

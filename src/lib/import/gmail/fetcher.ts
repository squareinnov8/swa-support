/**
 * Gmail Thread Fetcher
 *
 * Fetches threads and messages from Gmail for import.
 */

import { createGmailClient, type GmailTokens } from "./auth";
import type { gmail_v1 } from "googleapis";

/**
 * Gmail thread summary (for selection UI)
 */
export type GmailThreadSummary = {
  threadId: string;
  subject: string;
  snippet: string;
  messageCount: number;
  labels: string[];
  lastMessageDate: Date;
  participants: string[];
};

/**
 * Gmail attachment metadata and content
 */
export type GmailAttachment = {
  id: string; // Gmail attachment ID for downloading
  filename: string;
  mimeType: string;
  size: number;
  // Content is loaded on-demand via downloadAttachment()
  // For inline processing, extracted text is stored here
  extractedText?: string;
};

/**
 * Gmail message content
 */
export type GmailMessage = {
  id: string;
  threadId: string;
  date: Date;
  from: string;
  to: string[];
  subject: string;
  body: string;        // Plain text (or stripped HTML if no plain text)
  bodyHtml?: string;   // Original HTML content (preserved for rendering)
  isIncoming: boolean; // Customer message vs support response
  attachments: GmailAttachment[]; // Attachments (may be empty)
};

/**
 * Full thread with messages
 */
export type GmailThread = {
  threadId: string;
  subject: string;
  messages: GmailMessage[];
  labels: string[];
};

/**
 * Search options for listing threads
 */
export type GmailSearchOptions = {
  query?: string; // Gmail search query
  labels?: string[]; // Filter by labels
  after?: Date; // Messages after this date
  before?: Date; // Messages before this date
  maxResults?: number;
  pageToken?: string;
};

/**
 * List threads matching search criteria
 */
export async function listThreads(
  tokens: GmailTokens,
  options: GmailSearchOptions = {}
): Promise<{ threads: GmailThreadSummary[]; nextPageToken?: string }> {
  const gmail = createGmailClient(tokens);

  // Build search query
  const queryParts: string[] = [];

  if (options.query) {
    queryParts.push(options.query);
  }
  if (options.labels && options.labels.length > 0) {
    queryParts.push(`label:${options.labels.join(" OR label:")}`);
  }
  if (options.after) {
    queryParts.push(`after:${formatDateForGmail(options.after)}`);
  }
  if (options.before) {
    queryParts.push(`before:${formatDateForGmail(options.before)}`);
  }

  const response = await gmail.users.threads.list({
    userId: "me",
    q: queryParts.join(" ") || undefined,
    maxResults: options.maxResults ?? 50,
    pageToken: options.pageToken,
  });

  const threads: GmailThreadSummary[] = [];

  if (response.data.threads) {
    for (const thread of response.data.threads) {
      if (!thread.id) continue;

      // Get thread details for summary
      const details = await gmail.users.threads.get({
        userId: "me",
        id: thread.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });

      const summary = extractThreadSummary(details.data);
      if (summary) {
        threads.push(summary);
      }
    }
  }

  return {
    threads,
    nextPageToken: response.data.nextPageToken ?? undefined,
  };
}

/**
 * Fetch a full thread with all messages
 */
export async function fetchThread(tokens: GmailTokens, threadId: string): Promise<GmailThread | null> {
  const gmail = createGmailClient(tokens);

  try {
    const response = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    if (!response.data.messages) {
      return null;
    }

    const messages = response.data.messages
      .map((msg) => extractMessage(msg))
      .filter((msg): msg is GmailMessage => msg !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (messages.length === 0) {
      return null;
    }

    return {
      threadId,
      subject: messages[0].subject,
      messages,
      labels: response.data.messages[0]?.labelIds ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Fetch multiple threads (with rate limiting)
 */
export async function fetchThreads(
  tokens: GmailTokens,
  threadIds: string[],
  options: { delayMs?: number; onProgress?: (current: number, total: number) => void } = {}
): Promise<GmailThread[]> {
  const { delayMs = 100, onProgress } = options;
  const threads: GmailThread[] = [];

  for (let i = 0; i < threadIds.length; i++) {
    const thread = await fetchThread(tokens, threadIds[i]);
    if (thread) {
      threads.push(thread);
    }

    onProgress?.(i + 1, threadIds.length);

    if (i < threadIds.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return threads;
}

/**
 * Get labels from Gmail account
 */
export async function getLabels(tokens: GmailTokens): Promise<Array<{ id: string; name: string }>> {
  const gmail = createGmailClient(tokens);

  const response = await gmail.users.labels.list({
    userId: "me",
  });

  return (
    response.data.labels
      ?.filter((label) => label.id && label.name)
      .map((label) => ({
        id: label.id!,
        name: label.name!,
      })) ?? []
  );
}

/**
 * Format thread as text for LLM processing
 */
export function formatThreadAsText(thread: GmailThread): string {
  const lines: string[] = [];

  lines.push(`Subject: ${thread.subject}`);
  lines.push("---");

  for (const msg of thread.messages) {
    const direction = msg.isIncoming ? "CUSTOMER" : "SUPPORT";
    lines.push(`[${direction}] From: ${msg.from}`);
    lines.push(`Date: ${msg.date.toISOString()}`);
    lines.push("");
    lines.push(msg.body);
    lines.push("");
    lines.push("---");
  }

  return lines.join("\n");
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Extract thread summary from API response
 */
function extractThreadSummary(thread: gmail_v1.Schema$Thread): GmailThreadSummary | null {
  if (!thread.id || !thread.messages || thread.messages.length === 0) {
    return null;
  }

  const firstMessage = thread.messages[0];
  const lastMessage = thread.messages[thread.messages.length - 1];
  const headers = firstMessage.payload?.headers ?? [];

  const subject = getHeader(headers, "Subject") ?? "(no subject)";
  const participants = new Set<string>();

  for (const msg of thread.messages) {
    const msgHeaders = msg.payload?.headers ?? [];
    const from = getHeader(msgHeaders, "From");
    const to = getHeader(msgHeaders, "To");

    if (from) participants.add(extractEmail(from));
    if (to) {
      to.split(",").forEach((addr) => participants.add(extractEmail(addr.trim())));
    }
  }

  const dateStr = getHeader(lastMessage.payload?.headers ?? [], "Date");
  const lastMessageDate = dateStr ? new Date(dateStr) : new Date();

  return {
    threadId: thread.id,
    subject,
    snippet: thread.snippet ?? "",
    messageCount: thread.messages.length,
    labels: firstMessage.labelIds ?? [],
    lastMessageDate,
    participants: Array.from(participants),
  };
}

/**
 * Extract message content from API response
 */
function extractMessage(message: gmail_v1.Schema$Message): GmailMessage | null {
  if (!message.id || !message.threadId || !message.payload) {
    return null;
  }

  const headers = message.payload.headers ?? [];
  const from = getHeader(headers, "From") ?? "";
  const to = getHeader(headers, "To") ?? "";
  const subject = getHeader(headers, "Subject") ?? "";
  const dateStr = getHeader(headers, "Date");

  // Extract body and attachments
  let body = "";
  let bodyHtml: string | undefined;
  let attachments: GmailAttachment[] = [];

  if (message.payload.body?.data) {
    // Simple message with body directly in payload
    const content = decodeBase64(message.payload.body.data);
    // Check if it's HTML
    if (message.payload.mimeType === "text/html") {
      bodyHtml = content;
      body = stripHtml(content);
    } else {
      body = content;
    }
  } else if (message.payload.parts) {
    const extraction = extractBodyFromParts(message.payload.parts, message.id);
    body = extraction.body;
    bodyHtml = extraction.bodyHtml;
    attachments = extraction.attachments;
  }

  // Clean up body
  body = cleanEmailBody(body);

  // Determine if incoming (customer) or outgoing (support)
  // Check if sent FROM the support email address
  const fromEmail = extractEmail(from).toLowerCase();
  const supportEmail = (process.env.SUPPORT_EMAIL || "support@squarewheelsauto.com").toLowerCase();
  const isIncoming = fromEmail !== supportEmail;

  return {
    id: message.id,
    threadId: message.threadId,
    date: dateStr ? new Date(dateStr) : new Date(),
    from: extractEmail(from),
    to: to.split(",").map((addr) => extractEmail(addr.trim())),
    subject,
    body,
    bodyHtml,
    isIncoming,
    attachments,
  };
}

/**
 * Result from extracting body and attachments from message parts
 */
type BodyExtractionResult = {
  body: string;           // Plain text content (or stripped HTML)
  bodyHtml?: string;      // Original HTML content (preserved)
  attachments: GmailAttachment[];
};

/**
 * Extract body and attachments from message parts (handles multipart messages)
 */
function extractBodyFromParts(
  parts: gmail_v1.Schema$MessagePart[],
  messageId: string
): BodyExtractionResult {
  let body = "";
  let bodyHtml: string | undefined;
  const attachments: GmailAttachment[] = [];

  // First pass: collect attachments and find text/html content
  for (const part of parts) {
    // Check if this part is an attachment
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
      });
      continue;
    }

    // Capture plain text for body
    if (part.mimeType === "text/plain" && part.body?.data && !body) {
      body = decodeBase64(part.body.data);
    }

    // Capture HTML content (preserve it for rendering)
    if (part.mimeType === "text/html" && part.body?.data && !bodyHtml) {
      bodyHtml = decodeBase64(part.body.data);
    }
  }

  // If no plain text, create body from HTML
  if (!body && bodyHtml) {
    body = stripHtml(bodyHtml);
  }

  // Check nested parts (multipart/alternative, multipart/mixed, etc.)
  for (const part of parts) {
    if (part.parts) {
      const nested = extractBodyFromParts(part.parts, messageId);
      if (!body && nested.body) {
        body = nested.body;
      }
      if (!bodyHtml && nested.bodyHtml) {
        bodyHtml = nested.bodyHtml;
      }
      // Collect attachments from nested parts
      attachments.push(...nested.attachments);
    }
  }

  return { body, bodyHtml, attachments };
}

/**
 * Decode base64url encoded string
 */
function decodeBase64(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Get header value by name
 */
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string | undefined {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

/**
 * Extract email address from "Name <email>" format
 */
function extractEmail(address: string): string {
  const match = address.match(/<([^>]+)>/);
  return match ? match[1] : address;
}

/**
 * Strip HTML tags
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean up email body
 */
function cleanEmailBody(body: string): string {
  return (
    body
      // Remove quoted replies
      .replace(/^>.*$/gm, "")
      // Remove "On ... wrote:" lines
      .replace(/^On .+ wrote:$/gm, "")
      // Remove excessive whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Format date for Gmail search query
 */
function formatDateForGmail(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Download attachment content from Gmail
 * Returns the raw base64-decoded data as a Buffer
 */
export async function downloadAttachment(
  tokens: GmailTokens,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
  const gmail = createGmailClient(tokens);

  try {
    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    if (!response.data.data) {
      return null;
    }

    // Gmail API returns base64url encoded data
    const base64 = response.data.data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64");
  } catch (err) {
    console.error("Failed to download attachment:", err);
    return null;
  }
}

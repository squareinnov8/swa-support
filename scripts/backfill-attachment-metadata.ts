/**
 * Backfill attachment metadata for existing messages
 *
 * Finds messages with attachments (attachment_count > 0) that don't have
 * the detailed attachment metadata, fetches it from Gmail, and updates
 * the channel_metadata.
 *
 * Usage: npx tsx scripts/backfill-attachment-metadata.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUPPORT_EMAIL = "support@squarewheelsauto.com";

type ChannelMetadata = {
  gmail_message_id?: string;
  gmail_thread_id?: string;
  attachment_count?: number;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  [key: string]: unknown;
};

type GmailTokens = {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
};

/**
 * Refresh Gmail access token
 */
async function refreshToken(refreshToken: string): Promise<GmailTokens> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    access_token: credentials.access_token!,
    refresh_token: refreshToken,
    scope: credentials.scope || "",
    token_type: credentials.token_type || "Bearer",
    expiry_date: credentials.expiry_date || 0,
  };
}

/**
 * Get Gmail client with valid tokens
 */
async function getGmailClient() {
  // Get refresh token from database
  const { data: syncState, error } = await supabase
    .from("gmail_sync_state")
    .select("refresh_token")
    .eq("email_address", SUPPORT_EMAIL)
    .single();

  if (error || !syncState?.refresh_token) {
    throw new Error("Gmail not configured - no refresh token found");
  }

  // Refresh the access token
  const tokens = await refreshToken(syncState.refresh_token);

  // Create Gmail client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(tokens);

  return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Fetch attachment metadata from a Gmail message
 */
async function fetchAttachmentMetadata(
  gmail: ReturnType<typeof google.gmail>,
  messageId: string
): Promise<Array<{ id: string; filename: string; mimeType: string; size: number }> | null> {
  try {
    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const parts = response.data.payload?.parts || [];
    const attachments: Array<{ id: string; filename: string; mimeType: string; size: number }> = [];

    // Recursively find attachments in message parts
    function findAttachments(messageParts: typeof parts) {
      for (const part of messageParts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType || "application/octet-stream",
            size: part.body.size || 0,
          });
        }
        // Check nested parts (for multipart messages)
        if (part.parts) {
          findAttachments(part.parts);
        }
      }
    }

    findAttachments(parts);

    return attachments.length > 0 ? attachments : null;
  } catch (error) {
    console.error(`Failed to fetch message ${messageId}:`, error);
    return null;
  }
}

async function main() {
  console.log("Starting attachment metadata backfill...\n");

  // Get Gmail client
  const gmail = await getGmailClient();
  console.log("Gmail client initialized\n");

  // Find messages with attachments but no attachment metadata
  // We look for messages where:
  // 1. attachment_count > 0, OR
  // 2. The body contains [image or attachment references
  // 3. synced_from_gmail messages (might have missed attachments)
  // AND attachments array is missing
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, body_text, channel_metadata")
    .not("channel_metadata", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch messages:", error);
    process.exit(1);
  }

  // Filter to messages that need backfill
  const needsBackfill = messages?.filter((m) => {
    const meta = m.channel_metadata as ChannelMetadata | null;
    if (!meta?.gmail_message_id) return false;

    // Already has attachments array - skip
    if (meta.attachments && meta.attachments.length > 0) {
      return false;
    }

    // Has attachment_count but no attachments array
    if (meta.attachment_count && meta.attachment_count > 0) {
      return true;
    }

    // Check if body contains attachment placeholders like [image0.jpeg]
    const body = m.body_text || "";
    if (/\[image\d*\.(jpeg|jpg|png|gif)\]/i.test(body)) {
      return true;
    }

    // Synced messages might have attachments we didn't capture
    if (meta.synced_from_gmail === true) {
      return true;
    }

    return false;
  }) || [];

  console.log(`Found ${needsBackfill.length} messages needing attachment metadata backfill\n`);

  if (needsBackfill.length === 0) {
    console.log("No messages need backfill. Done!");
    return;
  }

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (const message of needsBackfill) {
    const meta = message.channel_metadata as ChannelMetadata;
    const gmailMessageId = meta.gmail_message_id!;
    const bodyPreview = (message.body_text || "").substring(0, 50);

    console.log(`Processing message ${message.id} (Gmail: ${gmailMessageId})...`);
    console.log(`  Body preview: ${bodyPreview}...`);

    // Fetch attachment metadata from Gmail
    const attachments = await fetchAttachmentMetadata(gmail, gmailMessageId);

    if (!attachments) {
      console.log(`  No attachments found or fetch failed, skipping`);
      skipped++;
      continue;
    }

    console.log(`  Found ${attachments.length} attachment(s):`);
    for (const att of attachments) {
      console.log(`    - ${att.filename} (${att.mimeType}, ${att.size} bytes)`);
    }

    // Update the message with attachment metadata
    const updatedMeta: ChannelMetadata = {
      ...meta,
      attachments,
    };

    const { error: updateError } = await supabase
      .from("messages")
      .update({ channel_metadata: updatedMeta })
      .eq("id", message.id);

    if (updateError) {
      console.log(`  Failed to update: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  Updated successfully`);
      updated++;
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log("\n--- Backfill Complete ---");
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

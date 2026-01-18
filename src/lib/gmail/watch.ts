/**
 * Gmail Push Notifications (Watch)
 *
 * Sets up Gmail API watch for real-time push notifications via Google Cloud Pub/Sub.
 * When a new email arrives, Gmail pushes a notification to our webhook instead of polling.
 *
 * Watch expires after 7 days and must be renewed.
 */

import { supabase } from "@/lib/db";
import { createGmailClient, refreshTokenIfNeeded, type GmailTokens } from "@/lib/import/gmail/auth";

const SUPPORT_EMAIL = "support@squarewheelsauto.com";

// Environment variables for Pub/Sub configuration
const PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC; // e.g., "projects/my-project/topics/gmail-notifications"

export type WatchResult = {
  success: boolean;
  historyId?: string;
  expiration?: Date;
  error?: string;
};

/**
 * Get Gmail tokens from database
 */
async function getGmailTokens(): Promise<GmailTokens | null> {
  const { data: syncState, error } = await supabase
    .from("gmail_sync_state")
    .select("refresh_token")
    .eq("email_address", SUPPORT_EMAIL)
    .single();

  if (error || !syncState?.refresh_token) {
    console.error("[GmailWatch] No refresh token found for", SUPPORT_EMAIL);
    return null;
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

/**
 * Set up Gmail push notifications watch
 *
 * This registers with Gmail to send push notifications to our Pub/Sub topic
 * when new messages arrive. The watch expires after 7 days.
 */
export async function setupGmailWatch(): Promise<WatchResult> {
  if (!PUBSUB_TOPIC) {
    return {
      success: false,
      error: "GMAIL_PUBSUB_TOPIC environment variable not configured",
    };
  }

  try {
    const tokens = await getGmailTokens();
    if (!tokens) {
      return {
        success: false,
        error: "Gmail not configured - no tokens available",
      };
    }

    const gmail = createGmailClient(tokens);

    // Set up watch on the user's inbox
    const response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName: PUBSUB_TOPIC,
        labelIds: ["INBOX"], // Watch inbox only
        labelFilterBehavior: "INCLUDE",
      },
    });

    const { historyId, expiration } = response.data;

    if (!historyId || !expiration) {
      return {
        success: false,
        error: "Gmail watch response missing historyId or expiration",
      };
    }

    // Convert expiration from milliseconds to Date
    const expirationDate = new Date(parseInt(expiration, 10));

    // Store watch info in database
    const { error: updateError } = await supabase
      .from("gmail_sync_state")
      .update({
        watch_expiration: expirationDate.toISOString(),
        pubsub_topic: PUBSUB_TOPIC,
        last_history_id: historyId, // Update history ID for incremental sync
        updated_at: new Date().toISOString(),
      })
      .eq("email_address", SUPPORT_EMAIL);

    if (updateError) {
      console.error("[GmailWatch] Failed to update sync state:", updateError);
      // Don't fail - watch was set up successfully
    }

    console.log(`[GmailWatch] Watch set up successfully, expires ${expirationDate.toISOString()}`);

    return {
      success: true,
      historyId,
      expiration: expirationDate,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[GmailWatch] Failed to set up watch:", errorMessage);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Stop the current Gmail watch
 */
export async function stopGmailWatch(): Promise<{ success: boolean; error?: string }> {
  try {
    const tokens = await getGmailTokens();
    if (!tokens) {
      return { success: false, error: "Gmail not configured" };
    }

    const gmail = createGmailClient(tokens);

    await gmail.users.stop({
      userId: "me",
    });

    // Clear watch info in database
    await supabase
      .from("gmail_sync_state")
      .update({
        watch_expiration: null,
        watch_resource_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("email_address", SUPPORT_EMAIL);

    console.log("[GmailWatch] Watch stopped successfully");

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[GmailWatch] Failed to stop watch:", errorMessage);

    return { success: false, error: errorMessage };
  }
}

/**
 * Check if watch needs renewal (expires within 2 days)
 */
export async function checkWatchStatus(): Promise<{
  active: boolean;
  expiration: Date | null;
  needsRenewal: boolean;
}> {
  const { data: syncState } = await supabase
    .from("gmail_sync_state")
    .select("watch_expiration, sync_enabled")
    .eq("email_address", SUPPORT_EMAIL)
    .single();

  if (!syncState?.watch_expiration || !syncState.sync_enabled) {
    return {
      active: false,
      expiration: null,
      needsRenewal: true,
    };
  }

  const expiration = new Date(syncState.watch_expiration);
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  return {
    active: expiration > now,
    expiration,
    needsRenewal: expiration < twoDaysFromNow,
  };
}

/**
 * Renew watch if needed (or force renewal)
 */
export async function renewWatchIfNeeded(force = false): Promise<WatchResult> {
  const status = await checkWatchStatus();

  if (!force && status.active && !status.needsRenewal) {
    console.log(`[GmailWatch] Watch still active until ${status.expiration?.toISOString()}, skipping renewal`);
    return {
      success: true,
      expiration: status.expiration || undefined,
    };
  }

  console.log(`[GmailWatch] ${force ? "Force" : "Auto"} renewing watch...`);
  return setupGmailWatch();
}

/**
 * Get the current history ID from database
 */
export async function getLastHistoryId(): Promise<string | null> {
  const { data: syncState } = await supabase
    .from("gmail_sync_state")
    .select("last_history_id")
    .eq("email_address", SUPPORT_EMAIL)
    .single();

  return syncState?.last_history_id || null;
}

/**
 * Update the history ID after processing
 */
export async function updateHistoryId(historyId: string): Promise<void> {
  await supabase
    .from("gmail_sync_state")
    .update({
      last_history_id: historyId,
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("email_address", SUPPORT_EMAIL);
}

/**
 * Check if Gmail push notifications are configured
 */
export function isGmailPushConfigured(): boolean {
  return Boolean(PUBSUB_TOPIC);
}

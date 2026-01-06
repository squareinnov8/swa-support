/**
 * EngageBay CRM Sync
 *
 * Syncs support interactions to EngageBay CRM.
 * Creates/updates contacts, adds notes for interactions, and manages tags.
 */

import {
  isEngageBayConfigured,
  upsertContact,
  addTagsToContactByEmail,
  addNoteToContact,
  getContactByEmail,
  updateContactScore,
} from "./client";
import { supabase } from "@/lib/db";
import type { Intent } from "@/lib/intents/taxonomy";
import type { SyncResult, EngageBayContact } from "./types";

// Tags to apply based on support status
const SUPPORT_TAGS = {
  new_support_request: "Support - Active",
  escalated: "Support - Escalated",
  resolved: "Support - Resolved",
  verified_customer: "Verified Customer",
  verified_shopify: "Shopify Customer",
  chargeback_risk: "Risk - Chargeback",
  flagged: "Risk - Flagged",
} as const;

// Intent to tag mapping
const INTENT_TAGS: Partial<Record<Intent, string>> = {
  RETURN_REFUND_REQUEST: "Interest - Returns",
  ORDER_STATUS: "Interest - Order Status",
  FIRMWARE_UPDATE_REQUEST: "Interest - Firmware",
  COMPATIBILITY_QUESTION: "Interest - Compatibility",
  INSTALL_GUIDANCE: "Interest - Installation",
  CHARGEBACK_THREAT: "Risk - Chargeback",
};

/**
 * Sync a support interaction to EngageBay
 *
 * Call this after processing a support request to:
 * 1. Create/update the contact in EngageBay
 * 2. Add interaction note
 * 3. Update tags based on intent and status
 */
export async function syncInteractionToCRM(params: {
  email: string;
  threadId: string;
  intent: Intent;
  customerName?: string;
  subject?: string;
  messageSnippet?: string;
  state: string;
  verificationStatus?: "verified" | "flagged" | "pending" | null;
  shopifyCustomerId?: string;
}): Promise<{ success: boolean; contactId?: number; error?: string }> {
  if (!isEngageBayConfigured()) {
    return { success: false, error: "EngageBay not configured" };
  }

  const {
    email,
    threadId,
    intent,
    customerName,
    subject,
    messageSnippet,
    state,
    verificationStatus,
    shopifyCustomerId,
  } = params;

  try {
    // 1. Collect tags to apply
    const tags: string[] = [SUPPORT_TAGS.new_support_request];

    // Add intent-based tag
    if (INTENT_TAGS[intent]) {
      tags.push(INTENT_TAGS[intent]!);
    }

    // Add state-based tags
    if (state === "ESCALATED") {
      tags.push(SUPPORT_TAGS.escalated);
    } else if (state === "RESOLVED") {
      // Remove active tag, add resolved
      const activeIdx = tags.indexOf(SUPPORT_TAGS.new_support_request);
      if (activeIdx > -1) tags.splice(activeIdx, 1);
      tags.push(SUPPORT_TAGS.resolved);
    }

    // Add verification tags
    if (verificationStatus === "verified") {
      tags.push(SUPPORT_TAGS.verified_customer);
      if (shopifyCustomerId) {
        tags.push(SUPPORT_TAGS.verified_shopify);
      }
    } else if (verificationStatus === "flagged") {
      tags.push(SUPPORT_TAGS.flagged);
    }

    if (intent === "CHARGEBACK_THREAT") {
      tags.push(SUPPORT_TAGS.chargeback_risk);
    }

    // 2. Upsert contact with tags
    const nameParts = customerName?.split(" ") ?? [];
    const firstName = nameParts[0] || email.split("@")[0];
    const lastName = nameParts.slice(1).join(" ") || undefined;

    const contactResult = await upsertContact({
      email,
      firstName,
      lastName,
      tags,
      customFields: shopifyCustomerId
        ? { shopify_customer_id: shopifyCustomerId }
        : undefined,
    });

    if (!contactResult.success || !contactResult.data?.id) {
      console.error("Failed to upsert contact:", contactResult.error);
      return { success: false, error: contactResult.error };
    }

    const contactId = contactResult.data.id;

    // 3. Add interaction note
    const noteSubject = `Support: ${subject || intent}`;
    const noteContent = buildInteractionNote({
      threadId,
      intent,
      state,
      messageSnippet,
      verificationStatus,
    });

    await addNoteToContact(contactId, noteSubject, noteContent);

    // 4. Increment engagement score
    await updateContactScore(email, 5);

    // 5. Record sync in database
    await recordCRMSync(threadId, email, contactId);

    return { success: true, contactId };
  } catch (error) {
    console.error("CRM sync failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build note content for interaction
 */
function buildInteractionNote(params: {
  threadId: string;
  intent: Intent;
  state: string;
  messageSnippet?: string;
  verificationStatus?: "verified" | "flagged" | "pending" | null;
}): string {
  const lines: string[] = [];

  lines.push(`**Intent:** ${params.intent}`);
  lines.push(`**Status:** ${params.state}`);

  if (params.verificationStatus) {
    lines.push(`**Verification:** ${params.verificationStatus}`);
  }

  lines.push(`**Thread ID:** ${params.threadId}`);
  lines.push(`**Time:** ${new Date().toISOString()}`);

  if (params.messageSnippet) {
    lines.push("");
    lines.push("**Customer Message:**");
    lines.push(params.messageSnippet.slice(0, 500));
  }

  return lines.join("\n");
}

/**
 * Record CRM sync in database for tracking
 */
async function recordCRMSync(
  threadId: string,
  email: string,
  engagebayContactId: number
): Promise<void> {
  // Update thread with CRM reference
  await supabase
    .from("threads")
    .update({
      crm_contact_id: engagebayContactId.toString(),
      crm_synced_at: new Date().toISOString(),
    })
    .eq("id", threadId);
}

/**
 * Sync resolved thread - updates tags to show completed support
 */
export async function syncThreadResolved(params: {
  email: string;
  threadId: string;
  resolutionSummary?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isEngageBayConfigured()) {
    return { success: false, error: "EngageBay not configured" };
  }

  const { email, threadId, resolutionSummary } = params;

  try {
    // Get contact
    const contactResult = await getContactByEmail(email);
    if (!contactResult.success || !contactResult.data?.id) {
      return { success: false, error: "Contact not found" };
    }

    const contactId = contactResult.data.id;

    // Add resolved tag
    await addTagsToContactByEmail(email, [SUPPORT_TAGS.resolved]);

    // Add resolution note
    if (resolutionSummary) {
      await addNoteToContact(
        contactId,
        `Support Resolved: Thread ${threadId.slice(0, 8)}`,
        `**Resolved:** ${new Date().toISOString()}\n\n${resolutionSummary}`
      );
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Bulk sync existing threads to CRM
 */
export async function bulkSyncThreadsToCRM(params: {
  limit?: number;
  sinceDate?: string;
}): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  if (!isEngageBayConfigured()) {
    result.errors.push("EngageBay not configured");
    return result;
  }

  const { limit = 100, sinceDate } = params;

  // Get threads that haven't been synced
  let query = supabase
    .from("threads")
    .select(
      `
      id,
      subject,
      state,
      last_intent,
      messages!inner (
        from_email,
        body_text,
        direction
      )
    `
    )
    .is("crm_contact_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sinceDate) {
    query = query.gte("created_at", sinceDate);
  }

  const { data: threads, error } = await query;

  if (error) {
    result.errors.push(`Database query failed: ${error.message}`);
    return result;
  }

  if (!threads || threads.length === 0) {
    return result;
  }

  for (const thread of threads) {
    // Get the first inbound message
    const inboundMessage = (thread.messages as { from_email: string; body_text: string; direction: string }[])
      ?.find((m) => m.direction === "inbound");

    if (!inboundMessage?.from_email) {
      result.failed++;
      continue;
    }

    const syncResult = await syncInteractionToCRM({
      email: inboundMessage.from_email,
      threadId: thread.id,
      intent: (thread.last_intent as Intent) || "UNKNOWN",
      subject: thread.subject,
      messageSnippet: inboundMessage.body_text?.slice(0, 200),
      state: thread.state || "NEW",
    });

    if (syncResult.success) {
      result.created++;
    } else {
      result.failed++;
      if (syncResult.error) {
        result.errors.push(`Thread ${thread.id}: ${syncResult.error}`);
      }
    }

    // Rate limit: wait 200ms between API calls
    await new Promise((r) => setTimeout(r, 200));
  }

  return result;
}

/**
 * Get CRM contact info for a thread
 */
export async function getCRMContactForThread(
  threadId: string
): Promise<{ contact: EngageBayContact | null; error?: string }> {
  if (!isEngageBayConfigured()) {
    return { contact: null, error: "EngageBay not configured" };
  }

  // Get thread's CRM reference
  const { data: thread } = await supabase
    .from("threads")
    .select("crm_contact_id")
    .eq("id", threadId)
    .single();

  if (!thread?.crm_contact_id) {
    return { contact: null };
  }

  const contactResult = await getContactByEmail(thread.crm_contact_id);

  if (!contactResult.success) {
    return { contact: null, error: contactResult.error };
  }

  return { contact: contactResult.data ?? null };
}

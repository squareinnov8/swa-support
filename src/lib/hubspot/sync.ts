/**
 * HubSpot CRM Sync
 *
 * Syncs support interactions to HubSpot CRM
 */

import {
  getContactByEmail,
  updateContact,
  addNoteToContact,
  isHubSpotConfigured,
} from "./client";
import type { HubSpotSyncInput, HubSpotSyncResult } from "./types";

/**
 * Generate a note body from support interaction data
 */
function generateNoteBody(input: HubSpotSyncInput): string {
  const lines = [
    `📩 **Support Interaction**`,
    ``,
    `**Thread ID:** ${input.threadId}`,
    `**Intent:** ${input.intent}`,
    input.subject ? `**Subject:** ${input.subject}` : null,
    input.state ? `**Status:** ${input.state}` : null,
    input.verificationStatus
      ? `**Verification:** ${input.verificationStatus}`
      : null,
    ``,
    input.messageSnippet
      ? `**Message Preview:**\n${input.messageSnippet}...`
      : null,
    ``,
    `---`,
    `_Logged by SWA Support Agent at ${new Date().toISOString()}_`,
  ];

  return lines.filter(Boolean).join("\n");
}

/**
 * Map intent to support status for contact property
 */
function mapIntentToStatus(intent: string): string {
  const activeIntents = [
    "ORDER_STATUS",
    "ORDER_CHANGE_REQUEST",
    "MISSING_DAMAGED_ITEM",
    "WRONG_ITEM_RECEIVED",
    "RETURN_REFUND_REQUEST",
  ];

  if (activeIntents.includes(intent)) {
    return "Active - Order Issue";
  }

  const technicalIntents = [
    "FIRMWARE_UPDATE_REQUEST",
    "FIRMWARE_ACCESS_ISSUE",
    "INSTALL_GUIDANCE",
    "FUNCTIONALITY_BUG",
  ];

  if (technicalIntents.includes(intent)) {
    return "Active - Technical Support";
  }

  return "Active - General Inquiry";
}

/**
 * Sync a support interaction to HubSpot
 *
 * This function:
 * 1. Finds the contact by email (should exist from email association)
 * 2. Updates support tracking properties
 * 3. Adds a note with interaction details
 */
export async function syncInteractionToHubSpot(
  input: HubSpotSyncInput
): Promise<HubSpotSyncResult> {
  if (!isHubSpotConfigured()) {
    return { success: false, error: "HubSpot not configured" };
  }

  try {
    // Find existing contact (HubSpot should have created this from email)
    const contact = await getContactByEmail(input.email);

    if (!contact) {
      // Contact doesn't exist - unusual since HubSpot tracks emails
      // Log this but don't fail - HubSpot may create the contact later
      console.warn(
        `HubSpot contact not found for ${input.email} - skipping sync`
      );
      return {
        success: true,
        error: "Contact not found in HubSpot - may be created later",
      };
    }

    // Try to update contact properties (may fail if token lacks contacts-write permission)
    try {
      const currentCount = parseInt(
        contact.properties.support_thread_count || "0",
        10
      );

      await updateContact(contact.id, {
        last_support_date: new Date().toISOString().split("T")[0],
        support_thread_count: String(currentCount + 1),
        support_status: mapIntentToStatus(input.intent),
        // Add customer name if we have it and contact doesn't
        ...(input.customerName && !contact.properties.firstname
          ? { firstname: input.customerName.split(" ")[0] }
          : {}),
      });
    } catch (updateError) {
      // Property update failed (likely permissions), continue with note creation
      console.warn(
        "HubSpot contact property update failed (may lack contacts-write permission):",
        updateError instanceof Error ? updateError.message : updateError
      );
    }

    // Add a note with the interaction details
    const noteBody = generateNoteBody(input);
    await addNoteToContact(contact.id, noteBody);

    return {
      success: true,
      contactId: contact.id,
      noteCreated: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("HubSpot sync failed:", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get customer context from HubSpot for use in agent responses
 */
export async function getHubSpotCustomerContext(
  email: string
): Promise<{
  found: boolean;
  name?: string;
  shopifyOrderCount?: number;
  shopifyTotalSpent?: string;
  recentSupportCount?: number;
} | null> {
  if (!isHubSpotConfigured()) {
    return null;
  }

  try {
    const contact = await getContactByEmail(email);

    if (!contact) {
      return { found: false };
    }

    return {
      found: true,
      name: [contact.properties.firstname, contact.properties.lastname]
        .filter(Boolean)
        .join(" "),
      shopifyOrderCount: contact.properties.ip__shopify__orders_count
        ? parseInt(contact.properties.ip__shopify__orders_count, 10)
        : undefined,
      shopifyTotalSpent: contact.properties.ip__shopify__total_spent,
      recentSupportCount: contact.properties.support_thread_count
        ? parseInt(contact.properties.support_thread_count, 10)
        : undefined,
    };
  } catch (error) {
    console.error("Error getting HubSpot customer context:", error);
    return null;
  }
}

export { isHubSpotConfigured };

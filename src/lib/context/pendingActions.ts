/**
 * Pending Actions
 *
 * Tracks what Lina is waiting for on each thread.
 * Helps Lina know when to take next steps automatically.
 */

import { supabase } from "@/lib/db";
import type { PendingAction, PendingActionType } from "./types";

/**
 * Set a pending action on a thread
 */
export async function setPendingAction(
  threadId: string,
  action: Omit<PendingAction, "createdAt"> & { createdAt?: Date }
): Promise<void> {
  const pendingAction: PendingAction = {
    ...action,
    createdAt: action.createdAt || new Date(),
  };

  const { error } = await supabase
    .from("threads")
    .update({ pending_action: pendingAction })
    .eq("id", threadId);

  if (error) {
    console.error("[PendingActions] Error setting pending action:", error);
    throw new Error(`Failed to set pending action: ${error.message}`);
  }

  console.log(`[PendingActions] Set pending action for thread ${threadId}: ${action.type}`);
}

/**
 * Clear the pending action on a thread
 */
export async function clearPendingAction(threadId: string): Promise<void> {
  const { error } = await supabase
    .from("threads")
    .update({ pending_action: null })
    .eq("id", threadId);

  if (error) {
    console.error("[PendingActions] Error clearing pending action:", error);
    throw new Error(`Failed to clear pending action: ${error.message}`);
  }

  console.log(`[PendingActions] Cleared pending action for thread ${threadId}`);
}

/**
 * Get the current pending action for a thread
 */
export async function getPendingAction(threadId: string): Promise<PendingAction | null> {
  const { data, error } = await supabase
    .from("threads")
    .select("pending_action")
    .eq("id", threadId)
    .single();

  if (error) {
    console.error("[PendingActions] Error getting pending action:", error);
    return null;
  }

  if (!data?.pending_action) {
    return null;
  }

  // Parse the JSONB field
  const action = data.pending_action as PendingAction;
  return {
    ...action,
    createdAt: new Date(action.createdAt),
  };
}

/**
 * Check if a thread has a specific pending action type
 */
export async function hasPendingAction(
  threadId: string,
  type: PendingActionType
): Promise<boolean> {
  const action = await getPendingAction(threadId);
  return action?.type === type;
}

/**
 * Create a pending action for awaiting vendor response
 */
export function createVendorResponseAction(
  vendorEmail: string,
  orderNumber?: string
): Omit<PendingAction, "createdAt"> {
  return {
    type: "awaiting_vendor_response",
    description: `Waiting for ${vendorEmail} to respond`,
    waitingFor: "vendor_response",
    metadata: {
      vendorEmail,
      ...(orderNumber && { orderNumber }),
    },
  };
}

/**
 * Create a pending action for awaiting customer photos
 */
export function createCustomerPhotosAction(
  customerEmail: string,
  requestType: string
): Omit<PendingAction, "createdAt"> {
  return {
    type: "awaiting_customer_photos",
    description: `Waiting for customer to send ${requestType}`,
    waitingFor: "customer_photos",
    metadata: {
      customerEmail,
      requestType,
    },
  };
}

/**
 * Create a pending action for awaiting customer confirmation
 */
export function createCustomerConfirmationAction(
  customerEmail: string,
  confirmationType: string
): Omit<PendingAction, "createdAt"> {
  return {
    type: "awaiting_customer_confirmation",
    description: `Waiting for customer to confirm ${confirmationType}`,
    waitingFor: "customer_confirmation",
    metadata: {
      customerEmail,
      confirmationType,
    },
  };
}

/**
 * Create a pending action for awaiting admin decision
 */
export function createAdminDecisionAction(
  reason: string
): Omit<PendingAction, "createdAt"> {
  return {
    type: "awaiting_admin_decision",
    description: `Escalated: ${reason}`,
    waitingFor: "admin_decision",
    metadata: {
      escalationReason: reason,
    },
  };
}

/**
 * Format pending action for display
 */
export function formatPendingActionForPrompt(action: PendingAction | null): string {
  if (!action) {
    return "";
  }

  const lines = [
    "## Pending Action",
    `Lina is currently waiting for: **${action.description}**`,
    `Type: ${action.type}`,
    `Since: ${action.createdAt.toLocaleString()}`,
  ];

  if (action.metadata) {
    lines.push("");
    lines.push("Details:");
    for (const [key, value] of Object.entries(action.metadata)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

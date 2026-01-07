/**
 * Customer Verification Types
 *
 * Types for verifying customers via Shopify before providing order support.
 */

import type { Intent } from "@/lib/intents/taxonomy";

/**
 * Intents that require customer verification before proceeding.
 * These are support requests that need proof of ownership/purchase.
 */
export const PROTECTED_INTENTS: Intent[] = [
  // Order related
  "ORDER_STATUS",
  "ORDER_CHANGE_REQUEST",
  "MISSING_DAMAGED_ITEM",
  "WRONG_ITEM_RECEIVED",
  "RETURN_REFUND_REQUEST",

  // Product support (post-purchase)
  "PRODUCT_SUPPORT",
  "FIRMWARE_UPDATE_REQUEST",
  "FIRMWARE_ACCESS_ISSUE",
  "INSTALL_GUIDANCE",
  "FUNCTIONALITY_BUG",
];

/**
 * Check if an intent requires customer verification
 */
export function isProtectedIntent(intent: string): boolean {
  return PROTECTED_INTENTS.includes(intent as Intent);
}

/**
 * Verification status outcomes
 */
export type VerificationStatus =
  | "verified" // Customer confirmed, no issues
  | "flagged" // Customer has negative flags (escalate)
  | "not_found" // No matching customer/order
  | "mismatch" // Email doesn't match order
  | "pending"; // Awaiting more info (no order # provided)

/**
 * Input for verification
 */
export type VerificationInput = {
  threadId: string;
  email?: string;
  orderNumber?: string;
  messageText?: string; // For extraction
};

/**
 * Customer info from Shopify
 */
export type VerifiedCustomer = {
  shopifyId: string;
  email: string;
  name: string;
  totalOrders: number;
  totalSpent: number;
};

/**
 * Tracking info from Shopify
 */
export type TrackingInfo = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

/**
 * Line item from order
 */
export type OrderLineItem = {
  title: string;
  quantity: number;
  sku: string | null;
};

/**
 * Order info from Shopify
 */
export type VerifiedOrder = {
  shopifyId: string;
  number: string;
  status: string;
  fulfillmentStatus: string;
  createdAt: string;
  // Rich fulfillment data for action-oriented responses
  tracking?: TrackingInfo[];
  lineItems?: OrderLineItem[];
  shippingCity?: string;
  shippingState?: string;
  shippingCountry?: string;
};

/**
 * Result from verification check
 */
export type VerificationResult = {
  status: VerificationStatus;
  flags: string[];
  customer?: VerifiedCustomer;
  order?: VerifiedOrder;
  message?: string; // Human-readable explanation
};

/**
 * Database record for customer_verifications table
 */
export type CustomerVerificationRecord = {
  id: string;
  thread_id: string;
  email: string | null;
  order_number: string | null;
  shopify_customer_id: string | null;
  shopify_order_id: string | null;
  status: VerificationStatus;
  flags: string[];
  customer_name: string | null;
  customer_email: string | null;
  total_orders: number | null;
  total_spent: number | null;
  created_at: string;
};

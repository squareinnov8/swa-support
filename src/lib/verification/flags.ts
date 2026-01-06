/**
 * Negative Flag Detection
 *
 * Check for flags that indicate a customer should be escalated.
 */

import type { ShopifyCustomer, ShopifyOrder } from "@/lib/shopify/types";

/**
 * Tags that indicate negative customer status.
 * Any match escalates to human review.
 */
const NEGATIVE_TAGS = [
  "chargeback",
  "fraud",
  "fraud_risk",
  "do_not_support",
  "abusive",
  "blocked",
  "banned",
  "dispute",
  "scam",
  "blacklist",
];

/**
 * Keywords in notes that indicate negative status.
 */
const NEGATIVE_NOTE_KEYWORDS = [
  "chargeback",
  "fraud",
  "abusive",
  "threatening",
  "do not support",
  "blacklist",
  "scam",
  "dispute",
  "banned",
];

/**
 * Check a customer and/or order for negative flags.
 * Returns array of matched flags (empty if clean).
 */
export function checkNegativeFlags(
  customer?: Pick<ShopifyCustomer, "tags" | "note"> | null,
  order?: Pick<ShopifyOrder, "tags" | "note"> | null
): string[] {
  const flags: string[] = [];

  // Check customer tags
  if (customer?.tags) {
    for (const tag of customer.tags) {
      const normalizedTag = tag.toLowerCase().trim();
      if (NEGATIVE_TAGS.some((neg) => normalizedTag.includes(neg))) {
        flags.push(`customer_tag:${tag}`);
      }
    }
  }

  // Check customer note
  if (customer?.note) {
    const lowerNote = customer.note.toLowerCase();
    for (const keyword of NEGATIVE_NOTE_KEYWORDS) {
      if (lowerNote.includes(keyword)) {
        flags.push(`customer_note:${keyword}`);
        break;
      }
    }
  }

  // Check order tags
  if (order?.tags) {
    for (const tag of order.tags) {
      const normalizedTag = tag.toLowerCase().trim();
      if (NEGATIVE_TAGS.some((neg) => normalizedTag.includes(neg))) {
        flags.push(`order_tag:${tag}`);
      }
    }
  }

  // Check order note
  if (order?.note) {
    const lowerNote = order.note.toLowerCase();
    for (const keyword of NEGATIVE_NOTE_KEYWORDS) {
      if (lowerNote.includes(keyword)) {
        flags.push(`order_note:${keyword}`);
        break;
      }
    }
  }

  return flags;
}

/**
 * Static Intent Reference
 *
 * These are the original static intents. They are now stored in the database
 * and can be managed dynamically. This array is kept for:
 * 1. Reference and documentation
 * 2. Seeding the database with initial intents
 * 3. Fallback regex-based classification
 */
export const INTENTS = [
  // Customer Support - Product Issues
  "PRODUCT_SUPPORT",           // General product troubleshooting (screen dead, audio issues, not working)
  "FIRMWARE_UPDATE_REQUEST",   // Requesting firmware files/access
  "FIRMWARE_ACCESS_ISSUE",     // Problems accessing/downloading firmware
  "DOCS_VIDEO_MISMATCH",       // Install docs don't match product
  "INSTALL_GUIDANCE",          // How-to install questions
  "FUNCTIONALITY_BUG",         // Product not working as expected
  "COMPATIBILITY_QUESTION",    // Will X work with my car?
  "PART_IDENTIFICATION",       // What part do I need?

  // Order Related
  "ORDER_STATUS",              // Where's my order? Tracking questions
  "ORDER_CHANGE_REQUEST",      // Cancel/modify order
  "MISSING_DAMAGED_ITEM",      // Item missing or arrived damaged
  "WRONG_ITEM_RECEIVED",       // Received incorrect product
  "RETURN_REFUND_REQUEST",     // Want to return/get refund

  // Escalation Triggers
  "CHARGEBACK_THREAT",         // Threatening chargeback
  "LEGAL_SAFETY_RISK",         // Legal threats or safety concerns

  // Low Priority / No Action
  "THANK_YOU_CLOSE",           // Customer saying thanks, closing thread
  "FOLLOW_UP_NO_NEW_INFO",     // Follow-up with no new information

  // Non-Customer
  "VENDOR_SPAM",               // Sales pitches, partnerships, vendor inquiries
  "AUTOMATED_EMAIL",           // Automated service emails (Google, Meta, TikTok, etc.)

  "UNKNOWN",
] as const;

/**
 * Intent type - now accepts any string to support dynamic intents from database.
 * The static INTENTS array values are still valid.
 */
export type Intent = string;

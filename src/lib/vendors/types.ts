/**
 * Vendor Types
 *
 * Types for vendor management and product routing.
 */

/**
 * Vendor record from Google Sheet or database cache
 */
export interface Vendor {
  id?: string;
  name: string;
  contactEmails: string[];
  productPatterns: string[]; // Product name patterns this vendor handles
  newOrderInstructions?: string;
  cancelInstructions?: string;
  escalationInstructions?: string;
  lastSyncedAt?: string;
}

/**
 * Vendor match result
 */
export interface VendorMatch {
  vendor: Vendor;
  matchedPattern: string;
  confidence: number; // 0.0 - 1.0
}

/**
 * Vendor database record (snake_case for Supabase)
 */
export interface VendorRecord {
  id: string;
  name: string;
  contact_emails: string[];
  product_patterns: string[];
  new_order_instructions?: string;
  cancel_instructions?: string;
  escalation_instructions?: string;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

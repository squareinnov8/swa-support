/**
 * Vendor Lookup
 *
 * Finds the appropriate vendor for a product based on product patterns.
 * Vendors are managed via the admin UI at /admin/vendors.
 */

import { supabase } from "@/lib/db";
import type { Vendor, VendorMatch, VendorRecord } from "./types";

/**
 * Get all vendors from database
 */
export async function getVendors(): Promise<Vendor[]> {
  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("*")
    .order("name");

  if (error) {
    console.error("[vendors/lookup] Failed to fetch vendors:", error.message);
    return [];
  }

  return (vendors || []).map(recordToVendor);
}

/**
 * Convert database record to Vendor type
 */
function recordToVendor(record: VendorRecord): Vendor {
  return {
    id: record.id,
    name: record.name,
    contactEmails: record.contact_emails || [],
    productPatterns: record.product_patterns || [],
    newOrderInstructions: record.new_order_instructions,
    cancelInstructions: record.cancel_instructions,
    escalationInstructions: record.escalation_instructions,
  };
}

/**
 * Check if a pattern matches a product title
 * Uses word-based matching: all words in the pattern must appear in the product
 * This handles cases like "Hawkeye Tail Lights" matching "Hawkeye Animated Tail Lights"
 */
function patternMatches(productTitle: string, pattern: string): boolean {
  const productWords = productTitle.toLowerCase().split(/\s+/);
  const patternWords = pattern.toLowerCase().split(/\s+/);

  // All pattern words must be in the product title
  return patternWords.every((patternWord) =>
    productWords.some((productWord) => productWord.includes(patternWord) || patternWord.includes(productWord))
  );
}

/**
 * Find vendor for a product title
 *
 * Matches product title against vendor product patterns.
 * Uses word-based matching (all pattern words must be present).
 * Returns the best match or null if no vendor found.
 */
export async function findVendorForProduct(
  productTitle: string
): Promise<VendorMatch | null> {
  const vendors = await getVendors();

  let bestMatch: VendorMatch | null = null;
  let bestScore = 0;

  for (const vendor of vendors) {
    for (const pattern of vendor.productPatterns) {
      // Check if pattern matches using word-based matching
      if (patternMatches(productTitle, pattern)) {
        // Score based on pattern word count (more words = more specific = better)
        const patternWordCount = pattern.split(/\s+/).length;
        const score = patternWordCount;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            vendor,
            matchedPattern: pattern,
            confidence: Math.min(score / 3, 1), // Scale: 3+ words = 100% confidence
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Find vendors for multiple products (for multi-vendor orders)
 *
 * Groups products by vendor for efficient forwarding.
 */
export async function findVendorsForProducts<T extends { title: string }>(
  products: T[]
): Promise<Map<string, { vendor: Vendor; products: T[] }>> {
  const vendors = await getVendors();
  const vendorProducts = new Map<
    string,
    { vendor: Vendor; products: T[] }
  >();

  for (const product of products) {
    // Find matching vendor using word-based pattern matching
    let matchedVendor: Vendor | null = null;

    for (const vendor of vendors) {
      for (const pattern of vendor.productPatterns) {
        if (patternMatches(product.title, pattern)) {
          matchedVendor = vendor;
          break;
        }
      }
      if (matchedVendor) break;
    }

    if (matchedVendor) {
      const existing = vendorProducts.get(matchedVendor.name);
      if (existing) {
        existing.products.push(product);
      } else {
        vendorProducts.set(matchedVendor.name, {
          vendor: matchedVendor,
          products: [product],
        });
      }
    } else {
      // Unknown vendor - group under "Unknown"
      const existing = vendorProducts.get("_unknown_");
      if (existing) {
        existing.products.push(product);
      } else {
        vendorProducts.set("_unknown_", {
          vendor: {
            name: "Unknown",
            contactEmails: [],
            productPatterns: [],
          },
          products: [product],
        });
      }
    }
  }

  return vendorProducts;
}

/**
 * Get vendor by name
 */
export async function getVendorByName(name: string): Promise<Vendor | null> {
  const { data } = await supabase
    .from("vendors")
    .select("*")
    .eq("name", name)
    .single();

  return data ? recordToVendor(data) : null;
}

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
 * Find vendor for a product title
 *
 * Matches product title against vendor product patterns.
 * Returns the best match or null if no vendor found.
 */
export async function findVendorForProduct(
  productTitle: string
): Promise<VendorMatch | null> {
  const vendors = await getVendors();
  const normalizedProduct = productTitle.toLowerCase();

  let bestMatch: VendorMatch | null = null;
  let bestScore = 0;

  for (const vendor of vendors) {
    for (const pattern of vendor.productPatterns) {
      const normalizedPattern = pattern.toLowerCase();

      // Check if product contains the pattern
      if (normalizedProduct.includes(normalizedPattern)) {
        // Score based on pattern length (longer = more specific = better)
        const score = normalizedPattern.length / normalizedProduct.length;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            vendor,
            matchedPattern: pattern,
            confidence: Math.min(score * 2, 1), // Scale to 0-1
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
    const normalizedTitle = product.title.toLowerCase();

    // Find matching vendor
    let matchedVendor: Vendor | null = null;

    for (const vendor of vendors) {
      for (const pattern of vendor.productPatterns) {
        if (normalizedTitle.includes(pattern.toLowerCase())) {
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

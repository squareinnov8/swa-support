/**
 * Vendor Lookup
 *
 * Finds the appropriate vendor for a product based on product patterns.
 */

import { supabase } from "@/lib/db";
import type { Vendor, VendorMatch, VendorRecord } from "./types";
import { fetchVendorsFromSheet } from "./googleSheets";

/**
 * Sync vendors from Google Sheet to database
 */
export async function syncVendorsFromSheet(): Promise<{
  synced: number;
  vendors: Vendor[];
}> {

  // Fetch from Google Sheet
  const sheetVendors = await fetchVendorsFromSheet();

  // Upsert each vendor
  for (const vendor of sheetVendors) {
    await supabase.from("vendors").upsert(
      {
        name: vendor.name,
        contact_emails: vendor.contactEmails,
        product_patterns: vendor.productPatterns,
        new_order_instructions: vendor.newOrderInstructions,
        cancel_instructions: vendor.cancelInstructions,
        escalation_instructions: vendor.escalationInstructions,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "name" }
    );
  }

  return { synced: sheetVendors.length, vendors: sheetVendors };
}

/**
 * Get all vendors (from cache or fetch fresh)
 */
export async function getVendors(forceRefresh = false): Promise<Vendor[]> {

  // Check cache age (refresh if older than 1 hour or forced)
  const { data: cached } = await supabase
    .from("vendors")
    .select("*")
    .order("name");

  // If we have cached data and it's recent, use it
  if (cached && cached.length > 0 && !forceRefresh) {
    const oldest = cached.reduce((min, v) => {
      const syncedAt = v.last_synced_at
        ? new Date(v.last_synced_at).getTime()
        : 0;
      return syncedAt < min ? syncedAt : min;
    }, Date.now());

    const hourAgo = Date.now() - 60 * 60 * 1000;
    if (oldest > hourAgo) {
      return cached.map(recordToVendor);
    }
  }

  // Fetch fresh data
  const { vendors } = await syncVendorsFromSheet();
  return vendors;
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
    lastSyncedAt: record.last_synced_at,
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

/**
 * Customer lookup utilities for Shopify
 */

import { getShopifyClient, createShopifyClient } from "./client";

/**
 * Simplified customer data for UI display
 */
export type CustomerLookupResult = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  ordersCount: number;
  totalSpent: number;
  recentOrders: Array<{
    name: string;
    createdAt: string;
    financialStatus: string | null;
    fulfillmentStatus: string | null;
    lineItems?: Array<{ title: string }>;
  }> | null;
};

/**
 * Check if Shopify is configured
 */
export function isShopifyConfigured(): boolean {
  return !!(
    process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN
  );
}

/**
 * Look up a customer by email address from Shopify
 * Returns null if not found or Shopify not configured
 */
export async function lookupCustomerByEmail(
  email: string
): Promise<CustomerLookupResult | null> {
  if (!isShopifyConfigured()) {
    console.log("[Shopify] Not configured, skipping customer lookup");
    return null;
  }

  if (!email) {
    return null;
  }

  try {
    const client = getShopifyClient();
    const customer = await client.getCustomerByEmail(email);

    if (!customer) {
      return null;
    }

    return {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      ordersCount: customer.numberOfOrders || 0,
      totalSpent: parseFloat(customer.amountSpent?.amount || "0"),
      recentOrders: customer.orders?.slice(0, 5).map(o => ({
        name: o.name,
        createdAt: o.createdAt,
        financialStatus: o.displayFinancialStatus,
        fulfillmentStatus: o.displayFulfillmentStatus,
        lineItems: [],
      })) || null,
    };
  } catch (error) {
    console.error("[Shopify] Error looking up customer:", error);
    return null;
  }
}

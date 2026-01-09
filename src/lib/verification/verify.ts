/**
 * Customer Verification
 *
 * Main verification logic for gating order support.
 */

import { supabase } from "@/lib/db";
import { getShopifyClient } from "@/lib/shopify";
import { extractOrderNumber, extractEmail } from "./extractors";
import { checkNegativeFlags } from "./flags";
import type {
  VerificationInput,
  VerificationResult,
  VerificationStatus,
  VerifiedCustomer,
  VerifiedOrder,
} from "./types";

/**
 * Check if Shopify is configured
 */
export function isShopifyConfigured(): boolean {
  return !!(
    process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN
  );
}

/**
 * Verify a customer for a thread
 *
 * Flow:
 * 1. Check if thread already verified (skip if so)
 * 2. Extract order number from message (REQUIRED)
 * 3. If no order number -> return "pending" status
 * 4. Query Shopify for order by number
 * 5. If order not found -> return "not_found"
 * 6. Get customer from order, check for negative flags
 * 7. If any flag found -> return "flagged" with flags list
 * 8. Verify email matches (optional check)
 * 9. Store verification result, return "verified"
 */
export async function verifyCustomer(
  input: VerificationInput
): Promise<VerificationResult> {
  // Check if already verified for this thread
  const { data: existingVerification } = await supabase
    .from("customer_verifications")
    .select("status, flags, customer_name, customer_email, shopify_order_id")
    .eq("thread_id", input.threadId)
    .eq("status", "verified")
    .maybeSingle();

  if (existingVerification?.status === "verified") {
    return {
      status: "verified",
      flags: [],
      customer: existingVerification.customer_name
        ? {
            shopifyId: "",
            email: existingVerification.customer_email || "",
            name: existingVerification.customer_name,
            totalOrders: 0,
            totalSpent: 0,
          }
        : undefined,
      message: "Already verified for this thread",
    };
  }

  // Extract email (use from_identifier or extract from message)
  let email = input.email;
  if (!email && input.messageText) {
    email = extractEmail(input.messageText) ?? undefined;
  }

  // Extract order number
  let orderNumber = input.orderNumber;
  if (!orderNumber && input.messageText) {
    orderNumber = extractOrderNumber(input.messageText) ?? undefined;
  }

  // If no order number, request it
  if (!orderNumber) {
    const result: VerificationResult = {
      status: "pending",
      flags: [],
      message: "Order number required for verification",
    };

    // Store the pending verification so UI can show correct status
    await saveVerification(input.threadId, email, "pending", result);

    return result;
  }

  // Check if Shopify is configured
  if (!isShopifyConfigured()) {
    // If Shopify not configured, just mark as verified (no check)
    await saveVerification(input.threadId, email, orderNumber, {
      status: "verified",
      flags: [],
      message: "Shopify not configured - auto-verified",
    });

    return {
      status: "verified",
      flags: [],
      message: "Shopify not configured - auto-verified",
    };
  }

  // Query Shopify for the order
  try {
    const shopify = getShopifyClient();
    const order = await shopify.getOrderByNumber(orderNumber);

    if (!order) {
      const result: VerificationResult = {
        status: "not_found",
        flags: [],
        message: `Order #${orderNumber} not found in Shopify`,
      };

      await saveVerification(input.threadId, email, orderNumber, result);
      return result;
    }

    // Get customer from order
    const customer = order.customer;

    // Check for negative flags
    const flags = checkNegativeFlags(customer, order);

    if (flags.length > 0) {
      const result: VerificationResult = {
        status: "flagged",
        flags,
        message: `Customer flagged: ${flags.join(", ")}`,
      };

      await saveVerification(input.threadId, email, orderNumber, result, order);
      return result;
    }

    // Optional: Check if email matches (soft check - don't block)
    if (email && customer?.email && email.toLowerCase() !== customer.email.toLowerCase()) {
      // Log mismatch but don't block - could be different inbox
      console.warn(
        `Email mismatch: ${email} vs ${customer.email} for order ${orderNumber}`
      );
    }

    // Build verified customer info
    const verifiedCustomer: VerifiedCustomer | undefined = customer
      ? {
          shopifyId: customer.id,
          email: customer.email,
          name: "", // Would need additional query for full customer
          totalOrders: 0,
          totalSpent: 0,
        }
      : undefined;

    // Extract tracking info from fulfillments
    const tracking = order.fulfillments?.flatMap((f) =>
      f.trackingInfo.map((t) => ({
        carrier: t.company,
        trackingNumber: t.number,
        trackingUrl: t.url,
      }))
    ) || [];

    const verifiedOrder: VerifiedOrder = {
      shopifyId: order.id,
      number: order.name,
      status: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
      createdAt: order.createdAt,
      tracking: tracking.length > 0 ? tracking : undefined,
      lineItems: order.lineItems,
      shippingCity: order.shippingAddress?.city || undefined,
      shippingState: order.shippingAddress?.provinceCode || undefined,
      shippingCountry: order.shippingAddress?.country || undefined,
    };

    const result: VerificationResult = {
      status: "verified",
      flags: [],
      customer: verifiedCustomer,
      order: verifiedOrder,
      message: "Customer verified successfully",
    };

    await saveVerification(input.threadId, email, orderNumber, result, order);

    // Update thread verification status
    await supabase
      .from("threads")
      .update({
        verified_at: new Date().toISOString(),
        verification_status: "verified",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.threadId);

    return result;
  } catch (error) {
    console.error("Shopify verification error:", error);

    // Fail closed on API errors - require verification before proceeding
    // This prevents drafts from being generated when we can't verify the customer
    const result: VerificationResult = {
      status: "pending",
      flags: [],
      message: `Shopify API error - verification required: ${error instanceof Error ? error.message : "Unknown"}`,
    };

    // Store the pending verification so we have a record of the attempt
    await saveVerification(input.threadId, email, orderNumber || "unknown", result);

    return result;
  }
}

/**
 * Save verification result to database
 */
async function saveVerification(
  threadId: string,
  email: string | undefined,
  orderNumber: string,
  result: VerificationResult,
  order?: { id: string; customer?: { id: string; email: string } | null }
): Promise<void> {
  await supabase.from("customer_verifications").insert({
    thread_id: threadId,
    email: email ?? null,
    order_number: orderNumber,
    shopify_customer_id: order?.customer?.id ?? null,
    shopify_order_id: order?.id ?? null,
    status: result.status,
    flags: result.flags,
    customer_name: result.customer?.name ?? null,
    customer_email: result.customer?.email ?? null,
    total_orders: result.customer?.totalOrders ?? null,
    total_spent: result.customer?.totalSpent ?? null,
  });
}

/**
 * Check if a thread is verified
 */
export async function isThreadVerified(threadId: string): Promise<boolean> {
  const { data } = await supabase
    .from("threads")
    .select("verification_status")
    .eq("id", threadId)
    .single();

  return data?.verification_status === "verified";
}

/**
 * Get existing verification for a thread
 */
export async function getThreadVerification(
  threadId: string
): Promise<VerificationResult | null> {
  const { data } = await supabase
    .from("customer_verifications")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    status: data.status as VerificationStatus,
    flags: data.flags || [],
    customer: data.customer_name
      ? {
          shopifyId: data.shopify_customer_id || "",
          email: data.customer_email || "",
          name: data.customer_name,
          totalOrders: data.total_orders || 0,
          totalSpent: data.total_spent || 0,
        }
      : undefined,
    order: data.shopify_order_id
      ? {
          shopifyId: data.shopify_order_id,
          number: data.order_number || "",
          status: "",
          fulfillmentStatus: "",
          createdAt: data.created_at,
        }
      : undefined,
  };
}

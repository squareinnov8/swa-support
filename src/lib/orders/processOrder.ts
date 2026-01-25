/**
 * Order Processing Pipeline
 *
 * Processes Shopify order confirmation emails through:
 * 1. Email parsing
 * 2. Customer blacklist check
 * 3. Vendor routing
 * 4. Email forwarding to vendor
 * 5. Shopify fulfillment marking
 */

import { supabase } from "@/lib/db";
import {
  parseOrderEmail,
  checkBlacklist,
  createOrder,
  logOrderEvent,
  updateOrderStatus,
  flagOrderForReview,
} from "./ingest";
import { findVendorForProduct, findVendorsForProducts } from "@/lib/vendors";
import { forwardOrderToVendor } from "@/lib/gmail/forwardOrder";
import type { Order, OrderLineItem, RiskAssessment } from "./types";

const HIGH_VALUE_THRESHOLD = 3000; // Flag orders over $3,000

export type OrderProcessResult = {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  status?: Order["status"];
  vendorsForwarded?: string[];
  flaggedForReview?: boolean;
  blacklisted?: boolean;
  error?: string;
};

/**
 * Process an order email
 *
 * @param params.subject - Email subject
 * @param params.body - Email body text
 * @param params.from - Sender email
 * @param params.date - Email date
 * @param params.gmailMessageId - Gmail message ID
 * @param params.gmailThreadId - Gmail thread ID
 */
export async function processOrderEmail(params: {
  subject: string;
  body: string;
  from: string;
  date: Date;
  gmailMessageId: string;
  gmailThreadId?: string;
}): Promise<OrderProcessResult> {
  const { subject, body, from, date, gmailMessageId } = params;

  console.log(`[Orders] Processing order email: ${subject}`);

  // 1. Parse order details from email
  const parsed = parseOrderEmail(subject, body);

  if (!parsed) {
    console.error(`[Orders] Failed to parse order email: ${subject}`);
    return {
      success: false,
      error: "Failed to parse order details from email",
    };
  }

  console.log(`[Orders] Parsed order #${parsed.orderNumber} for ${parsed.customerEmail}`);

  // 2. Check if customer is blacklisted
  const blacklistCheck = await checkBlacklist(parsed.customerEmail);

  if (blacklistCheck.blacklisted) {
    console.warn(
      `[Orders] Customer ${parsed.customerEmail} is blacklisted: ${blacklistCheck.reason}`
    );

    // Still create order record but flag it
    const order = await createOrder(parsed, gmailMessageId);
    await updateOrderStatus(order.id, "cancelled", {
      reason: "blacklisted_customer",
      blacklist_reason: blacklistCheck.reason,
    });

    return {
      success: false,
      orderId: order.id,
      orderNumber: parsed.orderNumber,
      status: "cancelled",
      blacklisted: true,
      error: `Customer blacklisted: ${blacklistCheck.reason}`,
    };
  }

  // 3. Create order record
  const order = await createOrder(parsed, gmailMessageId);

  // 4. Check for high-value orders
  // For now, we don't have order total in email - will need Shopify lookup
  // TODO: Fetch order total from Shopify or extract from email
  const estimatedTotal = 0; // Placeholder

  if (estimatedTotal >= HIGH_VALUE_THRESHOLD) {
    const riskAssessment: RiskAssessment = {
      score: 0.5,
      decision: "flag_for_review",
      reasons: [`High-value order (>$${HIGH_VALUE_THRESHOLD})`],
      reasoning: "Order exceeds automatic approval threshold",
    };

    await flagOrderForReview(order.id, riskAssessment);

    return {
      success: true,
      orderId: order.id,
      orderNumber: parsed.orderNumber,
      status: "pending_review",
      flaggedForReview: true,
    };
  }

  // 5. Find vendor(s) for product(s)
  const lineItems = parsed.lineItems;

  if (lineItems.length === 0 && parsed.productTitle) {
    // Fallback: create line item from product title
    lineItems.push({ title: parsed.productTitle, quantity: 1 });
  }

  // Group products by vendor
  const vendorGroups = await findVendorsForProducts(lineItems);
  const vendorsForwarded: string[] = [];

  // 6. Forward to each vendor
  for (const [vendorName, group] of vendorGroups) {
    if (vendorName === "_unknown_") {
      console.warn(`[Orders] No vendor found for products: ${group.products.map(p => p.title).join(", ")}`);

      // Flag for review - unknown vendor
      const riskAssessment: RiskAssessment = {
        score: 0.4,
        decision: "flag_for_review",
        reasons: ["No vendor mapping found for product(s)"],
        reasoning: `Products without vendor mapping: ${group.products.map(p => p.title).join(", ")}`,
      };

      await flagOrderForReview(order.id, riskAssessment);

      return {
        success: true,
        orderId: order.id,
        orderNumber: parsed.orderNumber,
        status: "pending_review",
        flaggedForReview: true,
      };
    }

    const vendor = group.vendor;

    if (vendor.contactEmails.length === 0) {
      console.warn(`[Orders] Vendor ${vendorName} has no contact emails`);
      continue;
    }

    // Create order_vendors record
    const { data: orderVendor, error: ovError } = await supabase
      .from("order_vendors")
      .insert({
        order_id: order.id,
        vendor_name: vendorName,
        vendor_emails: vendor.contactEmails,
        line_items: group.products,
        status: "pending",
      })
      .select()
      .single();

    if (ovError) {
      console.error(`[Orders] Failed to create order_vendor record: ${ovError.message}`);
      continue;
    }

    // Forward email to vendor
    const forwardResult = await forwardOrderToVendor({
      vendorEmails: vendor.contactEmails,
      orderNumber: parsed.orderNumber,
      originalSubject: subject,
      originalBody: body,
      originalFrom: from,
      originalDate: date.toISOString(),
    });

    if (forwardResult.success) {
      // Update order_vendor with forward info
      await supabase
        .from("order_vendors")
        .update({
          forwarded_at: new Date().toISOString(),
          forward_email_id: forwardResult.gmailMessageId,
          forward_thread_id: forwardResult.gmailThreadId,
          status: "forwarded",
        })
        .eq("id", orderVendor.id);

      await logOrderEvent(order.id, "forwarded_to_vendor", {
        vendor_name: vendorName,
        vendor_emails: vendor.contactEmails,
        gmail_message_id: forwardResult.gmailMessageId,
        gmail_thread_id: forwardResult.gmailThreadId,
        products: group.products.map(p => p.title),
      });

      vendorsForwarded.push(vendorName);
    } else {
      console.error(`[Orders] Failed to forward to ${vendorName}: ${forwardResult.error}`);

      await logOrderEvent(order.id, "error", {
        error: `Forward failed: ${forwardResult.error}`,
        vendor_name: vendorName,
      });
    }
  }

  // 7. Update order status
  if (vendorsForwarded.length > 0) {
    await updateOrderStatus(order.id, "fulfilled", {
      vendors_forwarded: vendorsForwarded,
    });

    // TODO: Mark as fulfilled in Shopify (without customer notification)
    // await markShopifyOrderFulfilled(order.shopify_order_id, { notifyCustomer: false });

    return {
      success: true,
      orderId: order.id,
      orderNumber: parsed.orderNumber,
      status: "fulfilled",
      vendorsForwarded,
    };
  }

  // No vendors were forwarded
  return {
    success: false,
    orderId: order.id,
    orderNumber: parsed.orderNumber,
    status: order.status,
    error: "Failed to forward to any vendors",
  };
}

/**
 * Check if an email is an order confirmation email
 * (Re-exported from ingest for convenience)
 */
export { isOrderEmail } from "./ingest";

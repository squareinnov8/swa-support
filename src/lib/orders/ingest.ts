/**
 * Order Email Ingestion
 *
 * Parses Shopify order confirmation emails and processes them through
 * the order management pipeline.
 */

import { supabase } from "@/lib/db";
import type {
  ParsedOrder,
  Order,
  RiskAssessment,
  OrderEventType,
} from "./types";

// Re-export pure parsing functions from parser.ts
export { isOrderEmail, parseOrderEmail } from "./parser";

/**
 * Log an order event
 */
export async function logOrderEvent(
  orderId: string,
  eventType: OrderEventType,
  payload?: Record<string, unknown>
): Promise<void> {

  await supabase.from("order_events").insert({
    order_id: orderId,
    event_type: eventType,
    payload,
  });
}

/**
 * Check if customer is blacklisted
 */
export async function checkBlacklist(
  email: string
): Promise<{ blacklisted: boolean; reason?: string }> {

  const { data } = await supabase
    .from("blacklisted_customers")
    .select("reason")
    .eq("email", email.toLowerCase())
    .eq("active", true)
    .single();

  if (data) {
    return { blacklisted: true, reason: data.reason };
  }

  return { blacklisted: false };
}

/**
 * Create order record in database
 */
export async function createOrder(
  parsedOrder: ParsedOrder,
  emailId: string
): Promise<Order> {

  const { data, error } = await supabase
    .from("orders")
    .insert({
      order_number: parsedOrder.orderNumber,
      customer_email: parsedOrder.customerEmail.toLowerCase(),
      customer_name: parsedOrder.customerName,
      customer_phone: parsedOrder.customerPhone,
      shipping_address: parsedOrder.shippingAddress,
      line_items: parsedOrder.lineItems,
      order_total: parsedOrder.orderTotal,
      original_email_id: emailId,
      status: "new",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create order: ${error.message}`);
  }

  // Log creation event
  await logOrderEvent(data.id, "created", {
    order_number: parsedOrder.orderNumber,
    customer_email: parsedOrder.customerEmail,
    product: parsedOrder.productTitle,
  });

  return data;
}

/**
 * Update order status
 */
export async function updateOrderStatus(
  orderId: string,
  status: Order["status"],
  metadata?: Record<string, unknown>
): Promise<void> {

  await supabase
    .from("orders")
    .update({
      status,
      last_action_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await logOrderEvent(orderId, "status_changed", {
    new_status: status,
    ...metadata,
  });
}

/**
 * Flag order for manual review
 */
export async function flagOrderForReview(
  orderId: string,
  riskAssessment: RiskAssessment
): Promise<void> {

  await supabase
    .from("orders")
    .update({
      status: "pending_review",
      risk_score: riskAssessment.score,
      risk_reasons: riskAssessment.reasons,
      last_action_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await logOrderEvent(orderId, "flagged_for_review", {
    risk_score: riskAssessment.score,
    reasons: riskAssessment.reasons,
    reasoning: riskAssessment.reasoning,
  });
}

/**
 * Get order by ID with vendor details
 */
export async function getOrderWithVendors(orderId: string) {

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return null;
  }

  const { data: vendors } = await supabase
    .from("order_vendors")
    .select("*")
    .eq("order_id", orderId);

  return {
    ...order,
    vendors: vendors || [],
  };
}

/**
 * List orders with optional filters
 */
export async function listOrders(options: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.search) {
    query = query.or(
      `order_number.ilike.%${options.search}%,customer_name.ilike.%${options.search}%,customer_email.ilike.%${options.search}%`
    );
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list orders: ${error.message}`);
  }

  return { orders: data || [], count: count || 0 };
}

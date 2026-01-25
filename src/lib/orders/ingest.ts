/**
 * Order Email Ingestion
 *
 * Parses Shopify order confirmation emails and processes them through
 * the order management pipeline.
 */

import { supabase } from "@/lib/db";
import type {
  ParsedOrder,
  OrderLineItem,
  ShippingAddress,
  Order,
  RiskAssessment,
  OrderEventType,
} from "./types";

/**
 * Subject pattern for order confirmation emails
 * Example: "[squarewheels] Order #4093 placed by Dennis Meade"
 */
const ORDER_SUBJECT_PATTERN = /^\[squarewheels\] Order #(\d+) placed by (.+)$/;

/**
 * Order email sender
 */
const ORDER_SENDER = "support@squarewheelsauto.com";

/**
 * Check if an email is an order confirmation email
 */
export function isOrderEmail(subject: string, fromEmail: string): boolean {
  const normalizedFrom = fromEmail.toLowerCase();
  const isFromStore = normalizedFrom.includes(ORDER_SENDER);
  const isOrderSubject = ORDER_SUBJECT_PATTERN.test(subject);

  return isFromStore && isOrderSubject;
}

/**
 * Parse order details from email body
 *
 * Expected format:
 * ```
 * Customer Email: dennis.meade@yahoo.com
 * Paid via Payment ID: 4093DennisMeade
 * Dennis Meade placed order #4093 on Jan 24 at 11:34 pm.
 *
 * [Product line]
 * Audi R8 (2007-2015) Android Head Unit | SquareWheels G-Series
 *
 * Shipping address
 * Dennis Meade
 * 192 Waypoint
 * Tustin, California 92782
 * United States
 * +17025691987
 * ```
 */
export function parseOrderEmail(
  subject: string,
  body: string
): ParsedOrder | null {
  // Extract order number and customer name from subject
  const subjectMatch = subject.match(ORDER_SUBJECT_PATTERN);
  if (!subjectMatch) {
    return null;
  }

  const orderNumber = subjectMatch[1];
  const customerNameFromSubject = subjectMatch[2];

  // Extract customer email
  const emailMatch = body.match(/Customer Email:\s*([^\s\n]+)/i);
  const customerEmail = emailMatch ? emailMatch[1].trim() : "";

  if (!customerEmail) {
    console.warn(`[orders/ingest] Could not extract customer email from order #${orderNumber}`);
    return null;
  }

  // Extract payment ID (optional)
  const paymentMatch = body.match(/Paid via Payment ID:\s*([^\n]+)/i);
  const paymentId = paymentMatch ? paymentMatch[1].trim() : undefined;

  // Extract product title
  // Look for product patterns - typically comes after "Order summary" or contains product keywords
  const productPatterns = [
    // Match lines with product indicators like "Android Head Unit", "G-Series", etc.
    /(?:Image\s+)?([A-Za-z0-9][\w\s\(\)\-]+\|\s*SquareWheels\s+[^\n]+)/i,
    // Match lines containing common product types
    /\n([^\n]*(?:Head Unit|Cluster|G-Series|APEX|Ghozt|Glowe|Hawkeye)[^\n]*)\n/i,
  ];

  let productTitle = "";
  for (const pattern of productPatterns) {
    const match = body.match(pattern);
    if (match) {
      productTitle = match[1].replace(/^Image\s+/i, "").trim();
      break;
    }
  }

  // Extract shipping address
  const shippingAddress = parseShippingAddress(body, customerNameFromSubject);

  // Extract phone from shipping address section
  const phoneMatch = body.match(/\+?1?\d{10,11}|\(\d{3}\)\s*\d{3}[-.]?\d{4}/);
  const customerPhone = phoneMatch ? phoneMatch[0] : undefined;

  // Build line items (for now, single item from product title)
  const lineItems: OrderLineItem[] = productTitle
    ? [{ title: productTitle, quantity: 1 }]
    : [];

  // Extract order date
  const dateMatch = body.match(/placed order #\d+ on ([A-Za-z]+ \d+) at (\d+:\d+ [ap]m)/i);
  let orderDate: Date | undefined;
  if (dateMatch) {
    // Parse relative date (assumes current year)
    const dateStr = `${dateMatch[1]}, ${new Date().getFullYear()} ${dateMatch[2]}`;
    orderDate = new Date(dateStr);
  }

  return {
    orderNumber,
    customerEmail,
    customerName: customerNameFromSubject,
    customerPhone,
    productTitle,
    lineItems,
    shippingAddress,
    paymentId,
    orderDate,
  };
}

/**
 * Parse shipping address from email body
 */
function parseShippingAddress(
  body: string,
  fallbackName: string
): ShippingAddress {
  // Find the shipping address section
  const shippingSection = body.match(
    /Shipping address\s*\n([\s\S]*?)(?:\n\n|Shopify|$)/i
  );

  if (!shippingSection) {
    return {
      name: fallbackName,
      street: "",
      city: "",
      state: "",
      zip: "",
      country: "",
    };
  }

  const lines = shippingSection[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.match(/^\+?\d{10,}/)); // Remove phone numbers

  // Typical format:
  // Line 1: Name
  // Line 2: Street
  // Line 3: City, State ZIP
  // Line 4: Country

  const name = lines[0] || fallbackName;
  const street = lines[1] || "";

  // Parse city, state, zip from line like "Tustin, California 92782"
  let city = "";
  let state = "";
  let zip = "";

  if (lines[2]) {
    const cityStateZip = lines[2].match(
      /^([^,]+),?\s*([A-Za-z\s]+)\s+(\d{5}(?:-\d{4})?)/
    );
    if (cityStateZip) {
      city = cityStateZip[1].trim();
      state = cityStateZip[2].trim();
      zip = cityStateZip[3];
    } else {
      city = lines[2];
    }
  }

  const country = lines[3] || "United States";

  return { name, street, city, state, zip, country };
}

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

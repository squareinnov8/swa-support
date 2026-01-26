/**
 * Order Email Parsing (Pure Functions)
 *
 * These functions are pure and don't depend on database access.
 * They can be imported without side effects for testing.
 */

import type { ParsedOrder, OrderLineItem, ShippingAddress } from "./types";

/**
 * Subject pattern for order confirmation emails
 * Handles direct emails and forwards (Fwd:, Re:, etc.)
 * Example: "[squarewheels] Order #4093 placed by Dennis Meade"
 * Example: "Fwd: [squarewheels] Order #4093 placed by Dennis Meade"
 */
export const ORDER_SUBJECT_PATTERN = /\[squarewheels\] Order #(\d+) placed by (.+)$/i;

/**
 * Known order email senders (Shopify store, internal forwarding)
 */
export const ORDER_SENDERS = [
  "support@squarewheelsauto.com",
  "rob@squarewheelsauto.com",
  "shopify@", // Shopify notifications
  "noreply@shopify.com",
];

/**
 * Check if an email is an order confirmation email
 *
 * Order emails can arrive:
 * 1. Directly from Shopify/store
 * 2. Forwarded by Rob from another inbox
 *
 * We primarily rely on the subject pattern since it's very specific.
 */
export function isOrderEmail(subject: string, fromEmail: string): boolean {
  const normalizedFrom = fromEmail.toLowerCase();
  const isFromKnownSender = ORDER_SENDERS.some(sender => normalizedFrom.includes(sender));
  const isOrderSubject = ORDER_SUBJECT_PATTERN.test(subject);

  // Subject pattern is specific enough - if it matches, likely an order
  // Still check sender to avoid false positives from customer forwards
  return isFromKnownSender && isOrderSubject;
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
  // Pattern handles Fwd:/Re: prefixes
  const subjectMatch = subject.match(ORDER_SUBJECT_PATTERN);
  if (!subjectMatch) {
    return null;
  }

  const orderNumber = subjectMatch[1];
  // Clean up customer name (remove trailing "Re:", forward artifacts, etc.)
  const customerNameFromSubject = subjectMatch[2].replace(/\s*(Re:|Fwd:|FW:).*$/i, "").trim();

  // Extract customer email
  const emailMatch = body.match(/Customer Email:\s*([^\s\n]+)/i);
  const customerEmail = emailMatch ? emailMatch[1].trim() : "";

  if (!customerEmail) {
    console.warn(`[orders/parser] Could not extract customer email from order #${orderNumber}`);
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
export function parseShippingAddress(
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

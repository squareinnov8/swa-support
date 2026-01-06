/**
 * Identifier Extractors
 *
 * Extract order numbers and emails from customer messages.
 */

/**
 * Extract order number from text.
 * Patterns recognized:
 * - #1234
 * - order 1234
 * - order #1234
 * - order number 1234
 * - SWA-1234
 * - SW1234
 */
export function extractOrderNumber(text: string): string | null {
  // Pattern 1: #1234 or # 1234
  const hashPattern = /#\s?(\d{4,})/i;
  const hashMatch = text.match(hashPattern);
  if (hashMatch) {
    return hashMatch[1];
  }

  // Pattern 2: "order" followed by number
  const orderPattern = /order\s*(?:number|#|no\.?)?\s*(\d{4,})/i;
  const orderMatch = text.match(orderPattern);
  if (orderMatch) {
    return orderMatch[1];
  }

  // Pattern 3: SWA-1234 or SW-1234 prefix
  const swaPattern = /SW[A]?[-\s]?(\d{4,})/i;
  const swaMatch = text.match(swaPattern);
  if (swaMatch) {
    return swaMatch[1];
  }

  return null;
}

/**
 * Extract email address from text.
 * Standard email regex pattern.
 */
export function extractEmail(text: string): string | null {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailPattern);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Extract all identifiers from a message
 */
export function extractIdentifiers(text: string): {
  orderNumber: string | null;
  email: string | null;
} {
  return {
    orderNumber: extractOrderNumber(text),
    email: extractEmail(text),
  };
}

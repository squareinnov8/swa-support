/**
 * Sender Resolution for Internal Forwards and Vendor Replies
 *
 * When Rob forwards an email or a vendor replies, we need to identify
 * the actual customer rather than treating the sender as the customer.
 */

// Note: supabase imported dynamically to allow pure functions to be tested
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any = null;
async function getSupabase() {
  if (!supabase) {
    const { supabase: sb } = await import("@/lib/db");
    supabase = sb;
  }
  return supabase;
}

/**
 * Internal/admin email addresses that should never be treated as customers
 */
const INTERNAL_EMAILS = [
  "rob@squarewheelsauto.com",
  "support@squarewheelsauto.com",
  "info@squarewheelsauto.com",
];

/**
 * Internal domains - any email from these domains is internal
 */
const INTERNAL_DOMAINS = ["squarewheelsauto.com"];

/**
 * Check if an email address is internal/admin
 */
export function isInternalEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();

  // Check exact matches
  if (INTERNAL_EMAILS.some(internal => normalized.includes(internal))) {
    return true;
  }

  // Check domain
  const domain = normalized.split("@")[1];
  if (domain && INTERNAL_DOMAINS.includes(domain)) {
    return true;
  }

  return false;
}

/**
 * Check if an email address is from a known vendor
 */
export async function isVendorEmail(email: string): Promise<{ isVendor: boolean; vendorName?: string }> {
  const normalized = email.toLowerCase().trim();

  // Extract just the email address if it's in "Name <email>" format
  const emailMatch = normalized.match(/<([^>]+)>/) || [null, normalized];
  const cleanEmail = emailMatch[1] || normalized;

  // Check against vendors table
  const db = await getSupabase();
  const { data: vendors } = await db
    .from("vendors")
    .select("name, contact_emails");

  if (!vendors) {
    return { isVendor: false };
  }

  for (const vendor of vendors) {
    const vendorEmails = vendor.contact_emails as string[] | null;
    if (vendorEmails?.some(ve => cleanEmail.includes(ve.toLowerCase()))) {
      return { isVendor: true, vendorName: vendor.name };
    }
  }

  return { isVendor: false };
}

/**
 * Extract original sender from a forwarded email body
 *
 * Looks for patterns like:
 * - "---------- Forwarded message ---------\nFrom: customer@example.com"
 * - "From: customer@example.com" at the start of quoted content
 * - "Customer Email: customer@example.com" (Shopify order format)
 */
export function extractOriginalSenderFromForward(body: string, subject: string): string | null {
  // Pattern 1: Gmail forwarded message format
  const gmailForwardMatch = body.match(
    /[-]+\s*Forwarded message\s*[-]+[\s\S]*?From:\s*(?:[^<]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i
  );
  if (gmailForwardMatch) {
    const extracted = gmailForwardMatch[1];
    if (!isInternalEmail(extracted)) {
      return extracted;
    }
  }

  // Pattern 2: Outlook/generic forward format "From: email" near top
  const genericForwardMatch = body.match(
    /^[\s\S]{0,500}From:\s*(?:[^<]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/im
  );
  if (genericForwardMatch) {
    const extracted = genericForwardMatch[1];
    if (!isInternalEmail(extracted)) {
      return extracted;
    }
  }

  // Pattern 3: Shopify order notification format
  const shopifyMatch = body.match(
    /Customer Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
  );
  if (shopifyMatch) {
    return shopifyMatch[1];
  }

  // Pattern 4: Reply-to or original sender in headers preserved in body
  const replyToMatch = body.match(
    /Reply-To:\s*(?:[^<]*<)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i
  );
  if (replyToMatch) {
    const extracted = replyToMatch[1];
    if (!isInternalEmail(extracted)) {
      return extracted;
    }
  }

  return null;
}

/**
 * Extract customer name from forwarded content
 */
export function extractCustomerNameFromForward(body: string): string | null {
  // Pattern: "Name <email>" format in From line
  const nameEmailMatch = body.match(
    /From:\s*([^<\n]+)\s*</i
  );
  if (nameEmailMatch) {
    const name = nameEmailMatch[1].trim();
    if (name && name.length > 1 && name.length < 100) {
      return name;
    }
  }

  // Shopify order format: "CustomerName placed order #"
  const shopifyNameMatch = body.match(
    /([A-Z][a-z]+ [A-Z][a-z]+) placed order #/
  );
  if (shopifyNameMatch) {
    return shopifyNameMatch[1];
  }

  return null;
}

export type ResolvedSender = {
  email: string;
  name?: string;
  wasForwarded: boolean;
  originalSender?: string;
  isVendor: boolean;
  vendorName?: string;
  isInternal: boolean; // True if sender is internal and no external sender was extracted
};

/**
 * Resolve the actual customer/sender for an email
 *
 * If the sender is internal (Rob), extracts the original sender from forward.
 * If the sender is a vendor, marks it as such.
 */
export async function resolveSender(
  fromEmail: string,
  body: string,
  subject: string
): Promise<ResolvedSender> {
  const normalized = fromEmail.toLowerCase();

  // Check if it's from a vendor first
  const vendorCheck = await isVendorEmail(fromEmail);
  if (vendorCheck.isVendor) {
    return {
      email: normalized,
      wasForwarded: false,
      isVendor: true,
      vendorName: vendorCheck.vendorName,
      isInternal: false,
    };
  }

  // Check if it's an internal email (Rob forwarding)
  if (isInternalEmail(fromEmail)) {
    const originalSender = extractOriginalSenderFromForward(body, subject);
    const originalName = extractCustomerNameFromForward(body);

    if (originalSender) {
      // Check if the original sender is a vendor
      const originalVendorCheck = await isVendorEmail(originalSender);
      if (originalVendorCheck.isVendor) {
        console.log(`[SenderResolver] Resolved forwarded vendor email: ${fromEmail} -> ${originalSender} (${originalVendorCheck.vendorName})`);
        return {
          email: originalSender.toLowerCase(),
          name: originalName || undefined,
          wasForwarded: true,
          originalSender: normalized,
          isVendor: true,
          vendorName: originalVendorCheck.vendorName,
          isInternal: false,
        };
      }

      console.log(`[SenderResolver] Resolved forwarded email: ${fromEmail} -> ${originalSender}`);
      return {
        email: originalSender.toLowerCase(),
        name: originalName || undefined,
        wasForwarded: true,
        originalSender: normalized,
        isVendor: false,
        isInternal: false,
      };
    }

    // Couldn't extract original sender - treat as internal admin note
    console.log(`[SenderResolver] Internal admin note from ${fromEmail}, no external sender found`);
    return {
      email: normalized,
      wasForwarded: false,
      isVendor: false,
      isInternal: true,
    };
  }

  // Regular customer email
  return {
    email: normalized,
    wasForwarded: false,
    isVendor: false,
    isInternal: false,
  };
}

/**
 * Email Classification Utilities
 *
 * As of Jan 2026, intent classification uses LLM via classifyWithLLM() in llmClassify.ts.
 * This file now only contains automated email detection for pre-filtering.
 */

// ========================================
// AUTOMATED EMAIL DETECTION
// ========================================

/**
 * Blocklisted sender domains from automated services.
 * These are platform notifications, security alerts, etc. that should not be replied to.
 */
const AUTOMATED_SENDER_DOMAINS = [
  // Meta platforms (Facebook, Instagram) - SYSTEM EMAILS ONLY
  // Note: Do NOT include gmail.com, hotmail.com, etc. - customers use those
  "facebookmail.com",  // Facebook notification emails
  "instagram.com",     // Instagram notification emails (NOT user emails)
  "fb.com",            // Facebook corporate
  "meta.com",          // Meta corporate
  // Google services - SYSTEM EMAILS ONLY (NOT gmail.com - customers use that)
  "google.com",        // Google system emails
  "googlemail.com",    // Google system emails (different from gmail.com)
  "accounts.google.com", // Google account notifications
  // TikTok
  "tiktok.com",
  "bytedance.com",
  // Twitter/X - SYSTEM EMAILS ONLY
  "twitter.com",
  "x.com",
  // Apple - SYSTEM EMAILS ONLY (NOT icloud.com - customers use that)
  "apple.com",
  "id.apple.com",
  // Microsoft - SYSTEM EMAILS ONLY
  // Note: Do NOT include hotmail.com, outlook.com, live.com - customers use those
  "microsoft.com",
  "account.microsoft.com",
  // Amazon - SYSTEM EMAILS ONLY
  "amazon.com",
  "amazon.co.uk",
  "amazonses.com",
  // LinkedIn - SYSTEM EMAILS ONLY
  "linkedin.com",
  "linkedinmail.com",
  // Shopify (our own platform - don't reply to system emails)
  "shopify.com",
  "myshopify.com",
  // PayPal - SYSTEM EMAILS ONLY (NOT paypal user emails)
  "paypal.com",
  // Stripe - SYSTEM EMAILS
  "stripe.com",
  // Email service providers (transactional email systems)
  "mailchimp.com",
  "sendgrid.net",
  "sendgrid.com",
  "constantcontact.com",
  "mailgun.org",
  "postmarkapp.com",
  "mandrill.com",
  "hubspot.com",
  "intercom.io",
  "zendesk.com",
  "freshdesk.com",
];

/**
 * Subject line patterns that indicate automated/notification emails.
 * These patterns catch security alerts, verification codes, account notifications, etc.
 */
const AUTOMATED_SUBJECT_PATTERNS = [
  // Security and authentication
  /security\s*alert/i,
  /sign[- ]?in\s*(attempt|notification|alert)/i,
  /new\s*sign[- ]?in/i,
  /login\s*(attempt|notification|alert)/i,
  /verification\s*code/i,
  /your\s*code\s*(is|:)/i,
  /confirm\s*your\s*(email|account)/i,
  /verify\s*your\s*(email|account|identity)/i,
  /reset\s*your\s*password/i,
  /password\s*(reset|changed|updated)/i,
  /two[- ]?factor\s*authentication/i,
  /2fa\s*(code|enabled|disabled)/i,
  /suspicious\s*activity/i,

  // Instagram/Meta specific
  /instagram\s*code/i,
  /account\s*center/i,
  /username\s*(was\s*)?(changed|updated)/i,
  /your\s*instagram/i,
  /facebook\s*(code|security|login)/i,

  // TikTok specific
  /dispute\s*protection/i,
  /tiktok\s*(code|security|login)/i,
  /creator\s*fund/i,

  // Google specific
  /google\s*(security|alert|sign[- ]?in)/i,
  /critical\s*security\s*alert/i,

  // Account status notifications
  /your\s*account\s*(has\s*been|was|is)/i,
  /account\s*(suspended|disabled|locked|restricted)/i,
  /action\s*required.*account/i,
  /important.*account.*update/i,

  // Shipping/delivery notifications (from platforms, not customers asking about orders)
  /your\s*(order|package|shipment)\s*(has\s*shipped|is\s*on\s*its\s*way|was\s*delivered)/i,
  /delivery\s*(confirmation|notification|update)/i,
  /out\s*for\s*delivery/i,
  /tracking\s*update/i,

  // Payment/transaction notifications
  /receipt\s*(for|from)/i,
  /payment\s*(received|confirmed|processed)/i,
  /invoice\s*#?\d+/i,
  /successful\s*payment/i,
  /transaction\s*(complete|confirmed|receipt)/i,

  // Subscription/newsletter
  /newsletter/i,
  /weekly\s*(digest|update|roundup)/i,
  /monthly\s*(report|summary|newsletter)/i,
  /unsubscribe/i,
];

/**
 * Sender email patterns that indicate noreply/automated senders.
 * These catch generic noreply addresses regardless of domain.
 */
const AUTOMATED_SENDER_PATTERNS = [
  /^no[-_]?reply@/i,
  /^noreply@/i,
  /^do[-_]?not[-_]?reply@/i,
  /^donotreply@/i,
  /^mailer[-_]?daemon@/i,
  /^postmaster@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^system@/i,
  /^automated?@/i,
  /^support[-_]?notifications?@/i,
  /^account[-_]?security@/i,
  /^security[-_]?alert@/i,
];

export interface AutomatedEmailCheck {
  isAutomated: boolean;
  reason?: string;
  matchedPattern?: string;
}

/**
 * Check if an email is from an automated service that should not receive replies.
 * This runs BEFORE LLM classification to save API calls.
 *
 * @param senderEmail - The sender's email address
 * @param subject - The email subject line
 * @returns Detection result with reason if automated
 */
export function checkAutomatedEmail(
  senderEmail: string | undefined | null,
  subject: string
): AutomatedEmailCheck {
  const email = (senderEmail || "").toLowerCase().trim();
  const subjectLower = subject.toLowerCase();

  // Check sender domain blocklist
  if (email) {
    const domain = email.split("@")[1] || "";
    for (const blockedDomain of AUTOMATED_SENDER_DOMAINS) {
      if (domain === blockedDomain || domain.endsWith(`.${blockedDomain}`)) {
        return {
          isAutomated: true,
          reason: "blocked_domain",
          matchedPattern: blockedDomain,
        };
      }
    }

    // Check sender email patterns (noreply, etc.)
    for (const pattern of AUTOMATED_SENDER_PATTERNS) {
      if (pattern.test(email)) {
        return {
          isAutomated: true,
          reason: "automated_sender_pattern",
          matchedPattern: pattern.source,
        };
      }
    }
  }

  // Check subject line patterns
  for (const pattern of AUTOMATED_SUBJECT_PATTERNS) {
    if (pattern.test(subjectLower)) {
      return {
        isAutomated: true,
        reason: "automated_subject_pattern",
        matchedPattern: pattern.source,
      };
    }
  }

  return { isAutomated: false };
}

// Legacy regex-based classification has been removed.
// All intent classification now uses LLM via classifyWithLLM() in llmClassify.ts
// The checkAutomatedEmail() function above remains for pre-filtering automated emails.


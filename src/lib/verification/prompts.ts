/**
 * Verification Prompts
 *
 * Messages to request verification info from customers.
 */

/**
 * Request order number for verification
 */
export const VERIFICATION_REQUEST_PROMPT = `To help you with your order, I'll need to verify your account. Could you please provide:

1. Your **order number** (found in your confirmation email, e.g., #12345)

This helps us protect your account and ensure we're providing information to the right person.

– Rob`;

/**
 * When order wasn't found in Shopify
 */
export const VERIFICATION_NOT_FOUND_PROMPT = `I wasn't able to find an order matching that information in our system. This could happen if:

- The order number has a typo
- The order was placed under a different email address
- The order was placed under a different name or through a different store

Could you double-check and provide the exact order number from your confirmation email?

– Rob`;

/**
 * When email doesn't match the order
 */
export const VERIFICATION_MISMATCH_PROMPT = `For security purposes, I need to verify that you're the owner of this order. The email address you're writing from doesn't match our records for this order.

Could you reply from the email address you used when placing the order, or provide additional verification details?

– Rob`;

/**
 * Internal note when customer is flagged (not sent to customer)
 * This is for the escalation - human agent will handle.
 */
export const VERIFICATION_FLAGGED_PROMPT = `[ESCALATED - Customer flagged for human review]

This customer has been flagged in our system and requires human review before proceeding.
Please check Shopify customer notes and order history for context.`;

/**
 * Get the appropriate verification prompt for a status
 */
export function getVerificationPrompt(
  status: "pending" | "not_found" | "mismatch" | "flagged"
): string {
  switch (status) {
    case "pending":
      return VERIFICATION_REQUEST_PROMPT;
    case "not_found":
      return VERIFICATION_NOT_FOUND_PROMPT;
    case "mismatch":
      return VERIFICATION_MISMATCH_PROMPT;
    case "flagged":
      return VERIFICATION_FLAGGED_PROMPT;
    default:
      return VERIFICATION_REQUEST_PROMPT;
  }
}

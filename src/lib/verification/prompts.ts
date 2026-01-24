/**
 * Verification Prompts
 *
 * Messages to request verification info from customers.
 */

/**
 * Request order number for verification
 */
export const VERIFICATION_REQUEST_PROMPT = `Hey! I'd love to help you with this.

To pull up your order info, could you share your **order number**? You can find it in your confirmation email (looks like #12345 or SWA-12345).

– Lina`;

/**
 * When order wasn't found in Shopify
 */
export const VERIFICATION_NOT_FOUND_PROMPT = `Hmm, I couldn't find that order in our system. A few things that might help:

- Double-check the order number (sometimes there's a typo)
- Was it placed under a different email address?
- Check your confirmation email for the exact order number

Mind taking another look and sending it over?

– Lina`;

/**
 * When email doesn't match the order
 */
export const VERIFICATION_MISMATCH_PROMPT = `I found the order, but the email you're writing from doesn't match what's on file. Just want to make sure I'm helping the right person!

Could you either:
- Reply from the email you used when you ordered, or
- Let me know some other details to verify (like the shipping address or items ordered)

– Lina`;

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

/**
 * Customer Verification Module
 *
 * Verify customers via Shopify before providing order support.
 */

export {
  verifyCustomer,
  isThreadVerified,
  getThreadVerification,
  isShopifyConfigured,
  type ExtendedVerificationResult,
} from "./verify";

export {
  extractOrderNumber,
  extractEmail,
  extractIdentifiers,
} from "./extractors";

export { checkNegativeFlags } from "./flags";

export {
  VERIFICATION_REQUEST_PROMPT,
  VERIFICATION_NOT_FOUND_PROMPT,
  VERIFICATION_MISMATCH_PROMPT,
  VERIFICATION_FLAGGED_PROMPT,
  getVerificationPrompt,
} from "./prompts";

export {
  PROTECTED_INTENTS,
  isProtectedIntent,
  type VerificationStatus,
  type VerificationInput,
  type VerificationResult,
  type VerifiedCustomer,
  type VerifiedOrder,
  type CustomerVerificationRecord,
} from "./types";

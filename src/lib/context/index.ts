/**
 * Lina Context Module
 *
 * Unified context for all Lina email generation and tool execution.
 */

export * from "./types";
export { buildLinaContext, formatLinaContextForPrompt } from "./builder";
export {
  getAdminDecisions,
  formatAdminDecisionsForPrompt,
} from "./adminDecisions";
export {
  setPendingAction,
  clearPendingAction,
  getPendingAction,
  hasPendingAction,
  createVendorResponseAction,
  createCustomerPhotosAction,
  createCustomerConfirmationAction,
  createAdminDecisionAction,
  formatPendingActionForPrompt,
} from "./pendingActions";

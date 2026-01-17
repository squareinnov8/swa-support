/**
 * Escalation Module
 *
 * Handles ticket escalation with rich context for human review.
 * Includes email generation and sending capabilities.
 */

export {
  generateEscalationNotes,
  saveEscalationNotes,
  type EscalationContext,
  type EscalationNotes,
} from "./notes";

export {
  buildCustomerProfile,
  generateEscalationEmail,
  generateEscalationEmailHtml,
} from "./emailGenerator";

export {
  sendEscalationEmail,
  shouldSendEscalationEmail,
  isGmailSendConfigured,
  applyEscalationLabel,
} from "./emailSender";

/**
 * Collaboration Types
 *
 * Types for human-agent collaboration, intervention detection,
 * observation mode, and learning proposals.
 */

/**
 * Channels through which intervention can occur
 */
export type InterventionChannel = "email" | "hubspot" | "admin_ui";

/**
 * Signal that a human has intervened in a thread
 */
export type InterventionSignal = {
  type: "direct_email" | "cc_support" | "hubspot_update" | "admin_takeover";
  threadId: string;
  gmailThreadId?: string;
  hubspotTicketId?: string;
  handler: string; // Email of human handler
  channel: InterventionChannel;
  timestamp: Date;
  content?: string; // Message content if available
};

/**
 * A message observed during human handling
 */
export type ObservedMessage = {
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  content: string;
  timestamp: Date;
  gmailMessageId?: string;
};

/**
 * State of an active observation
 */
export type ObservationState = {
  id: string;
  threadId: string;
  interventionStart: Date;
  handler: string;
  channel: InterventionChannel;
  observedMessages: ObservedMessage[];
  isActive: boolean;
};

/**
 * Resolution types when human handling ends
 */
export type ResolutionType = "resolved" | "escalated_further" | "transferred" | "returned_to_agent";

/**
 * Data collected when observation ends
 */
export type ObservationResolution = {
  resolutionType: ResolutionType;
  resolutionSummary: string;
  questionsAsked?: string[];
  troubleshootingSteps?: string[];
  newInformation?: string[];
};

/**
 * Types of learning proposals
 */
export type LearningProposalType = "kb_article" | "instruction_update";

/**
 * A learning proposal generated from observation
 */
export type LearningProposal = {
  type: LearningProposalType;
  title: string;
  summary: string;
  proposedContent: string;
  sourceContext?: {
    threadId: string;
    threadSubject?: string;
    relevantExcerpts: string[];
  };
};

/**
 * Status of a learning proposal
 */
export type LearningProposalStatus = "pending" | "approved" | "rejected" | "published";

/**
 * Customer profile for escalation emails
 */
export type CustomerProfile = {
  name: string;
  email: string;
  verificationStatus: string;
  verificationFlags?: string[];
  orderHistory: {
    count: number;
    totalSpent: number;
    recentOrders: {
      orderNumber: string;
      date: string;
      total: number;
      status: string;
    }[];
  };
  previousTickets: {
    count: number;
    topics: string[];
    lastOutcome?: string;
  };
  relevantHistory?: string; // AI-summarized
};

/**
 * Escalation email content
 */
export type EscalationEmailContent = {
  subject: string;
  customerProfile: CustomerProfile;
  issueAnalysis: {
    intent: string;
    sentiment: string;
    frustrationLevel: "low" | "medium" | "high";
    emailCount: number;
    daysSinceFirstContact: number;
  };
  troubleshootingAttempted: string[];
  recommendations: string[];
  threadSummary: string;
};

/**
 * Parsed response from Rob to an escalation email
 */
export type EscalationResponse = {
  type: "instruction" | "resolve" | "draft" | "takeover" | "unknown";
  content: string;
  rawEmail: string;
};

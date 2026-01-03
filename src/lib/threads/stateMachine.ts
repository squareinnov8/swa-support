import type { Intent } from "../intents/taxonomy";

/**
 * Thread State Machine
 *
 * Defines the lifecycle states for support threads and the rules
 * governing transitions between them.
 *
 * States flow generally from NEW → AWAITING_INFO/IN_PROGRESS → RESOLVED
 * with ESCALATED as a special state requiring human intervention.
 */

export const THREAD_STATES = [
  "NEW",
  "AWAITING_INFO",
  "IN_PROGRESS",
  "ESCALATED",
  "RESOLVED",
] as const;

export type ThreadState = (typeof THREAD_STATES)[number];

export type Action =
  | "NO_REPLY"
  | "ASK_CLARIFYING_QUESTIONS"
  | "SEND_PREAPPROVED_MACRO"
  | "ESCALATE_WITH_DRAFT";

export type StateMetadata = {
  label: string;
  description: string;
  color: string; // Tailwind color class
  priority: number; // Lower = higher priority in lists
};

/**
 * UI metadata for each state (labels, colors, descriptions)
 */
export const STATE_METADATA: Record<ThreadState, StateMetadata> = {
  NEW: {
    label: "New",
    description: "Fresh inbound message, not yet processed",
    color: "bg-blue-100 text-blue-800",
    priority: 1,
  },
  AWAITING_INFO: {
    label: "Awaiting Info",
    description: "Waiting for customer to provide required information",
    color: "bg-yellow-100 text-yellow-800",
    priority: 2,
  },
  IN_PROGRESS: {
    label: "In Progress",
    description: "Draft ready for admin review",
    color: "bg-purple-100 text-purple-800",
    priority: 3,
  },
  ESCALATED: {
    label: "Escalated",
    description: "Requires human intervention (chargeback, legal, policy)",
    color: "bg-red-100 text-red-800",
    priority: 0, // Highest priority - show first
  },
  RESOLVED: {
    label: "Resolved",
    description: "Issue closed",
    color: "bg-green-100 text-green-800",
    priority: 4,
  },
};

export type TransitionContext = {
  currentState: ThreadState;
  action: Action;
  intent: Intent;
  policyBlocked?: boolean;
  missingRequiredInfo?: boolean;
};

/**
 * Determine the next state based on current state and action taken.
 *
 * State transition rules:
 * - THANK_YOU_CLOSE → RESOLVED (regardless of current state)
 * - CHARGEBACK_THREAT or LEGAL_SAFETY_RISK → ESCALATED
 * - Policy gate blocked → ESCALATED
 * - Missing required info → AWAITING_INFO
 * - Draft generated successfully → IN_PROGRESS
 * - Customer replies to AWAITING_INFO → re-evaluate (typically IN_PROGRESS)
 */
export function getNextState(ctx: TransitionContext): ThreadState {
  const { currentState, action, intent, policyBlocked, missingRequiredInfo } = ctx;

  // THANK_YOU_CLOSE always resolves the thread
  if (intent === "THANK_YOU_CLOSE") {
    return "RESOLVED";
  }

  // Escalation takes precedence
  if (action === "ESCALATE_WITH_DRAFT") {
    return "ESCALATED";
  }

  // High-risk intents always escalate
  if (intent === "CHARGEBACK_THREAT" || intent === "LEGAL_SAFETY_RISK") {
    return "ESCALATED";
  }

  // Policy gate blocked → escalate
  if (policyBlocked) {
    return "ESCALATED";
  }

  // Missing required info → awaiting info
  if (missingRequiredInfo) {
    return "AWAITING_INFO";
  }

  // Customer reply to awaiting info → re-evaluate to in progress
  if (currentState === "AWAITING_INFO") {
    // If they replied and we have enough info now, move to in progress
    return "IN_PROGRESS";
  }

  // Already escalated stays escalated until manual resolution
  if (currentState === "ESCALATED") {
    return "ESCALATED";
  }

  // Already resolved stays resolved (new thread would be created for new issue)
  if (currentState === "RESOLVED") {
    // If customer sends new message to resolved thread, reopen
    return "IN_PROGRESS";
  }

  // Default: draft ready, awaiting admin review
  if (action === "SEND_PREAPPROVED_MACRO" || action === "ASK_CLARIFYING_QUESTIONS") {
    return "IN_PROGRESS";
  }

  // Fallback to current state
  return currentState;
}

/**
 * Check if a state transition is valid.
 * Used for manual state changes in admin UI.
 */
export function isValidTransition(from: ThreadState, to: ThreadState): boolean {
  // Define allowed manual transitions
  const allowedTransitions: Record<ThreadState, ThreadState[]> = {
    NEW: ["AWAITING_INFO", "IN_PROGRESS", "ESCALATED", "RESOLVED"],
    AWAITING_INFO: ["IN_PROGRESS", "ESCALATED", "RESOLVED"],
    IN_PROGRESS: ["AWAITING_INFO", "ESCALATED", "RESOLVED"],
    ESCALATED: ["IN_PROGRESS", "RESOLVED"], // Admin can de-escalate or resolve
    RESOLVED: ["IN_PROGRESS"], // Reopen if needed
  };

  return allowedTransitions[from]?.includes(to) ?? false;
}

/**
 * Get a human-readable description of why the state changed.
 */
export function getTransitionReason(ctx: TransitionContext, newState: ThreadState): string {
  if (ctx.intent === "THANK_YOU_CLOSE") {
    return "Customer sent thank you message";
  }
  if (ctx.intent === "CHARGEBACK_THREAT") {
    return "Chargeback threat detected - requires immediate attention";
  }
  if (ctx.intent === "LEGAL_SAFETY_RISK") {
    return "Legal/safety risk detected - requires human review";
  }
  if (ctx.policyBlocked) {
    return "Draft contained blocked policy language";
  }
  if (ctx.missingRequiredInfo && newState === "AWAITING_INFO") {
    return "Missing required information from customer";
  }
  if (ctx.currentState === "AWAITING_INFO" && newState === "IN_PROGRESS") {
    return "Customer provided additional information";
  }
  if (ctx.currentState === "RESOLVED" && newState === "IN_PROGRESS") {
    return "Thread reopened due to new customer message";
  }

  return `Transitioned from ${ctx.currentState} to ${newState}`;
}

import { describe, it, expect } from "vitest";
import {
  getNextState,
  isValidTransition,
  getTransitionReason,
  THREAD_STATES,
  STATE_METADATA,
  type TransitionContext,
} from "../threads/stateMachine";

/**
 * Tests for thread state machine.
 * Validates all state transitions and edge cases.
 */

describe("getNextState", () => {
  describe("THANK_YOU_CLOSE intent", () => {
    it("resolves from NEW state", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "NO_REPLY",
        intent: "THANK_YOU_CLOSE",
      };
      expect(getNextState(ctx)).toBe("RESOLVED");
    });

    it("resolves from AWAITING_INFO state", () => {
      const ctx: TransitionContext = {
        currentState: "AWAITING_INFO",
        action: "NO_REPLY",
        intent: "THANK_YOU_CLOSE",
      };
      expect(getNextState(ctx)).toBe("RESOLVED");
    });

    it("resolves from IN_PROGRESS state", () => {
      const ctx: TransitionContext = {
        currentState: "IN_PROGRESS",
        action: "NO_REPLY",
        intent: "THANK_YOU_CLOSE",
      };
      expect(getNextState(ctx)).toBe("RESOLVED");
    });

    it("resolves from ESCALATED state", () => {
      const ctx: TransitionContext = {
        currentState: "ESCALATED",
        action: "NO_REPLY",
        intent: "THANK_YOU_CLOSE",
      };
      expect(getNextState(ctx)).toBe("RESOLVED");
    });
  });

  describe("escalation triggers", () => {
    it("escalates on CHARGEBACK_THREAT", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "ESCALATE_WITH_DRAFT",
        intent: "CHARGEBACK_THREAT",
      };
      expect(getNextState(ctx)).toBe("ESCALATED");
    });

    it("escalates on LEGAL_SAFETY_RISK", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "LEGAL_SAFETY_RISK",
      };
      expect(getNextState(ctx)).toBe("ESCALATED");
    });

    it("escalates when policy is blocked", () => {
      const ctx: TransitionContext = {
        currentState: "IN_PROGRESS",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "FIRMWARE_UPDATE_REQUEST",
        policyBlocked: true,
      };
      expect(getNextState(ctx)).toBe("ESCALATED");
    });

    it("escalates on ESCALATE_WITH_DRAFT action", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "ESCALATE_WITH_DRAFT",
        intent: "UNKNOWN",
      };
      expect(getNextState(ctx)).toBe("ESCALATED");
    });
  });

  describe("missing required info", () => {
    it("moves to AWAITING_INFO when missing required fields", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "FIRMWARE_ACCESS_ISSUE",
        missingRequiredInfo: true,
      };
      expect(getNextState(ctx)).toBe("AWAITING_INFO");
    });

    it("prioritizes escalation over awaiting info for chargebacks", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "ESCALATE_WITH_DRAFT",
        intent: "CHARGEBACK_THREAT",
        missingRequiredInfo: true,
      };
      expect(getNextState(ctx)).toBe("ESCALATED");
    });
  });

  describe("AWAITING_INFO state transitions", () => {
    it("moves to IN_PROGRESS when customer replies with info", () => {
      const ctx: TransitionContext = {
        currentState: "AWAITING_INFO",
        action: "SEND_PREAPPROVED_MACRO",
        intent: "FIRMWARE_ACCESS_ISSUE",
        missingRequiredInfo: false,
      };
      expect(getNextState(ctx)).toBe("IN_PROGRESS");
    });

    it("stays in AWAITING_INFO if still missing info", () => {
      const ctx: TransitionContext = {
        currentState: "AWAITING_INFO",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "ORDER_STATUS",
        missingRequiredInfo: true,
      };
      expect(getNextState(ctx)).toBe("AWAITING_INFO");
    });
  });

  describe("IN_PROGRESS state", () => {
    it("transitions to IN_PROGRESS with preapproved macro", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "SEND_PREAPPROVED_MACRO",
        intent: "DOCS_VIDEO_MISMATCH",
      };
      expect(getNextState(ctx)).toBe("IN_PROGRESS");
    });

    it("transitions to IN_PROGRESS with clarifying questions", () => {
      const ctx: TransitionContext = {
        currentState: "NEW",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "UNKNOWN",
        missingRequiredInfo: false,
      };
      expect(getNextState(ctx)).toBe("IN_PROGRESS");
    });
  });

  describe("ESCALATED state persistence", () => {
    it("stays escalated on new messages", () => {
      const ctx: TransitionContext = {
        currentState: "ESCALATED",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "FOLLOW_UP_NO_NEW_INFO",
      };
      expect(getNextState(ctx)).toBe("ESCALATED");
    });
  });

  describe("RESOLVED state reopening", () => {
    it("reopens to IN_PROGRESS on new customer message", () => {
      const ctx: TransitionContext = {
        currentState: "RESOLVED",
        action: "ASK_CLARIFYING_QUESTIONS",
        intent: "FIRMWARE_UPDATE_REQUEST",
      };
      expect(getNextState(ctx)).toBe("IN_PROGRESS");
    });
  });
});

describe("isValidTransition", () => {
  it("allows NEW to any active state", () => {
    expect(isValidTransition("NEW", "AWAITING_INFO")).toBe(true);
    expect(isValidTransition("NEW", "IN_PROGRESS")).toBe(true);
    expect(isValidTransition("NEW", "ESCALATED")).toBe(true);
    expect(isValidTransition("NEW", "RESOLVED")).toBe(true);
  });

  it("allows ESCALATED to be de-escalated or resolved", () => {
    expect(isValidTransition("ESCALATED", "IN_PROGRESS")).toBe(true);
    expect(isValidTransition("ESCALATED", "RESOLVED")).toBe(true);
  });

  it("prevents ESCALATED from going back to NEW", () => {
    expect(isValidTransition("ESCALATED", "NEW")).toBe(false);
  });

  it("allows RESOLVED to be reopened", () => {
    expect(isValidTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
  });

  it("prevents invalid state transitions", () => {
    expect(isValidTransition("RESOLVED", "NEW")).toBe(false);
    expect(isValidTransition("RESOLVED", "AWAITING_INFO")).toBe(false);
  });
});

describe("getTransitionReason", () => {
  it("explains thank you close", () => {
    const ctx: TransitionContext = {
      currentState: "IN_PROGRESS",
      action: "NO_REPLY",
      intent: "THANK_YOU_CLOSE",
    };
    expect(getTransitionReason(ctx, "RESOLVED")).toContain("thank you");
  });

  it("explains chargeback escalation", () => {
    const ctx: TransitionContext = {
      currentState: "NEW",
      action: "ESCALATE_WITH_DRAFT",
      intent: "CHARGEBACK_THREAT",
    };
    expect(getTransitionReason(ctx, "ESCALATED")).toContain("Chargeback");
  });

  it("explains missing info", () => {
    const ctx: TransitionContext = {
      currentState: "NEW",
      action: "ASK_CLARIFYING_QUESTIONS",
      intent: "ORDER_STATUS",
      missingRequiredInfo: true,
    };
    expect(getTransitionReason(ctx, "AWAITING_INFO")).toContain("Missing required");
  });

  it("explains policy block", () => {
    const ctx: TransitionContext = {
      currentState: "IN_PROGRESS",
      action: "SEND_PREAPPROVED_MACRO",
      intent: "FIRMWARE_UPDATE_REQUEST",
      policyBlocked: true,
    };
    expect(getTransitionReason(ctx, "ESCALATED")).toContain("policy");
  });
});

describe("STATE_METADATA", () => {
  it("has metadata for all states", () => {
    for (const state of THREAD_STATES) {
      expect(STATE_METADATA[state]).toBeDefined();
      expect(STATE_METADATA[state].label).toBeTruthy();
      expect(STATE_METADATA[state].color).toBeTruthy();
    }
  });

  it("ESCALATED has highest priority (lowest number)", () => {
    expect(STATE_METADATA.ESCALATED.priority).toBe(0);
  });
});

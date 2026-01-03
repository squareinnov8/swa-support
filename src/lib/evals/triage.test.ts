import { describe, it, expect } from "vitest";
import { classifyIntent } from "../intents/classify";
import { policyGate } from "../responders/policyGate";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "../responders/macros";

/**
 * Integration tests for the triage flow.
 * Tests the complete decision logic without database calls.
 *
 * Mirrors the logic in /api/ingest/email/route.ts
 */

type TriageResult = {
  intent: string;
  confidence: number;
  action: string;
  draft: string | null;
  threadState?: string;
};

function simulateTriage(subject: string, bodyText: string): TriageResult {
  const { intent, confidence } = classifyIntent(subject, bodyText);

  let action = "ASK_CLARIFYING_QUESTIONS";
  let draft: string | null = null;
  let threadState: string | undefined;

  if (intent === "THANK_YOU_CLOSE") {
    action = "NO_REPLY";
    threadState = "RESOLVED";
  } else if (intent === "DOCS_VIDEO_MISMATCH") {
    action = "SEND_PREAPPROVED_MACRO";
    draft = macroDocsVideoMismatch();
  } else if (intent === "FIRMWARE_ACCESS_ISSUE") {
    action = "ASK_CLARIFYING_QUESTIONS";
    draft = macroFirmwareAccessClarify();
  } else if (intent === "CHARGEBACK_THREAT") {
    action = "ESCALATE_WITH_DRAFT";
    draft = "Draft only (escalate): Customer mentions chargeback/dispute. Do not promise. Ask for order # + summarize situation.";
  }

  if (draft) {
    const gate = policyGate(draft);
    if (!gate.ok) {
      action = "ESCALATE_WITH_DRAFT";
      draft = `Policy gate blocked draft due to banned language: ${gate.reasons.join(", ")}`;
    }
  }

  return { intent, confidence, action, draft, threadState };
}

describe("Triage Flow Integration", () => {
  it("FIRMWARE_ACCESS_ISSUE → ASK_CLARIFYING_QUESTIONS with macro", () => {
    const result = simulateTriage(
      "Re: Firmware update",
      "The site's kicking me off when I try to update."
    );

    expect(result.intent).toBe("FIRMWARE_ACCESS_ISSUE");
    expect(result.action).toBe("ASK_CLARIFYING_QUESTIONS");
    expect(result.draft).toContain("3 quick details");
    expect(result.draft).toContain("Which unit");
  });

  it("DOCS_VIDEO_MISMATCH → SEND_PREAPPROVED_MACRO", () => {
    const result = simulateTriage(
      "Help with update",
      "I watched the video but I didn't get the email shown in it."
    );

    expect(result.intent).toBe("DOCS_VIDEO_MISMATCH");
    expect(result.action).toBe("SEND_PREAPPROVED_MACRO");
    expect(result.draft).toContain("That video shows an example");
    expect(result.draft).toContain("which unit you have");
  });

  it("THANK_YOU_CLOSE → NO_REPLY and RESOLVED state", () => {
    const result = simulateTriage(
      "Thanks!",
      "Thank you so much for your help. Everything works now."
    );

    expect(result.intent).toBe("THANK_YOU_CLOSE");
    expect(result.action).toBe("NO_REPLY");
    expect(result.draft).toBeNull();
    expect(result.threadState).toBe("RESOLVED");
  });

  it("CHARGEBACK_THREAT → ESCALATE_WITH_DRAFT", () => {
    const result = simulateTriage(
      "Final warning",
      "I'm going to file a chargeback if this isn't resolved immediately."
    );

    expect(result.intent).toBe("CHARGEBACK_THREAT");
    expect(result.action).toBe("ESCALATE_WITH_DRAFT");
    expect(result.draft).toContain("escalate");
  });

  it("FOLLOW_UP_NO_NEW_INFO → ASK_CLARIFYING_QUESTIONS (no macro)", () => {
    const result = simulateTriage(
      "Any update?",
      "I've been waiting since September with no response."
    );

    expect(result.intent).toBe("FOLLOW_UP_NO_NEW_INFO");
    expect(result.action).toBe("ASK_CLARIFYING_QUESTIONS");
    // No macro for this intent yet
    expect(result.draft).toBeNull();
  });

  it("UNKNOWN → ASK_CLARIFYING_QUESTIONS (no macro)", () => {
    const result = simulateTriage(
      "Question",
      "Hi, I have a general question."
    );

    expect(result.intent).toBe("UNKNOWN");
    expect(result.action).toBe("ASK_CLARIFYING_QUESTIONS");
    expect(result.draft).toBeNull();
  });

  it("policy gate blocks if draft contains banned language", () => {
    // Simulate a hypothetical bad macro that promises refund
    const badDraft = "Don't worry, we will refund your order today.";
    const gate = policyGate(badDraft);

    expect(gate.ok).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  it("all pre-approved macros pass policy gate", () => {
    const macros = [
      macroDocsVideoMismatch(),
      macroDocsVideoMismatch("John"),
      macroFirmwareAccessClarify(),
    ];

    for (const macro of macros) {
      const gate = policyGate(macro);
      expect(gate.ok).toBe(true);
    }
  });
});

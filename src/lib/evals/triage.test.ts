import { describe, it, expect } from "vitest";
import { policyGate } from "../responders/policyGate";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "../responders/macros";

/**
 * Tests for triage components (policy gate and macros).
 *
 * As of Jan 2026, intent classification uses LLM via classifyWithLLM() in llmClassify.ts.
 * Full triage flow integration tests require LLM calls and are not included here.
 *
 * These tests validate:
 * - Policy gate blocking logic
 * - Pre-approved macros pass policy gate
 */

describe("Policy Gate", () => {
  it("blocks if draft contains 'will refund'", () => {
    const badDraft = "Don't worry, we will refund your order today.";
    const gate = policyGate(badDraft);
    expect(gate.ok).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  it("blocks if draft promises shipping times", () => {
    const badDraft = "Your order will arrive in 2 days.";
    const gate = policyGate(badDraft);
    expect(gate.ok).toBe(false);
  });

  it("passes normal responses", () => {
    const goodDraft = "Thanks for reaching out! Let me look into this for you.\n\n– Lina";
    const gate = policyGate(goodDraft);
    expect(gate.ok).toBe(true);
  });
});

describe("Pre-approved Macros", () => {
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

  it("DOCS_VIDEO_MISMATCH macro contains expected content", () => {
    const macro = macroDocsVideoMismatch();
    expect(macro).toContain("That video shows an example");
    expect(macro).toContain("– Lina");
  });

  it("FIRMWARE_ACCESS_CLARIFY macro contains expected content", () => {
    const macro = macroFirmwareAccessClarify();
    expect(macro).toContain("3 quick details");
    expect(macro).toContain("Which unit");
    expect(macro).toContain("– Lina");
  });
});

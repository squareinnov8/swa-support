import { describe, it, expect } from "vitest";
import { policyGate } from "../responders/policyGate";

/**
 * Regression tests for policy gate.
 * Ensures promise language is always blocked.
 *
 * DO NOT weaken these tests without explicit approval.
 */

describe("policyGate", () => {
  describe("blocks promise language", () => {
    it("blocks 'we guarantee'", () => {
      const result = policyGate("We guarantee your satisfaction with this product.");
      expect(result.ok).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("blocks 'I guarantee'", () => {
      const result = policyGate("I guarantee this will be resolved by Friday.");
      expect(result.ok).toBe(false);
    });

    it("blocks 'will refund'", () => {
      const result = policyGate("Don't worry, we will refund your purchase.");
      expect(result.ok).toBe(false);
    });

    it("blocks 'will replace'", () => {
      const result = policyGate("We will replace the defective unit immediately.");
      expect(result.ok).toBe(false);
    });

    it("blocks 'will ship today'", () => {
      const result = policyGate("Your replacement will ship today.");
      expect(result.ok).toBe(false);
    });

    it("blocks 'will ship tomorrow'", () => {
      const result = policyGate("I'll make sure it will ship tomorrow.");
      expect(result.ok).toBe(false);
    });

    it("blocks 'you will receive by'", () => {
      const result = policyGate("You will receive by next Monday.");
      expect(result.ok).toBe(false);
    });
  });

  describe("allows safe language", () => {
    it("allows asking clarifying questions", () => {
      const result = policyGate(
        "Hey — I can help, but I need 3 quick details so I don't send you the wrong file."
      );
      expect(result.ok).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it("allows pre-approved macros", () => {
      const result = policyGate(`
Hey,

That video shows an example email some customers receive, but not everyone will get that exact message depending on when the unit shipped and which update path applies.

Reply with:
1) which unit you have (Apex / G-Series / Cluster)
2) the order email or order number
3) what you see when you try to update (error or screenshot if possible)

I'll point you to the correct update method for your exact setup.

– Rob
      `);
      expect(result.ok).toBe(true);
    });

    it("allows non-committal language", () => {
      const result = policyGate(
        "I understand your frustration. Let me look into this and get back to you with options."
      );
      expect(result.ok).toBe(true);
    });

    it("allows past tense statements", () => {
      const result = policyGate("We have processed your refund.");
      expect(result.ok).toBe(true);
    });

    it("allows conditional language", () => {
      const result = policyGate(
        "If the order qualifies, we may be able to process a refund."
      );
      expect(result.ok).toBe(true);
    });
  });
});

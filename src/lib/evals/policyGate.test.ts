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
    it("allows asking clarifying questions with Lina signature", () => {
      const result = policyGate(
        "Hey — I can help, but I need 3 quick details so I don't send you the wrong file.\n\n– Lina"
      );
      expect(result.ok).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });

    it("allows pre-approved macros with Lina signature", () => {
      const result = policyGate(`
Hey,

That video shows an example email some customers receive, but not everyone will get that exact message depending on when the unit shipped and which update path applies.

Reply with:
1) which unit you have (Apex / G-Series / Cluster)
2) the order email or order number
3) what you see when you try to update (error or screenshot if possible)

I'll point you to the correct update method for your exact setup.

– Lina
      `);
      expect(result.ok).toBe(true);
    });

    it("allows non-committal language with Lina signature", () => {
      const result = policyGate(
        "I understand your frustration. Let me look into this and get back to you with options.\n\n– Lina"
      );
      expect(result.ok).toBe(true);
    });

    it("allows past tense statements with Lina signature", () => {
      const result = policyGate("We have processed your refund.\n\n– Lina");
      expect(result.ok).toBe(true);
    });

    it("allows conditional language with Lina signature", () => {
      const result = policyGate(
        "If the order qualifies, we may be able to process a refund.\n\n– Lina"
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("signature validation", () => {
    it("blocks drafts signed with Rob", () => {
      const result = policyGate(
        "Thanks for reaching out! I can help with that.\n\n– Rob"
      );
      expect(result.ok).toBe(false);
      expect(result.reasons.some(r => r.includes("Rob") || r.includes("Lina"))).toBe(true);
    });

    it("blocks drafts signed with Robert", () => {
      const result = policyGate(
        "I'll look into this for you.\n\n– Robert"
      );
      expect(result.ok).toBe(false);
    });

    it("blocks drafts without Lina signature", () => {
      const result = policyGate(
        "Thanks for your patience. We're looking into this."
      );
      expect(result.ok).toBe(false);
      expect(result.reasons.some(r => r.includes("Lina"))).toBe(true);
    });

    it("allows all dash variants for Lina signature", () => {
      // En dash
      expect(policyGate("Hello!\n\n– Lina").ok).toBe(true);
      // Em dash
      expect(policyGate("Hello!\n\n— Lina").ok).toBe(true);
      // Hyphen
      expect(policyGate("Hello!\n\n- Lina").ok).toBe(true);
    });

    it("allows Lina signature with trailing whitespace", () => {
      const result = policyGate("Thanks!\n\n– Lina  ");
      expect(result.ok).toBe(true);
    });

    it("blocks The Team signature", () => {
      const result = policyGate(
        "We appreciate your business!\n\n– The Team"
      );
      expect(result.ok).toBe(false);
    });

    it("blocks The Support signature", () => {
      const result = policyGate(
        "Thanks for contacting us.\n\n– The Support"
      );
      expect(result.ok).toBe(false);
    });
  });
});

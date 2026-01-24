import { describe, it, expect } from "vitest";
import { checkRequiredInfo, generateMissingInfoPrompt } from "../intents/requiredInfo";

/**
 * Tests for required-info gating.
 * Ensures we don't proceed without necessary information.
 */

describe("checkRequiredInfo", () => {
  describe("FIRMWARE_ACCESS_ISSUE", () => {
    it("detects missing unit type", () => {
      const result = checkRequiredInfo(
        "FIRMWARE_ACCESS_ISSUE",
        "The site keeps kicking me off when I try to log in."
      );
      expect(result.allRequiredPresent).toBe(false);
      expect(result.missingRequired.some((f) => f.id === "unit_type")).toBe(true);
    });

    it("detects present unit type (Apex)", () => {
      const result = checkRequiredInfo(
        "FIRMWARE_ACCESS_ISSUE",
        "I'm trying to update my Apex and the site kicks me off."
      );
      expect(result.allRequiredPresent).toBe(true);
      expect(result.presentFields.some((f) => f.id === "unit_type")).toBe(true);
    });

    it("detects present unit type (G-Series)", () => {
      const result = checkRequiredInfo(
        "FIRMWARE_ACCESS_ISSUE",
        "My G-Series won't let me log into the update portal."
      );
      expect(result.allRequiredPresent).toBe(true);
    });
  });

  describe("ORDER_STATUS", () => {
    it("detects missing order number", () => {
      const result = checkRequiredInfo(
        "ORDER_STATUS",
        "Where is my order? I've been waiting forever."
      );
      expect(result.allRequiredPresent).toBe(false);
      expect(result.missingRequired.some((f) => f.id === "order_number")).toBe(true);
    });

    it("detects present order number", () => {
      const result = checkRequiredInfo(
        "ORDER_STATUS",
        "What's the status of order #12345?"
      );
      expect(result.allRequiredPresent).toBe(true);
    });
  });

  describe("PART_IDENTIFICATION", () => {
    it("detects part number present", () => {
      const result = checkRequiredInfo(
        "PART_IDENTIFICATION",
        "I got a part labeled 3760, what is this?"
      );
      expect(result.allRequiredPresent).toBe(true);
      expect(result.presentFields.some((f) => f.id === "part_number")).toBe(true);
    });

    it("handles vague part questions", () => {
      const result = checkRequiredInfo(
        "PART_IDENTIFICATION",
        "There's a small plastic piece, what is it for?"
      );
      // This is vague but doesn't have a number - would still fail required check
      expect(result.allRequiredPresent).toBe(false);
    });
  });

  describe("intents without requirements", () => {
    it("THANK_YOU_CLOSE has no requirements", () => {
      const result = checkRequiredInfo("THANK_YOU_CLOSE", "Thanks for your help!");
      expect(result.allRequiredPresent).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
    });

    it("UNKNOWN has no requirements", () => {
      const result = checkRequiredInfo("UNKNOWN", "Random message");
      expect(result.allRequiredPresent).toBe(true);
    });

    it("CHARGEBACK_THREAT has no requirements (escalate always)", () => {
      const result = checkRequiredInfo("CHARGEBACK_THREAT", "I'm filing a dispute!");
      expect(result.allRequiredPresent).toBe(true);
    });
  });
});

describe("generateMissingInfoPrompt", () => {
  it("generates prompt for single missing field", () => {
    const prompt = generateMissingInfoPrompt([
      { id: "order_number", label: "Order number", patterns: [], required: true },
    ]);
    expect(prompt).toContain("Order number");
    expect(prompt).toContain("1.");
    expect(prompt).toContain("– Lina");
  });

  it("generates prompt for multiple missing fields", () => {
    const prompt = generateMissingInfoPrompt([
      { id: "unit_type", label: "Unit type (Apex/G-Series/Cluster)", patterns: [], required: true },
      { id: "order_info", label: "Order number or email", patterns: [], required: true },
    ]);
    expect(prompt).toContain("1. Unit type");
    expect(prompt).toContain("2. Order number");
  });

  it("returns empty string for no missing fields", () => {
    const prompt = generateMissingInfoPrompt([]);
    expect(prompt).toBe("");
  });
});

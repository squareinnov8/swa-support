import { describe, it, expect } from "vitest";
import { generateMissingInfoPromptFromClassification, type MissingInfoField } from "../intents/missingInfoPrompt";

/**
 * Tests for required-info detection.
 *
 * NOTE: As of Jan 2026, required info detection has moved from regex-based
 * pattern matching (requiredInfo.ts) to LLM-based contextual detection.
 * The LLM now identifies missing info during classification and returns it
 * in the ClassificationResult.missing_info field.
 *
 * The old regex-based tests are removed since that approach is deprecated.
 * Testing the LLM-based approach requires integration tests with actual LLM calls.
 */

describe("generateMissingInfoPromptFromClassification", () => {
  it("generates prompt for single missing field", () => {
    const missingInfo: MissingInfoField[] = [
      { id: "order_number", label: "What is your order number?", required: true },
    ];
    const prompt = generateMissingInfoPromptFromClassification(missingInfo);
    expect(prompt).toContain("What is your order number?");
    expect(prompt).toContain("1.");
    expect(prompt).toContain("– Lina");
  });

  it("generates prompt for multiple missing fields", () => {
    const missingInfo: MissingInfoField[] = [
      { id: "unit_type", label: "Which product do you have (Apex, G-Series, or Cluster)?", required: true },
      { id: "error_description", label: "What error message are you seeing?", required: false },
    ];
    const prompt = generateMissingInfoPromptFromClassification(missingInfo);
    expect(prompt).toContain("1. Which product do you have");
    expect(prompt).toContain("2. What error message");
  });

  it("prioritizes required fields over optional", () => {
    const missingInfo: MissingInfoField[] = [
      { id: "optional1", label: "Optional field 1", required: false },
      { id: "required1", label: "Required field 1", required: true },
      { id: "optional2", label: "Optional field 2", required: false },
    ];
    const prompt = generateMissingInfoPromptFromClassification(missingInfo);
    // Required should come first
    expect(prompt.indexOf("Required field 1")).toBeLessThan(prompt.indexOf("Optional field 1"));
  });

  it("limits to 3 questions maximum", () => {
    const missingInfo: MissingInfoField[] = [
      { id: "field1", label: "Field 1?", required: true },
      { id: "field2", label: "Field 2?", required: true },
      { id: "field3", label: "Field 3?", required: true },
      { id: "field4", label: "Field 4?", required: true },
      { id: "field5", label: "Field 5?", required: true },
    ];
    const prompt = generateMissingInfoPromptFromClassification(missingInfo);
    // Should only have 1. 2. 3. not 4. or 5.
    expect(prompt).toContain("1.");
    expect(prompt).toContain("2.");
    expect(prompt).toContain("3.");
    expect(prompt).not.toContain("4.");
  });

  it("returns empty string for no missing fields", () => {
    const prompt = generateMissingInfoPromptFromClassification([]);
    expect(prompt).toBe("");
  });

  it("returns empty string for undefined", () => {
    const prompt = generateMissingInfoPromptFromClassification(undefined as any);
    expect(prompt).toBe("");
  });
});

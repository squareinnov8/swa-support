/**
 * Tests for Promised Action Detection
 *
 * As of Jan 2026, promise detection uses LLM for accuracy but falls back
 * to keyword detection when LLM is unavailable. These tests verify the
 * fallback behavior which runs without external dependencies.
 *
 * Note: The function is now async but these tests run the fallback path
 * since OPENAI_API_KEY is not set in the test environment.
 */

import { describe, it, expect } from "vitest";
import { detectPromisedActions, type DetectedPromise } from "../responders/promisedActions";

describe("detectPromisedActions (fallback mode)", () => {
  describe("refund detection", () => {
    it("detects refund keyword", async () => {
      const draft = "Good news! Your refund has been approved.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.length).toBeGreaterThan(0);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });

    it("detects money back", async () => {
      const draft = "We'll get your money back to you shortly.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });
  });

  describe("shipping detection", () => {
    it("detects will ship", async () => {
      const draft = "Your replacement will ship within 24 hours.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });

    it("detects will send", async () => {
      const draft = "I'll send out a new unit to you right away.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });

    it("detects shipping today", async () => {
      const draft = "Good news - the order is shipping today!\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });
  });

  describe("replacement detection", () => {
    it("detects replacement keyword", async () => {
      const draft = "We'll send a replacement unit to you free of charge.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "replacement")).toBe(true);
    });
  });

  describe("follow-up detection", () => {
    it("detects follow up", async () => {
      const draft = "I'll follow up with you once I have more information.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });

    it("detects get back to you", async () => {
      const draft = "Let me check with the team and I'll get back to you shortly.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });

    it("detects will investigate", async () => {
      const draft = "I will investigate this issue with our team.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });

    it("detects will escalate", async () => {
      const draft = "I'll escalate this to our technical team for further review.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });
  });

  describe("confirmation detection", () => {
    it("detects has been approved", async () => {
      const draft = "Your return request has been approved.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "confirmation")).toBe(true);
    });

    it("detects has been processed", async () => {
      const draft = "Your warranty claim has been processed.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "confirmation")).toBe(true);
    });

    it("detects I've confirmed", async () => {
      const draft = "I've confirmed your order is in our system.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "confirmation")).toBe(true);
    });
  });

  describe("timeline detection", () => {
    it("detects within 24", async () => {
      const draft = "You should receive a response within 24 hours.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "timeline")).toBe(true);
    });

    it("detects by tomorrow", async () => {
      const draft = "I'll have an update for you by tomorrow.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "timeline")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty string", async () => {
      const promises = await detectPromisedActions("");
      expect(promises).toEqual([]);
    });

    it("returns empty array for whitespace only", async () => {
      const promises = await detectPromisedActions("   ");
      expect(promises).toEqual([]);
    });

    it("handles draft with no promises", async () => {
      const draft =
        "Thank you for your question about the APEX tuner. It's compatible with most 2015+ vehicles.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.length).toBe(0);
    });

    it("detects multiple promises in one draft", async () => {
      const draft = `Your refund has been approved.
We'll ship a replacement unit, and it's shipping today.
I'll follow up with you once it's on its way.
- Lina`;
      const promises = await detectPromisedActions(draft);
      expect(promises.length).toBeGreaterThan(1);
      const categories = promises.map((p) => p.category);
      expect(categories).toContain("refund");
      expect(categories).toContain("shipping");
      expect(categories).toContain("follow_up");
    });

    it("is case insensitive", async () => {
      const draft = "YOUR REFUND HAS BEEN APPROVED!\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });
  });

  describe("promise structure", () => {
    it("returns correct structure for detected promise", async () => {
      const draft = "I'll follow up with you tomorrow.\n\n- Lina";
      const promises = await detectPromisedActions(draft);
      expect(promises.length).toBeGreaterThan(0);
      const promise = promises[0];
      expect(promise).toHaveProperty("category");
      expect(promise).toHaveProperty("matchedText");
      expect(promise).toHaveProperty("description");
      expect(typeof promise.category).toBe("string");
      expect(typeof promise.matchedText).toBe("string");
      expect(typeof promise.description).toBe("string");
    });
  });
});

/**
 * Tests for Promised Action Detection
 *
 * Verifies that the promise detection correctly identifies
 * commitments in Lina's drafts for audit tracking.
 */

import { describe, it, expect } from "vitest";
import { detectPromisedActions, type DetectedPromise } from "../responders/promisedActions";

describe("detectPromisedActions", () => {
  describe("refund detection", () => {
    it("detects 'refund approved'", () => {
      const draft = "Good news! Your refund has been approved and will be processed within 3-5 business days.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.length).toBeGreaterThan(0);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });

    it("detects 'will process your refund'", () => {
      const draft = "I'll process your refund as soon as we receive the returned item.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });

    it("detects 'will refund'", () => {
      const draft = "We will refund the full amount to your original payment method.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });

    it("detects 'I've issued a refund'", () => {
      const draft = "I've issued a refund for the damaged item.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });
  });

  describe("shipping detection", () => {
    it("detects 'will ship'", () => {
      const draft = "Your replacement will ship within 24 hours.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });

    it("detects 'will send'", () => {
      const draft = "I'll send out a new unit to you right away.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });

    it("detects 'shipping today'", () => {
      const draft = "Good news - the order is shipping today!\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });

    it("detects 'you'll receive by'", () => {
      const draft = "Based on the tracking info, you'll receive it by Friday.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "shipping")).toBe(true);
    });
  });

  describe("replacement detection", () => {
    it("detects 'will send a replacement'", () => {
      const draft = "We'll send a replacement unit to you free of charge.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "replacement")).toBe(true);
    });

    it("detects 'replacement approved'", () => {
      const draft = "Great news! Your replacement has been approved.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "replacement")).toBe(true);
    });

    it("detects 'sending replacement'", () => {
      const draft = "We're sending a replacement right away.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "replacement")).toBe(true);
    });
  });

  describe("follow-up detection", () => {
    it("detects 'will follow up'", () => {
      const draft = "I'll follow up with you once I have more information.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });

    it("detects 'will get back to you'", () => {
      const draft = "Let me check with the team and I'll get back to you shortly.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });

    it("detects 'will check on this'", () => {
      const draft = "I'll check on this with our shipping team.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });

    it("detects 'will escalate'", () => {
      const draft = "I'll escalate this to our technical team for further review.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "follow_up")).toBe(true);
    });
  });

  describe("confirmation detection", () => {
    it("detects 'I've confirmed'", () => {
      const draft = "I've confirmed your order is in our system.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "confirmation")).toBe(true);
    });

    it("detects 'has been approved'", () => {
      const draft = "Your return request has been approved.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "confirmation")).toBe(true);
    });

    it("detects 'I've processed'", () => {
      const draft = "I've processed your warranty claim.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "confirmation")).toBe(true);
    });
  });

  describe("timeline detection", () => {
    it("detects 'within 24 hours'", () => {
      const draft = "You should receive a response within 24 hours.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "timeline")).toBe(true);
    });

    it("detects 'within 3-5 business days'", () => {
      const draft = "The refund will appear within 3 business days.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "timeline")).toBe(true);
    });

    it("detects 'by end of today'", () => {
      const draft = "I'll have an update for you by end of today.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "timeline")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for empty string", () => {
      const promises = detectPromisedActions("");
      expect(promises).toEqual([]);
    });

    it("returns empty array for null-like input", () => {
      const promises = detectPromisedActions("   ");
      expect(promises).toEqual([]);
    });

    it("handles draft with no promises", () => {
      const draft =
        "Thank you for your question about the APEX tuner. It's compatible with most 2015+ vehicles.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.length).toBe(0);
    });

    it("detects multiple promises in one draft", () => {
      const draft = `Great news! I've processed your return request and a refund has been approved.

We'll ship a replacement unit within 24 hours, and you'll receive tracking information shortly.

I'll follow up with you once it's on its way.

- Lina`;
      const promises = detectPromisedActions(draft);
      expect(promises.length).toBeGreaterThan(1);
      // Should detect refund, shipping, and follow-up
      const categories = promises.map((p) => p.category);
      expect(categories).toContain("refund");
      expect(categories).toContain("shipping");
      expect(categories).toContain("follow_up");
    });

    it("avoids duplicate descriptions for same match type", () => {
      const draft = "We will refund your order. We will refund the full amount.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      // Should only have one "Will refund" entry
      const willRefundPromises = promises.filter((p) => p.description === "Will refund");
      expect(willRefundPromises.length).toBeLessThanOrEqual(1);
    });

    it("is case insensitive", () => {
      const draft = "YOUR REFUND HAS BEEN APPROVED!\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.some((p) => p.category === "refund")).toBe(true);
    });
  });

  describe("promise structure", () => {
    it("returns correct structure for detected promise", () => {
      const draft = "I'll follow up with you tomorrow.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      expect(promises.length).toBeGreaterThan(0);
      const promise = promises[0];
      expect(promise).toHaveProperty("category");
      expect(promise).toHaveProperty("matchedText");
      expect(promise).toHaveProperty("description");
      expect(typeof promise.category).toBe("string");
      expect(typeof promise.matchedText).toBe("string");
      expect(typeof promise.description).toBe("string");
    });

    it("captures the matched text correctly", () => {
      const draft = "We will refund the amount to your card.\n\n- Lina";
      const promises = detectPromisedActions(draft);
      const refundPromise = promises.find((p) => p.category === "refund");
      expect(refundPromise).toBeDefined();
      expect(refundPromise?.matchedText.toLowerCase()).toContain("refund");
    });
  });
});

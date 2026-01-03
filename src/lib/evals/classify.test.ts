import { describe, it, expect } from "vitest";
import { classifyIntent } from "../intents/classify";

/**
 * Regression tests for intent classification.
 * These tests validate the deterministic rule-based classifier.
 *
 * Test cases based on real customer email patterns (scrubbed).
 * DO NOT modify expected behaviors without updating PROJECT_CONTEXT.md changelog.
 */

describe("classifyIntent", () => {
  // Test case a) "site kicking me off" -> FIRMWARE_ACCESS_ISSUE
  it("classifies 'site kicking me off' as FIRMWARE_ACCESS_ISSUE", () => {
    const result = classifyIntent(
      "Re: Firmware update",
      "Good Afternoon.\n\nI'm trying to find the update software but the site's kicking me off.\n\nThanks"
    );
    expect(result.intent).toBe("FIRMWARE_ACCESS_ISSUE");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  // Test case b) "promises since September" -> FOLLOW_UP_NO_NEW_INFO
  it("classifies frustrated follow-up as FOLLOW_UP_NO_NEW_INFO", () => {
    const result = classifyIntent(
      "Re: Still waiting",
      "I've been hearing promises since September and still nothing has happened. What is going on?"
    );
    expect(result.intent).toBe("FOLLOW_UP_NO_NEW_INFO");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  // Test case c) "Thank you for your help!" -> THANK_YOU_CLOSE
  it("classifies 'Thank you for your help!' as THANK_YOU_CLOSE", () => {
    const result = classifyIntent(
      "Re: Support ticket",
      "Thank you for your help! Everything is working now."
    );
    expect(result.intent).toBe("THANK_YOU_CLOSE");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // Test case d) "Happy New Year's…" -> THANK_YOU_CLOSE
  it("classifies 'Happy New Year' greeting as THANK_YOU_CLOSE", () => {
    const result = classifyIntent(
      "Happy New Year",
      "Happy New Year's to you and your team! Thanks for all the support last year."
    );
    expect(result.intent).toBe("THANK_YOU_CLOSE");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  // Test case e) "watched video but didn't get email" -> DOCS_VIDEO_MISMATCH
  it("classifies video/email mismatch as DOCS_VIDEO_MISMATCH", () => {
    const result = classifyIntent(
      "Help with instructions",
      "I watched the video and it shows clicking on an email, but I didn't get the email shown in the tutorial."
    );
    expect(result.intent).toBe("DOCS_VIDEO_MISMATCH");
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  // Test case f) "what is 3760" -> PART_IDENTIFICATION
  it("classifies part number question as PART_IDENTIFICATION", () => {
    const result = classifyIntent(
      "Question about my order",
      "I received a part labeled 3760 but I have no idea what that was for. Can you help?"
    );
    expect(result.intent).toBe("PART_IDENTIFICATION");
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  // Additional regression tests for edge cases

  it("classifies chargeback mention as CHARGEBACK_THREAT", () => {
    const result = classifyIntent(
      "Dispute",
      "If I don't get a response today I'm filing a chargeback with my bank."
    );
    expect(result.intent).toBe("CHARGEBACK_THREAT");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies 'appreciate' as THANK_YOU_CLOSE", () => {
    const result = classifyIntent(
      "Got it",
      "I really appreciate your quick response. Thanks!"
    );
    expect(result.intent).toBe("THANK_YOU_CLOSE");
  });

  it("returns UNKNOWN for ambiguous messages", () => {
    const result = classifyIntent(
      "Question",
      "Hi, I have a question about my product."
    );
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("classifies firmware update request correctly", () => {
    const result = classifyIntent(
      "Need firmware",
      "Where can I download the firmware update file for my unit?"
    );
    expect(result.intent).toBe("FIRMWARE_UPDATE_REQUEST");
  });
});

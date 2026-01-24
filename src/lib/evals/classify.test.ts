import { describe, it, expect } from "vitest";
import { classifyIntent, checkAutomatedEmail } from "../intents/classify";

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

/**
 * Tests for automated email detection.
 * These validate the checkAutomatedEmail function that runs BEFORE LLM classification.
 */
describe("checkAutomatedEmail", () => {
  // Blocked sender domains
  describe("blocked domains", () => {
    it("detects Facebook/Meta emails", () => {
      const result = checkAutomatedEmail("notification@facebookmail.com", "Your security code");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("blocked_domain");
      expect(result.matchedPattern).toBe("facebookmail.com");
    });

    it("detects Instagram emails", () => {
      const result = checkAutomatedEmail("security@instagram.com", "Instagram code: 123456");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("blocked_domain");
    });

    it("detects Google security emails", () => {
      const result = checkAutomatedEmail("no-reply@accounts.google.com", "Security alert");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("blocked_domain");
    });

    it("detects TikTok emails", () => {
      const result = checkAutomatedEmail("no-reply@tiktok.com", "TikTok notification");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("blocked_domain");
    });

    it("detects Shopify system emails", () => {
      const result = checkAutomatedEmail("notification@shopify.com", "Order update");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("blocked_domain");
    });

    it("detects SendGrid transactional emails", () => {
      const result = checkAutomatedEmail("bounce@sendgrid.net", "Delivery notification");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("blocked_domain");
    });
  });

  // Noreply sender patterns
  describe("noreply sender patterns", () => {
    it("detects noreply@ addresses", () => {
      const result = checkAutomatedEmail("noreply@example.com", "Some notification");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_sender_pattern");
    });

    it("detects no-reply@ addresses", () => {
      const result = checkAutomatedEmail("no-reply@example.com", "Account update");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_sender_pattern");
    });

    it("detects donotreply@ addresses", () => {
      const result = checkAutomatedEmail("donotreply@example.com", "Important notice");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_sender_pattern");
    });

    it("detects notifications@ addresses", () => {
      const result = checkAutomatedEmail("notifications@example.com", "New message");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_sender_pattern");
    });

    it("detects alerts@ addresses", () => {
      const result = checkAutomatedEmail("alerts@example.com", "System alert");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_sender_pattern");
    });
  });

  // Subject line patterns
  describe("subject line patterns", () => {
    it("detects security alert subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Security Alert: New sign-in detected");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects verification code subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Your verification code is 123456");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects Instagram code subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Instagram code: 123456");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects account center subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Update from Account Center");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects username changed subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Your username was changed");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects TikTok dispute protection subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Dispute Protection: Your account is protected");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects password reset subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Reset your password");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects Google critical security alert", () => {
      const result = checkAutomatedEmail("user@example.com", "Critical security alert for your account");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });

    it("detects newsletter subjects", () => {
      const result = checkAutomatedEmail("user@example.com", "Weekly Newsletter: Top Stories");
      expect(result.isAutomated).toBe(true);
      expect(result.reason).toBe("automated_subject_pattern");
    });
  });

  // Legitimate customer emails should NOT be flagged
  describe("legitimate customer emails", () => {
    it("does not flag regular customer emails", () => {
      const result = checkAutomatedEmail("john.doe@gmail.com", "Question about my order #1234");
      expect(result.isAutomated).toBe(false);
    });

    it("does not flag support questions", () => {
      const result = checkAutomatedEmail("customer@yahoo.com", "Help with installation");
      expect(result.isAutomated).toBe(false);
    });

    it("does not flag return requests", () => {
      const result = checkAutomatedEmail("jane@company.com", "I would like to return my product");
      expect(result.isAutomated).toBe(false);
    });

    it("does not flag product inquiries", () => {
      const result = checkAutomatedEmail("user@hotmail.com", "Is this compatible with my car?");
      expect(result.isAutomated).toBe(false);
    });

    it("handles missing sender email", () => {
      const result = checkAutomatedEmail(null, "Regular question");
      expect(result.isAutomated).toBe(false);
    });

    it("handles undefined sender email", () => {
      const result = checkAutomatedEmail(undefined, "Another question");
      expect(result.isAutomated).toBe(false);
    });
  });
});

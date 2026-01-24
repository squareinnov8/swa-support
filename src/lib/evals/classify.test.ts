import { describe, it, expect } from "vitest";
import { checkAutomatedEmail } from "../intents/classify";

/**
 * Tests for automated email detection.
 *
 * As of Jan 2026, intent classification uses LLM via classifyWithLLM() in llmClassify.ts.
 * The regex-based classifyIntent function has been removed.
 *
 * These tests validate the checkAutomatedEmail function that runs BEFORE LLM classification
 * to filter out platform notifications, security alerts, and other automated emails.
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

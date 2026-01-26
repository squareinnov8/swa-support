import { describe, it, expect } from "vitest";
import {
  isInternalEmail,
  extractOriginalSenderFromForward,
  extractCustomerNameFromForward,
} from "../gmail/senderResolver";

describe("Sender Resolution", () => {
  describe("isInternalEmail", () => {
    it("detects rob@squarewheelsauto.com as internal", () => {
      expect(isInternalEmail("rob@squarewheelsauto.com")).toBe(true);
    });

    it("detects support@squarewheelsauto.com as internal", () => {
      expect(isInternalEmail("support@squarewheelsauto.com")).toBe(true);
    });

    it("detects any @squarewheelsauto.com as internal", () => {
      expect(isInternalEmail("anyone@squarewheelsauto.com")).toBe(true);
    });

    it("detects internal email in Name <email> format", () => {
      expect(isInternalEmail("Rob <rob@squarewheelsauto.com>")).toBe(true);
    });

    it("does not flag customer emails as internal", () => {
      expect(isInternalEmail("customer@gmail.com")).toBe(false);
      expect(isInternalEmail("test@yahoo.com")).toBe(false);
    });

    it("handles case insensitivity", () => {
      expect(isInternalEmail("ROB@SQUAREWHEELSAUTO.COM")).toBe(true);
      expect(isInternalEmail("Rob@SquareWheelsAuto.com")).toBe(true);
    });
  });

  describe("extractOriginalSenderFromForward", () => {
    it("extracts sender from Gmail forwarded message format", () => {
      const body = `
---------- Forwarded message ---------
From: Dennis Meade <dennis.meade@yahoo.com>
Date: Sat, Jan 25, 2026 at 11:34 PM
Subject: Order Question

Hi, I have a question about my order...
`;
      expect(extractOriginalSenderFromForward(body, "Fwd: Order Question")).toBe(
        "dennis.meade@yahoo.com"
      );
    });

    it("extracts sender from Shopify order format", () => {
      const body = `
Customer Email: john.smith@gmail.com
Paid via Payment ID: 4094JohnSmith
John Smith placed order #4094 on Jan 26 at 4:38 am.
`;
      expect(extractOriginalSenderFromForward(body, "[squarewheels] Order #4094")).toBe(
        "john.smith@gmail.com"
      );
    });

    it("extracts sender from generic forward with From: header", () => {
      const body = `
From: customer@example.com
To: support@squarewheelsauto.com
Subject: Help needed

I need help with my product...
`;
      expect(extractOriginalSenderFromForward(body, "Fwd: Help needed")).toBe(
        "customer@example.com"
      );
    });

    it("does not extract internal emails as original sender", () => {
      const body = `
---------- Forwarded message ---------
From: support@squarewheelsauto.com
Date: Sat, Jan 25, 2026

Some internal message...
`;
      // Should return null because extracted email is internal
      expect(extractOriginalSenderFromForward(body, "Fwd: Internal")).toBe(null);
    });

    it("returns null when no sender found", () => {
      const body = "Just a regular message with no forwarding info";
      expect(extractOriginalSenderFromForward(body, "Subject")).toBe(null);
    });
  });

  describe("extractCustomerNameFromForward", () => {
    it("extracts name from From: Name <email> format", () => {
      const body = `
From: Dennis Meade <dennis.meade@yahoo.com>
Date: Sat, Jan 25, 2026
`;
      expect(extractCustomerNameFromForward(body)).toBe("Dennis Meade");
    });

    it("extracts name from Shopify order format", () => {
      const body = `
Customer Email: john.smith@gmail.com
John Smith placed order #4094 on Jan 26 at 4:38 am.
`;
      expect(extractCustomerNameFromForward(body)).toBe("John Smith");
    });

    it("returns null when no name found", () => {
      const body = "Just a regular message";
      expect(extractCustomerNameFromForward(body)).toBe(null);
    });
  });
});

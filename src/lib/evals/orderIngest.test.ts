import { describe, it, expect } from "vitest";
import { isOrderEmail, parseOrderEmail } from "../orders/parser";

describe("Order Email Detection", () => {
  describe("isOrderEmail", () => {
    it("detects direct order emails from support@", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const from = "support@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(true);
    });

    it("detects forwarded order emails (Fwd: prefix)", () => {
      const subject = "Fwd: [squarewheels] Order #4093 placed by Dennis Meade";
      const from = "rob@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(true);
    });

    it("detects forwarded order emails (FW: prefix)", () => {
      const subject = "FW: [squarewheels] Order #4093 placed by Dennis Meade";
      const from = "rob@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(true);
    });

    it("detects replied order emails (Re: prefix)", () => {
      const subject = "Re: [squarewheels] Order #4093 placed by Dennis Meade";
      const from = "support@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(true);
    });

    it("is case insensitive on subject pattern", () => {
      const subject = "[SQUAREWHEELS] Order #4093 placed by Dennis Meade";
      const from = "support@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(true);
    });

    it("rejects emails from unknown senders", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const from = "random@gmail.com";
      expect(isOrderEmail(subject, from)).toBe(false);
    });

    it("rejects non-order subjects", () => {
      const subject = "Question about my order";
      const from = "support@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(false);
    });

    it("rejects cancellation emails", () => {
      const subject = "Cancellation of order #4092";
      const from = "support@squarewheelsauto.com";
      expect(isOrderEmail(subject, from)).toBe(false);
    });

    it("accepts emails from Shopify directly", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const from = "noreply@shopify.com";
      expect(isOrderEmail(subject, from)).toBe(true);
    });
  });

  describe("parseOrderEmail", () => {
    const sampleBody = `
Customer Email: dennis.meade@yahoo.com
Paid via Payment ID: 4093DennisMeade
Dennis Meade placed order #4093 on Jan 24 at 11:34 pm.

Audi R8 (2007-2015) Android Head Unit | SquareWheels G-Series

Shipping address
Dennis Meade
192 Waypoint
Tustin, California 92782
United States
+17025691987
`;

    it("parses order number from direct subject", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result).not.toBeNull();
      expect(result?.orderNumber).toBe("4093");
    });

    it("parses order number from forwarded subject", () => {
      const subject = "Fwd: [squarewheels] Order #4093 placed by Dennis Meade";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result).not.toBeNull();
      expect(result?.orderNumber).toBe("4093");
    });

    it("parses customer name from subject", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result?.customerName).toBe("Dennis Meade");
    });

    it("parses customer email from body", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result?.customerEmail).toBe("dennis.meade@yahoo.com");
    });

    it("parses product title from body", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result?.productTitle).toContain("Audi R8");
    });

    it("parses shipping address", () => {
      const subject = "[squarewheels] Order #4093 placed by Dennis Meade";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result?.shippingAddress.city).toBe("Tustin");
      expect(result?.shippingAddress.state).toBe("California");
      expect(result?.shippingAddress.zip).toBe("92782");
    });

    it("returns null for non-order subjects", () => {
      const subject = "Question about order";
      const result = parseOrderEmail(subject, sampleBody);
      expect(result).toBeNull();
    });
  });
});

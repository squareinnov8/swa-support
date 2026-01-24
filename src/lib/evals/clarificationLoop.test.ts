import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for clarification loop detection.
 * These tests validate the pattern matching for detecting repeated clarifying questions.
 */

// Mock supabase before importing the module
vi.mock("@/lib/db", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
    })),
  },
}));

import {
  detectClarificationLoop,
  getCategoryDescription,
  CLARIFICATION_LOOP_ESCALATION_DRAFT,
  type ClarificationCategory,
} from "../threads/clarificationLoopDetector";

// Re-import supabase mock to manipulate it
import { supabase } from "@/lib/db";

describe("getCategoryDescription", () => {
  it("returns human-readable descriptions", () => {
    expect(getCategoryDescription("order_number")).toBe("order number");
    expect(getCategoryDescription("vehicle_info")).toBe("vehicle information");
    expect(getCategoryDescription("product_unit_type")).toBe("product/unit type");
    expect(getCategoryDescription("photos_screenshots")).toBe("photos or screenshots");
    expect(getCategoryDescription("error_message")).toBe("error message details");
  });
});

describe("CLARIFICATION_LOOP_ESCALATION_DRAFT", () => {
  it("contains the expected escalation message", () => {
    expect(CLARIFICATION_LOOP_ESCALATION_DRAFT).toContain("Rob");
    expect(CLARIFICATION_LOOP_ESCALATION_DRAFT).toContain("Lina");
    expect(CLARIFICATION_LOOP_ESCALATION_DRAFT).toContain("trouble");
  });
});

describe("detectClarificationLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no loop when no messages exist", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(false);
    expect(result.repeatedCategory).toBeNull();
    expect(result.occurrences).toBe(0);
  });

  it("returns no loop with single clarifying question", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "Could you provide your order number?", created_at: "2024-01-01" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(false);
    expect(result.allCategoryCounts.order_number).toBe(1);
  });

  it("detects loop when order number asked twice", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "Could you provide your order number please?", created_at: "2024-01-01" },
                { body_text: "I still need your order number to help you.", created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(true);
    expect(result.repeatedCategory).toBe("order_number");
    expect(result.occurrences).toBe(2);
  });

  it("detects loop when vehicle info asked twice", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "What vehicle do you have?", created_at: "2024-01-01" },
                { body_text: "What's your year, make, and model?", created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(true);
    expect(result.repeatedCategory).toBe("vehicle_info");
    expect(result.occurrences).toBe(2);
  });

  it("detects loop when product/unit type asked twice", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "Which unit do you have? Apex or G-Series?", created_at: "2024-01-01" },
                { body_text: "Is it an Apex or G-Series?", created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(true);
    expect(result.repeatedCategory).toBe("product_unit_type");
    expect(result.occurrences).toBe(2);
  });

  it("detects loop when photos asked twice", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "Could you send me a photo of the issue?", created_at: "2024-01-01" },
                { body_text: "Please attach a screenshot showing the error.", created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(true);
    expect(result.repeatedCategory).toBe("photos_screenshots");
    expect(result.occurrences).toBe(2);
  });

  it("detects loop when error message asked twice", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "What error message are you seeing?", created_at: "2024-01-01" },
                { body_text: "What does the error say?", created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(true);
    expect(result.repeatedCategory).toBe("error_message");
    expect(result.occurrences).toBe(2);
  });

  it("does not flag different categories as a loop", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "Could you provide your order number?", created_at: "2024-01-01" },
                { body_text: "What vehicle do you have?", created_at: "2024-01-02" },
                { body_text: "Which unit - Apex or G-Series?", created_at: "2024-01-03" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(false);
    expect(result.allCategoryCounts.order_number).toBe(1);
    expect(result.allCategoryCounts.vehicle_info).toBe(1);
    expect(result.allCategoryCounts.product_unit_type).toBe(1);
  });

  it("returns most repeated category when multiple loops exist", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: "Could you provide your order number?", created_at: "2024-01-01" },
                { body_text: "What's your order number?", created_at: "2024-01-02" },
                { body_text: "What vehicle do you have?", created_at: "2024-01-03" },
                { body_text: "What's your year and make?", created_at: "2024-01-04" },
                { body_text: "I still need the order number.", created_at: "2024-01-05" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(true);
    expect(result.repeatedCategory).toBe("order_number");
    expect(result.occurrences).toBe(3);
  });

  it("handles database errors gracefully", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Database error" },
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(false);
    expect(result.repeatedCategory).toBeNull();
  });

  it("handles null body_text gracefully", async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: null, created_at: "2024-01-01" },
                { body_text: "Could you provide your order number?", created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");

    expect(result.loopDetected).toBe(false);
    expect(result.allCategoryCounts.order_number).toBe(1);
  });
});

describe("pattern matching for clarification categories", () => {
  // Helper to check if a message would be detected as asking for a specific category
  async function checkDetection(message: string, expectedCategory: ClarificationCategory): Promise<boolean> {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { body_text: message, created_at: "2024-01-01" },
                { body_text: message, created_at: "2024-01-02" },
              ],
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const result = await detectClarificationLoop("thread-1");
    return result.loopDetected && result.repeatedCategory === expectedCategory;
  }

  describe("order_number patterns", () => {
    it.each([
      "Could you provide your order number?",
      "What's your order #?",
      "I need your order info to help.",
      "Can you confirm your order number?",
      "Which order is this regarding?",
      "Order number please so I can look this up",
    ])("detects: %s", async (message) => {
      expect(await checkDetection(message, "order_number")).toBe(true);
    });
  });

  describe("vehicle_info patterns", () => {
    it.each([
      "What vehicle do you have?",
      "What's your car make and model?",
      "Could you tell me your vehicle info?",
      "What year, make, and model?",
      "What kind of truck is it?",
      "I need your vehicle details.",
    ])("detects: %s", async (message) => {
      expect(await checkDetection(message, "vehicle_info")).toBe(true);
    });
  });

  describe("product_unit_type patterns", () => {
    it.each([
      "Which product do you have?",
      "Is it an Apex or G-Series?",
      "What unit type is it?",
      "Which model are you using?",
      "Could you tell me your unit type?",
      "Apex or versus G-Series?",
    ])("detects: %s", async (message) => {
      expect(await checkDetection(message, "product_unit_type")).toBe(true);
    });
  });

  describe("photos_screenshots patterns", () => {
    it.each([
      "Could you send me a photo?",
      "Please share a screenshot of the error.",
      "Can you attach a picture?",
      "Photo of the issue would help.",
      "Send me a screenshot showing the problem.",
      "Please attach a photo of what you're seeing.",
    ])("detects: %s", async (message) => {
      expect(await checkDetection(message, "photos_screenshots")).toBe(true);
    });
  });

  describe("error_message patterns", () => {
    it.each([
      "What error message do you see?",
      "What does the error say?",
      "Could you share the error message?",
      "What appears on screen?",
      "Describe the error you're getting.",
      "What are you seeing?",
    ])("detects: %s", async (message) => {
      expect(await checkDetection(message, "error_message")).toBe(true);
    });
  });
});

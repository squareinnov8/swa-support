import { describe, it, expect } from "vitest";
import {
  calculateConfidence,
  getConfidenceBreakdown,
  shouldAutoApprove,
  shouldAutoReject,
  needsAttention,
  sortForReview,
  getReviewStats,
} from "../import/confidence";
import type { LLMAnalysisResult, ProposedDoc } from "../import/types";
import { CONFIDENCE_THRESHOLDS, QUALITY_THRESHOLDS } from "../import/types";

/**
 * Tests for confidence scoring module.
 * Ensures correct categorization of proposed docs for review.
 */

describe("calculateConfidence", () => {
  it("returns 0 for empty analysis", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: null,
      category_confidence: 0,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0,
      quality_issues: [],
      summary: "",
    };

    expect(calculateConfidence(analysis)).toBe(0);
  });

  it("returns max 1.0 for perfect analysis", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: "firmware-updates",
      category_confidence: 1.0,
      intent_tags: ["FIRMWARE_UPDATE_REQUEST"],
      vehicle_tags: ["Infiniti Q50"],
      product_tags: ["APEX"],
      content_quality: 1.0,
      quality_issues: [],
      summary: "Great content",
    };

    expect(calculateConfidence(analysis)).toBe(1.0);
  });

  it("weights category confidence at 40%", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: "faqs",
      category_confidence: 1.0,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0,
      quality_issues: [],
      summary: "",
    };

    expect(calculateConfidence(analysis)).toBeCloseTo(0.4, 2);
  });

  it("weights content quality at 40%", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: null,
      category_confidence: 0,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 1.0,
      quality_issues: [],
      summary: "",
    };

    expect(calculateConfidence(analysis)).toBeCloseTo(0.4, 2);
  });

  it("adds 10% for intent tags", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: null,
      category_confidence: 0,
      intent_tags: ["UNKNOWN"],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0,
      quality_issues: [],
      summary: "",
    };

    expect(calculateConfidence(analysis)).toBeCloseTo(0.1, 2);
  });

  it("adds 10% for vehicle or product tags", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: null,
      category_confidence: 0,
      intent_tags: [],
      vehicle_tags: ["All"],
      product_tags: [],
      content_quality: 0,
      quality_issues: [],
      summary: "",
    };

    expect(calculateConfidence(analysis)).toBeCloseTo(0.1, 2);
  });

  it("calculates realistic scenario correctly", () => {
    // Category 0.7 * 0.4 = 0.28
    // Quality 0.8 * 0.4 = 0.32
    // Intent tags = 0.1
    // No vehicle/product = 0
    // Total = 0.70
    const analysis: LLMAnalysisResult = {
      suggested_category: "troubleshooting",
      category_confidence: 0.7,
      intent_tags: ["FUNCTIONALITY_BUG"],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0.8,
      quality_issues: [],
      summary: "Troubleshooting guide",
    };

    expect(calculateConfidence(analysis)).toBeCloseTo(0.7, 2);
  });
});

describe("getConfidenceBreakdown", () => {
  it("returns detailed breakdown", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: "policies",
      category_confidence: 0.9,
      intent_tags: ["RETURN_REFUND_REQUEST"],
      vehicle_tags: [],
      product_tags: ["APEX"],
      content_quality: 0.85,
      quality_issues: [],
      summary: "Return policy",
    };

    const breakdown = getConfidenceBreakdown(analysis);

    expect(breakdown.categoryScore).toBeCloseTo(0.36, 2); // 0.9 * 0.4
    expect(breakdown.qualityScore).toBeCloseTo(0.34, 2); // 0.85 * 0.4
    expect(breakdown.intentScore).toBe(0.1);
    expect(breakdown.tagScore).toBe(0.1);
    expect(breakdown.totalScore).toBeCloseTo(0.9, 2);
  });

  it("recommends auto_approve for high confidence", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: "firmware-updates",
      category_confidence: 0.95,
      intent_tags: ["FIRMWARE_UPDATE_REQUEST"],
      vehicle_tags: ["All"],
      product_tags: ["APEX"],
      content_quality: 0.95,
      quality_issues: [],
      summary: "Firmware guide",
    };

    const breakdown = getConfidenceBreakdown(analysis);
    expect(breakdown.recommendation).toBe("auto_approve");
  });

  it("recommends auto_reject for low quality", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: "faqs",
      category_confidence: 0.8,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0.2, // Below MIN_ACCEPTABLE
      quality_issues: ["Incomplete content", "Internal notes only"],
      summary: "Poor quality",
    };

    const breakdown = getConfidenceBreakdown(analysis);
    expect(breakdown.recommendation).toBe("auto_reject");
  });

  it("recommends needs_review for medium confidence", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: "troubleshooting",
      category_confidence: 0.6,
      intent_tags: ["FUNCTIONALITY_BUG"],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0.7,
      quality_issues: [],
      summary: "Needs review",
    };

    const breakdown = getConfidenceBreakdown(analysis);
    expect(breakdown.recommendation).toBe("needs_review");
  });

  it("recommends flag_attention for low confidence", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: null,
      category_confidence: 0.2,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0.5, // Just above reject threshold
      quality_issues: ["Unclear topic"],
      summary: "Needs attention",
    };

    const breakdown = getConfidenceBreakdown(analysis);
    expect(breakdown.recommendation).toBe("flag_attention");
  });

  it("includes reasons for low scores", () => {
    const analysis: LLMAnalysisResult = {
      suggested_category: null,
      category_confidence: 0.3,
      intent_tags: [],
      vehicle_tags: [],
      product_tags: [],
      content_quality: 0.5,
      quality_issues: ["Too short", "Missing context"],
      summary: "Problem doc",
    };

    const breakdown = getConfidenceBreakdown(analysis);
    expect(breakdown.reasons).toContain("Low category confidence");
    expect(breakdown.reasons).toContain("No intent tags identified");
    expect(breakdown.reasons).toContain("No category could be determined");
  });
});

// Helper to create mock ProposedDoc
function createMockDoc(overrides: Partial<ProposedDoc> = {}): ProposedDoc {
  return {
    id: "test-id",
    import_job_id: null,
    source: "notion",
    source_id: null,
    source_url: null,
    title: "Test Doc",
    body: "Test content",
    suggested_category_id: null,
    suggested_intent_tags: [],
    suggested_vehicle_tags: [],
    suggested_product_tags: [],
    categorization_confidence: 0.5,
    content_quality_score: 0.7,
    llm_analysis: null,
    status: "pending",
    review_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    published_doc_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("shouldAutoApprove", () => {
  it("returns true for high confidence + quality", () => {
    const doc = createMockDoc({
      categorization_confidence: CONFIDENCE_THRESHOLDS.AUTO_APPROVE,
      content_quality_score: 0.9,
    });

    expect(shouldAutoApprove(doc)).toBe(true);
  });

  it("returns false for low quality even with high confidence", () => {
    const doc = createMockDoc({
      categorization_confidence: 0.95,
      content_quality_score: QUALITY_THRESHOLDS.MIN_ACCEPTABLE - 0.1,
    });

    expect(shouldAutoApprove(doc)).toBe(false);
  });

  it("returns false for confidence below threshold", () => {
    const doc = createMockDoc({
      categorization_confidence: CONFIDENCE_THRESHOLDS.AUTO_APPROVE - 0.1,
      content_quality_score: 0.9,
    });

    expect(shouldAutoApprove(doc)).toBe(false);
  });
});

describe("shouldAutoReject", () => {
  it("returns true for very low quality", () => {
    const doc = createMockDoc({
      content_quality_score: QUALITY_THRESHOLDS.MIN_ACCEPTABLE - 0.1,
    });

    expect(shouldAutoReject(doc)).toBe(true);
  });

  it("returns false for acceptable quality", () => {
    const doc = createMockDoc({
      content_quality_score: QUALITY_THRESHOLDS.MIN_ACCEPTABLE,
    });

    expect(shouldAutoReject(doc)).toBe(false);
  });
});

describe("needsAttention", () => {
  it("returns true for low confidence", () => {
    const doc = createMockDoc({
      categorization_confidence: CONFIDENCE_THRESHOLDS.FLAG_ATTENTION - 0.1,
      content_quality_score: 0.8,
    });

    expect(needsAttention(doc)).toBe(true);
  });

  it("returns true for low quality", () => {
    const doc = createMockDoc({
      categorization_confidence: 0.7,
      content_quality_score: 0.5,
    });

    expect(needsAttention(doc)).toBe(true);
  });

  it("returns false for good scores", () => {
    const doc = createMockDoc({
      categorization_confidence: 0.7,
      content_quality_score: 0.8,
    });

    expect(needsAttention(doc)).toBe(false);
  });
});

describe("sortForReview", () => {
  it("puts attention-needed docs first", () => {
    const docs = [
      createMockDoc({ id: "high", categorization_confidence: 0.9, content_quality_score: 0.9 }),
      createMockDoc({ id: "low", categorization_confidence: 0.3, content_quality_score: 0.5 }),
      createMockDoc({ id: "medium", categorization_confidence: 0.6, content_quality_score: 0.7 }),
    ];

    const sorted = sortForReview(docs);

    expect(sorted[0].id).toBe("low"); // needs attention
    expect(sorted[1].id).toBe("medium"); // next lowest confidence
    expect(sorted[2].id).toBe("high"); // highest confidence last
  });

  it("maintains order for equal priority", () => {
    const docs = [
      createMockDoc({ id: "a", categorization_confidence: 0.6, content_quality_score: 0.7 }),
      createMockDoc({ id: "b", categorization_confidence: 0.6, content_quality_score: 0.7 }),
    ];

    const sorted = sortForReview(docs);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });
});

describe("getReviewStats", () => {
  it("calculates correct stats for mixed docs", () => {
    const docs = [
      // Auto-approve (high confidence + quality)
      createMockDoc({ categorization_confidence: 0.9, content_quality_score: 0.9 }),
      createMockDoc({ categorization_confidence: 0.88, content_quality_score: 0.85 }),
      // Auto-reject (low quality)
      createMockDoc({ categorization_confidence: 0.9, content_quality_score: 0.3 }),
      // Needs attention (low confidence)
      createMockDoc({ categorization_confidence: 0.3, content_quality_score: 0.6 }),
      // Regular review needed
      createMockDoc({ categorization_confidence: 0.6, content_quality_score: 0.7 }),
      createMockDoc({ categorization_confidence: 0.7, content_quality_score: 0.75 }),
    ];

    const stats = getReviewStats(docs);

    expect(stats.total).toBe(6);
    expect(stats.autoApprove).toBe(2);
    expect(stats.autoReject).toBe(1);
    expect(stats.needsReview).toBe(3); // includes needsAttention
    expect(stats.needsAttention).toBe(1);
  });

  it("handles empty array", () => {
    const stats = getReviewStats([]);

    expect(stats.total).toBe(0);
    expect(stats.autoApprove).toBe(0);
    expect(stats.autoReject).toBe(0);
    expect(stats.needsReview).toBe(0);
    expect(stats.needsAttention).toBe(0);
  });
});

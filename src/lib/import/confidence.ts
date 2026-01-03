/**
 * Confidence Scoring
 *
 * Calculates confidence scores for LLM-analyzed documents
 * to determine if they should be auto-approved or need review.
 */

import type { LLMAnalysisResult, ProposedDoc } from "./types";
import { CONFIDENCE_THRESHOLDS, QUALITY_THRESHOLDS } from "./types";

/**
 * Confidence score breakdown for transparency
 */
export type ConfidenceBreakdown = {
  categoryScore: number;
  qualityScore: number;
  intentScore: number;
  tagScore: number;
  totalScore: number;
  recommendation: "auto_approve" | "needs_review" | "flag_attention" | "auto_reject";
  reasons: string[];
};

/**
 * Calculate overall confidence from LLM analysis
 *
 * Weights:
 * - Category confidence: 40%
 * - Content quality: 40%
 * - Has intent tags: 10%
 * - Has vehicle/product tags: 10%
 */
export function calculateConfidence(analysis: LLMAnalysisResult): number {
  let score = 0;

  // Category confidence (40% weight)
  score += analysis.category_confidence * 0.4;

  // Content quality (40% weight)
  score += analysis.content_quality * 0.4;

  // Has intent tags (10% weight)
  if (analysis.intent_tags.length > 0) {
    score += 0.1;
  }

  // Has vehicle/product tags (10% weight)
  if (analysis.vehicle_tags.length > 0 || analysis.product_tags.length > 0) {
    score += 0.1;
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Get detailed confidence breakdown
 */
export function getConfidenceBreakdown(analysis: LLMAnalysisResult): ConfidenceBreakdown {
  const categoryScore = analysis.category_confidence * 0.4;
  const qualityScore = analysis.content_quality * 0.4;
  const intentScore = analysis.intent_tags.length > 0 ? 0.1 : 0;
  const tagScore =
    analysis.vehicle_tags.length > 0 || analysis.product_tags.length > 0 ? 0.1 : 0;

  const totalScore = Math.min(1, Math.max(0, categoryScore + qualityScore + intentScore + tagScore));
  const reasons: string[] = [];

  // Build reasons
  if (analysis.category_confidence < 0.5) {
    reasons.push("Low category confidence");
  }
  if (analysis.content_quality < QUALITY_THRESHOLDS.MIN_ACCEPTABLE) {
    reasons.push("Content quality below minimum threshold");
  }
  if (analysis.quality_issues.length > 0) {
    reasons.push(`Quality issues: ${analysis.quality_issues.join(", ")}`);
  }
  if (analysis.intent_tags.length === 0) {
    reasons.push("No intent tags identified");
  }
  if (!analysis.suggested_category) {
    reasons.push("No category could be determined");
  }

  // Determine recommendation
  let recommendation: ConfidenceBreakdown["recommendation"];

  if (analysis.content_quality < QUALITY_THRESHOLDS.MIN_ACCEPTABLE) {
    recommendation = "auto_reject";
    reasons.unshift("Auto-reject: Quality too low");
  } else if (totalScore >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE) {
    recommendation = "auto_approve";
  } else if (totalScore < CONFIDENCE_THRESHOLDS.FLAG_ATTENTION) {
    recommendation = "flag_attention";
    reasons.unshift("Flagged for attention: Low overall confidence");
  } else {
    recommendation = "needs_review";
  }

  return {
    categoryScore,
    qualityScore,
    intentScore,
    tagScore,
    totalScore,
    recommendation,
    reasons,
  };
}

/**
 * Determine if a proposed doc should be auto-approved
 */
export function shouldAutoApprove(doc: ProposedDoc): boolean {
  if (doc.content_quality_score < QUALITY_THRESHOLDS.MIN_ACCEPTABLE) {
    return false;
  }
  return doc.categorization_confidence >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE;
}

/**
 * Determine if a proposed doc should be auto-rejected
 */
export function shouldAutoReject(doc: ProposedDoc): boolean {
  return doc.content_quality_score < QUALITY_THRESHOLDS.MIN_ACCEPTABLE;
}

/**
 * Determine if a proposed doc needs extra attention
 */
export function needsAttention(doc: ProposedDoc): boolean {
  return (
    doc.categorization_confidence < CONFIDENCE_THRESHOLDS.FLAG_ATTENTION ||
    doc.content_quality_score < 0.6
  );
}

/**
 * Sort proposed docs for review (highest priority first)
 * Priority: needs_attention > low_confidence > high_confidence
 */
export function sortForReview(docs: ProposedDoc[]): ProposedDoc[] {
  return [...docs].sort((a, b) => {
    // Needs attention first
    const aAttention = needsAttention(a);
    const bAttention = needsAttention(b);
    if (aAttention && !bAttention) return -1;
    if (!aAttention && bAttention) return 1;

    // Then by confidence (lower first - needs more review)
    return a.categorization_confidence - b.categorization_confidence;
  });
}

/**
 * Get review stats for a batch of proposed docs
 */
export function getReviewStats(docs: ProposedDoc[]): {
  total: number;
  autoApprove: number;
  autoReject: number;
  needsReview: number;
  needsAttention: number;
} {
  const stats = {
    total: docs.length,
    autoApprove: 0,
    autoReject: 0,
    needsReview: 0,
    needsAttention: 0,
  };

  for (const doc of docs) {
    if (shouldAutoReject(doc)) {
      stats.autoReject++;
    } else if (shouldAutoApprove(doc)) {
      stats.autoApprove++;
    } else if (needsAttention(doc)) {
      stats.needsAttention++;
      stats.needsReview++;
    } else {
      stats.needsReview++;
    }
  }

  return stats;
}

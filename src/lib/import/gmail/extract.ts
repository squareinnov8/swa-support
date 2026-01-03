/**
 * Gmail Resolution Extraction
 *
 * Extracts KB-worthy resolutions from support email threads
 * using LLM analysis.
 */

import { extractGmailResolution } from "../analyze";
import { formatThreadAsText, type GmailThread } from "./fetcher";
import type { GmailExtractionResult } from "../types";

/**
 * Extraction result with thread context
 */
export type ThreadExtractionResult = {
  threadId: string;
  subject: string;
  messageCount: number;
  extraction: GmailExtractionResult;
  isUsable: boolean;
  skipReason?: string;
};

/**
 * Extract resolution from a single thread
 */
export async function extractFromThread(thread: GmailThread): Promise<ThreadExtractionResult> {
  // Format thread for LLM
  const threadText = formatThreadAsText(thread);

  // Run LLM extraction
  const extraction = await extractGmailResolution(threadText);

  // Determine if extraction is usable
  const { isUsable, skipReason } = evaluateExtraction(extraction, thread);

  return {
    threadId: thread.threadId,
    subject: thread.subject,
    messageCount: thread.messages.length,
    extraction,
    isUsable,
    skipReason,
  };
}

/**
 * Extract resolutions from multiple threads (with rate limiting)
 */
export async function extractFromThreads(
  threads: GmailThread[],
  options: {
    delayMs?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<ThreadExtractionResult[]> {
  const { delayMs = 500, onProgress } = options;
  const results: ThreadExtractionResult[] = [];

  for (let i = 0; i < threads.length; i++) {
    const result = await extractFromThread(threads[i]);
    results.push(result);

    onProgress?.(i + 1, threads.length);

    if (i < threads.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

/**
 * Evaluate if an extraction is usable for KB
 */
function evaluateExtraction(
  extraction: GmailExtractionResult,
  thread: GmailThread
): { isUsable: boolean; skipReason?: string } {
  // Not resolved
  if (!extraction.is_resolved) {
    return { isUsable: false, skipReason: "Thread not resolved" };
  }

  // Low confidence
  if (extraction.confidence < 0.5) {
    return { isUsable: false, skipReason: "Low extraction confidence" };
  }

  // Empty KB body
  if (!extraction.kb_body || extraction.kb_body.trim().length < 50) {
    return { isUsable: false, skipReason: "Extracted content too short" };
  }

  // Single message thread (might not be resolved)
  if (thread.messages.length < 2) {
    return { isUsable: false, skipReason: "Single message thread" };
  }

  // Check for common non-KB patterns
  const lowerBody = extraction.kb_body.toLowerCase();
  const skipPatterns = [
    "checking on this",
    "following up",
    "any update",
    "please let me know",
    "i'll get back to you",
    "looking into this",
  ];

  for (const pattern of skipPatterns) {
    if (lowerBody.includes(pattern)) {
      return { isUsable: false, skipReason: "Content appears unresolved" };
    }
  }

  return { isUsable: true };
}

/**
 * Filter and rank extractions by quality
 */
export function rankExtractions(extractions: ThreadExtractionResult[]): ThreadExtractionResult[] {
  return extractions
    .filter((e) => e.isUsable)
    .sort((a, b) => {
      // Sort by confidence (highest first)
      const confDiff = b.extraction.confidence - a.extraction.confidence;
      if (Math.abs(confDiff) > 0.1) return confDiff;

      // Then by content length (longer is usually better)
      return b.extraction.kb_body.length - a.extraction.kb_body.length;
    });
}

/**
 * Deduplicate similar extractions (by title/issue similarity)
 */
export function deduplicateExtractions(
  extractions: ThreadExtractionResult[]
): ThreadExtractionResult[] {
  const seen = new Map<string, ThreadExtractionResult>();

  for (const extraction of extractions) {
    // Create a normalized key from the issue description
    const key = normalizeForComparison(extraction.extraction.customer_issue);

    // Keep the higher confidence extraction for duplicates
    const existing = seen.get(key);
    if (!existing || extraction.extraction.confidence > existing.extraction.confidence) {
      seen.set(key, extraction);
    }
  }

  return Array.from(seen.values());
}

/**
 * Normalize text for comparison
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100); // First 100 chars for comparison
}

/**
 * Get extraction statistics
 */
export function getExtractionStats(extractions: ThreadExtractionResult[]): {
  total: number;
  usable: number;
  notResolved: number;
  lowConfidence: number;
  tooShort: number;
  other: number;
  avgConfidence: number;
} {
  const stats = {
    total: extractions.length,
    usable: 0,
    notResolved: 0,
    lowConfidence: 0,
    tooShort: 0,
    other: 0,
    avgConfidence: 0,
  };

  let totalConfidence = 0;

  for (const e of extractions) {
    totalConfidence += e.extraction.confidence;

    if (e.isUsable) {
      stats.usable++;
    } else {
      switch (e.skipReason) {
        case "Thread not resolved":
          stats.notResolved++;
          break;
        case "Low extraction confidence":
          stats.lowConfidence++;
          break;
        case "Extracted content too short":
          stats.tooShort++;
          break;
        default:
          stats.other++;
      }
    }
  }

  stats.avgConfidence = extractions.length > 0 ? totalConfidence / extractions.length : 0;

  return stats;
}

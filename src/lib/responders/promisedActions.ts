/**
 * Promised Action Detection
 *
 * Detects when Lina's drafts contain commitments/promises that should be
 * tracked for visibility and audit purposes. These are logged to the events
 * table for later review.
 *
 * This is a lightweight detection system - it doesn't block anything,
 * just creates an audit trail for promises made to customers.
 *
 * As of Jan 2026, this uses LLM-based detection for better accuracy across
 * languages and phrasings, with regex fallback for when LLM is unavailable.
 */

import { isLLMConfigured, getClient } from "@/lib/llm/client";

/**
 * Categories of promises that can be detected
 */
export type PromiseCategory =
  | "refund"
  | "shipping"
  | "replacement"
  | "follow_up"
  | "confirmation"
  | "timeline"
  | "other";

/**
 * A detected promise in the draft text
 */
export type DetectedPromise = {
  /** The category of promise */
  category: PromiseCategory;
  /** The matched text from the draft */
  matchedText: string;
  /** Human-readable description of the promise type */
  description: string;
};

/**
 * Detect promised actions in a draft text using LLM.
 * Falls back to basic keyword detection if LLM is unavailable.
 *
 * @param draftText - The draft text to analyze
 * @returns Array of detected promises
 */
export async function detectPromisedActions(draftText: string): Promise<DetectedPromise[]> {
  if (!draftText || draftText.trim().length === 0) {
    return [];
  }

  // Try LLM-based detection first
  if (isLLMConfigured()) {
    try {
      return await detectPromisesWithLLM(draftText);
    } catch (error) {
      console.warn("[PromisedActions] LLM detection failed, using fallback:", error);
    }
  }

  // Fallback to simple keyword detection (non-blocking, best-effort)
  return detectPromisesFallback(draftText);
}

/**
 * LLM-based promise detection - understands context and works in any language
 */
async function detectPromisesWithLLM(draftText: string): Promise<DetectedPromise[]> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: `You analyze customer support draft responses to identify commitments or promises made to the customer.

CATEGORIES:
- refund: Promises about refunds, credits, money back
- shipping: Promises about shipping, sending, delivery timelines
- replacement: Promises about replacements or exchanges
- follow_up: Promises to follow up, investigate, escalate, or get back to them
- confirmation: Statements that something has been done/approved/processed
- timeline: Specific time commitments (within X days, by tomorrow, etc.)

Only flag ACTUAL commitments, not:
- Questions or suggestions
- Conditional statements ("if you'd like, we could...")
- General information about policies
- Promises already fulfilled in the same message

Return JSON array:
[{"category": "refund", "matchedText": "I'll process your refund", "description": "Will process refund"}]

Return empty array [] if no commitments found.`,
      },
      {
        role: "user",
        content: `Analyze this draft for commitments/promises:\n\n${draftText}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (p: unknown): p is { category: string; matchedText: string; description: string } =>
          typeof p === "object" &&
          p !== null &&
          "category" in p &&
          "matchedText" in p &&
          "description" in p
      )
      .map((p) => ({
        category: (["refund", "shipping", "replacement", "follow_up", "confirmation", "timeline"].includes(p.category)
          ? p.category
          : "other") as PromiseCategory,
        matchedText: String(p.matchedText).slice(0, 200),
        description: String(p.description).slice(0, 100),
      }));
  } catch {
    return [];
  }
}

/**
 * Simple keyword-based fallback detection (no LLM required)
 * This is less accurate but provides basic coverage when LLM is unavailable
 */
function detectPromisesFallback(draftText: string): DetectedPromise[] {
  const detected: DetectedPromise[] = [];
  const text = draftText.toLowerCase();

  // Simple keyword checks - much simpler than the old 30+ regex patterns
  // Include contractions since customer-facing text often uses them
  const checks: Array<{ keywords: string[]; category: PromiseCategory; description: string }> = [
    { keywords: ["refund", "money back", "credit your"], category: "refund", description: "Refund mentioned" },
    { keywords: ["will ship", "will send", "i'll send", "shipping today", "shipping tomorrow"], category: "shipping", description: "Shipping commitment" },
    { keywords: ["replacement", "replace it", "send you a new"], category: "replacement", description: "Replacement mentioned" },
    { keywords: ["follow up", "get back to you", "will investigate", "will escalate", "i'll escalate"], category: "follow_up", description: "Follow-up commitment" },
    { keywords: ["has been approved", "has been processed", "i've confirmed"], category: "confirmation", description: "Action confirmed" },
    { keywords: ["within 24", "within 48", "by tomorrow", "by end of"], category: "timeline", description: "Timeline commitment" },
  ];

  for (const { keywords, category, description } of checks) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        detected.push({ category, matchedText: keyword, description });
        break; // Only one match per category
      }
    }
  }

  return detected;
}

/**
 * Log detected promises to the events table for audit purposes.
 * This creates a "promised_action" event that can be queried later.
 *
 * Uses dynamic import to avoid requiring database config at module load time.
 *
 * @param threadId - The thread ID where the promise was made
 * @param promises - Array of detected promises
 * @param draftText - The full draft text (for context)
 * @returns Promise that resolves when logging is complete
 */
export async function logPromisedActions(
  threadId: string,
  promises: DetectedPromise[],
  draftText?: string
): Promise<void> {
  if (promises.length === 0) {
    return;
  }

  // Dynamic import to avoid requiring database config at module load time
  const { supabase } = await import("@/lib/db");

  const { error } = await supabase.from("events").insert({
    thread_id: threadId,
    type: "promised_action",
    payload: {
      promises: promises.map((p) => ({
        category: p.category,
        matched_text: p.matchedText,
        description: p.description,
      })),
      promise_count: promises.length,
      categories: [...new Set(promises.map((p) => p.category))],
      // Include snippet of draft for context (truncated)
      draft_snippet: draftText
        ? draftText.slice(0, 500) + (draftText.length > 500 ? "..." : "")
        : null,
    },
  });

  if (error) {
    // Log but don't throw - this is non-blocking tracking
    console.error("[PromisedActions] Failed to log promised actions:", error.message);
  } else {
    console.log(
      `[PromisedActions] Logged ${promises.length} promise(s) for thread ${threadId}:`,
      promises.map((p) => p.description).join(", ")
    );
  }
}

/**
 * Convenience function to detect and log promises in a single call.
 * Use this after draft generation to track any commitments made.
 *
 * @param threadId - The thread ID
 * @param draftText - The draft text to analyze
 * @returns The detected promises (for reference)
 */
export async function trackPromisedActions(
  threadId: string,
  draftText: string | null
): Promise<DetectedPromise[]> {
  if (!draftText) {
    return [];
  }

  const promises = await detectPromisedActions(draftText);

  if (promises.length > 0) {
    await logPromisedActions(threadId, promises, draftText);
  }

  return promises;
}

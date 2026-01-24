/**
 * Promised Action Detection
 *
 * Detects when Lina's drafts contain commitments/promises that should be
 * tracked for visibility and audit purposes. These are logged to the events
 * table for later review.
 *
 * This is a lightweight detection system - it doesn't block anything,
 * just creates an audit trail for promises made to customers.
 */

/**
 * Categories of promises that can be detected
 */
export type PromiseCategory =
  | "refund"
  | "shipping"
  | "replacement"
  | "follow_up"
  | "confirmation"
  | "timeline";

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
 * Promise detection patterns
 * Each pattern maps to a category and description
 */
const PROMISE_PATTERNS: Array<{
  pattern: RegExp;
  category: PromiseCategory;
  description: string;
}> = [
  // Refund promises
  {
    pattern: /\brefund(?:ed|s)?\s+(?:has been\s+)?approved\b/i,
    category: "refund",
    description: "Refund approved",
  },
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+(?:process|issue)\s+(?:your\s+)?refund\b/i,
    category: "refund",
    description: "Will process refund",
  },
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+refund\b/i,
    category: "refund",
    description: "Will refund",
  },
  {
    pattern: /\bprocess(?:ing|ed)?\s+(?:your\s+)?refund\b/i,
    category: "refund",
    description: "Processing refund",
  },
  {
    pattern: /\bi(?:'ve|'m|\s+have)\s+(?:issued|processed|approved)\s+(?:a\s+|the\s+)?refund\b/i,
    category: "refund",
    description: "Refund issued/processed",
  },

  // Shipping promises
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+ship\b/i,
    category: "shipping",
    description: "Will ship",
  },
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+send\b/i,
    category: "shipping",
    description: "Will send",
  },
  {
    pattern: /\bshipping\s+(?:today|tomorrow|this week|within)\b/i,
    category: "shipping",
    description: "Shipping timeline commitment",
  },
  {
    pattern: /\b(?:will\s+)?(?:be\s+)?shipped?\s+(?:out\s+)?(?:today|tomorrow|this week)\b/i,
    category: "shipping",
    description: "Shipping today/tomorrow",
  },
  {
    pattern: /\byou(?:'ll| will)\s+receive\s+(?:it\s+)?(?:by|within|in)\b/i,
    category: "shipping",
    description: "Delivery timeline commitment",
  },
  {
    pattern: /\bexpect\s+(?:delivery|it|your order)\s+(?:by|within|in)\b/i,
    category: "shipping",
    description: "Expected delivery timeline",
  },

  // Replacement promises
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+(?:send\s+(?:a|you)\s+)?replace(?:ment)?\b/i,
    category: "replacement",
    description: "Will send replacement",
  },
  {
    pattern: /\breplacement\s+(?:has been\s+)?(?:approved|confirmed)\b/i,
    category: "replacement",
    description: "Replacement approved",
  },
  {
    pattern: /\b(?:send(?:ing)?|ship(?:ping)?)\s+(?:a\s+)?(?:new\s+)?replacement\b/i,
    category: "replacement",
    description: "Sending replacement",
  },
  {
    pattern: /\bi(?:'ve|'m|\s+have)\s+(?:arranged|approved|processed)\s+a\s+replacement\b/i,
    category: "replacement",
    description: "Replacement arranged",
  },

  // Follow-up promises
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+(?:follow\s+up|get\s+back\s+to\s+you)\b/i,
    category: "follow_up",
    description: "Will follow up",
  },
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+(?:check|look\s+into|investigate)\s+(?:on\s+)?this\b/i,
    category: "follow_up",
    description: "Will investigate",
  },
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+escalate\b/i,
    category: "follow_up",
    description: "Will escalate",
  },
  {
    pattern: /\b(?:will|going to|we'll|i'll)\s+(?:reach\s+out|contact)\b/i,
    category: "follow_up",
    description: "Will contact",
  },
  {
    pattern: /\bexpect\s+(?:a\s+)?(?:response|reply|update)\s+(?:within|by)\b/i,
    category: "follow_up",
    description: "Response timeline commitment",
  },

  // Confirmation/completion promises
  {
    pattern: /\bi(?:'ve|'m|\s+have)\s+confirmed\b/i,
    category: "confirmation",
    description: "Confirmed action",
  },
  {
    pattern: /\b(?:has been|is now)\s+(?:approved|confirmed|processed)\b/i,
    category: "confirmation",
    description: "Action approved/confirmed",
  },
  {
    pattern: /\bi(?:'ve|'m|\s+have)\s+(?:processed|completed|updated)\b/i,
    category: "confirmation",
    description: "Action processed/completed",
  },
  {
    pattern: /\byour\s+(?:request|order|return)\s+(?:has been|is)\s+(?:approved|confirmed)\b/i,
    category: "confirmation",
    description: "Request approved",
  },

  // Timeline commitments
  {
    pattern: /\bwithin\s+(?:\d+|one|two|three|24|48|72)\s+(?:hours?|days?|business\s+days?)\b/i,
    category: "timeline",
    description: "Timeline commitment",
  },
  {
    pattern: /\bby\s+(?:end\s+of\s+)?(?:today|tomorrow|this\s+week|monday|tuesday|wednesday|thursday|friday)\b/i,
    category: "timeline",
    description: "Deadline commitment",
  },
];

/**
 * Detect promised actions in a draft text.
 * Returns an array of detected promises with their categories and matched text.
 *
 * This is a pure function with no dependencies - safe to use in tests.
 *
 * @param draftText - The draft text to analyze
 * @returns Array of detected promises
 */
export function detectPromisedActions(draftText: string): DetectedPromise[] {
  if (!draftText || draftText.trim().length === 0) {
    return [];
  }

  const detected: DetectedPromise[] = [];
  const seenDescriptions = new Set<string>();

  for (const { pattern, category, description } of PROMISE_PATTERNS) {
    const match = pattern.exec(draftText);
    if (match) {
      // Avoid duplicate detections with same description
      if (!seenDescriptions.has(description)) {
        seenDescriptions.add(description);
        detected.push({
          category,
          matchedText: match[0],
          description,
        });
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

  const promises = detectPromisedActions(draftText);

  if (promises.length > 0) {
    await logPromisedActions(threadId, promises, draftText);
  }

  return promises;
}

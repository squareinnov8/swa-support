/**
 * Clarification Loop Detector
 *
 * Detects when Lina has asked the same type of clarifying question
 * multiple times in a thread without receiving the requested information.
 * When detected, triggers escalation to prevent frustrating customers.
 */

import { supabase } from "@/lib/db";

/**
 * Categories of clarifying questions we track.
 * These correspond to the required info types in requiredInfo.ts
 */
export type ClarificationCategory =
  | "order_number"
  | "vehicle_info"
  | "product_unit_type"
  | "photos_screenshots"
  | "error_message";

/**
 * Patterns to detect each clarification category in outbound messages
 */
const CLARIFICATION_PATTERNS: Record<ClarificationCategory, RegExp[]> = {
  order_number: [
    /order\s*(number|#|info)/i,
    /could\s+you\s+(provide|share|send).*order/i,
    /what('?s| is)?\s*(your|the)\s*order/i,
    /need\s*(your|the|an)?\s*order\s*(number|#)?/i,
    /confirm.*order/i,
    /which\s*order/i,
    /order\s*(#|number)?\s*(please|so\s+I\s+can)/i,
  ],
  vehicle_info: [
    /what\s*(vehicle|car|truck|year|make|model)/i,
    /which\s*(vehicle|car|truck)/i,
    /what('?s| is)\s*(your|the)\s*(vehicle|car|truck|year|make|model)/i,
    /could\s+you\s+(provide|share|tell).*vehicle/i,
    /vehicle\s*(info|information|details)/i,
    /year,?\s*make,?\s*(and\s*)?model/i,
    /what\s*(kind|type)\s*of\s*(vehicle|car|truck)/i,
    /need\s*(your|the)?\s*(vehicle|car|year)/i,
  ],
  product_unit_type: [
    /which\s*(product|unit|apex|g-series|cluster)/i,
    /what\s*(product|unit|type)/i,
    /what('?s| is)\s*(your|the)\s*(product|unit)/i,
    /could\s+you\s+(provide|share|tell).*unit/i,
    /unit\s*(type|model)/i,
    /apex\s*(or|vs|versus).*g-series/i,
    /which\s*(model|version)/i,
    /is\s*it\s*(an?\s*)?(apex|g-series|cluster)/i,
  ],
  photos_screenshots: [
    /could\s+you\s+(send|share|provide|attach).*photo/i,
    /could\s+you\s+(send|share|provide|attach).*screenshot/i,
    /could\s+you\s+(send|share|provide|attach).*picture/i,
    /could\s+you\s+(send|share|provide|attach).*image/i,
    /photo\s*(of|showing)/i,
    /screenshot\s*(of|showing)/i,
    /picture\s*(of|showing)/i,
    /image\s*(of|showing)/i,
    /send\s*(me\s*)?(a\s*)?(photo|screenshot|picture)/i,
    /attach\s*(a\s*)?(photo|screenshot|picture)/i,
    /share\s*(a\s*)?(photo|screenshot|picture)/i,
  ],
  error_message: [
    /what\s*(error|message)/i,
    /what('?s| is)\s*(the|your)\s*error/i,
    /could\s+you\s+(provide|share|tell).*error/i,
    /what\s*does\s*(the\s*)?(error|message|screen)\s*say/i,
    /error\s*(message|code)/i,
    /what\s*are\s*you\s*seeing/i,
    /what\s*does\s*it\s*say/i,
    /describe.*error/i,
    /what\s*appears/i,
    /share.*error/i,
  ],
};

/**
 * Result of loop detection
 */
export type ClarificationLoopResult = {
  loopDetected: boolean;
  repeatedCategory: ClarificationCategory | null;
  occurrences: number;
  allCategoryCounts: Record<ClarificationCategory, number>;
};

/**
 * Threshold for detecting a loop - asking the same thing 2+ times
 */
const LOOP_THRESHOLD = 2;

/**
 * The escalation draft message when a loop is detected
 */
export const CLARIFICATION_LOOP_ESCALATION_DRAFT =
  "I'm having trouble finding the right answer for you. I've asked Rob to take a look - he'll follow up with you directly.\n\n- Lina";

/**
 * Analyze outbound messages in a thread to detect clarification question loops.
 *
 * @param threadId - The thread to analyze
 * @returns ClarificationLoopResult indicating if a loop was detected
 */
export async function detectClarificationLoop(
  threadId: string
): Promise<ClarificationLoopResult> {
  // Fetch all outbound messages for this thread
  const { data: messages, error } = await supabase
    .from("messages")
    .select("body_text, created_at")
    .eq("thread_id", threadId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch messages for loop detection:", error.message);
    return {
      loopDetected: false,
      repeatedCategory: null,
      occurrences: 0,
      allCategoryCounts: createEmptyCounts(),
    };
  }

  if (!messages || messages.length === 0) {
    return {
      loopDetected: false,
      repeatedCategory: null,
      occurrences: 0,
      allCategoryCounts: createEmptyCounts(),
    };
  }

  // Count occurrences of each clarification category across all outbound messages
  const categoryCounts = createEmptyCounts();

  for (const message of messages) {
    const text = message.body_text || "";
    const detectedCategories = detectCategoriesInMessage(text);

    // Only count each category once per message (avoid double counting)
    for (const category of detectedCategories) {
      categoryCounts[category]++;
    }
  }

  // Find any category that meets or exceeds the threshold
  let loopDetected = false;
  let repeatedCategory: ClarificationCategory | null = null;
  let maxOccurrences = 0;

  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count >= LOOP_THRESHOLD && count > maxOccurrences) {
      loopDetected = true;
      repeatedCategory = category as ClarificationCategory;
      maxOccurrences = count;
    }
  }

  if (loopDetected) {
    console.log(
      `[ClarificationLoop] Loop detected in thread ${threadId}: ` +
        `asked for "${repeatedCategory}" ${maxOccurrences} times`
    );
  }

  return {
    loopDetected,
    repeatedCategory,
    occurrences: maxOccurrences,
    allCategoryCounts: categoryCounts,
  };
}

/**
 * Detect which clarification categories are present in a message
 */
function detectCategoriesInMessage(text: string): ClarificationCategory[] {
  const detected: ClarificationCategory[] = [];

  for (const [category, patterns] of Object.entries(CLARIFICATION_PATTERNS)) {
    const matchesAny = patterns.some((pattern) => pattern.test(text));
    if (matchesAny) {
      detected.push(category as ClarificationCategory);
    }
  }

  return detected;
}

/**
 * Create an empty category count object
 */
function createEmptyCounts(): Record<ClarificationCategory, number> {
  return {
    order_number: 0,
    vehicle_info: 0,
    product_unit_type: 0,
    photos_screenshots: 0,
    error_message: 0,
  };
}

/**
 * Get a human-readable description of the repeated clarification category
 */
export function getCategoryDescription(category: ClarificationCategory): string {
  const descriptions: Record<ClarificationCategory, string> = {
    order_number: "order number",
    vehicle_info: "vehicle information",
    product_unit_type: "product/unit type",
    photos_screenshots: "photos or screenshots",
    error_message: "error message details",
  };

  return descriptions[category] || category;
}

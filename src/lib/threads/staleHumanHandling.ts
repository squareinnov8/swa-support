/**
 * Stale Human Handling Monitor
 *
 * Detects threads stuck in HUMAN_HANDLING state for too long
 * and automatically returns them to Lina with an apology draft.
 */

import { supabase } from "@/lib/db";
import { generateDraft, getConversationHistory } from "@/lib/llm/draftGenerator";
import { sendTakeoverNotification } from "./takeoverNotification";
import { trackPromisedActions } from "@/lib/responders/promisedActions";
import { generateContextualEmail, type StaleThreadContext } from "@/lib/llm/contextualEmailGenerator";

// Timeout threshold in hours
const HUMAN_HANDLING_TIMEOUT_HOURS = 48;

export type StaleHandlingResult = {
  threadsChecked: number;
  threadsReturned: number;
  threadIds: string[];
  errors: string[];
};

/**
 * Check for threads stuck in HUMAN_HANDLING state for too long
 * and return them to Lina with an apology draft.
 *
 * This is called during the poll cycle to ensure no threads
 * are forgotten when a human takes over but doesn't resolve.
 */
export async function checkStaleHumanHandling(): Promise<StaleHandlingResult> {
  const result: StaleHandlingResult = {
    threadsChecked: 0,
    threadsReturned: 0,
    threadIds: [],
    errors: [],
  };

  try {
    // Calculate the cutoff time (48 hours ago)
    const cutoffTime = new Date(
      Date.now() - HUMAN_HANDLING_TIMEOUT_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Query threads that are stuck in HUMAN_HANDLING
    const { data: staleThreads, error: queryError } = await supabase
      .from("threads")
      .select("id, subject, human_handler, human_handling_started_at, last_intent")
      .eq("state", "HUMAN_HANDLING")
      .eq("human_handling_mode", true)
      .lt("human_handling_started_at", cutoffTime)
      .eq("is_archived", false);

    if (queryError) {
      result.errors.push(`Query error: ${queryError.message}`);
      return result;
    }

    if (!staleThreads || staleThreads.length === 0) {
      console.log("[StaleHandling] No stale threads found");
      return result;
    }

    result.threadsChecked = staleThreads.length;
    console.log(`[StaleHandling] Found ${staleThreads.length} stale thread(s) in HUMAN_HANDLING`);

    // Process each stale thread
    for (const thread of staleThreads) {
      try {
        await returnThreadToLina(thread);
        result.threadsReturned++;
        result.threadIds.push(thread.id);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Thread ${thread.id}: ${errorMessage}`);
        console.error(`[StaleHandling] Error processing thread ${thread.id}:`, err);
      }
    }

    console.log(
      `[StaleHandling] Returned ${result.threadsReturned}/${result.threadsChecked} threads to Lina`
    );

    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    result.errors.push(errorMessage);
    console.error("[StaleHandling] Fatal error:", err);
    return result;
  }
}

/**
 * Return a single thread from HUMAN_HANDLING back to Lina
 */
async function returnThreadToLina(thread: {
  id: string;
  subject: string | null;
  human_handler: string | null;
  human_handling_started_at: string | null;
  last_intent: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const threadId = thread.id;

  console.log(`[StaleHandling] Returning thread ${threadId} to Lina`);

  // 1. Get the latest customer message for context
  const { data: latestMessage } = await supabase
    .from("messages")
    .select("body_text, from_email, created_at")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // 2. Update thread state: transition from HUMAN_HANDLING to IN_PROGRESS
  const { error: updateError } = await supabase
    .from("threads")
    .update({
      state: "IN_PROGRESS",
      human_handling_mode: false,
      updated_at: now,
    })
    .eq("id", threadId);

  if (updateError) {
    throw new Error(`Failed to update thread state: ${updateError.message}`);
  }

  // 3. Close out any active observation for this thread
  await closeActiveObservation(threadId, "timeout_return_to_agent");

  // 4. Generate delay apology draft
  const apologyDraft = await generateDelayApologyDraft(
    threadId,
    thread.subject || "(no subject)",
    latestMessage?.body_text || "",
    thread.last_intent || "UNKNOWN"
  );

  // 5. Save the draft to messages table for admin review
  if (apologyDraft) {
    const { error: draftError } = await supabase.from("messages").insert({
      thread_id: threadId,
      direction: "outbound",
      body_text: apologyDraft,
      role: "draft",
      channel: "email",
      channel_metadata: {
        auto_generated: true,
        reason: "human_handling_timeout",
        timeout_hours: HUMAN_HANDLING_TIMEOUT_HOURS,
        human_handler: thread.human_handler,
      },
    });

    if (draftError) {
      console.warn(`[StaleHandling] Failed to save draft: ${draftError.message}`);
    }

    // Track any promised actions in the draft (non-blocking audit trail)
    await trackPromisedActions(threadId, apologyDraft);
  }

  // 6. Log the event
  await supabase.from("events").insert({
    thread_id: threadId,
    type: "HUMAN_HANDLING_TIMEOUT",
    payload: {
      previous_handler: thread.human_handler,
      handling_started_at: thread.human_handling_started_at,
      timeout_hours: HUMAN_HANDLING_TIMEOUT_HOURS,
      returned_to_agent: true,
      draft_generated: Boolean(apologyDraft),
    },
  });

  // 7. Send notification email to Rob
  try {
    await sendTakeoverNotification({
      threadId,
      subject: thread.subject || "(no subject)",
      customerEmail: latestMessage?.from_email || "unknown",
      previousHandler: thread.human_handler || "unknown",
      handlingStartedAt: thread.human_handling_started_at || now,
      timeoutHours: HUMAN_HANDLING_TIMEOUT_HOURS,
    });
  } catch (notifyError) {
    console.error(`[StaleHandling] Failed to send notification:`, notifyError);
    // Don't throw - the main operation succeeded
  }

  console.log(`[StaleHandling] Successfully returned thread ${threadId} to Lina`);
}

/**
 * Close any active observation for the thread
 */
async function closeActiveObservation(
  threadId: string,
  resolutionType: string
): Promise<void> {
  const now = new Date().toISOString();

  // Find active observation
  const { data: observation } = await supabase
    .from("intervention_observations")
    .select("id")
    .eq("thread_id", threadId)
    .is("intervention_end", null)
    .order("intervention_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (observation) {
    await supabase
      .from("intervention_observations")
      .update({
        intervention_end: now,
        resolution_type: resolutionType,
        resolution_summary: `Thread automatically returned to agent after ${HUMAN_HANDLING_TIMEOUT_HOURS} hour timeout`,
      })
      .eq("id", observation.id);
  }
}

/**
 * Generate a draft with an apology for the delay
 */
async function generateDelayApologyDraft(
  threadId: string,
  subject: string,
  latestCustomerMessage: string,
  intent: string
): Promise<string | null> {
  try {
    // Get conversation history for context
    const conversationHistory = await getConversationHistory(threadId);

    // Generate a draft using the standard draft generator
    // The apology context is added to help Lina craft an appropriate response
    const delayContext = `
IMPORTANT CONTEXT: This customer has been waiting for ${HUMAN_HANDLING_TIMEOUT_HOURS}+ hours for a response.
The ticket was being handled by a human team member but they didn't respond in time.
Please start your response with a sincere apology for the delay before addressing their question.
Example opening: "I sincerely apologize for the delay in getting back to you. I'm Lina, and I'm picking this up to help resolve your issue as quickly as possible."
`;

    const fullMessage = `${delayContext}\n\nCustomer's message:\n${latestCustomerMessage}`;

    const draftResult = await generateDraft({
      threadId,
      customerMessage: fullMessage,
      intent,
      previousMessages: conversationHistory,
    });

    if (draftResult.success && draftResult.draft) {
      return draftResult.draft;
    }

    // Fallback if LLM generation fails - create a simple apology draft
    const historyContext = conversationHistory.map(m =>
      `${m.direction === "inbound" ? "Customer" : "Lina"}: ${m.body.slice(0, 200)}`
    );
    return await createFallbackApologyDraft(undefined, historyContext);
  } catch (err) {
    console.error("[StaleHandling] Draft generation failed:", err);
    return await createFallbackApologyDraft();
  }
}

/**
 * Create a fallback apology draft using contextual email generator
 */
async function createFallbackApologyDraft(
  customerName?: string,
  conversationContext?: string[]
): Promise<string> {
  const context: StaleThreadContext = {
    purpose: "stale_thread_return",
    customerName,
    daysSinceLastMessage: Math.ceil(HUMAN_HANDLING_TIMEOUT_HOURS / 24),
    conversationHistory: conversationContext,
  };

  try {
    const email = await generateContextualEmail(context);
    return email.body;
  } catch {
    // Ultimate fallback if even contextual generator fails
    return `Hi${customerName ? ` ${customerName}` : " there"},

I'm really sorry for the delay in getting back to you. That's not the experience we want you to have.

Is this still something you need help with? If so, let me know and I'll make it a priority.

– Lina`;
  }
}

/**
 * Get the timeout threshold in hours (exported for testing/configuration)
 */
export function getTimeoutHours(): number {
  return HUMAN_HANDLING_TIMEOUT_HOURS;
}

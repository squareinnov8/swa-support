/**
 * Thread Archive System
 *
 * Handles resolving and archiving threads, and triggers learning extraction
 * from resolved conversations.
 */

import { supabase } from "@/lib/db";

export type ArchiveResult = {
  success: boolean;
  error?: string;
  archivedAt?: string;
  learningStatus?: "pending" | "completed" | "skipped";
  proposalsGenerated?: number;
  proposalsAutoApproved?: number;
};

export type ArchiveOptions = {
  triggerLearning?: boolean; // default true
  skipLowQuality?: boolean; // default true
};

/**
 * Resolve and archive a thread
 *
 * 1. Updates thread state to RESOLVED
 * 2. Marks thread as archived
 * 3. Optionally triggers learning extraction (async)
 */
export async function resolveAndArchive(
  threadId: string,
  archivedBy: string,
  options: ArchiveOptions = {}
): Promise<ArchiveResult> {
  const { triggerLearning = true, skipLowQuality = true } = options;
  const now = new Date().toISOString();

  try {
    // 1. Update thread state and archive
    const { error: updateError } = await supabase
      .from("threads")
      .update({
        state: "RESOLVED",
        is_archived: true,
        archived_at: now,
        archived_by: archivedBy,
        updated_at: now,
      })
      .eq("id", threadId);

    if (updateError) {
      throw new Error(`Failed to archive thread: ${updateError.message}`);
    }

    // 2. Log the event
    await supabase.from("events").insert({
      thread_id: threadId,
      type: "THREAD_ARCHIVED",
      payload: {
        archived_by: archivedBy,
        trigger_learning: triggerLearning,
      },
    });

    // 3. Check if thread qualifies for learning extraction
    if (triggerLearning) {
      const qualifies = await threadQualifiesForLearning(threadId, skipLowQuality);

      if (qualifies) {
        // Mark learning as pending
        await supabase
          .from("threads")
          .update({ learning_extracted: false })
          .eq("id", threadId);

        // Trigger learning extraction asynchronously
        // This will be picked up by the resolution analyzer
        try {
          const { analyzeResolvedThread } = await import("@/lib/learning/resolutionAnalyzer");
          const result = await analyzeResolvedThread(threadId);

          // Update thread with learning status
          await supabase
            .from("threads")
            .update({
              learning_extracted: true,
              learning_extracted_at: new Date().toISOString(),
            })
            .eq("id", threadId);

          return {
            success: true,
            archivedAt: now,
            learningStatus: "completed",
            proposalsGenerated: result.proposals.length,
            proposalsAutoApproved: result.proposals.filter((p) => p.autoApproved).length,
          };
        } catch (learningError) {
          console.error("[Archive] Learning extraction failed:", learningError);
          // Archive succeeded, but learning failed - still return success
          return {
            success: true,
            archivedAt: now,
            learningStatus: "pending",
            error: `Learning extraction failed: ${learningError instanceof Error ? learningError.message : "Unknown error"}`,
          };
        }
      } else {
        return {
          success: true,
          archivedAt: now,
          learningStatus: "skipped",
        };
      }
    }

    return {
      success: true,
      archivedAt: now,
    };
  } catch (error) {
    console.error("[Archive] Error archiving thread:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Archive a thread without resolving (keep current state)
 */
export async function archiveThread(threadId: string, archivedBy: string): Promise<ArchiveResult> {
  const now = new Date().toISOString();

  try {
    const { error } = await supabase
      .from("threads")
      .update({
        is_archived: true,
        archived_at: now,
        archived_by: archivedBy,
        updated_at: now,
      })
      .eq("id", threadId);

    if (error) {
      throw new Error(`Failed to archive: ${error.message}`);
    }

    await supabase.from("events").insert({
      thread_id: threadId,
      type: "THREAD_ARCHIVED",
      payload: { archived_by: archivedBy },
    });

    return { success: true, archivedAt: now };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Unarchive a thread (returns it to inbox)
 */
export async function unarchiveThread(threadId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("threads")
      .update({
        is_archived: false,
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    if (error) {
      throw new Error(`Failed to unarchive: ${error.message}`);
    }

    await supabase.from("events").insert({
      thread_id: threadId,
      type: "THREAD_UNARCHIVED",
      payload: {},
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Bulk archive threads
 */
export async function bulkArchive(
  threadIds: string[],
  archivedBy: string,
  options: ArchiveOptions = {}
): Promise<{
  success: boolean;
  archived: number;
  failed: number;
  learningQueued: number;
}> {
  let archived = 0;
  let failed = 0;
  let learningQueued = 0;

  for (const threadId of threadIds) {
    const result = await resolveAndArchive(threadId, archivedBy, options);
    if (result.success) {
      archived++;
      if (result.learningStatus === "completed" || result.learningStatus === "pending") {
        learningQueued++;
      }
    } else {
      failed++;
    }
  }

  return {
    success: failed === 0,
    archived,
    failed,
    learningQueued,
  };
}

/**
 * Check if a thread qualifies for learning extraction
 *
 * Skips threads that are:
 * - Too short (< 3 messages)
 * - Too little content (< 200 chars)
 * - Routine intents (THANK_YOU_CLOSE, VENDOR_SPAM)
 * - Resolved too quickly (< 2 minutes)
 */
async function threadQualifiesForLearning(
  threadId: string,
  skipLowQuality: boolean
): Promise<boolean> {
  if (!skipLowQuality) {
    return true;
  }

  // Get thread with messages
  const { data: thread } = await supabase
    .from("threads")
    .select("id, last_intent, created_at")
    .eq("id", threadId)
    .single();

  if (!thread) {
    return false;
  }

  // Check for routine intents
  const routineIntents = ["THANK_YOU_CLOSE", "VENDOR_SPAM", "FOLLOWUP_NO_ACTION"];
  if (routineIntents.includes(thread.last_intent || "")) {
    console.log(`[Archive] Skipping learning for routine intent: ${thread.last_intent}`);
    return false;
  }

  // Get messages
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, body_text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (!messages || messages.length < 3) {
    console.log(`[Archive] Skipping learning: only ${messages?.length || 0} messages`);
    return false;
  }

  // Check total content length
  const totalContent = messages.reduce((acc, m) => acc + (m.body_text?.length || 0), 0);
  if (totalContent < 200) {
    console.log(`[Archive] Skipping learning: only ${totalContent} chars of content`);
    return false;
  }

  // Check if resolved too quickly (< 2 minutes from creation)
  const createdAt = new Date(thread.created_at);
  const lastMessageAt = new Date(messages[messages.length - 1].created_at);
  const durationMs = lastMessageAt.getTime() - createdAt.getTime();
  const durationMinutes = durationMs / (1000 * 60);

  if (durationMinutes < 2) {
    console.log(`[Archive] Skipping learning: resolved in ${durationMinutes.toFixed(1)} minutes`);
    return false;
  }

  // Check for back-and-forth (at least 1 inbound and 1 outbound after initial)
  const inboundCount = messages.filter((m) => m.direction === "inbound").length;
  const outboundCount = messages.filter((m) => m.direction === "outbound").length;

  if (inboundCount < 2 || outboundCount < 1) {
    console.log(`[Archive] Skipping learning: insufficient back-and-forth (${inboundCount} in, ${outboundCount} out)`);
    return false;
  }

  return true;
}

/**
 * Get archived threads count
 */
export async function getArchivedCount(): Promise<number> {
  const { count } = await supabase
    .from("threads")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", true);

  return count || 0;
}

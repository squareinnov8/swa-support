/**
 * Admin Inbox Purge API
 *
 * Deletes all thread data and resets Gmail sync state for a fresh start.
 * Use with caution - this is destructive and irreversible!
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";

/**
 * POST - Purge inbox and optionally repoll
 *
 * Body:
 * - repoll: boolean - If true, trigger a Gmail repoll after purge
 * - fetchDays: number - Days to fetch if repolling (default: 7)
 * - confirm: string - Must be "PURGE_ALL_DATA" to proceed
 */
export async function POST(request: NextRequest) {
  // Verify admin session
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { repoll = false, fetchDays = 7, confirm } = body;

    // Require explicit confirmation
    if (confirm !== "PURGE_ALL_DATA") {
      return NextResponse.json(
        {
          error: "Confirmation required",
          hint: 'Send { "confirm": "PURGE_ALL_DATA" } to proceed',
        },
        { status: 400 }
      );
    }

    const results: Record<string, string> = {};

    // Delete in correct order (respecting foreign keys)
    // 1. Delete draft feedback (references threads)
    const { error: feedbackError } = await supabase
      .from("draft_feedback")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.draft_feedback = feedbackError ? `Error: ${feedbackError.message}` : "deleted";

    // 2. Delete escalation notes (references threads)
    const { error: escalationError } = await supabase
      .from("escalation_notes")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.escalation_notes = escalationError ? `Error: ${escalationError.message}` : "deleted";

    // 3. Delete draft generations (references threads)
    const { error: draftError } = await supabase
      .from("draft_generations")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.draft_generations = draftError ? `Error: ${draftError.message}` : "deleted";

    // 4. Delete customer verifications (references threads)
    const { error: verificationError } = await supabase
      .from("customer_verifications")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.customer_verifications = verificationError ? `Error: ${verificationError.message}` : "deleted";

    // 5. Delete thread intents (references threads and intents)
    const { error: threadIntentError } = await supabase
      .from("thread_intents")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.thread_intents = threadIntentError ? `Error: ${threadIntentError.message}` : "deleted";

    // 6. Delete events (references threads)
    const { error: eventError } = await supabase
      .from("events")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.events = eventError ? `Error: ${eventError.message}` : "deleted";

    // 7. Delete messages (references threads)
    const { error: messageError } = await supabase
      .from("messages")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.messages = messageError ? `Error: ${messageError.message}` : "deleted";

    // 8. Delete threads (main table)
    const { error: threadError } = await supabase
      .from("threads")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.threads = threadError ? `Error: ${threadError.message}` : "deleted";

    // 9. Delete poll runs
    const { error: pollError } = await supabase
      .from("agent_poll_runs")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    results.agent_poll_runs = pollError ? `Error: ${pollError.message}` : "deleted";

    // 10. Reset Gmail sync state (set last_history_id to null)
    const { error: syncError } = await supabase
      .from("gmail_sync_state")
      .update({
        last_history_id: null,
        last_sync_at: null,
        error_count: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("email_address", "support@squarewheelsauto.com");

    if (syncError) {
      results.gmail_sync_reset = `Error: ${syncError.message}`;
    } else {
      results.gmail_sync_reset = "Success";
    }

    // Optionally trigger repoll
    let repollResult = null;
    if (repoll) {
      try {
        // Use internal fetch to trigger the poll endpoint
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : process.env.NEXTAUTH_URL || "http://localhost:3000";

        const pollResponse = await fetch(
          `${baseUrl}/api/agent/poll?force=true&fetchRecent=true&fetchDays=${fetchDays}`,
          { method: "POST" }
        );

        repollResult = await pollResponse.json();
      } catch (pollError) {
        repollResult = {
          error: pollError instanceof Error ? pollError.message : "Poll failed",
        };
      }
    }

    return NextResponse.json({
      success: true,
      purged: results,
      repoll: repollResult,
      message: `Inbox purged. ${repoll ? `Repolling last ${fetchDays} days.` : "Run a poll to fetch new messages."}`,
    });
  } catch (error) {
    console.error("Inbox purge error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * GET - Get current inbox stats (for confirmation UI)
 */
export async function GET(request: NextRequest) {
  // Verify admin session
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get counts of all data
    const [
      { count: threadCount },
      { count: messageCount },
      { count: eventCount },
      { count: draftCount },
      { count: verificationCount },
    ] = await Promise.all([
      supabase.from("threads").select("*", { count: "exact", head: true }),
      supabase.from("messages").select("*", { count: "exact", head: true }),
      supabase.from("events").select("*", { count: "exact", head: true }),
      supabase.from("draft_generations").select("*", { count: "exact", head: true }),
      supabase.from("customer_verifications").select("*", { count: "exact", head: true }),
    ]);

    // Get Gmail sync state
    const { data: syncState } = await supabase
      .from("gmail_sync_state")
      .select("last_history_id, last_sync_at, error_count")
      .eq("email_address", "support@squarewheelsauto.com")
      .single();

    return NextResponse.json({
      stats: {
        threads: threadCount ?? 0,
        messages: messageCount ?? 0,
        events: eventCount ?? 0,
        draftGenerations: draftCount ?? 0,
        customerVerifications: verificationCount ?? 0,
      },
      gmailSync: {
        lastHistoryId: syncState?.last_history_id ?? null,
        lastSyncAt: syncState?.last_sync_at ?? null,
        errorCount: syncState?.error_count ?? 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

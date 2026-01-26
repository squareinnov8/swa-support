/**
 * Unblock a specific thread stuck in HUMAN_HANDLING
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const threadId = process.argv[2] || "5825d93f-a6f8-463b-a6f9-3b190e353bb0";

async function unblockThread() {
  console.log(`Unblocking thread: ${threadId}\n`);

  // Get current state
  const { data: thread, error: fetchError } = await supabase
    .from("threads")
    .select("id, subject, state, human_handling_mode, human_handler")
    .eq("id", threadId)
    .single();

  if (fetchError || !thread) {
    console.error("Thread not found:", fetchError?.message);
    return;
  }

  console.log("Current state:");
  console.log("  State:", thread.state);
  console.log("  Human Handling Mode:", thread.human_handling_mode);
  console.log("  Human Handler:", thread.human_handler);
  console.log();

  if (thread.state !== "HUMAN_HANDLING" && !thread.human_handling_mode) {
    console.log("Thread is not in HUMAN_HANDLING mode, nothing to do.");
    return;
  }

  // Update thread
  const { error: updateError } = await supabase
    .from("threads")
    .update({
      state: "IN_PROGRESS",
      human_handling_mode: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  if (updateError) {
    console.error("Failed to update thread:", updateError.message);
    return;
  }

  // Close any active observation
  await supabase
    .from("intervention_observations")
    .update({
      intervention_end: new Date().toISOString(),
      resolution_type: "manual_unblock",
      resolution_summary: "Manually unblocked via script",
    })
    .eq("thread_id", threadId)
    .is("intervention_end", null);

  // Log event
  await supabase.from("events").insert({
    thread_id: threadId,
    type: "THREAD_RETURNED_TO_AGENT",
    payload: {
      previous_state: thread.state,
      previous_handler: thread.human_handler,
      reason: "Manually unblocked via script after Lina tool fix",
      returned_by: "claude-code",
    },
  });

  console.log("Thread unblocked successfully!");
  console.log("  New state: IN_PROGRESS");
  console.log("  Human Handling Mode: false");
}

unblockThread().catch(console.error);

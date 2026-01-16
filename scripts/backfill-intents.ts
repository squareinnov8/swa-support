/**
 * Backfill intent classification for existing threads using LLM
 *
 * This script re-classifies all threads with null/UNKNOWN intent using
 * the LLM-based classifier, reading the full conversation context.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { classifyWithLLM, addIntentsToThread } from "../src/lib/intents/llmClassify";
import { isLLMConfigured } from "../src/lib/llm/client";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
const RECLASSIFY_ALL = process.argv.includes("--all"); // Reclassify all threads, not just UNKNOWN

async function main() {
  // Verify LLM is configured
  if (!isLLMConfigured()) {
    console.error("ERROR: OPENAI_API_KEY is not set. LLM classification requires OpenAI.");
    process.exit(1);
  }

  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== APPLYING CHANGES ===");
  console.log(RECLASSIFY_ALL ? "Mode: Reclassifying ALL threads" : "Mode: Only UNKNOWN/null intents");
  console.log();

  // Build query based on mode
  let query = supabase
    .from("threads")
    .select("id, subject, state, last_intent")
    .order("created_at", { ascending: false });

  if (!RECLASSIFY_ALL) {
    query = query.or("last_intent.is.null,last_intent.eq.UNKNOWN");
  }

  const { data: threads, error } = await query;

  if (error) {
    console.error("Error fetching threads:", error.message);
    process.exit(1);
  }

  if (!threads || threads.length === 0) {
    console.log("No threads to backfill!");
    return;
  }

  console.log(`Found ${threads.length} threads to classify\n`);

  const results: Record<string, { count: number; examples: string[] }> = {};
  let processed = 0;
  let errors = 0;

  for (const thread of threads) {
    processed++;
    const progress = `[${processed}/${threads.length}]`;

    try {
      // Get ALL inbound messages for full context (not just first one)
      const { data: messages } = await supabase
        .from("messages")
        .select("body_text, direction, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });

      if (!messages || messages.length === 0) {
        console.log(`${progress} Skipping ${thread.id} - no messages`);
        continue;
      }

      // Build full conversation context
      const conversationContext = messages
        .map((m) => `[${m.direction}]: ${m.body_text?.substring(0, 500) || "(empty)"}`)
        .join("\n\n");

      // Get the latest inbound message as the "current" message
      const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound");
      const body = latestInbound?.body_text || messages[0]?.body_text || "";

      // Classify using LLM with full context
      const classification = await classifyWithLLM(
        thread.subject || "",
        body,
        conversationContext
      );

      const intent = classification.primary_intent;
      const confidence = classification.intents[0]?.confidence || 0;

      // Track results
      if (!results[intent]) {
        results[intent] = { count: 0, examples: [] };
      }
      results[intent].count++;
      if (results[intent].examples.length < 3) {
        results[intent].examples.push(
          `[${thread.state}] ${thread.subject?.substring(0, 50) || "(no subject)"} (${confidence.toFixed(2)})`
        );
      }

      const changed = thread.last_intent !== intent;
      const changeIndicator = changed ? ` (was: ${thread.last_intent || "null"})` : "";
      console.log(`${progress} ${thread.subject?.substring(0, 40) || "(no subject)"} → ${intent}${changeIndicator}`);

      if (!DRY_RUN && changed) {
        // Update thread's last_intent
        await supabase
          .from("threads")
          .update({
            last_intent: intent,
            updated_at: new Date().toISOString()
          })
          .eq("id", thread.id);

        // Add to thread_intents table
        await addIntentsToThread(thread.id, classification);
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));

    } catch (err) {
      errors++;
      console.error(`${progress} Error processing ${thread.id}:`, err);
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY BY INTENT:");
  console.log("=".repeat(60));

  const sortedIntents = Object.entries(results).sort((a, b) => b[1].count - a[1].count);
  for (const [intent, data] of sortedIntents) {
    console.log(`\n${intent} (${data.count}):`);
    for (const example of data.examples) {
      console.log(`  ${example}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Total: ${threads.length} threads`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log(DRY_RUN ? "\nRun with --apply to update the database" : "\nChanges applied!");
}

main().catch(console.error);

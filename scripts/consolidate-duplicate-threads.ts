/**
 * Consolidate Duplicate Order Threads
 *
 * Finds threads with the same order number in their subject and consolidates
 * messages into a single thread per order.
 *
 * Usage: npx tsx scripts/consolidate-duplicate-threads.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { extractOrderNumber } from "../src/lib/verification/extractors";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function consolidateDuplicateThreads() {
  console.log("Finding duplicate order threads...\n");

  // Fetch all threads that might have order numbers
  const { data: threads, error } = await supabase
    .from("threads")
    .select("id, subject, state, created_at, order_number, external_thread_id")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching threads:", error);
    return;
  }

  // Group threads by order number
  const orderThreads = new Map<string, typeof threads>();

  for (const thread of threads || []) {
    // Try to extract order number from subject if not already set
    const orderNum = thread.order_number || extractOrderNumber(thread.subject || "");
    if (!orderNum) continue;

    const existing = orderThreads.get(orderNum) || [];
    existing.push(thread);
    orderThreads.set(orderNum, existing);
  }

  // Find orders with multiple threads
  const duplicates: Array<{ orderNumber: string; threads: typeof threads }> = [];

  for (const [orderNumber, orderThreadGroup] of orderThreads) {
    if (orderThreadGroup.length > 1) {
      duplicates.push({ orderNumber, threads: orderThreadGroup });
    }
  }

  if (duplicates.length === 0) {
    console.log("No duplicate threads found.");
    return;
  }

  console.log(`Found ${duplicates.length} orders with duplicate threads:\n`);

  for (const dup of duplicates) {
    console.log(`Order #${dup.orderNumber}:`);
    for (const t of dup.threads!) {
      console.log(`  - Thread ${t.id.slice(0, 8)} (${t.state}) created ${t.created_at}`);
      console.log(`    Subject: ${t.subject?.slice(0, 60)}`);
    }
    console.log();
  }

  // Ask for confirmation
  console.log("Consolidating duplicates...\n");

  for (const dup of duplicates) {
    const threads = dup.threads!;
    // Keep the oldest thread (first created)
    const [primary, ...duplicatesToMerge] = threads;

    console.log(`\nOrder #${dup.orderNumber}:`);
    console.log(`  Primary thread: ${primary.id.slice(0, 8)}`);

    // Set order_number on primary thread if not set
    if (!primary.order_number) {
      await supabase
        .from("threads")
        .update({ order_number: dup.orderNumber })
        .eq("id", primary.id);
      console.log(`  Set order_number on primary thread`);
    }

    for (const duplicate of duplicatesToMerge) {
      console.log(`  Merging thread ${duplicate.id.slice(0, 8)}...`);

      // Move messages from duplicate to primary
      const { data: messages, error: msgError } = await supabase
        .from("messages")
        .select("id")
        .eq("thread_id", duplicate.id);

      if (msgError) {
        console.error(`    Error fetching messages: ${msgError.message}`);
        continue;
      }

      if (messages && messages.length > 0) {
        const { error: updateError } = await supabase
          .from("messages")
          .update({ thread_id: primary.id })
          .eq("thread_id", duplicate.id);

        if (updateError) {
          console.error(`    Error moving messages: ${updateError.message}`);
          continue;
        }
        console.log(`    Moved ${messages.length} messages`);
      }

      // Move events from duplicate to primary
      const { data: events, error: evtError } = await supabase
        .from("events")
        .select("id")
        .eq("thread_id", duplicate.id);

      if (events && events.length > 0) {
        await supabase
          .from("events")
          .update({ thread_id: primary.id })
          .eq("thread_id", duplicate.id);
        console.log(`    Moved ${events.length} events`);
      }

      // Delete the duplicate thread
      const { error: deleteError } = await supabase
        .from("threads")
        .delete()
        .eq("id", duplicate.id);

      if (deleteError) {
        console.error(`    Error deleting duplicate: ${deleteError.message}`);
      } else {
        console.log(`    Deleted duplicate thread`);
      }
    }
  }

  console.log("\nConsolidation complete!");
}

consolidateDuplicateThreads().catch(console.error);

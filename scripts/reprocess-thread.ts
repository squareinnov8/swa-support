/**
 * Reprocess a thread's last inbound message
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { processIngestRequest } from "../src/lib/ingest/processRequest";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const THREAD_ID = process.argv[2] || "5748afc9-3136-40a2-8455-9ab03266b848";

async function main() {
  console.log(`Reprocessing thread: ${THREAD_ID}\n`);

  // Get the thread
  const { data: thread } = await supabase
    .from("threads")
    .select("*")
    .eq("id", THREAD_ID)
    .single();

  if (!thread) {
    console.error("Thread not found!");
    return;
  }

  console.log(`Subject: ${thread.subject}`);
  console.log(`Current state: ${thread.state}`);
  console.log(`Current intent: ${thread.last_intent}`);

  // Get the last inbound message
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", THREAD_ID)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  const lastMessage = messages?.[0];
  if (!lastMessage) {
    console.error("No inbound messages found!");
    return;
  }

  console.log(`\nLast inbound message:`);
  console.log(`Body: ${lastMessage.body_text?.substring(0, 100)}`);
  console.log(`From: ${lastMessage.from_identifier}`);

  // Reset thread state to allow reprocessing
  console.log(`\nResetting thread state to NEW...`);
  await supabase
    .from("threads")
    .update({
      state: "NEW",
      last_intent: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", THREAD_ID);

  // Process the message
  console.log(`\nProcessing message...`);
  const result = await processIngestRequest({
    channel: "email",
    external_id: thread.external_thread_id || thread.gmail_thread_id,
    from_identifier: lastMessage.from_identifier || thread.from_identifier,
    subject: thread.subject,
    body_text: lastMessage.body_text || "",
    body_html: lastMessage.body_html,
    received_at: lastMessage.created_at,
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT:`);
  console.log(`Intent: ${result.intent} (${result.confidence})`);
  console.log(`Action: ${result.action}`);
  console.log(`State: ${result.previous_state} -> ${result.state}`);
  console.log(`Draft: ${result.draft?.substring(0, 200) || "(none)"}`);
}

main().catch(console.error);

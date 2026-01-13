/**
 * Inspect a thread's full conversation and events
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const THREAD_ID = process.argv[2] || "5748afc9-3136-40a2-8455-9ab03266b848";

async function main() {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`THREAD: ${THREAD_ID}`);
  console.log("=".repeat(80));

  // Get thread details
  const { data: thread } = await supabase
    .from("threads")
    .select("*")
    .eq("id", THREAD_ID)
    .single();

  if (!thread) {
    console.log("Thread not found!");
    return;
  }

  console.log(`\nSubject: ${thread.subject}`);
  console.log(`From: ${thread.from_identifier}`);
  console.log(`State: ${thread.state}`);
  console.log(`Intent: ${thread.intent}`);
  console.log(`Verification: ${thread.verification_status}`);
  console.log(`Created: ${thread.created_at}`);

  // Get all messages
  console.log(`\n${"=".repeat(80)}`);
  console.log("MESSAGES");
  console.log("=".repeat(80));

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", THREAD_ID)
    .order("created_at", { ascending: true });

  for (const msg of messages || []) {
    console.log(`\n${"-".repeat(60)}`);
    console.log(`[${msg.direction?.toUpperCase()}] ${msg.created_at}`);
    console.log(`From: ${msg.from_identifier || "Lina"}`);
    if (msg.subject) console.log(`Subject: ${msg.subject}`);
    console.log(`\n${msg.body_text || "(no text)"}`);
    if (msg.draft_status) console.log(`\nDraft Status: ${msg.draft_status}`);
  }

  // Get events
  console.log(`\n${"=".repeat(80)}`);
  console.log("EVENTS (Last 10)");
  console.log("=".repeat(80));

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("thread_id", THREAD_ID)
    .order("created_at", { ascending: false })
    .limit(10);

  for (const evt of (events || []).reverse()) {
    console.log(`\n${"-".repeat(40)}`);
    console.log(`${evt.created_at} - ${evt.event_type}`);
    if (evt.intent) console.log(`Intent: ${evt.intent} (${evt.confidence})`);
    if (evt.action) console.log(`Action: ${evt.action}`);
    if (evt.reasoning) console.log(`Reasoning: ${evt.reasoning}`);
    if (evt.metadata) console.log(`Metadata: ${JSON.stringify(evt.metadata, null, 2)}`);
  }

  // Get verification
  console.log(`\n${"=".repeat(80)}`);
  console.log("VERIFICATION");
  console.log("=".repeat(80));

  const { data: verification } = await supabase
    .from("customer_verifications")
    .select("*")
    .eq("thread_id", THREAD_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verification) {
    console.log(`Status: ${verification.status}`);
    console.log(`Order: ${verification.order_number}`);
    console.log(`Customer: ${verification.customer_name} (${verification.customer_email})`);
    console.log(`Likely Product: ${verification.likely_product}`);
    console.log(`Flags: ${verification.flags?.join(", ") || "none"}`);
  } else {
    console.log("No verification record");
  }
}

main().catch(console.error);

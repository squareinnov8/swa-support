/**
 * Debug thread messages and drafts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const THREAD_ID = "5748afc9-3136-40a2-8455-9ab03266b848";

async function main() {
  // Get the latest messages
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, body_text, draft_status, created_at, subject, from_identifier")
    .eq("thread_id", THREAD_ID)
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("LATEST MESSAGES:");
  for (const msg of messages || []) {
    console.log("=".repeat(60));
    console.log(`Direction: ${msg.direction}`);
    console.log(`From: ${msg.from_identifier}`);
    console.log(`Draft Status: ${msg.draft_status}`);
    console.log(`Created: ${msg.created_at}`);
    console.log(`Subject: ${msg.subject}`);
    console.log(`Body: ${(msg.body_text || "").substring(0, 300)}`);
  }

  // Check for pending drafts
  const { data: drafts } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", THREAD_ID)
    .eq("direction", "outbound")
    .in("draft_status", ["pending", "draft"])
    .order("created_at", { ascending: false });

  console.log("\n\nPENDING DRAFTS:");
  for (const draft of drafts || []) {
    console.log("=".repeat(60));
    console.log(`Status: ${draft.draft_status}`);
    console.log(`Created: ${draft.created_at}`);
    console.log(`Body: ${(draft.body_text || "").substring(0, 500)}`);
  }

  // Get thread classification
  const { data: thread } = await supabase
    .from("threads")
    .select("*")
    .eq("id", THREAD_ID)
    .single();

  console.log("\n\nTHREAD STATE:");
  console.log(`State: ${thread?.state}`);
  console.log(`Intent: ${thread?.intent}`);
  console.log(`Verification: ${thread?.verification_status}`);
  console.log(`Last Classification: ${JSON.stringify(thread?.last_classification, null, 2)}`);
}

main().catch(console.error);

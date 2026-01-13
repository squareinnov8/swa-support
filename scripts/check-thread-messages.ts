/**
 * Check thread messages with proper ID handling
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const threadId = "5748afc9-3136-40a2-8455-9ab03266b848";

  // Get all messages for this thread
  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${messages?.length || 0} messages`);

  // Show the last 3
  for (const msg of (messages || []).slice(0, 5)) {
    console.log("\n" + "=".repeat(60));
    console.log(`ID: ${msg.id}`);
    console.log(`Direction: ${msg.direction}`);
    console.log(`Draft Status: ${msg.draft_status}`);
    console.log(`Created: ${msg.created_at}`);
    console.log(`Body: ${(msg.body_text || "").substring(0, 300)}`);
  }
}

main().catch(console.error);

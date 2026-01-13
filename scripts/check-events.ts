/**
 * Check thread events
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const threadId = "5748afc9-3136-40a2-8455-9ab03266b848";

  // Get all events for this thread
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Found ${events?.length || 0} events`);

  for (const evt of (events || []).slice(0, 10)) {
    console.log("\n" + "=".repeat(60));
    console.log(`Event Type: ${evt.event_type}`);
    console.log(`Created: ${evt.created_at}`);
    console.log(`Intent: ${evt.intent} (${evt.confidence})`);
    console.log(`Action: ${evt.action}`);
    console.log(`Reasoning: ${evt.reasoning}`);
    console.log(`Draft: ${(evt.draft || "").substring(0, 500)}`);
    console.log(`Metadata:`, JSON.stringify(evt.metadata, null, 2));
  }
}

main().catch(console.error);

/**
 * Check threads with UNKNOWN or null intent
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Thread {
  id: string;
  subject: string;
  state: string;
  last_intent: string | null;
  created_at: string;
}

async function main() {
  // Get all threads with their intent
  const { data: threads } = await supabase
    .from("threads")
    .select("id, subject, state, last_intent, created_at")
    .order("created_at", { ascending: false });

  const allThreads = threads || [];
  const unknownIntents = allThreads.filter((t: Thread) => !t.last_intent || t.last_intent === "UNKNOWN");
  const byState: Record<string, Thread[]> = {};

  for (const t of unknownIntents) {
    const state = t.state || "NULL";
    if (!byState[state]) byState[state] = [];
    byState[state].push(t);
  }

  console.log(`Total threads: ${allThreads.length}`);
  console.log(`Threads with UNKNOWN/null intent: ${unknownIntents.length}\n`);

  console.log("By state:");
  for (const [state, items] of Object.entries(byState)) {
    console.log(`  ${state}: ${items.length}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Threads that might need reprocessing (NEW/IN_PROGRESS/AWAITING_INFO):");
  console.log("=".repeat(60));

  const needsReprocessing = unknownIntents.filter(
    (t: Thread) => t.state === "NEW" || t.state === "IN_PROGRESS" || t.state === "AWAITING_INFO"
  );

  for (const t of needsReprocessing) {
    console.log(`\n[${t.state}] ${t.subject}`);
    console.log(`  ID: ${t.id}`);
  }

  console.log(`\n\nTotal needing reprocessing: ${needsReprocessing.length}`);
}

main().catch(console.error);

/**
 * Check agent instructions
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get agent instructions
  const { data: instructions } = await supabase
    .from("agent_instructions")
    .select("section_key, title, content")
    .order("section_key");

  for (const inst of instructions || []) {
    console.log("=".repeat(70));
    console.log(`${inst.section_key}: ${inst.title}`);
    console.log("-".repeat(70));
    console.log(inst.content || "(empty)");
    console.log("");
  }
}

main().catch(console.error);

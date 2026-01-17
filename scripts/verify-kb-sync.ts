/**
 * Verify KB Sync
 * Shows all Shopify KB docs synced to Supabase
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get Shopify KB docs
  const { data: docs } = await supabase
    .from("kb_docs")
    .select("title, intent_tags, source_id")
    .like("source_id", "shopify-kb:%")
    .order("title");

  console.log("=".repeat(60));
  console.log("SHOPIFY KB DOCS IN SUPABASE");
  console.log("=".repeat(60));
  console.log("");

  for (const doc of docs || []) {
    console.log(`📄 ${doc.title}`);
    console.log(`   Intents: ${doc.intent_tags?.join(", ")}`);
    console.log("");
  }

  console.log("=".repeat(60));
  console.log(`Total: ${docs?.length} docs synced from Shopify KB`);
  console.log("=".repeat(60));
}

main().catch(console.error);

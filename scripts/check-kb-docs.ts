/**
 * Check KB docs for product information
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Get all KB docs
  const { data: docs } = await supabase
    .from("kb_docs")
    .select("title, body, intent_tags, product_tags")
    .order("title");

  console.log("=" .repeat(70));
  console.log("ALL KB DOCS");
  console.log("=" .repeat(70));

  for (const doc of docs || []) {
    console.log(`\n📄 ${doc.title}`);
    console.log(`   Intent tags: ${doc.intent_tags?.join(", ") || "none"}`);
    console.log(`   Product tags: ${doc.product_tags?.join(", ") || "none"}`);

    // Check if body mentions APEX or G-Series
    const mentionsAPEX = doc.body?.toLowerCase().includes("apex");
    const mentionsGSeries = doc.body?.toLowerCase().includes("g-series") || doc.body?.toLowerCase().includes("mk7");

    if (mentionsAPEX || mentionsGSeries) {
      console.log(`   Mentions: ${mentionsAPEX ? "APEX " : ""}${mentionsGSeries ? "G-Series/MK7" : ""}`);
    }
  }

  // Search for troubleshooting docs specifically
  console.log("\n\n" + "=" .repeat(70));
  console.log("TROUBLESHOOTING / AUDIO RELATED DOCS");
  console.log("=" .repeat(70));

  const { data: troubleDocs } = await supabase
    .from("kb_docs")
    .select("title, body")
    .or("title.ilike.%troubleshoot%,title.ilike.%audio%,body.ilike.%audio%,body.ilike.%sound%");

  for (const doc of troubleDocs || []) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`TITLE: ${doc.title}`);
    console.log("-".repeat(60));
    console.log(doc.body?.substring(0, 1500) || "(empty)");
  }
}

main().catch(console.error);

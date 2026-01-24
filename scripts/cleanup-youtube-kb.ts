/**
 * Clean up false positive YouTube KB articles
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanup() {
  // Delete non-SquareWheels videos (children's songs that matched "Wheels")
  const falsePositives = [
    "youtube-68pnAMQSj4Y", // Color Balls nursery rhyme
    "youtube-7sKul9vXpPg", // Wheels On the Bus
    "youtube-gUHaeltUr0w", // Baby Shark
  ];

  console.log("Cleaning up false positive KB articles...\n");

  for (const slug of falsePositives) {
    const { error } = await supabase.from("kb_docs").delete().eq("slug", slug);
    if (!error) {
      console.log("Deleted:", slug);
    } else {
      console.log("Not found or error:", slug);
    }
  }

  // List remaining video KB articles
  const { data } = await supabase
    .from("kb_docs")
    .select("title, slug")
    .eq("category", "videos")
    .order("title");

  console.log("\n--- Remaining Video KB Articles ---\n");
  for (const doc of data || []) {
    console.log(`- ${doc.title}`);
  }
  console.log(`\nTotal: ${data?.length || 0} videos`);
}

cleanup().catch(console.error);

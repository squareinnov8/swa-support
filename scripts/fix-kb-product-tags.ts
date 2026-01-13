/**
 * Fix KB docs with incorrect product tags
 *
 * MK7/G-Series docs should not have APEX tag (unless both are discussed)
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log("Checking KB docs for incorrect product tags...\n");

  // Find all docs
  const { data: docs } = await supabase
    .from("kb_docs")
    .select("id, title, body, product_tags")
    .order("title");

  const fixes: { id: string; title: string; oldTags: string[]; newTags: string[] }[] = [];

  for (const doc of docs || []) {
    const body = (doc.body || "").toLowerCase();
    const title = (doc.title || "").toLowerCase();
    const content = body + " " + title;

    // Check what products are actually mentioned
    const mentionsMK7 = content.includes("mk7");
    const mentionsGSeries = content.includes("g-series") || content.includes("gseries");
    const mentionsHeadUnit = content.includes("head unit") || content.includes("radio") || content.includes("headunit");
    const mentionsCarPlay = content.includes("carplay") || content.includes("android auto");
    const mentionsAUX = content.includes("aux ") || content.includes("aux,") || content.includes("auxiliary");

    const mentionsAPEX = content.includes("apex");
    const mentionsCluster = content.includes("cluster") || content.includes("gauge") || content.includes("speedometer");
    const mentionsInstrument = content.includes("instrument");

    // Determine what product this doc is actually about
    const isAboutGSeries = mentionsMK7 || mentionsGSeries ||
                           ((mentionsHeadUnit || mentionsCarPlay || mentionsAUX) && !mentionsAPEX);
    const isAboutAPEX = mentionsAPEX ||
                        ((mentionsCluster || mentionsInstrument) && !mentionsMK7 && !mentionsGSeries);

    // Check current tags
    const currentTags = doc.product_tags || [];
    const hasApexTag = currentTags.includes("APEX");
    const hasGSeriesTag = currentTags.includes("G-Series") || currentTags.includes("MK7");

    // Determine correct tags
    let newTags = [...currentTags];

    // If doc is about G-Series/MK7 but doesn't have the tag, add it
    if (isAboutGSeries && !hasGSeriesTag) {
      if (!newTags.includes("G-Series")) newTags.push("G-Series");
      if (mentionsMK7 && !newTags.includes("MK7")) newTags.push("MK7");
    }

    // If doc is ONLY about G-Series (not APEX) but has APEX tag, remove it
    if (isAboutGSeries && !isAboutAPEX && hasApexTag) {
      newTags = newTags.filter(t => t !== "APEX");
    }

    // If doc is about APEX but doesn't have the tag, add it
    if (isAboutAPEX && !hasApexTag) {
      if (!newTags.includes("APEX")) newTags.push("APEX");
    }

    // Check if tags changed
    const tagsChanged = JSON.stringify(newTags.sort()) !== JSON.stringify(currentTags.sort());

    if (tagsChanged) {
      fixes.push({
        id: doc.id,
        title: doc.title,
        oldTags: currentTags,
        newTags: newTags
      });
    }
  }

  console.log(`Found ${fixes.length} docs that need tag fixes:\n`);

  for (const fix of fixes) {
    console.log(`📄 ${fix.title}`);
    console.log(`   Old: [${fix.oldTags.join(", ")}]`);
    console.log(`   New: [${fix.newTags.join(", ")}]\n`);
  }

  if (fixes.length === 0) {
    console.log("✅ All KB docs have correct product tags!");
    return;
  }

  // Apply fixes
  console.log("\nApplying fixes...\n");

  for (const fix of fixes) {
    const { error } = await supabase
      .from("kb_docs")
      .update({ product_tags: fix.newTags, updated_at: new Date().toISOString() })
      .eq("id", fix.id);

    if (error) {
      console.log(`❌ Error updating ${fix.title}: ${error.message}`);
    } else {
      console.log(`✅ Fixed: ${fix.title}`);
    }
  }

  console.log("\n✅ Tag fixes complete!");
}

main().catch(console.error);

/**
 * Add Product Line Knowledge Base Document
 *
 * Creates a clear disambiguation document for APEX vs G-Series product lines
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_LINES_DOC = {
  title: "Product Lines - CRITICAL PRODUCT IDENTIFICATION",
  body: `# SquareWheels Product Lines - CRITICAL IDENTIFICATION GUIDE

## IMPORTANT: Always identify the correct product line before responding

SquareWheels has TWO DISTINCT main product lines. NEVER confuse them:

---

## 1. G-Series / MK7 - Tesla-Style Head Units (Touchscreen Radios)

**What it is:** Large Android-based touchscreen displays that REPLACE the factory radio/head unit. These are "Tesla-style" vertical screens.

**Product Names:**
- G-Series
- MK7 Screen
- Tesla-Style Screen
- Android Head Unit

**Key Identifiers in customer messages:**
- Mentions "radio" or "head unit"
- Mentions "AUX" input or audio connection
- Mentions "CarPlay" or "Android Auto"
- Mentions "touchscreen" display
- Mentions "GPS" or "navigation"
- Product name includes "MK7" or "G-Series"
- Installing in dash/center console

**Common Issues:**
- Audio not working through AUX
- CarPlay/Android Auto connection issues
- Bluetooth pairing problems
- GPS/navigation issues
- Screen display problems
- Radio reception
- Backup camera integration

**Support Center:** https://squarewheelsauto.com/pages/g-series-support-center

---

## 2. APEX - Digital Instrument Clusters (Dashboard Gauges)

**What it is:** Digital LCD screens that REPLACE the factory gauge cluster behind the steering wheel. Shows speedometer, RPM, and vehicle info.

**Product Names:**
- APEX
- APEX Cluster
- Digital Cluster
- Digital Dashboard
- Instrument Cluster

**Key Identifiers in customer messages:**
- Mentions "cluster" or "gauge"
- Mentions "speedometer" or "RPM"
- Mentions "dashboard" (behind steering wheel)
- Mentions "instrument panel"
- Product name includes "APEX"
- Installing behind steering wheel

**Common Issues:**
- Firmware updates
- Theme/skin changes
- Gauge readings incorrect
- CAN bus connection
- Power draw/battery drain
- Boot/startup problems

**Support Center:** https://squarewheelsauto.com/pages/apex-support-center

---

## 3. Glowe - Custom RGB Lighting

**What it is:** Interior and exterior LED lighting products for vehicle customization.

**Key Identifiers:**
- Mentions "lights" or "LED"
- Mentions "RGB" or "color"
- Mentions "interior lighting" or "ambient"

---

## HOW TO IDENTIFY THE PRODUCT

1. **Check the product name mentioned** - "MK7" or "G-Series" = Head Unit, "APEX" = Cluster
2. **Check what they're doing with it** - Radio/audio = Head Unit, Gauges = Cluster
3. **Check what feature is the issue** - CarPlay/AUX = Head Unit, Speedometer = Cluster
4. **Check where it's installed** - Center console = Head Unit, Behind steering wheel = Cluster
5. **Check the order if available** - Product title tells you exactly what they bought

## NEVER:
- Call a G-Series/MK7 an "APEX"
- Call an APEX a "radio" or "head unit"
- Provide APEX troubleshooting for G-Series issues
- Provide G-Series troubleshooting for APEX issues

## IF UNCERTAIN:
Ask the customer: "Just to make sure I'm helping with the right product - are you having issues with your dashboard gauge cluster (APEX) or your touchscreen radio (G-Series/MK7)?"
`,
  source: "manual",
  source_id: "product-lines-disambiguation",
  intent_tags: ["PRODUCT_SUPPORT", "COMPATIBILITY_QUESTION", "INSTALL_GUIDANCE", "FIRMWARE_UPDATE_REQUEST", "FUNCTIONALITY_BUG"],
  product_tags: ["APEX", "G-Series", "MK7", "Glowe"],
  vehicle_tags: [],
  evolution_status: "published",
  metadata: {
    priority: "critical",
    created_reason: "Product confusion in responses - APEX vs G-Series",
    created_at: new Date().toISOString(),
  },
};

async function main() {
  console.log("Creating Product Lines KB Document...\n");

  // Check if already exists
  const { data: existing } = await supabase
    .from("kb_docs")
    .select("id")
    .eq("source_id", PRODUCT_LINES_DOC.source_id)
    .maybeSingle();

  if (existing) {
    // Update
    const { error } = await supabase
      .from("kb_docs")
      .update({
        ...PRODUCT_LINES_DOC,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) throw error;
    console.log("✅ Updated existing Product Lines doc");
  } else {
    // Create
    const { error } = await supabase
      .from("kb_docs")
      .insert(PRODUCT_LINES_DOC);

    if (error) throw error;
    console.log("✅ Created new Product Lines doc");
  }

  console.log("\n⚠️  Run 'npm run embed:kb' to generate embeddings!");
}

main().catch(console.error);

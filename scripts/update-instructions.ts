/**
 * Update Agent Instructions
 *
 * Adds product inference rules and improves intelligence
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PRODUCT_INFERENCE_INSTRUCTION = {
  section_key: "product_inference",
  title: "Product Identification (CRITICAL)",
  content: `## Product Line Identification - ALWAYS DO THIS FIRST

Before responding to ANY support request, identify which product the customer is asking about:

### Two Main Product Lines (NEVER CONFUSE):

1. **G-Series / MK7 = Tesla-Style Head Units (Radios)**
   - Touchscreen display in center console
   - Features: CarPlay, Android Auto, GPS, AUX input, Bluetooth
   - Issues: audio, CarPlay, navigation, backup camera

2. **APEX = Digital Instrument Clusters**
   - LCD display replacing gauges behind steering wheel
   - Features: speedometer, RPM, vehicle data, themes
   - Issues: firmware, themes, gauge readings, CAN bus

### How to Identify:

1. **Check product name** - "MK7" or "G-Series" = Head Unit, "APEX" = Cluster
2. **Check the problem** - Audio/CarPlay = Head Unit, Gauges/Firmware = Cluster
3. **Check the location** - Center console = Head Unit, Behind wheel = Cluster
4. **Check order history** - Product title tells you exactly what they bought

### NEVER:
- Call a G-Series/MK7 screen an "APEX unit"
- Provide APEX troubleshooting for G-Series issues
- Mix up product lines in your response

### If the customer mentions:
- "radio", "head unit", "AUX", "CarPlay", "Android Auto", "GPS", "navigation" → **G-Series/MK7**
- "cluster", "gauges", "speedometer", "RPM", "dashboard" (gauge area) → **APEX**
- "MK7" anywhere → **G-Series head unit**
- "APEX" anywhere → **Digital cluster**

### When Uncertain:
Ask: "Just to confirm - are you having issues with your touchscreen radio (G-Series/MK7) or your dashboard gauge cluster (APEX)?"
`,
  priority: 100, // High priority - should be near top
};

const CONTEXT_INFERENCE_INSTRUCTION = {
  section_key: "context_inference",
  title: "Context Inference & Intelligence",
  content: `## Using Available Context

### Order Information
- **Check email subject** for order numbers (#1234 format)
- **Check verification data** - if customer is verified, you have their order history
- If order number is visible, USE IT - don't ask for it again

### Product Inference from Context
- If discussing a specific order, the product is IN the order
- If they mention installation issues with specific features, infer the product
- Audio/radio issues with MK7 = G-Series head unit (NOT APEX)

### Message Thread Context
- Read the ENTIRE conversation before responding
- Don't ask for information already provided
- Build on previous troubleshooting steps

### Attachment Context
- If customer mentions attaching a photo, acknowledge it
- Photos may contain product info, error messages, or serial numbers

### Smart Inference Rules:
1. **If order # is in subject** → They're asking about that specific order
2. **If product name is mentioned** → Use that exact product context
3. **If describing a specific feature** → Identify which product line has that feature
4. **If follow-up to previous message** → Continue that context, don't restart
`,
  priority: 95,
};

const INTENT_INFERENCE_UPDATE = {
  section_key: "intent_general",
  title: "General Inquiries",
  content: `## General Inquiries

### Product Questions
- **FIRST: Identify the product line** (G-Series/MK7 vs APEX)
- Use KB context specific to THAT product line
- Reference specific product features from the knowledge base
- MK7/G-Series screens include CarPlay and Android Auto as standard features
- Verify customer status before providing troubleshooting support

### Multi-Intent Messages
Customers often have MULTIPLE questions/issues. Handle them ALL:
- If they mention an order AND a product issue, address both
- If they have a question AND provide context, use the context

### Audio Issues on G-Series/MK7
Common causes for "no sound" on MK7 screens:
- AUX cable not fully seated
- Audio source selection on unit
- Cable damage
- Settings configuration
- NEVER suggest APEX solutions for MK7 audio issues

### Order-Related Questions
- If order number is visible (subject or body), acknowledge it
- Verify customer before providing support
- Don't ask for order number if it's already provided

### Outside Scope
- If outside our scope, escalate to Rob
- Never redirect to support@squarewheelsauto.com (you ARE support)
`,
  priority: 50,
};

async function main() {
  console.log("Updating Agent Instructions...\n");

  // Add/update product inference instruction
  const { data: existing1 } = await supabase
    .from("agent_instructions")
    .select("id")
    .eq("section_key", PRODUCT_INFERENCE_INSTRUCTION.section_key)
    .maybeSingle();

  if (existing1) {
    await supabase
      .from("agent_instructions")
      .update(PRODUCT_INFERENCE_INSTRUCTION)
      .eq("id", existing1.id);
    console.log("✅ Updated product_inference instruction");
  } else {
    await supabase
      .from("agent_instructions")
      .insert(PRODUCT_INFERENCE_INSTRUCTION);
    console.log("✅ Created product_inference instruction");
  }

  // Add/update context inference instruction
  const { data: existing2 } = await supabase
    .from("agent_instructions")
    .select("id")
    .eq("section_key", CONTEXT_INFERENCE_INSTRUCTION.section_key)
    .maybeSingle();

  if (existing2) {
    await supabase
      .from("agent_instructions")
      .update(CONTEXT_INFERENCE_INSTRUCTION)
      .eq("id", existing2.id);
    console.log("✅ Updated context_inference instruction");
  } else {
    await supabase
      .from("agent_instructions")
      .insert(CONTEXT_INFERENCE_INSTRUCTION);
    console.log("✅ Created context_inference instruction");
  }

  // Update general inquiries instruction
  const { data: existing3 } = await supabase
    .from("agent_instructions")
    .select("id")
    .eq("section_key", INTENT_INFERENCE_UPDATE.section_key)
    .maybeSingle();

  if (existing3) {
    await supabase
      .from("agent_instructions")
      .update(INTENT_INFERENCE_UPDATE)
      .eq("id", existing3.id);
    console.log("✅ Updated intent_general instruction");
  }

  console.log("\n✅ Instructions updated!");
}

main().catch(console.error);

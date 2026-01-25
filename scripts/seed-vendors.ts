/**
 * Seed Vendors Script
 *
 * Seeds the vendors table with initial data from the Google Sheet.
 * Run with: npx tsx scripts/seed-vendors.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Vendor data from Google Sheet (as of 2026-01-25)
const vendors = [
  {
    name: "AuCar",
    contact_emails: ["libby.l@amph-industry.cn", "emma.peng@amph-industry.cn"],
    product_patterns: ["G-Series", "APEX Cluster"],
    new_order_instructions: null,
    cancel_instructions: null,
    escalation_instructions: null,
  },
  {
    name: "Glowe Industries",
    contact_emails: [],
    product_patterns: ["Glowe Headlight", "Glowe Underglow"],
    new_order_instructions: null,
    cancel_instructions: null,
    escalation_instructions: null,
  },
  {
    name: "Sindar",
    contact_emails: ["christy@sindar-lighting.com"],
    product_patterns: ["Hawkeye"],
    new_order_instructions: null,
    cancel_instructions: null,
    escalation_instructions: null,
  },
  {
    name: "NextLevelNeo",
    contact_emails: [],
    product_patterns: ["Ghozt"],
    new_order_instructions: null,
    cancel_instructions: null,
    escalation_instructions: null,
  },
  {
    name: "Hansshow",
    contact_emails: [],
    product_patterns: ["Tesla"],
    new_order_instructions: null,
    cancel_instructions: null,
    escalation_instructions: null,
  },
  {
    name: "Aear",
    contact_emails: ["sam@aear.cc"],
    product_patterns: ["Tesla"],
    new_order_instructions: null,
    cancel_instructions: null,
    escalation_instructions: null,
  },
];

async function seedVendors() {
  console.log("Seeding vendors...\n");

  for (const vendor of vendors) {
    const { data, error } = await supabase
      .from("vendors")
      .upsert(vendor, { onConflict: "name" })
      .select()
      .single();

    if (error) {
      console.error(`Failed to upsert ${vendor.name}:`, error.message);
    } else {
      console.log(`✓ ${data.name}`);
      console.log(`  Emails: ${data.contact_emails.join(", ") || "(none)"}`);
      console.log(`  Patterns: ${data.product_patterns.join(", ")}`);
      console.log();
    }
  }

  console.log("Done! Vendors can be managed at /admin/vendors");
}

seedVendors().catch(console.error);

/**
 * Sync Shopify KB to Supabase
 *
 * Pulls KB metafields from Shopify and syncs them to Supabase's kb_docs table
 * so Lina can search and reference them in responses.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const KB_NAMESPACE = "shopify-knowledge-base";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function executeGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const url = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API error: ${response.status} - ${text}`);
  }

  const result = await response.json();
  return result.data;
}

const SHOP_KB_METAFIELDS_QUERY = `
  query GetShopKBMetafields($namespace: String!) {
    shop {
      metafields(first: 50, namespace: $namespace) {
        edges {
          node {
            id
            namespace
            key
            value
            type
          }
        }
      }
    }
  }
`;

// Mapping of KB keys to intent tags and human-readable titles
const KB_CONFIG: Record<
  string,
  { title: string; intents: string[]; productTags?: string[] }
> = {
  company_info: {
    title: "Company Information - SquareWheels Automotive",
    intents: ["general_inquiry"],
  },
  support_info: {
    title: "Customer Support - Contact & Availability",
    intents: ["general_inquiry", "escalation_request"],
  },
  product_categories: {
    title: "Product Categories & Supported Vehicles",
    intents: ["product_question", "compatibility_question", "pre_purchase"],
    productTags: ["G-Series", "APEX", "Glowe", "Accessories"],
  },
  shipping_policy: {
    title: "Shipping Policy & Delivery Times",
    intents: ["shipping_question", "order_status", "pre_purchase"],
  },
  international_shipping: {
    title: "International Shipping & Import Duties",
    intents: ["shipping_question", "pre_purchase"],
  },
  return_policy: {
    title: "Return & Refund Policy",
    intents: ["policy_question", "return_request", "refund_request"],
  },
  order_cancellation: {
    title: "Order Cancellation Policy",
    intents: ["policy_question", "order_change"],
  },
  warranty_policy: {
    title: "Warranty Policy & Coverage",
    intents: ["policy_question", "warranty_claim", "product_issue"],
  },
  damages_policy: {
    title: "Damaged Items Policy",
    intents: ["product_issue", "policy_question"],
  },
  installation_info: {
    title: "Installation Guide & DIY Instructions",
    intents: ["install_support", "product_question"],
    productTags: ["APEX", "G-Series"],
  },
  payment_methods: {
    title: "Accepted Payment Methods",
    intents: ["pre_purchase", "general_inquiry"],
  },
  faq_general: {
    title: "Frequently Asked Questions",
    intents: [
      "general_inquiry",
      "shipping_question",
      "policy_question",
      "install_support",
    ],
  },
  policies_summary: {
    title: "Policies Quick Reference",
    intents: ["policy_question", "general_inquiry"],
  },
};

/**
 * Convert JSON KB data to readable markdown-style body
 */
function formatKBBody(key: string, data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  const json = data as Record<string, unknown>;

  switch (key) {
    case "company_info":
      return formatCompanyInfo(json);
    case "support_info":
      return formatSupportInfo(json);
    case "product_categories":
      return formatProductCategories(json);
    case "shipping_policy":
      return formatShippingPolicy(json);
    case "international_shipping":
      return formatInternationalShipping(json);
    case "return_policy":
      return formatReturnPolicy(json);
    case "order_cancellation":
      return formatOrderCancellation(json);
    case "warranty_policy":
      return formatWarrantyPolicy(json);
    case "damages_policy":
      return formatDamagesPolicy(json);
    case "installation_info":
      return formatInstallationInfo(json);
    case "payment_methods":
      return formatPaymentMethods(json);
    case "faq_general":
      return formatFAQ(json);
    case "policies_summary":
      return formatPoliciesSummary(json);
    default:
      return JSON.stringify(data, null, 2);
  }
}

function formatCompanyInfo(data: Record<string, unknown>): string {
  return `# ${data.name}

**Tagline:** ${data.tagline}

${data.description}

**Location:** ${data.founded_location}
**Website:** ${data.website}
**Currency:** ${data.currency}
**Owner:** ${data.owner}

## Company Values
${(data.values as string[]).map((v) => `- ${v}`).join("\n")}
`;
}

function formatSupportInfo(data: Record<string, unknown>): string {
  const centers = data.support_centers as Array<{
    name: string;
    url: string;
    products: string[];
  }>;
  return `# Customer Support

**Primary Email:** ${data.primary_email}
**Availability:** ${data.availability}
**Response Time:** ${data.response_time}
**Phone Support:** ${data.phone_support ? "Yes" : "No"} - ${data.phone_note}

## Support Centers
${centers.map((c) => `- **${c.name}**: ${c.url} (for ${c.products.join(", ")})`).join("\n")}

**YouTube Channel:** ${data.youtube_channel}
`;
}

function formatProductCategories(data: Record<string, unknown>): string {
  const categories = data.main_categories as Array<Record<string, unknown>>;
  const makes = data.supported_vehicle_makes as string[];

  let body = "# Product Categories\n\n";

  for (const cat of categories) {
    body += `## ${cat.name}\n`;
    body += `${cat.description}\n\n`;
    if (cat.key_features) {
      body += `**Key Features:**\n${(cat.key_features as string[]).map((f) => `- ${f}`).join("\n")}\n\n`;
    }
    if (cat.supported_vehicles) {
      body += `**Supported Vehicles:** ${(cat.supported_vehicles as string[]).join(", ")}\n\n`;
    }
    body += `**Typical Price Range:** ${cat.typical_price_range}\n`;
    if (cat.support_url) {
      body += `**Support URL:** ${cat.support_url}\n`;
    }
    body += "\n";
  }

  body += `## Supported Vehicle Makes\n${makes.join(", ")}\n`;
  return body;
}

function formatShippingPolicy(data: Record<string, unknown>): string {
  const estimates = data.delivery_estimates as Record<
    string,
    Record<string, unknown>
  >;
  const sig = data.signature_required as Record<string, unknown>;

  let body = `# Shipping Policy

${data.overview}

**Free Shipping:** Orders over $${data.free_shipping_threshold}
**Signature Required:** Orders over $${sig.threshold} - ${sig.policy}

## Delivery Estimates

`;

  for (const [, est] of Object.entries(estimates)) {
    body += `### ${est.name}\n`;
    if (est.processing) body += `- **Processing:** ${est.processing}\n`;
    if (est.fulfillment) body += `- **Fulfillment:** ${est.fulfillment}\n`;
    body += `- **Total Estimate:** ${est.total_estimate}\n`;
    if (est.note) body += `- **Note:** ${est.note}\n`;
    body += "\n";
  }

  body += `\n**Tracking:** ${data.tracking}\n`;
  return body;
}

function formatInternationalShipping(data: Record<string, unknown>): string {
  const duties = data.import_duties as Record<string, string>;
  return `# International Shipping

**Available:** ${data.available ? "Yes" : "No"}
**Ships To:** ${data.ships_to}
**Excluded Countries:** ${(data.excluded_countries as string[]).join(", ")}

## Import Duties
${duties.note}

**Responsibility:** ${duties.responsibility}

${duties.explanation}

**Pricing Policy:** ${data.pricing_policy}
**More Info:** ${data.more_info_url}
`;
}

function formatReturnPolicy(data: Record<string, unknown>): string {
  const process = data.process as Record<string, string>;
  const nonReturnable = data.non_returnable_items as string[];

  return `# Return & Refund Policy

**Return Window:** ${data.return_window_days} days - ${data.return_window_description}
**Restocking Fee:** ${data.restocking_fee} - ${data.restocking_fee_note}

## Conditions for Return
${(data.conditions as string[]).map((c) => `- ${c}`).join("\n")}

## Return Process
1. ${process.step1}
2. ${process.step2}
3. ${process.step3}
4. ${process.step4}

## Non-Returnable Items
${nonReturnable.map((item) => `- ${item}`).join("\n")}
`;
}

function formatOrderCancellation(data: Record<string, unknown>): string {
  return `# Order Cancellation

**Cancellation Allowed:** ${data.allowed ? "Yes" : "No"}
**Condition:** ${data.condition}
**Cancellation Fee:** ${data.cancellation_fee} - ${data.cancellation_fee_description}
`;
}

function formatWarrantyPolicy(data: Record<string, unknown>): string {
  return `# Warranty Policy

**Duration:** ${data.duration} - ${data.duration_description}
**Effective Date:** ${data.effective_date}
**Coverage:** ${data.coverage}

## Exclusions (Not Covered)
${(data.exclusions as string[]).map((e) => `- ${e}`).join("\n")}

**Note:** ${data.exclusion_note}

## Extended Support
${data.extended_support}

## How to Claim
${data.claim_process}
`;
}

function formatDamagesPolicy(data: Record<string, unknown>): string {
  return `# Damaged Items Policy

**Inspection:** ${data.inspection_required}
**Our Response:** ${data.response}
**Contact:** ${data.contact}

**Post-Delivery Liability:** ${data.post_delivery_liability}
`;
}

function formatInstallationInfo(data: Record<string, unknown>): string {
  const resources = data.resources as Record<string, string>;
  const pro = data.professional_installation as Record<string, unknown>;
  const apex = data.apex_install_summary as Record<string, unknown>;

  let body = `# Installation Information

**Difficulty:** ${data.difficulty}
**Skill Level:** ${data.skill_level}
**Tools Required:** ${(data.tools_required as string[]).join(", ")}

${data.description}

## Resources
- **YouTube Channel:** ${resources.youtube_channel}
- **APEX Install Guide:** ${resources.apex_install_guide}
- **APEX Install Video:** ${resources.apex_install_video}

## Professional Installation
**Available:** ${pro.available ? "Yes" : "No"}
**Service:** ${pro.service_name}
**Coverage Area:** ${pro.coverage_area}
**Note:** ${pro.note}

## APEX Installation Summary
**Time Estimate:** ${apex.time_estimate}
**Video:** ${apex.video_url}

**Steps:**
${(apex.steps as string[]).map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;

  return body;
}

function formatPaymentMethods(data: Record<string, unknown>): string {
  return `# Accepted Payment Methods

${(data.accepted as string[]).map((m) => `- ${m}`).join("\n")}
`;
}

function formatFAQ(data: Record<string, unknown>): string {
  const questions = data.questions as Array<{ q: string; a: string }>;

  let body = "# Frequently Asked Questions\n\n";

  for (const faq of questions) {
    body += `## ${faq.q}\n${faq.a}\n\n`;
  }

  return body;
}

function formatPoliciesSummary(data: Record<string, unknown>): string {
  return `# Policies Quick Reference

- **Warranty:** ${data.warranty}
- **Returns:** ${data.returns}
- **Cancellation:** ${data.cancellation}
- **Support:** ${data.support}
- **Domestic Shipping:** ${data.shipping_domestic}
- **International Shipping:** ${data.shipping_international}
- **Installation:** ${data.installation}
- **Signature Required:** ${data.signature_required}
- **Free Shipping:** ${data.free_shipping}
`;
}

async function main() {
  console.log("=".repeat(70));
  console.log("SYNC SHOPIFY KB TO SUPABASE");
  console.log("=".repeat(70));

  // 1. Fetch KB metafields from Shopify
  console.log("\n1. Fetching KB metafields from Shopify...");
  const shopData = await executeGraphQL<any>(SHOP_KB_METAFIELDS_QUERY, {
    namespace: KB_NAMESPACE,
  });

  const metafields = shopData?.shop?.metafields?.edges || [];
  console.log(`   Found ${metafields.length} metafields`);

  // 2. Filter to configured KB fields (skip test fields)
  const kbFields = metafields.filter(
    ({ node }: { node: { key: string } }) => KB_CONFIG[node.key]
  );
  console.log(`   ${kbFields.length} are configured KB fields`);

  // 3. Sync each to Supabase
  console.log("\n2. Syncing to Supabase kb_docs...\n");

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const { node } of kbFields) {
    const config = KB_CONFIG[node.key];
    if (!config) continue;

    try {
      // Parse the JSON value
      let data: unknown;
      try {
        data = JSON.parse(node.value);
      } catch {
        data = node.value;
      }

      // Format as readable body
      const body = formatKBBody(node.key, data);

      // Check if doc already exists (by source_id)
      const sourceId = `shopify-kb:${node.key}`;
      const { data: existing } = await supabase
        .from("kb_docs")
        .select("id")
        .eq("source_id", sourceId)
        .maybeSingle();

      const docData = {
        title: config.title,
        body,
        source: "manual" as const,
        source_id: sourceId,
        intent_tags: config.intents,
        product_tags: config.productTags || [],
        vehicle_tags: [],
        evolution_status: "published" as const,
        metadata: {
          shopify_kb_namespace: KB_NAMESPACE,
          shopify_kb_key: node.key,
          shopify_metafield_id: node.id,
          synced_at: new Date().toISOString(),
        },
      };

      if (existing) {
        // Update
        const { error } = await supabase
          .from("kb_docs")
          .update({
            ...docData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
        console.log(`   ✅ Updated: ${config.title}`);
        updated++;
      } else {
        // Create
        const { error } = await supabase.from("kb_docs").insert(docData);

        if (error) throw error;
        console.log(`   ✅ Created: ${config.title}`);
        created++;
      }
    } catch (err) {
      console.error(`   ❌ Error syncing ${node.key}:`, err);
      errors++;
    }
  }

  // 4. Summary
  console.log("\n" + "=".repeat(70));
  console.log("SYNC COMPLETE");
  console.log("=".repeat(70));
  console.log(`✅ Created: ${created}`);
  console.log(`🔄 Updated: ${updated}`);
  console.log(`❌ Errors: ${errors}`);

  if (created > 0 || updated > 0) {
    console.log("\n⚠️  Run 'npm run embed:kb' to generate embeddings for new docs!");
  }
}

main().catch(console.error);

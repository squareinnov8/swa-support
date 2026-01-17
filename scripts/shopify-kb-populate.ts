/**
 * Shopify Knowledge Base Population
 *
 * Populates the shopify-knowledge-base namespace with comprehensive
 * shop-level data for AI/agentic searchers.
 */

import "dotenv/config";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const KB_NAMESPACE = "shopify-knowledge-base";

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

  if (result.errors && result.errors.length > 0) {
    console.error("GraphQL Errors:", JSON.stringify(result.errors, null, 2));
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}

// Get shop ID
const SHOP_ID_QUERY = `
  query GetShopId {
    shop {
      id
    }
  }
`;

// Mutation to set metafields
const SET_METAFIELDS = `
  mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        namespace
        key
        value
        type
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// ============================================================================
// KNOWLEDGE BASE DATA
// ============================================================================

const KB_DATA = {
  // Company Information
  company_info: {
    type: "json",
    value: {
      name: "SquareWheels Automotive",
      legal_name: "squarewheels",
      tagline:
        "Your home for Aftermarket Automotive - Tesla-Style Screens, Digital Clusters & Custom Lighting",
      description:
        "SquareWheels Automotive specializes in premium aftermarket automotive upgrades, including Tesla-style Android head units (G-Series), digital instrument clusters (APEX), and custom RGB lighting solutions (Glowe). Based in Georgia, USA, we serve car enthusiasts looking to modernize their vehicles with cutting-edge displays, Apple CarPlay/Android Auto integration, and personalized lighting.",
      founded_location: "Suwanee, Georgia, USA",
      website: "https://squarewheelsauto.com",
      currency: "USD",
      owner: "Rob",
      values: [
        "Transparency in pricing and policies",
        "Culture-first commitment to customers",
        "Treating customers as peers, not paydays",
        "Honest, no hidden markups",
      ],
    },
  },

  // Contact & Support
  support_info: {
    type: "json",
    value: {
      primary_email: "support@squarewheelsauto.com",
      owner_email: "rob@squarewheelsauto.com",
      availability: "24/7 - before, during, and after sale",
      response_time: "We strive to resolve all issues within 24 hours from first report",
      phone_support: false,
      phone_note: "Phone support is not currently offered and usually not needed",
      support_centers: [
        {
          name: "APEX Support Center",
          url: "https://squarewheelsauto.com/pages/apex-support-center",
          products: ["APEX Digital Clusters"],
        },
        {
          name: "G-Series Support Center",
          url: "https://squarewheelsauto.com/pages/g-series-support-center",
          products: ["G-Series Tesla-Style Screens"],
        },
      ],
      youtube_channel: "https://www.youtube.com/channel/UCKsJd8PrUYIc2znG4nh02SQ",
    },
  },

  // Product Categories
  product_categories: {
    type: "json",
    value: {
      main_categories: [
        {
          name: "G-Series Tesla-Style Screens",
          slug: "g-series",
          description:
            "Large touchscreen Android head units with Apple CarPlay & Android Auto integration. Tesla-style vertical displays that replace factory radios.",
          key_features: [
            "Apple CarPlay & Android Auto",
            "Large touchscreen displays",
            "GPS navigation",
            "Bluetooth connectivity",
            "Backup camera support",
          ],
          typical_price_range: "$500-$900",
          support_url: "https://squarewheelsauto.com/pages/g-series-support-center",
        },
        {
          name: "APEX Digital Clusters",
          slug: "apex",
          description:
            "Digital dashboard instrument clusters that replace factory gauge clusters with customizable digital displays, multiple themes, and enhanced features.",
          key_features: [
            "Multiple customizable themes",
            "Real-time vehicle data display",
            "G-force mapping and recording",
            "Maintenance tracking",
            "Mileage sync from OEM cluster",
          ],
          supported_vehicles: ["Infiniti Q50/Q60", "Infiniti G37", "Nissan GT-R"],
          typical_price_range: "$800-$1200",
          support_url: "https://squarewheelsauto.com/pages/apex-support-center",
        },
        {
          name: "Glowe Lighting",
          slug: "glowe",
          description:
            "Custom RGB ambient lighting kits, underglow systems, and LED headlight modifications.",
          key_features: [
            "Custom built to order",
            "RGB color options",
            "Ambient interior lighting",
            "Underglow kits",
            "Headlight RGB kits",
          ],
          typical_price_range: "$200-$600",
          note: "All lighting kits are custom created when you order",
        },
        {
          name: "Accessories",
          slug: "accessories",
          description:
            "Supporting products including HD backup cameras, screen protectors, wiring kits, and installation accessories.",
          products: [
            "HD Backup Camera (OEM+ 1080p replacement)",
            "Screen Protectors",
            "Spare Wiring/Install Kits",
            "No-Splice Audio Harness",
          ],
          typical_price_range: "$20-$150",
        },
      ],
      supported_vehicle_makes: [
        "Infiniti",
        "Nissan",
        "Toyota",
        "Ford",
        "Jeep",
        "Lexus",
        "Dodge",
        "Chevrolet",
        "GMC",
        "BMW",
        "Tesla",
        "Maserati",
        "Bentley",
        "Subaru",
        "Mitsubishi",
        "Cadillac",
      ],
    },
  },

  // Shipping Policy
  shipping_policy: {
    type: "json",
    value: {
      overview:
        "Most products are dropshipped from SquareWheels partners with variable processing times. Check the site banner for any current delays.",
      free_shipping_threshold: 1000,
      free_shipping_threshold_currency: "USD",
      signature_required: {
        threshold: 1099,
        currency: "USD",
        policy: "Orders over $1,099 require signature upon delivery",
      },
      delivery_estimates: {
        g_series_apex: {
          name: "G-Series Screens & APEX Clusters",
          processing: "3-5 business days",
          shipping: "After processing, tracking sent via email and SMS",
          total_estimate: "~10 business days from order to delivery",
          note: "Be pleasantly surprised if it arrives sooner!",
        },
        tesla_accessories: {
          name: "Tesla S3XY Stuff",
          processing: "3-5 business days",
          total_estimate: "~30 business days from order to delivery",
        },
        g_series_accessories: {
          name: "G-Series Accessories (cameras, screen protectors, wiring kits)",
          fulfillment: "Dropshipped direct from manufacturer",
          total_estimate: "5-10 business days",
        },
        glowe_lighting: {
          name: "Glowe Lighting Kits",
          note: "All lighting kits are custom created when you order",
          processing: "5-10 business days",
          total_estimate: "5-10 business days after custom build",
        },
      },
      tracking:
        "You will automatically receive tracking via email and text (if mobile number provided) when your order ships",
    },
  },

  // International Shipping
  international_shipping: {
    type: "json",
    value: {
      available: true,
      ships_to: "Global (all countries except Ukraine)",
      excluded_countries: ["Ukraine"],
      import_duties: {
        note: "For international orders, an import tariff may be charged to you at the port",
        responsibility: "Customer is responsible for any import duties or tariffs",
        explanation:
          "Most SquareWheels orders are drop-shipped directly from the factory, so customs handles the calculation and collection. Your package may arrive with an import duty fee.",
      },
      pricing_policy:
        "We do not raise prices to cover tariffs - you get honest, transparent rates",
      more_info_url: "https://squarewheelsauto.com/pages/tariffs",
    },
  },

  // Return & Refund Policy
  return_policy: {
    type: "json",
    value: {
      return_window_days: 30,
      return_window_description: "30 days after receiving your item to request a return",
      restocking_fee: "20%",
      restocking_fee_note:
        "Non-negotiable 20% restocking fee on all returns. We negotiate with vendors to keep prices competitive and get orders to you quickly - returns are expensive for us.",
      conditions: [
        "Item must be in same condition as received",
        "Unworn or unused",
        "Original tags attached",
        "Original packaging required",
        "Receipt or proof of purchase required",
      ],
      process: {
        step1: "Contact support@squarewheelsauto.com to request a return",
        step2: "If approved, we'll send return shipping instructions",
        step3: "Items sent back without approval will not be accepted",
        step4: "Once received and inspected, refund is processed to original payment method",
      },
      non_returnable_items: [
        "Digital downloads (e.g., Sergey Firmware)",
        "Custom products (special orders, custom-cut lighting kits, personalized items)",
        "Sale items",
        "Gift cards",
        "Perishable goods",
        "Personal care goods",
        "Hazardous materials, flammable liquids, or gases",
      ],
    },
  },

  // Order Cancellation
  order_cancellation: {
    type: "json",
    value: {
      allowed: true,
      condition: "Before order is processed & shipped",
      cancellation_fee: "10%",
      cancellation_fee_description: "10% service charge on cancelled orders",
    },
  },

  // Warranty Policy
  warranty_policy: {
    type: "json",
    value: {
      duration: "1 year",
      duration_description: "1 Year Manufacturer's Warranty",
      effective_date: "Effective from the date your order is delivered",
      coverage: "Manufacturing defects and hardware failures",
      exclusions: [
        "Connectivity issues",
        "Software/app issues",
        "Operating system issues",
        "Damage after confirmed delivery",
        "Issues caused by third-party apps or services",
      ],
      exclusion_note:
        "Connectivity, software/app or operating system issues do not constitute defects. Please work with the respective app/service's provider for troubleshooting/resolution.",
      extended_support:
        "In most cases, we offer white glove support throughout the life of the product, regardless of warranty status",
      claim_process: "Contact support@squarewheelsauto.com with your order details and issue description",
    },
  },

  // Damages & Issues
  damages_policy: {
    type: "json",
    value: {
      inspection_required:
        "Please inspect your order upon reception and contact us immediately if the item is defective, damaged, or if you receive the wrong item",
      response: "We will evaluate the issue and make it right",
      contact: "support@squarewheelsauto.com",
      post_delivery_liability:
        "We are not liable for loss, theft, or damage occurring after confirmed delivery",
    },
  },

  // Installation Information
  installation_info: {
    type: "json",
    value: {
      difficulty: "DIY-friendly",
      skill_level: "Beginner to intermediate - a grandmother installed one with her grandkid!",
      tools_required: ["Screwdriver", "Basic hand tools"],
      description:
        "All units are plug and play with simple tools. Most customers successfully DIY install using our video guides on YouTube or written installation guides on the website.",
      resources: {
        youtube_channel: "https://www.youtube.com/channel/UCKsJd8PrUYIc2znG4nh02SQ",
        apex_install_guide:
          "https://squarewheelsauto.com/blogs/apex-topics/apex-digital-cluster-installation-guide",
        apex_install_video: "https://www.youtube.com/watch?v=3h4ihtDvhjE",
      },
      professional_installation: {
        available: true,
        service_name: "White Glove Installation Service",
        coverage_area: "Atlanta area only (50 mile radius)",
        note: "Available for some products in the Atlanta metro area",
      },
      apex_install_summary: {
        steps: [
          "Remove OEM cluster (car OFF, remove plastic fascia, unscrew cluster, unplug connectors)",
          "Route USB and HDMI cables to driver footwell/video source",
          "Sync mileage using included adapter (plug both OEM and APEX clusters)",
          "Install APEX cluster (connect OEM plugs, USB, HDMI)",
          "Reinstall fascia and reconnect switches",
        ],
        time_estimate: "30-60 minutes for most users",
        video_url: "https://www.youtube.com/watch?v=3h4ihtDvhjE",
      },
    },
  },

  // Payment Methods
  payment_methods: {
    type: "json",
    value: {
      accepted: [
        "Amazon Pay",
        "American Express",
        "Apple Pay",
        "Bancontact",
        "Diners Club",
        "Discover",
        "Google Pay",
        "iDEAL",
        "Mastercard",
        "PayPal",
        "Shop Pay",
        "Visa",
      ],
    },
  },

  // FAQ - General
  faq_general: {
    type: "json",
    value: {
      questions: [
        {
          q: "How long does shipping take?",
          a: "G-Series screens and APEX clusters typically arrive within 10 business days. Accessories take 5-10 days. Tesla products take about 30 days. Check our shipping page for current processing times.",
        },
        {
          q: "Do you ship internationally?",
          a: "Yes! We ship globally to all countries except Ukraine. Note that international orders may incur import tariffs which are the customer's responsibility.",
        },
        {
          q: "Can I install this myself?",
          a: "Absolutely! All our products are plug and play. We have YouTube videos and written guides to help you through the process. Most installs take under an hour with just a screwdriver.",
        },
        {
          q: "What's the warranty?",
          a: "All products come with a 1-year manufacturer's warranty from delivery date. We also provide white glove support throughout the product's life, even after warranty expires.",
        },
        {
          q: "Can I return my order?",
          a: "Yes, within 30 days of receiving your item. Items must be unused in original packaging. A 20% restocking fee applies. Contact support@squarewheelsauto.com to start a return.",
        },
        {
          q: "How do I cancel my order?",
          a: "You can cancel before the order ships. A 10% service charge applies to cancellations. Contact support@squarewheelsauto.com immediately if you need to cancel.",
        },
        {
          q: "What if my item arrives damaged?",
          a: "Inspect your order immediately upon arrival. Contact support@squarewheelsauto.com right away if anything is defective, damaged, or wrong. We'll make it right.",
        },
        {
          q: "Do you offer professional installation?",
          a: "Yes, we offer White Glove Installation Service in the Atlanta area (50 mile radius) for select products.",
        },
        {
          q: "Will this fit my vehicle?",
          a: "Check the product page for vehicle compatibility. We support many makes including Infiniti, Nissan, Toyota, Ford, Jeep, Lexus, and more. Contact us if you're unsure.",
        },
        {
          q: "How do I get firmware updates?",
          a: "Visit our Support Centers (APEX or G-Series) for the latest firmware downloads and update instructions.",
        },
      ],
    },
  },

  // Important Policies Summary (for quick AI reference)
  policies_summary: {
    type: "json",
    value: {
      warranty: "1 year manufacturer warranty from delivery date",
      returns: "30 days, 20% restocking fee, original condition required",
      cancellation: "Before shipping, 10% service charge",
      support: "24/7 via email, 24-hour resolution target",
      shipping_domestic: "10 business days typical for main products",
      shipping_international: "Available globally (except Ukraine), tariffs may apply",
      installation: "DIY plug-and-play, video guides available",
      signature_required: "Orders over $1,099",
      free_shipping: "Orders over $1,000",
    },
  },
};

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log("=".repeat(70));
  console.log("SHOPIFY KNOWLEDGE BASE POPULATION");
  console.log("=".repeat(70));
  console.log(`Store: ${STORE_DOMAIN}`);
  console.log(`Namespace: ${KB_NAMESPACE}`);
  console.log("");

  // 1. Get Shop ID
  console.log("Fetching shop ID...");
  const shopData = await executeGraphQL<any>(SHOP_ID_QUERY);
  const shopId = shopData?.shop?.id;

  if (!shopId) {
    throw new Error("Could not fetch shop ID");
  }
  console.log(`Shop ID: ${shopId}\n`);

  // 2. Prepare metafields
  const metafields = Object.entries(KB_DATA).map(([key, { type, value }]) => ({
    ownerId: shopId,
    namespace: KB_NAMESPACE,
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    type,
  }));

  console.log(`Preparing ${metafields.length} KB metafields:\n`);
  for (const mf of metafields) {
    const valuePreview =
      mf.value.length > 80 ? mf.value.substring(0, 80) + "..." : mf.value;
    console.log(`  📝 ${mf.key} [${mf.type}]`);
    console.log(`     ${valuePreview}\n`);
  }

  // 3. Set metafields (in batches if needed - Shopify allows 25 per request)
  console.log("\n" + "=".repeat(70));
  console.log("WRITING METAFIELDS");
  console.log("=".repeat(70));

  const BATCH_SIZE = 25;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < metafields.length; i += BATCH_SIZE) {
    const batch = metafields.slice(i, i + BATCH_SIZE);
    console.log(
      `\nWriting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} metafields)...`
    );

    try {
      const result = await executeGraphQL<any>(SET_METAFIELDS, {
        metafields: batch,
      });

      const userErrors = result?.metafieldsSet?.userErrors || [];
      const created = result?.metafieldsSet?.metafields || [];

      if (userErrors.length > 0) {
        console.log("  ⚠️ User errors:");
        for (const err of userErrors) {
          console.log(`     - ${err.field}: ${err.message} (${err.code})`);
          errorCount++;
        }
      }

      for (const mf of created) {
        console.log(`  ✅ ${mf.namespace}.${mf.key}`);
        successCount++;
      }
    } catch (err) {
      console.error(`  ❌ Batch failed:`, err);
      errorCount += batch.length;
    }
  }

  // 4. Summary
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`✅ Successfully created: ${successCount} metafields`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log("");

  if (successCount > 0) {
    console.log("Knowledge Base is now populated!");
    console.log(
      "AI agents can query these metafields for intelligent store-specific answers."
    );
  }
}

main().catch(console.error);

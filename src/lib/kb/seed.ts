/**
 * KB Seed Script
 *
 * Seeds the initial category hierarchy and sample documents.
 * Run with: npm run seed:kb
 */

import "dotenv/config";
import { createCategory, getCategoryBySlug } from "./categories";
import { createDoc } from "./documents";
import { INITIAL_CATEGORIES, type CreateKBCategoryInput } from "./types";

/**
 * Extended category structure with subcategories
 */
const FULL_CATEGORY_STRUCTURE: (CreateKBCategoryInput & {
  subcategories?: CreateKBCategoryInput[];
})[] = [
  {
    name: "Firmware Updates",
    slug: "firmware-updates",
    description: "Firmware update procedures and troubleshooting",
    subcategories: [
      { name: "APEX Firmware", slug: "apex-firmware", description: "APEX-specific firmware guides" },
    ],
  },
  {
    name: "Installation",
    slug: "installation",
    description: "Product installation guides",
    subcategories: [
      { name: "APEX Installation", slug: "apex-installation", description: "APEX installation procedures" },
    ],
  },
  {
    name: "Troubleshooting",
    slug: "troubleshooting",
    description: "Common issues and solutions",
    subcategories: [
      { name: "Connection Issues", slug: "connection-issues", description: "WiFi, Bluetooth, and connectivity problems" },
      { name: "Login Problems", slug: "login-problems", description: "Account and authentication issues" },
      { name: "Hardware Issues", slug: "hardware-issues", description: "Physical device problems" },
    ],
  },
  {
    name: "Policies",
    slug: "policies",
    description: "Company policies and procedures",
    subcategories: [
      { name: "Returns & Refunds", slug: "returns-refunds", description: "Return and refund policies" },
      { name: "Warranty", slug: "warranty", description: "Warranty coverage and claims" },
      { name: "Shipping", slug: "shipping", description: "Shipping policies and timeframes" },
    ],
  },
  {
    name: "FAQs",
    slug: "faqs",
    description: "Frequently asked questions",
  },
];

/**
 * Seed the category hierarchy
 */
export async function seedCategories(): Promise<void> {
  console.log("🌱 Seeding KB categories...\n");

  for (const category of FULL_CATEGORY_STRUCTURE) {
    // Check if parent exists
    let parent = await getCategoryBySlug(category.slug);

    if (!parent) {
      parent = await createCategory({
        name: category.name,
        slug: category.slug,
        description: category.description,
        sort_order: FULL_CATEGORY_STRUCTURE.indexOf(category),
      });
      console.log(`✅ Created: ${category.name}`);
    } else {
      console.log(`⏭️  Exists: ${category.name}`);
    }

    // Create subcategories
    if (category.subcategories) {
      for (const sub of category.subcategories) {
        const existing = await getCategoryBySlug(sub.slug);

        if (!existing) {
          await createCategory({
            name: sub.name,
            slug: sub.slug,
            description: sub.description,
            parent_id: parent.id,
            sort_order: category.subcategories.indexOf(sub),
          });
          console.log(`  ✅ Created: ${category.name} > ${sub.name}`);
        } else {
          console.log(`  ⏭️  Exists: ${category.name} > ${sub.name}`);
        }
      }
    }
  }

  console.log("\n✨ Category seeding complete!");
}

/**
 * Seed sample documents
 */
export async function seedSampleDocs(): Promise<void> {
  console.log("\n📄 Seeding sample KB documents...\n");

  const firmwareCategory = await getCategoryBySlug("apex-firmware");
  const troubleshootingCategory = await getCategoryBySlug("connection-issues");
  const policyCategory = await getCategoryBySlug("returns-refunds");

  const sampleDocs = [
    {
      title: "APEX Firmware Update Guide",
      body: `# APEX Firmware Update Guide

## Before You Begin
- Ensure your APEX unit is connected to a stable WiFi network
- Battery should be at least 50% charged
- Close all other applications on your phone

## Update Steps

1. Open the APEX mobile app
2. Navigate to Settings > Device > Firmware
3. If an update is available, tap "Download Update"
4. Wait for download to complete (do not close the app)
5. Tap "Install Update" when prompted
6. The unit will restart automatically

## Troubleshooting

**Update stuck at 0%**
- Check your internet connection
- Try moving closer to your WiFi router
- Restart the app and try again

**Update failed**
- Restart your APEX unit by holding the power button for 10 seconds
- Re-attempt the update
- If issues persist, contact support with your unit's serial number

## Notes
- Updates typically take 5-10 minutes
- Do not power off the unit during updates`,
      category_id: firmwareCategory?.id,
      vehicle_tags: ["All"],
      product_tags: ["APEX"],
      intent_tags: ["FIRMWARE_UPDATE_REQUEST", "FIRMWARE_ACCESS_ISSUE"],
    },
    {
      title: "WiFi Connection Troubleshooting",
      body: `# WiFi Connection Troubleshooting

## Common Issues

### APEX Won't Connect to WiFi

1. **Check WiFi credentials**
   - Ensure you're entering the correct password
   - WiFi names are case-sensitive

2. **Router compatibility**
   - APEX supports 2.4GHz networks only
   - 5GHz networks are not supported
   - Check if your router broadcasts a 2.4GHz network

3. **Distance from router**
   - Move the APEX unit closer to your router during setup
   - Optimal range is within 30 feet

4. **Network congestion**
   - Too many devices on the network can cause issues
   - Try disconnecting other devices temporarily

### Connection Drops Frequently

1. Check for interference from other devices
2. Update your router firmware
3. Consider a WiFi extender if the unit is far from the router

## Still Having Issues?

Please provide:
- Your APEX serial number
- Router make/model
- Distance from router
- Any error messages you see`,
      category_id: troubleshootingCategory?.id,
      vehicle_tags: ["All"],
      product_tags: ["APEX"],
      intent_tags: ["FIRMWARE_ACCESS_ISSUE"],
    },
    {
      title: "Return and Refund Policy",
      body: `# Return and Refund Policy

## Return Window
- 30 days from delivery date for unused items
- 14 days for opened/used items (restocking fee may apply)

## Eligibility
- Item must be in original packaging
- All accessories must be included
- Proof of purchase required

## How to Initiate a Return
1. Contact support with your order number
2. Describe the reason for return
3. Wait for RMA (Return Merchandise Authorization) number
4. Ship item back using provided label

## Refund Timeline
- Refunds processed within 5-7 business days of receiving the item
- Original payment method will be credited
- Shipping costs are non-refundable unless item was defective

## Exceptions
- Custom/personalized items are not returnable
- Items damaged by misuse are not eligible
- Sale items may have different return policies

## Important Note
Support agents cannot promise or guarantee refunds. All returns are subject to inspection and approval by our returns department.`,
      category_id: policyCategory?.id,
      vehicle_tags: ["All"],
      product_tags: ["All Products"],
      intent_tags: ["RETURN_REQUEST", "REFUND_REQUEST"],
    },
  ];

  for (const doc of sampleDocs) {
    try {
      await createDoc({
        title: doc.title,
        body: doc.body,
        source: "manual",
        category_id: doc.category_id,
        vehicle_tags: doc.vehicle_tags,
        product_tags: doc.product_tags,
        intent_tags: doc.intent_tags,
      });
      console.log(`✅ Created: ${doc.title}`);
    } catch (err) {
      console.log(`⚠️  Error creating "${doc.title}": ${err}`);
    }
  }

  console.log("\n✨ Document seeding complete!");
}

/**
 * Main seed function
 */
export async function seed(): Promise<void> {
  console.log("🚀 Starting KB seed...\n");
  console.log("=".repeat(50));

  await seedCategories();
  await seedSampleDocs();

  console.log("\n" + "=".repeat(50));
  console.log("🎉 KB seed complete!\n");
}

// Run if executed directly
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

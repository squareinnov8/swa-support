/**
 * Shopify KB Data Sources
 *
 * Pulls existing content that could inform KB population:
 * - Shop info
 * - Policy pages
 * - Support/FAQ pages
 */

import "dotenv/config";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

async function executeGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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

// Get shop info
const SHOP_QUERY = `
  query GetShopInfo {
    shop {
      name
      description
      primaryDomain {
        url
      }
      email
      contactEmail
      currencyCode
      billingAddress {
        city
        province
        country
      }
    }
  }
`;

// Get pages that might contain policy/support info
const PAGES_QUERY = `
  query GetPages {
    pages(first: 50) {
      edges {
        node {
          title
          handle
          body
        }
      }
    }
  }
`;

// Get product types and tags overview
const PRODUCTS_OVERVIEW_QUERY = `
  query GetProductsOverview {
    products(first: 100) {
      edges {
        node {
          title
          productType
          tags
          vendor
        }
      }
    }
  }
`;

async function main() {
  console.log("=".repeat(70));
  console.log("EXISTING DATA SOURCES FOR KB POPULATION");
  console.log("=".repeat(70));

  // 1. Shop Info
  console.log("\n## SHOP INFO\n");
  try {
    const shopData = await executeGraphQL<any>(SHOP_QUERY);
    const shop = shopData?.shop;
    console.log(`Name: ${shop?.name}`);
    console.log(`Description: ${shop?.description || "(none)"}`);
    console.log(`Domain: ${shop?.primaryDomain?.url}`);
    console.log(`Email: ${shop?.email}`);
    console.log(`Contact Email: ${shop?.contactEmail}`);
    console.log(`Currency: ${shop?.currencyCode}`);
    console.log(`Location: ${shop?.billingAddress?.city}, ${shop?.billingAddress?.province}, ${shop?.billingAddress?.country}`);
  } catch (err) {
    console.error("Failed:", err);
  }

  // 2. Policy/Support Pages
  console.log("\n## RELEVANT PAGES\n");
  const relevantHandles = [
    "refund-policy", "return-policy", "returns",
    "shipping-policy", "shipping",
    "warranty", "guarantee",
    "faq", "faqs", "frequently-asked-questions",
    "contact", "contact-us",
    "about", "about-us",
    "support", "help",
    "terms", "terms-of-service", "tos",
    "privacy", "privacy-policy"
  ];

  try {
    const pagesData = await executeGraphQL<any>(PAGES_QUERY);
    const pages = pagesData?.pages?.edges || [];

    for (const { node } of pages) {
      const handle = node.handle.toLowerCase();
      const isRelevant = relevantHandles.some(h => handle.includes(h)) ||
        node.title.toLowerCase().includes("policy") ||
        node.title.toLowerCase().includes("support") ||
        node.title.toLowerCase().includes("faq") ||
        node.title.toLowerCase().includes("shipping") ||
        node.title.toLowerCase().includes("return") ||
        node.title.toLowerCase().includes("warranty");

      if (isRelevant) {
        console.log(`### ${node.title} (/${node.handle})`);
        // Strip HTML and show first 1000 chars
        const plainText = node.body?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        console.log(`${plainText?.substring(0, 1500) || "(empty)"}...`);
        console.log("\n" + "-".repeat(50) + "\n");
      }
    }

    // Also list all page titles for reference
    console.log("\n### All Pages:\n");
    for (const { node } of pages) {
      console.log(`- ${node.title} (/${node.handle})`);
    }
  } catch (err) {
    console.error("Failed:", err);
  }

  // 3. Product Categories Overview
  console.log("\n## PRODUCT OVERVIEW\n");
  try {
    const productsData = await executeGraphQL<any>(PRODUCTS_OVERVIEW_QUERY);
    const products = productsData?.products?.edges || [];

    const productTypes = new Map<string, number>();
    const allTags = new Map<string, number>();
    const vendors = new Map<string, number>();

    for (const { node } of products) {
      // Count product types
      const type = node.productType || "(no type)";
      productTypes.set(type, (productTypes.get(type) || 0) + 1);

      // Count tags
      for (const tag of node.tags || []) {
        allTags.set(tag, (allTags.get(tag) || 0) + 1);
      }

      // Count vendors
      const vendor = node.vendor || "(no vendor)";
      vendors.set(vendor, (vendors.get(vendor) || 0) + 1);
    }

    console.log(`Total Products: ${products.length}\n`);

    console.log("Product Types:");
    for (const [type, count] of [...productTypes.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${type}: ${count}`);
    }

    console.log("\nVendors:");
    for (const [vendor, count] of [...vendors.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${vendor}: ${count}`);
    }

    console.log("\nTop Tags:");
    const sortedTags = [...allTags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [tag, count] of sortedTags) {
      console.log(`  - ${tag}: ${count}`);
    }

    console.log("\nProduct List:");
    for (const { node } of products) {
      console.log(`  - ${node.title}`);
    }
  } catch (err) {
    console.error("Failed:", err);
  }

  console.log("\n" + "=".repeat(70));
  console.log("END OF DATA SOURCES");
  console.log("=".repeat(70));
}

main().catch(console.error);

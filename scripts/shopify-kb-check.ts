/**
 * Shopify Knowledge Base Namespace Check
 *
 * Checks for existing metafields in the shopify-knowledge-base namespace
 * and tests write access.
 */

import "dotenv/config";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const KB_NAMESPACE = "shopify-knowledge-base";

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

  if (result.errors && result.errors.length > 0) {
    console.error("GraphQL Errors:", JSON.stringify(result.errors, null, 2));
  }

  return result.data;
}

// Query for shop metafields in KB namespace
const SHOP_KB_METAFIELDS_QUERY = `
  query GetShopKBMetafields($namespace: String!) {
    shop {
      id
      name
      metafields(first: 50, namespace: $namespace) {
        edges {
          node {
            id
            namespace
            key
            value
            type
            description
          }
        }
      }
    }
  }
`;

// Query for products with KB namespace metafields
const PRODUCTS_KB_METAFIELDS_QUERY = `
  query GetProductsKBMetafields($namespace: String!) {
    products(first: 50) {
      edges {
        node {
          id
          title
          handle
          metafields(first: 20, namespace: $namespace) {
            edges {
              node {
                id
                namespace
                key
                value
                type
                description
              }
            }
          }
        }
      }
    }
  }
`;

// Mutation to set a shop metafield
const SET_SHOP_METAFIELD = `
  mutation SetShopMetafield($metafields: [MetafieldsSetInput!]!) {
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

// Query to get metafield definitions for the namespace
const METAFIELD_DEFINITIONS_QUERY = `
  query GetMetafieldDefinitions($namespace: String!) {
    metafieldDefinitions(first: 50, namespace: $namespace, ownerType: SHOP) {
      edges {
        node {
          id
          name
          namespace
          key
          type {
            name
          }
          description
        }
      }
    }
  }
`;

async function main() {
  console.log("=".repeat(60));
  console.log("SHOPIFY KNOWLEDGE BASE NAMESPACE CHECK");
  console.log("=".repeat(60));
  console.log(`Store: ${STORE_DOMAIN}`);
  console.log(`Namespace: ${KB_NAMESPACE}`);
  console.log("");

  // 1. Check metafield definitions for the namespace
  console.log("\n" + "=".repeat(60));
  console.log("METAFIELD DEFINITIONS (Shop level)");
  console.log("=".repeat(60));

  try {
    const defsData = await executeGraphQL<any>(METAFIELD_DEFINITIONS_QUERY, {
      namespace: KB_NAMESPACE,
    });
    const definitions = defsData?.metafieldDefinitions?.edges || [];

    console.log(`Found ${definitions.length} metafield definitions for namespace "${KB_NAMESPACE}":\n`);

    if (definitions.length === 0) {
      console.log("  (no definitions found - namespace may not be set up yet)");
    } else {
      for (const { node } of definitions) {
        console.log(`  📋 ${node.name}`);
        console.log(`     Key: ${node.namespace}.${node.key}`);
        console.log(`     Type: ${node.type?.name}`);
        console.log(`     Description: ${node.description || "(none)"}`);
        console.log("");
      }
    }
  } catch (err) {
    console.error("Failed to fetch metafield definitions:", err);
  }

  // 2. Check shop metafields in KB namespace
  console.log("\n" + "=".repeat(60));
  console.log("SHOP METAFIELDS IN KB NAMESPACE");
  console.log("=".repeat(60));

  let shopId: string | null = null;

  try {
    const shopData = await executeGraphQL<any>(SHOP_KB_METAFIELDS_QUERY, {
      namespace: KB_NAMESPACE,
    });
    const shop = shopData?.shop;
    shopId = shop?.id;

    const metafields = shop?.metafields?.edges || [];

    console.log(`Shop: ${shop?.name}`);
    console.log(`Shop ID: ${shopId}`);
    console.log(`\nKB Metafields (${metafields.length}):\n`);

    if (metafields.length === 0) {
      console.log("  (no KB metafields found on shop)");
    } else {
      for (const { node } of metafields) {
        console.log(`  🔑 ${node.key} [${node.type}]`);
        console.log(`     Value: ${node.value?.substring(0, 300)}${node.value?.length > 300 ? "..." : ""}`);
        console.log(`     Description: ${node.description || "(none)"}`);
        console.log("");
      }
    }
  } catch (err) {
    console.error("Failed to fetch shop KB metafields:", err);
  }

  // 3. Check product metafields in KB namespace
  console.log("\n" + "=".repeat(60));
  console.log("PRODUCT METAFIELDS IN KB NAMESPACE");
  console.log("=".repeat(60));

  try {
    const productsData = await executeGraphQL<any>(PRODUCTS_KB_METAFIELDS_QUERY, {
      namespace: KB_NAMESPACE,
    });
    const products = productsData?.products?.edges || [];

    let productsWithKB = 0;
    const allKBKeys = new Set<string>();

    for (const { node } of products) {
      const metafields = node.metafields?.edges || [];
      if (metafields.length > 0) {
        productsWithKB++;
        console.log(`\n📦 ${node.title} (${node.handle})`);
        for (const { node: mf } of metafields) {
          allKBKeys.add(mf.key);
          console.log(`   🔑 ${mf.key} [${mf.type}]`);
          console.log(`      Value: ${mf.value?.substring(0, 200)}${mf.value?.length > 200 ? "..." : ""}`);
        }
      }
    }

    console.log(`\n\nSummary: ${productsWithKB}/${products.length} products have KB metafields`);
    if (allKBKeys.size > 0) {
      console.log(`KB keys found: ${[...allKBKeys].join(", ")}`);
    }
  } catch (err) {
    console.error("Failed to fetch product KB metafields:", err);
  }

  // 4. Test write access
  console.log("\n" + "=".repeat(60));
  console.log("TESTING WRITE ACCESS");
  console.log("=".repeat(60));

  if (!shopId) {
    console.log("Cannot test write - shop ID not available");
  } else {
    try {
      const testValue = JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        message: "Write access test from support-agent-v2",
      });

      const result = await executeGraphQL<any>(SET_SHOP_METAFIELD, {
        metafields: [
          {
            ownerId: shopId,
            namespace: KB_NAMESPACE,
            key: "_write_test",
            value: testValue,
            type: "json",
          },
        ],
      });

      const userErrors = result?.metafieldsSet?.userErrors || [];
      const metafields = result?.metafieldsSet?.metafields || [];

      if (userErrors.length > 0) {
        console.log("\n❌ Write test FAILED:");
        for (const err of userErrors) {
          console.log(`   - ${err.field}: ${err.message} (${err.code})`);
        }
      } else if (metafields.length > 0) {
        console.log("\n✅ Write test SUCCEEDED!");
        console.log(`   Created: ${metafields[0].namespace}.${metafields[0].key}`);
        console.log(`   Value: ${metafields[0].value}`);
      } else {
        console.log("\n⚠️ Write test returned no errors but also no metafields");
      }
    } catch (err) {
      console.error("\n❌ Write test FAILED with exception:", err);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("CHECK COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);

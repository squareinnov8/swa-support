/**
 * Sync Catalog from Shopify API
 *
 * Fetches products directly from Shopify Admin API (not static JSON export).
 * This ensures we always have the latest products and vendor assignments.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load env
const envFile = readFileSync(".env", "utf8");
const envVars: Record<string, string> = {};
envFile.split("\n").forEach((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) envVars[match[1].trim()] = match[2].trim();
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

// Shopify GraphQL client setup
const SHOPIFY_STORE_DOMAIN = envVars.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = envVars.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = envVars.SHOPIFY_API_VERSION || "2024-01";

const GET_PRODUCTS = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          productType
          vendor
          status
          tags
          images(first: 1) {
            edges {
              node {
                url
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                compareAtPrice
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;

type ProductNode = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  productType: string | null;
  vendor: string | null;
  status: string;
  tags: string[];
  images: { edges: Array<{ node: { url: string } }> };
  variants: {
    edges: Array<{
      node: {
        id: string;
        sku: string | null;
        title: string;
        price: string;
        compareAtPrice: string | null;
        inventoryQuantity: number;
      };
    }>;
  };
};

async function executeGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors?.length > 0) {
    throw new Error(`Shopify GraphQL error: ${result.errors.map((e: { message: string }) => e.message).join(", ")}`);
  }

  return result.data;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseFitmentFromTags(tags: string[]): { make: string; models: string[]; years: number[] } | null {
  const years: number[] = [];
  const makes: string[] = [];
  const models: string[] = [];

  for (const tag of tags) {
    if (tag.startsWith("Year_")) {
      const year = parseInt(tag.replace("Year_", ""), 10);
      if (!isNaN(year) && year >= 1990 && year <= 2030) {
        years.push(year);
      }
    } else if (tag.startsWith("Make_")) {
      makes.push(tag.replace("Make_", ""));
    } else if (tag.startsWith("Model_")) {
      models.push(tag.replace("Model_", ""));
    }
  }

  if (makes.length === 0) return null;

  return {
    make: makes[0],
    models,
    years: years.sort((a, b) => a - b),
  };
}

async function syncCatalog() {
  console.log("Fetching products from Shopify API...\n");

  type Response = {
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: ProductNode }>;
    };
  };

  const allProducts: ProductNode[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const data = await executeGraphQL<Response>(GET_PRODUCTS, {
      first: 50,
      after: cursor,
    });

    for (const edge of data.products.edges) {
      allProducts.push(edge.node);
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;

    console.log(`Fetched ${allProducts.length} products...`);

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\nTotal products: ${allProducts.length}`);

  // Get unique vendors
  const vendors = [...new Set(allProducts.map((p) => p.vendor).filter(Boolean))];
  console.log(`Unique vendors: ${vendors.length}`);
  vendors.forEach((v) => console.log(`  - ${v}`));

  console.log("\nSyncing to database...");

  let productCount = 0;
  let variantCount = 0;
  let fitmentCount = 0;
  const errors: string[] = [];

  for (const product of allProducts) {
    try {
      const fitment = parseFitmentFromTags(product.tags);
      const prices = product.variants.edges
        .map((e) => parseFloat(e.node.price))
        .filter((p) => !isNaN(p));
      const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
      const priceMax = prices.length > 0 ? Math.max(...prices) : 0;

      // Upsert product
      const { data: productData, error: productError } = await supabase
        .from("products")
        .upsert(
          {
            shopify_id: product.id,
            handle: product.handle,
            title: product.title,
            description: stripHtml(product.descriptionHtml),
            product_type: product.productType || null,
            vendor: product.vendor || null,
            status: product.status,
            tags: product.tags,
            price_min: priceMin,
            price_max: priceMax,
            image_url: product.images.edges[0]?.node.url || null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "shopify_id" }
        )
        .select("id")
        .single();

      if (productError) {
        errors.push(`Product ${product.handle}: ${productError.message}`);
        continue;
      }

      const productId = productData.id;
      productCount++;

      // Upsert variants
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        const { error: variantError } = await supabase.from("product_variants").upsert(
          {
            product_id: productId,
            shopify_id: variant.id,
            sku: variant.sku || null,
            title: variant.title,
            price: parseFloat(variant.price),
            compare_at_price: variant.compareAtPrice ? parseFloat(variant.compareAtPrice) : null,
            inventory_quantity: variant.inventoryQuantity,
          },
          { onConflict: "shopify_id" }
        );

        if (variantError) {
          errors.push(`Variant ${variant.sku}: ${variantError.message}`);
        } else {
          variantCount++;
        }
      }

      // Delete existing fitment and re-add
      await supabase.from("product_fitment").delete().eq("product_id", productId);

      if (fitment) {
        const yearStart = fitment.years.length > 0 ? Math.min(...fitment.years) : null;
        const yearEnd = fitment.years.length > 0 ? Math.max(...fitment.years) : null;
        const modelsToInsert = fitment.models.length > 0 ? fitment.models : [null];

        for (const model of modelsToInsert) {
          const { error: fitmentError } = await supabase.from("product_fitment").insert({
            product_id: productId,
            make: fitment.make,
            model: model,
            year_start: yearStart,
            year_end: yearEnd,
          });

          if (fitmentError && !fitmentError.message.includes("duplicate")) {
            errors.push(`Fitment ${fitment.make} ${model}: ${fitmentError.message}`);
          } else {
            fitmentCount++;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Product ${product.handle}: ${message}`);
    }
  }

  console.log("\n=== Sync Complete ===");
  console.log(`Products: ${productCount}`);
  console.log(`Variants: ${variantCount}`);
  console.log(`Fitments: ${fitmentCount}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }
}

syncCatalog().catch(console.error);

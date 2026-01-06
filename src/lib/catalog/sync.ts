/**
 * Catalog Sync
 *
 * Import product catalog from Shopify export JSON.
 * Parses tags to extract vehicle fitment data.
 */

import "dotenv/config";
import { supabase } from "@/lib/db";
import type { ShopifyProduct, ParsedFitment } from "./types";
import * as fs from "fs";
import * as path from "path";

// Path to catalog-refresh data
const CATALOG_PATH = "/Users/robertramsay/projects/catalog-refresh/data/shopify-export/catalog-2025-12-21.json";

// Store domain for building URLs
const STORE_DOMAIN = "squarewheelsauto.com";

/**
 * Parse fitment info from Shopify tags
 * Tags like: Year_2016, Year_2017, Make_Infiniti, Model_Q50
 */
export function parseFitmentFromTags(tags: string[]): ParsedFitment | null {
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

  // Must have at least a make
  if (makes.length === 0) {
    return null;
  }

  return {
    make: makes[0], // Take first make (most products have one)
    models,
    years: years.sort((a, b) => a - b),
  };
}

/**
 * Get year range from parsed years
 */
function getYearRange(years: number[]): { start: number; end: number } | null {
  if (years.length === 0) return null;
  return {
    start: Math.min(...years),
    end: Math.max(...years),
  };
}

/**
 * Get price range from variants
 */
function getPriceRange(variants: ShopifyProduct["variants"]): {
  min: number;
  max: number;
} {
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
  if (prices.length === 0) return { min: 0, max: 0 };
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

/**
 * Strip HTML tags from description
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sync products from Shopify catalog export
 */
export async function syncCatalog(catalogPath?: string): Promise<{
  products: number;
  variants: number;
  fitments: number;
  errors: string[];
}> {
  const filePath = catalogPath ?? CATALOG_PATH;
  const errors: string[] = [];

  // Read catalog file
  if (!fs.existsSync(filePath)) {
    throw new Error(`Catalog file not found: ${filePath}`);
  }

  const catalogData = fs.readFileSync(filePath, "utf-8");
  const products: ShopifyProduct[] = JSON.parse(catalogData);

  console.log(`Found ${products.length} products in catalog`);

  let productCount = 0;
  let variantCount = 0;
  let fitmentCount = 0;

  for (const product of products) {
    try {
      // Parse fitment from tags
      const fitment = parseFitmentFromTags(product.tags);
      const priceRange = getPriceRange(product.variants);

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
            price_min: priceRange.min,
            price_max: priceRange.max,
            image_url: product.images[0]?.url || null,
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
      for (const variant of product.variants) {
        const { error: variantError } = await supabase
          .from("product_variants")
          .upsert(
            {
              product_id: productId,
              shopify_id: variant.id,
              sku: variant.sku || null,
              title: variant.title,
              price: parseFloat(variant.price),
              compare_at_price: variant.compareAtPrice
                ? parseFloat(variant.compareAtPrice)
                : null,
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

      // Delete existing fitment for this product (will re-add)
      await supabase.from("product_fitment").delete().eq("product_id", productId);

      // Insert fitment records
      if (fitment) {
        const yearRange = getYearRange(fitment.years);

        // If no models, create one fitment record for just the make
        const modelsToInsert = fitment.models.length > 0 ? fitment.models : [null];

        for (const model of modelsToInsert) {
          const { error: fitmentError } = await supabase.from("product_fitment").insert({
            product_id: productId,
            make: fitment.make,
            model: model,
            year_start: yearRange?.start || null,
            year_end: yearRange?.end || null,
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

  return {
    products: productCount,
    variants: variantCount,
    fitments: fitmentCount,
    errors,
  };
}

/**
 * CLI entry point
 */
async function main() {
  console.log("Starting catalog sync...\n");

  const result = await syncCatalog();

  console.log("\n=== Sync Complete ===");
  console.log(`Products: ${result.products}`);
  console.log(`Variants: ${result.variants}`);
  console.log(`Fitments: ${result.fitments}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    result.errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

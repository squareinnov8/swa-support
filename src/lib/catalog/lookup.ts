/**
 * Catalog Lookup Functions
 *
 * Query products by vehicle fitment for agent responses.
 */

import { supabase } from "@/lib/db";
import type { ProductWithFitment, Product, ProductVariant } from "./types";

const STORE_DOMAIN = "squarewheelsauto.com";

/**
 * Build product URL from handle
 */
function buildProductUrl(handle: string): string {
  return `https://${STORE_DOMAIN}/products/${handle}`;
}

/**
 * Find products compatible with a specific vehicle
 */
export async function findProductsByVehicle(
  year: number,
  make: string,
  model?: string
): Promise<ProductWithFitment[]> {
  const { data, error } = await supabase.rpc("find_products_by_vehicle", {
    p_year: year,
    p_make: make,
    p_model: model ?? null,
  });

  if (error) {
    console.error("Error finding products:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    url: buildProductUrl(row.handle as string),
  })) as ProductWithFitment[];
}

/**
 * Search products by text query (title, description)
 */
export async function searchProducts(query: string, limit = 10): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("status", "ACTIVE")
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(limit);

  if (error) {
    console.error("Error searching products:", error);
    return [];
  }

  return data ?? [];
}

/**
 * Get product by handle (URL slug)
 */
export async function getProductByHandle(handle: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("handle", handle)
    .single();

  if (error) {
    console.error("Error getting product:", error);
    return null;
  }

  return data;
}

/**
 * Get product variants
 */
export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("price", { ascending: true });

  if (error) {
    console.error("Error getting variants:", error);
    return [];
  }

  return data ?? [];
}

/**
 * Get all makes in catalog
 */
export async function getAvailableMakes(): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_fitment")
    .select("make")
    .order("make");

  if (error) {
    console.error("Error getting makes:", error);
    return [];
  }

  // Deduplicate
  const makes = [...new Set(data?.map((d) => d.make) ?? [])];
  return makes;
}

/**
 * Get all models for a make
 */
export async function getAvailableModels(make: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("product_fitment")
    .select("model")
    .ilike("make", make)
    .not("model", "is", null)
    .order("model");

  if (error) {
    console.error("Error getting models:", error);
    return [];
  }

  // Deduplicate
  const models = [...new Set(data?.map((d) => d.model).filter(Boolean) ?? [])];
  return models as string[];
}

/**
 * Get year range for a make/model combination
 */
export async function getAvailableYears(
  make: string,
  model?: string
): Promise<{ min: number; max: number } | null> {
  let query = supabase
    .from("product_fitment")
    .select("year_start, year_end")
    .ilike("make", make);

  if (model) {
    query = query.ilike("model", model);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return null;
  }

  const years = data.flatMap((d) => [d.year_start, d.year_end]).filter(Boolean) as number[];
  if (years.length === 0) return null;

  return {
    min: Math.min(...years),
    max: Math.max(...years),
  };
}

/**
 * Format product for agent response
 */
export function formatProductForAgent(product: ProductWithFitment): string {
  const priceStr =
    product.price_min === product.price_max
      ? `$${product.price_min}`
      : `$${product.price_min}-$${product.price_max}`;

  return `**${product.title}**
- Compatible with: ${product.fitment_make} ${product.fitment_model ?? ""} (${product.fitment_years})
- Price: ${priceStr}
- [View Product](${product.url})`;
}

/**
 * Format multiple products for agent response
 */
export function formatProductsForAgent(products: ProductWithFitment[]): string {
  if (products.length === 0) {
    return "No compatible products found for this vehicle.";
  }

  const formatted = products.map(formatProductForAgent).join("\n\n");
  return `Found ${products.length} compatible product(s):\n\n${formatted}`;
}

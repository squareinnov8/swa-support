/**
 * Product Catalog Types
 */

/**
 * Product from database
 */
export type Product = {
  id: string;
  shopify_id: string;
  handle: string;
  title: string;
  description: string | null;
  product_type: string | null;
  vendor: string | null;
  status: string;
  tags: string[];
  price_min: number | null;
  price_max: number | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string;
};

/**
 * Product variant from database
 */
export type ProductVariant = {
  id: string;
  product_id: string;
  shopify_id: string;
  sku: string | null;
  title: string;
  price: number;
  compare_at_price: number | null;
  inventory_quantity: number;
  created_at: string;
};

/**
 * Product fitment from database
 */
export type ProductFitment = {
  id: string;
  product_id: string;
  year_start: number | null;
  year_end: number | null;
  make: string;
  model: string | null;
  trim: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * Product with fitment info (for search results)
 */
export type ProductWithFitment = {
  product_id: string;
  shopify_id: string;
  handle: string;
  title: string;
  description: string | null;
  product_type: string | null;
  price_min: number | null;
  price_max: number | null;
  image_url: string | null;
  fitment_make: string;
  fitment_model: string | null;
  fitment_years: string;
  url: string;
};

/**
 * Shopify product from catalog export
 */
export type ShopifyProduct = {
  id: string;
  legacyResourceId: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string[];
  descriptionHtml: string;
  options: Array<{
    name: string;
    values: string[];
  }>;
  variants: Array<{
    id: string;
    legacyResourceId: string;
    sku: string;
    title: string;
    price: string;
    compareAtPrice: string | null;
    inventoryQuantity: number;
    selectedOptions: Array<{
      name: string;
      value: string;
    }>;
  }>;
  images: Array<{
    url: string;
    altText: string;
  }>;
};

/**
 * Parsed fitment from tags
 */
export type ParsedFitment = {
  make: string;
  models: string[];
  years: number[];
};

-- Add Shopify fulfillment tracking to orders table
-- Stores the fulfillment GID so we can update tracking later

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS shopify_fulfillment_id TEXT;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_orders_shopify_fulfillment_id
ON orders(shopify_fulfillment_id)
WHERE shopify_fulfillment_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN orders.shopify_fulfillment_id IS 'Shopify fulfillment GID for tracking updates';

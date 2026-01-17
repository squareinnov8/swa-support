-- Add enhanced customer context fields for richer support context
-- This enables displaying order history and likely product on thread pages

-- Add recent orders JSONB to store full order details
ALTER TABLE customer_verifications
ADD COLUMN IF NOT EXISTS recent_orders jsonb;

-- Add likely product field to highlight what they probably need help with
ALTER TABLE customer_verifications
ADD COLUMN IF NOT EXISTS likely_product text;

-- Add updated_at for cache invalidation
ALTER TABLE customer_verifications
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Comment for documentation
COMMENT ON COLUMN customer_verifications.recent_orders IS 'JSONB array of recent orders with order_number, status, fulfillment_status, created_at, tracking, line_items';
COMMENT ON COLUMN customer_verifications.likely_product IS 'Most likely product the customer needs support for (from recent order or mentioned in message)';

-- Update the get_thread_verification function to include new fields
-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS get_thread_verification(uuid);
CREATE OR REPLACE FUNCTION get_thread_verification(p_thread_id uuid)
RETURNS TABLE (
  status text,
  flags text[],
  shopify_customer_id text,
  customer_name text,
  customer_email text,
  total_orders int,
  total_spent numeric(10, 2),
  recent_orders jsonb,
  likely_product text,
  verified_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    cv.status,
    cv.flags,
    cv.shopify_customer_id,
    cv.customer_name,
    cv.customer_email,
    cv.total_orders,
    cv.total_spent,
    cv.recent_orders,
    cv.likely_product,
    cv.created_at as verified_at
  FROM customer_verifications cv
  WHERE cv.thread_id = p_thread_id
    AND cv.status = 'verified'
  ORDER BY cv.created_at DESC
  LIMIT 1;
$$;

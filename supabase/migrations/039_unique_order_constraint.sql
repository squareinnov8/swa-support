-- Add unique constraint on order_number + customer_email to prevent duplicate orders
-- This prevents race conditions when processing the same order email multiple times

-- Create unique index (allows NULL customer_email values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_order_customer
ON orders (order_number, LOWER(customer_email))
WHERE customer_email IS NOT NULL;

-- Add a partial unique index for orders without customer email (edge case)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_order_null_customer
ON orders (order_number)
WHERE customer_email IS NULL;

-- Comment explaining the constraint
COMMENT ON INDEX idx_orders_unique_order_customer IS 'Prevents duplicate orders for the same customer. Race condition fix.';

-- Thread Order Deduplication
-- Adds order_number to threads to prevent duplicate threads for the same order

-- Add order_number column to threads
ALTER TABLE threads ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Create index for fast lookup by order number
CREATE INDEX IF NOT EXISTS idx_threads_order_number ON threads(order_number) WHERE order_number IS NOT NULL;

-- Comment explaining usage
COMMENT ON COLUMN threads.order_number IS 'Order number associated with this thread. Used to deduplicate threads - all emails about the same order should be consolidated into one thread.';

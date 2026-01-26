-- Migration: Add customer outreach tracking columns to orders table
-- Enables tracking of customer outreach emails for vendor request fulfillment

-- Add columns to track customer outreach emails
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS customer_outreach_thread_id TEXT,
ADD COLUMN IF NOT EXISTS customer_outreach_message_id TEXT;

-- Index for looking up orders by outreach thread ID
-- This enables matching customer replies to the original outreach
CREATE INDEX IF NOT EXISTS idx_orders_customer_outreach_thread
ON orders(customer_outreach_thread_id)
WHERE customer_outreach_thread_id IS NOT NULL;

COMMENT ON COLUMN orders.customer_outreach_thread_id IS
'Gmail thread ID of the customer outreach email (requesting photos, confirmations, etc.)';

COMMENT ON COLUMN orders.customer_outreach_message_id IS
'Gmail message ID of the customer outreach email';

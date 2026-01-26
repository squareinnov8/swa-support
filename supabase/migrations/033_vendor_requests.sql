-- Vendor Requests Table
-- Tracks requests from vendors for additional customer information (photos, confirmations, etc.)

CREATE TABLE IF NOT EXISTS vendor_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_vendor_id UUID NOT NULL REFERENCES order_vendors(id) ON DELETE CASCADE,

  -- Request details
  request_type TEXT NOT NULL,  -- dashboard_photo, color_confirmation, memory_confirmation, address_validation, vehicle_confirmation, other
  description TEXT NOT NULL,   -- Human-readable description
  options TEXT[],              -- For confirmations, the available choices

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, received, validated, forwarded, rejected

  -- Timestamps
  customer_contacted_at TIMESTAMPTZ,  -- When we emailed the customer
  customer_response_at TIMESTAMPTZ,   -- When customer responded
  forwarded_at TIMESTAMPTZ,           -- When we forwarded response to vendor

  -- Response data (JSON)
  response_data JSONB,  -- Includes answer, attachment info, validation results

  -- Gmail tracking
  customer_thread_id TEXT,     -- Gmail thread ID for customer communication
  customer_message_id TEXT,    -- Gmail message ID of customer response

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX idx_vendor_requests_order_id ON vendor_requests(order_id);
CREATE INDEX idx_vendor_requests_order_vendor_id ON vendor_requests(order_vendor_id);
CREATE INDEX idx_vendor_requests_status ON vendor_requests(status);
CREATE INDEX idx_vendor_requests_type ON vendor_requests(request_type);
CREATE INDEX idx_vendor_requests_customer_thread ON vendor_requests(customer_thread_id) WHERE customer_thread_id IS NOT NULL;

-- Add customer_outreach_thread_id to orders table for tracking customer communication
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_outreach_thread_id TEXT,
  ADD COLUMN IF NOT EXISTS customer_outreach_message_id TEXT;

-- Add index for customer thread lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_outreach_thread ON orders(customer_outreach_thread_id) WHERE customer_outreach_thread_id IS NOT NULL;

COMMENT ON TABLE vendor_requests IS 'Tracks vendor requests for additional customer information and their resolution';
COMMENT ON COLUMN vendor_requests.request_type IS 'Type of information requested: dashboard_photo, color_confirmation, memory_confirmation, address_validation, vehicle_confirmation, other';
COMMENT ON COLUMN vendor_requests.status IS 'Status: pending (awaiting customer), received (got response), validated (checked), forwarded (sent to vendor), rejected (invalid response)';

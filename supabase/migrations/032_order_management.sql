-- Order Management Schema
-- Enables Lina to process orders, route to vendors, and track fulfillment

-- Orders table (separate from support threads)
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT UNIQUE,
  order_number TEXT NOT NULL,  -- e.g., "4093"

  -- Customer info (from email)
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,

  -- Shipping
  shipping_address JSONB,  -- {street, city, state, zip, country}

  -- Product info (stored as JSONB for multi-item orders)
  line_items JSONB,  -- [{title, sku, quantity, price, vendor}]
  order_total NUMERIC(10,2),

  -- Order-level status (aggregate of all vendor statuses)
  status TEXT NOT NULL DEFAULT 'new',
  -- Statuses:
  --   new: Just received, pending processing
  --   pending_review: Flagged for manual review (risk or high-value)
  --   processing: Being routed to vendors
  --   fulfilled: All vendors notified, marked in Shopify
  --   shipped: All vendors have provided tracking
  --   delivered: All shipments delivered
  --   return_requested: Customer requested return
  --   return_in_progress: Return shipment in transit
  --   return_delivered: Return received
  --   refunded: Refund processed
  --   cancelled: Order cancelled

  -- Risk assessment
  risk_score NUMERIC(3,2),  -- 0.00 to 1.00
  risk_reasons TEXT[],
  reviewed_by TEXT,  -- NULL = auto-approved, 'rob' = manually reviewed
  reviewed_at TIMESTAMPTZ,

  -- Email threading
  original_email_id TEXT,  -- Gmail message ID of Shopify notification

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_action_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- Order vendor assignments (for multi-vendor order tracking)
CREATE TABLE order_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  vendor_name TEXT NOT NULL,
  vendor_emails TEXT[] NOT NULL,
  line_items JSONB,  -- Items assigned to this vendor

  -- Forwarding
  forwarded_at TIMESTAMPTZ,
  forward_email_id TEXT,  -- Gmail message ID of forwarded email
  forward_thread_id TEXT, -- Gmail thread ID for vendor communication

  -- Per-vendor fulfillment status
  status TEXT NOT NULL DEFAULT 'pending',
  -- Statuses:
  --   pending: Not yet forwarded
  --   forwarded: Email sent to vendor
  --   shipped: Vendor provided tracking
  --   delivered: Carrier confirmed delivery

  tracking_number TEXT,
  tracking_carrier TEXT,
  tracking_url TEXT,
  shipped_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_vendors_order_id ON order_vendors(order_id);
CREATE INDEX idx_order_vendors_status ON order_vendors(status);
CREATE INDEX idx_order_vendors_thread ON order_vendors(forward_thread_id);

-- Blacklisted customers
CREATE TABLE blacklisted_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,

  -- Reason for blacklist
  reason TEXT NOT NULL,
  reasons_detail TEXT[],  -- Specific incidents

  -- Source
  added_by TEXT NOT NULL,  -- 'lina' or 'rob'
  auto_detected BOOLEAN DEFAULT false,

  -- Status
  active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blacklisted_email ON blacklisted_customers(email) WHERE active = true;

-- Order events (audit log)
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
  -- Event types:
  --   created, risk_assessed, forwarded_to_vendor, vendor_replied,
  --   tracking_added, customer_notified, customer_contacted,
  --   customer_responded, info_forwarded_to_vendor,
  --   status_changed, flagged_for_review, manually_approved,
  --   blacklist_checked, error

  payload JSONB,  -- Event-specific data

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_events_order_id ON order_events(order_id);
CREATE INDEX idx_order_events_type ON order_events(event_type);

-- Vendor cache (synced from Google Sheet)
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  contact_emails TEXT[] NOT NULL,
  product_patterns TEXT[],  -- Product name patterns this vendor handles

  -- Instructions (cached from Google Sheet)
  new_order_instructions TEXT,
  cancel_instructions TEXT,
  escalation_instructions TEXT,

  -- Sync
  last_synced_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vendors_name ON vendors(name);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_order_timestamp();

CREATE TRIGGER order_vendors_updated_at
  BEFORE UPDATE ON order_vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_order_timestamp();

CREATE TRIGGER blacklisted_customers_updated_at
  BEFORE UPDATE ON blacklisted_customers
  FOR EACH ROW
  EXECUTE FUNCTION update_order_timestamp();

CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_order_timestamp();

# Order Management Feature - Implementation Plan

## Overview

Add automated order management to Lina, enabling her to:
1. Detect incoming Shopify order confirmation emails
2. Screen customers against a blacklist (with LLM-based risk assessment)
3. Route orders to appropriate vendors via email forwarding
4. Track fulfillment status and vendor responses
5. Extract tracking numbers from vendor emails and update Shopify
6. Coordinate between vendors and customers when needed (address validation, dashboard photos)

## Key Design Decisions

### Order Email Detection
- **Subject pattern**: `[squarewheels] Order #XXXX placed by`
- **From address**: `support@squarewheelsauto.com`
- Both conditions must match to identify order emails (vs support emails)

### Order Flow (Separate from Support Flow)
Order emails bypass the standard support ingestion pipeline:
```
Order Email → Order Ingestion Pipeline (new)
   ↓
1. Parse order details from email body
2. Customer blacklist check (Supabase)
3. If not blacklisted: LLM risk assessment
4. If approved: Vendor lookup (Google Sheet)
5. Forward original email to vendor contact(s)
6. Mark fulfilled in Shopify (no customer notification)
7. Create order record in Supabase
```

### Vendor Response Handling
```
Vendor Reply Email → Order Response Pipeline (new)
   ↓
1. Match to existing order (by thread/subject)
2. LLM extract: tracking number, carrier, any requests
3. If tracking provided:
   - Add to Shopify fulfillment
   - Notify customer via Shopify
   - Update order status → shipped
4. If vendor requests info (address validation, dashboard photos):
   - Create customer outreach task
   - Lina contacts customer
   - Forward customer response to vendor
```

### Customer Blacklist Evaluation
**Data Sources:**
- Supabase `blacklisted_customers` table (explicit blacklist)
- Shopify: order count, total spent, returns, refunds
- Lina threads: support ticket count, escalation history

**Risk Signals (LLM evaluates):**
- High return rate (>30% of orders returned)
- Multiple refund requests
- Previous chargebacks or chargeback threats
- Excessive support tickets (>5 per order on average)
- Abusive/threatening communication history

**Outcomes:**
- **Approved**: Proceed with vendor routing
- **Flagged for Review**: Notify Rob, wait for manual decision (also triggered for orders >$3,000)
- **Auto-Blacklisted**: Add to blacklist, notify Rob

### Multi-Vendor Order Handling
If an order contains products from multiple vendors:
1. Parse line items and group by vendor
2. Forward to each vendor separately with only their line items
3. Track each vendor's fulfillment independently
4. Order status = "shipped" only when ALL vendors have provided tracking

---

## Database Schema Changes

### New Tables

```sql
-- Migration: 032_order_management.sql

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
    -- new: Just received, pending processing
    -- pending_review: Flagged for manual review (risk or high-value)
    -- processing: Being routed to vendors
    -- fulfilled: All vendors notified, marked in Shopify
    -- shipped: All vendors have provided tracking
    -- delivered: All shipments delivered
    -- return_requested: Customer requested return
    -- return_in_progress: Return shipment in transit
    -- return_delivered: Return received
    -- refunded: Refund processed
    -- cancelled: Order cancelled

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
    -- pending: Not yet forwarded
    -- forwarded: Email sent to vendor
    -- shipped: Vendor provided tracking
    -- delivered: Carrier confirmed delivery

  tracking_number TEXT,
  tracking_carrier TEXT,
  tracking_url TEXT,
  shipped_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_vendors_order_id ON order_vendors(order_id);
CREATE INDEX idx_order_vendors_status ON order_vendors(status);

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
  order_id UUID NOT NULL REFERENCES orders(id),

  event_type TEXT NOT NULL,
    -- created, risk_assessed, forwarded_to_vendor, vendor_replied,
    -- tracking_added, customer_notified, customer_contacted,
    -- customer_responded, info_forwarded_to_vendor,
    -- status_changed, flagged_for_review, manually_approved,
    -- blacklist_checked, error

  payload JSONB,  -- Event-specific data

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_events_order_id ON order_events(order_id);
CREATE INDEX idx_order_events_type ON order_events(event_type);

-- Vendor cache (optional, for performance)
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
```

---

## New API Routes

### Order Ingestion

```
POST /api/orders/ingest
```
Called by Gmail webhook/poll when order email detected.

**Flow:**
1. Parse order email body
2. Check blacklist
3. If not blacklisted: run risk assessment
4. Route to vendor or flag for review
5. Return order record

### Order Listing (Admin API)

```
GET /api/admin/orders
```
Returns paginated list of orders with filters.

**Query params:**
- `status` - Filter by status
- `search` - Search by order number, customer name/email
- `limit`, `offset` - Pagination

### Order Actions

```
POST /api/admin/orders/[id]/approve
POST /api/admin/orders/[id]/reject
POST /api/admin/orders/[id]/blacklist-customer
```
Manual actions for flagged orders.

### Vendor Sheet Sync

```
POST /api/admin/vendors/sync
```
Fetches vendor data from Google Sheet and caches in `vendors` table.

---

## New Lib Modules

### `src/lib/orders/`

```
orders/
├── ingest.ts           # Order email parsing and ingestion
├── routing.ts          # Vendor lookup and email forwarding
├── riskAssessment.ts   # LLM-based customer risk evaluation
├── trackingExtractor.ts # Extract tracking from vendor emails
├── types.ts            # Order types and schemas
└── shopifyFulfillment.ts # Shopify fulfillment API calls
```

### `src/lib/vendors/`

```
vendors/
├── googleSheets.ts     # Google Sheets API client
├── lookup.ts           # Find vendor for product
└── types.ts            # Vendor types
```

---

## Key Implementation Details

### 1. Order Email Detection (in Gmail monitor)

```typescript
// In src/lib/gmail/monitor.ts - add order email detection

function isOrderEmail(email: GmailMessage): boolean {
  const subject = email.subject || '';
  const from = email.from || '';

  // Must match both conditions
  const isOrderSubject = /^\[squarewheels\] Order #\d+ placed by/.test(subject);
  const isFromStore = from.includes('support@squarewheelsauto.com');

  return isOrderSubject && isFromStore;
}

// In runGmailMonitor(), route order emails differently:
if (isOrderEmail(email)) {
  await processOrderEmail(email);  // New order pipeline
} else {
  await processIngestRequest(...);  // Existing support pipeline
}
```

### 2. Order Email Parsing

```typescript
// src/lib/orders/ingest.ts

interface ParsedOrder {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  productTitle: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  paymentId?: string;
}

function parseOrderEmail(body: string): ParsedOrder {
  // Extract using regex patterns from the known email format:
  // - Customer Email: dennis.meade@yahoo.com
  // - Dennis Meade placed order #4093 on Jan 24 at 11:34 pm.
  // - Product: Audi R8 (2007-2015) Android Head Unit | SquareWheels G-Series
  // - Shipping address block
}
```

### 3. Risk Assessment (LLM)

```typescript
// src/lib/orders/riskAssessment.ts

interface RiskAssessment {
  score: number;  // 0.0 - 1.0
  decision: 'approve' | 'flag_for_review' | 'auto_blacklist';
  reasons: string[];
  reasoning: string;
}

async function assessCustomerRisk(
  customerEmail: string,
  orderDetails: ParsedOrder
): Promise<RiskAssessment> {
  // 1. Check explicit blacklist first
  const blacklisted = await checkBlacklist(customerEmail);
  if (blacklisted) {
    return { score: 1.0, decision: 'auto_blacklist', reasons: ['Previously blacklisted'], reasoning: blacklisted.reason };
  }

  // 2. Check high-value threshold ($3,000+)
  if (orderDetails.total >= 3000) {
    return { score: 0.5, decision: 'flag_for_review', reasons: ['High-value order (>$3,000)'], reasoning: 'Order exceeds automatic approval threshold' };
  }

  // 3. Gather customer history
  const shopifyCustomer = await getCustomerByEmail(customerEmail);
  const linaThreads = await getCustomerThreads(customerEmail);

  // 4. LLM evaluation
  const prompt = buildRiskPrompt(shopifyCustomer, linaThreads, orderDetails);
  const result = await llmEvaluate(prompt);

  return result;
}
```

### 4. Vendor Lookup (Google Sheets)

```typescript
// src/lib/vendors/googleSheets.ts

// Use public CSV export URL (already working)
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1gpas0Zo498d4kq0dTHQHPEqfE4fiYsZwgVfJZtYeaXQ/export?format=csv';

interface Vendor {
  name: string;
  productPatterns: string[];  // e.g., ["G-Series", "APEX Clusters"]
  contactEmails: string[];
  newOrderInstructions?: string;
  cancelInstructions?: string;
  escalationInstructions?: string;
}

async function fetchVendors(): Promise<Vendor[]> {
  // Fetch and parse CSV
  // Cache in Supabase vendors table
}

function findVendorForProduct(productTitle: string, vendors: Vendor[]): Vendor | null {
  // Match product title against vendor product patterns
  // e.g., "SquareWheels G-Series" matches AuCar's "G-Series Screens"
}
```

### 5. Email Forwarding (Gmail API)

```typescript
// src/lib/gmail/forwardOrder.ts

async function forwardOrderToVendor(
  originalEmailId: string,
  vendorEmails: string[],
  orderNumber: string
): Promise<{ threadId: string; messageId: string }> {
  // Use Gmail API to forward the original Shopify email
  // Keep original content intact
  // CC multiple vendor emails if needed
}
```

### 6. Tracking Extraction (LLM)

```typescript
// src/lib/orders/trackingExtractor.ts

interface TrackingInfo {
  trackingNumber: string;
  carrier: string;  // USPS, UPS, FedEx, DHL, etc.
  carrierConfidence: number;
  vendorRequest?: {
    type: 'address_validation' | 'dashboard_photo' | 'other';
    details: string;
  };
}

async function extractTrackingFromEmail(body: string): Promise<TrackingInfo | null> {
  // LLM extracts tracking number and infers carrier
  // Also detects if vendor is requesting additional info
}
```

### 7. Shopify Fulfillment API

```typescript
// src/lib/orders/shopifyFulfillment.ts

async function markOrderFulfilled(
  shopifyOrderId: string,
  options: { notifyCustomer: boolean }
): Promise<void> {
  // Create fulfillment in Shopify without customer notification
}

async function addTrackingToFulfillment(
  shopifyOrderId: string,
  tracking: { number: string; carrier: string; url?: string },
  options: { notifyCustomer: boolean }
): Promise<void> {
  // Update fulfillment with tracking, optionally notify customer
}
```

---

## Admin UI Changes

### New Orders View (`/admin/orders`)

Table columns:
- Order # (link to Shopify)
- Customer (name + email)
- Product
- Vendor
- Status (color-coded badge)
- Last Action (relative time)
- Actions (approve/reject for flagged orders)

Filters:
- Status dropdown
- Search box
- Date range

### Inbox Modification

Order emails should NOT appear in the main inbox (`/admin`).
- Filter orders out in the inbox query
- Add "Orders" link in sidebar navigation

---

## Google Sheet Structure Update

Recommended columns for vendor sheet:

| Column | Description |
|--------|-------------|
| Vendor | Vendor name (e.g., "AuCar") |
| Applicable Products | Product patterns, comma-separated |
| Contact Emails | Order notification emails, comma-separated |
| New Order Submit | Special instructions for orders |
| Cancel Behavior | How to request cancellations |
| Support Escalation Behavior | How to escalate issues |

**Example row:**
```
AuCar | G-Series Screens, APEX Clusters | orders@aucar.com, sales@aucar.com | Forward Shopify confirmation directly | Email cancel request within 24hrs | Email support@aucar.com with order # and issue
```

---

## Implementation Phases

### Phase 1: Foundation (This PR)
1. Database migrations (orders, blacklisted_customers, order_events, vendors)
2. Order email parsing and detection
3. Basic vendor lookup from Google Sheet
4. Order forwarding via Gmail API
5. Orders admin view (read-only)
6. Filter orders from support inbox

### Phase 2: Risk Assessment
1. Customer history aggregation (Shopify + Lina)
2. LLM-based risk evaluation
3. Blacklist management UI
4. Manual review workflow for flagged orders

### Phase 3: Tracking & Fulfillment
1. Vendor reply detection
2. LLM tracking extraction
3. Shopify fulfillment API integration
4. Customer notification on shipping

### Phase 4: Vendor-Customer Coordination
1. Detect vendor requests (address validation, photos)
2. Customer outreach automation
3. Response forwarding to vendor
4. Dashboard photo handling for international orders

### Phase 5: V2 Features (Future)
1. Stale order alerts (fulfilled but not shipped)
2. Vendor escalation for defects
3. Return coordination
4. Analytics and reporting

---

## Environment Variables

New required variables:
```
# Google Sheets (for vendor lookup)
# Using public sheet, no auth needed for read-only

# No new vars needed - uses existing:
# - SHOPIFY_ACCESS_TOKEN (for fulfillment API)
# - Gmail OAuth (for forwarding)
```

---

## Testing Plan

### Unit Tests
- Order email parsing (various formats)
- Vendor matching logic
- Risk assessment prompts
- Tracking extraction

### Integration Tests
- Gmail order detection
- Shopify fulfillment API calls
- Google Sheet fetching

### Manual Testing
- Forward test order to vendor
- Verify Shopify fulfillment status
- Test tracking update flow

---

## Design Decisions (Confirmed)

1. **Multi-product orders**: Split into separate vendor forwards. Each vendor receives an email with only their relevant line items.

2. **Order amount thresholds**: Flag orders over $3,000 for manual review (most orders are $1,000+ since the catalog is automotive electronics).

3. **Vendor response SLA**: TBD for v2 (stale order alerts)

4. **Return flow**: Returns go through normal support inbox as RETURN_REFUND_REQUEST intent. Lina handles customer-facing communication, and the orders system tracks status changes.

---

## Files to Create/Modify

### New Files
- `supabase/migrations/032_order_management.sql`
- `src/lib/orders/ingest.ts`
- `src/lib/orders/routing.ts`
- `src/lib/orders/riskAssessment.ts`
- `src/lib/orders/trackingExtractor.ts`
- `src/lib/orders/shopifyFulfillment.ts`
- `src/lib/orders/types.ts`
- `src/lib/vendors/googleSheets.ts`
- `src/lib/vendors/lookup.ts`
- `src/lib/vendors/types.ts`
- `src/lib/gmail/forwardOrder.ts`
- `src/app/admin/orders/page.tsx`
- `src/app/api/orders/ingest/route.ts`
- `src/app/api/admin/orders/route.ts`
- `src/app/api/admin/orders/[id]/route.ts`
- `src/app/api/admin/vendors/sync/route.ts`

### Modified Files
- `src/lib/gmail/monitor.ts` - Add order email detection and routing
- `src/app/admin/page.tsx` - Filter out order emails from inbox
- `src/app/admin/layout.tsx` - Add Orders link to navigation
- `CLAUDE.md` - Document new order management system

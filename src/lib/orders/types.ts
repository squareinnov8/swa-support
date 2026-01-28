/**
 * Order Management Types
 *
 * Types for automated order processing, vendor routing, and fulfillment tracking.
 */

/**
 * Order status values
 */
export type OrderStatus =
  | "new" // Just received, pending processing
  | "pending_review" // Flagged for manual review (risk or high-value)
  | "processing" // Being routed to vendors
  | "fulfilled" // All vendors notified, marked in Shopify
  | "shipped" // All vendors have provided tracking
  | "delivered" // All shipments delivered
  | "return_requested" // Customer requested return
  | "return_in_progress" // Return shipment in transit
  | "return_delivered" // Return received
  | "refunded" // Refund processed
  | "cancelled"; // Order cancelled

/**
 * Per-vendor fulfillment status
 */
export type VendorFulfillmentStatus =
  | "pending" // Not yet forwarded
  | "forwarded" // Email sent to vendor
  | "shipped" // Vendor provided tracking
  | "delivered"; // Carrier confirmed delivery

/**
 * Shipping address structure
 */
export interface ShippingAddress {
  name?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

/**
 * Line item in an order
 */
export interface OrderLineItem {
  title: string;
  sku?: string;
  quantity: number;
  price?: number;
  vendor?: string; // Assigned vendor name
}

/**
 * Parsed order from email
 */
export interface ParsedOrder {
  orderNumber: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  productTitle: string; // From email (may be single product)
  lineItems: OrderLineItem[];
  shippingAddress: ShippingAddress;
  paymentId?: string;
  orderTotal?: number;
  orderDate?: Date;
}

/**
 * Order record from database
 */
export interface Order {
  id: string;
  shopify_order_id?: string;
  order_number: string;
  customer_email: string;
  customer_name?: string;
  customer_phone?: string;
  shipping_address?: ShippingAddress;
  line_items?: OrderLineItem[];
  order_total?: number;
  status: OrderStatus;
  risk_score?: number;
  risk_reasons?: string[];
  reviewed_by?: string;
  reviewed_at?: string;
  original_email_id?: string;
  created_at: string;
  updated_at: string;
  last_action_at: string;
}

/**
 * Order vendor assignment record
 */
export interface OrderVendor {
  id: string;
  order_id: string;
  vendor_name: string;
  vendor_emails: string[];
  line_items?: OrderLineItem[];
  forwarded_at?: string;
  forward_email_id?: string;
  forward_thread_id?: string;
  status: VendorFulfillmentStatus;
  tracking_number?: string;
  tracking_carrier?: string;
  tracking_url?: string;
  shipped_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Risk assessment result
 */
export interface RiskAssessment {
  score: number; // 0.0 - 1.0
  decision: "approve" | "flag_for_review" | "auto_blacklist";
  reasons: string[];
  reasoning: string;
}

/**
 * Blacklisted customer record
 */
export interface BlacklistedCustomer {
  id: string;
  email: string;
  name?: string;
  reason: string;
  reasons_detail?: string[];
  added_by: string;
  auto_detected: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Order event types
 */
export type OrderEventType =
  | "created"
  | "risk_assessed"
  | "forwarded_to_vendor"
  | "vendor_replied"
  | "tracking_added"
  | "shopify_fulfilled"
  | "shopify_tracking_updated"
  | "customer_notified"
  | "customer_contacted"
  | "customer_responded"
  | "info_forwarded_to_vendor"
  | "status_changed"
  | "flagged_for_review"
  | "manually_approved"
  | "blacklist_checked"
  | "error";

/**
 * Order event record
 */
export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: OrderEventType;
  payload?: Record<string, unknown>;
  created_at: string;
}

/**
 * Order with vendor details (for API responses)
 */
export interface OrderWithVendors extends Order {
  vendors: OrderVendor[];
}

/**
 * Order list query options
 */
export interface OrderListOptions {
  status?: OrderStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Types of information vendors may request from customers
 */
export type VendorRequestType =
  | "dashboard_photo" // Photo of car dashboard to confirm fitment
  | "color_confirmation" // Confirm color choice (piano black, matte black, etc.)
  | "memory_confirmation" // Confirm memory/storage option (4-64, 8-128, etc.)
  | "address_validation" // Validate shipping address
  | "other"; // Other custom request

/**
 * Parsed vendor request from their email
 */
export interface VendorRequest {
  type: VendorRequestType;
  description: string; // Human-readable description
  options?: string[]; // For confirmations, the available choices
  required: boolean;
}

/**
 * Result of parsing a vendor reply
 */
export interface ParsedVendorReply {
  hasTrackingNumber: boolean;
  trackingNumber?: string;
  trackingCarrier?: string;
  hasRequests: boolean;
  requests: VendorRequest[];
  rawMessage: string;
}

/**
 * Customer response to a vendor request
 */
export interface CustomerResponse {
  requestType: VendorRequestType;
  answer?: string; // Text answer (for confirmations)
  attachments?: CustomerAttachment[];
  validated: boolean;
  validationNotes?: string;
}

/**
 * Attachment from customer with validation info
 */
export interface CustomerAttachment {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId: string;
  validated: boolean;
  validationResult?: {
    isValid: boolean;
    description: string;
    confidence: number;
    issues?: string[];
  };
}

/**
 * Status of a vendor request
 */
export type VendorRequestStatus =
  | "pending" // Waiting for customer response
  | "received" // Customer responded, pending validation
  | "validated" // Response validated and ready to forward
  | "forwarded" // Response forwarded to vendor
  | "rejected"; // Response invalid, needs re-request

/**
 * Vendor request record for database
 */
export interface VendorRequestRecord {
  id: string;
  order_id: string;
  order_vendor_id: string;
  request_type: VendorRequestType;
  description: string;
  options?: string[];
  status: VendorRequestStatus;
  customer_contacted_at?: string;
  customer_response_at?: string;
  forwarded_at?: string;
  response_data?: CustomerResponse;
  created_at: string;
  updated_at: string;
}

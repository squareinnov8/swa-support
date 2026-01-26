/**
 * Shopify Types
 *
 * Types for customer and order data from Shopify Admin API.
 */

export type ShopifyCredentials = {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
};

export type ShopifyCustomer = {
  id: string; // GraphQL ID (gid://shopify/Customer/...)
  legacyResourceId: string; // Numeric ID
  email: string;
  firstName: string | null;
  lastName: string | null;
  state: string; // DISABLED, INVITED, ENABLED, DECLINED
  numberOfOrders: number;
  amountSpent: {
    amount: string;
    currencyCode: string;
  };
  tags: string[];
  note: string | null;
  orders: ShopifyOrder[];
};

export type ShopifyTrackingInfo = {
  company: string | null; // "USPS", "UPS", "FedEx", etc.
  number: string | null;  // Tracking number
  url: string | null;     // Tracking URL
};

export type ShopifyFulfillment = {
  id: string;
  status: string; // SUCCESS, PENDING, CANCELLED, ERROR, FAILURE
  createdAt: string;
  updatedAt: string;
  trackingInfo: ShopifyTrackingInfo[];
};

export type ShopifyLineItem = {
  title: string;
  quantity: number;
  sku: string | null;
};

export type ShopifyShippingAddress = {
  city: string | null;
  provinceCode: string | null;
  country: string | null;
};

export type ShopifyOrder = {
  id: string; // GraphQL ID (gid://shopify/Order/...)
  name: string; // Order number like "#1234"
  email: string;
  createdAt: string;
  displayFinancialStatus: string; // PENDING, AUTHORIZED, PAID, REFUNDED, etc.
  displayFulfillmentStatus: string; // UNFULFILLED, FULFILLED, PARTIALLY_FULFILLED
  tags: string[];
  note: string | null;
  shippingAddress?: ShopifyShippingAddress;
  fulfillments?: ShopifyFulfillment[];
  lineItems?: ShopifyLineItem[];
  customer?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    tags: string[];
    note: string | null;
  };
};

export type ShopifyGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
};

export type ShopifyProductVariant = {
  id: string;
  sku: string | null;
  title: string;
  price: string;
  compareAtPrice: string | null;
  inventoryQuantity: number;
};

export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  productType: string | null;
  vendor: string | null;
  status: string;
  tags: string[];
  images: Array<{ url: string }>;
  variants: ShopifyProductVariant[];
};

// === Order Events Timeline Types ===

export type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

export type ShopifyRefundLineItem = {
  quantity: number;
  lineItem: {
    title: string;
    sku: string | null;
  };
  restockType: string; // NO_RESTOCK, CANCEL, RETURN, LEGACY_RESTOCK
};

export type ShopifyRefund = {
  id: string;
  createdAt: string;
  note: string | null;
  totalRefundedSet: {
    shopMoney: ShopifyMoney;
  };
  refundLineItems: ShopifyRefundLineItem[];
};

export type ShopifyReturnLineItem = {
  id: string;
  quantity: number;
  returnReason: string | null;
  customerNote: string | null;
};

export type ShopifyReverseFulfillmentOrder = {
  id: string;
  status: string; // OPEN, IN_PROGRESS, CLOSED, CANCELLED
};

export type ShopifyReturn = {
  id: string;
  status: string; // REQUESTED, IN_PROGRESS, CLOSED, CANCELLED
  name: string; // Return reference like "#R1234"
  returnLineItems: ShopifyReturnLineItem[];
  reverseFulfillmentOrders: ShopifyReverseFulfillmentOrder[];
};

export type ShopifyFulfillmentWithDelivery = ShopifyFulfillment & {
  displayStatus?: string;
  deliveredAt?: string | null;
  estimatedDeliveryAt?: string | null;
  inTransitAt?: string | null;
};

export type ShopifyOrderTimeline = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  processedAt: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  totalPriceSet: { shopMoney: ShopifyMoney } | null;
  subtotalPriceSet: { shopMoney: ShopifyMoney } | null;
  totalRefundedSet: { shopMoney: ShopifyMoney } | null;
  shippingAddress?: ShopifyShippingAddress;
  fulfillments: ShopifyFulfillmentWithDelivery[];
  refunds: ShopifyRefund[];
  returns: ShopifyReturn[];
  lineItems: ShopifyLineItem[];
  customer?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    tags: string[];
    note: string | null;
  };
};

// Unified order event for timeline display
export type OrderEventType =
  | "order_created"
  | "payment_captured"
  | "fulfillment_created"
  | "in_transit"
  | "delivered"
  | "return_requested"
  | "return_in_progress"
  | "return_closed"
  | "refund_processed"
  | "order_cancelled";

export type OrderEvent = {
  type: OrderEventType;
  timestamp: string;
  title: string;
  description: string;
  metadata?: {
    trackingNumber?: string;
    trackingUrl?: string;
    carrier?: string;
    amount?: string;
    currency?: string;
    items?: string[];
    returnReason?: string;
    refundNote?: string;
  };
};

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

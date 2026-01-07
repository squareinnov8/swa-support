/**
 * Shopify Client
 *
 * GraphQL client for Shopify Admin API.
 * Used for customer verification and order lookups.
 */

import type {
  ShopifyCredentials,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyGraphQLResponse,
} from "./types";
import {
  GET_CUSTOMER_BY_EMAIL,
  GET_ORDER_BY_NUMBER,
  GET_CUSTOMER_ORDERS,
} from "./queries";

// Rate limiting: minimum delay between requests
const MIN_REQUEST_DELAY_MS = 100;

export class ShopifyClient {
  private storeDomain: string;
  private accessToken: string;
  private apiVersion: string;
  private lastRequestTime = 0;

  constructor(credentials: ShopifyCredentials) {
    this.storeDomain = credentials.storeDomain;
    this.accessToken = credentials.accessToken;
    this.apiVersion = credentials.apiVersion;
  }

  /**
   * Execute a GraphQL query against the Shopify Admin API
   */
  private async executeGraphQL<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_REQUEST_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_DELAY_MS - elapsed)
      );
    }
    this.lastRequestTime = Date.now();

    const url = `https://${this.storeDomain}/admin/api/${this.apiVersion}/graphql.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as ShopifyGraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map((e) => e.message).join(", ");
      throw new Error(`Shopify GraphQL error: ${errorMessages}`);
    }

    if (!result.data) {
      throw new Error("Shopify API returned no data");
    }

    return result.data;
  }

  /**
   * Get a customer by email address
   */
  async getCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
    type Response = {
      customers: {
        edges: Array<{
          node: {
            id: string;
            legacyResourceId: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            state: string;
            numberOfOrders: number;
            amountSpent: { amount: string; currencyCode: string };
            tags: string[];
            note: string | null;
            orders: {
              edges: Array<{
                node: {
                  id: string;
                  name: string;
                  createdAt: string;
                  displayFinancialStatus: string;
                  displayFulfillmentStatus: string;
                };
              }>;
            };
          };
        }>;
      };
    };

    const data = await this.executeGraphQL<Response>(GET_CUSTOMER_BY_EMAIL, {
      query: `email:${email}`,
    });

    const edge = data.customers.edges[0];
    if (!edge) {
      return null;
    }

    const node = edge.node;
    return {
      id: node.id,
      legacyResourceId: node.legacyResourceId,
      email: node.email,
      firstName: node.firstName,
      lastName: node.lastName,
      state: node.state,
      numberOfOrders: node.numberOfOrders,
      amountSpent: node.amountSpent,
      tags: node.tags,
      note: node.note,
      orders: node.orders.edges.map((e) => ({
        id: e.node.id,
        name: e.node.name,
        email: node.email,
        createdAt: e.node.createdAt,
        displayFinancialStatus: e.node.displayFinancialStatus,
        displayFulfillmentStatus: e.node.displayFulfillmentStatus,
        tags: [],
        note: null,
      })),
    };
  }

  /**
   * Get an order by order number
   * Accepts formats: "1234", "#1234", "SWA-1234"
   * Returns full order details including fulfillment and tracking
   */
  async getOrderByNumber(orderNumber: string): Promise<ShopifyOrder | null> {
    // Clean up the order number for search
    // Shopify order names are like "#1234"
    const cleanNumber = orderNumber.replace(/^#/, "").trim();

    type TrackingInfoResponse = {
      company: string | null;
      number: string | null;
      url: string | null;
    };

    type FulfillmentResponse = {
      id: string;
      status: string;
      createdAt: string;
      updatedAt: string;
      trackingInfo: TrackingInfoResponse[];
    };

    type LineItemResponse = {
      title: string;
      quantity: number;
      sku: string | null;
    };

    type Response = {
      orders: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            email: string;
            createdAt: string;
            displayFinancialStatus: string;
            displayFulfillmentStatus: string;
            tags: string[];
            note: string | null;
            shippingAddress: {
              city: string | null;
              provinceCode: string | null;
              country: string | null;
            } | null;
            fulfillments: FulfillmentResponse[];
            lineItems: {
              edges: Array<{ node: LineItemResponse }>;
            };
            customer: {
              id: string;
              email: string;
              firstName: string | null;
              lastName: string | null;
              state: string;
              numberOfOrders: number;
              amountSpent: { amount: string; currencyCode: string };
              tags: string[];
              note: string | null;
            } | null;
          };
        }>;
      };
    };

    const data = await this.executeGraphQL<Response>(GET_ORDER_BY_NUMBER, {
      query: `name:${cleanNumber}`,
    });

    const edge = data.orders.edges[0];
    if (!edge) {
      return null;
    }

    const node = edge.node;
    return {
      id: node.id,
      name: node.name,
      email: node.email,
      createdAt: node.createdAt,
      displayFinancialStatus: node.displayFinancialStatus,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      tags: node.tags,
      note: node.note,
      shippingAddress: node.shippingAddress || undefined,
      fulfillments: node.fulfillments?.map((f) => ({
        id: f.id,
        status: f.status,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        trackingInfo: f.trackingInfo || [],
      })),
      lineItems: node.lineItems?.edges.map((e) => ({
        title: e.node.title,
        quantity: e.node.quantity,
        sku: e.node.sku,
      })),
      customer: node.customer
        ? {
            id: node.customer.id,
            email: node.customer.email,
            firstName: node.customer.firstName,
            lastName: node.customer.lastName,
            tags: node.customer.tags,
            note: node.customer.note,
          }
        : undefined,
    };
  }

  /**
   * Get orders for a customer
   */
  async getCustomerOrders(
    customerId: string,
    limit = 10
  ): Promise<ShopifyOrder[]> {
    type Response = {
      customer: {
        orders: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              email: string;
              createdAt: string;
              displayFinancialStatus: string;
              displayFulfillmentStatus: string;
              tags: string[];
              note: string | null;
            };
          }>;
        };
      } | null;
    };

    const data = await this.executeGraphQL<Response>(GET_CUSTOMER_ORDERS, {
      customerId,
      first: limit,
    });

    if (!data.customer) {
      return [];
    }

    return data.customer.orders.edges.map((e) => ({
      id: e.node.id,
      name: e.node.name,
      email: e.node.email,
      createdAt: e.node.createdAt,
      displayFinancialStatus: e.node.displayFinancialStatus,
      displayFulfillmentStatus: e.node.displayFulfillmentStatus,
      tags: e.node.tags,
      note: e.node.note,
    }));
  }
}

/**
 * Create a ShopifyClient from environment variables
 */
export function createShopifyClient(): ShopifyClient {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-01";

  if (!storeDomain || !accessToken) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set"
    );
  }

  return new ShopifyClient({
    storeDomain,
    accessToken,
    apiVersion,
  });
}

/**
 * Singleton instance for reuse
 */
let _client: ShopifyClient | null = null;

export function getShopifyClient(): ShopifyClient {
  if (!_client) {
    _client = createShopifyClient();
  }
  return _client;
}

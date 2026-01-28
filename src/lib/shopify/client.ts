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
  ShopifyProduct,
  ShopifyGraphQLResponse,
} from "./types";
import {
  GET_CUSTOMER_BY_EMAIL,
  GET_ORDER_BY_NUMBER,
  GET_CUSTOMER_ORDERS,
  GET_PRODUCTS,
  GET_ORDER_FULFILLMENT_ORDERS,
  FULFILLMENT_CREATE,
  FULFILLMENT_TRACKING_INFO_UPDATE,
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
              name: string | null;
              address1: string | null;
              address2: string | null;
              city: string | null;
              provinceCode: string | null;
              zip: string | null;
              country: string | null;
              phone: string | null;
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

  /**
   * Get all products with pagination
   * Used for catalog sync
   */
  async getAllProducts(): Promise<ShopifyProduct[]> {
    type ProductNode = {
      id: string;
      handle: string;
      title: string;
      descriptionHtml: string;
      productType: string | null;
      vendor: string | null;
      status: string;
      tags: string[];
      images: { edges: Array<{ node: { url: string } }> };
      variants: {
        edges: Array<{
          node: {
            id: string;
            sku: string | null;
            title: string;
            price: string;
            compareAtPrice: string | null;
            inventoryQuantity: number;
          };
        }>;
      };
    };

    type ProductsResponse = {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{ node: ProductNode }>;
      };
    };

    const allProducts: ShopifyProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const data: ProductsResponse = await this.executeGraphQL<ProductsResponse>(GET_PRODUCTS, {
        first: 50,
        after: cursor,
      });

      for (const edge of data.products.edges) {
        const node = edge.node;
        allProducts.push({
          id: node.id,
          handle: node.handle,
          title: node.title,
          descriptionHtml: node.descriptionHtml,
          productType: node.productType,
          vendor: node.vendor,
          status: node.status,
          tags: node.tags,
          images: node.images.edges.map((e) => ({ url: e.node.url })),
          variants: node.variants.edges.map((e) => ({
            id: e.node.id,
            sku: e.node.sku,
            title: e.node.title,
            price: e.node.price,
            compareAtPrice: e.node.compareAtPrice,
            inventoryQuantity: e.node.inventoryQuantity,
          })),
        });
      }

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;

      console.log(`[Shopify] Fetched ${allProducts.length} products...`);
    }

    return allProducts;
  }

  /**
   * Get fulfillment orders for an order (needed to create fulfillments)
   * Shopify's modern fulfillment API requires fulfillment order IDs
   */
  async getFulfillmentOrders(orderNumber: string): Promise<{
    orderId: string;
    fulfillmentOrders: Array<{
      id: string;
      status: string;
      lineItems: Array<{
        id: string;
        remainingQuantity: number;
        totalQuantity: number;
      }>;
    }>;
  } | null> {
    const cleanNumber = orderNumber.replace(/^#/, "").trim();

    type Response = {
      orders: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            fulfillmentOrders: {
              edges: Array<{
                node: {
                  id: string;
                  status: string;
                  lineItems: {
                    edges: Array<{
                      node: {
                        id: string;
                        remainingQuantity: number;
                        totalQuantity: number;
                      };
                    }>;
                  };
                };
              }>;
            };
          };
        }>;
      };
    };

    const data = await this.executeGraphQL<Response>(GET_ORDER_FULFILLMENT_ORDERS, {
      query: `name:${cleanNumber}`,
    });

    const edge = data.orders.edges[0];
    if (!edge) {
      return null;
    }

    return {
      orderId: edge.node.id,
      fulfillmentOrders: edge.node.fulfillmentOrders.edges.map((fo) => ({
        id: fo.node.id,
        status: fo.node.status,
        lineItems: fo.node.lineItems.edges.map((li) => ({
          id: li.node.id,
          remainingQuantity: li.node.remainingQuantity,
          totalQuantity: li.node.totalQuantity,
        })),
      })),
    };
  }

  /**
   * Create a fulfillment for an order
   * Used when forwarding to vendor - marks order as fulfilled without notifying customer
   *
   * @param orderNumber - The order number (e.g., "4094")
   * @param options.notifyCustomer - Whether to send shipment email to customer (default: false)
   * @param options.trackingInfo - Optional tracking info to include
   */
  async createFulfillment(
    orderNumber: string,
    options: {
      notifyCustomer?: boolean;
      trackingInfo?: {
        company?: string;
        number?: string;
        url?: string;
      };
    } = {}
  ): Promise<{
    success: boolean;
    fulfillmentId?: string;
    error?: string;
  }> {
    const { notifyCustomer = false, trackingInfo } = options;

    // Get fulfillment orders for this order
    const fulfillmentData = await this.getFulfillmentOrders(orderNumber);
    if (!fulfillmentData) {
      return { success: false, error: `Order ${orderNumber} not found` };
    }

    // Find unfulfilled fulfillment orders (status: OPEN or SCHEDULED)
    const unfulfilledOrders = fulfillmentData.fulfillmentOrders.filter(
      (fo) => fo.status === "OPEN" || fo.status === "SCHEDULED"
    );

    if (unfulfilledOrders.length === 0) {
      // Already fulfilled
      return { success: true, fulfillmentId: undefined, error: "Order already fulfilled" };
    }

    // Build line items for fulfillment (all remaining quantities)
    const lineItemsByFulfillmentOrder = unfulfilledOrders.map((fo) => ({
      fulfillmentOrderId: fo.id,
      fulfillmentOrderLineItems: fo.lineItems
        .filter((li) => li.remainingQuantity > 0)
        .map((li) => ({
          id: li.id,
          quantity: li.remainingQuantity,
        })),
    }));

    // Build fulfillment input
    const fulfillmentInput: Record<string, unknown> = {
      notifyCustomer,
      lineItemsByFulfillmentOrder,
    };

    // Add tracking info if provided
    if (trackingInfo && (trackingInfo.company || trackingInfo.number)) {
      fulfillmentInput.trackingInfo = {
        company: trackingInfo.company || undefined,
        number: trackingInfo.number || undefined,
        url: trackingInfo.url || undefined,
      };
    }

    type MutationResponse = {
      fulfillmentCreate: {
        fulfillment: {
          id: string;
          status: string;
        } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };

    try {
      const data = await this.executeGraphQL<MutationResponse>(FULFILLMENT_CREATE, {
        fulfillment: fulfillmentInput,
      });

      const { fulfillment, userErrors } = data.fulfillmentCreate;

      if (userErrors && userErrors.length > 0) {
        const errorMsg = userErrors.map((e) => e.message).join(", ");
        console.error(`[Shopify] Fulfillment creation failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      if (!fulfillment) {
        return { success: false, error: "No fulfillment created" };
      }

      console.log(`[Shopify] Created fulfillment ${fulfillment.id} for order #${orderNumber}`);
      return { success: true, fulfillmentId: fulfillment.id };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Shopify] Fulfillment creation error: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Update tracking information on an existing fulfillment
   * Used when vendor provides tracking number
   *
   * @param fulfillmentId - Shopify fulfillment GID
   * @param trackingInfo - Tracking details
   * @param notifyCustomer - Whether to send tracking email to customer (default: true)
   */
  async updateFulfillmentTracking(
    fulfillmentId: string,
    trackingInfo: {
      company?: string;
      number: string;
      url?: string;
    },
    notifyCustomer: boolean = true
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    type MutationResponse = {
      fulfillmentTrackingInfoUpdate: {
        fulfillment: {
          id: string;
          status: string;
          trackingInfo: Array<{
            company: string | null;
            number: string | null;
            url: string | null;
          }>;
        } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    };

    try {
      const data = await this.executeGraphQL<MutationResponse>(FULFILLMENT_TRACKING_INFO_UPDATE, {
        fulfillmentId,
        trackingInfoInput: {
          company: trackingInfo.company || undefined,
          number: trackingInfo.number,
          url: trackingInfo.url || undefined,
        },
        notifyCustomer,
      });

      const { fulfillment, userErrors } = data.fulfillmentTrackingInfoUpdate;

      if (userErrors && userErrors.length > 0) {
        const errorMsg = userErrors.map((e) => e.message).join(", ");
        console.error(`[Shopify] Tracking update failed: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      if (!fulfillment) {
        return { success: false, error: "No fulfillment returned" };
      }

      console.log(`[Shopify] Updated tracking for fulfillment ${fulfillmentId}: ${trackingInfo.number}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Shopify] Tracking update error: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Add tracking to an order by order number
   * Finds the existing fulfillment and updates its tracking info
   *
   * @param orderNumber - The order number (e.g., "4094")
   * @param trackingInfo - Tracking details
   * @param notifyCustomer - Whether to send tracking email to customer (default: true)
   */
  async addTrackingToOrder(
    orderNumber: string,
    trackingInfo: {
      company?: string;
      number: string;
      url?: string;
    },
    notifyCustomer: boolean = true
  ): Promise<{
    success: boolean;
    fulfillmentId?: string;
    error?: string;
  }> {
    // Get the order with fulfillments
    const order = await this.getOrderByNumber(orderNumber);
    if (!order) {
      return { success: false, error: `Order ${orderNumber} not found` };
    }

    // Find fulfillment without tracking (or first fulfillment)
    const fulfillments = order.fulfillments || [];
    if (fulfillments.length === 0) {
      return { success: false, error: "No fulfillments found for order" };
    }

    // Prefer fulfillment without tracking, otherwise use the first one
    const targetFulfillment =
      fulfillments.find((f) => !f.trackingInfo || f.trackingInfo.length === 0) ||
      fulfillments[0];

    const result = await this.updateFulfillmentTracking(
      targetFulfillment.id,
      trackingInfo,
      notifyCustomer
    );

    return {
      ...result,
      fulfillmentId: targetFulfillment.id,
    };
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

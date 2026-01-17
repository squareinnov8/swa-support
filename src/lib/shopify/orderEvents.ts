/**
 * Order Events
 *
 * Fetches and transforms Shopify order data into a timeline of events.
 * Used for displaying order activity inline with support messages.
 */

import { getShopifyClient } from "./client";
import { GET_ORDER_TIMELINE } from "./queries";
import type {
  ShopifyGraphQLResponse,
  ShopifyOrderTimeline,
  ShopifyFulfillmentWithDelivery,
  ShopifyRefund,
  ShopifyReturn,
  OrderEvent,
} from "./types";

// GraphQL response types for the timeline query
type TimelineResponse = {
  orders: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        email: string;
        createdAt: string;
        processedAt: string | null;
        displayFinancialStatus: string;
        displayFulfillmentStatus: string;
        cancelledAt: string | null;
        cancelReason: string | null;
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
        subtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } } | null;
        totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } } | null;
        shippingAddress: { city: string | null; provinceCode: string | null; country: string | null } | null;
        fulfillments: Array<{
          id: string;
          status: string;
          displayStatus: string;
          createdAt: string;
          updatedAt: string;
          deliveredAt: string | null;
          estimatedDeliveryAt: string | null;
          inTransitAt: string | null;
          trackingInfo: Array<{ company: string | null; number: string | null; url: string | null }>;
        }>;
        refunds: Array<{
          id: string;
          createdAt: string;
          note: string | null;
          totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
          refundLineItems: { edges: Array<{ node: { quantity: number; lineItem: { title: string; sku: string | null }; restockType: string } }> };
        }>;
        returns: {
          edges: Array<{
            node: {
              id: string;
              status: string;
              name: string;
              returnLineItems: {
                edges: Array<{
                  node: {
                    id: string;
                    quantity: number;
                    returnReason: string | null;
                    customerNote: string | null;
                  };
                }>;
              };
              reverseFulfillmentOrders: {
                edges: Array<{
                  node: {
                    id: string;
                    status: string;
                  };
                }>;
              };
            };
          }>;
        };
        lineItems: { edges: Array<{ node: { title: string; quantity: number; sku: string | null } }> };
        customer: { id: string; email: string; firstName: string | null; lastName: string | null; tags: string[]; note: string | null } | null;
      };
    }>;
  };
};

/**
 * Fetch order timeline data from Shopify
 */
export async function getOrderTimeline(orderNumber: string): Promise<ShopifyOrderTimeline | null> {
  try {
    const client = getShopifyClient();

    // Clean up the order number for search
    const cleanNumber = orderNumber.replace(/^#/, "").trim();

    // Use the internal executeGraphQL method via a workaround
    // We'll add a public method to the client for this
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION || "2024-01"}/graphql.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN || "",
      },
      body: JSON.stringify({
        query: GET_ORDER_TIMELINE,
        variables: { query: `name:${cleanNumber}` },
      }),
    });

    if (!response.ok) {
      console.error("[OrderEvents] Shopify API error:", response.status);
      return null;
    }

    const result = (await response.json()) as ShopifyGraphQLResponse<TimelineResponse>;

    if (result.errors?.length) {
      console.error("[OrderEvents] GraphQL errors:", result.errors);
      return null;
    }

    const edge = result.data?.orders.edges[0];
    if (!edge) {
      return null;
    }

    const node = edge.node;

    // Transform the response into our types
    const fulfillments: ShopifyFulfillmentWithDelivery[] = node.fulfillments?.map((f) => ({
      id: f.id,
      status: f.status,
      displayStatus: f.displayStatus,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      deliveredAt: f.deliveredAt,
      estimatedDeliveryAt: f.estimatedDeliveryAt,
      inTransitAt: f.inTransitAt,
      trackingInfo: f.trackingInfo || [],
    })) || [];

    const refunds: ShopifyRefund[] = node.refunds?.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      note: r.note,
      totalRefundedSet: r.totalRefundedSet,
      refundLineItems: r.refundLineItems.edges.map((e) => e.node),
    })) || [];

    const returns: ShopifyReturn[] = node.returns?.edges.map((e) => ({
      id: e.node.id,
      status: e.node.status,
      name: e.node.name,
      returnLineItems: e.node.returnLineItems.edges.map((li) => li.node),
      reverseFulfillmentOrders: e.node.reverseFulfillmentOrders.edges.map((rfo) => ({
        id: rfo.node.id,
        status: rfo.node.status,
      })),
    })) || [];

    return {
      id: node.id,
      name: node.name,
      email: node.email,
      createdAt: node.createdAt,
      processedAt: node.processedAt,
      displayFinancialStatus: node.displayFinancialStatus,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      cancelledAt: node.cancelledAt,
      cancelReason: node.cancelReason,
      totalPriceSet: node.totalPriceSet,
      subtotalPriceSet: node.subtotalPriceSet,
      totalRefundedSet: node.totalRefundedSet,
      shippingAddress: node.shippingAddress || undefined,
      fulfillments,
      refunds,
      returns,
      lineItems: node.lineItems?.edges.map((e) => e.node) || [],
      customer: node.customer || undefined,
    };
  } catch (error) {
    console.error("[OrderEvents] Error fetching timeline:", error);
    return null;
  }
}

/**
 * Convert order timeline data into a chronological list of events
 */
export function buildOrderEvents(order: ShopifyOrderTimeline): OrderEvent[] {
  const events: OrderEvent[] = [];

  // 1. Order created
  events.push({
    type: "order_created",
    timestamp: order.createdAt,
    title: `Order ${order.name} placed`,
    description: `Order created for ${formatMoney(order.totalPriceSet?.shopMoney)}`,
    metadata: {
      amount: order.totalPriceSet?.shopMoney.amount,
      currency: order.totalPriceSet?.shopMoney.currencyCode,
      items: order.lineItems.map((li) => `${li.quantity}x ${li.title}`),
    },
  });

  // 2. Payment captured (use processedAt if available)
  if (order.processedAt && order.displayFinancialStatus !== "PENDING") {
    events.push({
      type: "payment_captured",
      timestamp: order.processedAt,
      title: "Payment captured",
      description: `Payment of ${formatMoney(order.totalPriceSet?.shopMoney)} received`,
      metadata: {
        amount: order.totalPriceSet?.shopMoney.amount,
        currency: order.totalPriceSet?.shopMoney.currencyCode,
      },
    });
  }

  // 3. Fulfillments (shipping events)
  for (const fulfillment of order.fulfillments) {
    // Fulfillment created (shipped)
    events.push({
      type: "fulfillment_created",
      timestamp: fulfillment.createdAt,
      title: "Order shipped",
      description: fulfillment.trackingInfo?.[0]?.company
        ? `Shipped via ${fulfillment.trackingInfo[0].company}`
        : "Order has been shipped",
      metadata: {
        trackingNumber: fulfillment.trackingInfo?.[0]?.number || undefined,
        trackingUrl: fulfillment.trackingInfo?.[0]?.url || undefined,
        carrier: fulfillment.trackingInfo?.[0]?.company || undefined,
      },
    });

    // In transit
    if (fulfillment.inTransitAt) {
      events.push({
        type: "in_transit",
        timestamp: fulfillment.inTransitAt,
        title: "Package in transit",
        description: fulfillment.trackingInfo?.[0]?.company
          ? `Package is in transit with ${fulfillment.trackingInfo[0].company}`
          : "Package is in transit",
        metadata: {
          trackingNumber: fulfillment.trackingInfo?.[0]?.number || undefined,
          trackingUrl: fulfillment.trackingInfo?.[0]?.url || undefined,
          carrier: fulfillment.trackingInfo?.[0]?.company || undefined,
        },
      });
    }

    // Delivered
    if (fulfillment.deliveredAt) {
      events.push({
        type: "delivered",
        timestamp: fulfillment.deliveredAt,
        title: "Package delivered",
        description: "Package has been delivered",
        metadata: {
          trackingNumber: fulfillment.trackingInfo?.[0]?.number || undefined,
          trackingUrl: fulfillment.trackingInfo?.[0]?.url || undefined,
        },
      });
    }
  }

  // 4. Returns
  for (const ret of order.returns) {
    const returnReasons = ret.returnLineItems
      .map((li) => li.returnReason)
      .filter((r) => r)
      .join(", ");

    // Use order createdAt as fallback timestamp for returns (since Return.createdAt isn't available)
    const returnTimestamp = order.createdAt;

    // Return event - show current status
    // Note: Shopify uses OPEN for "requested" status
    if (ret.status === "REQUESTED" || ret.status === "OPEN") {
      events.push({
        type: "return_requested",
        timestamp: returnTimestamp,
        title: `Return ${ret.name} requested`,
        description: "Return has been requested",
        metadata: {
          returnReason: returnReasons || undefined,
        },
      });
    } else if (ret.status === "IN_PROGRESS") {
      events.push({
        type: "return_in_progress",
        timestamp: returnTimestamp,
        title: `Return ${ret.name} in progress`,
        description: "Return label issued, awaiting package",
        metadata: {
          returnReason: returnReasons || undefined,
        },
      });
    } else if (ret.status === "CLOSED") {
      events.push({
        type: "return_closed",
        timestamp: returnTimestamp,
        title: `Return ${ret.name} completed`,
        description: "Return has been processed",
        metadata: {
          returnReason: returnReasons || undefined,
        },
      });
    }

    // Also check reverse fulfillment order status
    for (const rfo of ret.reverseFulfillmentOrders) {
      if (rfo.status === "IN_PROGRESS" && ret.status !== "IN_PROGRESS") {
        events.push({
          type: "return_in_progress",
          timestamp: returnTimestamp,
          title: "Return shipping in progress",
          description: "Return label issued, package on the way back",
        });
      }
    }
  }

  // 5. Refunds
  for (const refund of order.refunds) {
    const refundItems = refund.refundLineItems
      .map((li) => `${li.quantity}x ${li.lineItem.title}`)
      .join(", ");

    events.push({
      type: "refund_processed",
      timestamp: refund.createdAt,
      title: "Refund processed",
      description: `Refunded ${formatMoney(refund.totalRefundedSet.shopMoney)}${refundItems ? ` for: ${refundItems}` : ""}`,
      metadata: {
        amount: refund.totalRefundedSet.shopMoney.amount,
        currency: refund.totalRefundedSet.shopMoney.currencyCode,
        items: refund.refundLineItems.map((li) => `${li.quantity}x ${li.lineItem.title}`),
        refundNote: refund.note || undefined,
      },
    });
  }

  // 6. Order cancelled
  if (order.cancelledAt) {
    events.push({
      type: "order_cancelled",
      timestamp: order.cancelledAt,
      title: "Order cancelled",
      description: order.cancelReason
        ? `Order cancelled: ${order.cancelReason.toLowerCase().replace(/_/g, " ")}`
        : "Order has been cancelled",
    });
  }

  // Sort events chronologically (newest first for display)
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return events;
}

/**
 * Format money for display
 */
function formatMoney(money?: { amount: string; currencyCode: string }): string {
  if (!money) return "N/A";

  const amount = parseFloat(money.amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currencyCode,
  }).format(amount);
}

/**
 * Get order events for display in thread timeline
 */
export async function getOrderEvents(orderNumber: string): Promise<OrderEvent[]> {
  const order = await getOrderTimeline(orderNumber);
  if (!order) {
    return [];
  }
  return buildOrderEvents(order);
}

/**
 * Build a summary of current order status for Lina's context
 */
export function buildOrderStatusSummary(order: ShopifyOrderTimeline): string {
  const parts: string[] = [];

  // Basic order info
  parts.push(`Order ${order.name}:`);
  parts.push(`- Status: ${order.displayFulfillmentStatus.replace(/_/g, " ")}`);
  parts.push(`- Payment: ${order.displayFinancialStatus.replace(/_/g, " ")}`);

  // Fulfillment status
  if (order.fulfillments.length > 0) {
    const latestFulfillment = order.fulfillments[0];
    if (latestFulfillment.deliveredAt) {
      parts.push(`- Delivery: Delivered on ${new Date(latestFulfillment.deliveredAt).toLocaleDateString()}`);
    } else if (latestFulfillment.inTransitAt) {
      parts.push(`- Delivery: In transit since ${new Date(latestFulfillment.inTransitAt).toLocaleDateString()}`);
      if (latestFulfillment.estimatedDeliveryAt) {
        parts.push(`- Estimated delivery: ${new Date(latestFulfillment.estimatedDeliveryAt).toLocaleDateString()}`);
      }
    } else {
      parts.push(`- Shipped: ${new Date(latestFulfillment.createdAt).toLocaleDateString()}`);
    }

    if (latestFulfillment.trackingInfo?.[0]?.number) {
      parts.push(`- Tracking: ${latestFulfillment.trackingInfo[0].number} (${latestFulfillment.trackingInfo[0].company || "Unknown carrier"})`);
    }
  }

  // Returns status
  if (order.returns.length > 0) {
    for (const ret of order.returns) {
      parts.push(`- Return ${ret.name}: ${ret.status.replace(/_/g, " ")}`);

      // Check reverse fulfillment orders for label status
      for (const rfo of ret.reverseFulfillmentOrders) {
        if (rfo.status === "IN_PROGRESS") {
          parts.push(`  - Return label issued, package in transit back`);
        } else if (rfo.status === "CLOSED") {
          parts.push(`  - Return received and processed`);
        }
      }
    }
  }

  // Refunds
  if (order.refunds.length > 0) {
    const totalRefunded = order.totalRefundedSet?.shopMoney;
    if (totalRefunded) {
      parts.push(`- Total refunded: ${formatMoney(totalRefunded)}`);
    }
  }

  // Cancelled
  if (order.cancelledAt) {
    parts.push(`- CANCELLED: ${order.cancelReason || "No reason provided"}`);
  }

  return parts.join("\n");
}

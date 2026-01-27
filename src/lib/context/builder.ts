/**
 * Lina Context Builder
 *
 * Aggregates all context sources into a unified LinaContext object.
 * Used for email generation and tool execution.
 */

import { supabase } from "@/lib/db";
import { getOrderTimeline, buildOrderStatusSummary } from "@/lib/shopify/orderEvents";
import { getAdminDecisions } from "./adminDecisions";
import type {
  LinaContext,
  BuildLinaContextOptions,
  ThreadContext,
  ThreadMessage,
  CustomerInfo,
  ShopifyOrderContext,
  CustomerHistory,
  PreviousTicket,
  PreviousOrder,
  PendingAction,
} from "./types";

/**
 * Build unified Lina context for a thread
 */
export async function buildLinaContext(
  options: BuildLinaContextOptions
): Promise<LinaContext> {
  const {
    threadId,
    includeOrderData = false,
    includeCustomerHistory = false,
    includeAdminDecisions = true,
    messageLimit = 15,
  } = options;

  // 1. Fetch thread data
  const thread = await fetchThreadContext(threadId);

  // 2. Fetch messages
  const messages = await fetchThreadMessages(threadId, messageLimit);

  // 3. Fetch admin decisions
  const adminDecisions = includeAdminDecisions
    ? await getAdminDecisions(threadId)
    : [];

  // 4. Fetch customer info and verification data
  const { customer, orderNumber } = await fetchCustomerInfo(threadId);

  // 5. Optionally fetch Shopify order data
  let order: ShopifyOrderContext | undefined;
  if (includeOrderData && orderNumber) {
    order = await fetchShopifyOrder(orderNumber);
  }

  // 6. Optionally fetch customer history
  let customerHistory: CustomerHistory | undefined;
  if (includeCustomerHistory && customer?.email) {
    customerHistory = await fetchCustomerHistory(customer.email, threadId);
  }

  return {
    thread,
    messages,
    adminDecisions,
    customer,
    order,
    customerHistory,
  };
}

/**
 * Fetch thread context from database
 */
async function fetchThreadContext(threadId: string): Promise<ThreadContext> {
  const { data, error } = await supabase
    .from("threads")
    .select("id, subject, state, created_at, last_message_at, pending_action, gmail_thread_id")
    .eq("id", threadId)
    .single();

  if (error || !data) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  return {
    id: data.id,
    subject: data.subject,
    state: data.state,
    createdAt: new Date(data.created_at),
    lastMessageAt: data.last_message_at ? new Date(data.last_message_at) : undefined,
    pendingAction: data.pending_action as PendingAction | null,
    gmailThreadId: data.gmail_thread_id,
  };
}

/**
 * Fetch thread messages
 */
async function fetchThreadMessages(
  threadId: string,
  limit: number
): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, direction, from_email, to_email, body_text, created_at, role, channel_metadata")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[ContextBuilder] Error fetching messages:", error);
    return [];
  }

  return (data || []).map((msg) => {
    const metadata = msg.channel_metadata as Record<string, unknown> | null;
    const attachments = metadata?.attachments as Array<unknown> | undefined;

    return {
      id: msg.id,
      direction: msg.direction as "inbound" | "outbound",
      from: msg.from_email,
      to: msg.to_email,
      body: msg.body_text || "",
      createdAt: new Date(msg.created_at),
      role: mapRole(msg.direction, msg.role),
      hasAttachments: attachments && attachments.length > 0,
      attachmentCount: attachments?.length || 0,
    };
  });
}

/**
 * Map message direction and role to a unified role
 */
function mapRole(
  direction: string,
  role: string | null
): "customer" | "agent" | "draft" | "admin" {
  if (role === "draft") return "draft";
  if (direction === "inbound") return "customer";
  return "agent";
}

/**
 * Fetch customer info from verification data
 */
async function fetchCustomerInfo(threadId: string): Promise<{
  customer?: CustomerInfo;
  orderNumber?: string;
}> {
  const { data, error } = await supabase
    .from("customer_verifications")
    .select("status, customer_email, customer_name, customer_shopify_id, order_number, recent_orders")
    .eq("thread_id", threadId)
    .eq("status", "verified")
    .maybeSingle();

  if (error || !data) {
    return {};
  }

  // Get lifetime stats from recent_orders if available
  const recentOrders = data.recent_orders as PreviousOrder[] | null;
  const totalOrders = recentOrders?.length || 0;

  return {
    customer: {
      name: data.customer_name || undefined,
      email: data.customer_email || undefined,
      shopifyId: data.customer_shopify_id || undefined,
      totalOrders,
    },
    orderNumber: data.order_number || undefined,
  };
}

/**
 * Fetch Shopify order data
 */
async function fetchShopifyOrder(orderNumber: string): Promise<ShopifyOrderContext | undefined> {
  try {
    const orderTimeline = await getOrderTimeline(orderNumber);
    if (!orderTimeline) {
      return undefined;
    }

    return {
      orderNumber: orderTimeline.name,
      status: orderTimeline.displayFinancialStatus,
      fulfillmentStatus: orderTimeline.displayFulfillmentStatus,
      createdAt: orderTimeline.createdAt,
      tracking: orderTimeline.fulfillments?.flatMap((f) =>
        f.trackingInfo?.map((t) => ({
          carrier: t.company,
          trackingNumber: t.number,
          trackingUrl: t.url,
        })) || []
      ),
      lineItems: orderTimeline.lineItems?.map((item) => ({
        title: item.title,
        quantity: item.quantity,
        sku: item.sku,
      })),
      shippingAddress: orderTimeline.shippingAddress
        ? {
            name: orderTimeline.shippingAddress.name,
            address1: orderTimeline.shippingAddress.address1,
            city: orderTimeline.shippingAddress.city,
            provinceCode: orderTimeline.shippingAddress.provinceCode,
            zip: orderTimeline.shippingAddress.zip,
            country: orderTimeline.shippingAddress.country,
          }
        : undefined,
      orderStatusSummary: buildOrderStatusSummary(orderTimeline),
    };
  } catch (error) {
    console.error("[ContextBuilder] Error fetching Shopify order:", error);
    return undefined;
  }
}

/**
 * Fetch customer history - previous tickets and orders
 */
async function fetchCustomerHistory(
  customerEmail: string,
  currentThreadId: string
): Promise<CustomerHistory> {
  // Find previous threads from this customer
  const { data: previousMessages } = await supabase
    .from("messages")
    .select("thread_id")
    .eq("from_email", customerEmail)
    .neq("thread_id", currentThreadId)
    .limit(20);

  let previousTickets: PreviousTicket[] = [];

  if (previousMessages && previousMessages.length > 0) {
    const threadIds = [...new Set(previousMessages.map((m) => m.thread_id))];

    const { data: threads } = await supabase
      .from("threads")
      .select("id, subject, state, created_at")
      .in("id", threadIds)
      .order("created_at", { ascending: false })
      .limit(5);

    previousTickets = (threads || []).map((t) => ({
      id: t.id,
      subject: t.subject || "(no subject)",
      state: t.state || "UNKNOWN",
      createdAt: new Date(t.created_at),
    }));
  }

  // Get recent orders from verification data
  const { data: verification } = await supabase
    .from("customer_verifications")
    .select("recent_orders, likely_product")
    .eq("customer_email", customerEmail)
    .eq("status", "verified")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recentOrders = (verification?.recent_orders as PreviousOrder[] | null) || [];

  return {
    previousTickets: previousTickets.length > 0 ? previousTickets : undefined,
    recentOrders: recentOrders.length > 0 ? recentOrders : undefined,
    totalOrders: recentOrders.length,
    likelyProduct: verification?.likely_product || undefined,
  };
}

/**
 * Format LinaContext for LLM prompt
 */
export function formatLinaContextForPrompt(context: LinaContext): string {
  const sections: string[] = [];

  // Thread info
  sections.push(`## Thread Information`);
  sections.push(`- Subject: ${context.thread.subject || "(no subject)"}`);
  sections.push(`- State: ${context.thread.state}`);
  sections.push(`- Created: ${context.thread.createdAt.toLocaleString()}`);

  // Pending action
  if (context.thread.pendingAction) {
    sections.push("");
    sections.push(`## Pending Action`);
    sections.push(`Lina is waiting for: **${context.thread.pendingAction.description}**`);
    sections.push(`Type: ${context.thread.pendingAction.type}`);
  }

  // Customer info
  if (context.customer) {
    sections.push("");
    sections.push(`## Customer`);
    if (context.customer.name) sections.push(`- Name: ${context.customer.name}`);
    if (context.customer.email) sections.push(`- Email: ${context.customer.email}`);
    if (context.customer.totalOrders) sections.push(`- Total Orders: ${context.customer.totalOrders}`);
  }

  // Order info
  if (context.order) {
    sections.push("");
    sections.push(`## Current Order`);
    sections.push(`- Order: #${context.order.orderNumber}`);
    sections.push(`- Status: ${context.order.status}`);
    sections.push(`- Fulfillment: ${context.order.fulfillmentStatus}`);
    if (context.order.orderStatusSummary) {
      sections.push("");
      sections.push(context.order.orderStatusSummary);
    }
  }

  // Customer history
  if (context.customerHistory) {
    if (context.customerHistory.previousTickets && context.customerHistory.previousTickets.length > 0) {
      sections.push("");
      sections.push(`## Previous Support Tickets`);
      for (const ticket of context.customerHistory.previousTickets) {
        sections.push(`- "${ticket.subject}" - ${ticket.state}`);
      }
    }
  }

  // Admin decisions
  if (context.adminDecisions.length > 0) {
    sections.push("");
    sections.push(`## Admin Decisions on This Thread`);
    sections.push(`IMPORTANT: Continue from these decisions. Honor what Rob approved.`);
    for (const decision of context.adminDecisions) {
      sections.push(`- [${decision.timestamp.toLocaleString()}] ${decision.decision}`);
    }
  }

  // Conversation history
  sections.push("");
  sections.push(`## Conversation History`);
  for (const msg of context.messages) {
    const role = msg.role === "customer" ? "Customer" : msg.role === "draft" ? "Draft" : "Lina";
    const attachment = msg.hasAttachments ? ` [${msg.attachmentCount} attachment(s)]` : "";
    const body = msg.body.length > 500 ? msg.body.slice(0, 500) + "..." : msg.body;
    sections.push(`\n[${role}]${attachment}:\n${body}`);
  }

  return sections.join("\n");
}

/**
 * Lina Context Types
 *
 * Unified context types for all Lina email generation and tool execution.
 * Aggregates thread, customer, order, and admin decision context.
 */

/**
 * Pending action types - what Lina is waiting for
 */
export type PendingActionType =
  | "awaiting_vendor_response"
  | "awaiting_customer_photos"
  | "awaiting_customer_confirmation"
  | "awaiting_tracking"
  | "awaiting_admin_decision";

/**
 * Pending action on a thread
 */
export interface PendingAction {
  type: PendingActionType;
  description: string;
  waitingFor: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Thread message in context
 */
export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: string | null;
  to: string | null;
  body: string;
  createdAt: Date;
  role?: "customer" | "agent" | "draft" | "admin";
  hasAttachments?: boolean;
  attachmentCount?: number;
}

/**
 * Admin decision extracted from tool actions
 */
export interface AdminDecision {
  timestamp: Date;
  toolUsed: string;
  decision: string;
  adminEmail: string;
  details?: Record<string, unknown>;
}

/**
 * Admin chat message (conversation with Rob)
 */
export interface AdminChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

/**
 * Customer info from verification
 */
export interface CustomerInfo {
  name?: string;
  email?: string;
  shopifyId?: string;
  totalOrders?: number;
  totalSpent?: number;
}

/**
 * Shopify order context
 */
export interface ShopifyOrderContext {
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  createdAt: string;
  tracking?: Array<{
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }>;
  lineItems?: Array<{
    title: string;
    quantity: number;
    sku?: string | null;
  }>;
  shippingAddress?: {
    name: string | null;
    address1: string | null;
    city: string | null;
    provinceCode: string | null;
    zip: string | null;
    country: string | null;
  };
  orderStatusSummary?: string;
}

/**
 * Previous support ticket summary
 */
export interface PreviousTicket {
  id: string;
  subject: string;
  state: string;
  createdAt: Date;
}

/**
 * Previous order summary
 */
export interface PreviousOrder {
  orderNumber: string;
  status: string;
  fulfillmentStatus: string;
  createdAt: string;
}

/**
 * Customer history across threads and orders
 */
export interface CustomerHistory {
  previousTickets?: PreviousTicket[];
  recentOrders?: PreviousOrder[];
  totalOrders?: number;
  totalSpent?: number;
  likelyProduct?: string;
}

/**
 * Thread context
 */
export interface ThreadContext {
  id: string;
  subject: string | null;
  state: string;
  createdAt: Date;
  lastMessageAt?: Date;
  pendingAction?: PendingAction | null;
  gmailThreadId?: string | null;
}

/**
 * Unified Lina Context
 *
 * Aggregates all context needed for email generation and tool execution.
 */
export interface LinaContext {
  thread: ThreadContext;
  messages: ThreadMessage[];
  adminDecisions: AdminDecision[];
  /** Admin chat messages (Rob's conversation with Lina about this thread) */
  adminChatMessages?: AdminChatMessage[];
  customer?: CustomerInfo;
  order?: ShopifyOrderContext;
  customerHistory?: CustomerHistory;
}

/**
 * Options for building Lina context
 */
export interface BuildLinaContextOptions {
  threadId: string;
  includeOrderData?: boolean;
  includeCustomerHistory?: boolean;
  includeAdminDecisions?: boolean;
  /** Include admin chat messages (Rob's conversation with Lina) */
  includeAdminChat?: boolean;
  messageLimit?: number;
}

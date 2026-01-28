/**
 * Draft Management API
 *
 * DELETE - Delete a draft message from a thread
 * POST - Regenerate a draft for a thread
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { generateDraft, getConversationHistory, type DraftInput, type OrderContext } from "@/lib/llm/draftGenerator";
import { classifyWithLLM } from "@/lib/intents/llmClassify";
import { lookupCustomerByEmail, isShopifyConfigured } from "@/lib/shopify/customer";
import { getShopifyClient } from "@/lib/shopify/client";
import type { CustomerContext } from "@/lib/llm/prompts";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/admin/threads/[id]/draft
 * Delete a draft message from a thread
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");

    if (!threadId) {
      return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
    }

    // If messageId is provided, delete that specific draft
    if (messageId) {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("thread_id", threadId)
        .eq("role", "draft");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log event
      await supabase.from("events").insert({
        thread_id: threadId,
        event_type: "DRAFT_DELETED",
        payload: { message_id: messageId },
      });

      return NextResponse.json({ success: true, deletedMessageId: messageId });
    }

    // Otherwise, delete all drafts for this thread
    const { data: deletedDrafts, error } = await supabase
      .from("messages")
      .delete()
      .eq("thread_id", threadId)
      .eq("role", "draft")
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      event_type: "DRAFTS_DELETED",
      payload: { count: deletedDrafts?.length || 0 },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deletedDrafts?.length || 0,
    });
  } catch (err) {
    console.error("[Draft API] Delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/threads/[id]/draft
 * Regenerate a draft for a thread
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;

    if (!threadId) {
      return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
    }

    // Check for existing relay drafts - these were created by Lina via admin chat
    // and contain specific content that shouldn't be replaced by generic regeneration
    const { data: existingDrafts } = await supabase
      .from("messages")
      .select("id, channel_metadata")
      .eq("thread_id", threadId)
      .eq("role", "draft")
      .order("created_at", { ascending: false });

    const hasRelayDraft = existingDrafts?.some(
      (d) => d.channel_metadata?.relay_response === true || d.channel_metadata?.created_via === "lina_tool"
    );

    if (hasRelayDraft) {
      return NextResponse.json(
        {
          error: "This thread has a relay draft created from admin chat. Use the admin chat with Lina to modify it, or delete the draft first to generate a new one.",
          hasRelayDraft: true
        },
        { status: 400 }
      );
    }

    // Get thread data
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get the FIRST inbound message to identify the original customer
    const { data: firstInbound } = await supabase
      .from("messages")
      .select("from_email")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const originalCustomerEmail = firstInbound?.from_email || thread.from_identifier;

    // Get the latest inbound message FROM THE CUSTOMER (not vendors/internal)
    // This ensures we respond to the customer, not to internal/vendor messages
    let latestMessage;
    if (originalCustomerEmail) {
      const { data: customerMessage } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_id", threadId)
        .eq("direction", "inbound")
        .eq("from_email", originalCustomerEmail)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      latestMessage = customerMessage;
    }

    // Fallback to latest inbound if no customer-specific message found
    if (!latestMessage) {
      const { data: fallbackMessage, error: messageError } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_id", threadId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (messageError || !fallbackMessage) {
        return NextResponse.json(
          { error: "No inbound message found in thread" },
          { status: 400 }
        );
      }
      latestMessage = fallbackMessage;
    }

    // Delete existing draft messages first
    await supabase
      .from("messages")
      .delete()
      .eq("thread_id", threadId)
      .eq("role", "draft");

    // Get intent - prefer thread's stored intent over re-classifying
    // This ensures we use the same intent that was determined during initial processing
    const customerMessage = latestMessage.body_text || "";
    const subject = thread.subject || "";
    let intent = thread.last_intent;

    // Only re-classify if no stored intent (using LLM classification)
    if (!intent || intent === "UNKNOWN") {
      const classification = await classifyWithLLM(subject, customerMessage);
      intent = classification.primary_intent || "UNKNOWN";
    }

    // Get conversation history - use higher limit to include vendor replies and full context
    const conversationHistory = await getConversationHistory(threadId, 20);

    // Fetch customer verification data
    const { data: verification } = await supabase
      .from("customer_verifications")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build order context if we have verification with order data
    let orderContext: OrderContext | undefined;
    let customerContext: CustomerContext | undefined;

    // Check for manually associated customer (via Lina's associate_thread_customer tool)
    let associatedCustomerEmail: string | null = null;
    let associatedCustomerName: string | null = null;
    if (thread.customer_id) {
      const { data: associatedCustomer } = await supabase
        .from("customers")
        .select("email, name")
        .eq("id", thread.customer_id)
        .single();

      if (associatedCustomer) {
        associatedCustomerEmail = associatedCustomer.email;
        associatedCustomerName = associatedCustomer.name;
      }
    }

    // Use associated customer email if available, otherwise use message email
    const customerEmail = associatedCustomerEmail || latestMessage.from_email;

    // Try to get customer and order context from Shopify
    if (isShopifyConfigured() && customerEmail) {
      try {
        const shopifyCustomer = await lookupCustomerByEmail(customerEmail);
        if (shopifyCustomer) {
          // Parse recent orders for customer context
          const recentOrders = shopifyCustomer.recentOrders?.map(o => ({
            orderNumber: o.name,
            status: o.financialStatus || "UNKNOWN",
            fulfillmentStatus: o.fulfillmentStatus || "UNKNOWN",
            createdAt: o.createdAt,
            items: o.lineItems?.map(li => li.title) || [],
          }));

          customerContext = {
            name: associatedCustomerName || `${shopifyCustomer.firstName || ""} ${shopifyCustomer.lastName || ""}`.trim() || undefined,
            email: shopifyCustomer.email,
            totalOrders: shopifyCustomer.ordersCount,
            totalSpent: shopifyCustomer.totalSpent,
            recentOrders,
          };

          // If we have an order number from verification or subject, fetch order details
          let orderNumber = verification?.order_number;
          if (!orderNumber && thread.subject) {
            const orderMatch = thread.subject.match(/#?(\d{4,})/);
            if (orderMatch) orderNumber = orderMatch[1];
          }

          if (orderNumber) {
            try {
              const client = getShopifyClient();
              const order = await client.getOrderByNumber(orderNumber);
              if (order) {
                orderContext = {
                  orderNumber: order.name,
                  status: order.displayFinancialStatus || "UNKNOWN",
                  fulfillmentStatus: order.displayFulfillmentStatus || "UNKNOWN",
                  createdAt: order.createdAt,
                  tracking: order.fulfillments?.flatMap(f =>
                    f.trackingInfo?.map(t => ({
                      carrier: t.company,
                      trackingNumber: t.number,
                      trackingUrl: t.url,
                    })) || []
                  ),
                  lineItems: order.lineItems?.map(item => ({
                    title: item.title,
                    quantity: item.quantity,
                  })),
                  shippingCity: order.shippingAddress?.city ?? undefined,
                  shippingState: order.shippingAddress?.provinceCode ?? undefined,
                };
              }
            } catch (orderError) {
              console.error("[Draft API] Order lookup error:", orderError);
            }
          }
        }
      } catch (shopifyError) {
        console.error("[Draft API] Shopify lookup error:", shopifyError);
      }
    }

    // Fall back to verification data if Shopify lookup didn't work
    if (!customerContext && verification?.status === "verified") {
      let recentOrders;
      if (verification.recent_orders) {
        try {
          recentOrders = typeof verification.recent_orders === "string"
            ? JSON.parse(verification.recent_orders)
            : verification.recent_orders;
        } catch {
          // Ignore parse errors
        }
      }

      customerContext = {
        name: verification.customer_name || undefined,
        email: verification.customer_email || undefined,
        totalOrders: verification.total_orders,
        totalSpent: verification.total_spent,
        likelyProduct: verification.likely_product || undefined,
        recentOrders,
      };
    }

    // Build draft input with full context
    const draftInput: DraftInput = {
      threadId,
      messageId: latestMessage.id,
      customerMessage,
      intent: intent as DraftInput["intent"],
      previousMessages: conversationHistory,
      customerInfo: {
        email: customerEmail || undefined,
        name: customerContext?.name,
        orderNumber: orderContext?.orderNumber || verification?.order_number || undefined,
      },
      orderContext,
      customerContext,
    };

    // Generate new draft
    console.log("[Draft API] Regenerating draft for thread:", threadId);
    console.log("[Draft API] Intent:", intent);
    console.log("[Draft API] Customer message preview:", customerMessage.slice(0, 100));

    const draftResult = await generateDraft(draftInput);

    console.log("[Draft API] Draft result:", {
      success: draftResult.success,
      kbDocsUsed: draftResult.kbDocsUsed,
      error: draftResult.error,
    });

    if (!draftResult.success || !draftResult.draft) {
      return NextResponse.json(
        {
          error: draftResult.error || "Draft generation failed",
          policyViolations: draftResult.policyViolations,
          kbDocsSearched: draftResult.kbDocsUsed?.length || 0,
        },
        { status: 400 }
      );
    }

    // Save draft as a message with role: "draft"
    const { data: draftMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body_text: draftResult.draft,
        role: "draft",
        channel: "email",
        channel_metadata: {
          regenerated: true,
          kb_docs_used: draftResult.kbDocsUsed,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Draft API] Insert error:", insertError);
      // Draft was generated but not saved to messages
      // Still return success since we have the draft
    }

    // Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      event_type: "DRAFT_REGENERATED",
      payload: {
        intent,
        kb_docs_used: draftResult.kbDocsUsed,
        policy_gate_passed: draftResult.policyGatePassed,
        message_id: draftMessage?.id,
      },
    });

    return NextResponse.json({
      success: true,
      draft: draftResult.draft,
      intent,
      kbDocsUsed: draftResult.kbDocsUsed,
      kbDocsCount: draftResult.kbDocsUsed?.length || 0,
      policyGatePassed: draftResult.policyGatePassed,
      messageId: draftMessage?.id,
    });
  } catch (err) {
    console.error("[Draft API] Regenerate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

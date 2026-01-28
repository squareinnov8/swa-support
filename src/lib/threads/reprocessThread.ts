/**
 * Thread Reprocessing Module
 *
 * Automatically reassesses threads when they receive updates (emails, admin chat, Shopify events).
 * If Lina has enough information to proceed, generates a draft automatically.
 *
 * Key principle: Threads should NEVER get stuck waiting for manual intervention.
 * After any update, Lina should reassess and either:
 * 1. Generate a draft if she has enough info
 * 2. Ask for more info if needed
 * 3. Stay in the current state with clear reasoning
 */

import { supabase } from "@/lib/db";
import { generateDraft, getConversationHistory, type DraftInput, type OrderContext } from "@/lib/llm/draftGenerator";
import { classifyWithLLM } from "@/lib/intents/llmClassify";
import { lookupCustomerByEmail, isShopifyConfigured } from "@/lib/shopify/customer";
import { getShopifyClient } from "@/lib/shopify/client";
import { buildLinaContext } from "@/lib/context";
import { trackPromisedActions } from "@/lib/responders/promisedActions";
import type { CustomerContext } from "@/lib/llm/prompts";

export interface ReprocessResult {
  success: boolean;
  action: "draft_generated" | "no_action" | "error";
  reason: string;
  draftId?: string;
  error?: string;
}

export interface ReprocessOptions {
  /** Trigger source for logging */
  trigger: "admin_chat" | "email_reply" | "shopify_event" | "manual";
  /** Skip if a relay draft already exists */
  skipIfRelayDraft?: boolean;
  /** Force reprocess even if a draft exists */
  force?: boolean;
}

/**
 * Determine if a thread should be automatically reprocessed
 */
function shouldReprocess(
  threadState: string,
  hasDraft: boolean,
  hasRelayDraft: boolean,
  options: ReprocessOptions
): { should: boolean; reason: string } {
  // Never reprocess archived threads
  if (threadState === "ARCHIVED" || threadState === "RESOLVED") {
    return { should: false, reason: "Thread is resolved/archived" };
  }

  // Don't overwrite relay drafts (created via admin chat)
  if (hasRelayDraft && options.skipIfRelayDraft) {
    return { should: false, reason: "Relay draft exists from admin chat" };
  }

  // Force reprocess regardless of draft
  if (options.force) {
    return { should: true, reason: "Forced reprocess" };
  }

  // If there's already a draft and we're not forcing, skip
  if (hasDraft) {
    return { should: false, reason: "Draft already exists" };
  }

  // States that should trigger auto-reprocess
  const autoReprocessStates = [
    "NEW",
    "IN_PROGRESS",
    "AWAITING_INFO",
  ];

  if (autoReprocessStates.includes(threadState)) {
    return { should: true, reason: `Thread in ${threadState} state without draft` };
  }

  // HUMAN_HANDLING - only reprocess if there's new admin guidance
  if (threadState === "HUMAN_HANDLING" && options.trigger === "admin_chat") {
    return { should: true, reason: "Admin provided guidance via chat" };
  }

  return { should: false, reason: `Thread state ${threadState} doesn't require reprocessing` };
}

/**
 * Reprocess a thread - reassess and generate draft if appropriate
 *
 * Call this after any thread update to ensure Lina responds appropriately.
 */
export async function reprocessThread(
  threadId: string,
  options: ReprocessOptions
): Promise<ReprocessResult> {
  console.log(`[Reprocess] Starting reprocess for thread ${threadId}, trigger: ${options.trigger}`);

  try {
    // Get thread data
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return {
        success: false,
        action: "error",
        reason: "Thread not found",
        error: threadError?.message,
      };
    }

    // Check for existing drafts
    const { data: existingDrafts } = await supabase
      .from("messages")
      .select("id, channel_metadata")
      .eq("thread_id", threadId)
      .eq("role", "draft")
      .order("created_at", { ascending: false });

    const hasDraft = (existingDrafts?.length ?? 0) > 0;
    const hasRelayDraft = existingDrafts?.some(
      (d) => d.channel_metadata?.relay_response === true || d.channel_metadata?.created_via === "lina_tool"
    ) ?? false;

    // Determine if we should reprocess
    const reprocessCheck = shouldReprocess(thread.state, hasDraft, hasRelayDraft, options);

    if (!reprocessCheck.should) {
      console.log(`[Reprocess] Skipping: ${reprocessCheck.reason}`);
      return {
        success: true,
        action: "no_action",
        reason: reprocessCheck.reason,
      };
    }

    console.log(`[Reprocess] Proceeding: ${reprocessCheck.reason}`);

    // Get the latest inbound message
    const { data: latestMessage } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!latestMessage) {
      return {
        success: false,
        action: "error",
        reason: "No inbound message found",
      };
    }

    // Delete existing non-relay drafts if we're regenerating
    if (hasDraft && !hasRelayDraft) {
      await supabase
        .from("messages")
        .delete()
        .eq("thread_id", threadId)
        .eq("role", "draft");
    }

    // Get or re-classify intent
    const customerMessage = latestMessage.body_text || "";
    const subject = thread.subject || "";
    let intent = thread.last_intent;

    if (!intent || intent === "UNKNOWN") {
      const classification = await classifyWithLLM(subject, customerMessage);
      intent = classification.primary_intent || "UNKNOWN";
    }

    // Build context including admin decisions from chat
    const linaContext = await buildLinaContext({
      threadId,
      includeOrderData: true,
      includeCustomerHistory: true,
      includeAdminDecisions: true,
      messageLimit: 30,
    });

    // Get conversation history
    const conversationHistory = await getConversationHistory(threadId);

    // Build customer context
    let orderContext: OrderContext | undefined;
    let customerContext: CustomerContext | undefined;

    // Check for associated customer
    let customerEmail = latestMessage.from_email;
    let customerName: string | undefined;

    if (thread.customer_id) {
      const { data: associatedCustomer } = await supabase
        .from("customers")
        .select("email, name")
        .eq("id", thread.customer_id)
        .single();

      if (associatedCustomer) {
        customerEmail = associatedCustomer.email;
        customerName = associatedCustomer.name ?? undefined;
      }
    }

    // Get customer and order data from Shopify
    if (isShopifyConfigured() && customerEmail) {
      try {
        const shopifyCustomer = await lookupCustomerByEmail(customerEmail);
        if (shopifyCustomer) {
          const recentOrders = shopifyCustomer.recentOrders?.map((o) => ({
            orderNumber: o.name,
            status: o.financialStatus || "UNKNOWN",
            fulfillmentStatus: o.fulfillmentStatus || "UNKNOWN",
            createdAt: o.createdAt,
            items: o.lineItems?.map((li) => li.title) || [],
          }));

          customerContext = {
            name: customerName || `${shopifyCustomer.firstName || ""} ${shopifyCustomer.lastName || ""}`.trim() || undefined,
            email: shopifyCustomer.email,
            totalOrders: shopifyCustomer.ordersCount,
            totalSpent: shopifyCustomer.totalSpent,
            recentOrders,
          };

          // Look up order if we have an order number
          let orderNumber: string | undefined;
          const orderMatch = thread.subject?.match(/#?(\d{4,})/);
          if (orderMatch) orderNumber = orderMatch[1];

          if (orderNumber) {
            const client = getShopifyClient();
            const order = await client.getOrderByNumber(orderNumber);
            if (order) {
              orderContext = {
                orderNumber: order.name,
                status: order.displayFinancialStatus || "UNKNOWN",
                fulfillmentStatus: order.displayFulfillmentStatus || "UNKNOWN",
                createdAt: order.createdAt,
                tracking: order.fulfillments?.flatMap((f) =>
                  f.trackingInfo?.map((t) => ({
                    carrier: t.company,
                    trackingNumber: t.number,
                    trackingUrl: t.url,
                  })) || []
                ),
                lineItems: order.lineItems?.map((item) => ({
                  title: item.title,
                  quantity: item.quantity,
                })),
                shippingCity: order.shippingAddress?.city ?? undefined,
                shippingState: order.shippingAddress?.provinceCode ?? undefined,
              };
            }
          }
        }
      } catch (shopifyError) {
        console.error("[Reprocess] Shopify lookup error:", shopifyError);
      }
    }

    // Include admin decisions in the draft context
    // This is the key part - admin chat responses are included in the conversation history
    // via the buildLinaContext which extracts lina_tool_actions
    const adminDecisionsSummary = linaContext.adminDecisions?.length
      ? `\n\nRecent admin guidance:\n${linaContext.adminDecisions
          .map((d) => `- ${d.toolUsed}: ${d.decision}`)
          .join("\n")}`
      : "";

    // Build draft input with full context
    const draftInput: DraftInput = {
      threadId,
      messageId: latestMessage.id,
      customerMessage: customerMessage + adminDecisionsSummary,
      intent: intent as DraftInput["intent"],
      previousMessages: conversationHistory,
      customerInfo: {
        email: customerEmail || undefined,
        name: customerContext?.name,
        orderNumber: orderContext?.orderNumber,
      },
      orderContext,
      customerContext,
    };

    // Generate draft
    console.log(`[Reprocess] Generating draft for thread ${threadId}, intent: ${intent}`);
    const draftResult = await generateDraft(draftInput);

    if (!draftResult.success || !draftResult.draft) {
      console.log(`[Reprocess] Draft generation failed: ${draftResult.error}`);
      return {
        success: false,
        action: "error",
        reason: draftResult.error || "Draft generation failed",
        error: draftResult.policyViolations?.join(", "),
      };
    }

    // Save draft as message
    const { data: draftMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body_text: draftResult.draft,
        role: "draft",
        channel: "email",
        channel_metadata: {
          auto_reprocessed: true,
          trigger: options.trigger,
          kb_docs_used: draftResult.kbDocsUsed,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Reprocess] Draft insert error:", insertError);
    }

    // Track promised actions
    await trackPromisedActions(threadId, draftResult.draft);

    // Update thread state to IN_PROGRESS if it was waiting
    if (thread.state === "HUMAN_HANDLING" || thread.state === "AWAITING_INFO") {
      await supabase
        .from("threads")
        .update({
          state: "IN_PROGRESS",
          human_handling_mode: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", threadId);
    }

    // Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      event_type: "DRAFT_AUTO_GENERATED",
      payload: {
        trigger: options.trigger,
        intent,
        kb_docs_used: draftResult.kbDocsUsed,
        policy_gate_passed: draftResult.policyGatePassed,
        message_id: draftMessage?.id,
        admin_decisions_included: linaContext.adminDecisions?.length || 0,
      },
    });

    console.log(`[Reprocess] Draft generated successfully for thread ${threadId}`);

    return {
      success: true,
      action: "draft_generated",
      reason: `Draft auto-generated after ${options.trigger}`,
      draftId: draftMessage?.id,
    };
  } catch (error) {
    console.error("[Reprocess] Error:", error);
    return {
      success: false,
      action: "error",
      reason: "Unexpected error during reprocessing",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

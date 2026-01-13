/**
 * Channel-agnostic request processing.
 *
 * This module contains the core business logic for processing support requests
 * from any channel. All channel-specific adapters should normalize their input
 * to IngestRequest and call processIngestRequest().
 */

import { supabase } from "@/lib/db";
import { classifyIntent } from "@/lib/intents/classify";
import { classifyWithLLM, addIntentsToThread, type ClassificationResult } from "@/lib/intents/llmClassify";
import { checkRequiredInfo, generateMissingInfoPrompt } from "@/lib/intents/requiredInfo";
import { policyGate } from "@/lib/responders/policyGate";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "@/lib/responders/macros";
import { generateDraft, getConversationHistory, type DraftResult } from "@/lib/llm/draftGenerator";
import type { CustomerContext } from "@/lib/llm/prompts";
import { isLLMConfigured } from "@/lib/llm/client";
import {
  getNextState,
  getTransitionReason,
  type ThreadState,
  type Action,
} from "@/lib/threads/stateMachine";
import {
  isProtectedIntent,
  verifyCustomer,
  getVerificationPrompt,
  type VerificationResult,
} from "@/lib/verification";
import type { IngestRequest, IngestResult, MessageAttachment } from "./types";
import { syncInteractionToHubSpot, isHubSpotConfigured } from "@/lib/hubspot";
import { recordObservation } from "@/lib/collaboration";
import type { ExtractedAttachmentContent } from "@/lib/attachments";

/**
 * Process an ingest request from any channel.
 *
 * This is the core processing function that all channels use.
 * It handles:
 * 1. Thread upsert (with channel tracking)
 * 2. Message insertion (with channel metadata)
 * 3. Intent classification
 * 4. Required info checking
 * 5. Action determination + draft generation
 * 6. Policy gate validation
 * 7. State machine transitions
 * 8. Event logging
 */
export async function processIngestRequest(req: IngestRequest): Promise<IngestResult> {
  // 1. Upsert thread
  let threadId: string;
  let currentState: ThreadState = "NEW";
  let isHumanHandling = false;

  if (req.external_id) {
    const { data: existing } = await supabase
      .from("threads")
      .select("id, state, human_handling_mode")
      .eq("external_thread_id", req.external_id)
      .maybeSingle();

    if (existing?.id) {
      threadId = existing.id;
      currentState = (existing.state as ThreadState) || "NEW";
      isHumanHandling = existing.human_handling_mode === true;
    } else {
      // Create new thread since external_id lookup found nothing
      const { data: created, error } = await supabase
        .from("threads")
        .insert({
          external_thread_id: req.external_id,
          subject: req.subject,
          state: "NEW",
          channel: req.channel,
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(`Failed to create thread: ${error.message}`);
      }
      threadId = created.id;
    }
  } else {
    // No external_id, create new thread
    const { data: created, error } = await supabase
      .from("threads")
      .insert({
        external_thread_id: null,
        subject: req.subject,
        state: "NEW",
        channel: req.channel,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to create thread: ${error.message}`);
    }
    threadId = created.id;
  }

  // 2. Insert message with channel info
  const { error: messageError } = await supabase.from("messages").insert({
    thread_id: threadId,
    direction: "inbound",
    from_email: req.from_identifier ?? null,
    to_email: req.to_identifier ?? null,
    body_text: req.body_text,
    channel: req.channel,
    channel_metadata: req.metadata ?? null,
  });

  if (messageError) {
    throw new Error(`Failed to insert message: ${messageError.message}`);
  }

  // 2.5. Check if thread is in human handling mode (observation mode)
  // If so, record the observation and skip draft generation
  if (isHumanHandling) {
    // Record this message as an observation
    await recordObservation(threadId, {
      direction: "inbound",
      from: req.from_identifier || "unknown",
      to: req.to_identifier || "support@squarewheelsauto.com",
      content: req.body_text,
      timestamp: new Date(),
    });

    // Log event
    await logEvent(threadId, {
      intent: "UNKNOWN",
      confidence: 0,
      action: "NO_REPLY",
      draft: null,
      channel: req.channel,
      humanHandling: true,
      stateTransition: { from: "HUMAN_HANDLING", to: "HUMAN_HANDLING", reason: "observation_mode" },
    });

    // Return without generating draft - human is handling
    return {
      thread_id: threadId,
      message_id: threadId,
      intent: "UNKNOWN",
      confidence: 0,
      action: "NO_REPLY",
      draft: null,
      state: "HUMAN_HANDLING",
      previous_state: "HUMAN_HANDLING",
      humanHandling: true,
    };
  }

  // 3. Classify intent using LLM-based classification (with fallback to regex)
  let intent: string;
  let confidence: number;
  let classification: ClassificationResult | null = null;

  // Try LLM classification first if configured
  if (isLLMConfigured()) {
    // Build conversation context for better classification
    const { data: previousMessages } = await supabase
      .from("messages")
      .select("body_text, direction")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(3);

    const conversationContext = previousMessages
      ?.map((m) => `[${m.direction}]: ${m.body_text?.substring(0, 200)}`)
      .join("\n");

    classification = await classifyWithLLM(
      req.subject,
      req.body_text,
      conversationContext
    );

    intent = classification.primary_intent;
    confidence = classification.intents[0]?.confidence || 0.5;

    // If LLM returned UNKNOWN (e.g., no intents in DB), try regex fallback
    if (intent === "UNKNOWN" && confidence <= 0.5) {
      console.log(`[Ingest] LLM returned UNKNOWN, trying regex fallback for thread ${threadId}`);
      const regexResult = classifyIntent(req.subject, req.body_text);
      if (regexResult.intent !== "UNKNOWN") {
        intent = regexResult.intent;
        confidence = regexResult.confidence;
        // Update classification to reflect regex result for verification check
        classification = {
          ...classification,
          primary_intent: intent,
          intents: [{ slug: intent, confidence, reasoning: "regex fallback" }],
          requires_verification: isProtectedIntent(intent),
        };
        console.log(`[Ingest] Regex fallback classified as ${intent} (${confidence})`);
      }
    }

    // Add all detected intents to thread (handles UNKNOWN removal automatically)
    await addIntentsToThread(threadId, classification);

    // Log multi-intent detection
    if (classification.intents.length > 1) {
      console.log(
        `[Ingest] Multi-intent detected for thread ${threadId}:`,
        classification.intents.map((i) => `${i.slug} (${i.confidence})`).join(", ")
      );
    }
  } else {
    // Fallback to regex-based classification
    const regexResult = classifyIntent(req.subject, req.body_text);
    intent = regexResult.intent;
    confidence = regexResult.confidence;
  }

  // 3.4. Extract order info from attachments (if any)
  // This helps avoid asking for order numbers that were already provided in attachments
  let attachmentOrderNumber: string | undefined;
  let attachmentCustomerName: string | undefined;
  if (req.attachments) {
    for (const att of req.attachments) {
      if (att.extractedContent?.extractedData) {
        const data = att.extractedContent.extractedData;
        if (data.orderNumber && !attachmentOrderNumber) {
          attachmentOrderNumber = data.orderNumber;
          console.log(`[Ingest] Found order number in attachment: ${attachmentOrderNumber}`);
        }
        if (data.customerName && !attachmentCustomerName) {
          attachmentCustomerName = data.customerName;
        }
      }
    }
  }

  // 3.5. Check for auto-escalation intents (from LLM classification)
  if (classification?.auto_escalate) {
    const nextState = "ESCALATED";

    await logEvent(threadId, {
      intent,
      confidence,
      action: "ESCALATE",
      draft: null,
      channel: req.channel,
      note: "Auto-escalated due to intent type",
      intents: classification.intents,
      stateTransition: { from: currentState, to: nextState, reason: "auto_escalate_intent" },
    });

    await updateThreadState(threadId, nextState, intent);

    return {
      thread_id: threadId,
      message_id: threadId,
      intent,
      confidence,
      action: "ESCALATE",
      draft: null,
      state: nextState,
      previous_state: currentState,
    };
  }

  // 3.6. Customer verification for protected intents
  // Use classification's requires_verification or fall back to static check
  const needsVerification = classification?.requires_verification || isProtectedIntent(intent);
  let verification: VerificationResult | null = null;
  if (needsVerification) {
    // Include attachment data in the message text for order number extraction
    let messageTextForVerification = req.body_text;
    if (attachmentOrderNumber) {
      // Append the order number from attachment so verification can find it
      messageTextForVerification += `\n\n[Order number from attachment: ${attachmentOrderNumber}]`;
    }

    verification = await verifyCustomer({
      threadId,
      email: req.from_identifier,
      messageText: messageTextForVerification,
    });

    // Handle verification outcomes before continuing
    if (verification.status === "pending") {
      // Need order number - ask for it
      const nextState = getNextState({
        currentState,
        action: "ASK_CLARIFYING_QUESTIONS",
        intent,
        policyBlocked: false,
        missingRequiredInfo: true,
      });

      await logEvent(threadId, {
        intent,
        confidence,
        action: "ASK_CLARIFYING_QUESTIONS",
        draft: getVerificationPrompt("pending"),
        channel: req.channel,
        verification: { status: "pending", reason: "Order number required" },
        stateTransition: { from: currentState, to: nextState, reason: "awaiting_verification" },
      });

      await updateThreadState(threadId, nextState, intent);

      return {
        thread_id: threadId,
        message_id: threadId,
        intent,
        confidence,
        action: "ASK_CLARIFYING_QUESTIONS",
        draft: getVerificationPrompt("pending"),
        state: nextState,
        previous_state: currentState,
      };
    }

    if (verification.status === "flagged") {
      // Customer has negative flags - escalate
      const nextState = "ESCALATED";

      await logEvent(threadId, {
        intent,
        confidence,
        action: "ESCALATE",
        draft: getVerificationPrompt("flagged"),
        channel: req.channel,
        verification: {
          status: "flagged",
          flags: verification.flags,
          reason: `Customer flagged: ${verification.flags.join(", ")}`,
        },
        stateTransition: { from: currentState, to: nextState, reason: "customer_flagged" },
      });

      await updateThreadState(threadId, nextState, intent);

      return {
        thread_id: threadId,
        message_id: threadId,
        intent,
        confidence,
        action: "ESCALATE",
        draft: getVerificationPrompt("flagged"),
        state: nextState,
        previous_state: currentState,
      };
    }

    if (verification.status === "not_found") {
      // Order not found - ask for correct info
      const nextState = getNextState({
        currentState,
        action: "ASK_CLARIFYING_QUESTIONS",
        intent,
        policyBlocked: false,
        missingRequiredInfo: true,
      });

      await logEvent(threadId, {
        intent,
        confidence,
        action: "ASK_CLARIFYING_QUESTIONS",
        draft: getVerificationPrompt("not_found"),
        channel: req.channel,
        verification: { status: "not_found", reason: "Order not found in Shopify" },
        stateTransition: { from: currentState, to: nextState, reason: "verification_failed" },
      });

      await updateThreadState(threadId, nextState, intent);

      return {
        thread_id: threadId,
        message_id: threadId,
        intent,
        confidence,
        action: "ASK_CLARIFYING_QUESTIONS",
        draft: getVerificationPrompt("not_found"),
        state: nextState,
        previous_state: currentState,
      };
    }

    // If verified, continue with normal flow
    // verification.status === "verified"
    console.log(
      `Customer verified for thread ${threadId}: order ${verification.order?.number}`
    );
  }

  // 4. Check required info for this intent
  const fullText = `${req.subject}\n${req.body_text}`;
  const requiredInfoCheck = checkRequiredInfo(intent, fullText);

  // 5. Decide action + generate draft
  let action: Action = "ASK_CLARIFYING_QUESTIONS";
  let draft: string | null = null;
  let policyBlocked = false;
  let draftResult: DraftResult | null = null;

  if (intent === "THANK_YOU_CLOSE") {
    action = "NO_REPLY";
  } else if (intent === "VENDOR_SPAM") {
    // Auto-close vendor spam without reply
    action = "NO_REPLY";
    // Set state to RESOLVED immediately
    const nextState = "RESOLVED";

    await logEvent(threadId, {
      intent,
      confidence,
      action,
      draft: null,
      channel: req.channel,
      note: "Auto-closed as vendor spam",
      stateTransition: { from: currentState, to: nextState, reason: "vendor_spam_auto_close" },
    });

    await updateThreadState(threadId, nextState, intent);

    return {
      thread_id: threadId,
      message_id: threadId,
      intent,
      confidence,
      action: "NO_REPLY",
      draft: null,
      state: nextState,
      previous_state: currentState,
    };
  } else if (intent === "CHARGEBACK_THREAT") {
    // Always escalate chargebacks, regardless of required info
    action = "ESCALATE_WITH_DRAFT";
    draft = `Draft only (escalate): Customer mentions chargeback/dispute. Do not promise. Ask for order # + summarize situation.`;
  } else if (!requiredInfoCheck.allRequiredPresent) {
    // Missing required info - ask for it
    action = "ASK_CLARIFYING_QUESTIONS";
    // Use specific macro if available, otherwise generate from missing fields
    if (intent === "FIRMWARE_ACCESS_ISSUE") {
      draft = macroFirmwareAccessClarify();
    } else if (intent === "DOCS_VIDEO_MISMATCH") {
      draft = macroDocsVideoMismatch();
    } else {
      draft = generateMissingInfoPrompt(requiredInfoCheck.missingRequired);
    }
  } else if (intent === "DOCS_VIDEO_MISMATCH") {
    action = "SEND_PREAPPROVED_MACRO";
    draft = macroDocsVideoMismatch();
  } else if (intent === "FIRMWARE_ACCESS_ISSUE" && !isLLMConfigured()) {
    // Fallback to macro if LLM not configured
    action = "ASK_CLARIFYING_QUESTIONS";
    draft = macroFirmwareAccessClarify();
  } else if (isLLMConfigured()) {
    // Use LLM to generate KB-powered draft
    action = "ASK_CLARIFYING_QUESTIONS";

    // Fetch conversation history for context
    const conversationHistory = await getConversationHistory(threadId);

    // Build order context from verified order (for action-oriented responses)
    const orderContext = verification?.order
      ? {
          orderNumber: verification.order.number,
          status: verification.order.status,
          fulfillmentStatus: verification.order.fulfillmentStatus,
          createdAt: verification.order.createdAt,
          tracking: verification.order.tracking,
          lineItems: verification.order.lineItems?.map((item) => ({
            title: item.title,
            quantity: item.quantity,
          })),
          shippingCity: verification.order.shippingCity,
          shippingState: verification.order.shippingState,
        }
      : undefined;

    // Extract attachment content for LLM context
    const attachmentContent: ExtractedAttachmentContent[] = [];
    if (req.attachments) {
      for (const att of req.attachments) {
        if (att.extractedContent) {
          attachmentContent.push(att.extractedContent);
        }
      }
    }

    // Build full customer context for richer Lina responses
    let customerContext: CustomerContext | undefined;
    if (verification?.status === "verified" && verification.customer) {
      // Fetch previous support tickets for this customer
      const previousTickets = verification.customer.email
        ? await getPreviousTicketsForCustomer(verification.customer.email, threadId)
        : [];

      // Fetch extended verification data (recent orders, likely product)
      const { data: verificationData } = await supabase
        .from("customer_verifications")
        .select("recent_orders, likely_product")
        .eq("thread_id", threadId)
        .eq("status", "verified")
        .maybeSingle();

      // Parse recent orders from JSONB
      let recentOrders: CustomerContext["recentOrders"];
      if (verificationData?.recent_orders) {
        try {
          recentOrders =
            typeof verificationData.recent_orders === "string"
              ? JSON.parse(verificationData.recent_orders)
              : verificationData.recent_orders;
        } catch {
          // Ignore parse errors
        }
      }

      customerContext = {
        name: verification.customer.name,
        email: verification.customer.email,
        totalOrders: verification.customer.totalOrders,
        totalSpent: verification.customer.totalSpent,
        likelyProduct: verificationData?.likely_product || undefined,
        recentOrders,
        previousTickets: previousTickets.length > 0 ? previousTickets : undefined,
      };
    }

    draftResult = await generateDraft({
      threadId,
      customerMessage: fullText,
      intent,
      previousMessages: conversationHistory,
      customerInfo: {
        email: req.from_identifier,
        // Pass verified customer info if available
        ...(verification?.customer && {
          name: verification.customer.name,
          orderNumber: verification.order?.number,
        }),
      },
      // Pass real order data for action-oriented responses
      orderContext,
      // Pass attachment content for context
      attachmentContent: attachmentContent.length > 0 ? attachmentContent : undefined,
      // Pass full customer context for richer Lina responses
      customerContext,
    });

    if (draftResult.success && draftResult.draft) {
      draft = draftResult.draft;
      // Policy gate already checked in draftGenerator
      policyBlocked = !draftResult.policyGatePassed;
      if (policyBlocked) {
        action = "ESCALATE_WITH_DRAFT";
        draft = `Policy gate blocked LLM draft: ${draftResult.policyViolations.join(", ")}\n\nOriginal draft:\n${draftResult.rawDraft}`;
      }
    } else if (draftResult.error) {
      // LLM failed, log but continue with no draft
      console.warn("LLM draft generation failed:", draftResult.error);
    }
  } else {
    // Default: no draft (LLM not configured, no macro available)
    action = "ASK_CLARIFYING_QUESTIONS";
  }

  // 6. Policy gate check (for non-LLM drafts)
  if (draft && !draftResult) {
    const gate = policyGate(draft);
    if (!gate.ok) {
      action = "ESCALATE_WITH_DRAFT";
      policyBlocked = true;
      draft = `Policy gate blocked draft due to banned language: ${gate.reasons.join(", ")}`;
    }
  }

  // 7. Calculate next state using state machine
  const transitionContext = {
    currentState,
    action,
    intent,
    policyBlocked,
    missingRequiredInfo: !requiredInfoCheck.allRequiredPresent,
  };
  const nextState = getNextState(transitionContext);
  const stateChangeReason =
    currentState !== nextState ? getTransitionReason(transitionContext, nextState) : null;

  // 8. Log event
  await supabase.from("events").insert({
    thread_id: threadId,
    type: "auto_triage",
    payload: {
      intent,
      confidence,
      action,
      draft,
      channel: req.channel,
      requiredInfo: {
        allPresent: requiredInfoCheck.allRequiredPresent,
        missingFields: requiredInfoCheck.missingRequired.map((f) => f.id),
        presentFields: requiredInfoCheck.presentFields.map((f) => f.id),
      },
      stateTransition: {
        from: currentState,
        to: nextState,
        reason: stateChangeReason,
      },
      // LLM draft generation details (if used)
      llmDraft: draftResult
        ? {
            success: draftResult.success,
            kbDocsUsed: draftResult.kbDocsUsed.length,
            policyGatePassed: draftResult.policyGatePassed,
            policyViolations: draftResult.policyViolations,
            promptTokens: draftResult.promptTokens,
            completionTokens: draftResult.completionTokens,
          }
        : null,
    },
  });

  // 9. Generate summary for CRM syndication
  const summary = generateThreadSummary(intent, nextState, action, req.subject);

  // 10. Update thread with new state, intent, and summary
  await supabase
    .from("threads")
    .update({
      state: nextState,
      last_intent: intent,
      summary,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  // 10. Sync to HubSpot CRM (async, non-blocking)
  if (isHubSpotConfigured() && req.from_identifier) {
    // Map verification status to CRM-compatible values
    const crmVerificationStatus =
      verification?.status === "verified" ||
      verification?.status === "flagged" ||
      verification?.status === "pending"
        ? verification.status
        : null;

    syncInteractionToHubSpot({
      email: req.from_identifier,
      threadId,
      intent,
      customerName: verification?.customer?.name,
      subject: req.subject,
      messageSnippet: req.body_text.slice(0, 200),
      state: nextState,
      verificationStatus: crmVerificationStatus,
      shopifyCustomerId: verification?.customer?.shopifyId,
    }).catch((err) => {
      // Log but don't fail the request
      console.error("HubSpot sync failed:", err);
    });
  }

  return {
    thread_id: threadId,
    message_id: threadId, // Note: we should return actual message_id once we select it
    intent,
    confidence,
    action,
    draft,
    state: nextState,
    previous_state: currentState,
  };
}

/**
 * Helper: Log event to database
 */
async function logEvent(
  threadId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await supabase.from("events").insert({
    thread_id: threadId,
    type: "auto_triage",
    payload,
  });
}

/**
 * Helper: Update thread state
 */
async function updateThreadState(
  threadId: string,
  state: ThreadState,
  intent: string
): Promise<void> {
  await supabase
    .from("threads")
    .update({
      state,
      last_intent: intent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);
}

/**
 * Fetch previous support tickets for a customer by email
 */
async function getPreviousTicketsForCustomer(
  customerEmail: string,
  currentThreadId: string
): Promise<Array<{ subject: string; state: string; createdAt: string }>> {
  // Find threads with messages from this customer email
  const { data: messages } = await supabase
    .from("messages")
    .select("thread_id")
    .eq("from_email", customerEmail)
    .neq("thread_id", currentThreadId)
    .limit(20);

  if (!messages || messages.length === 0) {
    return [];
  }

  const threadIds = [...new Set(messages.map((m) => m.thread_id))];

  const { data: threads } = await supabase
    .from("threads")
    .select("subject, state, created_at")
    .in("id", threadIds)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    threads?.map((t) => ({
      subject: t.subject || "(no subject)",
      state: t.state || "UNKNOWN",
      createdAt: t.created_at,
    })) || []
  );
}

/**
 * Generate a short summary for CRM syndication
 * Format: "[Issue type] - [Status]"
 */
function generateThreadSummary(
  intent: string,
  state: ThreadState,
  action: Action,
  subject?: string
): string {
  // Map intents to readable issue types
  const issueTypes: Record<string, string> = {
    ORDER_STATUS: "Order status inquiry",
    SHIPPING_DELAY: "Shipping delay",
    RETURN_REQUEST: "Return request",
    REFUND_REQUEST: "Refund request",
    DEFECTIVE_PRODUCT: "Defective product",
    WRONG_ITEM: "Wrong item received",
    FITMENT_CHECK: "Fitment question",
    PRODUCT_RECOMMENDATION: "Product recommendation",
    TECH_SUPPORT: "Technical support",
    FIRMWARE_ACCESS_ISSUE: "Firmware access issue",
    DOCS_VIDEO_MISMATCH: "Documentation issue",
    WARRANTY_CLAIM: "Warranty claim",
    CHARGEBACK_THREAT: "Chargeback threat",
    THANK_YOU_CLOSE: "Thank you message",
    VENDOR_SPAM: "Vendor spam",
    UNKNOWN: "General inquiry",
  };

  // Map states to readable statuses
  const stateStatuses: Record<ThreadState, string> = {
    NEW: "new",
    AWAITING_INFO: "awaiting customer info",
    IN_PROGRESS: "in progress",
    ESCALATED: "escalated",
    HUMAN_HANDLING: "human handling",
    RESOLVED: "resolved",
  };

  const issueType = issueTypes[intent] || "General inquiry";
  const status = stateStatuses[state] || state.toLowerCase().replace(/_/g, " ");

  // Build summary
  let summary = `${issueType} - ${status}`;

  // Add action context if relevant
  if (action === "ESCALATE_WITH_DRAFT") {
    summary = `${issueType} - ESCALATED`;
  }

  return summary;
}

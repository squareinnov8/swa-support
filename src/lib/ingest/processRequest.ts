/**
 * Channel-agnostic request processing.
 *
 * This module contains the core business logic for processing support requests
 * from any channel. All channel-specific adapters should normalize their input
 * to IngestRequest and call processIngestRequest().
 */

import { supabase } from "@/lib/db";
import { checkAutomatedEmail } from "@/lib/intents/classify";
import { classifyWithLLM, addIntentsToThread, reclassifyThread, generateMissingInfoPromptFromClassification, type ClassificationResult } from "@/lib/intents/llmClassify";
import { policyGate } from "@/lib/responders/policyGate";
import { trackPromisedActions } from "@/lib/responders/promisedActions";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "@/lib/responders/macros";
import { generateDraft, getConversationHistory, type DraftResult } from "@/lib/llm/draftGenerator";
import { calculateThreadAge, type CustomerContext, type ThreadAgeContext } from "@/lib/llm/prompts";
import { isLLMConfigured } from "@/lib/llm/client";
import {
  generateContextualEmail,
  type EscalationContext,
  type ClarificationLoopContext,
} from "@/lib/llm/contextualEmailGenerator";
import {
  getNextState,
  getTransitionReason,
  type ThreadState,
  type Action,
} from "@/lib/threads/stateMachine";
import { detectClarificationLoop } from "@/lib/threads/clarificationLoopDetector";
import {
  verifyCustomer,
  getVerificationPrompt,
  type VerificationResult,
} from "@/lib/verification";
import type { IngestRequest, IngestResult, MessageAttachment } from "./types";
import {
  syncInteractionToHubSpot,
  isHubSpotConfigured,
  createTicketForThread,
  addActivityNote,
  updateTicketStage,
} from "@/lib/hubspot";
import { recordObservation } from "@/lib/collaboration";
import type { ExtractedAttachmentContent } from "@/lib/attachments";
import { getOrderTimeline, buildOrderStatusSummary } from "@/lib/shopify/orderEvents";

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
  // Admin/internal email detection (used for classification override and verification bypass)
  const ADMIN_EMAILS = ["rob@squarewheelsauto.com"];
  const senderEmail = req.from_identifier?.toLowerCase() || "";
  const isAdminEmail = ADMIN_EMAILS.includes(senderEmail);

  // 1. Upsert thread
  let threadId: string;
  let currentState: ThreadState = "NEW";
  let isHumanHandling = false;
  let isFollowUp = false; // Track if this is a follow-up message on existing thread
  let threadCreatedAt: Date | null = null; // Track thread creation date for age calculation

  if (req.external_id) {
    const { data: existing } = await supabase
      .from("threads")
      .select("id, state, human_handling_mode, created_at")
      .eq("external_thread_id", req.external_id)
      .maybeSingle();

    if (existing?.id) {
      threadId = existing.id;
      currentState = (existing.state as ThreadState) || "NEW";
      isHumanHandling = existing.human_handling_mode === true;
      isFollowUp = true; // This is a follow-up message
      threadCreatedAt = existing.created_at ? new Date(existing.created_at) : null;
    } else {
      // Create new thread since external_id lookup found nothing
      const threadData: Record<string, unknown> = {
        external_thread_id: req.external_id,
        subject: req.subject,
        state: "NEW",
        channel: req.channel,
      };
      // Use email date if provided for accurate thread timestamps
      if (req.message_date) {
        threadData.created_at = req.message_date.toISOString();
      }

      const { data: created, error } = await supabase
        .from("threads")
        .insert(threadData)
        .select("id, created_at")
        .single();

      if (error) {
        throw new Error(`Failed to create thread: ${error.message}`);
      }
      threadId = created.id;
      threadCreatedAt = created.created_at ? new Date(created.created_at) : new Date();
    }
  } else {
    // No external_id, create new thread
    const threadData: Record<string, unknown> = {
      external_thread_id: null,
      subject: req.subject,
      state: "NEW",
      channel: req.channel,
    };
    // Use email date if provided for accurate thread timestamps
    if (req.message_date) {
      threadData.created_at = req.message_date.toISOString();
    }

    const { data: created, error } = await supabase
      .from("threads")
      .insert(threadData)
      .select("id, created_at")
      .single();

    if (error) {
      throw new Error(`Failed to create thread: ${error.message}`);
    }
    threadId = created.id;
    threadCreatedAt = created.created_at ? new Date(created.created_at) : new Date();
  }

  // 2. Insert message with channel info
  const messageData: Record<string, unknown> = {
    thread_id: threadId,
    direction: "inbound",
    from_email: req.from_identifier ?? null,
    to_email: req.to_identifier ?? null,
    body_text: req.body_text,
    channel: req.channel,
    channel_metadata: req.metadata ?? null,
  };
  // Use email date if provided for accurate message timestamps
  if (req.message_date) {
    messageData.created_at = req.message_date.toISOString();
  }

  const { error: messageError } = await supabase.from("messages").insert(messageData);

  if (messageError) {
    throw new Error(`Failed to insert message: ${messageError.message}`);
  }

  // Update last_message_at for inbound messages (this is a real customer message, not a draft)
  const messageTimestamp = req.message_date?.toISOString() || new Date().toISOString();
  await supabase
    .from("threads")
    .update({ last_message_at: messageTimestamp })
    .eq("id", threadId);

  // 2.6. HubSpot ticket sync (async, non-blocking)
  if (isHubSpotConfigured() && req.from_identifier) {
    // Create ticket for new threads
    if (!isFollowUp) {
      createTicketForThread({
        threadId,
        subject: req.subject || "(no subject)",
        customerEmail: req.from_identifier,
        state: "NEW",
        initialMessage: req.body_text.slice(0, 500),
      }).catch((err) => console.error("[HubSpot] Ticket creation failed:", err));
    }

    // Add inbound message note
    addActivityNote(threadId, {
      type: "message",
      direction: "inbound",
      from: req.from_identifier,
      body: req.body_text.slice(0, 1000),
      timestamp: req.message_date,
    }).catch((err) => console.error("[HubSpot] Message note failed:", err));
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

  // 2.6. Check for automated emails BEFORE LLM classification to save API calls
  // This catches notifications from Google, Meta, TikTok, etc.
  const automatedCheck = checkAutomatedEmail(req.from_identifier, req.subject);
  if (automatedCheck.isAutomated) {
    const nextState = "RESOLVED";

    console.log(
      `[Ingest] Automated email detected: ${automatedCheck.reason} (${automatedCheck.matchedPattern}) - auto-closing thread ${threadId}`
    );

    await logEvent(threadId, {
      intent: "AUTOMATED_EMAIL",
      confidence: 0.95,
      action: "NO_REPLY",
      draft: null,
      channel: req.channel,
      note: `Auto-closed as automated email: ${automatedCheck.reason}`,
      automatedEmailDetails: {
        reason: automatedCheck.reason,
        matchedPattern: automatedCheck.matchedPattern,
        senderEmail: req.from_identifier,
      },
      stateTransition: { from: currentState, to: nextState, reason: "automated_email_auto_close" },
    });

    await updateThreadState(threadId, nextState, "AUTOMATED_EMAIL");

    return {
      thread_id: threadId,
      message_id: threadId,
      intent: "AUTOMATED_EMAIL",
      confidence: 0.95,
      action: "NO_REPLY",
      draft: null,
      state: nextState,
      previous_state: currentState,
    };
  }

  // 3. Classify intent using LLM-based classification
  let intent: string;
  let confidence: number;
  let classification: ClassificationResult | null = null;

  // Use LLM classification - reclassifyThread for follow-ups, classifyWithLLM for new threads
  if (isLLMConfigured()) {
    if (isFollowUp) {
      // Follow-up message: use reclassifyThread which considers conversation history
      // and properly updates thread_intents (removes UNKNOWN when real intent detected)
      console.log(`[Ingest] Follow-up message on thread ${threadId}, reclassifying...`);
      classification = await reclassifyThread(
        threadId,
        { subject: req.subject, body: req.body_text }
      );
    } else {
      // New thread: use standard classification with conversation context
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

      // Add all detected intents to thread (handles UNKNOWN removal automatically)
      await addIntentsToThread(threadId, classification);
    }

    intent = classification.primary_intent;
    confidence = classification.intents[0]?.confidence || 0.5;

    // Admin email override: never treat rob@squarewheelsauto.com as vendor spam
    // This ensures the boss can communicate with Lina without being filtered out
    if (isAdminEmail && intent === "VENDOR_SPAM") {
      console.log(`[Ingest] Admin email ${senderEmail} classified as VENDOR_SPAM - overriding to UNKNOWN`);
      intent = "UNKNOWN";
      classification.primary_intent = "UNKNOWN";
      // Remove any auto-close behavior
    }

    // Log multi-intent detection
    if (classification.intents.length > 1) {
      console.log(
        `[Ingest] Multi-intent detected for thread ${threadId}:`,
        classification.intents.map((i) => `${i.slug} (${i.confidence})`).join(", ")
      );
    }
  } else {
    // LLM not configured - return UNKNOWN and let humans handle classification
    console.warn(`[Ingest] LLM not configured, returning UNKNOWN for thread ${threadId}`);
    intent = "UNKNOWN";
    confidence = 0.3;
    classification = {
      intents: [{ slug: "UNKNOWN", confidence: 0.3, reasoning: "LLM not configured" }],
      primary_intent: "UNKNOWN",
      requires_verification: false,
      auto_escalate: false,
      missing_info: [],
      can_proceed: false, // Require human review without LLM
    };
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
  // Trust LLM's contextual assessment of whether verification is needed
  // IMPORTANT: Admin/internal emails bypass verification entirely
  const INTERNAL_DOMAINS = ["squarewheelsauto.com"];
  const emailDomain = req.from_identifier?.toLowerCase().split("@")[1];
  const isInternalEmail = INTERNAL_DOMAINS.includes(emailDomain || "");
  // Note: ADMIN_EMAILS and senderEmail already defined above in classification override

  // Skip verification for admin/internal emails - they're the boss, not customers
  const needsVerification =
    !isAdminEmail &&
    !isInternalEmail &&
    (classification?.requires_verification || false);

  let verification: VerificationResult | null = null;
  if (needsVerification) {
    // Include subject line AND body text for order number extraction
    // Order numbers often appear in subject like "Re: Order #1234"
    let messageTextForVerification = `${req.subject}\n\n${req.body_text}`;
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

    // IMPORTANT: After successful verification, update classification to reflect
    // that we now have order context. The original classification was made WITHOUT
    // knowing what order data we'd have - now we know!
    if (verification.status === "verified" && verification.order) {
      // If we have verified order data, the "missing" order info is no longer missing
      // Update can_proceed if the only missing info was order-related
      const orderRelatedFields = ["order_number", "order_info", "product_info", "purchase_date"];
      const nonOrderMissingInfo = classification.missing_info.filter(
        (info) => !orderRelatedFields.some((field) => info.id.toLowerCase().includes(field))
      );

      // If all missing info was order-related and we now have the order, we can proceed
      if (nonOrderMissingInfo.length === 0 && classification.missing_info.length > 0) {
        console.log(
          `[Ingest] Verification provided order context - updating can_proceed from false to true`
        );
        classification.can_proceed = true;
        classification.missing_info = [];
      } else if (nonOrderMissingInfo.length < classification.missing_info.length) {
        // Some order-related info was satisfied, but other info still needed
        console.log(
          `[Ingest] Verification satisfied ${classification.missing_info.length - nonOrderMissingInfo.length} missing fields, ` +
          `${nonOrderMissingInfo.length} still needed: ${nonOrderMissingInfo.map(f => f.id).join(", ")}`
        );
        classification.missing_info = nonOrderMissingInfo;
        // If the remaining missing info is minimal, allow proceeding
        if (nonOrderMissingInfo.every(f => !f.required)) {
          classification.can_proceed = true;
        }
      }
    }
  }

  // 4. Missing info is now detected by LLM classification (classification.can_proceed, classification.missing_info)
  // No regex-based checking needed - the LLM contextually identifies what's missing
  const fullText = `${req.subject}\n${req.body_text}`;

  // 4.5. Check for clarification loop BEFORE generating a new draft
  // If Lina has asked for the same info 2+ times without getting it, escalate
  const clarificationLoop = await detectClarificationLoop(threadId);
  if (clarificationLoop.loopDetected) {
    const nextState = "ESCALATED";

    console.log(
      `[Ingest] Clarification loop detected for thread ${threadId}: ` +
        `asked for "${clarificationLoop.repeatedCategory}" ${clarificationLoop.occurrences} times`
    );

    // Generate clarification loop escalation draft via LLM
    const loopContext: ClarificationLoopContext = {
      purpose: "clarification_loop",
      repeatedQuestion: clarificationLoop.repeatedCategory || undefined,
      occurrences: clarificationLoop.occurrences,
    };
    let loopDraft: string;
    try {
      const loopEmail = await generateContextualEmail(loopContext);
      loopDraft = loopEmail.body;
    } catch {
      loopDraft = `I'm having trouble finding the right answer for you. I've asked Rob, our team lead, to take a look - he'll follow up with you directly.\n\n– Lina`;
    }

    await logEvent(threadId, {
      intent,
      confidence,
      action: "ESCALATE_WITH_DRAFT",
      draft: loopDraft,
      channel: req.channel,
      note: `Clarification loop detected - asked for ${clarificationLoop.repeatedCategory} ${clarificationLoop.occurrences} times`,
      clarificationLoop: {
        repeatedCategory: clarificationLoop.repeatedCategory,
        occurrences: clarificationLoop.occurrences,
        allCounts: clarificationLoop.allCategoryCounts,
      },
      stateTransition: { from: currentState, to: nextState, reason: "clarification_loop_detected" },
    });

    await updateThreadState(threadId, nextState, intent);

    // Save the escalation draft as a message
    await supabase.from("messages").insert({
      thread_id: threadId,
      direction: "outbound",
      body_text: loopDraft,
      role: "draft",
      channel: req.channel,
      channel_metadata: {
        auto_send_blocked: true,
        auto_send_block_reason: "clarification_loop_escalation",
      },
    });

    return {
      thread_id: threadId,
      message_id: threadId,
      intent,
      confidence,
      action: "ESCALATE_WITH_DRAFT",
      draft: loopDraft,
      state: nextState,
      previous_state: currentState,
    };
  }

  // 5. Decide action + generate draft
  let action: Action = "ASK_CLARIFYING_QUESTIONS";
  let draft: string | null = null;
  let policyBlocked = false;
  let draftResult: DraftResult | null = null;

  if (intent === "THANK_YOU_CLOSE") {
    // Customer sent a closing/thank you message - no reply needed
    action = "NO_REPLY";
    const nextState = "RESOLVED";

    await logEvent(threadId, {
      intent,
      confidence,
      action,
      draft: null,
      channel: req.channel,
      note: "Customer closing message - no reply needed",
      stateTransition: { from: currentState, to: nextState, reason: "thank_you_close" },
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
  } else if (intent === "VENDOR_SPAM" || intent === "AUTOMATED_EMAIL") {
    // Auto-close vendor spam and automated emails without reply
    action = "NO_REPLY";
    // Set state to RESOLVED immediately
    const nextState = "RESOLVED";

    const closeReason = intent === "VENDOR_SPAM" ? "vendor_spam_auto_close" : "automated_email_auto_close";
    const noteText = intent === "VENDOR_SPAM" ? "Auto-closed as vendor spam" : "Auto-closed as automated email";

    await logEvent(threadId, {
      intent,
      confidence,
      action,
      draft: null,
      channel: req.channel,
      note: noteText,
      stateTransition: { from: currentState, to: nextState, reason: closeReason },
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
  } else if (!classification.can_proceed && classification.missing_info.length > 0) {
    // Missing required info (detected by LLM) - ask for it
    action = "ASK_CLARIFYING_QUESTIONS";
    // Use specific macro if available, otherwise generate from LLM-detected missing fields
    if (intent === "FIRMWARE_ACCESS_ISSUE") {
      draft = macroFirmwareAccessClarify();
    } else if (intent === "DOCS_VIDEO_MISMATCH") {
      draft = macroDocsVideoMismatch();
    } else {
      draft = generateMissingInfoPromptFromClassification(classification.missing_info);
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
    // Fetch full order timeline including returns/refunds from Shopify
    let orderStatusSummary: string | undefined;
    if (verification?.order?.number) {
      try {
        const orderTimeline = await getOrderTimeline(verification.order.number);
        if (orderTimeline) {
          orderStatusSummary = buildOrderStatusSummary(orderTimeline);
          console.log(`[Ingest] Order timeline for ${verification.order.number}:`, orderStatusSummary);
        }
      } catch (error) {
        console.error("[Ingest] Error fetching order timeline:", error);
      }
    }

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
          // Include full order status summary with return/refund info
          orderStatusSummary,
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

    // Calculate thread age for aged ticket handling
    let threadAge: ThreadAgeContext | undefined;
    if (threadCreatedAt) {
      // Fetch last outbound message date for response gap calculation
      const { data: lastOutbound } = await supabase
        .from("messages")
        .select("created_at")
        .eq("thread_id", threadId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      threadAge = calculateThreadAge(
        threadCreatedAt,
        lastOutbound?.created_at || null
      );

      // Log if this is an aged thread
      if (threadAge.threadAgeDays >= 7 || (threadAge.daysSinceLastResponse && threadAge.daysSinceLastResponse >= 3)) {
        console.log(
          `[Ingest] Aged thread detected: ${threadAge.threadAgeDays} days old, ` +
          `${threadAge.daysSinceLastResponse ?? 0} days since last response`
        );
      }
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
      // Pass thread age for aged ticket handling
      threadAge,
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

  // 6.5. Add escalation notice to customer draft if escalating
  // This tells the customer we're escalating without CC'ing Rob
  if (action === "ESCALATE_WITH_DRAFT") {
    const escalationContext: EscalationContext = {
      purpose: "escalation_notice",
      customerName: undefined, // Name not available in IngestRequest
      existingDraft: draft || undefined,
    };

    try {
      const escalationEmail = await generateContextualEmail(escalationContext);
      draft = escalationEmail.body;
    } catch (err) {
      console.error("[Process] Escalation email generation failed:", err);
      // Fallback to simple escalation notice
      if (draft) {
        draft = draft.replace(/\n*–\s*Lina\s*$/i, "").trim() +
          `\n\nI've also looped in Rob, our team lead, who'll follow up personally to help resolve this.\n\n– Lina`;
      } else {
        draft = `Thanks for reaching out. I've looped in Rob, our team lead, who'll follow up with you directly to help get this sorted.\n\n– Lina`;
      }
    }
  }

  // 6.6. Track promised actions in the draft (non-blocking audit trail)
  // This logs commitments like refunds, shipping promises, etc. for visibility
  if (draft) {
    await trackPromisedActions(threadId, draft);
  }

  // 7. Calculate next state using state machine
  const transitionContext = {
    currentState,
    action,
    intent,
    policyBlocked,
    missingRequiredInfo: !classification.can_proceed,
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
        allPresent: classification.can_proceed,
        missingFields: classification.missing_info.map((f) => f.id),
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

  // 10.1 Update HubSpot ticket stage if state changed
  if (isHubSpotConfigured() && currentState !== nextState) {
    updateTicketStage(threadId, nextState, stateChangeReason || undefined).catch((err) =>
      console.error("[HubSpot] Stage update failed:", err)
    );
  }

  // 10.2 Sync to HubSpot CRM (async, non-blocking)
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
    AUTOMATED_EMAIL: "Automated email",
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

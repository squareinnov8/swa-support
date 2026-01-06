/**
 * Channel-agnostic request processing.
 *
 * This module contains the core business logic for processing support requests
 * from any channel. All channel-specific adapters should normalize their input
 * to IngestRequest and call processIngestRequest().
 */

import { supabase } from "@/lib/db";
import { classifyIntent } from "@/lib/intents/classify";
import { checkRequiredInfo, generateMissingInfoPrompt } from "@/lib/intents/requiredInfo";
import { policyGate } from "@/lib/responders/policyGate";
import { macroDocsVideoMismatch, macroFirmwareAccessClarify } from "@/lib/responders/macros";
import { generateDraft, getConversationHistory, type DraftResult } from "@/lib/llm/draftGenerator";
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
import type { IngestRequest, IngestResult } from "./types";
import { syncInteractionToHubSpot, isHubSpotConfigured } from "@/lib/hubspot";

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

  if (req.external_id) {
    const { data: existing } = await supabase
      .from("threads")
      .select("id, state")
      .eq("external_thread_id", req.external_id)
      .maybeSingle();

    if (existing?.id) {
      threadId = existing.id;
      currentState = (existing.state as ThreadState) || "NEW";
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

  // 3. Classify intent
  const { intent, confidence } = classifyIntent(req.subject, req.body_text);

  // 3.5. Customer verification for protected intents
  let verification: VerificationResult | null = null;
  if (isProtectedIntent(intent)) {
    verification = await verifyCustomer({
      threadId,
      email: req.from_identifier,
      messageText: req.body_text,
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

  // 9. Update thread with new state and intent
  await supabase
    .from("threads")
    .update({
      state: nextState,
      last_intent: intent,
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

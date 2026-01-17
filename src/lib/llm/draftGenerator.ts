/**
 * Draft Generator
 *
 * Orchestrates KB retrieval and LLM draft generation.
 * Produces drafts for admin review before sending.
 */

import { supabase } from "@/lib/db";
import { generate, isLLMConfigured, type GenerateResult } from "./client";
import { buildUserPrompt, buildSystemPromptAsync, NO_KB_FALLBACK_PROMPT, type CustomerContext } from "./prompts";
import { hybridSearch, type SearchResult } from "@/lib/retrieval/search";
import { policyGate } from "@/lib/responders/policyGate";
import { detectVehicle, isProductQuestion, canDoProductLookup } from "@/lib/catalog/vehicleDetector";
import { findProductsByVehicle } from "@/lib/catalog/lookup";
import type { ProductWithFitment } from "@/lib/catalog/types";
import type { Intent } from "@/lib/intents/taxonomy";
import type { Citation, DraftGeneration } from "@/lib/kb/types";
import type { ExtractedAttachmentContent } from "@/lib/attachments";

/**
 * Message from conversation history
 */
export type ConversationMessage = {
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

/**
 * Order data for action-oriented responses
 */
export type OrderContext = {
  orderNumber: string;
  status: string; // PAID, REFUNDED, etc.
  fulfillmentStatus: string; // FULFILLED, UNFULFILLED, etc.
  createdAt: string;
  tracking?: Array<{
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }>;
  lineItems?: Array<{
    title: string;
    quantity: number;
  }>;
  shippingCity?: string;
  shippingState?: string;
  // Full order status summary including returns and refunds
  orderStatusSummary?: string;
};

/**
 * Draft generation input
 */
export type DraftInput = {
  threadId: string;
  messageId?: string;
  customerMessage: string;
  intent: Intent;
  vehicleTag?: string;
  productTag?: string;
  previousMessages?: ConversationMessage[];
  customerInfo?: {
    name?: string;
    email?: string;
    orderNumber?: string;
    vehicle?: string;
    product?: string;
  };
  // Real order data from Shopify for action-oriented responses
  orderContext?: OrderContext;
  // Extracted content from email attachments
  attachmentContent?: ExtractedAttachmentContent[];
  // Extended customer context with order history and support history
  customerContext?: CustomerContext;
};

/**
 * Draft generation result
 */
export type DraftResult = {
  success: boolean;
  draft: string | null;
  rawDraft: string | null;
  citations: Citation[];
  kbDocsUsed: string[];
  kbChunksUsed: string[];
  policyGatePassed: boolean;
  policyViolations: string[];
  promptTokens: number;
  completionTokens: number;
  error?: string;
};

/**
 * Generate a draft response for a customer message
 */
export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const {
    threadId,
    messageId,
    customerMessage,
    intent,
    vehicleTag,
    productTag,
    previousMessages,
    customerInfo,
    orderContext,
    attachmentContent,
    customerContext,
  } = input;

  // Check if LLM is configured
  if (!isLLMConfigured()) {
    return {
      success: false,
      draft: null,
      rawDraft: null,
      citations: [],
      kbDocsUsed: [],
      kbChunksUsed: [],
      policyGatePassed: false,
      policyViolations: [],
      promptTokens: 0,
      completionTokens: 0,
      error: "ANTHROPIC_API_KEY not configured",
    };
  }

  try {
    // 1. Retrieve relevant KB content
    const searchResults = await hybridSearch(
      {
        intent,
        query: customerMessage,
        vehicleTag,
        productTag,
      },
      { limit: 5, minScore: 0.3 }
    );

    // 2. Check for vehicle-specific product questions and do catalog lookup
    let catalogProducts: ProductWithFitment[] = [];
    if (isProductQuestion(customerMessage)) {
      const detectedVehicle = detectVehicle(customerMessage);
      if (canDoProductLookup(detectedVehicle)) {
        catalogProducts = await findProductsByVehicle(
          detectedVehicle.year ?? new Date().getFullYear(),
          detectedVehicle.make!,
          detectedVehicle.model ?? undefined
        );
        console.log(
          `Catalog lookup: Found ${catalogProducts.length} products for ${detectedVehicle.year ?? "any year"} ${detectedVehicle.make} ${detectedVehicle.model ?? ""}`
        );
      }
    }

    // 3. Build prompts (load dynamic instructions from database)
    const systemPrompt = await buildSystemPromptAsync(intent);

    // Format previous messages for context
    const formattedHistory = previousMessages?.map((msg) => {
      const role = msg.direction === "inbound" ? "Customer" : "Agent (Lina)";
      // Truncate long messages to keep prompt manageable
      const body = msg.body.length > 500 ? msg.body.slice(0, 500) + "..." : msg.body;
      return `${role}: ${body}`;
    });

    let userPrompt = buildUserPrompt({
      customerMessage,
      intent,
      kbDocs: searchResults,
      previousMessages: formattedHistory,
      customerInfo,
      catalogProducts: catalogProducts.length > 0 ? catalogProducts : undefined,
      orderContext,
      attachmentContent,
      customerContext,
    });

    // Add fallback note if no KB content found
    if (searchResults.length === 0) {
      userPrompt += "\n\n" + NO_KB_FALLBACK_PROMPT;
    }

    // 4. Generate draft with Claude
    const result = await generate(userPrompt, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 1500,
    });

    const rawDraft = result.content;

    // 5. Extract citations from the draft
    const citations = extractCitations(rawDraft, searchResults);

    // 6. Run policy gate check
    const gate = policyGate(rawDraft);

    // 7. Prepare final draft (null if blocked)
    const finalDraft = gate.ok ? rawDraft : null;

    // 8. Record to database
    const kbDocsUsed = searchResults.map((r) => r.doc.id);
    const kbChunksUsed = searchResults
      .filter((r) => r.chunk)
      .map((r) => r.chunk!.id);

    await recordDraftGeneration({
      threadId,
      messageId,
      intent,
      kbDocsUsed,
      kbChunksUsed,
      rawDraft,
      finalDraft,
      citations,
      policyGatePassed: gate.ok,
      policyViolations: gate.reasons,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
    });

    return {
      success: true,
      draft: finalDraft,
      rawDraft,
      citations,
      kbDocsUsed,
      kbChunksUsed,
      policyGatePassed: gate.ok,
      policyViolations: gate.reasons,
      promptTokens: result.inputTokens,
      completionTokens: result.outputTokens,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    console.error("Draft generation failed:", error);

    return {
      success: false,
      draft: null,
      rawDraft: null,
      citations: [],
      kbDocsUsed: [],
      kbChunksUsed: [],
      policyGatePassed: false,
      policyViolations: [],
      promptTokens: 0,
      completionTokens: 0,
      error,
    };
  }
}

/**
 * Extract citations from draft text
 * Looks for [KB: Document Title] patterns
 */
function extractCitations(draft: string, searchResults: SearchResult[]): Citation[] {
  const citations: Citation[] = [];
  const citationRegex = /\[KB:\s*([^\]]+)\]/g;
  const seen = new Set<string>();

  let match;
  while ((match = citationRegex.exec(draft)) !== null) {
    const title = match[1].trim();

    // Find matching doc
    const result = searchResults.find(
      (r) => r.doc.title.toLowerCase() === title.toLowerCase()
    );

    if (result && !seen.has(result.doc.id)) {
      seen.add(result.doc.id);
      citations.push({
        doc_id: result.doc.id,
        chunk_id: result.chunk?.id,
        title: result.doc.title,
      });
    }
  }

  return citations;
}

/**
 * Record draft generation to database
 */
async function recordDraftGeneration(params: {
  threadId: string;
  messageId?: string;
  intent: Intent;
  kbDocsUsed: string[];
  kbChunksUsed: string[];
  rawDraft: string;
  finalDraft: string | null;
  citations: Citation[];
  policyGatePassed: boolean;
  policyViolations: string[];
  promptTokens: number;
  completionTokens: number;
}): Promise<void> {
  const { error } = await supabase.from("draft_generations").insert({
    thread_id: params.threadId,
    message_id: params.messageId ?? null,
    intent: params.intent,
    kb_docs_used: params.kbDocsUsed,
    kb_chunks_used: params.kbChunksUsed.length > 0 ? params.kbChunksUsed : null,
    llm_provider: "anthropic",
    llm_model: "claude-sonnet-4-20250514",
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens,
    raw_draft: params.rawDraft,
    final_draft: params.finalDraft,
    citations: params.citations.length > 0 ? params.citations : null,
    policy_gate_passed: params.policyGatePassed,
    policy_violations:
      params.policyViolations.length > 0 ? params.policyViolations : null,
    was_sent: false,
    was_edited: false,
  });

  if (error) {
    console.error("Failed to record draft generation:", error.message);
  }
}

/**
 * Get conversation history for a thread
 * Returns the most recent messages (excluding the current one being processed)
 */
export async function getConversationHistory(
  threadId: string,
  limit: number = 6
): Promise<ConversationMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("direction, body_text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit + 1); // Get one extra since we'll exclude the latest inbound

  if (error) {
    console.error("Failed to fetch conversation history:", error.message);
    return [];
  }

  if (!data || data.length <= 1) {
    return []; // No history (only current message)
  }

  // Skip the most recent message (it's the current one being processed)
  // and reverse to chronological order
  return data
    .slice(1)
    .reverse()
    .map((msg) => ({
      direction: msg.direction as "inbound" | "outbound",
      body: msg.body_text || "",
      created_at: msg.created_at,
    }));
}

/**
 * Get draft history for a thread
 */
export async function getDraftHistory(
  threadId: string
): Promise<DraftGeneration[]> {
  const { data, error } = await supabase
    .from("draft_generations")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch draft history: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Mark a draft as sent
 */
export async function markDraftAsSent(
  draftId: string,
  wasEdited: boolean = false,
  editDistance?: number
): Promise<void> {
  const { error } = await supabase
    .from("draft_generations")
    .update({
      was_sent: true,
      was_edited: wasEdited,
      edit_distance: editDistance ?? null,
    })
    .eq("id", draftId);

  if (error) {
    throw new Error(`Failed to mark draft as sent: ${error.message}`);
  }
}

/**
 * LLM Prompts
 *
 * System and user prompts for draft generation.
 * Loads dynamic instructions from database with fallback to static defaults.
 */

import type { Intent } from "@/lib/intents/taxonomy";
import type { KBDoc, KBChunk } from "@/lib/kb/types";
import type { ProductWithFitment } from "@/lib/catalog/types";
import { getInstructionsAsPrompt, getIntentInstructions } from "@/lib/instructions";

/**
 * Static fallback system prompt (used if database unavailable)
 */
export const SYSTEM_PROMPT_FALLBACK = `You are a helpful customer support agent for SquareWheels, a hardware company that makes automotive tuning products like APEX.

## CRITICAL RULES - NEVER VIOLATE:
1. NEVER promise refunds, replacements, or specific shipping times
2. NEVER use phrases like "we guarantee", "we will refund", "we will replace", "I promise"
3. NEVER speculate about order status without having an order number
4. NEVER provide legal advice or make safety claims
5. NEVER make up information that isn't in the provided KB context
6. NEVER discuss competitor products

## RESPONSE FORMAT:
- Be friendly but professional
- Keep responses concise (2-4 paragraphs max)
- Sign off with "– Rob"
- Ask clarifying questions when information is missing
- If you can't help, say so honestly and suggest escalation

## CITATIONS:
When using information from the knowledge base, cite it inline like this: [KB: Document Title]
Always cite your sources when providing specific instructions or policies.

If you cannot fully answer based on the provided context, acknowledge the limitation and suggest the customer contact support for further assistance.`;

// Cache for dynamic instructions (refresh every 5 minutes)
let cachedInstructions: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get system prompt - loads from database with caching
 */
export async function getSystemPrompt(): Promise<string> {
  const now = Date.now();

  // Return cached if fresh
  if (cachedInstructions && now - cacheTimestamp < CACHE_TTL) {
    return cachedInstructions;
  }

  // Load from database
  try {
    cachedInstructions = await getInstructionsAsPrompt();
    cacheTimestamp = now;
    return cachedInstructions;
  } catch (error) {
    console.warn("Failed to load instructions from database:", error);
    return SYSTEM_PROMPT_FALLBACK;
  }
}

/**
 * Clear instruction cache (call after updates)
 */
export function clearInstructionCache(): void {
  cachedInstructions = null;
  cacheTimestamp = 0;
}

// Keep SYSTEM_PROMPT for backwards compatibility
export const SYSTEM_PROMPT = SYSTEM_PROMPT_FALLBACK;

/**
 * Build user prompt with KB context
 */
export function buildUserPrompt(params: {
  customerMessage: string;
  intent: Intent;
  kbDocs: { doc: KBDoc; chunk?: KBChunk; score: number }[];
  previousMessages?: string[];
  customerInfo?: {
    name?: string;
    email?: string;
    orderNumber?: string;
    vehicle?: string;
    product?: string;
  };
  catalogProducts?: ProductWithFitment[];
}): string {
  const { customerMessage, intent, kbDocs, previousMessages, customerInfo, catalogProducts } = params;

  let prompt = "";

  // Add customer context if available
  if (customerInfo) {
    prompt += "## Customer Context:\n";
    if (customerInfo.name) prompt += `- Name: ${customerInfo.name}\n`;
    if (customerInfo.email) prompt += `- Email: ${customerInfo.email}\n`;
    if (customerInfo.orderNumber) prompt += `- Order #: ${customerInfo.orderNumber}\n`;
    if (customerInfo.vehicle) prompt += `- Vehicle: ${customerInfo.vehicle}\n`;
    if (customerInfo.product) prompt += `- Product: ${customerInfo.product}\n`;
    prompt += "\n";
  }

  // Add intent classification
  prompt += `## Classified Intent: ${intent}\n\n`;

  // Add KB context
  if (kbDocs.length > 0) {
    prompt += "## Relevant Knowledge Base Articles:\n\n";
    for (const { doc, chunk, score } of kbDocs) {
      prompt += `### [${doc.title}] (relevance: ${(score * 100).toFixed(0)}%)\n`;
      if (chunk) {
        prompt += chunk.content + "\n\n";
      } else {
        // Use first 500 chars of body if no chunk
        prompt += doc.body.slice(0, 500) + (doc.body.length > 500 ? "..." : "") + "\n\n";
      }
    }
  } else {
    prompt += "## Note: No relevant KB articles found for this query.\n\n";
  }

  // Add catalog products if available
  if (catalogProducts && catalogProducts.length > 0) {
    prompt += "## Compatible Products from Catalog:\n\n";
    for (const product of catalogProducts) {
      const priceStr =
        product.price_min === product.price_max
          ? `$${product.price_min}`
          : `$${product.price_min}-$${product.price_max}`;
      prompt += `### ${product.title}\n`;
      prompt += `- Fitment: ${product.fitment_make} ${product.fitment_model ?? ""} (${product.fitment_years})\n`;
      prompt += `- Price: ${priceStr}\n`;
      prompt += `- URL: https://squarewheelsauto.com/products/${product.handle}\n\n`;
    }
    prompt += "When recommending products, include the product URL so the customer can view/purchase directly.\n\n";
  }

  // Add conversation history if available
  if (previousMessages && previousMessages.length > 0) {
    prompt += "## Conversation History:\n";
    prompt += "(Review this to understand context and adapt your response)\n\n";
    for (const msg of previousMessages.slice(-5)) {
      // Last 5 messages for better context
      prompt += `${msg}\n\n`;
    }
    prompt += `**Note**: If the customer is asking the same question repeatedly, try explaining differently, use simpler language, or ask what specifically is unclear. If they seem frustrated, acknowledge it.\n\n`;
  }

  // Add the customer message
  prompt += `## Customer Message:\n${customerMessage}\n\n`;

  // Add instruction
  prompt += `## Task:
Write a helpful, professional response to the customer's message. Use the KB context to provide accurate information. Remember to:
1. Address their specific concern
2. Cite KB sources when using specific information
3. Ask clarifying questions if needed
4. Never make promises about refunds, replacements, or timelines
5. Sign off with "– Rob"`;

  return prompt;
}

/**
 * Intent-specific prompt additions
 */
export const INTENT_PROMPTS: Partial<Record<Intent, string>> = {
  FIRMWARE_UPDATE_REQUEST: `
Focus on providing clear, step-by-step firmware update instructions.
If the customer mentions a specific error, address that directly.
Ask about their device serial number if troubleshooting is needed.`,

  FIRMWARE_ACCESS_ISSUE: `
The customer is having trouble accessing firmware updates.
Common causes: expired license, wrong account, connectivity issues.
Ask for their email and APEX serial number to verify access.`,

  RETURN_REFUND_REQUEST: `
Acknowledge their return or refund request professionally.
Explain the return/refund process from the KB.
NEVER promise the return/refund will be approved - that's for the returns/finance team to decide.
Ask for their order number if not provided.`,

  CHARGEBACK_THREAT: `
This is a sensitive escalation situation.
Acknowledge their frustration professionally.
DO NOT argue or make defensive statements.
Ask for their order number and summarize the situation.
This will be reviewed by a human.`,

  THANK_YOU_CLOSE: `
The customer is expressing thanks or closing the conversation.
A brief, warm response is appropriate.
No need for lengthy instructions.`,

  DOCS_VIDEO_MISMATCH: `
The customer noticed a discrepancy in documentation.
Thank them for bringing it to attention.
Provide the correct current information from KB.
Mention that documentation will be reviewed.`,

  UNKNOWN: `
This is a general question without a specific category.
Use the KB context to provide helpful information.
If the question is outside our scope, politely redirect.`,
};

/**
 * Get intent-specific prompt addition
 */
export function getIntentPromptAddition(intent: Intent): string {
  return INTENT_PROMPTS[intent] ?? "";
}

/**
 * Build complete system prompt with intent context (async - loads from database)
 */
export async function buildSystemPromptAsync(intent: Intent): Promise<string> {
  const basePrompt = await getSystemPrompt();
  const intentAddition = await getIntentInstructions(intent);

  if (intentAddition) {
    return `${basePrompt}\n\n## Intent-Specific Guidance:\n${intentAddition}`;
  }

  return basePrompt;
}

/**
 * Build complete system prompt with intent context (sync fallback)
 * @deprecated Use buildSystemPromptAsync for dynamic instructions
 */
export function buildSystemPrompt(intent: Intent): string {
  const intentAddition = getIntentPromptAddition(intent);

  if (intentAddition) {
    return `${SYSTEM_PROMPT}\n\n## Intent-Specific Guidance:\n${intentAddition}`;
  }

  return SYSTEM_PROMPT;
}

/**
 * Prompt for when no KB content is found
 */
export const NO_KB_FALLBACK_PROMPT = `
I don't have specific documentation about this topic in my knowledge base.

Please respond by:
1. Acknowledging the customer's question
2. Letting them know you'll need to research this further
3. Asking for any additional details that might help
4. Suggesting they can also reach out directly to support@squarewheels.com

Be honest about the limitation while remaining helpful.`;

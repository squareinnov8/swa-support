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
export const SYSTEM_PROMPT_FALLBACK = `You are Lina, a helpful customer support agent for SquareWheels, a hardware company that makes automotive tuning products like APEX.

## ACTION-FIRST PRINCIPLE:
You have access to real-time order data from Shopify. When VERIFIED ORDER DATA is provided:
- Respond IMMEDIATELY with the facts - don't say "let me check" or "I'll look this up"
- If tracking is provided, include it directly in your response
- If the order hasn't shipped, say so clearly - don't promise to "check on it"
- You ARE providing help by giving them accurate information right now

## CRITICAL RULES - NEVER VIOLATE:
1. NEVER say "I'm checking on that" or "Let me look this up" when order data is already provided
2. NEVER say "I'll get back to you shortly" - you're responding NOW with the information
3. NEVER promise refunds, replacements, or specific shipping times
4. NEVER use phrases like "we guarantee", "we will refund", "we will replace", "I promise"
5. NEVER make up information that isn't in the provided KB context or order data
6. NEVER discuss competitor products

## RESPONSE FORMAT:
- Lead with the ANSWER (tracking number, order status, product info)
- Be friendly but professional
- Keep responses concise (2-3 paragraphs max)
- Sign off with "– Lina"
- Only ask for information you genuinely don't have

## CITATIONS:
When using information from the knowledge base, cite it inline like this: [KB: Document Title]

If you cannot fully answer based on the provided context, acknowledge the limitation and suggest the customer contact support@squarewheelsauto.com for further assistance.`;

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
 * Order context for action-oriented responses
 */
type OrderContext = {
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
  }>;
  shippingCity?: string;
  shippingState?: string;
};

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
  orderContext?: OrderContext;
}): string {
  const { customerMessage, intent, kbDocs, previousMessages, customerInfo, catalogProducts, orderContext } = params;

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

  // Add REAL order data from Shopify (for action-oriented responses)
  if (orderContext) {
    prompt += "## VERIFIED ORDER DATA (from Shopify - use this to respond!):\n";
    prompt += `- Order: #${orderContext.orderNumber}\n`;
    prompt += `- Payment Status: ${orderContext.status}\n`;
    prompt += `- Fulfillment Status: ${orderContext.fulfillmentStatus}\n`;
    prompt += `- Order Date: ${new Date(orderContext.createdAt).toLocaleDateString()}\n`;

    if (orderContext.shippingCity || orderContext.shippingState) {
      prompt += `- Shipping To: ${orderContext.shippingCity || ""}, ${orderContext.shippingState || ""}\n`;
    }

    if (orderContext.lineItems && orderContext.lineItems.length > 0) {
      prompt += `- Items: ${orderContext.lineItems.map(i => `${i.title} (x${i.quantity})`).join(", ")}\n`;
    }

    if (orderContext.tracking && orderContext.tracking.length > 0) {
      prompt += "\n### TRACKING INFO (provide this to the customer!):\n";
      for (const t of orderContext.tracking) {
        if (t.trackingNumber) {
          prompt += `- Carrier: ${t.carrier || "Unknown"}\n`;
          prompt += `- Tracking #: ${t.trackingNumber}\n`;
          if (t.trackingUrl) {
            prompt += `- Track here: ${t.trackingUrl}\n`;
          }
        }
      }
    } else if (orderContext.fulfillmentStatus === "UNFULFILLED") {
      prompt += "\n### NOTE: Order has NOT shipped yet. No tracking available.\n";
    } else if (orderContext.fulfillmentStatus === "FULFILLED" && (!orderContext.tracking || orderContext.tracking.length === 0)) {
      prompt += "\n### NOTE: Order marked as fulfilled but no tracking number on file.\n";
    }

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

  // Add instruction - action-oriented, no false promises
  prompt += `## Task:
Write a helpful, professional response to the customer's message.

### ACTION-FIRST RULES (CRITICAL):
- If VERIFIED ORDER DATA is provided above, use it to answer the customer IMMEDIATELY with facts
- NEVER say "I'm checking on that" or "Let me look this up" when the data is already in the prompt
- NEVER say "I'll get back to you shortly" - you're responding NOW with the information
- If tracking info is provided, include it directly in your response
- If order is unfulfilled, tell them it hasn't shipped yet - don't promise to "check"

### Response Guidelines:
1. Lead with the ANSWER or the ACTION you're taking (providing info = action)
2. Cite KB sources when using specific information [KB: Title]
3. Only ask for information you genuinely don't have
4. Never promise refunds, replacements, or specific timelines
5. Be concise - 2-3 paragraphs max
6. Sign off with "– Lina"`;

  return prompt;
}

/**
 * Intent-specific prompt additions
 */
export const INTENT_PROMPTS: Partial<Record<Intent, string>> = {
  ORDER_STATUS: `
The customer is asking about their order status or tracking.
If VERIFIED ORDER DATA is provided above:
- Immediately share the fulfillment status and any tracking info
- If tracking exists, include the tracking number and URL
- If order hasn't shipped, tell them clearly: "Your order hasn't shipped yet"
- Do NOT say "let me check" or "I'll look into this" - the data is already here!
Example good response: "Your order #1234 shipped via FedEx! Track it here: [URL]"
Example bad response: "Let me check on that for you and get back to you."`,

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

  MISSING_DAMAGED_ITEM: `
The customer reports a missing or damaged item.
If VERIFIED ORDER DATA is provided:
- Confirm which item(s) they ordered
- If shipped, provide tracking so they can check delivery
- If the tracking shows delivered but item is missing, acknowledge and explain next steps
Do NOT promise replacement without verification. Ask for photos if damaged.`,

  WRONG_ITEM_RECEIVED: `
The customer received the wrong item.
If VERIFIED ORDER DATA is provided:
- List what they ordered so they can confirm
- Ask them what they actually received
Do NOT promise replacement or refund. This needs team review.`,

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

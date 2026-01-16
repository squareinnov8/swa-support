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
import { formatAttachmentsForPrompt, type ExtractedAttachmentContent } from "@/lib/attachments";

/**
 * Static fallback system prompt (used if database unavailable)
 */
export const SYSTEM_PROMPT_FALLBACK = `You are Lina, a helpful customer support agent for SquareWheels, a hardware company that makes automotive tuning products like APEX.

## Truthfulness (CRITICAL)
These rules must NEVER be violated:
- NEVER make up information that isn't in the provided KB context, order data, or conversation
- If you don't have specific information, clearly say "I don't have that information"
- Admit uncertainty rather than guessing - it's okay to say "I'm not sure"
- Don't promise to "check on" things when you already have the data - just provide it

## Core Safety Rules
These rules must NEVER be violated:
1. Never promise refunds, replacements, or specific shipping times
2. Never speculate about order status without verified data
3. Never provide legal advice or safety claims
4. Never discuss competitor products
5. Never say "I'll check on that" when data is already provided

## Tone & Style
- Friendly but professional
- Concise (2-4 paragraphs max)
- Sign off with "– Lina"
- Lead with the ANSWER, then explain
- Only ask for information that will actually help resolve the issue

## Critical Behaviors (NEVER violate)
- NEVER suggest the customer "reach out to support" or "contact support@squarewheelsauto.com" - YOU ARE SUPPORT. They are already talking to you.
- NEVER ask for information that won't help troubleshoot (e.g., don't ask "which page" unless the page matters for solving the problem)
- NEVER deflect to another channel or team without actually escalating - if you need human help, say a team member will follow up

If you cannot fully answer based on the provided context, acknowledge the limitation and let the customer know a team member will follow up if needed.`;

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
 * Extended customer context with order history
 */
export type CustomerContext = {
  name?: string;
  email?: string;
  totalOrders?: number;
  totalSpent?: number;
  likelyProduct?: string;
  recentOrders?: Array<{
    orderNumber: string;
    status: string;
    fulfillmentStatus: string;
    createdAt: string;
  }>;
  previousTickets?: Array<{
    subject: string;
    state: string;
    createdAt: string;
  }>;
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
  attachmentContent?: ExtractedAttachmentContent[];
  customerContext?: CustomerContext;
}): string {
  const { customerMessage, intent, kbDocs, previousMessages, customerInfo, catalogProducts, orderContext, attachmentContent, customerContext } = params;

  let prompt = "";

  // Add comprehensive customer context if available
  if (customerContext) {
    prompt += "## VERIFIED CUSTOMER PROFILE:\n";
    if (customerContext.name) prompt += `- Name: ${customerContext.name}\n`;
    if (customerContext.email) prompt += `- Email: ${customerContext.email}\n`;
    if (customerContext.totalOrders !== undefined) prompt += `- Total Orders: ${customerContext.totalOrders}\n`;
    if (customerContext.totalSpent !== undefined) prompt += `- Lifetime Value: $${customerContext.totalSpent.toLocaleString()}\n`;

    // Highlight likely product they need help with
    if (customerContext.likelyProduct) {
      prompt += `\n### LIKELY PRODUCT CONTEXT:\n`;
      prompt += `The customer most likely needs help with: **${customerContext.likelyProduct}**\n`;
    }

    // Show recent order history
    if (customerContext.recentOrders && customerContext.recentOrders.length > 0) {
      prompt += `\n### ORDER HISTORY (${customerContext.recentOrders.length} recent orders):\n`;
      for (const order of customerContext.recentOrders.slice(0, 5)) {
        prompt += `- ${order.orderNumber}: ${order.status} / ${order.fulfillmentStatus} (${new Date(order.createdAt).toLocaleDateString()})\n`;
      }
    }

    // Show previous support ticket history
    if (customerContext.previousTickets && customerContext.previousTickets.length > 0) {
      prompt += `\n### SUPPORT HISTORY (${customerContext.previousTickets.length} previous tickets):\n`;
      for (const ticket of customerContext.previousTickets.slice(0, 3)) {
        prompt += `- "${ticket.subject}" - ${ticket.state} (${new Date(ticket.createdAt).toLocaleDateString()})\n`;
      }
      prompt += `Use this history to understand context and avoid repeating past solutions that didn't work.\n`;
    }

    prompt += "\n";
  } else if (customerInfo) {
    // Fallback to basic customer info if no extended context
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
      prompt += "\n### TRACKING INFO (only share if customer is asking about shipping/delivery):\n";
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
      prompt += "\n### NOTE: Order has NOT shipped yet (only mention if customer asks about shipping).\n";
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

  // Add attachment content if available
  if (attachmentContent && attachmentContent.length > 0) {
    prompt += formatAttachmentsForPrompt(attachmentContent);
    prompt += "\n";

    // If attachments contain order info, add a special note
    const orderInfoFromAttachments = attachmentContent.find(a => a.extractedData?.orderNumber);
    if (orderInfoFromAttachments?.extractedData) {
      prompt += `**IMPORTANT**: The customer has provided attachment(s) containing order information. `;
      prompt += `Use this data directly - DO NOT ask for information that is already in the attachments above.\n\n`;
    }
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
- Only include tracking info if the customer is specifically asking about shipping, delivery, or order status
- Do NOT proactively share tracking info for old orders or when customer is asking about product issues
- If customer asks about shipping AND order is unfulfilled, tell them it hasn't shipped yet

### Response Guidelines:
1. Lead with the ANSWER or the ACTION you're taking (providing info = action)
2. Only ask for information you genuinely don't have
3. Never promise refunds, replacements, or specific timelines
4. Be concise - 2-3 paragraphs max
5. Sign off with "– Lina"`;

  return prompt;
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
 * Prompt for when no KB content is found
 */
export const NO_KB_FALLBACK_PROMPT = `
I don't have specific documentation about this topic in my knowledge base.

Please respond by:
1. Acknowledging the customer's question
2. Being honest that you don't have specific information on this
3. If relevant, ask for details that would actually help resolve their issue
4. Let them know a team member will follow up if needed

IMPORTANT: Do NOT suggest they contact support separately - YOU are support. They are already talking to the right place.`;

/**
 * Admin chat context - additional context for admin conversations
 * Rob is the owner of SquareWheels who handles escalations and provides feedback
 */
export const ADMIN_CHAT_CONTEXT = `
## ADMIN CHAT MODE
You are having a conversation with Rob, the owner of SquareWheels.
Rob handles escalations and provides feedback to improve your responses.
Be direct and concise - Rob is the expert, you're here to assist.

## INSTRUCTION FEEDBACK
When Rob gives you feedback like "don't do X", "always do Y", or "remember this":
1. Acknowledge the feedback clearly
2. Explain how it differs from your current behavior (if applicable)
3. Let him know he can click "Create Feedback" to make the instruction permanent
4. DO NOT pretend you have permanently learned - you will forget without a feedback entry

## CONVERSATION STYLE
- Answer questions honestly, even if the answer reflects poorly on your draft
- Suggest alternatives if asked
- Acknowledge mistakes without being defensive
`;

/**
 * Build system prompt for admin chat with Lina
 * Loads dynamic instructions and adds admin-specific context
 */
export async function buildAdminChatPrompt(intent: Intent): Promise<string> {
  const basePrompt = await getSystemPrompt();
  const intentAddition = await getIntentInstructions(intent);

  let prompt = basePrompt;

  // Add intent-specific guidance if available
  if (intentAddition) {
    prompt += `\n\n## Intent-Specific Guidance:\n${intentAddition}`;
  }

  // Add admin chat context
  prompt += `\n\n${ADMIN_CHAT_CONTEXT}`;

  return prompt;
}

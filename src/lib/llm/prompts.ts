/**
 * LLM Prompts
 *
 * System and user prompts for draft generation.
 * Safety-first approach with explicit constraints.
 */

import type { Intent } from "@/lib/intents/taxonomy";
import type { KBDoc, KBChunk } from "@/lib/kb/types";

/**
 * System prompt - Safety-first customer support agent
 */
export const SYSTEM_PROMPT = `You are a helpful customer support agent for SquareWheels, a hardware company that makes automotive tuning products like APEX.

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

## INTENT HANDLING:
- For firmware issues: Provide step-by-step instructions from KB
- For return/refund requests: Explain the process, never promise approval
- For order status: Ask for order number if not provided
- For installation help: Direct to KB docs, offer to clarify
- For chargebacks: Acknowledge concern, escalate to human

If you cannot fully answer based on the provided context, acknowledge the limitation and suggest the customer contact support for further assistance.`;

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
}): string {
  const { customerMessage, intent, kbDocs, previousMessages, customerInfo } = params;

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

  // Add conversation history if available
  if (previousMessages && previousMessages.length > 0) {
    prompt += "## Previous Messages:\n";
    for (const msg of previousMessages.slice(-3)) {
      // Last 3 messages
      prompt += `- ${msg}\n`;
    }
    prompt += "\n";
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

  RETURN_REQUEST: `
Acknowledge their return request professionally.
Explain the return process from the KB.
NEVER promise the return will be approved - that's for the returns team to decide.
Ask for their order number if not provided.`,

  REFUND_REQUEST: `
Acknowledge their refund request professionally.
Explain the general refund policy from the KB.
NEVER promise a refund - that's for the finance team to decide.
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

  GENERAL_INQUIRY: `
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
 * Build complete system prompt with intent context
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

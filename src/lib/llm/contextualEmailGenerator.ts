/**
 * Contextual Email Generator
 *
 * Generates natural, human-sounding emails using LLM for all communication scenarios.
 * Replaces hardcoded templates with context-aware generation that follows agent instructions.
 */

import { generate, isLLMConfigured } from "./client";
import { getInstructionSection } from "@/lib/instructions";

export type EmailPurpose =
  | "customer_outreach"      // Asking customer for info (photos, color choice, etc.)
  | "vendor_forward"         // Forwarding customer responses to vendor
  | "escalation_notice"      // Notifying customer about escalation to human
  | "stale_thread_return"    // Apologizing for delay and re-engaging
  | "order_confirmation"     // Confirming order details or selections
  | "general_update"         // General status update
  | "clarification_loop";    // Escalating due to repeated clarification requests

export interface CustomerOutreachContext {
  purpose: "customer_outreach";
  customerName: string;
  orderNumber: string;
  productTitle: string;
  requests: Array<{
    type: string;
    description: string;
    options?: string[];
  }>;
}

export interface VendorForwardContext {
  purpose: "vendor_forward";
  orderNumber: string;
  vendorName: string;
  responses: Array<{
    type: string;
    answer?: string;
    hasAttachments?: boolean;
    attachmentCount?: number;
  }>;
}

export interface EscalationContext {
  purpose: "escalation_notice";
  customerName?: string;
  reason?: string;
  existingDraft?: string;
}

export interface StaleThreadContext {
  purpose: "stale_thread_return";
  customerName?: string;
  daysSinceLastMessage: number;
  originalIssue?: string;
  conversationHistory?: string[];
}

export interface OrderConfirmationContext {
  purpose: "order_confirmation";
  customerName: string;
  orderNumber: string;
  selections?: Record<string, string>;
  nextSteps?: string;
}

export interface GeneralUpdateContext {
  purpose: "general_update";
  customerName?: string;
  updateType: string;
  details: string;
}

export interface ClarificationLoopContext {
  purpose: "clarification_loop";
  customerName?: string;
  repeatedQuestion?: string;
  occurrences?: number;
}

export type EmailContext =
  | CustomerOutreachContext
  | VendorForwardContext
  | EscalationContext
  | StaleThreadContext
  | OrderConfirmationContext
  | GeneralUpdateContext
  | ClarificationLoopContext;

export interface GeneratedEmail {
  subject: string;
  body: string;
}

/**
 * Generate a contextual email using LLM
 */
export async function generateContextualEmail(
  context: EmailContext
): Promise<GeneratedEmail> {
  if (!isLLMConfigured()) {
    console.warn("[ContextualEmail] LLM not configured, using minimal fallback");
    return getFallbackEmail(context);
  }

  try {
    // Load agent instructions for tone/style
    const [toneSection, personaSection] = await Promise.all([
      getInstructionSection("tone_style"),
      getInstructionSection("persona"),
    ]);
    const toneStyle = toneSection?.content || "";
    const persona = personaSection?.content || "";

    const systemPrompt = buildSystemPrompt(persona, toneStyle, context.purpose);
    const userPrompt = buildUserPrompt(context);

    const result = await generate(userPrompt, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 800,
    });

    return parseEmailResponse(result.content, context);
  } catch (error) {
    console.error("[ContextualEmail] LLM generation failed:", error);
    return getFallbackEmail(context);
  }
}

function buildSystemPrompt(persona: string, toneStyle: string, purpose: EmailPurpose): string {
  const purposeGuidance = getPurposeGuidance(purpose);

  return `You are Lina, a customer support specialist at SquareWheels Auto.

${persona}

## Tone & Style
${toneStyle}

## Current Task
${purposeGuidance}

## Output Format
Respond with a JSON object containing "subject" and "body" fields.
- Subject should be concise and clear (no "Re:" prefix unless replying)
- Body should be the email content, naturally written
- Always sign off as "– Lina" (with the en-dash)
- Keep it concise - 2-3 short paragraphs max
- Sound like a real person, not a form letter

Example output:
{"subject": "Quick question about your order", "body": "Hi [name],\\n\\n[message]\\n\\n– Lina"}`;
}

function getPurposeGuidance(purpose: EmailPurpose): string {
  switch (purpose) {
    case "customer_outreach":
      return `You're reaching out to a customer because the vendor needs more information to fulfill their order.
- Be warm and helpful, not demanding
- Explain WHY we need the info (vendor needs it to build their custom product)
- Make it easy for them to respond
- If asking for photos, be specific about what kind of photo helps`;

    case "vendor_forward":
      return `You're forwarding customer information to a vendor (internal communication).
- Be professional and concise
- Clearly present the information they need
- This is B2B communication - can be more direct
- Sign as "SquareWheels Auto" not "– Lina"`;

    case "escalation_notice":
      return `You're letting a customer know their issue has been escalated to Rob (team lead).
- Reassure them they're in good hands
- Don't make it sound like a problem - it's getting extra attention
- If there's an existing draft, incorporate the escalation naturally at the end`;

    case "stale_thread_return":
      return `You're re-engaging with a customer after a delay (their ticket sat without response).
- Apologize genuinely for the delay - don't make excuses
- Acknowledge their patience
- Ask if the issue is still relevant or if anything has changed
- Show urgency to help them now`;

    case "order_confirmation":
      return `You're confirming order details or customer selections.
- Be clear about what was confirmed
- Mention next steps if applicable
- Keep it brief and positive`;

    case "general_update":
      return `You're providing a general update to the customer.
- Be clear and concise
- Lead with the key information
- Explain any implications or next steps`;

    case "clarification_loop":
      return `You've been going back and forth with this customer and haven't been able to help them.
- Be honest that you're struggling to find the right answer
- Don't blame the customer or make them feel bad
- Let them know Rob (team lead) will follow up personally
- Keep it brief and humble - one short paragraph`;
  }
}

function buildUserPrompt(context: EmailContext): string {
  switch (context.purpose) {
    case "customer_outreach":
      return buildCustomerOutreachPrompt(context);
    case "vendor_forward":
      return buildVendorForwardPrompt(context);
    case "escalation_notice":
      return buildEscalationPrompt(context);
    case "stale_thread_return":
      return buildStaleThreadPrompt(context);
    case "order_confirmation":
      return buildOrderConfirmationPrompt(context);
    case "general_update":
      return buildGeneralUpdatePrompt(context);
    case "clarification_loop":
      return buildClarificationLoopPrompt(context);
  }
}

function buildCustomerOutreachPrompt(ctx: CustomerOutreachContext): string {
  const requestList = ctx.requests.map(r => {
    let item = `- ${r.description}`;
    if (r.options && r.options.length > 0) {
      item += ` (options: ${r.options.join(", ")})`;
    }
    return item;
  }).join("\n");

  return `Write an email to ${ctx.customerName || "the customer"} about their Order #${ctx.orderNumber} for a ${ctx.productTitle}.

The vendor needs the following information to fulfill their order:
${requestList}

Generate a friendly, natural email asking for this information. Make it feel personal, not like a form letter.`;
}

function buildVendorForwardPrompt(ctx: VendorForwardContext): string {
  const responseList = ctx.responses.map(r => {
    if (r.answer) {
      return `- ${r.type}: ${r.answer}`;
    }
    if (r.hasAttachments) {
      return `- ${r.type}: See attached (${r.attachmentCount || 1} file(s))`;
    }
    return `- ${r.type}: Provided`;
  }).join("\n");

  return `Write an internal email to ${ctx.vendorName} with the customer's response for Order #${ctx.orderNumber}.

Customer provided:
${responseList}

Keep it professional and to the point. This is vendor communication.`;
}

function buildEscalationPrompt(ctx: EscalationContext): string {
  let prompt = `Write an email to ${ctx.customerName || "the customer"} letting them know their issue has been escalated to Rob, our team lead, for personal attention.`;

  if (ctx.reason) {
    prompt += `\n\nReason for escalation: ${ctx.reason}`;
  }

  if (ctx.existingDraft) {
    prompt += `\n\nThere's an existing draft response. Incorporate the escalation notice naturally at the end:\n\n${ctx.existingDraft}`;
  }

  return prompt;
}

function buildStaleThreadPrompt(ctx: StaleThreadContext): string {
  let prompt = `Write an email to ${ctx.customerName || "the customer"} apologizing for a ${ctx.daysSinceLastMessage}-day delay in responding to their support request.`;

  if (ctx.originalIssue) {
    prompt += `\n\nTheir original issue was about: ${ctx.originalIssue}`;
  }

  if (ctx.conversationHistory && ctx.conversationHistory.length > 0) {
    prompt += `\n\nConversation context:\n${ctx.conversationHistory.slice(-3).join("\n")}`;
  }

  prompt += "\n\nAsk if the issue is still relevant and show urgency to help.";

  return prompt;
}

function buildOrderConfirmationPrompt(ctx: OrderConfirmationContext): string {
  let prompt = `Write an email to ${ctx.customerName} confirming their selections for Order #${ctx.orderNumber}.`;

  if (ctx.selections && Object.keys(ctx.selections).length > 0) {
    const selectionList = Object.entries(ctx.selections)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
    prompt += `\n\nConfirmed selections:\n${selectionList}`;
  }

  if (ctx.nextSteps) {
    prompt += `\n\nNext steps: ${ctx.nextSteps}`;
  }

  return prompt;
}

function buildGeneralUpdatePrompt(ctx: GeneralUpdateContext): string {
  return `Write an email to ${ctx.customerName || "the customer"} with the following update:

Type: ${ctx.updateType}
Details: ${ctx.details}`;
}

function buildClarificationLoopPrompt(ctx: ClarificationLoopContext): string {
  let prompt = `Write a brief email to ${ctx.customerName || "the customer"} letting them know you're having trouble finding the right answer for them.`;

  if (ctx.repeatedQuestion) {
    prompt += `\n\nYou've asked about "${ctx.repeatedQuestion}" multiple times but haven't been able to resolve their issue.`;
  }

  prompt += `\n\nLet them know Rob (team lead) will follow up personally to help. Keep it humble and brief.`;

  return prompt;
}

function parseEmailResponse(content: string, context: EmailContext): GeneratedEmail {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content);
    if (parsed.subject && parsed.body) {
      return {
        subject: parsed.subject,
        body: parsed.body,
      };
    }
  } catch {
    // Not valid JSON - try to extract from text
  }

  // Fallback: try to extract subject and body from text
  const subjectMatch = content.match(/subject[:\s]+["']?([^"'\n]+)["']?/i);
  const bodyMatch = content.match(/body[:\s]+["']?([\s\S]+?)["']?$/i);

  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  }

  // Last resort: use content as body with generated subject
  return {
    subject: getDefaultSubject(context),
    body: content.includes("– Lina") ? content : content + "\n\n– Lina",
  };
}

function getDefaultSubject(context: EmailContext): string {
  switch (context.purpose) {
    case "customer_outreach":
      return `Quick question about your Order #${(context as CustomerOutreachContext).orderNumber}`;
    case "vendor_forward":
      return `Customer response - Order #${(context as VendorForwardContext).orderNumber}`;
    case "escalation_notice":
      return "Your support request - personal attention";
    case "stale_thread_return":
      return "Following up on your support request";
    case "order_confirmation":
      return `Order #${(context as OrderConfirmationContext).orderNumber} - Confirmed`;
    case "general_update":
      return "Update on your request";
    case "clarification_loop":
      return "Getting you some extra help";
  }
}

function getFallbackEmail(context: EmailContext): GeneratedEmail {
  // Minimal fallbacks when LLM is unavailable
  switch (context.purpose) {
    case "customer_outreach": {
      const ctx = context as CustomerOutreachContext;
      const requestList = ctx.requests.map(r => `- ${r.description}`).join("\n");
      return {
        subject: `Quick question about your Order #${ctx.orderNumber}`,
        body: `Hi ${ctx.customerName || "there"},

Thanks for your order (#${ctx.orderNumber}) for the ${ctx.productTitle}.

Our fulfillment team needs a bit more info before they can get started:

${requestList}

Just reply to this email with the details and we'll take it from there.

– Lina`,
      };
    }

    case "vendor_forward": {
      const ctx = context as VendorForwardContext;
      const responseList = ctx.responses.map(r => {
        if (r.answer) return `- ${r.type}: ${r.answer}`;
        if (r.hasAttachments) return `- ${r.type}: See attached`;
        return `- ${r.type}: Provided`;
      }).join("\n");
      return {
        subject: `Customer response - Order #${ctx.orderNumber}`,
        body: `Hi,

Customer response for Order #${ctx.orderNumber}:

${responseList}

Thanks,
SquareWheels Auto`,
      };
    }

    case "escalation_notice": {
      const ctx = context as EscalationContext;
      if (ctx.existingDraft) {
        const cleanDraft = ctx.existingDraft.replace(/\n*–\s*Lina\s*$/i, "").trim();
        return {
          subject: "Your support request",
          body: `${cleanDraft}

I've also looped in Rob, our team lead, who'll follow up personally to make sure this gets resolved.

– Lina`,
        };
      }
      return {
        subject: "Your support request - personal attention",
        body: `Hi${ctx.customerName ? ` ${ctx.customerName}` : ""},

Thanks for reaching out. I've reviewed your message and I've looped in Rob, our team lead, who'll follow up with you directly to help get this sorted.

– Lina`,
      };
    }

    case "stale_thread_return": {
      const ctx = context as StaleThreadContext;
      return {
        subject: "Following up on your support request",
        body: `Hi${ctx.customerName ? ` ${ctx.customerName}` : " there"},

I'm really sorry for the delay in getting back to you. That's not the experience we want you to have.

Is this still something you need help with? If so, let me know and I'll prioritize getting you sorted.

– Lina`,
      };
    }

    case "order_confirmation": {
      const ctx = context as OrderConfirmationContext;
      return {
        subject: `Order #${ctx.orderNumber} - Confirmed`,
        body: `Hi ${ctx.customerName},

Got it! I've noted your selections for Order #${ctx.orderNumber}.${ctx.nextSteps ? ` ${ctx.nextSteps}` : ""}

– Lina`,
      };
    }

    case "general_update": {
      const ctx = context as GeneralUpdateContext;
      return {
        subject: `Update: ${ctx.updateType}`,
        body: `Hi${ctx.customerName ? ` ${ctx.customerName}` : ""},

${ctx.details}

– Lina`,
      };
    }

    case "clarification_loop": {
      const ctx = context as ClarificationLoopContext;
      return {
        subject: "Getting you some extra help",
        body: `Hi${ctx.customerName ? ` ${ctx.customerName}` : ""},

I'm having trouble finding the right answer for you, and I don't want to keep going in circles. I've asked Rob, our team lead, to take a look - he'll follow up with you directly.

– Lina`,
      };
    }
  }
}

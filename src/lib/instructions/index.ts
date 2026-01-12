/**
 * Instructions Module
 *
 * Dynamic agent instructions that can be edited and improved via feedback.
 * Also integrates approved instructions extracted from HubSpot emails.
 */

export { integrateFeedback } from "./integrate";

import { supabase } from "@/lib/db";

type Instruction = {
  section_key: string;
  title: string;
  content: string;
};

type ExtractedInstruction = {
  instruction_text: string;
  instruction_type: string;
  applies_to: string[];
};

/**
 * Get approved extracted instructions from HubSpot emails
 */
async function getApprovedExtractedInstructions(): Promise<ExtractedInstruction[]> {
  const { data, error } = await supabase
    .from("extracted_instructions")
    .select("instruction_text, instruction_type, applies_to")
    .eq("status", "approved");

  if (error || !data) {
    return [];
  }

  return data;
}

/**
 * Format extracted instructions for system prompt
 */
function formatExtractedInstructions(instructions: ExtractedInstruction[]): string {
  if (instructions.length === 0) {
    return "";
  }

  // Group by type
  const byType: Record<string, ExtractedInstruction[]> = {};
  for (const inst of instructions) {
    if (!byType[inst.instruction_type]) {
      byType[inst.instruction_type] = [];
    }
    byType[inst.instruction_type].push(inst);
  }

  let prompt = "## Admin Instructions\n";
  prompt += "_These are direct instructions from the admin based on real support scenarios._\n\n";

  // Format by type
  const typeLabels: Record<string, string> = {
    prohibition: "### Things NOT to Do",
    policy: "### Policy Reminders",
    routing: "### Routing Guidelines",
    escalation: "### Escalation Rules",
    kb_fact: "### Important Facts",
    approval: "### Pre-Approved Actions",
  };

  for (const [type, typeInstructions] of Object.entries(byType)) {
    const label = typeLabels[type] || `### ${type}`;
    prompt += `${label}\n`;

    for (const inst of typeInstructions) {
      const context = inst.applies_to?.length > 0 && inst.applies_to[0] !== "general"
        ? ` _(${inst.applies_to.join(", ")})_`
        : "";
      prompt += `- ${inst.instruction_text}${context}\n`;
    }

    prompt += "\n";
  }

  return prompt;
}

/**
 * Get all instructions as a formatted system prompt
 */
export async function getInstructionsAsPrompt(): Promise<string> {
  const { data: instructions, error } = await supabase
    .from("agent_instructions")
    .select("section_key, title, content")
    .order("display_order");

  if (error || !instructions || instructions.length === 0) {
    // Fallback to hardcoded if database fails
    console.warn("Failed to load instructions from database, using fallback");
    return getFallbackInstructions();
  }

  // Build the system prompt from instruction sections
  let prompt = `You are a helpful customer support agent for SquareWheels, a hardware company that makes automotive tuning products like APEX.\n\n`;

  for (const instruction of instructions) {
    prompt += `## ${instruction.title}\n${instruction.content}\n\n`;
  }

  // Add approved extracted instructions from HubSpot emails
  try {
    const extractedInstructions = await getApprovedExtractedInstructions();
    const extractedPrompt = formatExtractedInstructions(extractedInstructions);
    if (extractedPrompt) {
      prompt += extractedPrompt;
    }
  } catch (err) {
    // Don't fail if extracted instructions can't be loaded
    console.warn("Failed to load extracted instructions:", err);
  }

  return prompt;
}

/**
 * Get instructions for a specific section
 */
export async function getInstructionSection(
  sectionKey: string
): Promise<Instruction | null> {
  const { data, error } = await supabase
    .from("agent_instructions")
    .select("section_key, title, content")
    .eq("section_key", sectionKey)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get intent-specific instructions
 */
export async function getIntentInstructions(intent: string): Promise<string> {
  // Map intents to section keys
  const intentToSection: Record<string, string> = {
    // Product support
    PRODUCT_SUPPORT: "intent_product_support",
    FIRMWARE_UPDATE_REQUEST: "intent_firmware",
    FIRMWARE_ACCESS_ISSUE: "intent_firmware",
    INSTALL_GUIDANCE: "intent_product_support",
    FUNCTIONALITY_BUG: "intent_product_support",

    // Orders
    ORDER_STATUS: "intent_orders",
    ORDER_CHANGE_REQUEST: "intent_orders",
    MISSING_DAMAGED_ITEM: "intent_orders",
    WRONG_ITEM_RECEIVED: "intent_orders",
    RETURN_REFUND_REQUEST: "intent_returns",

    // Pre-purchase
    COMPATIBILITY_QUESTION: "intent_presale",
    PART_IDENTIFICATION: "intent_presale",

    // Escalation
    CHARGEBACK_THREAT: "intent_escalation",
    LEGAL_SAFETY_RISK: "intent_escalation",

    // Low priority
    THANK_YOU_CLOSE: "intent_closing",
    FOLLOW_UP_NO_NEW_INFO: "intent_followup",

    // Non-customer
    VENDOR_SPAM: "intent_vendor_spam",
  };

  const sectionKey = intentToSection[intent];
  if (!sectionKey) {
    return "";
  }

  const section = await getInstructionSection(sectionKey);
  return section?.content || "";
}

/**
 * Fallback instructions if database is unavailable
 */
function getFallbackInstructions(): string {
  return `You are Lina, a helpful customer support agent for SquareWheels, a hardware company that makes automotive tuning products like APEX.

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
`;
}

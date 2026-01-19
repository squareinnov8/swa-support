/**
 * Escalation Notes Generator
 *
 * Generates detailed context notes for escalated tickets including:
 * - Customer history and verification status
 * - Thread summary and sentiment analysis
 * - KB gap identification
 * - Recommended actions and instruction updates
 */

import { supabase } from "@/lib/db";
import { generate } from "@/lib/llm/client";

// Inline types to avoid dependency on missing types file
type ThreadInfo = {
  id: string;
  subject: string | null;
  state: string;
};

type MessageInfo = {
  id: string;
  direction: string;
  body_text: string;
  from_email: string | null;
  created_at: string;
};

export type EscalationContext = {
  threadId: string;
  thread: ThreadInfo;
  messages: MessageInfo[];
  escalationReason: string;
  intent: string;
  verificationStatus?: string;
  verificationFlags?: string[];
  customerEmail: string;
  customerName?: string;
  orderHistory?: Array<{
    orderId: string;
    orderNumber: string;
    status: string;
    createdAt: string;
    total: string;
  }>;
};

export type EscalationNotes = {
  summary: string;
  customerContext: string;
  escalationDetails: string;
  sentiment: string;
  recommendedActions: string[];
  kbGapsIdentified: Array<{
    topic: string;
    suggestedTitle: string;
  }>;
  instructionRecommendations: string[];
  fullNote: string;
};

/**
 * Generate rich escalation notes using LLM
 */
export async function generateEscalationNotes(
  context: EscalationContext
): Promise<EscalationNotes> {
  // Build conversation history for context
  const conversationText = context.messages
    .map((m) => {
      const direction = m.direction === "inbound" ? "Customer" : "Support";
      return `[${direction}]: ${m.body_text}`;
    })
    .join("\n\n");

  const prompt = `You are analyzing a customer support escalation for SquareWheels Auto, a company that makes automotive products like APEX tuning units, Glow-E headlights, and InTouch CarPlay/Android Auto systems.

## Thread Information
- Subject: ${context.thread.subject || "No subject"}
- Intent: ${context.intent}
- Escalation Reason: ${context.escalationReason}
- Customer: ${context.customerName || "Unknown"} (${context.customerEmail})
- Verification Status: ${context.verificationStatus || "Not verified"}
${context.verificationFlags?.length ? `- Flags: ${context.verificationFlags.join(", ")}` : ""}

## Conversation History
${conversationText}

## Order History
${
  context.orderHistory?.length
    ? context.orderHistory
        .map(
          (o) =>
            `- Order ${o.orderNumber}: ${o.status}, ${o.total} (${o.createdAt})`
        )
        .join("\n")
    : "No order history available"
}

---

Analyze this escalation and provide:

1. **Summary**: A 2-3 sentence summary of the issue
2. **Customer Sentiment**: One of: frustrated, angry, confused, neutral, patient
3. **Recommended Actions**: 3-5 specific actions Rob should take
4. **KB Gaps**: Topics where our knowledge base is missing information (if any)
5. **Instruction Recommendations**: Suggestions for improving agent instructions (if any)

Respond in JSON format:
{
  "summary": "...",
  "sentiment": "...",
  "recommendedActions": ["...", "..."],
  "kbGaps": [{"topic": "...", "suggestedTitle": "..."}],
  "instructionRecommendations": ["..."]
}`;

  const result = await generate(prompt, {
    maxTokens: 1024,
    temperature: 0.7,
  });

  // Parse LLM response
  const responseText = result.content;

  let analysis: {
    summary: string;
    sentiment: string;
    recommendedActions: string[];
    kbGaps: Array<{ topic: string; suggestedTitle: string }>;
    instructionRecommendations: string[];
  };

  try {
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch {
    // Fallback if parsing fails
    analysis = {
      summary: "Analysis unavailable - please review thread manually.",
      sentiment: "unknown",
      recommendedActions: ["Review the full conversation", "Contact customer directly"],
      kbGaps: [],
      instructionRecommendations: [],
    };
  }

  // Build customer context section
  const customerContext = buildCustomerContext(context);

  // Build escalation details
  const escalationDetails = buildEscalationDetails(context, analysis.sentiment);

  // Build the full formatted note
  const fullNote = formatFullNote({
    context,
    analysis,
    customerContext,
    escalationDetails,
  });

  return {
    summary: analysis.summary,
    customerContext,
    escalationDetails,
    sentiment: analysis.sentiment,
    recommendedActions: analysis.recommendedActions,
    kbGapsIdentified: analysis.kbGaps,
    instructionRecommendations: analysis.instructionRecommendations,
    fullNote,
  };
}

function buildCustomerContext(context: EscalationContext): string {
  const parts: string[] = [];

  parts.push(`**Customer:** ${context.customerName || "Unknown"} (${context.customerEmail})`);

  if (context.verificationStatus) {
    parts.push(`**Verification:** ${context.verificationStatus}`);
    if (context.verificationFlags?.length) {
      parts.push(`**Flags:** ${context.verificationFlags.join(", ")}`);
    }
  }

  if (context.orderHistory?.length) {
    const totalSpent = context.orderHistory.reduce((sum, o) => {
      const amount = parseFloat(o.total.replace(/[^0-9.]/g, "")) || 0;
      return sum + amount;
    }, 0);
    parts.push(`**Order History:** ${context.orderHistory.length} orders, $${totalSpent.toFixed(2)} total`);
  }

  return parts.join("\n");
}

function buildEscalationDetails(
  context: EscalationContext,
  sentiment: string
): string {
  const parts: string[] = [];

  parts.push(`**Escalation Reason:** ${context.escalationReason}`);
  parts.push(`**Detected Intent:** ${context.intent}`);
  parts.push(`**Customer Sentiment:** ${sentiment}`);

  return parts.join("\n");
}

function formatFullNote(params: {
  context: EscalationContext;
  analysis: {
    summary: string;
    sentiment: string;
    recommendedActions: string[];
    kbGaps: Array<{ topic: string; suggestedTitle: string }>;
    instructionRecommendations: string[];
  };
  customerContext: string;
  escalationDetails: string;
}): string {
  const { context, analysis, customerContext, escalationDetails } = params;

  let note = `## Escalation Summary

${analysis.summary}

---

## Customer Information

${customerContext}

---

## Escalation Details

${escalationDetails}

---

## Recommended Actions

`;

  for (const action of analysis.recommendedActions) {
    note += `- ${action}\n`;
  }

  if (analysis.kbGaps.length > 0) {
    note += `\n---\n\n## Knowledge Base Gaps Identified\n\n`;
    for (const gap of analysis.kbGaps) {
      note += `- **${gap.topic}**: Suggested article: "${gap.suggestedTitle}"\n`;
    }
  }

  if (analysis.instructionRecommendations.length > 0) {
    note += `\n---\n\n## Instruction Update Recommendations\n\n`;
    for (const rec of analysis.instructionRecommendations) {
      note += `- ${rec}\n`;
    }
  }

  note += `\n---\n\n_Generated by Support Agent at ${new Date().toISOString()}_`;

  return note;
}

/**
 * Save escalation notes to database and optionally to kb_gap_candidates
 */
export async function saveEscalationNotes(
  threadId: string,
  hubspotTicketId: string | null,
  context: EscalationContext,
  notes: EscalationNotes
): Promise<void> {
  // Save to escalation_notes table
  await supabase.from("escalation_notes").insert({
    thread_id: threadId,
    hubspot_ticket_id: hubspotTicketId,
    customer_email: context.customerEmail,
    customer_name: context.customerName,
    order_history: context.orderHistory,
    verification_status: context.verificationStatus,
    verification_flags: context.verificationFlags,
    escalation_reason: context.escalationReason,
    intent: context.intent,
    sentiment: notes.sentiment,
    recommended_actions: notes.recommendedActions,
    kb_gaps_identified: notes.kbGapsIdentified,
    instruction_recommendations: notes.instructionRecommendations,
    thread_summary: notes.summary,
  });

  // Also add KB gaps to kb_gap_candidates for review
  for (const gap of notes.kbGapsIdentified) {
    await supabase.from("kb_gap_candidates").upsert(
      {
        question_text: gap.suggestedTitle,
        topic: gap.topic,
        gap_severity: "medium",
        status: "pending",
      },
      { onConflict: "question_text" }
    );
  }
}

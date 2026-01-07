/**
 * Learning Generator
 *
 * Analyzes completed observations and generates learning proposals:
 * - KB article drafts (new knowledge to add)
 * - Instruction updates (patterns for Lina to follow)
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/db";
import type { LearningProposal, ObservedMessage } from "./types";

const anthropic = new Anthropic();

type ObservationRecord = {
  id: string;
  thread_id: string;
  intervention_start: string;
  intervention_end: string;
  human_handler: string;
  intervention_channel: string;
  observed_messages: ObservedMessage[];
  questions_asked: string[] | null;
  troubleshooting_steps: string[] | null;
  resolution_approach: string | null;
  new_information_discovered: string[] | null;
  resolution_type: string;
  resolution_summary: string | null;
};

/**
 * Generate learning proposals from a completed observation
 *
 * Analyzes what the human did and proposes:
 * 1. KB articles for new information discovered
 * 2. Instruction updates for new patterns/approaches
 */
export async function generateLearningProposals(
  observationId: string
): Promise<LearningProposal[]> {
  // Get observation data
  const { data: observation, error } = await supabase
    .from("intervention_observations")
    .select("*")
    .eq("id", observationId)
    .single();

  if (error || !observation) {
    throw new Error(`Observation not found: ${observationId}`);
  }

  // Get thread context
  const { data: thread } = await supabase
    .from("threads")
    .select("id, subject, last_intent")
    .eq("id", observation.thread_id)
    .single();

  // Build prompt context
  const context = buildContextFromObservation(observation as ObservationRecord, thread);

  // Generate proposals using Claude
  const proposals = await generateProposalsWithLLM(context, observation as ObservationRecord);

  // Save proposals to database
  for (const proposal of proposals) {
    await supabase.from("learning_proposals").insert({
      thread_id: observation.thread_id,
      intervention_id: observationId,
      proposal_type: proposal.type,
      title: proposal.title,
      summary: proposal.summary,
      proposed_content: proposal.proposedContent,
      source_context: proposal.sourceContext,
      status: "pending",
    });
  }

  // Update observation with learning summary
  if (proposals.length > 0) {
    const learningSummary = proposals
      .map((p) => `• ${p.type}: ${p.title}`)
      .join("\n");

    await supabase
      .from("intervention_observations")
      .update({ learning_summary: learningSummary })
      .eq("id", observationId);
  }

  console.log(
    `[Learning] Generated ${proposals.length} proposals from observation ${observationId}`
  );

  return proposals;
}

/**
 * Build context string from observation for LLM analysis
 */
function buildContextFromObservation(
  observation: ObservationRecord,
  thread: { id: string; subject: string | null; last_intent: string | null } | null
): string {
  const parts: string[] = [];

  parts.push(`## Thread Context`);
  parts.push(`Subject: ${thread?.subject || "Unknown"}`);
  parts.push(`Intent: ${thread?.last_intent || "Unknown"}`);
  parts.push(`Resolution: ${observation.resolution_type}`);
  parts.push("");

  if (observation.resolution_summary) {
    parts.push(`## Resolution Summary`);
    parts.push(observation.resolution_summary);
    parts.push("");
  }

  if (observation.observed_messages?.length > 0) {
    parts.push(`## Conversation During Handling`);
    for (const msg of observation.observed_messages) {
      const direction = msg.direction === "outbound" ? "→ Agent" : "← Customer";
      // Sanitize content - remove PII patterns
      const sanitized = sanitizeContent(msg.content);
      parts.push(`${direction}: ${sanitized.substring(0, 500)}...`);
    }
    parts.push("");
  }

  if (observation.questions_asked?.length) {
    parts.push(`## Questions Asked`);
    for (const q of observation.questions_asked) {
      parts.push(`- ${q}`);
    }
    parts.push("");
  }

  if (observation.troubleshooting_steps?.length) {
    parts.push(`## Troubleshooting Steps`);
    for (const step of observation.troubleshooting_steps) {
      parts.push(`- ${step}`);
    }
    parts.push("");
  }

  if (observation.new_information_discovered?.length) {
    parts.push(`## New Information Discovered`);
    for (const info of observation.new_information_discovered) {
      parts.push(`- ${info}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Generate proposals using Claude
 */
async function generateProposalsWithLLM(
  context: string,
  observation: ObservationRecord
): Promise<LearningProposal[]> {
  const systemPrompt = `You are a learning extraction system for a customer support AI agent.

Analyze the human handling of a customer support case and extract learnings that could improve the AI agent.

Your goal is to propose:
1. **KB Articles**: New factual information that should be added to the knowledge base
   - Product details, troubleshooting steps, policies that weren't documented
   - Must be generalizable (not customer-specific)
   - Must NOT contain any personally identifiable information (PII)

2. **Instruction Updates**: New patterns or approaches the agent should follow
   - Communication strategies that worked well
   - Question sequences for specific scenarios
   - Decision-making guidelines

IMPORTANT:
- Only propose learnings if there's genuinely new, useful information
- Do NOT propose learnings for routine/standard resolutions
- Remove all PII: names, emails, order numbers, addresses, phone numbers
- Make content generalizable - not tied to a specific customer

Return JSON in this format:
{
  "proposals": [
    {
      "type": "kb_article" | "instruction_update",
      "title": "Short descriptive title",
      "summary": "1-2 sentence summary of what was learned",
      "proposedContent": "Full content of the KB article or instruction"
    }
  ]
}

If there's nothing worth learning from this interaction, return: {"proposals": []}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Analyze this human handling session and extract learnings:\n\n${context}`,
      },
    ],
  });

  // Parse response
  const content = response.content[0];
  if (content.type !== "text") {
    return [];
  }

  try {
    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Learning] No JSON found in response");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      proposals: Array<{
        type: "kb_article" | "instruction_update";
        title: string;
        summary: string;
        proposedContent: string;
      }>;
    };

    return parsed.proposals.map((p) => ({
      ...p,
      sourceContext: {
        threadId: observation.thread_id,
        relevantExcerpts: [],
      },
    }));
  } catch (err) {
    console.error("[Learning] Failed to parse proposals:", err);
    return [];
  }
}

/**
 * Sanitize content by removing PII patterns
 */
function sanitizeContent(content: string): string {
  let sanitized = content;

  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL]"
  );

  // Remove phone numbers (various formats)
  sanitized = sanitized.replace(
    /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g,
    "[PHONE]"
  );

  // Remove order numbers (common patterns like #12345, ORDER-12345)
  sanitized = sanitized.replace(
    /#?\b(?:ORDER|ORD)?[-#]?\d{4,}/gi,
    "[ORDER_NUMBER]"
  );

  // Remove addresses (basic pattern - street numbers)
  sanitized = sanitized.replace(
    /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi,
    "[ADDRESS]"
  );

  // Remove credit card patterns
  sanitized = sanitized.replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, "[CARD]");

  return sanitized;
}

/**
 * Get pending learning proposals
 */
export async function getPendingProposals(): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    proposedContent: string;
    threadId: string;
    createdAt: string;
  }>
> {
  const { data } = await supabase
    .from("learning_proposals")
    .select("id, proposal_type, title, summary, proposed_content, thread_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  return (data || []).map((p) => ({
    id: p.id,
    type: p.proposal_type,
    title: p.title,
    summary: p.summary,
    proposedContent: p.proposed_content,
    threadId: p.thread_id,
    createdAt: p.created_at,
  }));
}

/**
 * Approve a learning proposal
 */
export async function approveProposal(
  proposalId: string,
  reviewerEmail: string,
  notes?: string
): Promise<{ publishedId?: string }> {
  const { data: proposal, error } = await supabase
    .from("learning_proposals")
    .select("*")
    .eq("id", proposalId)
    .single();

  if (error || !proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  const now = new Date().toISOString();

  if (proposal.proposal_type === "kb_article") {
    // Create KB article
    const { data: kbDoc } = await supabase
      .from("kb_docs")
      .insert({
        source: "learning",
        source_id: proposalId,
        title: proposal.title,
        body: proposal.proposed_content,
        updated_at: now,
      })
      .select("id")
      .single();

    // Update proposal
    await supabase
      .from("learning_proposals")
      .update({
        status: "published",
        reviewed_by: reviewerEmail,
        reviewed_at: now,
        review_notes: notes,
        published_kb_doc_id: kbDoc?.id,
      })
      .eq("id", proposalId);

    console.log(`[Learning] Published KB article from proposal ${proposalId}`);

    return { publishedId: kbDoc?.id };
  } else if (proposal.proposal_type === "instruction_update") {
    // Create instruction
    const { data: instruction } = await supabase
      .from("agent_instructions")
      .insert({
        title: proposal.title,
        content: proposal.proposed_content,
        category: "learned",
        priority: 50,
        is_active: true,
      })
      .select("id")
      .single();

    // Update proposal
    await supabase
      .from("learning_proposals")
      .update({
        status: "published",
        reviewed_by: reviewerEmail,
        reviewed_at: now,
        review_notes: notes,
        published_instruction_id: instruction?.id,
      })
      .eq("id", proposalId);

    console.log(`[Learning] Published instruction from proposal ${proposalId}`);

    return { publishedId: instruction?.id };
  }

  return {};
}

/**
 * Reject a learning proposal
 */
export async function rejectProposal(
  proposalId: string,
  reviewerEmail: string,
  reason?: string
): Promise<void> {
  await supabase
    .from("learning_proposals")
    .update({
      status: "rejected",
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
      review_notes: reason,
    })
    .eq("id", proposalId);

  console.log(`[Learning] Rejected proposal ${proposalId}`);
}

/**
 * Resolution Analyzer
 *
 * Analyzes resolved thread dialogues and extracts learnings:
 * - New KB articles for product info, troubleshooting steps
 * - Instruction updates for behavioral patterns
 * - Duplicate detection against existing KB
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/db";
import { embedText, formatEmbeddingForPg, isEmbeddingConfigured, cosineSimilarity } from "@/lib/retrieval/embed";
import { approveProposal } from "@/lib/collaboration/learningGenerator";

const anthropic = new Anthropic();

// ============================================
// Types
// ============================================

export type LearningProposal = {
  type: "kb_article" | "instruction_update";
  title: string;
  summary: string;
  proposedContent: string;
  confidence: number;
  autoApproved: boolean;
  similarityToExisting?: number;
  similarDocId?: string;
};

export type ResolutionAnalysisResult = {
  threadId: string;
  dialogueQuality: number;
  proposals: LearningProposal[];
};

export type DuplicateCheckResult = {
  isDuplicate: boolean;
  similarity: number;
  existingDocId?: string;
  existingDocTitle?: string;
};

// ============================================
// Auto-Approval Thresholds
// ============================================

const AUTO_APPROVAL_THRESHOLDS = {
  kb_article: {
    minConfidence: 0.85,
    minDialogueQuality: 0.7,
    maxSimilarity: 0.85, // Reject if too similar to existing
  },
  instruction_update: {
    minConfidence: 0.80,
    minDialogueQuality: 0.6,
    maxSimilarity: 0.85,
  },
};

// ============================================
// Main Functions
// ============================================

/**
 * Analyze a resolved thread and extract learnings
 */
export async function analyzeResolvedThread(threadId: string): Promise<ResolutionAnalysisResult> {
  console.log(`[ResolutionAnalyzer] Analyzing thread ${threadId}`);

  // 1. Get thread and messages
  const { data: thread } = await supabase
    .from("threads")
    .select("id, subject, last_intent, created_at")
    .eq("id", threadId)
    .single();

  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, from_email, body_text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (!messages || messages.length < 3) {
    console.log(`[ResolutionAnalyzer] Insufficient messages (${messages?.length || 0})`);
    return { threadId, dialogueQuality: 0, proposals: [] };
  }

  // 2. Build context for LLM
  const context = buildDialogueContext(thread, messages);

  // 3. Get existing KB summary for duplicate awareness
  const existingKBSummary = await getExistingKBSummary(thread.last_intent);

  // 4. Generate proposals using Claude
  const rawProposals = await extractLearningsWithLLM(context, existingKBSummary);

  if (rawProposals.dialogueQuality < 0.5 || rawProposals.proposals.length === 0) {
    console.log(`[ResolutionAnalyzer] Low quality (${rawProposals.dialogueQuality}) or no proposals`);

    // Record the analysis even if no proposals
    await supabase.from("resolution_analyses").upsert({
      thread_id: threadId,
      dialogue_quality: rawProposals.dialogueQuality,
      proposals_generated: 0,
      proposals_auto_approved: 0,
      proposals_pending_review: 0,
    });

    return { threadId, dialogueQuality: rawProposals.dialogueQuality, proposals: [] };
  }

  // 5. Process each proposal: check duplicates, determine auto-approval
  const processedProposals: LearningProposal[] = [];
  let autoApprovedCount = 0;
  let pendingCount = 0;

  for (const proposal of rawProposals.proposals) {
    // Check for duplicates
    const duplicateCheck = await checkForDuplicates(proposal.proposedContent);

    const processedProposal: LearningProposal = {
      ...proposal,
      autoApproved: false,
      similarityToExisting: duplicateCheck.similarity,
      similarDocId: duplicateCheck.existingDocId,
    };

    // Determine if should auto-approve
    const shouldAuto = shouldAutoApprove(processedProposal, rawProposals.dialogueQuality, duplicateCheck);
    processedProposal.autoApproved = shouldAuto;

    // Save to database
    const { data: savedProposal } = await supabase
      .from("learning_proposals")
      .insert({
        thread_id: threadId,
        proposal_type: proposal.type,
        title: proposal.title,
        summary: proposal.summary,
        proposed_content: proposal.proposedContent,
        source_type: "resolution_analysis",
        confidence_score: proposal.confidence,
        auto_approved: shouldAuto,
        similarity_to_existing: duplicateCheck.similarity,
        similar_doc_id: duplicateCheck.existingDocId,
        status: shouldAuto ? "approved" : "pending",
        source_context: {
          threadId,
          dialogueQuality: rawProposals.dialogueQuality,
        },
      })
      .select("id")
      .single();

    // If auto-approved, publish immediately
    if (shouldAuto && savedProposal) {
      try {
        await approveProposal(savedProposal.id, "auto-approval-system");
        autoApprovedCount++;
        console.log(`[ResolutionAnalyzer] Auto-approved proposal: ${proposal.title}`);
      } catch (err) {
        console.error(`[ResolutionAnalyzer] Failed to auto-approve:`, err);
        // Mark as pending instead
        await supabase
          .from("learning_proposals")
          .update({ status: "pending", auto_approved: false })
          .eq("id", savedProposal.id);
        processedProposal.autoApproved = false;
        pendingCount++;
      }
    } else {
      pendingCount++;
    }

    processedProposals.push(processedProposal);
  }

  // 6. Record the analysis
  await supabase.from("resolution_analyses").upsert({
    thread_id: threadId,
    dialogue_quality: rawProposals.dialogueQuality,
    dialogue_summary: context.substring(0, 500),
    proposals_generated: processedProposals.length,
    proposals_auto_approved: autoApprovedCount,
    proposals_pending_review: pendingCount,
  });

  console.log(`[ResolutionAnalyzer] Generated ${processedProposals.length} proposals (${autoApprovedCount} auto-approved)`);

  return {
    threadId,
    dialogueQuality: rawProposals.dialogueQuality,
    proposals: processedProposals,
  };
}

/**
 * Check if content duplicates existing KB
 */
export async function checkForDuplicates(content: string): Promise<DuplicateCheckResult> {
  if (!isEmbeddingConfigured()) {
    return { isDuplicate: false, similarity: 0 };
  }

  try {
    // Generate embedding for the proposed content
    const embedding = await embedText(content.substring(0, 2000)); // Limit length
    const embeddingStr = formatEmbeddingForPg(embedding);

    // Search for similar KB docs
    const { data, error } = await supabase.rpc("match_kb_chunks", {
      query_embedding: embeddingStr,
      match_threshold: 0.7,
      match_count: 3,
    });

    if (error || !data || data.length === 0) {
      return { isDuplicate: false, similarity: 0 };
    }

    const topMatch = data[0];

    // Get the doc info
    const { data: chunk } = await supabase
      .from("kb_chunks")
      .select("doc_id")
      .eq("id", topMatch.chunk_id)
      .single();

    if (!chunk) {
      return { isDuplicate: false, similarity: topMatch.similarity || 0 };
    }

    const { data: doc } = await supabase
      .from("kb_docs")
      .select("id, title")
      .eq("id", chunk.doc_id)
      .single();

    return {
      isDuplicate: topMatch.similarity > 0.85,
      similarity: topMatch.similarity,
      existingDocId: doc?.id,
      existingDocTitle: doc?.title,
    };
  } catch (err) {
    console.error("[ResolutionAnalyzer] Duplicate check failed:", err);
    return { isDuplicate: false, similarity: 0 };
  }
}

/**
 * Determine if a proposal should be auto-approved
 */
export function shouldAutoApprove(
  proposal: LearningProposal,
  dialogueQuality: number,
  duplicateCheck: DuplicateCheckResult
): boolean {
  const thresholds = AUTO_APPROVAL_THRESHOLDS[proposal.type];

  // Must meet confidence threshold
  if (proposal.confidence < thresholds.minConfidence) {
    return false;
  }

  // Must meet dialogue quality threshold
  if (dialogueQuality < thresholds.minDialogueQuality) {
    return false;
  }

  // Must not be too similar to existing (potential duplicate)
  if (duplicateCheck.similarity > thresholds.maxSimilarity) {
    return false;
  }

  // Must not contain potential PII patterns
  if (containsPII(proposal.proposedContent)) {
    return false;
  }

  return true;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build dialogue context for LLM analysis
 */
function buildDialogueContext(
  thread: { id: string; subject: string | null; last_intent: string | null },
  messages: Array<{ direction: string; from_email: string | null; body_text: string | null; created_at: string }>
): string {
  const parts: string[] = [];

  parts.push(`## Thread Context`);
  parts.push(`Subject: ${thread.subject || "Unknown"}`);
  parts.push(`Intent: ${thread.last_intent || "Unknown"}`);
  parts.push("");

  parts.push(`## Conversation`);
  for (const msg of messages) {
    const direction = msg.direction === "outbound" ? "→ Support" : "← Customer";
    const sanitized = sanitizeContent(msg.body_text || "");
    parts.push(`${direction}: ${sanitized.substring(0, 800)}`);
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Get existing KB summary for duplicate awareness
 */
async function getExistingKBSummary(intent: string | null): Promise<string> {
  if (!intent) {
    return "No existing KB articles for this intent.";
  }

  const { data: docs } = await supabase
    .from("kb_docs")
    .select("title")
    .contains("intent_tags", [intent])
    .eq("evolution_status", "published")
    .limit(10);

  if (!docs || docs.length === 0) {
    return "No existing KB articles for this intent.";
  }

  return `Existing KB articles for ${intent}:\n${docs.map((d) => `- ${d.title}`).join("\n")}`;
}

/**
 * Extract learnings using Claude
 */
async function extractLearningsWithLLM(
  context: string,
  existingKBSummary: string
): Promise<{ dialogueQuality: number; proposals: Omit<LearningProposal, "autoApproved">[] }> {
  const systemPrompt = `You are a knowledge extraction system for a customer support AI agent at SquareWheels Auto (automotive tuning products like APEX).

Analyze this resolved support conversation and extract learnings that could improve the AI agent.

## Quality Criteria
- Minimum 3 back-and-forth exchanges for quality extraction
- Contains specific troubleshooting steps or product information
- Resolution was successful (not just "thank you, goodbye")

## What to Extract

### 1. KB Articles (factual knowledge)
- Product details, specifications, compatibility information
- Troubleshooting steps that worked
- Policies, procedures, or processes explained
- Common issues and their solutions

ONLY propose KB articles if:
- Information is NOT already covered in existing KB (see below)
- Content is generalizable (not specific to one customer)
- Contains concrete, actionable information

### 2. Instruction Updates (behavioral patterns)
- Effective question sequences for diagnosis
- Communication strategies that worked well
- When to escalate vs. handle
- Best practices demonstrated

## Existing KB Context (avoid duplicates)
${existingKBSummary}

## Quality Guidelines
- Remove ALL PII: names, emails, order numbers, addresses, phones
- Make content generalizable
- Skip routine/standard resolutions with no new information

## Confidence Score (0-1)
- 0.9+: Specific steps, concrete facts, clearly generalizable
- 0.7-0.9: Useful but may need editing
- <0.7: Too vague or customer-specific

Return JSON:
{
  "dialogueQuality": 0.0-1.0,
  "proposals": [
    {
      "type": "kb_article" | "instruction_update",
      "title": "Short descriptive title",
      "summary": "1-2 sentence summary",
      "proposedContent": "Full content (markdown for KB)",
      "confidence": 0.0-1.0
    }
  ]
}

If nothing worth learning, return: {"dialogueQuality": <score>, "proposals": []}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze this resolved support conversation and extract learnings:\n\n${context}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return { dialogueQuality: 0.5, proposals: [] };
    }

    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[ResolutionAnalyzer] No JSON found in response");
      return { dialogueQuality: 0.5, proposals: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      dialogueQuality: number;
      proposals: Array<{
        type: "kb_article" | "instruction_update";
        title: string;
        summary: string;
        proposedContent: string;
        confidence: number;
      }>;
    };

    return {
      dialogueQuality: parsed.dialogueQuality || 0.5,
      proposals: parsed.proposals || [],
    };
  } catch (err) {
    console.error("[ResolutionAnalyzer] LLM extraction failed:", err);
    return { dialogueQuality: 0.5, proposals: [] };
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
 * Check if content contains potential PII
 */
function containsPII(content: string): boolean {
  // Check for common PII patterns
  const piiPatterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email
    /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g, // Phone
    /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, // Credit card
  ];

  for (const pattern of piiPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

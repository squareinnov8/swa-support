/**
 * Escalation Response Handler
 *
 * Processes Rob's replies to escalation emails:
 * - Detects if email is a reply to an escalation
 * - Parses response tags ([INSTRUCTION], [RESOLVE], [DRAFT])
 * - Creates relay drafts to customers
 * - Updates KB/instructions based on learnings
 * - Tracks response in database
 */

import { supabase } from "@/lib/db";
import { executeLinaTool } from "@/lib/llm/linaToolExecutor";
import { createDoc } from "@/lib/kb/documents";
import { embedText, formatEmbeddingForPg } from "@/lib/retrieval/embed";
import { chunkMarkdown } from "@/lib/retrieval/chunk";
import OpenAI from "openai";
import { getClient, isLLMConfigured } from "@/lib/llm/client";

const ROB_EMAIL = "rob@squarewheelsauto.com";
const SUPPORT_EMAIL = "support@squarewheelsauto.com";

/**
 * Response types that can be parsed from Rob's email
 */
export type ResponseType = "instruction" | "resolve" | "draft" | "relay" | "takeover";

/**
 * Parsed escalation response
 */
export interface ParsedResponse {
  type: ResponseType;
  content: string;
  rawBody: string;
  tags: string[];
}

/**
 * Result of processing an escalation response
 */
export interface ResponseProcessingResult {
  processed: boolean;
  escalationEmailId?: string;
  threadId?: string;
  actions: Array<{
    type: string;
    success: boolean;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Check if an incoming email is a reply to an escalation email
 *
 * @param gmailThreadId - The Gmail thread ID of the incoming email
 * @param fromEmail - The sender's email address
 * @returns The escalation email record if this is a reply, null otherwise
 */
export async function findEscalationForReply(
  gmailThreadId: string,
  fromEmail: string
): Promise<{
  id: string;
  thread_id: string;
  subject: string;
  gmail_message_id: string;
} | null> {
  // Only process replies from Rob
  if (fromEmail.toLowerCase() !== ROB_EMAIL.toLowerCase()) {
    return null;
  }

  // Look for an escalation email in this Gmail thread
  // We match by checking if any escalation email was sent to this thread
  const { data: thread } = await supabase
    .from("threads")
    .select("id")
    .eq("gmail_thread_id", gmailThreadId)
    .maybeSingle();

  if (!thread) {
    return null;
  }

  // Check if there's a pending escalation email for this thread
  const { data: escalation } = await supabase
    .from("escalation_emails")
    .select("id, thread_id, subject, gmail_message_id")
    .eq("thread_id", thread.id)
    .eq("response_received", false)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return escalation;
}

/**
 * Parse Rob's response to extract tags and content
 */
export function parseResponse(emailBody: string): ParsedResponse {
  const tags: string[] = [];
  let content = emailBody;
  let type: ResponseType = "relay"; // Default: treat as relay to customer

  // Extract tags (case-insensitive)
  const tagPatterns = [
    { pattern: /\[INSTRUCTION\]/gi, tag: "INSTRUCTION" },
    { pattern: /\[RESOLVE\]/gi, tag: "RESOLVE" },
    { pattern: /\[DRAFT\]/gi, tag: "DRAFT" },
    { pattern: /\[KB\]/gi, tag: "KB" },
    { pattern: /\[TAKEOVER\]/gi, tag: "TAKEOVER" },
  ];

  for (const { pattern, tag } of tagPatterns) {
    if (pattern.test(content)) {
      tags.push(tag);
      content = content.replace(pattern, "").trim();
    }
  }

  // Determine response type based on tags
  if (tags.includes("INSTRUCTION")) {
    type = "instruction";
  } else if (tags.includes("RESOLVE")) {
    type = "resolve";
  } else if (tags.includes("DRAFT")) {
    type = "draft";
  } else if (tags.includes("TAKEOVER")) {
    type = "takeover";
  } else {
    // No tags = relay Rob's answer to customer
    type = "relay";
  }

  // Clean up the content
  // Remove email signature lines (common patterns)
  content = content
    .replace(/^>.*$/gm, "") // Remove quoted text
    .replace(/^On .* wrote:$/gm, "") // Remove "On date, person wrote:"
    .replace(/^-{2,}.*$/gm, "") // Remove signature separators
    .replace(/^Sent from my .*$/gim, "") // Remove mobile signatures
    .replace(/\n{3,}/g, "\n\n") // Collapse multiple newlines
    .trim();

  return {
    type,
    content,
    rawBody: emailBody,
    tags,
  };
}

/**
 * Process Rob's response to an escalation email
 */
export async function processEscalationResponse(
  escalationEmailId: string,
  threadId: string,
  response: ParsedResponse
): Promise<ResponseProcessingResult> {
  const result: ResponseProcessingResult = {
    processed: true,
    escalationEmailId,
    threadId,
    actions: [],
  };

  console.log(`[EscalationResponse] Processing ${response.type} response for thread ${threadId}`);

  try {
    switch (response.type) {
      case "relay":
        // Relay Rob's answer to the customer
        await handleRelayResponse(threadId, response, result);
        break;

      case "instruction":
        // Update agent instructions
        await handleInstructionResponse(threadId, response, result);
        break;

      case "resolve":
        // Mark as resolved and extract learnings
        await handleResolveResponse(threadId, response, result);
        break;

      case "draft":
        // Have Lina generate a draft based on Rob's input
        await handleDraftResponse(threadId, response, result);
        break;

      case "takeover":
        // Rob is taking over - just mark the thread
        await handleTakeoverResponse(threadId, response, result);
        break;
    }

    // Update the escalation email record
    await supabase
      .from("escalation_emails")
      .update({
        response_received: true,
        response_type: response.type,
        response_content: response.content,
        response_at: new Date().toISOString(),
      })
      .eq("id", escalationEmailId);

    // Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      event_type: "ESCALATION_RESPONSE_PROCESSED",
      payload: {
        escalation_email_id: escalationEmailId,
        response_type: response.type,
        tags: response.tags,
        actions: result.actions,
      },
    });

  } catch (error) {
    console.error("[EscalationResponse] Error processing response:", error);
    result.actions.push({
      type: "error",
      success: false,
      details: { error: error instanceof Error ? error.message : "Unknown error" },
    });
  }

  return result;
}

/**
 * Handle relay response - send Rob's answer to the customer
 */
async function handleRelayResponse(
  threadId: string,
  response: ParsedResponse,
  result: ResponseProcessingResult
): Promise<void> {
  // Use the draft_relay_response tool we already built
  const toolResult = await executeLinaTool(
    "draft_relay_response",
    {
      customer_message: response.content,
      attribution: "rob",
      thread_id: threadId,
    },
    {
      threadId,
      adminEmail: ROB_EMAIL,
    }
  );

  result.actions.push({
    type: "relay_draft_created",
    success: toolResult.success,
    details: toolResult.details,
  });

  // Also check if this contains info worth adding to KB
  if (response.content.length > 100) {
    await considerKBArticle(threadId, response, result);
  }
}

/**
 * Handle instruction response - update agent behavior
 */
async function handleInstructionResponse(
  threadId: string,
  response: ParsedResponse,
  result: ResponseProcessingResult
): Promise<void> {
  // Use the update_instruction tool
  const toolResult = await executeLinaTool(
    "update_instruction",
    {
      section: "escalation_context", // Default section for escalation learnings
      instruction_text: response.content,
      rationale: `From escalation response on thread ${threadId}`,
    },
    {
      threadId,
      adminEmail: ROB_EMAIL,
    }
  );

  result.actions.push({
    type: "instruction_updated",
    success: toolResult.success,
    details: toolResult.details,
  });

  // Also create relay to let customer know we're working on it
  const relayResult = await executeLinaTool(
    "draft_relay_response",
    {
      customer_message: "I'm looking into this and will have an update for you shortly.",
      attribution: "rob",
      thread_id: threadId,
    },
    {
      threadId,
      adminEmail: ROB_EMAIL,
    }
  );

  result.actions.push({
    type: "acknowledgment_draft_created",
    success: relayResult.success,
    details: relayResult.details,
  });
}

/**
 * Handle resolve response - mark resolved and extract learnings
 */
async function handleResolveResponse(
  threadId: string,
  response: ParsedResponse,
  result: ResponseProcessingResult
): Promise<void> {
  // Update thread state
  await supabase
    .from("threads")
    .update({
      state: "RESOLVED",
      human_handling_mode: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  result.actions.push({
    type: "thread_resolved",
    success: true,
    details: { threadId },
  });

  // If there's content, relay it to the customer as resolution
  if (response.content.trim()) {
    const toolResult = await executeLinaTool(
      "draft_relay_response",
      {
        customer_message: response.content,
        attribution: "rob",
        thread_id: threadId,
      },
      {
        threadId,
        adminEmail: ROB_EMAIL,
      }
    );

    result.actions.push({
      type: "resolution_draft_created",
      success: toolResult.success,
      details: toolResult.details,
    });
  }

  // Extract learnings if content is substantial
  if (response.content.length > 100) {
    await considerKBArticle(threadId, response, result);
  }
}

/**
 * Handle draft response - have Lina generate a response based on Rob's input
 */
async function handleDraftResponse(
  threadId: string,
  response: ParsedResponse,
  result: ResponseProcessingResult
): Promise<void> {
  if (!isLLMConfigured()) {
    result.actions.push({
      type: "draft_generation_skipped",
      success: false,
      details: { reason: "LLM not configured" },
    });
    return;
  }

  // Get thread context
  const { data: thread } = await supabase
    .from("threads")
    .select("subject, last_intent")
    .eq("id", threadId)
    .single();

  const { data: messages } = await supabase
    .from("messages")
    .select("direction, body_text")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  const customerMessages = messages
    ?.filter((m) => m.direction === "inbound")
    .map((m) => m.body_text)
    .join("\n\n") || "";

  // Use LLM to generate a draft based on Rob's guidance
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 800,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are Lina, a friendly customer support agent for SquareWheels Auto.
Rob has provided guidance on how to respond to this customer. Write a professional, helpful response that incorporates his guidance.

Guidelines:
- Be warm and helpful
- Don't mention Rob by name unless the guidance explicitly says to
- Keep the response focused and concise
- Sign off as "– Lina"`,
      },
      {
        role: "user",
        content: `Customer's question about: ${thread?.subject || "Support request"}

Customer said:
${customerMessages.slice(-1500)}

Rob's guidance:
${response.content}

Write a response to the customer:`,
      },
    ],
  });

  const draftContent = completion.choices[0]?.message?.content || "";

  if (draftContent) {
    // Insert as draft message
    const { data: draft, error } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body_text: draftContent,
        role: "draft",
        channel: "email",
        channel_metadata: {
          generated_from_escalation: true,
          rob_guidance: response.content.slice(0, 500),
          created_via: "escalation_response",
        },
      })
      .select("id")
      .single();

    result.actions.push({
      type: "lina_draft_created",
      success: !error,
      details: { draftId: draft?.id },
    });
  }
}

/**
 * Handle takeover - Rob is handling directly
 */
async function handleTakeoverResponse(
  threadId: string,
  response: ParsedResponse,
  result: ResponseProcessingResult
): Promise<void> {
  // Mark thread as being handled by Rob
  await supabase
    .from("threads")
    .update({
      human_handling_mode: true,
      human_handler: ROB_EMAIL,
      human_handling_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  result.actions.push({
    type: "takeover_marked",
    success: true,
    details: { handler: ROB_EMAIL },
  });
}

/**
 * Consider creating a KB article from Rob's response
 */
async function considerKBArticle(
  threadId: string,
  response: ParsedResponse,
  result: ResponseProcessingResult
): Promise<void> {
  if (!isLLMConfigured()) {
    return;
  }

  // Get thread context for KB article generation
  const { data: thread } = await supabase
    .from("threads")
    .select("subject, last_intent")
    .eq("id", threadId)
    .single();

  // Use LLM to determine if this should be a KB article
  const client = getClient();
  const analysis = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You analyze support responses to determine if they contain reusable knowledge.

Return JSON only:
{
  "shouldCreateKB": boolean,
  "reason": "string",
  "title": "string (if shouldCreateKB)",
  "category": "product|troubleshooting|policy|shipping|returns|compatibility",
  "content": "string - formatted KB article content (if shouldCreateKB)"
}

Create KB articles for:
- Product information, specs, compatibility
- Troubleshooting steps that could help other customers
- Policy clarifications
- Common questions with definitive answers

Don't create KB articles for:
- One-off customer-specific situations
- Sensitive/private information
- Vague or incomplete information`,
      },
      {
        role: "user",
        content: `Thread subject: ${thread?.subject || "Support request"}
Intent: ${thread?.last_intent || "unknown"}

Rob's response:
${response.content}

Should this be a KB article?`,
      },
    ],
  });

  const analysisText = analysis.choices[0]?.message?.content || "";

  try {
    const match = analysisText.match(/\{[\s\S]*\}/);
    if (!match) return;

    const parsed = JSON.parse(match[0]) as {
      shouldCreateKB: boolean;
      reason: string;
      title?: string;
      category?: string;
      content?: string;
    };

    if (parsed.shouldCreateKB && parsed.title && parsed.content && parsed.category) {
      // Create the KB article
      const doc = await createDoc({
        title: parsed.title,
        body: parsed.content,
        source: "manual",
        metadata: {
          created_by: ROB_EMAIL,
          source_summary: `Extracted from escalation response on thread ${threadId}`,
          created_via: "escalation_response",
          thread_id: threadId,
        },
      });

      // Generate embeddings
      try {
        const chunks = chunkMarkdown(parsed.content, {
          maxChunkSize: 512,
          overlap: 50,
          minChunkSize: 100,
        });

        for (const chunk of chunks) {
          const embedding = await embedText(chunk.content);
          await supabase.from("kb_chunks").insert({
            doc_id: doc.id,
            chunk_index: chunk.index,
            content: chunk.content,
            embedding: formatEmbeddingForPg(embedding),
          });
        }
      } catch (embeddingError) {
        console.error("[EscalationResponse] Embedding error:", embeddingError);
      }

      result.actions.push({
        type: "kb_article_created",
        success: true,
        details: {
          docId: doc.id,
          title: parsed.title,
          category: parsed.category,
          reason: parsed.reason,
        },
      });
    }
  } catch {
    // JSON parsing failed - that's fine, just skip KB creation
  }
}

/**
 * Lina Tool Executor
 *
 * Executes tool calls made by Lina during admin chat sessions.
 * Handles KB article creation, instruction updates, draft responses, and feedback notes.
 */

import { supabase } from "@/lib/db";
import { createDoc } from "@/lib/kb/documents";
import { embedText, formatEmbeddingForPg } from "@/lib/retrieval/embed";
import { chunkMarkdown } from "@/lib/retrieval/chunk";
import { getRelayTemplate } from "./linaTools";

/**
 * Result of a tool execution
 */
export interface ToolResult {
  success: boolean;
  message: string;
  resourceUrl?: string;
  details?: Record<string, unknown>;
}

/**
 * Context for tool execution
 */
export interface ToolContext {
  threadId?: string;
  adminEmail: string;
  conversationId?: string;
}

/**
 * Execute a Lina tool call
 */
export async function executeLinaTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  console.log(`[LinaTool] Executing: ${toolName}`, { input: toolInput, context });

  try {
    switch (toolName) {
      case "create_kb_article":
        return await createKBArticle(toolInput, context);
      case "update_instruction":
        return await updateInstruction(toolInput, context);
      case "draft_relay_response":
        return await draftRelayResponse(toolInput, context);
      case "note_feedback":
        return noteFeedback(toolInput);
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`[LinaTool] Error executing ${toolName}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Create a new KB article from information provided by admin
 */
async function createKBArticle(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { title, content, category, source_summary } = input as {
    title: string;
    content: string;
    category: string;
    source_summary?: string;
  };

  // Validate required fields
  if (!title || !content || !category) {
    return { success: false, message: "Missing required fields: title, content, or category" };
  }

  // Create the KB document
  // Using "manual" source since admin_chat is not in the allowed types
  // The metadata.created_via field tracks the actual origin
  const doc = await createDoc({
    title,
    body: content,
    source: "manual",
    metadata: {
      created_by: context.adminEmail,
      source_summary: source_summary || "Created from admin chat with Lina",
      created_via: "lina_tool",
      thread_id: context.threadId,
    },
  });

  // Generate chunks and embeddings for the new document
  try {
    const chunks = chunkMarkdown(content, {
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

    console.log(`[LinaTool] Created KB article with ${chunks.length} chunks: ${doc.id}`);
  } catch (embeddingError) {
    console.error("[LinaTool] Embedding error (doc still created):", embeddingError);
    // Doc is created, embeddings can be generated later via npm run embed:kb
  }

  // Log the action to events table
  await supabase.from("events").insert({
    thread_id: context.threadId || null,
    event_type: "LINA_TOOL_KB_CREATED",
    payload: {
      doc_id: doc.id,
      title,
      category,
      admin_email: context.adminEmail,
    },
  });

  // Log to tool actions table for audit
  await logToolAction(context, "create_kb_article", input, {
    success: true,
    doc_id: doc.id,
  });

  return {
    success: true,
    message: `Created KB article: "${title}"`,
    resourceUrl: `/admin/kb?doc=${doc.id}`,
    details: { docId: doc.id, category, chunksCreated: true },
  };
}

/**
 * Update agent instructions
 */
async function updateInstruction(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { section, instruction_text, rationale } = input as {
    section: string;
    instruction_text: string;
    rationale: string;
  };

  if (!section || !instruction_text || !rationale) {
    return { success: false, message: "Missing required fields: section, instruction_text, or rationale" };
  }

  // Get existing instruction for this section
  const { data: existing } = await supabase
    .from("agent_instructions")
    .select("id, content")
    .eq("section", section)
    .eq("is_active", true)
    .single();

  const timestamp = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  if (existing) {
    // Append to existing instruction
    const updatedContent = `${existing.content}\n\n---\n*Added from admin chat (${timestamp}):*\n${instruction_text}`;

    await supabase
      .from("agent_instructions")
      .update({
        content: updatedContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    // Log event
    await supabase.from("events").insert({
      thread_id: context.threadId || null,
      event_type: "LINA_TOOL_INSTRUCTION_UPDATED",
      payload: {
        section,
        instruction_text,
        rationale,
        updated_by: context.adminEmail,
        action: "appended",
      },
    });

    await logToolAction(context, "update_instruction", input, {
      success: true,
      action: "appended",
      section,
    });

    return {
      success: true,
      message: `Updated "${section}" instructions with new rule`,
      resourceUrl: `/admin/instructions`,
      details: { section, rationale, action: "appended" },
    };
  } else {
    // Create new instruction section
    await supabase.from("agent_instructions").insert({
      section,
      content: instruction_text,
      is_active: true,
    });

    await supabase.from("events").insert({
      thread_id: context.threadId || null,
      event_type: "LINA_TOOL_INSTRUCTION_CREATED",
      payload: {
        section,
        instruction_text,
        rationale,
        created_by: context.adminEmail,
      },
    });

    await logToolAction(context, "update_instruction", input, {
      success: true,
      action: "created",
      section,
    });

    return {
      success: true,
      message: `Created new "${section}" instruction`,
      resourceUrl: `/admin/instructions`,
      details: { section, rationale, action: "created" },
    };
  }
}

/**
 * Create a draft response to relay information to the customer
 */
async function draftRelayResponse(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { customer_message, attribution, thread_id } = input as {
    customer_message: string;
    attribution: string;
    thread_id?: string;
  };

  if (!customer_message || !attribution) {
    return { success: false, message: "Missing required fields: customer_message or attribution" };
  }

  const targetThreadId = thread_id || context.threadId;
  if (!targetThreadId) {
    return { success: false, message: "No thread ID provided for draft. Please specify the thread." };
  }

  // Get a natural template for the relay message
  const prefix = getRelayTemplate(attribution as "rob" | "technical_team" | "shipping_team" | "support_team");

  // Construct the full message (customer_message should already include greeting and signature)
  const fullMessage = `${prefix}${customer_message}`;

  // Insert as a draft message
  const { data: draft, error } = await supabase
    .from("messages")
    .insert({
      thread_id: targetThreadId,
      direction: "outbound",
      body_text: fullMessage,
      role: "draft",
      channel: "email",
      channel_metadata: {
        relay_response: true,
        attribution,
        created_via: "lina_tool",
        created_by: context.adminEmail,
      },
    })
    .select()
    .single();

  if (error) {
    return { success: false, message: `Failed to create draft: ${error.message}` };
  }

  // Update thread state if it was escalated/human_handling
  await supabase
    .from("threads")
    .update({
      state: "IN_PROGRESS",
      human_handling_mode: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetThreadId)
    .in("state", ["ESCALATED", "HUMAN_HANDLING"]);

  // Log event
  await supabase.from("events").insert({
    thread_id: targetThreadId,
    event_type: "LINA_TOOL_DRAFT_CREATED",
    payload: {
      message_id: draft.id,
      attribution,
      created_by: context.adminEmail,
    },
  });

  await logToolAction(context, "draft_relay_response", input, {
    success: true,
    draft_id: draft.id,
    thread_id: targetThreadId,
  });

  return {
    success: true,
    message: `Created draft response for customer (will be sent after your approval)`,
    resourceUrl: `/admin/thread/${targetThreadId}`,
    details: { draftId: draft.id, attribution, threadId: targetThreadId },
  };
}

/**
 * Note feedback without making permanent changes
 */
function noteFeedback(input: Record<string, unknown>): ToolResult {
  const { summary, action_taken } = input as {
    summary: string;
    action_taken?: string;
  };

  if (!summary) {
    return { success: false, message: "Missing required field: summary" };
  }

  return {
    success: true,
    message: action_taken
      ? `Noted: ${summary}. I'll ${action_taken}`
      : `Noted: ${summary}`,
    details: { summary, action_taken: action_taken || null },
  };
}

/**
 * Log tool action for audit purposes
 */
async function logToolAction(
  context: ToolContext,
  toolName: string,
  toolInput: Record<string, unknown>,
  result: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("lina_tool_actions").insert({
      thread_id: context.threadId || null,
      conversation_id: context.conversationId || null,
      tool_name: toolName,
      tool_input: toolInput,
      result,
      admin_email: context.adminEmail,
    });
  } catch (error) {
    // Log error but don't fail the tool execution
    console.error("[LinaTool] Failed to log tool action:", error);
  }
}

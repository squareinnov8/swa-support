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
import { getShopifyClient } from "@/lib/shopify/client";
import { isShopifyConfigured } from "@/lib/shopify/customer";
import { trackPromisedActions } from "@/lib/responders/promisedActions";

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
      case "lookup_order":
        return await lookupOrder(toolInput, context);
      case "associate_thread_customer":
        return await associateThreadCustomer(toolInput, context);
      case "return_thread_to_agent":
        return await returnThreadToAgent(toolInput, context);
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

  // Use the message as-is - Lina writes the complete natural message including
  // greeting, relay context ("I heard back from Rob..."), content, and signature
  const fullMessage = customer_message;

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

  // Track any promised actions in the draft (non-blocking audit trail)
  await trackPromisedActions(targetThreadId, fullMessage);

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
 * Look up an order by order number from Shopify
 */
async function lookupOrder(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { order_number } = input as { order_number: string };

  if (!order_number) {
    return { success: false, message: "Missing required field: order_number" };
  }

  if (!isShopifyConfigured()) {
    return { success: false, message: "Shopify is not configured" };
  }

  try {
    const client = getShopifyClient();
    const order = await client.getOrderByNumber(order_number);

    if (!order) {
      return {
        success: false,
        message: `Order ${order_number} not found in Shopify`,
      };
    }

    // Format order details for display
    const customerName = order.customer
      ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
      : "Unknown";
    const customerEmail = order.customer?.email || order.email || "Unknown";

    const lineItemsList = order.lineItems
      ?.map((item) => `${item.title} (x${item.quantity})`)
      .join(", ") || "No items";

    const trackingInfo = order.fulfillments
      ?.flatMap((f) => f.trackingInfo || [])
      .map((t) => `${t.company}: ${t.number}`)
      .join(", ") || "No tracking yet";

    // Log the action
    await logToolAction(context, "lookup_order", input, {
      success: true,
      order_name: order.name,
      customer_email: customerEmail,
    });

    // Format full shipping address
    const addr = order.shippingAddress;
    const shippingAddressFormatted = addr
      ? [
          addr.name,
          addr.address1,
          addr.address2,
          `${addr.city || ""}, ${addr.provinceCode || ""} ${addr.zip || ""}`.trim(),
          addr.country,
        ]
          .filter(Boolean)
          .join("\n")
      : "No shipping address";

    return {
      success: true,
      message: `Found order ${order.name}`,
      details: {
        orderNumber: order.name,
        customerName,
        customerEmail,
        financialStatus: order.displayFinancialStatus,
        fulfillmentStatus: order.displayFulfillmentStatus,
        items: lineItemsList,
        tracking: trackingInfo,
        createdAt: order.createdAt,
        // Full shipping address details
        shippingAddress: shippingAddressFormatted,
        shippingName: addr?.name,
        shippingAddress1: addr?.address1,
        shippingAddress2: addr?.address2,
        shippingCity: addr?.city,
        shippingState: addr?.provinceCode,
        shippingZip: addr?.zip,
        shippingCountry: addr?.country,
        shippingPhone: addr?.phone,
        customerTags: order.customer?.tags || [],
      },
    };
  } catch (error) {
    console.error("[LinaTool] Order lookup failed:", error);
    return {
      success: false,
      message: `Failed to look up order: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Associate a thread with a customer
 */
async function associateThreadCustomer(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { customer_email, customer_name, order_number, thread_id } = input as {
    customer_email: string;
    customer_name?: string;
    order_number?: string;
    thread_id?: string;
  };

  if (!customer_email) {
    return { success: false, message: "Missing required field: customer_email" };
  }

  const targetThreadId = thread_id || context.threadId;
  if (!targetThreadId) {
    return { success: false, message: "No thread ID provided. Please specify the thread." };
  }

  try {
    // Check if customer exists
    let { data: customer } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("email", customer_email.toLowerCase())
      .maybeSingle();

    // Create customer if doesn't exist
    if (!customer) {
      const { data: newCustomer, error: createError } = await supabase
        .from("customers")
        .insert({
          email: customer_email.toLowerCase(),
          name: customer_name || null,
        })
        .select()
        .single();

      if (createError || !newCustomer) {
        return { success: false, message: `Failed to create customer: ${createError?.message || "Unknown error"}` };
      }
      customer = newCustomer;
      console.log(`[LinaTool] Created new customer: ${newCustomer.id}`);
    } else if (customer_name && !customer.name) {
      // Update name if provided and customer doesn't have one
      await supabase
        .from("customers")
        .update({ name: customer_name })
        .eq("id", customer.id);
      customer.name = customer_name;
    }

    // At this point customer is guaranteed to be non-null
    const customerId = customer!.id;
    const finalCustomerName = customer_name || customer!.name;

    // Update thread with customer_id
    const { error: updateError } = await supabase
      .from("threads")
      .update({
        customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetThreadId);

    if (updateError) {
      return { success: false, message: `Failed to update thread: ${updateError.message}` };
    }

    // Log event
    await supabase.from("events").insert({
      thread_id: targetThreadId,
      event_type: "THREAD_CUSTOMER_ASSOCIATED",
      payload: {
        customer_id: customerId,
        customer_email,
        customer_name: finalCustomerName,
        order_number: order_number || null,
        associated_by: context.adminEmail,
      },
    });

    await logToolAction(context, "associate_thread_customer", input, {
      success: true,
      customer_id: customerId,
      thread_id: targetThreadId,
    });

    return {
      success: true,
      message: `Associated thread with ${finalCustomerName || customer_email}${order_number ? ` (order ${order_number})` : ""}`,
      resourceUrl: `/admin/thread/${targetThreadId}`,
      details: {
        customerId: customerId,
        customerEmail: customer_email,
        customerName: finalCustomerName,
        orderNumber: order_number,
        threadId: targetThreadId,
      },
    };
  } catch (error) {
    console.error("[LinaTool] Associate customer failed:", error);
    return {
      success: false,
      message: `Failed to associate customer: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Return a thread from HUMAN_HANDLING back to agent handling
 */
async function returnThreadToAgent(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { thread_id, reason } = input as {
    thread_id?: string;
    reason: string;
  };

  if (!reason) {
    return { success: false, message: "Missing required field: reason" };
  }

  const targetThreadId = thread_id || context.threadId;
  if (!targetThreadId) {
    return { success: false, message: "No thread ID provided. Please specify the thread." };
  }

  try {
    // First check the current thread state
    const { data: thread, error: fetchError } = await supabase
      .from("threads")
      .select("id, state, human_handling_mode, human_handler")
      .eq("id", targetThreadId)
      .single();

    if (fetchError || !thread) {
      return { success: false, message: `Thread not found: ${targetThreadId}` };
    }

    if (thread.state !== "HUMAN_HANDLING" && !thread.human_handling_mode) {
      return {
        success: false,
        message: `Thread is not in HUMAN_HANDLING mode (current state: ${thread.state})`,
      };
    }

    // Update thread state
    const { error: updateError } = await supabase
      .from("threads")
      .update({
        state: "IN_PROGRESS",
        human_handling_mode: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetThreadId);

    if (updateError) {
      return { success: false, message: `Failed to update thread: ${updateError.message}` };
    }

    // Close any active observation
    await supabase
      .from("intervention_observations")
      .update({
        intervention_end: new Date().toISOString(),
        resolution_type: "admin_returned_to_agent",
        resolution_summary: reason,
      })
      .eq("thread_id", targetThreadId)
      .is("intervention_end", null);

    // Log event
    await supabase.from("events").insert({
      thread_id: targetThreadId,
      type: "THREAD_RETURNED_TO_AGENT",
      payload: {
        previous_state: thread.state,
        previous_handler: thread.human_handler,
        reason,
        returned_by: context.adminEmail,
      },
    });

    await logToolAction(context, "return_thread_to_agent", input, {
      success: true,
      thread_id: targetThreadId,
      previous_state: thread.state,
    });

    return {
      success: true,
      message: `Thread returned to agent handling. Reason: ${reason}`,
      resourceUrl: `/admin/thread/${targetThreadId}`,
      details: {
        threadId: targetThreadId,
        previousState: thread.state,
        newState: "IN_PROGRESS",
        reason,
      },
    };
  } catch (error) {
    console.error("[LinaTool] Return thread to agent failed:", error);
    return {
      success: false,
      message: `Failed to return thread to agent: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
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

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
      case "recommend_reel_topics":
        return await recommendReelTopics(toolInput, context);
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
        shippingCity: order.shippingAddress?.city,
        shippingState: order.shippingAddress?.provinceCode,
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
 * Generate reel topic recommendations based on support data
 */
async function recommendReelTopics(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const { focus_area = "all", time_range = "week", include_hooks = true } = input as {
    focus_area?: "trending" | "faq" | "product" | "troubleshooting" | "all";
    time_range?: "week" | "month" | "quarter";
    include_hooks?: boolean;
  };

  const dayMap = { week: 7, month: 30, quarter: 90 };
  const recentDays = dayMap[time_range] || 7;
  const baselineDays = Math.min(recentDays * 4, 120);

  const topics: Array<{
    type: string;
    title: string;
    description: string;
    hooks?: string[];
    data: Record<string, unknown>;
    score: number;
  }> = [];

  try {
    // 1. Get trending intents (rising questions)
    if (focus_area === "all" || focus_area === "trending" || focus_area === "faq") {
      const { data: trendingIntents } = await supabase.rpc("get_trending_intents", {
        recent_days: recentDays,
        baseline_days: baselineDays,
      });

      if (trendingIntents && Array.isArray(trendingIntents)) {
        for (const intent of trendingIntents.slice(0, 5)) {
          const hooks = include_hooks
            ? generateHooksForIntent(intent.intent_slug, intent.sample_subjects)
            : undefined;

          topics.push({
            type: "trending_intent",
            title: `Trending: ${formatIntentTitle(intent.intent_slug)}`,
            description: `${intent.recent_count} questions in the last ${recentDays} days (${intent.trend_score.toFixed(1)}x above baseline). Category: ${intent.intent_category}`,
            hooks,
            data: {
              intentSlug: intent.intent_slug,
              recentCount: intent.recent_count,
              trendScore: intent.trend_score,
              sampleSubjects: intent.sample_subjects,
            },
            score: parseFloat(intent.trend_score) || 1,
          });
        }
      }
    }

    // 2. Get quality resolutions (good storytelling material)
    if (focus_area === "all" || focus_area === "troubleshooting") {
      const { data: qualityResolutions } = await supabase.rpc("get_quality_resolutions", {
        days_back: Math.max(recentDays, 30),
        min_quality: 0.7,
      });

      if (qualityResolutions && Array.isArray(qualityResolutions)) {
        for (const resolution of qualityResolutions.slice(0, 5)) {
          const hooks = include_hooks
            ? generateHooksForResolution(resolution)
            : undefined;

          topics.push({
            type: "quality_resolution",
            title: `Story: ${resolution.subject || "Customer Success"}`,
            description: resolution.dialogue_summary || "High-quality resolved conversation with clear troubleshooting steps",
            hooks,
            data: {
              threadId: resolution.thread_id,
              intent: resolution.intent_slug,
              keyInfo: resolution.key_information,
              steps: resolution.troubleshooting_steps,
              resolution: resolution.resolution_method,
              qualityScore: resolution.quality_score,
            },
            score: parseFloat(resolution.quality_score) || 0.7,
          });
        }
      }
    }

    // 3. Get popular product topics
    if (focus_area === "all" || focus_area === "product") {
      const { data: productTopics } = await supabase.rpc("get_popular_product_topics", {
        days_back: Math.max(recentDays, 30),
      });

      if (productTopics && Array.isArray(productTopics)) {
        for (const product of productTopics.slice(0, 5)) {
          const hooks = include_hooks
            ? generateHooksForProduct(product)
            : undefined;

          topics.push({
            type: "product_highlight",
            title: `Product: ${product.product_title}`,
            description: `${product.mention_count} customer inquiries. Common questions: ${(product.common_intents || []).join(", ")}`,
            hooks,
            data: {
              productId: product.product_id,
              productType: product.product_type,
              mentionCount: product.mention_count,
              commonIntents: product.common_intents,
              sampleQuestions: product.sample_questions,
            },
            score: parseInt(product.mention_count) || 1,
          });
        }
      }
    }

    // 4. Add static high-value topic suggestions based on category
    if (topics.length < 5) {
      topics.push(...getEvergreenTopics(focus_area, include_hooks));
    }

    // Sort by score and limit
    topics.sort((a, b) => b.score - a.score);
    const finalTopics = topics.slice(0, 10);

    // Save recommendations to database for tracking
    for (const topic of finalTopics) {
      await supabase.from("reel_topic_recommendations").insert({
        topic_type: topic.type,
        title: topic.title,
        description: topic.description,
        hook_ideas: topic.hooks || [],
        source_data: topic.data,
        relevance_score: Math.min(topic.score / 10, 1),
        status: "pending",
      });
    }

    // Log the action
    await logToolAction(context, "recommend_reel_topics", input, {
      success: true,
      topic_count: finalTopics.length,
      focus_area,
      time_range,
    });

    return {
      success: true,
      message: `Generated ${finalTopics.length} reel topic recommendations`,
      details: {
        topics: finalTopics,
        focusArea: focus_area,
        timeRange: time_range,
        dataSource: "support_threads",
      },
    };
  } catch (error) {
    console.error("[LinaTool] Reel topics error:", error);
    return {
      success: false,
      message: `Failed to generate recommendations: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Format intent slug to readable title
 */
function formatIntentTitle(slug: string): string {
  const titleMap: Record<string, string> = {
    PRODUCT_SUPPORT: "Product Support Questions",
    COMPATIBILITY_QUESTION: "Compatibility Questions",
    FIRMWARE_UPDATE_REQUEST: "Firmware Update Requests",
    FIRMWARE_ACCESS_ISSUE: "Firmware Access Issues",
    ORDER_STATUS: "Order Status Questions",
    INSTALL_GUIDANCE: "Installation Help",
    PART_IDENTIFICATION: "Part Identification",
    FUNCTIONALITY_BUG: "Feature/Bug Reports",
    DOCS_VIDEO_MISMATCH: "Documentation Questions",
    RETURN_REFUND_REQUEST: "Return/Refund Requests",
    MISSING_DAMAGED_ITEM: "Missing/Damaged Items",
  };
  return titleMap[slug] || slug.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Generate hook ideas for intent-based topics
 */
function generateHooksForIntent(
  intentSlug: string,
  sampleSubjects: string[] | null
): string[] {
  const hooks: string[] = [];

  // Intent-specific hooks
  const intentHooks: Record<string, string[]> = {
    COMPATIBILITY_QUESTION: [
      "Does [product] work with YOUR car? Let me show you how to check...",
      "STOP! Before you buy, check this compatibility guide",
      "The #1 question we get: 'Will it fit my [make/model]?'",
    ],
    FIRMWARE_UPDATE_REQUEST: [
      "Your tune might be outdated. Here's how to check...",
      "Firmware update day! Here's what's new in the latest release",
      "3 signs you need a firmware update (and how to do it)",
    ],
    INSTALL_GUIDANCE: [
      "Installing your [product]? Don't make THIS mistake",
      "5-minute install guide that actually works",
      "The step everyone skips (and regrets later)",
    ],
    PRODUCT_SUPPORT: [
      "Having trouble? Here's the fix 90% of customers need",
      "This simple setting change fixes most issues",
      "Before you contact support, try this first",
    ],
    ORDER_STATUS: [
      "Where's my order? Here's how to track it in 30 seconds",
      "Shipping update: What to expect right now",
    ],
  };

  if (intentHooks[intentSlug]) {
    hooks.push(...intentHooks[intentSlug]);
  }

  // Generate hooks from sample subjects
  if (sampleSubjects && sampleSubjects.length > 0) {
    const subject = sampleSubjects[0];
    if (subject.length < 100) {
      hooks.push(`"${subject}" - We hear this a lot. Here's the answer...`);
    }
  }

  return hooks.slice(0, 3);
}

/**
 * Generate hook ideas for resolution stories
 */
function generateHooksForResolution(resolution: {
  subject?: string;
  intent_slug?: string;
  troubleshooting_steps?: string[];
  resolution_method?: string;
}): string[] {
  const hooks: string[] = [];

  if (resolution.subject) {
    hooks.push(`Customer asked: "${resolution.subject.slice(0, 50)}..." Here's what we found...`);
  }

  if (resolution.troubleshooting_steps && resolution.troubleshooting_steps.length > 0) {
    hooks.push(`${resolution.troubleshooting_steps.length} steps to fix this common issue`);
  }

  if (resolution.resolution_method) {
    hooks.push(`The surprising fix that worked: ${resolution.resolution_method.slice(0, 50)}...`);
  }

  hooks.push(
    "This customer was about to give up. Watch what happened next...",
    "The troubleshooting trick our support team uses daily"
  );

  return hooks.slice(0, 3);
}

/**
 * Generate hook ideas for product topics
 */
function generateHooksForProduct(product: {
  product_title: string;
  product_type?: string;
  sample_questions?: string[];
}): string[] {
  const hooks: string[] = [
    `Everything you need to know about ${product.product_title}`,
    `${product.product_title}: Your questions answered`,
    `Is ${product.product_title} worth it? Real customer results`,
  ];

  if (product.sample_questions && product.sample_questions.length > 0) {
    const question = product.sample_questions[0];
    if (question && question.length < 80) {
      hooks.push(`"${question}" - Let's break it down...`);
    }
  }

  return hooks.slice(0, 3);
}

/**
 * Get evergreen topic suggestions
 */
function getEvergreenTopics(
  focusArea: string,
  includeHooks: boolean
): Array<{
  type: string;
  title: string;
  description: string;
  hooks?: string[];
  data: Record<string, unknown>;
  score: number;
}> {
  const evergreenTopics = [
    {
      type: "evergreen",
      title: "Before & After Results",
      description: "Customer transformation stories with dyno results or performance gains",
      hooks: includeHooks
        ? [
            "0-60 in [X] seconds... Here's how",
            "Before vs After: The numbers don't lie",
            "+[X] HP with one simple mod",
          ]
        : undefined,
      data: { category: "results" },
      score: 0.8,
    },
    {
      type: "evergreen",
      title: "Common Mistakes to Avoid",
      description: "Educational content about installation or tuning errors",
      hooks: includeHooks
        ? [
            "3 mistakes that will VOID your warranty",
            "Stop doing this with your tune!",
            "The #1 reason tunes fail (it's not what you think)",
          ]
        : undefined,
      data: { category: "education" },
      score: 0.75,
    },
    {
      type: "evergreen",
      title: "Quick Tips Series",
      description: "Bite-sized tips that provide immediate value",
      hooks: includeHooks
        ? [
            "30-second tip that saves hours of frustration",
            "Pro tip your tuner doesn't tell you",
            "One setting change. Massive difference.",
          ]
        : undefined,
      data: { category: "tips" },
      score: 0.7,
    },
  ];

  if (focusArea === "all") return evergreenTopics;
  if (focusArea === "troubleshooting") return evergreenTopics.filter((t) => t.data.category === "education");
  return evergreenTopics.slice(0, 2);
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

/**
 * Thread Chat API
 *
 * Allows admins to have a conversation with Lina about a specific thread.
 * Features:
 * - Uses dynamic instructions from database
 * - Includes truthfulness constraints
 * - Persists conversation history
 * - Provides KB context for grounded responses
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { generate, isLLMConfigured } from "@/lib/llm/client";
import { buildAdminChatPrompt } from "@/lib/llm/prompts";
import { hybridSearch } from "@/lib/retrieval/search";
import type { Intent } from "@/lib/intents/taxonomy";

/**
 * Get or create a conversation for this thread
 */
async function getOrCreateConversation(
  threadId: string,
  adminUser: string = "admin"
): Promise<string> {
  // Try to find existing conversation
  const { data: existing } = await supabase
    .from("admin_lina_conversations")
    .select("id")
    .eq("thread_id", threadId)
    .eq("admin_user", adminUser)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  // Create new conversation
  const { data: created, error } = await supabase
    .from("admin_lina_conversations")
    .insert({
      thread_id: threadId,
      admin_user: adminUser,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return created.id;
}

/**
 * Save a message to the conversation
 */
async function saveMessage(
  conversationId: string,
  role: "admin" | "lina",
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("admin_lina_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    metadata: metadata ?? null,
  });

  if (error) {
    console.error("Failed to save message:", error.message);
  }
}

/**
 * Load conversation history
 */
async function loadConversationHistory(
  conversationId: string
): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await supabase
    .from("admin_lina_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data;
}

export async function POST(request: NextRequest) {
  if (!isLLMConfigured()) {
    return NextResponse.json(
      { error: "LLM not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { threadId, message } = body;

  if (!threadId || !message) {
    return NextResponse.json(
      { error: "threadId and message are required" },
      { status: 400 }
    );
  }

  try {
    // Get or create conversation for persistence
    const conversationId = await getOrCreateConversation(threadId);

    // Load existing conversation history from database
    const persistedHistory = await loadConversationHistory(conversationId);

    // Save the admin's new message
    await saveMessage(conversationId, "admin", message);

    // Fetch thread context
    const { data: thread } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const intent = (thread.last_intent || "UNKNOWN") as Intent;

    // Fetch messages
    const { data: messages } = await supabase
      .from("messages")
      .select("direction, from_email, body_text, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    // Fetch draft generation info
    const { data: drafts } = await supabase
      .from("draft_generations")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);

    const latestDraft = drafts?.[0];

    // Fetch verification info
    const { data: verification } = await supabase
      .from("customer_verifications")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get KB docs for grounding - search based on the admin's question
    const searchResults = await hybridSearch(
      {
        intent,
        query: message,
        vehicleTag: thread.vehicle_tag,
        productTag: thread.product_tag,
      },
      { limit: 3, minScore: 0.3 }
    );

    // Also include KB docs that were used in the draft
    let draftKbDocsInfo = "";
    if (latestDraft?.kb_docs_used?.length) {
      const { data: kbDocs } = await supabase
        .from("kb_docs")
        .select("id, title, body")
        .in("id", latestDraft.kb_docs_used);

      if (kbDocs?.length) {
        draftKbDocsInfo = kbDocs
          .map((doc) => `- [KB: ${doc.title}]: ${doc.body.slice(0, 300)}...`)
          .join("\n");
      }
    }

    // Build dynamic system prompt with truthfulness constraints
    const baseSystemPrompt = await buildAdminChatPrompt(intent);

    // Add thread-specific context to the system prompt
    const systemPrompt = `${baseSystemPrompt}

## Current Thread Context

**Subject:** ${thread.subject || "(no subject)"}
**State:** ${thread.state}
**Intent:** ${intent}
**Created:** ${new Date(thread.created_at).toLocaleString()}

## Customer Messages
${messages?.map((m) => `[${m.direction.toUpperCase()}] ${m.from_email || "unknown"}: ${m.body_text?.slice(0, 500) || "(empty)"}`).join("\n\n") || "No messages"}

## My Draft Response
${latestDraft?.final_draft || latestDraft?.raw_draft || "(No draft generated yet)"}

## Draft Reasoning
- Intent classified as: ${intent}
- KB docs used in draft: ${latestDraft?.kb_docs_used?.length || 0}
${draftKbDocsInfo ? `\n${draftKbDocsInfo}` : ""}
- Policy gate: ${latestDraft?.policy_gate_passed ? "Passed" : latestDraft ? "Blocked" : "N/A"}
${latestDraft?.policy_violations?.length ? `- Policy violations: ${latestDraft.policy_violations.join(", ")}` : ""}

## Customer Verification Status
${verification ? `- Status: ${verification.status}\n- Order: ${verification.order_number || "N/A"}\n- Flags: ${verification.flags?.join(", ") || "None"}` : "Not verified yet"}

## KB Articles Relevant to Admin's Question
${searchResults.length > 0 ? searchResults.map((r) => `[KB: ${r.doc.title}] (${(r.score * 100).toFixed(0)}% match): ${r.chunk?.content?.slice(0, 200) || r.doc.body.slice(0, 200)}...`).join("\n\n") : "No relevant KB articles found for this question"}`;

    // Build chat history for the LLM
    const chatContext = persistedHistory
      .map((msg) => `${msg.role === "admin" ? "Rob" : "Lina"}: ${msg.content}`)
      .join("\n\n");

    const userPrompt = chatContext
      ? `${chatContext}\n\nRob: ${message}`
      : `Rob: ${message}`;

    // Generate response
    const result = await generate(userPrompt, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Save Lina's response to the conversation
    await saveMessage(conversationId, "lina", result.content, {
      kbDocsSearched: searchResults.map((r) => r.doc.id),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    return NextResponse.json({
      response: result.content,
      conversationId,
      context: {
        intent,
        state: thread.state,
        kbDocsUsed: latestDraft?.kb_docs_used?.length || 0,
        kbDocsSearched: searchResults.length,
        verification: verification?.status || null,
      },
    });
  } catch (error) {
    console.error("Thread chat error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

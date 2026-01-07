/**
 * Thread Chat API
 *
 * Allows admins to have a conversation with the agent about a specific thread.
 * The agent has access to all thread context and can answer questions,
 * explain its reasoning, or suggest alternative responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { generate, isLLMConfigured } from "@/lib/llm/client";

export async function POST(request: NextRequest) {
  if (!isLLMConfigured()) {
    return NextResponse.json(
      { error: "LLM not configured" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { threadId, message, conversationHistory = [] } = body;

  if (!threadId || !message) {
    return NextResponse.json(
      { error: "threadId and message are required" },
      { status: 400 }
    );
  }

  try {
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

    // Fetch events for reasoning context
    const { data: events } = await supabase
      .from("events")
      .select("type, payload, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(5);

    // Fetch KB docs used if available
    let kbDocsInfo = "";
    if (latestDraft?.kb_docs_used?.length) {
      const { data: kbDocs } = await supabase
        .from("kb_docs")
        .select("id, title, body")
        .in("id", latestDraft.kb_docs_used);

      if (kbDocs?.length) {
        kbDocsInfo = kbDocs
          .map((doc) => `- ${doc.title}: ${doc.body.slice(0, 200)}...`)
          .join("\n");
      }
    }

    // Fetch verification info
    const { data: verification } = await supabase
      .from("customer_verifications")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Build context prompt
    const systemPrompt = `You are Lina, a support agent assistant. You're having a conversation with Rob (the admin) about a customer support thread.

You have access to the full thread context below. Answer Rob's questions honestly and helpfully. You can:
- Explain your reasoning for the draft you generated
- Suggest alternative approaches
- Acknowledge limitations or mistakes
- Provide the information Rob needs to handle this case

Be concise and direct. Rob is the expert - you're here to assist.

## Thread Context

**Subject:** ${thread.subject || "(no subject)"}
**State:** ${thread.state}
**Intent:** ${thread.last_intent || "Unknown"}
**Created:** ${new Date(thread.created_at).toLocaleString()}

## Messages
${messages?.map((m) => `[${m.direction.toUpperCase()}] ${m.from_email || "unknown"}: ${m.body_text?.slice(0, 500) || "(empty)"}`).join("\n\n")}

## My Draft Response
${latestDraft?.final_draft || latestDraft?.raw_draft || "(No draft generated)"}

## My Reasoning
- Intent classified as: ${thread.last_intent}
- KB docs used: ${latestDraft?.kb_docs_used?.length || 0}
${kbDocsInfo ? `\n${kbDocsInfo}` : ""}
- Policy gate: ${latestDraft?.policy_gate_passed ? "Passed" : "Blocked"}
${latestDraft?.policy_violations?.length ? `- Violations: ${latestDraft.policy_violations.join(", ")}` : ""}

## Customer Verification
${verification ? `- Status: ${verification.status}\n- Order: ${verification.order_number || "N/A"}\n- Flags: ${verification.flags?.join(", ") || "None"}` : "Not verified yet"}

## Recent Events
${events?.map((e) => `- ${e.type}: ${JSON.stringify(e.payload).slice(0, 100)}...`).join("\n") || "None"}`;

    // Build chat history
    const chatContext = conversationHistory
      .map((msg: { role: string; content: string }) =>
        `${msg.role === "user" ? "Rob" : "Lina"}: ${msg.content}`
      )
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

    return NextResponse.json({
      response: result.content,
      context: {
        intent: thread.last_intent,
        state: thread.state,
        kbDocsUsed: latestDraft?.kb_docs_used?.length || 0,
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

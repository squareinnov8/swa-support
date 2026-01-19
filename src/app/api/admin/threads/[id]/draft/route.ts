/**
 * Draft Management API
 *
 * DELETE - Delete a draft message from a thread
 * POST - Regenerate a draft for a thread
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { generateDraft, getConversationHistory, type DraftInput } from "@/lib/llm/draftGenerator";
import { classifyIntent } from "@/lib/intents/classify";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/admin/threads/[id]/draft
 * Delete a draft message from a thread
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get("messageId");

    if (!threadId) {
      return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
    }

    // If messageId is provided, delete that specific draft
    if (messageId) {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId)
        .eq("thread_id", threadId)
        .eq("role", "draft");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log event
      await supabase.from("events").insert({
        thread_id: threadId,
        event_type: "DRAFT_DELETED",
        payload: { message_id: messageId },
      });

      return NextResponse.json({ success: true, deletedMessageId: messageId });
    }

    // Otherwise, delete all drafts for this thread
    const { data: deletedDrafts, error } = await supabase
      .from("messages")
      .delete()
      .eq("thread_id", threadId)
      .eq("role", "draft")
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      event_type: "DRAFTS_DELETED",
      payload: { count: deletedDrafts?.length || 0 },
    });

    return NextResponse.json({
      success: true,
      deletedCount: deletedDrafts?.length || 0,
    });
  } catch (err) {
    console.error("[Draft API] Delete error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/threads/[id]/draft
 * Regenerate a draft for a thread
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: threadId } = await context.params;

    if (!threadId) {
      return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
    }

    // Get thread data
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("*")
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Get the latest inbound message
    const { data: latestMessage, error: messageError } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (messageError || !latestMessage) {
      return NextResponse.json(
        { error: "No inbound message found in thread" },
        { status: 400 }
      );
    }

    // Delete existing draft messages first
    await supabase
      .from("messages")
      .delete()
      .eq("thread_id", threadId)
      .eq("role", "draft");

    // Re-classify the message to get current intent
    const customerMessage = latestMessage.body_text || "";
    const subject = thread.subject || "";
    const classification = classifyIntent(subject, customerMessage);
    const intent = classification.intent || "UNKNOWN";

    // Get conversation history
    const conversationHistory = await getConversationHistory(threadId);

    // Build draft input
    const draftInput: DraftInput = {
      threadId,
      messageId: latestMessage.id,
      customerMessage,
      intent: intent as DraftInput["intent"],
      previousMessages: conversationHistory,
      customerInfo: {
        email: latestMessage.from_email || undefined,
      },
    };

    // Generate new draft
    const draftResult = await generateDraft(draftInput);

    if (!draftResult.success || !draftResult.draft) {
      return NextResponse.json(
        {
          error: draftResult.error || "Draft generation failed",
          policyViolations: draftResult.policyViolations,
        },
        { status: 400 }
      );
    }

    // Save draft as a message with role: "draft"
    const { data: draftMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body_text: draftResult.draft,
        role: "draft",
        channel: "email",
        channel_metadata: {
          regenerated: true,
          kb_docs_used: draftResult.kbDocsUsed,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("[Draft API] Insert error:", insertError);
      // Draft was generated but not saved to messages
      // Still return success since we have the draft
    }

    // Log event
    await supabase.from("events").insert({
      thread_id: threadId,
      event_type: "DRAFT_REGENERATED",
      payload: {
        intent,
        kb_docs_used: draftResult.kbDocsUsed,
        policy_gate_passed: draftResult.policyGatePassed,
        message_id: draftMessage?.id,
      },
    });

    return NextResponse.json({
      success: true,
      draft: draftResult.draft,
      intent,
      kbDocsUsed: draftResult.kbDocsUsed,
      policyGatePassed: draftResult.policyGatePassed,
      messageId: draftMessage?.id,
    });
  } catch (err) {
    console.error("[Draft API] Regenerate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

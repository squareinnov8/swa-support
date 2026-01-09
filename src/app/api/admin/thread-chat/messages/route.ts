/**
 * Thread Chat Messages API
 *
 * GET: Load persisted conversation history for a thread
 * DELETE: Clear conversation history for a thread
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json(
      { error: "threadId is required" },
      { status: 400 }
    );
  }

  try {
    // Find conversation for this thread
    const { data: conversation } = await supabase
      .from("admin_lina_conversations")
      .select("id, created_at, updated_at")
      .eq("thread_id", threadId)
      .maybeSingle();

    if (!conversation) {
      // No conversation yet - return empty
      return NextResponse.json({
        conversationId: null,
        messages: [],
      });
    }

    // Load messages
    const { data: messages, error } = await supabase
      .from("admin_lina_messages")
      .select("id, role, content, metadata, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      conversationId: conversation.id,
      messages: messages ?? [],
      updatedAt: conversation.updated_at,
    });
  } catch (error) {
    console.error("Load messages error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");

  if (!threadId) {
    return NextResponse.json(
      { error: "threadId is required" },
      { status: 400 }
    );
  }

  try {
    // Find and delete conversation (cascade will delete messages)
    const { error } = await supabase
      .from("admin_lina_conversations")
      .delete()
      .eq("thread_id", threadId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clear conversation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
